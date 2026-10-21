"use strict";

module.exports = {
  npc: {
    id: "taxi_dispatcher",
    name: "Роберт Миллер",
    profession: "Диспетчер такси",
    model: "s_m_m_gentransport",
    position: new mp.Vector3(895.4, -179.2, 74.7),
    heading: 238.0,
    colshapeRadius: 5,
    scenario: "WORLD_HUMAN_CLIPBOARD",
  },

  blip: {
    sprite: 198,
    color: 5,
    scale: 0.85,
    name: "Работа таксиста",
  },

  vehicles: [
    {
      id: "taxi",
      name: "Taxi",
      model: "taxi",
      rentPrice: 250,
      minLevel: 1,
    },
    {
      id: "stanier",
      name: "Stanier Taxi",
      model: "stanier",
      rentPrice: 500,
      minLevel: 3,
    },
  ],

  price: {
    base: 300,
    perKm: 120,
    min: 300,
    maxDistance: 15000,
  },
};