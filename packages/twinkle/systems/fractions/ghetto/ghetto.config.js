"use strict";

const FACTIONS = {
  BLOODS: 8,
  BALLAS: 9,
  VAGOS: 10,
  MARABUNTA: 11,
  FAMILIES: 12,
};

const FACTION_COLORS = {
  [FACTIONS.BLOODS]: { hex: "#e53935", rgb: [229, 57, 53], rage: 1 },
  [FACTIONS.BALLAS]: { hex: "#ae00ff", rgb: [174, 0, 255], rage: 7 },
  [FACTIONS.VAGOS]: { hex: "#f4c430", rgb: [244, 196, 48], rage: 5 },
  [FACTIONS.MARABUNTA]: { hex: "#2388ff", rgb: [35, 136, 255], rage: 3 },
  [FACTIONS.FAMILIES]: { hex: "#34c759", rgb: [52, 199, 89], rage: 2 },
};

const CELL_SIZE = 100;
const HALF_CELL = CELL_SIZE / 2;

const WEST_ROWS = [
  [-1431.556, [-200.8397, -100.8397, -0.8397, 99.1603]],
  [-1531.556, [-200.8397, -100.8397, -0.8397, 99.1603, 199.1603, 299.1603, 399.1603, 499.1603]],
  [-1631.556, [-200.8397, -100.8397, -0.8397, 99.1603, 199.1603, 299.1603, 399.1603, 499.1603, 599.1603]],
  [-1731.556, [-100.8397, -0.8397, 99.1603, 199.1603, 299.1603, 399.1603, 499.1603, 599.1603]],
  [-1831.556, [-0.8397, 99.1603, 199.1603, 299.1603, 399.1603, 499.1603, 599.1603]],
  [-1931.556, [99.1603, 199.1603, 299.1603, 399.1603, 499.1603, 599.1603]],
  [-2031.556, [199.1603, 299.1603, 399.1603, 499.1603]],
  [-2131.556, [299.1603, 399.1603]],
];

const EAST_ROWS = [
  [-1501.556, [1268.898, 1368.898]],
  [-1601.556, [768.8984, 868.8984, 1168.898, 1268.898, 1368.898]],
  [-1701.556, [768.8984, 868.8984, 968.8984, 1168.898, 1268.898, 1368.898]],
  [-1801.556, [768.8984, 868.8984, 968.8984, 1168.898, 1268.898]],
  [-1901.556, [768.8984, 868.8984, 968.8984, 1068.898]],
  [-2001.556, [768.8984, 868.8984, 968.8984, 1068.898]],
  [-2101.556, [768.8984, 868.8984, 968.8984, 1068.898]],
  [-2201.556, [768.8984, 868.8984, 968.8984, 1068.898]],
  [-2301.556, [768.8984, 868.8984, 968.8984, 1068.898]],
  [-2401.556, [768.8984, 868.8984, 968.8984, 1068.898]],
];

const FACTION_SEEDS = [
  { factionId: FACTIONS.FAMILIES, x: -150, y: -1530 },
  { factionId: FACTIONS.BALLAS, x: 80, y: -1740 },
  { factionId: FACTIONS.BLOODS, x: 420, y: -1660 },
  { factionId: FACTIONS.MARABUNTA, x: 1280, y: -1660 },
  { factionId: FACTIONS.VAGOS, x: 920, y: -2180 },
];

const RAW_ZONES = [...WEST_ROWS, ...EAST_ROWS].flatMap(([centerY, centersX]) =>
  centersX.map((centerX) => ({ centerX, centerY }))
);

function distanceSquared(zone, seed) {
  return (zone.centerX - seed.x) ** 2 + (zone.centerY - seed.y) ** 2;
}

function assignOwners(zones) {
  const quota = new Map(FACTION_SEEDS.map((seed) => [seed.factionId, 18]));
  const assignments = new Array(zones.length).fill(0);
  const candidates = [];

  zones.forEach((zone, zoneIndex) => {
    FACTION_SEEDS.forEach((seed) => {
      candidates.push({
        zoneIndex,
        factionId: seed.factionId,
        distance: distanceSquared(zone, seed),
      });
    });
  });

  candidates.sort((a, b) => a.distance - b.distance);
  for (const candidate of candidates) {
    if (assignments[candidate.zoneIndex]) continue;
    if ((quota.get(candidate.factionId) || 0) <= 0) continue;
    assignments[candidate.zoneIndex] = candidate.factionId;
    quota.set(candidate.factionId, quota.get(candidate.factionId) - 1);
  }

  return assignments;
}

const OWNER_ASSIGNMENTS = assignOwners(RAW_ZONES);
const TITLE_INDEXES = new Map();

for (const seed of FACTION_SEEDS) {
  let closestIndex = -1;
  let closestDistance = Number.POSITIVE_INFINITY;

  RAW_ZONES.forEach((zone, index) => {
    if (OWNER_ASSIGNMENTS[index] !== seed.factionId) return;
    const distance = distanceSquared(zone, seed);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  TITLE_INDEXES.set(seed.factionId, closestIndex);
}

function districtName(centerX, centerY) {
  if (centerX >= 1150) return "Эль-Бурро-Хайтс";
  if (centerX >= 700 && centerY <= -1850) return "Сайпресс-Флэтс";
  if (centerX >= 700) return "Ранчо";
  if (centerX >= 350) return "Дэвис";
  if (centerX >= 50) return "Строберри";
  return "Чемберлен-Хиллз";
}

const ZONES = RAW_ZONES.map((zone, index) => {
  const ownerFactionId = OWNER_ASSIGNMENTS[index];
  const isTitle = TITLE_INDEXES.get(ownerFactionId) === index;
  const sortOrder = index + 1;

  return {
    code: `G${String(sortOrder).padStart(2, "0")}`,
    name: `${districtName(zone.centerX, zone.centerY)} — сектор ${sortOrder}`,
    sortOrder,
    centerX: zone.centerX,
    centerY: zone.centerY,
    minX: zone.centerX - HALF_CELL,
    maxX: zone.centerX + HALF_CELL,
    minY: zone.centerY - HALF_CELL,
    maxY: zone.centerY + HALF_CELL,
    z: 30,
    radius: HALF_CELL,
    ownerFactionId,
    isTitle,
    titleFactionId: isTitle ? ownerFactionId : 0,
  };
});

module.exports = {
  FACTIONS,
  FACTION_COLORS,
  ZONES,
  CAPTURE_DURATION_SECONDS: 10 * 60,
  CAPTURE_COOLDOWN_MINUTES: 60,
  SCORE_LIMIT: 100,
  SCORE_PER_PLAYER_SECOND: 1,
  SCORE_PER_KILL: 5,
  MIN_ATTACKERS_TO_START: 2,
  MAX_PARTICIPANTS_PER_SIDE: 30,
  ALLOWED_FACTION_TYPES: ["ghetto", "gang", "банда"],
};
