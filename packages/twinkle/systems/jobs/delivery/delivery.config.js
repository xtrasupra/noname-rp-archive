"use strict";

module.exports = {
  npc: {
    id: "delivery_dispatcher",
    name: "Daniel Brooks",
    profession: "Менеджер доставки",
    model: "s_m_m_ups_01",
    position: new mp.Vector3(78.98, 111.85, 81.17),
    heading: 160.0,
    colshapeRadius: 5,
    scenario: "WORLD_HUMAN_CLIPBOARD",
  },

  blip: {
    sprite: 478,
    color: 5,
    scale: 0.85,
    name: "Работа доставщика",
  },

  loadingPoint: {
    position: new mp.Vector3(72.83, 117.38, 79.09),
    radius: 5,
  },

  vehicles: [
    {
      id: "boxville",
      name: "Boxville",
      model: "boxville2",
      rentPrice: 350,
      minLevel: 1,
    },
    {
      id: "speedo",
      name: "Speedo",
      model: "speedo",
      rentPrice: 500,
      minLevel: 2,
    },
  ],

  route: {
    minStops: 1,
    maxStops: 1,
    payPerKm: 180,
    minPayPerStop: 250,
    maxDistanceFromWarehouse: 8000,
    // When allowlist is not empty, only its IDs can be selected. The deny
    // controls are applied afterwards and are useful for temporarily
    // disabling individual entrances without changing delivery code.
    allowedHouseIds: [],
    excludedHouseIds: [],
    excludedHouseIdRanges: [
      // Cayo Perico houses are not reachable by mainland delivery vehicles.
      { min: 846, max: 925 },
    ],
  },
};
