"use strict";

let loadingPoint = null;
let loadingBlip = null;

let routeBlip = null;
let currentStop = null;
let completeCooldown = false;

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

function makeVector(pos) {
    return new mp.Vector3(
        Number(pos.x),
        Number(pos.y),
        Number(pos.z)
    );
}

function destroyBlip(blip) {
    try {
        if (blip) blip.destroy();
    } catch {}
}

function clearLoadingPoint() {
    destroyBlip(loadingBlip);
    loadingBlip = null;
    loadingPoint = null;
}

function clearRoute() {
    destroyBlip(routeBlip);
    routeBlip = null;
    currentStop = null;
    completeCooldown = false;
}

function setLoadingPoint(payload) {
    clearLoadingPoint();

    loadingPoint = {
        position: makeVector(payload.position),
        radius: Number(payload.radius || 5),
    };

    loadingBlip = mp.blips.new(
        478,
        loadingPoint.position,
        {
            name: "Точка загрузки доставки",
            color: 5,
            scale: 0.9,
            shortRange: false,
        }
    );

    loadingBlip.setRoute(true);
    loadingBlip.setRouteColour(5);

    notify("Точка загрузки отмечена на карте.");
}

function setStop(stop, index = 0, total = 1) {
    clearRoute();

    currentStop = {
        id: stop.id,
        x: Number(stop.x),
        y: Number(stop.y),
        z: Number(stop.z),
        index,
        total,
    };

    const pos = makeVector(currentStop);

    routeBlip = mp.blips.new(
        1,
        pos,
        {
            name: `Доставка ${index + 1}/${total}`,
            color: 5,
            scale: 1.0,
            shortRange: false,
        }
    );

    routeBlip.setRoute(true);
    routeBlip.setRouteColour(5);

    notify(`Точка доставки ${index + 1}/${total} отмечена на карте.`);
}

mp.events.add("client:delivery:setLoadingPoint", (payloadJson) => {
    const payload = parseJson(payloadJson);
    if (!payload.position) return;

    setLoadingPoint(payload);
});

mp.events.add("client:delivery:startRoute", (payloadJson) => {
    const payload = parseJson(payloadJson);
    const stops = payload.stops || [];

    if (!stops.length) return;

    clearLoadingPoint();
    setStop(stops[0], 0, stops.length);
});

mp.events.add("client:delivery:setNextStop", (payloadJson) => {
    const payload = parseJson(payloadJson);

    if (!payload.stop) return;

    setStop(
        payload.stop,
        Number(payload.currentIndex || 0),
        Number(payload.total || 1)
    );
});

mp.events.add("client:delivery:finishRoute", (payloadJson) => {
    const payload = parseJson(payloadJson);

    clearRoute();

    if (payload.loadingPoint) {
        setLoadingPoint(payload.loadingPoint);
    }

    notify("Маршрут завершён. Вернитесь на склад за новым заказом.");
});

mp.events.add("client:delivery:clearRoute", () => {
    clearRoute();
    clearLoadingPoint();
});

const bindKey = global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback));

bindKey(0x45, false, () => {
    const player = mp.players.local;

    if (loadingPoint) {
        const dist = mp.game.system.vdist(
            player.position.x,
            player.position.y,
            player.position.z,
            loadingPoint.position.x,
            loadingPoint.position.y,
            loadingPoint.position.z
        );

        if (dist <= loadingPoint.radius + 2.0) {
            mp.events.callRemote("server:delivery:loadRoute");
            return;
        }
    }

    if (currentStop) {
        const dist = mp.game.system.vdist(
            player.position.x,
            player.position.y,
            player.position.z,
            currentStop.x,
            currentStop.y,
            currentStop.z
        );

        if (dist <= 8.0 && !completeCooldown) {
            completeCooldown = true;

            mp.events.callRemote("server:delivery:completeStop");

            setTimeout(() => {
                completeCooldown = false;
            }, 3000);
        }
    }
});

mp.events.add("render", () => {
    if (!currentStop) return;
    if (completeCooldown) return;

    const player = mp.players.local;

    if (!player.vehicle) return;

    const dist = mp.game.system.vdist(
        player.position.x,
        player.position.y,
        player.position.z,
        currentStop.x,
        currentStop.y,
        currentStop.z
    );

    if (dist <= 8.0) {
        completeCooldown = true;

        mp.events.callRemote("server:delivery:completeStop");

        setTimeout(() => {
            completeCooldown = false;
        }, 3000);
    }
});

mp.events.add("playerQuit", () => {
    clearRoute();
    clearLoadingPoint();
});

console.log("[DELIVERY] Client loaded. E - load/unload");
