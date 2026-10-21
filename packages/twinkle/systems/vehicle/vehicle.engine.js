"use strict";

/*
 * Compatibility facade for systems that historically imported vehicle.engine.js.
 * vehicle.control.js is the single owner of engine, lock and fuel state/events.
 * Keeping a facade avoids duplicate RAGE:MP handlers and fuel timers.
 */
module.exports = require("./vehicle.control.js");

console.log("[VEHICLE ENGINE/LOCK/FUEL] Compatibility facade loaded");
