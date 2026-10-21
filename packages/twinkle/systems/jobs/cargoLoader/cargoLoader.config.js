"use strict";

const point = (id, x, y, z, heading = 0) => Object.freeze({
  id,
  x,
  y,
  z,
  heading,
  dimension: 0,
});

const PORT_POINTS = Object.freeze([
  point("port_01", 1234.47, -3201.708, 5.528, -1.32),
  point("port_02", 1219.714, -3201.685, 5.527, 8.21),
  point("port_03", 1218.421, -3234.722, 5.529, 179.41),
  point("port_04", 1233.191, -3233.461, 5.529, 176.56),
  point("port_05", 1243.957, -3235.585, 6.029, 102.47),
  point("port_06", 1244.463, -3240.958, 6.029, 95.01),
  point("port_07", 1244.757, -3244.576, 6.029, 85.72),
  point("port_08", 1242.807, -3270.542, 5.533, 89.22),
  point("port_09", 1243.316, -3281.168, 6.029, 91.82),
  point("port_10", 1245.273, -3283.526, 6.029, 78.27),
  point("port_11", 1244.856, -3310.496, 6.029, 98.41),
  point("port_12", 1242.808, -3315.479, 6.029, -9.1),
  point("port_13", 1245.624, -3170.067, 5.59, -167.37),
]);

const SHARED_UNIFORM = Object.freeze({
  female: Object.freeze({
    components: Object.freeze([[3, 44, 0], [4, 34, 0], [6, 27, 0], [8, 36, 1], [11, 48, 0]]),
    hat: Object.freeze([0, 45, 0]),
  }),
  male: Object.freeze({
    components: Object.freeze([[3, 41, 0], [4, 9, 7], [6, 27, 0], [8, 59, 0], [11, 56, 0]]),
    hat: Object.freeze([0, 0, 0]),
  }),
});

const SITES = Object.freeze({
  port: Object.freeze({
    id: "port",
    jobId: "port_loader",
    name: "Портовый грузчик",
    npc: Object.freeze({
      id: "port_loader_foreman",
      name: "Бригадир порта",
      profession: "Стивидор",
      model: "s_m_m_dockwork_01",
      position: new mp.Vector3(1243.848, -3196.904, 6.028),
      heading: -91.76,
      dimension: 0,
      colshapeRadius: 4.5,
      scenario: "WORLD_HUMAN_CLIPBOARD",
    }),
    blip: Object.freeze({ sprite: 478, color: 5, scale: 0.8, name: "Работа грузчика · Порт", shortRange: true }),
    points: PORT_POINTS,
    route: Object.freeze({ minimumDistanceM: 20 }),
    economy: Object.freeze({ payPerMeter: 0.8, minimumPayout: 2, maximumPayout: 120 }),
    cargo: Object.freeze({
      name: "коробку",
      label: "Коробка",
      models: Object.freeze(["prop_cs_cardbox_01", "hei_prop_heist_box"]),
      bone: 28422,
      position: Object.freeze([0, -0.03, -0.16]),
      rotation: Object.freeze([5, 0, 0]),
      groundOffset: 0.28,
    }),
  }),
  construction: Object.freeze({
    id: "construction",
    jobId: "construction_loader",
    name: "Грузчик на стройке",
    npc: Object.freeze({
      id: "construction_loader_foreman",
      name: "Прораб",
      profession: "Начальник участка",
      model: "s_m_y_construct_01",
      position: new mp.Vector3(-97.182, -1013.671, 27.275),
      heading: 159.04,
      dimension: 0,
      colshapeRadius: 4.5,
      scenario: "WORLD_HUMAN_CLIPBOARD",
    }),
    blip: Object.freeze({ sprite: 566, color: 47, scale: 0.8, name: "Работа грузчика · Стройка", shortRange: true }),
    pickup: point("construction_load", -82.87, -1006.421, 27.852, 70.67),
    dropoff: point("construction_unload", -123.016, -1095.558, 21.685, -112.59),
    economy: Object.freeze({ payout: 110 }),
    cargo: Object.freeze({
      name: "брус",
      label: "Деревянный брус",
      models: Object.freeze(["prop_cs_wood_board", "prop_rub_planks_04", "prop_rub_planks_01"]),
      bone: 28422,
      position: Object.freeze([0, -0.08, -0.12]),
      rotation: Object.freeze([0, 90, 90]),
      groundOffset: 0.08,
    }),
  }),
});

module.exports = Object.freeze({
  contractVersion: 1,
  interactionRadius: 2.6,
  eventCooldownMs: 500,
  sampleIntervalMs: 500,
  maximumQueuedOperations: 12,
  antiCheat: Object.freeze({
    maximumFootSpeedMps: 6,
    movementBurstM: 9,
    minimumTravelSpeedMps: 3,
    minimumTravelFloorMs: 3000,
    minimumVerifiedRouteRatio: 0.6,
  }),
  animation: Object.freeze({ dictionary: "anim@heists@box_carry@", name: "idle", flags: 49 }),
  uniform: SHARED_UNIFORM,
  sites: SITES,
  jobIds: Object.freeze(Object.values(SITES).map((site) => site.jobId)),
});
