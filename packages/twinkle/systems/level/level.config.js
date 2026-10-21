"use strict";

module.exports = {
  // Seconds online required for one payday XP tick.
  paydaySeconds: 60 * 60,

  // XP granted per payday.
  paydayXp: 1,

  // XP required for the next level.
  // Default: level 1 needs 2 XP, level 2 needs 4 XP, level 3 needs 6 XP.
  xpRequired(level) {
    return Math.max(2, Math.floor(Number(level || 1)) * 2);
  },

  // Donate rewards by reached level. Missing levels grant 0 donate.
  donateRewardsByLevel: {
    2: 0,
    3: 100,
    4: 0,
    5: 0,
    6: 150,
    7: 0,
    8: 0,
    9: 200,
    10: 0,
    11: 0,
    12: 250,
  },
};
