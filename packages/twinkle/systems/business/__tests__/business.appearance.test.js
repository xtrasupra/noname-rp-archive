"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BUSINESS_BY_ID,
  BUSINESS_CONTRACT_VERSION,
} = require("../business.config.js");
const { getCanonicalAppearance } = require("../business.appearance.js");

test("appearance contract carries authoritative gender in version 5", () => {
  assert.equal(BUSINESS_CONTRACT_VERSION, 5);
  assert.equal(getCanonicalAppearance({
    character: {
      appearance: JSON.stringify({ decorations: [] }),
      customization: JSON.stringify({ hair: { hairId: 4, color1: 2, color2: 1 } }),
      gender: "female",
    },
  }).gender, "female");
  assert.equal(getCanonicalAppearance({
    character: {
      appearance: JSON.stringify({ decorations: [] }),
      customization: JSON.stringify({ gender: "unexpected" }),
    },
  }).gender, "male");
});

test("tattoo catalog uses a full-body preview frame", () => {
  const tattoo = BUSINESS_BY_ID.get("tattoo_vespucci");
  assert.ok(tattoo);
  assert.ok(tattoo.products.length > 0);
  for (const product of tattoo.products) {
    assert.equal(product.preview?.type, "tattoo");
    assert.equal(product.preview?.focus, "full");
  }
});
