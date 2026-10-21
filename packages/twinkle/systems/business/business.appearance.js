"use strict";

function parseJson(value, fallback) {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getCanonicalAppearance(player) {
  const customization = parseJson(player?.character?.customization, {});
  const appearance = parseJson(player?.character?.appearance, {});
  const gender = String(player?.character?.gender || customization?.gender || "male").toLowerCase() === "female"
    ? "female"
    : "male";
  const hair = customization?.hair && typeof customization.hair === "object" ? customization.hair : {};
  const decorations = Array.isArray(appearance?.decorations)
    ? appearance.decorations.slice(0, 32).map((entry) => ({
      collection: String(entry?.collection || "").slice(0, 64),
      overlay: String(entry?.overlay || "").slice(0, 64),
    })).filter((entry) => entry.collection && entry.overlay)
    : [];

  return {
    gender,
    hair: {
      hairId: Math.max(0, Math.min(1024, Math.floor(Number(hair.hairId || 0)))),
      color1: Math.max(0, Math.min(63, Math.floor(Number(hair.color1 || 0)))),
      color2: Math.max(0, Math.min(63, Math.floor(Number(hair.color2 || 0)))),
    },
    decorations,
  };
}

module.exports = {
  getCanonicalAppearance,
};
