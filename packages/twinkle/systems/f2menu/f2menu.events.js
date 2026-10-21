"use strict";

const { buildF2InventoryPayload } = require("./f2menu.payload.js");
const authFlow = require("../../auth/authFlow.js");
const f2Catalog = require("./f2menu.catalog.js");
const f2Cache = require("./f2menu.cache.js");

const F2_REQUEST_COOLDOWN_MS = 750;
const F2_OPEN_LOG_INTERVAL_MS = 10000;
const pendingF2Requests = new Set();
const lastF2RequestAt = new Map();
const lastF2OpenLogAt = new Map();

function safeCall(player, eventName, args = []) {
  try {
    if (player && mp.players.exists(player)) {
      player.call(eventName, args);
    }
  } catch (error) {
    console.error(`[F2] call ${eventName} error:`, error?.message || error);
  }
}

function notifyInventory(player, message, color = "#66ccff") {
  safeCall(player, "client:notification", [message, color]);
  safeCall(player, "c:f2menu:error", [message]);
}

async function sendF2Inventory(player) {
  const inventory = await buildF2InventoryPayload(player);
  safeCall(player, "c:f2menu:inventory:set", [JSON.stringify(inventory)]);
  return inventory;
}

async function sendF2Update(player) {
  const payload = await f2Cache.refresh(player, { push: false });
  safeCall(player, "c:f2menu:update", [JSON.stringify(payload)]);
  return payload;
}

function parsePayload(payloadJson) {
  try {
    if (!payloadJson) return {};
    if (typeof payloadJson === "object") return payloadJson;
    return JSON.parse(String(payloadJson));
  } catch {
    return {};
  }
}

function getCaseActionPayload(payloadJson) {
  const payload = parsePayload(payloadJson);
  return {
    caseId: String(payload.caseId || payload.id || "").trim(),
    amount: Math.max(1, Math.min(5, Math.floor(Number(payload.amount || 1)))),
  };
}

async function sendCaseResult(player, result) {
  const inventory = await sendF2Inventory(player);
  const payload = await sendF2Update(player);

  safeCall(player, "c:f2menu:case:result", [JSON.stringify({
    ...result,
    inventory,
    donate: payload.donate,
    ownedCases: payload.ownedCases || payload.shop?.ownedCases || {},
    casesCount: payload.casesCount || payload.shop?.casesCount || 0,
    inventoryCount: payload.inventoryCount || payload.shop?.inventoryCount || inventory.count || 0,
  })]);
}

mp.events.add("s:f2menu:request", async (player) => {
  if (!player || !mp.players.exists(player)) return;
  if (!player.auth || !player.character) {
    return safeCall(player, "c:f2menu:error", ["Персонаж не выбран."]);
  }
  if (!authFlow.isPhase(player, authFlow.PHASE.IN_GAME)) return;

  const playerId = Number(player.id);
  const now = Date.now();
  if (pendingF2Requests.has(playerId)) return;
  if (now - Number(lastF2RequestAt.get(playerId) || 0) < F2_REQUEST_COOLDOWN_MS) return;

  lastF2RequestAt.set(playerId, now);
  pendingF2Requests.add(playerId);

  try {
    const cachedPayload = f2Cache.get(player);
    if (cachedPayload) {
      if (now - Number(lastF2OpenLogAt.get(playerId) || 0) >= F2_OPEN_LOG_INTERVAL_MS) {
        lastF2OpenLogAt.set(playerId, now);
        console.log(`[F2 MENU] Opened cached payload for character ${Number(player.character.uuid || 0)}.`);
      }
      safeCall(player, "c:f2menu:open", [JSON.stringify(cachedPayload)]);
      f2Cache.refresh(player, { push: true }).catch((error) => {
        console.error("[F2 MENU CACHE UPDATE ERROR]", error?.message || error);
      });
      return;
    }

    const payload = await f2Cache.getOrBuild(player);
    if (now - Number(lastF2OpenLogAt.get(playerId) || 0) >= F2_OPEN_LOG_INTERVAL_MS) {
      lastF2OpenLogAt.set(playerId, now);
      console.log(`[F2 MENU] Opened rebuilt payload for character ${Number(player.character.uuid || 0)}.`);
    }
    safeCall(player, "c:f2menu:open", [JSON.stringify(payload)]);
  } catch (err) {
    console.error("[F2 MENU REQUEST ERROR]", err);
    safeCall(player, "c:f2menu:error", ["Ошибка открытия меню F2."]);
  } finally {
    pendingF2Requests.delete(playerId);
  }
});

mp.events.add("playerQuit", (player) => {
  const playerId = Number(player?.id);
  pendingF2Requests.delete(playerId);
  lastF2RequestAt.delete(playerId);
  lastF2OpenLogAt.delete(playerId);
});

mp.events.add("s:f2:inventory:request", async (player) => {
  try {
    if (!player || !mp.players.exists(player)) return;
    await sendF2Inventory(player);
  } catch (err) {
    console.error("[F2 INVENTORY REQUEST ERROR]", err);
  }
});

mp.events.add("s:f2:inventory:claim", async (player) => {
  try {
    if (!player || !mp.players.exists(player)) return;
    notifyInventory(player, "Предмет уже находится в F2 инвентаре.", "#66ccff");
    await sendF2Inventory(player);
  } catch (err) {
    console.error("[F2 INVENTORY CLAIM ERROR]", err);
  }
});

mp.events.add("s:f2:inventory:sell", async (player) => {
  try {
    if (!player || !mp.players.exists(player)) return;
    notifyInventory(player, "Продажа предметов из F2 пока не настроена.", "#ffcc66");
    await sendF2Inventory(player);
  } catch (err) {
    console.error("[F2 INVENTORY SELL ERROR]", err);
  }
});

mp.events.add("s:f2:case:buy", async (player, payloadJson = "{}") => {
  try {
    if (!player || !mp.players.exists(player)) return;
    const { caseId, amount } = getCaseActionPayload(payloadJson);
    const result = await f2Catalog.buyCase(player, caseId, amount);
    await sendCaseResult(player, {
      action: "buy",
      success: true,
      case: result.case,
      amount: result.amount,
      message: result.message,
      reward: null,
      rewards: [],
    });
  } catch (err) {
    console.error("[F2 CASE BUY ERROR]", err);
    safeCall(player, "c:f2menu:case:result", [JSON.stringify({
      action: "buy",
      success: false,
      message: err?.message || "Ошибка покупки кейса.",
    })]);
  }
});

mp.events.add("s:f2:case:open", async (player, payloadJson = "{}") => {
  try {
    if (!player || !mp.players.exists(player)) return;
    const { caseId, amount } = getCaseActionPayload(payloadJson);
    const result = await f2Catalog.openCase(player, caseId, amount);
    await sendCaseResult(player, {
      action: "open",
      success: true,
      case: result.case,
      amount: result.amount,
      reward: result.reward,
      rewards: result.rewards,
      message: result.message,
    });
  } catch (err) {
    console.error("[F2 CASE OPEN ERROR]", err);
    safeCall(player, "c:f2menu:case:result", [JSON.stringify({
      action: "open",
      success: false,
      message: err?.message || "Ошибка открытия кейса.",
    })]);
  }
});

console.log("[F2 MENU SERVER] Loaded");
