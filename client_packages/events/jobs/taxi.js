"use strict";

const bindKey = global.bindKey || ((key, hold, cb) => mp.keys.bind(key, hold, cb));

let taxiRouteBlip = null;
let activeTaxiOrder = null;
let completeCooldown = false;
let completeTimer = null;

function parseJson(value, fallback = {}) {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function notify(text) {
  try {
    mp.game.graphics.notify(String(text));
  } catch {}
}

function getWaypointPosition() {
  const blip = mp.game.ui.getFirstBlipInfoId(8);

  if (!mp.game.ui.doesBlipExist(blip)) {
    return null;
  }

  const coord = mp.game.ui.getBlipInfoIdCoord(blip);

  return {
    x: coord.x,
    y: coord.y,
    z: coord.z || 30,
  };
}

function clearTaxiRoute() {
  if (taxiRouteBlip) {
    try {
      taxiRouteBlip.setRoute(false);
    } catch {}

    try {
      taxiRouteBlip.destroy();
    } catch {}

    taxiRouteBlip = null;
  }

  activeTaxiOrder = null;
  completeCooldown = false;

  if (completeTimer) {
    clearTimeout(completeTimer);
    completeTimer = null;
  }
}

function setTaxiRoute(payload) {
  clearTaxiRoute();

  const destination = payload.destination;
  if (!destination) return;

  activeTaxiOrder = {
    passengerId: payload.passengerId,
    passengerName: payload.passengerName,
    price: payload.price,
    destination,
  };

  taxiRouteBlip = mp.blips.new(
    1,
    new mp.Vector3(
      Number(destination.x),
      Number(destination.y),
      Number(destination.z)
    ),
    {
      name: "Заказ такси",
      color: 5,
      scale: 1.0,
      shortRange: false,
    }
  );

  try {
    taxiRouteBlip.setRoute(true);
    taxiRouteBlip.setRouteColour(5);
  } catch {}

  notify("Маршрут клиента установлен.");
}

bindKey(0x4B, false, () => {
  const player = mp.players.local;

  if (!player.vehicle) return;

  const waypoint = getWaypointPosition();

  if (!waypoint) {
    notify("Поставьте метку на карте для поездки.");
    return;
  }

  mp.events.callRemote(
    "server:taxi:passengerWaypoint",
    JSON.stringify(waypoint)
  );
});

mp.events.add("client:taxi:setRoute", (payloadJson) => {
  const payload = parseJson(payloadJson);

  if (!payload.destination) return;

  setTaxiRoute(payload);
});

mp.events.add("taxi:setRoute", (payloadJson) => {
  const payload = parseJson(payloadJson);

  if (!payload.destination) return;

  setTaxiRoute(payload);
});

mp.events.add("client:taxi:clearRoute", () => {
  clearTaxiRoute();
});

mp.events.add("taxi:clearRoute", () => {
  clearTaxiRoute();
});

mp.events.add("playerQuit", () => {
  clearTaxiRoute();
});

mp.events.add("render", () => {
  if (!activeTaxiOrder || !activeTaxiOrder.destination) return;
  if (completeCooldown) return;

  const player = mp.players.local;

  if (!player.vehicle) return;

  const destination = activeTaxiOrder.destination;

  const distance = mp.game.system.vdist(
    player.position.x,
    player.position.y,
    player.position.z,
    Number(destination.x),
    Number(destination.y),
    Number(destination.z)
  );

  if (distance <= 8.0) {
    completeCooldown = true;

    mp.events.callRemote("server:taxi:completeRide");

    completeTimer = setTimeout(() => {
      completeCooldown = false;
      completeTimer = null;
    }, 3000);
  }
});

console.log("[TAXI] Client loaded. Passenger key: K");