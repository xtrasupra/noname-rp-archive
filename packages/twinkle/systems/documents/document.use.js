"use strict";

const inventory = require("../inventory/inventory.service.js");
const licenses = require("../licenses/license.service.js");
const chat = require("../chat/chat.service.js");
const documents = require("./document.service.js");
const {
  DOCUMENT_ITEM_IDS,
  DOCUMENT_ITEM_USE_EVENT,
  getLicenseDocumentItemId,
} = require("./document.items.js");

function getStaticId(player) {
  return Number(
    player?.uuid ||
    player?.staticId ||
    player?.characterId ||
    player?.character?.uuid ||
    player?.characterData?.uuid ||
    player?.getVariable?.("uuid") ||
    0
  );
}

mp.events.add(DOCUMENT_ITEM_USE_EVENT, async (player, item, token) => {
  if (!inventory.isInternalItemUseToken(token)) return;

  try {
    const staticId = getStaticId(player);
    const itemId = String(item?.itemId || item?.id || "");
    if (!staticId || Number(item?.ownerStaticId || 0) !== staticId || item?.bound !== true) {
      throw new Error("Документ не принадлежит текущему персонажу.");
    }

    if (itemId === DOCUMENT_ITEM_IDS.identity && item.documentKey === "identity") {
      await documents.showIdentityCard(player, player);
      return;
    }
    if (itemId === DOCUMENT_ITEM_IDS.medical && item.documentKey === "medical") {
      await documents.showMedicalCertificate(player, player);
      return;
    }

    const licenseId = String(item?.licenseId || "");
    if (
      licenseId &&
      itemId === getLicenseDocumentItemId(licenseId) &&
      item.documentKey === `license:${licenseId}`
    ) {
      await licenses.showLicenseToViewer(player, licenseId, player);
      return;
    }

    throw new Error("Тип документа не поддерживается.");
  } catch (error) {
    chat.sendError(player, error.message || "Не удалось открыть документ.");
  }
});

console.log("[DOCUMENT ITEMS] Inventory use handler registered");
