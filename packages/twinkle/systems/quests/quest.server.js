"use strict";

const quests = require("./quest.service.js");
const repository = require("./quest.repository.js");

try {
  global.__twinkleQuestRuntime?.shutdown?.();
} catch (error) {
  console.error("[QUESTS] Previous runtime shutdown failed:", error);
}

const runtime = { active: true, handlers: [] };
global.__twinkleQuestRuntime = runtime;
const STATE_REQUEST_COOLDOWN_MS = 500;
const stateRequestAt = new WeakMap();
const stateRequestInFlight = new WeakMap();

function registerQuestEvent(name, handler) {
  const guarded = (...args) => runtime.active ? handler(...args) : undefined;
  mp.events.add(name, guarded);
  runtime.handlers.push({ name, handler: guarded });
}

function getAdminLevel(player) {
  return Number(
    player?.adminLevel ||
    player?.admin_level ||
    player?.admin ||
    player?.character?.admin_level ||
    player?.characterData?.admin_level ||
    player?.getVariable?.("adminLevel") ||
    player?.getVariable?.("admin") ||
    0
  );
}

function safeCall(player, eventName, args = []) {
  try { player?.call?.(eventName, args); } catch {}
}

registerQuestEvent("s:quests:requestState", (player) => {
  if (!quests.isPlayerInGame(player)) return;

  const now = Date.now();
  const sessionEpoch = Math.max(0, Math.trunc(Number(player.twinkleCharacterSessionEpoch || 0)));
  const previousRequest = stateRequestAt.get(player);
  if (
    previousRequest?.sessionEpoch === sessionEpoch &&
    now - Number(previousRequest.at || 0) < STATE_REQUEST_COOLDOWN_MS
  ) return;
  stateRequestAt.set(player, { at: now, sessionEpoch });

  const previousOperation = stateRequestInFlight.get(player);
  if (previousOperation?.sessionEpoch === sessionEpoch) return;
  const operation = quests.syncPlayer(player)
    .catch((error) => {
      console.error("[QUESTS] state request failed:", error);
    })
    .finally(() => {
      if (stateRequestInFlight.get(player)?.operation === operation) stateRequestInFlight.delete(player);
    });
  stateRequestInFlight.set(player, { operation, sessionEpoch });
});

registerQuestEvent("quests:playerReady", (player, context = {}) => {
  quests.markPlayerReady(player, context).catch((error) => {
    console.error("[QUESTS] player ready failed:", error);
  });
});

registerQuestEvent("twinkle:character:loaded", (player) => {
  quests.primePlayer(player, { reusePrepared: true }).catch((error) => {
    console.error("[QUESTS] character sync failed:", error);
  });
});

registerQuestEvent("s:quests:adminDiagnostics", async (player) => {
  if (getAdminLevel(player) < 1) return;
  const diagnostics = await quests.buildDiagnostics(player);
  safeCall(player, "client:notification", [
    diagnostics.ok ? "info" : "error",
    JSON.stringify(diagnostics).slice(0, 480),
  ]);
});

registerQuestEvent("playerQuit", (player) => {
  quests.clearPlayer(player);
});

registerQuestEvent("playerDeath", (player) => {
  quests.syncPlayer(player).catch(() => {});
});

repository.validateSchema().then((status) => {
  if (!status.ok) {
    console.error(
      `[QUESTS] Schema validation failed; run db/twinkle_quests_migration.sql (tables: ${status.missingTables.join(", ") || "ok"}, vehicle columns: ${status.missingVehicleColumns.join(", ") || "ok"}, invalid quest columns: ${(status.invalidQuestColumns || []).join(", ") || "ok"}, invalid vehicle columns: ${(status.invalidVehicleColumns || []).join(", ") || "ok"}).`
    );
    return;
  }

  console.log("[QUESTS] Persistent quest schema validated.");
}).catch((error) => {
  console.error("[QUESTS] Schema validation failed:", error?.message || error);
});

runtime.shutdown = () => {
  runtime.active = false;
  runtime.handlers.length = 0;
};

module.exports = quests;
