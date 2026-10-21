"use strict";

module.exports = {
  paydaySeconds: 60 * 60,
  paydayXp: 1,
  xpRequired(level) {
    return Math.max(3, Math.floor(Number(level || 1)) * 3);
  },

  donateRewardLevels: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30],

  donateRewardAmount: 100,
};
