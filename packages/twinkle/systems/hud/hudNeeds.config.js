"use strict";

module.exports = {
  enabled: true,

  // How often needs are reduced and saved.
  tickMs: 60_000,
  saveEveryTicks: 5,

  // Values are percent points per tick.
  waterLossPerTick: 1,
  foodLossPerTick: 1,

  defaults: {
    health: 100,
    water: 100,
    food: 100,
  },
};
