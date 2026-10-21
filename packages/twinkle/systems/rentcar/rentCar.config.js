"use strict";

const colors = [
  { colorId: 0, name: "Чёрный", color: "#0D1117" },
  { colorId: 111, name: "Белый", color: "#F5F5F7" },
  { colorId: 27, name: "Красный", color: "#C62828" },
];

const vehicleImageBaseUrl = "http://83.217.193.115:9001/renders/vehicles";

function rentalVehicle(id, model, name, price, imageFileName) {
  return {
    id,
    model,
    name,
    price,
    image: `${vehicleImageBaseUrl}/${imageFileName}`,
    colors: colors.map((color) => ({ ...color })),
  };
}

module.exports = {
  point: {
    position: { x: -1030.25, y: -2737.62, z: 20.17 },
    radius: 1.6,
    dimension: 0,
    marker: {
      type: 1,
      zOffset: -1.0,
      scale: 1.3,
      color: [70, 180, 255, 180],
    },
  },
  vehicleSpawn: {
    position: { x: -1029.35, y: -2732.45, z: 19.75 },
    heading: 327.0,
    dimension: 0,
    clearRadius: 3.5,
  },
  minHours: 1,
  maxHours: 8,
  vehicles: [
    rentalVehicle(1, "stryder", "Nagasaki Stryder", 450, "nagasaki_stryder.png"),
    rentalVehicle(2, "enduro", "Dinka Enduro", 300, "dinka_enduro.png"),
    rentalVehicle(3, "scorcher", "Scorcher", 100, "scorcher.png"),
    rentalVehicle(4, "bagger", "Western Bagger", 350, "western_bagger.png"),
    rentalVehicle(5, "faggio3", "Pegassi Faggio Sport", 250, "pegassi_faggio_sport.png"),
    rentalVehicle(6, "faggio2", "Pegassi Faggio Mod", 225, "pegassi_faggio_mod.png"),
    rentalVehicle(7, "cruiser", "Cruiser", 75, "cruiser.png"),
    rentalVehicle(8, "bmx", "BMX", 50, "bmx.png"),
  ],
};
