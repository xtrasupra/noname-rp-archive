"use strict";

const furnitureService = require("./furniture.service");

console.log("[OBJECT EDITOR] Server file loading");

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function sendEditorError(player, message) {
  const text = message || "Ошибка редактора мебели.";

  try {
    player.call("c:furnitureEditor:error", [text]);
  } catch {}

  try {
    player.outputChatBox(`!{red}${text}`);
  } catch {}
}

function sendEditorOpen(player, payload) {
  player.call("c:furnitureEditor:open", [JSON.stringify(payload)]);
}

function sendEditorUpdate(player, payload) {
  player.call("c:furnitureEditor:update", [JSON.stringify(payload)]);
}

function addAsyncEvent(eventName, handler) {
  mp.events.add(eventName, (player, ...args) => {
    Promise.resolve(handler(player, ...args)).catch((err) => {
      console.error(`[${eventName} ERROR]`, err);
      sendEditorError(player, err.message);
    });
  });
}

async function buildMenuPayload(player, rawPayload) {
  const payload = parsePayload(rawPayload);

  if (payload.propertyKind && payload.propertyId) {
    return furnitureService.buildFurnitureEditorPayload(
      player,
      payload.propertyKind,
      payload.propertyId,
      payload.selectedId || null
    );
  }

  const owned = await furnitureService.findFirstOwnedProperty(player, payload.propertyKind || null);
  return furnitureService.buildFurnitureEditorPayload(player, owned.kind, owned.property.id, null);
}

addAsyncEvent("s:objectEditor:requestMenu", async (player, rawPayload = "{}") => {
  const payload = await buildMenuPayload(player, rawPayload);
  sendEditorOpen(player, payload);
});

addAsyncEvent("s:objectEditor:buy", async (player, rawPayload = "{}") => {
  const placementPayload = await furnitureService.createPlacementPayload(player, rawPayload, "buy");
  player.call("c:objectEditor:startPlacement", [JSON.stringify(placementPayload)]);
});

addAsyncEvent("s:objectEditor:move", async (player, rawPayload = "{}") => {
  const placementPayload = await furnitureService.createPlacementPayload(player, rawPayload, "move");
  player.call("c:objectEditor:startPlacement", [JSON.stringify(placementPayload)]);
});

addAsyncEvent("s:objectEditor:delete", async (player, rawPayload = "{}") => {
  const payload = await furnitureService.deleteFurniture(player, rawPayload);
  sendEditorUpdate(player, payload);
});

addAsyncEvent("s:objectEditor:deleteAll", async (player, rawPayload = "{}") => {
  const payload = await furnitureService.deleteAllFurniture(player, rawPayload);
  sendEditorUpdate(player, payload);
});

addAsyncEvent("s:objectEditor:find", async (player, rawPayload = "{}") => {
  const furniture = await furnitureService.findFurniture(player, rawPayload);

  player.call("c:objectEditor:markFurniture", [
    JSON.stringify({
      id: furniture.id,
      model: furniture.model,
      position: {
        x: Number(furniture.x || 0),
        y: Number(furniture.y || 0),
        z: Number(furniture.z || 0),
      },
      dimension: Number(furniture.dimension || 0),
    }),
  ]);
});

addAsyncEvent("s:objectEditor:save", async (player, rawPayload = "{}") => {
  const payload = await furnitureService.savePlacement(player, rawPayload);
  sendEditorUpdate(player, payload);
});

addAsyncEvent("s:objectEditor:cancel", async (player) => {
  furnitureService.cancelPlacement(player);
});

mp.events.add("playerQuit", (player) => furnitureService.cancelPlacement(player));

furnitureService.startFurnitureSpawner();

console.log("[OBJECT EDITOR] Server events registered");
