"use strict";

const RADIAL_MENU_KEY = 0x47; // G
const PAGE_NAME = "radialMenu";
const REQUEST_TIMEOUT_MS = 4000;
const TARGET_CONTRACT_VERSION = 1;
const TARGET_RAYCAST_RANGE = 5;
const VEHICLE_FOCUS_SCREEN_RADIUS = 0.32;
const RAYCAST_FLAGS = 31; // map + vehicles + peds + objects
const VEHICLE_DOOR_STATE_KEY = "twinkleRadialDoorStates";
const VEHICLE_DOOR_MIN_INDEX = 0;
const VEHICLE_DOOR_MAX_INDEX = 5;

let radialMenuOpened = false;
let radialMenuLoading = false;
let radialMenuTimer = null;
let pendingPayload = null;
let lastToggleAt = 0;

const bindKey = global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback));

function parseJson(value, fallback = {}) {
    try {
        if (!value) return fallback;
        if (typeof value === "object") return value;
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function logInfo(message) {
    try {
        if (mp.console?.logInfo) {
            mp.console.logInfo(message);
            return;
        }
    } catch {}

    try {
        console.log(message);
    } catch {}
}

function logError(message) {
    try {
        if (mp.console?.logError) {
            mp.console.logError(message);
            return;
        }
    } catch {}

    try {
        console.log(message);
    } catch {}
}

function isRadialMenuInputBlocked() {
    if (radialMenuOpened) return false;

    const interfaceState = global.interfaceLock?.getInterfaceState?.();
    if (interfaceState) {
        return Boolean(
            interfaceState.chatOpened ||
            interfaceState.activePage ||
            interfaceState.controlsBlocked ||
            interfaceState.interactionOwners?.length
        );
    }

    return Boolean(global.interfaceLock?.isInputBlocked?.());
}

function notifySafe(message, variant = "info") {
    try {
        if (global.interfaceLock?.notify) {
            global.interfaceLock.notify(message, variant);
            return;
        }

        if (typeof notify === "function") {
            notify(message, variant);
        }
    } catch {}
}

function rotationToDirection(rotation) {
    const pitch = Number(rotation?.x || 0) * Math.PI / 180;
    const yaw = Number(rotation?.z || 0) * Math.PI / 180;
    const horizontal = Math.abs(Math.cos(pitch));

    return {
        x: -Math.sin(yaw) * horizontal,
        y: Math.cos(yaw) * horizontal,
        z: Math.sin(pitch),
    };
}

function classifySharedEntity(entity) {
    const localPlayer = mp.players.local;
    const remoteId = Number(entity?.remoteId);
    const handle = Number(entity?.handle);

    if (!Number.isSafeInteger(remoteId) || remoteId < 0 || !Number.isFinite(handle)) return null;

    try {
        const player = mp.players.atRemoteId(remoteId);

        if (player && player !== localPlayer && Number(player.handle) === handle) {
            return { kind: "player", remoteId };
        }
    } catch {}

    try {
        const vehicle = mp.vehicles.atRemoteId(remoteId);

        if (vehicle && Number(vehicle.handle) === handle) {
            return { kind: "vehicle", remoteId };
        }
    } catch {}

    return null;
}

function getCurrentVehicleTarget() {
    try {
        const vehicle = mp.players.local.vehicle;
        const remoteId = Number(vehicle?.remoteId);

        if (vehicle && Number.isSafeInteger(remoteId) && remoteId >= 0) {
            return { kind: "vehicle", remoteId };
        }
    } catch {}

    return null;
}

function getEntityCoords(entity) {
    try {
        const position = entity?.getCoords?.(false);
        if (
            position &&
            Number.isFinite(Number(position.x)) &&
            Number.isFinite(Number(position.y)) &&
            Number.isFinite(Number(position.z))
        ) {
            return position;
        }
    } catch {}

    return null;
}

function getDistance(first, second) {
    if (!first || !second) return Number.POSITIVE_INFINITY;

    const x = Number(first.x) - Number(second.x);
    const y = Number(first.y) - Number(second.y);
    const z = Number(first.z) - Number(second.z);
    return Math.sqrt(x * x + y * y + z * z);
}

function getFocusedNearbyVehicleTarget() {
    const playerPosition = getEntityCoords(mp.players.local);
    if (!playerPosition) return null;

    let bestTarget = null;
    let bestScore = Number.POSITIVE_INFINITY;

    try {
        mp.vehicles.forEachInStreamRange((vehicle) => {
            const remoteId = Number(vehicle?.remoteId);
            const vehiclePosition = getEntityCoords(vehicle);
            const distance = getDistance(playerPosition, vehiclePosition);

            if (
                !Number.isSafeInteger(remoteId) ||
                remoteId < 0 ||
                !vehiclePosition ||
                distance > TARGET_RAYCAST_RANGE
            ) return;

            const screenPoint = mp.game.graphics.world3dToScreen2d(new mp.Vector3(
                Number(vehiclePosition.x),
                Number(vehiclePosition.y),
                Number(vehiclePosition.z) + 0.45
            ));
            if (!screenPoint) return;

            const screenX = Number(screenPoint.x) - 0.5;
            const screenY = Number(screenPoint.y) - 0.5;
            const screenDistance = Math.sqrt(screenX * screenX + screenY * screenY);
            if (!Number.isFinite(screenDistance) || screenDistance > VEHICLE_FOCUS_SCREEN_RADIUS) return;

            const cameraPosition = mp.game.cam.getGameplayCoord();
            const vehicleAimPoint = new mp.Vector3(
                Number(vehiclePosition.x),
                Number(vehiclePosition.y),
                Number(vehiclePosition.z) + 0.45
            );
            const visibilityHit = mp.raycasting.testPointToPoint(
                cameraPosition,
                vehicleAimPoint,
                mp.players.local,
                RAYCAST_FLAGS
            );
            const visibleTarget = classifySharedEntity(visibilityHit?.entity);
            if (visibleTarget?.kind !== "vehicle" || visibleTarget.remoteId !== remoteId) return;

            const score = screenDistance + distance * 0.015;
            if (score >= bestScore) return;

            bestScore = score;
            bestTarget = { kind: "vehicle", remoteId };
        });
    } catch (error) {
        logError(`[RADIAL MENU] vehicle focus scan error: ${error.message || error}`);
    }

    return bestTarget;
}

function buildTargetRequest() {
    let target = null;

    try {
        const cameraPosition = mp.game.cam.getGameplayCoord();
        const cameraRotation = mp.game.cam.getGameplayCamRot(2);
        const direction = rotationToDirection(cameraRotation);
        const endPosition = new mp.Vector3(
            cameraPosition.x + direction.x * TARGET_RAYCAST_RANGE,
            cameraPosition.y + direction.y * TARGET_RAYCAST_RANGE,
            cameraPosition.z + direction.z * TARGET_RAYCAST_RANGE
        );
        const hit = mp.raycasting.testPointToPoint(
            cameraPosition,
            endPosition,
            mp.players.local,
            RAYCAST_FLAGS
        );

        target = classifySharedEntity(hit?.entity);
    } catch (error) {
        logError(`[RADIAL MENU] target raycast error: ${error.message || error}`);
    }

    if (!target) target = getFocusedNearbyVehicleTarget();
    if (!target) target = getCurrentVehicleTarget();

    return {
        contractVersion: TARGET_CONTRACT_VERSION,
        target,
    };
}

function getUiBrowser() {
    return global.interfaceLock?.getUiBrowser?.()
        || global.uiBrowser
        || globalThis.twinkleBrowser?.browser
        || globalThis.twinkleBrowser?.cef
        || globalThis.browser
        || null;
}

function execCef(code) {
    try {
        const browser = getUiBrowser();

        if (browser?.execute) {
            browser.execute(code);
            return true;
        }
    } catch (e) {
        logError(`[RADIAL MENU] CEF exec error: ${e.message || e}`);
    }

    return false;
}

function clearRadialTimer() {
    if (!radialMenuTimer) return;

    clearTimeout(radialMenuTimer);
    radialMenuTimer = null;
}

function showCursor(state) {
    try {
        mp.gui.cursor.show(Boolean(state), Boolean(state));
    } catch {}
}

function sendPayloadToCef(open = false) {
    if (!pendingPayload) return;

    const json = JSON.stringify(pendingPayload);

    execCef(`
        try {
            const payload = ${json};
            window.__TWINKLE_RADIAL_MENU_PAYLOAD__ = payload;

            window.dispatchEvent(new CustomEvent("twinkle:radialMenu:update", {
                detail: payload
            }));

            if (window.TWINKLE_RADIAL_MENU) {
                if (${Boolean(open)} && typeof window.TWINKLE_RADIAL_MENU.open === "function") {
                    window.TWINKLE_RADIAL_MENU.open(payload);
                } else if (typeof window.TWINKLE_RADIAL_MENU.setPayload === "function") {
                    window.TWINKLE_RADIAL_MENU.setPayload(payload);
                }
            }
        } catch (e) {
            console.log("[RADIAL MENU PAYLOAD ERROR]", e);
        }
    `);
}

function openRadialMenu(payload = {}) {
    pendingPayload = parseJson(payload, {});
    radialMenuLoading = false;
    clearRadialTimer();

    // The UI state may change while the server is preparing the payload.
    // Discard a delayed response instead of opening over chat or another UI.
    if (isRadialMenuInputBlocked()) {
        pendingPayload = null;
        return false;
    }

    let opened = false;

    try {
        if (global.interfaceLock?.openPage) {
            opened = global.interfaceLock.openPage(PAGE_NAME, null, pendingPayload) === true;
        } else if (typeof openPage === "function") {
            opened = openPage(PAGE_NAME, null, pendingPayload) !== false;
        } else {
            execCef(`
                if (window.twinkleBrowser?.interfaces?.open) {
                    window.twinkleBrowser.interfaces.open(${JSON.stringify(PAGE_NAME)}, ${JSON.stringify(pendingPayload)});
                }
            `);
            opened = true;
        }
    } catch (e) {
        logError(`[RADIAL MENU] open error: ${e.message || e}`);
        pendingPayload = null;
        return false;
    }

    if (!opened) {
        pendingPayload = null;
        notifySafe("Сначала закройте текущий интерфейс.", "error");
        return false;
    }

    radialMenuOpened = true;

    showCursor(true);

    try {
        mp.gui.chat.activate(false);
    } catch {}

    setTimeout(() => sendPayloadToCef(true), 80);
    setTimeout(() => sendPayloadToCef(true), 220);
    setTimeout(() => sendPayloadToCef(true), 520);

    return true;
}

function resetRadialMenuState() {
    radialMenuLoading = false;
    radialMenuOpened = false;
    pendingPayload = null;
    clearRadialTimer();
}

function closeRadialMenu() {
    resetRadialMenuState();

    try {
        if (global.interfaceLock?.closePage) {
            global.interfaceLock.closePage(PAGE_NAME);
        } else if (typeof closePage === "function") {
            closePage(PAGE_NAME);
        }
    } catch (e) {
        logError(`[RADIAL MENU] close error: ${e.message || e}`);
    }

    execCef(`
        try {
            window.__TWINKLE_RADIAL_MENU_PAYLOAD__ = null;
            if (window.twinkleBrowser?.interfaces?.close) {
                window.twinkleBrowser.interfaces.close(${JSON.stringify(PAGE_NAME)});
            }
        } catch {}
    `);

}

function requestRadialMenuClose() {
    const closeRequested = execCef(`
        try {
            if (window.TWINKLE_RADIAL_MENU && typeof window.TWINKLE_RADIAL_MENU.close === "function") {
                window.TWINKLE_RADIAL_MENU.close();
            } else {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
            }
        } catch (e) {
            console.log("[RADIAL MENU CLOSE REQUEST ERROR]", e);
        }
    `);

    if (!closeRequested) {
        closeRadialMenu();
    }
}

function requestRadialMenu() {
    if (radialMenuLoading) return;

    if (isRadialMenuInputBlocked()) {
        notifySafe("Сначала закройте текущий интерфейс.", "error");
        return;
    }

    radialMenuLoading = true;
    clearRadialTimer();
    radialMenuTimer = setTimeout(() => {
        if (!radialMenuLoading) return;

        radialMenuLoading = false;
        notifySafe("Сервер не ответил на запрос радиального меню.", "error");
        logError("[RADIAL MENU] server request timeout");
    }, REQUEST_TIMEOUT_MS);

    try {
        mp.events.callRemote("s:radialMenu:request", JSON.stringify(buildTargetRequest()));
    } catch (e) {
        radialMenuLoading = false;
        clearRadialTimer();
        notifySafe("Не удалось открыть радиальное меню.", "error");
        logError(`[RADIAL MENU] request error: ${e.message || e}`);
    }
}

function toggleRadialMenu() {
    if (radialMenuOpened) {
        requestRadialMenuClose();
        return;
    }

    requestRadialMenu();
}

function handleToggleKey() {
    const now = Date.now();

    if (now - lastToggleAt < 220) {
        return;
    }

    if (isRadialMenuInputBlocked()) {
        notifySafe("Сначала закройте текущий интерфейс.", "error");
        return;
    }

    lastToggleAt = now;
    toggleRadialMenu();
}

function forwardAction(rawPayload = "{}") {
    const payload = parseJson(rawPayload, {});

    try {
        mp.events.callRemote("s:radialMenu:select", JSON.stringify(payload));
    } catch (e) {
        notifySafe("Не удалось выполнить действие радиального меню.", "error");
        logError(`[RADIAL MENU] action error: ${e.message || e}`);
    }
}

function isStreamedVehicle(entity) {
    const remoteId = Number(entity?.remoteId);
    if (!Number.isInteger(remoteId) || remoteId < 0 || !mp.vehicles?.atRemoteId) return false;

    try {
        const vehicle = mp.vehicles.atRemoteId(remoteId);
        return Boolean(vehicle && Number(vehicle.handle) === Number(entity.handle));
    } catch {
        return false;
    }
}

function parseVehicleDoorStates(rawValue) {
    const payload = parseJson(rawValue, null);
    if (!payload || Number(payload.version) !== 1 || typeof payload.states !== "object") return null;

    const states = [];
    for (const [rawDoorIndex, rawOpened] of Object.entries(payload.states)) {
        const doorIndex = Number(rawDoorIndex);
        if (!Number.isInteger(doorIndex) || doorIndex < VEHICLE_DOOR_MIN_INDEX || doorIndex > VEHICLE_DOOR_MAX_INDEX) {
            continue;
        }
        if (typeof rawOpened !== "boolean") continue;
        states.push([doorIndex, rawOpened]);
    }

    return states;
}

function applyVehicleDoorStates(vehicle, rawValue) {
    if (!isStreamedVehicle(vehicle)) return;
    const states = parseVehicleDoorStates(rawValue);
    if (!states) return;

    for (const [doorIndex, opened] of states) {
        try {
            if (opened && typeof vehicle.setDoorOpen === "function") {
                vehicle.setDoorOpen(doorIndex, false, false);
            } else if (!opened && typeof vehicle.setDoorShut === "function") {
                vehicle.setDoorShut(doorIndex, false);
            }
        } catch (e) {
            logError(`[RADIAL MENU] door state apply error: ${e.message || e}`);
        }
    }
}

bindKey(RADIAL_MENU_KEY, false, handleToggleKey, {
    allowWhenBlocked: true,
    closeChatBefore: false,
});

mp.events.add("c:radialMenu:open", (payloadJson = "{}") => {
    openRadialMenu(payloadJson);
});

mp.events.add("c:radialMenu:update", (payloadJson = "{}") => {
    pendingPayload = parseJson(payloadJson, pendingPayload || {});

    if (!radialMenuOpened) {
        openRadialMenu(pendingPayload);
        return;
    }

    sendPayloadToCef(false);
});

mp.events.add("c:radialMenu:close", () => {
    closeRadialMenu();
});

mp.events.add("c:radialMenu:error", (message) => {
    radialMenuLoading = false;
    clearRadialTimer();
    notifySafe(message || "Ошибка радиального меню.", "error");
});

mp.events.add("radialMenu:readyFromBrowser", () => {
    sendPayloadToCef(true);
});

mp.events.add("radialMenu:selectFromBrowser", (rawPayload = "{}") => {
    forwardAction(rawPayload);
});

mp.events.add("radialMenu:disabledFromBrowser", (message = "") => {
    notifySafe(String(message || "Пункт радиального меню сейчас недоступен."), "error");
});

mp.events.add("radialMenu:closeFromBrowser", () => {
    closeRadialMenu();
});

mp.events.add("interface:lock:closing", (page) => {
    if (page === PAGE_NAME || page === "*") {
        resetRadialMenuState();
    }
});

mp.events.add("c:radialMenu:debugOpen", (payloadJson = "{}") => {
    openRadialMenu(payloadJson);
});

mp.events.addDataHandler(VEHICLE_DOOR_STATE_KEY, (entity, value) => {
    applyVehicleDoorStates(entity, value);
});

mp.events.add("entityStreamIn", (entity) => {
    if (!isStreamedVehicle(entity) || typeof entity.getVariable !== "function") return;

    try {
        applyVehicleDoorStates(entity, entity.getVariable(VEHICLE_DOOR_STATE_KEY));
    } catch (e) {
        logError(`[RADIAL MENU] door state replay error: ${e.message || e}`);
    }
});

logInfo("[RADIAL MENU] Loaded");
