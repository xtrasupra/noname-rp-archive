"use strict";

const INTERACT_KEY = 0x45; // E
const EXIT_DISTANCE = 3.5;

let nearbyCondo = null;
let insideCondo = null;
let exitMarker = null;

const bindKey = global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback));

function parseJson(value, fallback = null) {
    try {
        if (value == null) return fallback;
        if (typeof value === "object") return value;
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function notifySafe(message, variant = "info") {
    try {
        if (global.interfaceLock?.notify) {
            global.interfaceLock.notify(String(message), String(variant));
            return;
        }
    } catch {}

    try {
        mp.gui.chat.push(`[Apartments] ${String(message)}`);
    } catch {}
}

function distance(left, right) {
    if (!left || !right) return Number.POSITIVE_INFINITY;
    const dx = Number(left.x || 0) - Number(right.x || 0);
    const dy = Number(left.y || 0) - Number(right.y || 0);
    const dz = Number(left.z || 0) - Number(right.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function destroyExitMarker() {
    if (!exitMarker) return;

    try { exitMarker.destroy(); } catch {}
    exitMarker = null;
}

function setInsideCondo(payload) {
    insideCondo = payload;
    destroyExitMarker();

    if (!payload?.exit) return;

    try {
        exitMarker = mp.markers.new(
            1,
            new mp.Vector3(
                Number(payload.exit.x || 0),
                Number(payload.exit.y || 0),
                Number(payload.exit.z || 0)
            ),
            0.55,
            {
                color: [189, 255, 105, 120],
                dimension: mp.players.local.dimension,
                visible: true,
            }
        );
    } catch {}
}

function interact() {
    try {
        if (global.interfaceLock?.isInputBlocked?.()) return;
    } catch {}

    if (insideCondo?.exit) {
        if (distance(mp.players.local.position, insideCondo.exit) > EXIT_DISTANCE) return;

        try { mp.events.callRemote("s:condos:exit"); } catch {}
        return;
    }

    if (!nearbyCondo?.id) return;
    try { mp.events.callRemote("s:condos:interact", Number(nearbyCondo.id)); } catch {}
}

bindKey(INTERACT_KEY, false, interact);

mp.events.add("c:condos:nearby", (payloadJson = "null") => {
    nearbyCondo = parseJson(payloadJson, null);

    if (!nearbyCondo) return;

    const state = nearbyCondo.owned
        ? (nearbyCondo.locked ? "закрыта" : "открыта")
        : `свободна, цена $${Number(nearbyCondo.price || 0).toLocaleString("en-US")}`;

    notifySafe(`Квартира #${nearbyCondo.number}: ${state}. Нажмите E.`, "info");
});

mp.events.add("c:condos:offer", (payloadJson = "{}") => {
    const condo = parseJson(payloadJson, {});
    notifySafe(
        `Квартира #${condo.number} продаётся за $${Number(condo.price || 0).toLocaleString("en-US")}. Нажмите E ещё раз для покупки или используйте /buycondo.`,
        "info"
    );
});

mp.events.add("c:condos:entered", (payloadJson = "{}") => {
    nearbyCondo = null;
    setInsideCondo(parseJson(payloadJson, null));
});

mp.events.add("c:condos:left", () => {
    insideCondo = null;
    destroyExitMarker();
});

mp.events.add("c:condos:route", (x, y) => {
    try {
        mp.game.ui.setNewWaypoint(Number(x), Number(y));
    } catch {}
});

mp.events.add("c:condos:notify", (message, variant = "info") => {
    notifySafe(message || "Операция с квартирой выполнена.", variant);
});

mp.events.add("tablet:apartmentLockToggleFromBrowser", (apartmentId, targetLocked) => {
    try {
        mp.events.callRemote("s:condos:setLock", Number(apartmentId), Boolean(targetLocked));
    } catch {}
});

mp.events.add("tablet:apartmentRouteFromBrowser", (apartmentId) => {
    try { mp.events.callRemote("s:condos:route", Number(apartmentId)); } catch {}
});

mp.events.add("tablet:apartmentActionFromBrowser", (apartmentId, action, payload = null) => {
    const id = Number(apartmentId);
    const actionName = String(action || "");

    try {
        if (actionName === "enter") {
            mp.events.callRemote("s:condos:enter", id);
            return;
        }

        if (actionName === "sell") {
            mp.events.callRemote("s:condos:sell", id);
            return;
        }

        if (actionName === "furniture:editor") {
            if (global.interfaceLock?.closePage) {
                global.interfaceLock.closePage("tablet");
            } else {
                mp.events.call("client:interface:close", "tablet");
            }
            mp.events.callRemote("s:objectEditor:requestMenu", JSON.stringify({
                propertyKind: "apartment",
                propertyId: id,
            }));
            return;
        }

        const furnitureEvents = {
            "furniture:install": "s:objectEditor:buy",
            "furniture:move": "s:objectEditor:move",
            "furniture:remove": "s:objectEditor:delete",
        };
        const furnitureEvent = furnitureEvents[actionName];

        if (furnitureEvent) {
            const actionPayload = parseJson(payload, {});

            // World placement must not start behind the tablet interface.
            if (actionName !== "furniture:remove") {
                try {
                    if (global.interfaceLock?.closePage) {
                        global.interfaceLock.closePage("tablet");
                    } else {
                        mp.events.call("client:interface:close", "tablet");
                    }
                } catch {}
            }

            mp.events.callRemote(furnitureEvent, JSON.stringify({
                ...actionPayload,
                propertyKind: "apartment",
                propertyId: id,
            }));
            return;
        }

        notifySafe("Это действие для квартиры пока недоступно.", "warning");
    } catch {}
});

console.log("[CONDOS] Client loaded");
