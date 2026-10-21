"use strict";

const GROUP_REFRESH_MS = 2000;
const FIRST_GROUP_CATEGORY = 100;
const LAST_GROUP_CATEGORY = 255;
const groupedCategories = new Set();
const groupedBlips = new WeakSet();
const categoryBySprite = new Map();
let nextGroupCategory = FIRST_GROUP_CATEGORY;

function getBlipHandle(blip) {
  const handle = Number(blip?.handle || 0);
  return Number.isInteger(handle) && handle > 0 ? handle : 0;
}

function getBlipSprite(blip, handle) {
  try {
    if (typeof blip.getSprite === "function") return Number(blip.getSprite());
    if (typeof mp.game.ui.getBlipSprite === "function") {
      return Number(mp.game.ui.getBlipSprite(handle));
    }
  } catch {}

  return 0;
}

function isShortRangeBlip(blip, handle) {
  try {
    if (typeof blip.isShortRange === "function") return Boolean(blip.isShortRange());
    if (typeof mp.game.ui.isBlipShortRange === "function") {
      return Boolean(mp.game.ui.isBlipShortRange(handle));
    }
  } catch {}

  return false;
}

function hasGpsRoute(handle) {
  try {
    return typeof mp.game.ui.doesBlipHaveGpsRoute === "function"
      && Boolean(mp.game.ui.doesBlipHaveGpsRoute(handle));
  } catch {
    return false;
  }
}

function getGroupableBlip(blip) {
  if (!blip) return null;
  const handle = getBlipHandle(blip);
  if (!handle || !isShortRangeBlip(blip, handle) || hasGpsRoute(handle)) return null;

  const sprite = getBlipSprite(blip, handle);
  if (!Number.isInteger(sprite) || sprite <= 0 || sprite === 8) return null;

  return { blip, handle, sprite };
}

function getCategoryForSprite(sprite) {
  if (categoryBySprite.has(sprite)) return categoryBySprite.get(sprite);
  if (nextGroupCategory > LAST_GROUP_CATEGORY) return 0;

  const category = nextGroupCategory++;
  categoryBySprite.set(sprite, category);
  return category;
}

function groupBlipInPauseLegend(entry, category) {
  const { blip, handle } = entry;
  if (groupedBlips.has(blip)) return;

  try {
    if (typeof blip.setCategory === "function") {
      blip.setCategory(category);
    } else if (typeof mp.game.ui.setBlipCategory === "function") {
      mp.game.ui.setBlipCategory(handle, category);
    } else {
      return;
    }

    if (!groupedCategories.has(category)) {
      mp.game.ui.setBlipCategoryGrouped(category, true);
      groupedCategories.add(category);
    }

    groupedBlips.add(blip);
  } catch {}
}

function groupPauseLegendBlips() {
  if (!mp.blips || typeof mp.blips.forEach !== "function") return;

  const entriesBySprite = new Map();
  mp.blips.forEach((blip) => {
    const entry = getGroupableBlip(blip);
    if (!entry) return;

    if (!entriesBySprite.has(entry.sprite)) entriesBySprite.set(entry.sprite, []);
    entriesBySprite.get(entry.sprite).push(entry);
  });

  for (const [sprite, entries] of entriesBySprite) {
    if (entries.length < 2) continue;

    const category = getCategoryForSprite(sprite);
    if (!category) continue;
    entries.forEach((entry) => groupBlipInPauseLegend(entry, category));
  }
}

mp.events.add("playerReady", groupPauseLegendBlips);
mp.events.add("entityStreamIn", groupPauseLegendBlips);

groupPauseLegendBlips();
setInterval(groupPauseLegendBlips, GROUP_REFRESH_MS);
