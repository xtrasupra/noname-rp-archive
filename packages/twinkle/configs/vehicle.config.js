"use strict";

const FUEL_TYPES = {
  petrol_92: {
    name: "АИ-92",
    price: 4,
    color: "#8aff8a",
  },

  petrol_95: {
    name: "АИ-95",
    price: 5,
    color: "#66ccff",
  },

  petrol_98: {
    name: "АИ-98",
    price: 7,
    color: "#ffcc66",
  },

  diesel: {
    name: "Дизель",
    price: 6,
    color: "#ffd966",
  },

  electro: {
    name: "Электро",
    price: 2,
    color: "#b388ff",
  },
};

const DEFAULT_VEHICLE_CONFIG = {
  trunk: {
    slots: 20,
    maxWeight: 50,
  },

  fuel: {
    type: "petrol_95",
    max: 60,
    start: 30,
    consumption: 1.0,
  },
};

const VEHICLE_CONFIG = {
  sultan: {
    trunk: {
      slots: 30,
      maxWeight: 80,
    },

    fuel: {
      type: "petrol_95",
      max: 65,
      start: 45,
      consumption: 1.2,
    },
  },

  adder: {
    trunk: {
      slots: 10,
      maxWeight: 20,
    },

    fuel: {
      type: "petrol_98",
      max: 90,
      start: 70,
      consumption: 2.0,
    },
  },

  phantom: {
    trunk: {
      slots: 100,
      maxWeight: 800,
    },

    fuel: {
      type: "diesel",
      max: 180,
      start: 140,
      consumption: 2.8,
    },
  },

  neon: {
    fuel: {
      type: "electro",
      max: 100,
      start: 100,
      consumption: 0.4,
    },
  },
};

function mergeVehicleConfig(config = {}) {
  return {
    trunk: {
      ...DEFAULT_VEHICLE_CONFIG.trunk,
      ...(config.trunk || {}),
    },

    fuel: {
      ...DEFAULT_VEHICLE_CONFIG.fuel,
      ...(config.fuel || {}),
    },
  };
}

function getVehicleConfig(modelName) {
  const key = String(modelName || "").toLowerCase();

  return mergeVehicleConfig(
    VEHICLE_CONFIG[key]
  );
}

module.exports = {
  FUEL_TYPES,
  VEHICLE_CONFIG,
  DEFAULT_VEHICLE_CONFIG,
  getVehicleConfig,
};