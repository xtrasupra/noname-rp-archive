"use strict";

const chat = require("../chat/chat.service.js");

function adminLevel(player) {
  return Number(
    player?.adminLevel ||
    player?.admin ||
    player?.character?.admin_level ||
    player?.getVariable?.("adminLevel") ||
    0
  );
}

function getPlayerById(value) {
  const id = Number(value);
  if (!Number.isInteger(id)) return null;
  try {
    return mp.players.at(id) || null;
  } catch {
    return null;
  }
}

function setCuffed(target, state) {
  const enabled = Boolean(state);
  target.adminCuffed = enabled;
  target.setVariable("adminCuffed", enabled);
  try {
    target.call("client:adminCuffs:set", [enabled]);
  } catch {}
}

mp.registerCommand("cuff", (admin, fullText) => {
  if (adminLevel(admin) < 1) {
    return chat.sendError(admin, "Нет доступа к команде.");
  }

  const targetId = String(fullText || "").trim().split(/\s+/)[0];
  const target = targetId ? getPlayerById(targetId) : admin;

  if (!target) {
    return chat.sendError(admin, "Игрок не найден. Использование: /cuff [playerId]");
  }

  const nextState = !Boolean(target.adminCuffed || target.getVariable?.("adminCuffed"));
  setCuffed(target, nextState);

  const targetName = target.name || `Player #${target.id}`;
  chat.sendSuccess(
    admin,
    nextState
      ? `Наручники надеты на ${targetName}.`
      : `Наручники сняты с ${targetName}.`
  );

  if (target !== admin) {
    chat.sendInfo(
      target,
      nextState
        ? `Администратор ${admin.name || admin.id} надел на вас наручники.`
        : `Администратор ${admin.name || admin.id} снял с вас наручники.`
    );
  }
});

mp.events.add("playerDeath", (player) => {
  if (player?.adminCuffed || player?.getVariable?.("adminCuffed")) {
    setCuffed(player, false);
  }
});

console.log("[ADMIN CUFFS] Loaded");
