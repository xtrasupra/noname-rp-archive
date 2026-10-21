"use strict";

const HEAD_OVERLAY_MAX_INDEX = Object.freeze([
  23, 28, 33, 14, 94, 32, 11, 10, 9, 17, 16, 11, 1,
]);

function safeJsonParse(value, fallback = {}) {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max, fallback = min) {
  const n = num(value, fallback);
  return Math.max(min, Math.min(max, n));
}

function normalizeHeadOverlayValue(overlayId, value) {
  const normalized = Math.trunc(num(value, 255));
  if (normalized === 255) return 255;

  return clamp(normalized, 0, HEAD_OVERLAY_MAX_INDEX[overlayId], 255);
}

function safe(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[APPEARANCE ERROR] ${label}:`, err.message);
  }
}

function applyDefaultClothes(player, gender) {
  const female = String(gender).toLowerCase() === "female";

  const list = female
    ? [
        [3, 15, 0],
        [4, 14, 0],
        [6, 35, 0],
        [8, 15, 0],
        [11, 15, 0],
      ]
    : [
        [3, 15, 0],
        [4, 21, 0],
        [6, 34, 0],
        [8, 15, 0],
        [11, 15, 0],
      ];

  for (const [component, drawable, texture] of list) {
    safe(`default clothes ${component}`, () => {
      player.setClothes(component, drawable, texture, 0);
    });
  }
}

function applyHeadBlend(player, customization) {
  const blend = customization.blend || {};

  safe("head blend", () => {
    player.setHeadBlend(
      clamp(blend.mother, 0, 45, 0),
      clamp(blend.father, 0, 45, 0),
      0,
      clamp(blend.skinMother, 0, 45, 0),
      clamp(blend.skinFather, 0, 45, 0),
      0,
      clamp(blend.shapeMix, 0, 1, 0.5),
      clamp(blend.skinMix, 0, 1, 0.5),
      0
    );
  });
}

function applyHair(player, customization) {
  const hair = customization.hair || {};

  safe("hair style", () => {
    player.setClothes(2, clamp(hair.hairId, 0, 120, 0), 0, 0);
  });

  safe("hair color", () => {
    player.setHairColor(
      clamp(hair.color1, 0, 63, 0),
      clamp(hair.color2, 0, 63, 0)
    );
  });
}

function applyFaceFeatures(player, customization) {
  const face = customization.face || {};

  const features = {
    11: face.eyes_open,
    10: face.face_shape_x,
    15: face.face_shape_y,
  };

  for (const [index, value] of Object.entries(features)) {
    if (value === undefined || value === null) continue;

    safe(`face feature ${index}`, () => {
      player.setFaceFeature(
        clamp(index, 0, 19, 0),
        clamp(value, -1, 1, 0)
      );
    });
  }
}

function applyEyeColor(player, appearance) {
  if (appearance.eyeColor === undefined || appearance.eyeColor === null) return;

  safe("eye color", () => {
    player.eyeColor = clamp(appearance.eyeColor, 0, 31, 0);
  });
}

function applyOverlays(player, appearance) {
  if (!Array.isArray(appearance.overlays)) return;

  for (const raw of appearance.overlays) {
    if (!raw) continue;

    const overlayId = clamp(raw.index ?? raw.id, 0, 12, 0);
    const value = normalizeHeadOverlayValue(overlayId, raw.value);
    const opacity = clamp(raw.opacity, 0, 1, 1);
    const color1 = clamp(raw.color1 ?? raw.color, 0, 63, 0);
    const color2 = clamp(raw.color2, 0, 63, 0);

    safe(`head overlay ${overlayId}`, () => {
      player.setHeadOverlay(
        overlayId,
        [value, opacity, color1, color2]
      );
    });
  }
}

function applyDbClothes(player, clothes) {
  const data = clothes.components || clothes || {};

  for (const [component, item] of Object.entries(data)) {
    if (!item) continue;

    safe(`db clothes ${component}`, () => {
      player.setClothes(
        clamp(component, 0, 11, 0),
        clamp(item.drawable ?? item.drawableId ?? item.id, 0, 600, 0),
        clamp(item.texture ?? item.textureId, 0, 100, 0),
        clamp(item.palette, 0, 3, 0)
      );
    });
  }
}

async function applyCharacterAppearance(player, character) {
  if (!player || !character) return false;

  const customization = safeJsonParse(character.customization, {});
  const clothes = safeJsonParse(character.clothes, {});
  const appearance = safeJsonParse(character.appearance, {});
  const gender = String(character.gender || customization.gender || "male").toLowerCase();

  safe("model", () => {
    player.model = mp.joaat(
      gender === "female" ? "mp_f_freemode_01" : "mp_m_freemode_01"
    );
  });

  await new Promise((resolve) => setTimeout(resolve, 700));
  if (
    !player ||
    (typeof mp !== "undefined" && mp.players?.exists && !mp.players.exists(player))
  ) return false;

  console.log("[APPEARANCE] server apply start", {
    uuid: character.uuid,
    gender,
  });

  applyDefaultClothes(player, gender);
  applyHeadBlend(player, customization);
  applyHair(player, customization);
  applyFaceFeatures(player, customization);
  applyEyeColor(player, appearance);
  applyOverlays(player, appearance);
  applyDbClothes(player, clothes);

  console.log("[APPEARANCE] server apply done", {
    uuid: character.uuid,
  });
  return true;
}

module.exports = {
  applyCharacterAppearance,
};
