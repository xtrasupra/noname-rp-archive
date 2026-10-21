"use strict";

const inventory = require("../inventory/inventory.service.js");
const db = require("../../database/query.js");
const { getUuid, rows } = require("../../utils/player.js");

const SECRET_SAW_ITEM_ID = "forestry_secret_saw_trophy";
const SECRET_SAW_DOCUMENT_KEY = "forestry:trophy:secret_saw";
const ORDINARY_JOBS = new Set([
  "delivery",
  "trucker",
  "mining",
  "armored_collector",
  "port_loader",
  "construction_loader",
  "forestry",
]);

async function getMultiplier(player, jobId) {
  const normalizedJobId = String(jobId || "").trim().toLowerCase();
  if (!ORDINARY_JOBS.has(normalizedJobId) || !player) return 1;
  try {
    const items = await inventory.getItemsById(player, SECRET_SAW_ITEM_ID);
    const uuid = Number(getUuid(player) || 0);
    const valid = items.some((item) => item.bound === true
      && Number(item.ownerStaticId || 0) === uuid
      && String(item.documentKey || "") === SECRET_SAW_DOCUMENT_KEY
      && String(item.forestryTrophy || "") === "secret_saw");
    if (!valid || !uuid) return 1;
    const profile = rows(await db.query(
      "SELECT secret_saw_claimed FROM forestry_profiles WHERE character_uuid = ? LIMIT 1",
      [uuid]
    ))?.[0];
    return Number(profile?.secret_saw_claimed || 0) === 1 ? 3 : 1;
  } catch (error) {
    console.error("[JOB REWARD MULTIPLIER] Secret saw validation failed:", error?.message || error);
    return 1;
  }
}

module.exports = Object.freeze({
  ORDINARY_JOBS,
  SECRET_SAW_DOCUMENT_KEY,
  SECRET_SAW_ITEM_ID,
  getMultiplier,
});
