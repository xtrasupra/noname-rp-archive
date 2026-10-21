"use strict";

const db = require("../../database/query.js");
const tuningService = require("../lsc/tuning.service.js");
const vehicleCommands = require("./vehicle.commands.js");

async function loadPersistentVehicles() {
  try {
    await tuningService.ensureSchema();
    const rows = await db.query(`
      SELECT v.id, v.owner, v.model, v.pos_x, v.pos_y, v.pos_z, v.heading, v.dimension,
             v.fuel, v.mileage, v.locked, v.engine, v.health, v.plate, v.color1, v.color2, v.tuning_json,
             vc.display_name, vc.fuel_max, vc.fuel_consumption AS fuelConsumption
      FROM vehicles v
      LEFT JOIN vehicle_catalog vc ON vc.model COLLATE utf8mb4_unicode_ci = v.model COLLATE utf8mb4_unicode_ci
    `);
    let loaded = 0;
    for (const row of rows) {
      if (vehicleCommands.getSpawnedVehicle(row.id)) continue;
      vehicleCommands.createVehicleEntity(
        row,
        new mp.Vector3(Number(row.pos_x) || 0, Number(row.pos_y) || 0, Number(row.pos_z) || 0),
        Number(row.heading) || 0,
        Number(row.dimension) || 0
      );
      loaded += 1;
    }
    console.log(`[VEHICLE PERSISTENCE] Loaded: ${loaded}`);
  } catch (error) {
    console.error("[VEHICLE PERSISTENCE] Load failed:", error);
  }
}

setTimeout(loadPersistentVehicles, 0);

module.exports = { loadPersistentVehicles };