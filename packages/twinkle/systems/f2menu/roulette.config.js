"use strict";

const MIN_BET = 1;
const MAX_BET = 100000;
const COOLDOWN_MS = 4000;

const ROULETTE_SEGMENTS = Object.freeze([
  Object.freeze({ id: "x5-small", multiplier: 5, chance: 5, color: "#19c994" }),
  Object.freeze({ id: "x2-top", multiplier: 2, chance: 15, color: "#dedede", prizeImage: "/roulette/prizes/prize_skin.png" }),
  Object.freeze({ id: "x5-right", multiplier: 5, chance: 6, color: "#19c994" }),
  Object.freeze({ id: "x2-right", multiplier: 2, chance: 15, color: "#dedede", prizeImage: "/roulette/prizes/prize_skin.png" }),
  Object.freeze({ id: "x3-bottom-right", multiplier: 3, chance: 10, color: "#e40000" }),
  Object.freeze({ id: "x5-bottom", multiplier: 5, chance: 6, color: "#19c994" }),
  Object.freeze({ id: "x3-bottom-left", multiplier: 3, chance: 10, color: "#e40000" }),
  Object.freeze({ id: "x2-left", multiplier: 2, chance: 15, color: "#dedede", prizeImage: "/roulette/prizes/prize_skin.png" }),
  Object.freeze({ id: "x3-top-left", multiplier: 3, chance: 11, color: "#e40000" }),
  Object.freeze({ id: "x10-jackpot", multiplier: 10, chance: 7, color: "#f0e600" }),
]);

const MULTIPLIERS = Object.freeze(
  [...new Set(ROULETTE_SEGMENTS.map((segment) => segment.multiplier))].sort((a, b) => a - b)
);

function getTotalChance() {
  return ROULETTE_SEGMENTS.reduce((sum, segment) => sum + segment.chance, 0);
}

function getExpectedReturns() {
  const totalChance = getTotalChance();

  return Object.fromEntries(MULTIPLIERS.map((multiplier) => {
    const matchingChance = ROULETTE_SEGMENTS
      .filter((segment) => segment.multiplier === multiplier)
      .reduce((sum, segment) => sum + segment.chance, 0);

    return [multiplier, (matchingChance / totalChance) * multiplier];
  }));
}

function assertValidRouletteConfig() {
  const ids = new Set();

  if (getTotalChance() !== 100) {
    throw new Error("Roulette segment chances must total exactly 100.");
  }

  for (const segment of ROULETTE_SEGMENTS) {
    if (ids.has(segment.id)) throw new Error(`Duplicate roulette segment: ${segment.id}`);
    if (!Number.isSafeInteger(segment.chance) || segment.chance <= 0) {
      throw new Error(`Invalid roulette chance: ${segment.id}`);
    }
    ids.add(segment.id);
  }

  for (const [multiplier, expectedReturn] of Object.entries(getExpectedReturns())) {
    if (expectedReturn >= 1) {
      throw new Error(`Roulette x${multiplier} expected return must remain below 1.`);
    }
  }
}

function getPublicRouletteConfig() {
  return {
    version: 1,
    minBet: MIN_BET,
    maxBet: MAX_BET,
    multipliers: [...MULTIPLIERS],
    segments: ROULETTE_SEGMENTS.map((segment) => ({ ...segment })),
  };
}

assertValidRouletteConfig();

module.exports = {
  COOLDOWN_MS,
  MAX_BET,
  MIN_BET,
  MULTIPLIERS,
  ROULETTE_SEGMENTS,
  assertValidRouletteConfig,
  getExpectedReturns,
  getPublicRouletteConfig,
  getTotalChance,
};
