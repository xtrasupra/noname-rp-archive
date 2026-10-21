"use strict";

const chat = require("../chat/chat.service.js");
const fractionService = require("./fraction.service.js");
const {
  playerUuid,
  playerName,
} = require("../../utils/player.js");

const MAX_INTERACT_DISTANCE = 2.2;
const ACTION_COOLDOWN_MS = 500;
const actionCooldowns = new WeakMap();

function consumeActionCooldown(player) {
  const now = Date.now();
  const previous = Number(actionCooldowns.get(player) || 0);
  if (now - previous < ACTION_COOLDOWN_MS) return false;
  actionCooldowns.set(player, now);
  return true;
}
function distance(a, b) {
  if (!a?.position || !b?.position) return Number.MAX_SAFE_INTEGER;
  const dx = Number(a.position.x || 0) - Number(b.position.x || 0);
  const dy = Number(a.position.y || 0) - Number(b.position.y || 0);
  const dz = Number(a.position.z || 0) - Number(b.position.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

async function isForceMember(player) {
  if (!playerUuid(player)) return false;
  return fractionService.isPlayerFactionKind(player, "state");
}

function findNearestPlayer(player, maxDistance = MAX_INTERACT_DISTANCE) {
  let nearest = null;
  let nearestDistance = maxDistance;

  mp.players.forEach((target) => {
    if (!target || target === player) return;
    if (!mp.players.exists(target)) return;
    if (target.dimension !== player.dimension) return;

    const currentDistance = distance(player, target);
    if (currentDistance <= nearestDistance) {
      nearest = target;
      nearestDistance = currentDistance;
    }
  });

  return nearest;
}

function isCuffed(player) {
  return Boolean(player?.twinkleCuffed || player?.adminCuffed);
}

function setCuffed(target, state) {
  const enabled = Boolean(state);
  target.twinkleCuffed = enabled;
  target.adminCuffed = enabled;
  target.setVariable("twinkleCuffed", enabled);
  target.setVariable("adminCuffed", enabled);

  if (!enabled) {
    clearEscortByTarget(target);
  }

  try {
    target.call("client:adminCuffs:set", [enabled]);
  } catch {}
}

function clearEscort(officer, suspect) {
  if (officer) {
    officer.forceEscortTarget = null;
    officer.setVariable("twinkleEscortTarget", -1);
  }
  if (suspect) {
    suspect.forceEscortOfficer = null;
    suspect.setVariable("twinkleEscortOfficer", -1);
    try {
      suspect.call("client:forceCuffs:stopEscort", []);
    } catch {}
  }
}

function clearEscortByTarget(suspect) {
  if (!suspect?.forceEscortOfficer) {
    suspect?.setVariable?.("twinkleEscortOfficer", -1);
    return;
  }
  clearEscort(suspect.forceEscortOfficer, suspect);
}

function clearEscortByOfficer(officer) {
  if (!officer?.forceEscortTarget) {
    officer?.setVariable?.("twinkleEscortTarget", -1);
    return;
  }
  clearEscort(officer, officer.forceEscortTarget);
}

function startEscort(officer, suspect) {
  clearEscortByOfficer(officer);
  clearEscortByTarget(suspect);

  officer.forceEscortTarget = suspect;
  suspect.forceEscortOfficer = officer;
  officer.setVariable("twinkleEscortTarget", suspect.id);
  suspect.setVariable("twinkleEscortOfficer", officer.id);

  try {
    officer.call("client:forceCuffs:startEscort", [suspect.id]);
    suspect.call("client:forceCuffs:startEscort", [officer.id]);
  } catch {}
}

async function handleToggleCuffs(player) {
  if (!consumeActionCooldown(player)) return;
  if (!(await isForceMember(player))) {
    return chat.sendError(player, "Доступно только силовым фракциям.");
  }

  const target = findNearestPlayer(player);
  if (!target) return chat.sendError(player, "Рядом нет игрока.");

  if (target.forceEscortOfficer || target.forceEscortTarget) {
    clearEscortByTarget(target);
    clearEscortByOfficer(target);
  }

  const nextState = !isCuffed(target);
  setCuffed(target, nextState);

  const targetName = playerName(target);
  chat.sendInfo(player, nextState ? `Вы надели наручники на ${targetName}.` : `Вы сняли наручники с ${targetName}.`);
  chat.sendInfo(target, nextState ? `${playerName(player)} надел на вас наручники.` : `${playerName(player)} снял с вас наручники.`);
}

async function handleToggleEscort(player) {
  if (!consumeActionCooldown(player)) return;
  if (!(await isForceMember(player))) {
    return chat.sendError(player, "Доступно только силовым фракциям.");
  }

  if (player.forceEscortTarget) {
    const target = player.forceEscortTarget;
    clearEscortByOfficer(player);
    chat.sendInfo(player, "Вы отпустили задержанного.");
    if (target) chat.sendInfo(target, "Вас отпустили.");
    return;
  }

  const target = findNearestPlayer(player);
  if (!target) return chat.sendError(player, "Рядом нет игрока.");
  if (!isCuffed(target)) return chat.sendError(player, "Сначала наденьте на игрока наручники.");
  if (target.forceEscortOfficer) return chat.sendError(player, "Этого игрока уже держит другой сотрудник.");

  startEscort(player, target);
  chat.sendInfo(player, `Вы заломали ${playerName(target)}.`);
  chat.sendInfo(target, `${playerName(player)} держит вас заломом.`);
}

mp.events.add("server:forceCuffs:toggleCuffs", (player) => {
  handleToggleCuffs(player).catch((error) => {
    console.log("[FORCE CUFFS] toggle cuffs:", error);
    chat.sendError(player, error?.message || "Ошибка наручников.");
  });
});

mp.events.add("server:forceCuffs:toggleEscort", (player) => {
  handleToggleEscort(player).catch((error) => {
    console.log("[FORCE CUFFS] toggle escort:", error);
    chat.sendError(player, error?.message || "Ошибка залома.");
  });
});

mp.events.add("playerDeath", (player) => {
  clearEscortByTarget(player);
  clearEscortByOfficer(player);
  if (isCuffed(player)) setCuffed(player, false);
});

mp.events.add("playerQuit", (player) => {
  clearEscortByTarget(player);
  clearEscortByOfficer(player);
});

console.log("[FORCE CUFFS] Loaded");

