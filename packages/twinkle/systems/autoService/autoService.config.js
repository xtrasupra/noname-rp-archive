"use strict";

const AUTO_SERVICE = Object.freeze({
  contractVersion: 1,
  npcId: "vehicle_service_attendant",
  fee: 200,
  sessionLifetimeMs: 2 * 60 * 1000,
  interactionRange: 6.5,
  clearSpawnRadius: 4.5,
  npc: Object.freeze({
    name: "Marcus Reed",
    profession: "Сотрудник автосервиса",
    model: "s_m_m_autoshop_02",
    scenario: "WORLD_HUMAN_CLIPBOARD",
    position: Object.freeze({ x: -356.35, y: -128.32, z: 39.43 }),
    heading: 72.0,
    blip: Object.freeze({ sprite: 357, color: 3, scale: 0.75, name: "Автосервис" }),
  }),
  spawn: Object.freeze({
    position: Object.freeze({ x: -371.16, y: -120.92, z: 38.68 }),
    heading: 71.0,
    dimension: 0,
  }),
});

module.exports = AUTO_SERVICE;
