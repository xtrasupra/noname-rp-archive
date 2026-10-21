"use strict";

const CONTRACT_VERSION = 1;

const COLORS = Object.freeze([
  Object.freeze({ id: 0, name: "Black", hex: "#111318" }),
  Object.freeze({ id: 111, name: "White", hex: "#F4F5F7" }),
  Object.freeze({ id: 27, name: "Red", hex: "#B51F2E" }),
  Object.freeze({ id: 64, name: "Blue", hex: "#234F9B" }),
  Object.freeze({ id: 92, name: "Silver", hex: "#8A9099" }),
]);

function vehicle(id, model, name, className, price, requiredLicenseId = "vehicle_b") {
  return Object.freeze({
    id,
    model,
    name,
    className,
    price,
    requiredLicenseId,
    colors: COLORS,
    enabled: true,
  });
}

module.exports = Object.freeze({
  contractVersion: CONTRACT_VERSION,
  sessionTimeoutMs: 10 * 60 * 1000,
  mutationCooldownMs: 150,
  maxOwnedVehicles: 8,
  previewDimensionBase: 62000,
  point: Object.freeze({
    position: Object.freeze({ x: -56.72, y: -1096.63, z: 26.42 }),
    radius: 2.2,
    dimension: 0,
    marker: Object.freeze({
      type: 1,
      scale: 1.5,
      zOffset: -1.0,
      color: Object.freeze([195, 72, 255, 180]),
    }),
    blip: Object.freeze({
      sprite: 225,
      color: 3,
      scale: 0.8,
      name: "Автосалон",
      shortRange: true,
    }),
  }),
  showroom: Object.freeze({
    interiorIpl: "imp_impexp_interior_placement_interior_1_impexp_intwaremed_milo_",
    position: Object.freeze({ x: 994.5925, y: -3002.594, z: -39.64699 }),
    playerPosition: Object.freeze({ x: 1003.5, y: -3002.594, z: -39.64699 }),
    heading: 90,
    camera: Object.freeze({
      target: Object.freeze({ x: 994.5925, y: -3002.594, z: -38.85 }),
      radius: 7.2,
      height: 2.15,
      angle: 25,
      fov: 42,
    }),
  }),
  delivery: Object.freeze({
    position: Object.freeze({ x: -31.42, y: -1090.87, z: 26.42 }),
    heading: 340,
    dimension: 0,
  }),
  vehicles: Object.freeze([
    vehicle("blista", "blista", "Dinka Blista", "Compact", 8500),
    vehicle("sentinel", "sentinel", "Übermacht Sentinel", "Coupe", 28000),
    vehicle("sultan", "sultan", "Karin Sultan", "Sport", 42000),
    vehicle("buffalo", "buffalo", "Bravado Buffalo", "Sport", 51000),
    vehicle("baller", "baller", "Gallivanter Baller", "SUV", 69000),
    vehicle("dominator", "dominator", "Vapid Dominator", "Muscle", 76000),
    vehicle("schafter2", "schafter2", "Benefactor Schafter", "Sedan", 82000),
    vehicle("comet2", "comet2", "Pfister Comet", "Sport", 145000),
  ]),
});
