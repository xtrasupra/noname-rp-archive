"use strict";

const chat = require("../../chat/chat.service.js");
const ghetto = require("./ghetto.service.js");
const clientStatuses = new Map();
const initialSyncPlayers = new Set();
global.ghettoClientStatuses = clientStatuses;

function run(player, action) {
  Promise.resolve()
    .then(action)
    .catch((error) => {
      console.error("[GHETTO]", error);
      chat.sendError(player, error?.message || "Ошибка системы территорий.");
    });
}

mp.registerCommand("capture", (player) => {
  run(player, async () => {
    const capture = await ghetto.startCapture(player);
    chat.sendSuccess(
      player,
      `Захват начат. Наберите 100 очков присутствием в зоне и убийствами соперников.`
    );
    return capture;
  });
});

mp.registerCommand("ghetto", (player) => {
  ghetto.syncPlayer(player);
  const zone = ghetto.findZoneByPosition(player.position);
  chat.sendInfo(
    player,
    zone
      ? `Вы в зоне ${zone.code}: ${zone.name}. Владелец: #${Number(zone.owner_fraction_id || 0)}.`
      : "Вы находитесь вне размеченных территорий гетто."
  );
});

mp.registerCommand("setzoneowner", (player, fullText, args) => {
  run(player, async () => {
    const adminLevel = Number(
      player?.adminLevel || player?.admin || player?.getVariable?.("adminLevel") || 0
    );
    if (adminLevel < 7) throw new Error("Команда доступна администраторам 7+ уровня.");
    const zoneId = Number(args?.[0]);
    const fractionId = Number(args?.[1] || 0);
    if (!zoneId || !Number.isInteger(fractionId) || fractionId < 0) {
      throw new Error("Использование: /setzoneowner [zoneId] [fractionId, 0 = нейтральная]");
    }
    await ghetto.setZoneOwner(zoneId, fractionId);
    chat.sendSuccess(player, `Владелец территории #${zoneId} изменён на фракцию #${fractionId}.`);
  });
});

mp.registerCommand("setzonetitle", (player, fullText, args) => {
  run(player, async () => {
    const adminLevel = Number(
      player?.adminLevel || player?.admin || player?.getVariable?.("adminLevel") || 0
    );
    if (adminLevel < 7) throw new Error("Команда доступна администраторам 7+ уровня.");
    const zoneId = Number(args?.[0]);
    const fractionId = Number(args?.[1]);
    if (!zoneId || !fractionId) {
      throw new Error("Использование: /setzonetitle [zoneId] [fractionId]");
    }
    await ghetto.setZoneTitle(zoneId, fractionId);
    chat.sendSuccess(
      player,
      `Территория #${zoneId} назначена титульной для фракции #${fractionId}.`
    );
  });
});

mp.registerCommand("synctitles", (player) => {
  run(player, async () => {
    const adminLevel = Number(
      player?.adminLevel || player?.admin || player?.getVariable?.("adminLevel") || 0
    );
    if (adminLevel < 7) throw new Error("Команда доступна администраторам 7+ уровня.");
    const changes = await ghetto.syncTitleZonesFromFactionAnchors();
    chat.sendSuccess(
      player,
      changes.length
        ? `Обновлено титульных территорий: ${changes.length}.`
        : "Спавны/NPC не изменились или их координаты ещё не указаны."
    );
  });
});

mp.registerCommand("ghettodebug", (player) => {
  const adminLevel = Number(
    player?.adminLevel || player?.admin || player?.getVariable?.("adminLevel") || 0
  );
  if (adminLevel < 7) return chat.sendError(player, "Команда доступна администраторам 7+.");
  ghetto.syncPlayer(player);
  try {
    player.call("client:ghetto:debug");
  } catch {}
  setTimeout(() => {
    const status = clientStatuses.get(player.id);
    chat.sendInfo(
      player,
      status
        ? `Ghetto debug: zones=${status.zones}, blips=${status.blips}, api=${status.api}, fraction=${status.fractionId}, reason=${status.reason}`
        : "Клиент пока не прислал статус гетто renderer."
    );
  }, 2000);
});

mp.events.add("server:ghetto:request", (player) => {
  if (initialSyncPlayers.has(player.id)) return;
  initialSyncPlayers.add(player.id);
  ghetto.syncPlayer(player);
});

mp.events.add(
  "server:ghetto:clientStatus",
  (player, reason, zones, blips, api, fractionId) => {
    const status = {
      reason: String(reason || ""),
      zones: Number(zones || 0),
      blips: Number(blips || 0),
      api: String(api || "none"),
      fractionId: Number(fractionId || 0),
      updatedAt: Date.now(),
    };
    clientStatuses.set(player.id, status);
    console.log(`[GHETTO CLIENT] ${player.name} #${player.id}`, status);
  }
);

mp.events.add("twinkle:character:loaded", (player) => {
  if (initialSyncPlayers.has(player.id)) return;
  initialSyncPlayers.add(player.id);
  setTimeout(() => ghetto.syncPlayer(player), 350);
});

mp.events.add("playerDeath", (player, reason, killer) => {
  ghetto.handleDeath(player, reason, killer).catch((error) => {
    console.error("[GHETTO] death:", error);
  });
});

mp.events.add("playerQuit", (player) => {
  clientStatuses.delete(player.id);
  initialSyncPlayers.delete(player.id);
});

ghetto.initialize().catch((error) => {
  console.error("[GHETTO] Initialization failed:", error);
});

console.log("[GHETTO] Commands and events loaded");
