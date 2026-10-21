"use strict";

const config = require("./armoredCollector.config.js");

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value || 0)));
}

function levelForXp(value) {
  const xp = Math.max(0, Math.floor(Number(value || 0)));
  let level = 1;
  for (let index = 0; index < config.levels.length; index += 1) {
    if (xp >= config.levels[index]) level = index + 1;
  }
  return level;
}

function levelProgress(xpValue) {
  const xp = Math.max(0, Math.floor(Number(xpValue || 0)));
  const level = levelForXp(xp);
  const currentLevelXp = Number(config.levels[level - 1] || 0);
  const nextLevelXp = level < config.levels.length ? Number(config.levels[level]) : currentLevelXp;
  return { level, xp, currentLevelXp, nextLevelXp };
}

function levelPayRate(levelValue) {
  const level = clamp(Math.floor(Number(levelValue || 1)), 1, config.levels.length);
  return clamp(config.economy.levelPayRates[level - 1], 0, 1);
}

function levelPayScale() {
  return config.economy.levelPayRates.map((rate, index) => {
    const level = index + 1;
    return {
      level,
      percent: Math.round(clamp(rate, 0, 1) * 100),
      flatBonus: level >= config.economy.level10Unlock ? config.economy.level10FlatBonus : 0,
    };
  });
}

function cancellationFee({ bagsLoaded = 0, carrying = false } = {}) {
  const loaded = clamp(Math.floor(Number(bagsLoaded || 0)), 0, 8);
  if (!carrying && loaded === 0) return config.cancellation.beforePickupFee;
  return Math.min(
    config.cancellation.maximumFee,
    config.cancellation.afterPickupBaseFee + loaded * config.cancellation.perLoadedBagFee
  );
}

function routeMetrics(distanceMValue) {
  const distanceM = Math.max(0, Math.round(Number(distanceMValue || 0)));
  const bags = clamp(2 + Math.floor(distanceM / 5500), 2, 4);
  const targetSeconds = Math.max(120, Math.round(
    distanceM / config.economy.targetSpeedMps + bags * config.economy.serviceSecondsPerBag
  ));
  return { distanceM, bags, targetSeconds };
}

function calculatePayout({ distanceM, bags, targetSeconds, elapsedSeconds, level, suspicious = false }) {
  const safeDistanceM = Math.max(0, Number(distanceM || 0));
  const safeBags = clamp(Math.floor(Number(bags || 0)), 1, 8);
  const safeLevel = clamp(Math.floor(Number(level || 1)), 1, config.levels.length);
  const basePay = Math.round(
    config.economy.basePay +
    safeDistanceM / 1000 * config.economy.payPerKm +
    safeBags * config.economy.payPerBag
  );
  const levelRate = levelPayRate(safeLevel);
  const levelBonus = Math.round(basePay * levelRate);
  const veteranBonus = safeLevel >= config.economy.level10Unlock
    ? config.economy.level10FlatBonus
    : 0;
  const target = Math.max(1, Number(targetSeconds || 1));
  const elapsed = Math.max(1, Number(elapsedSeconds || target));
  const timeRatio = elapsed / target;
  const fastRate = suspicious || timeRatio >= 1
    ? 0
    : config.economy.fastBonusMaxRate * clamp((1 - timeRatio) / 0.35, 0, 1);
  const fastBonus = Math.round(basePay * fastRate);
  const finalPayout = Math.max(0, basePay + levelBonus + veteranBonus + fastBonus);
  const xpEarned = Math.max(1, Math.round(
    config.economy.xpBase + safeDistanceM / 1000 * config.economy.xpPerKm + safeBags * config.economy.xpPerBag
  ));
  return {
    basePay,
    levelBonus,
    levelPercent: Math.round(levelRate * 100),
    veteranBonus,
    fastBonus,
    finalPayout,
    xpEarned,
  };
}

module.exports = {
  calculatePayout,
  cancellationFee,
  clamp,
  levelForXp,
  levelPayRate,
  levelPayScale,
  levelProgress,
  routeMetrics,
};
