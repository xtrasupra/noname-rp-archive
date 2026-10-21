"use strict";

const bindKey = global.bindKey || ((key, hold, cb) => mp.keys.bind(key, hold, cb));

const ENGINE_KEY = 0x55; // U
const LOCK_KEY = 0x4C; // L
const FORWARD_KEY = 0x57; // W
const REVERSE_KEY = 0x53; // S

let vehicleHudInterval = null;
let lastInVehicle = false;
let lastEnginePress = 0;
let lastLockPress = 0;
let lastVehicleHudSignature = "";
let lastVehicleHudPushAt = 0;
let serverFuelOverride = null;

const VEHICLE_HUD_INTERVAL_MS = 150;
const VEHICLE_HUD_MIN_PUSH_MS = 90;

let currentVehicleSeat = null;

function notify(message) {
    try {
        const text = String(message || '').trim();
        if (!text) return;

        if (global.interfaceLock?.notify) {
            global.interfaceLock.notify(text, 'info', 3500);
            return;
        }

        if (global.ui?.notify) {
            global.ui.notify(text, 'info', 3500);
            return;
        }

        mp.game.graphics.notify(text);
    } catch {}
}

function execHud(code) {
    try {
        if (global.uiBrowser?.execute) {
            global.uiBrowser.execute(code);
            return;
        }

        if (globalThis.twinkleBrowser?.browser?.execute) {
            globalThis.twinkleBrowser.browser.execute(code);
            return;
        }

        if (globalThis.twinkleBrowser?.cef?.execute) {
            globalThis.twinkleBrowser.cef.execute(code);
            return;
        }

        if (globalThis.browser?.execute) {
            globalThis.browser.execute(code);
            return;
        }

        if (mp.browsers?.forEach) {
            mp.browsers.forEach((browser) => {
                if (browser?.execute) browser.execute(code);
            });
        }
    } catch (e) {
        console.log("[VEHICLE HUD] exec error:", e);
    }
}

function getLocalVehicle() {
    try {
        return mp.players.local.vehicle || null;
    } catch {
        return null;
    }
}

function isLocalPlayerDriver() {
    return Number(currentVehicleSeat) === -1 || Number(currentVehicleSeat) === 0;
}

function getVehicleHudSignature(vehicleState) {
    return JSON.stringify({
        inVehicle: Boolean(vehicleState.inVehicle),
        isDriver: Boolean(vehicleState.isDriver),
        speed: Math.round(Number(vehicleState.speed || 0)),
        maxSpeed: Math.round(Number(vehicleState.maxSpeed || 240)),
        fuel: Math.round(Number(vehicleState.fuel || 0)),
        fuelMax: Math.round(Number(vehicleState.fuelMax || 100)),
        engineHealth: Math.round(Number(vehicleState.engineHealth || 100)),
        mileage: Math.floor(Number(vehicleState.mileage || 0)),
        gear: String(vehicleState.gear ?? '1'),
        doorsLocked: Boolean(vehicleState.doorsLocked),
        engineOn: Boolean(vehicleState.engineOn),
        seatbeltOn: Boolean(vehicleState.seatbeltOn),
        lightsOn: Boolean(vehicleState.lightsOn),
    });
}

function sendVehicleHud(payload, options = {}) {
    const vehicleState = payload?.vehicle || {};
    const signature = getVehicleHudSignature(vehicleState);
    const now = Date.now();

    if (!options.force) {
        if (signature === lastVehicleHudSignature && now - lastVehicleHudPushAt < 500) return;
        if (now - lastVehicleHudPushAt < VEHICLE_HUD_MIN_PUSH_MS) return;
    }

    lastVehicleHudSignature = signature;
    lastVehicleHudPushAt = now;

    if (global.uiState?.patch) {
        global.uiState.patch("vehicle", vehicleState, {
            eventName: "twinkle:vehicle:update",
            globalName: "__TWINKLE_VEHICLE_PAYLOAD__",
            retryKey: "vehicle:payload",
            push: false,
        });

        global.uiState.patch("hud", payload, {
            eventName: "twinkle:hud:update",
            globalName: "__TWINKLE_HUD_PAYLOAD__",
            retryKey: "hud:payload",
            push: false,
        });
    }

    const vehicleJson = JSON.stringify(vehicleState);
    const hudJson = JSON.stringify(payload);

    execHud(`
        try {
            const vehicleState = ${vehicleJson};
            const hudPayload = ${hudJson};
            const browser = window.twinkleBrowser;

            browser?.state?.patchVehicle?.(vehicleState);
            browser?.patchVehicle?.(vehicleState);

            window.dispatchEvent(new CustomEvent("twinkle:hud:update", {
                detail: hudPayload
            }));

            window.dispatchEvent(new CustomEvent("twinkle:vehicle:update", {
                detail: vehicleState
            }));

            if (window.TWINKLE_HUD) {
                window.TWINKLE_HUD.update?.(hudPayload);
                window.TWINKLE_HUD.setPayload?.(hudPayload);
            }
        } catch (e) {
            console.log("[VEHICLE HUD CEF] update error", e);
        }
    `);
}

function hideVehicleHud() {
    lastInVehicle = false;

    sendVehicleHud({
        vehicle: {
            inVehicle: false,
            isDriver: false,
            speed: 0,
            maxSpeed: 240,
            fuel: 0,
            fuelMax: 100,
            engineHealth: 0,
            mileage: 0,
            gear: 'N',
            doorsLocked: false,
            engineOn: false,
            seatbeltOn: false,
            lightsOn: false,
        },
    }, { force: true });
}

function getVehicleSpeed(vehicle) {
    try {
        return vehicle.getSpeed() * 3.6;
    } catch {
        return 0;
    }
}

function getVehicleGear() {
    try {
        const forwardPressed = mp.keys.isDown(FORWARD_KEY);
        const reversePressed = mp.keys.isDown(REVERSE_KEY);

        if (forwardPressed && !reversePressed) return 'D';
        if (reversePressed && !forwardPressed) return 'R';
    } catch {}
    return 'N';
}

function getVehicleEngineHealth(vehicle) {
    try {
        const health = vehicle.getEngineHealth();
        return Math.max(0, Math.min(100, health / 10));
    } catch {
        return 100;
    }
}

function getVehicleFuel(vehicle) {
    if (
        serverFuelOverride &&
        Number(serverFuelOverride.vehicleRemoteId) === Number(vehicle?.remoteId) &&
        Date.now() - Number(serverFuelOverride.receivedAt || 0) < 1500
    ) {
        return Math.max(0, Math.min(getVehicleFuelMax(vehicle), Number(serverFuelOverride.value || 0)));
    }

    try {
        const fuel = vehicle.getVariable("fuel");
        if (fuel !== undefined && fuel !== null) {
            return Math.max(0, Math.min(getVehicleFuelMax(vehicle), Number(fuel)));
        }
    } catch {}

    try {
        if (vehicle.fuel !== undefined) {
            return Math.max(0, Math.min(100, Number(vehicle.fuel)));
        }
    } catch {}

    return 100;
}

function getVehicleFuelMax(vehicle) {
    try {
        const fuelMax = Number(vehicle.getVariable("fuelMax"));
        if (Number.isFinite(fuelMax) && fuelMax > 0) return fuelMax;
    } catch {}
    return 100;
}

function getVehicleMileage(vehicle) {
    try {
        const mileage = vehicle.getVariable("mileage");
        if (mileage !== undefined && mileage !== null) {
            return Math.max(0, Number(mileage));
        }
    } catch {}
    return 0;
}

function getVehicleMaxSpeed(vehicle) {
    try {
        const maxSpeed = vehicle.getVariable("maxSpeed");
        if (maxSpeed !== undefined && maxSpeed !== null) {
            return Math.max(1, Number(maxSpeed));
        }
    } catch {}

    try {
        const nativeMaxSpeed = Number(mp.game.vehicle.getVehicleModelMaxSpeed(vehicle.model)) * 3.6;
        if (Number.isFinite(nativeMaxSpeed) && nativeMaxSpeed > 0) return nativeMaxSpeed;
    } catch {}
    return 240;
}

function isVehicleEngineOn(vehicle) {
    try {
        const engine = vehicle.getVariable("engine");
        if (engine !== undefined && engine !== null) {
            return Boolean(engine);
        }
    } catch {}

    try {
        return Boolean(vehicle.getIsEngineRunning());
    } catch {}

    return false;
}

function isVehicleLocked(vehicle) {
    try {
        const locked = vehicle.getVariable("locked");
        if (locked !== undefined && locked !== null) {
            return Boolean(locked);
        }
    } catch {}

    try {
        return Number(vehicle.getDoorLockStatus()) > 1;
    } catch {}

    return false;
}

function isVehicleLightsOn(vehicle) {
    try {
        const lights = vehicle.getVariable("lights");
        if (lights !== undefined && lights !== null) {
            return Boolean(lights);
        }
    } catch {}

    try {
        let [, lightsOn, highbeamsOn] = vehicle.getLightsState();
        return Boolean(lightsOn || highbeamsOn);
    } catch {}

    return false;
}

function isSeatbeltOn() {
    try {
        return Boolean(global.seatbeltOn || globalThis.seatbeltOn || mp.players.local.getVariable("seatbelt"));
    } catch {
        return false;
    }
}

function applyEngineStateToVehicle(vehicle, state) {
    if (!vehicle) return;

    const enabled = Boolean(state);
    const fuel = getVehicleFuel(vehicle);
    const canDrive = enabled && fuel > 0;

    try {
        vehicle.setEngineOn(canDrive, true, true);
    } catch {}

    try {
        vehicle.setUndriveable(!canDrive);
    } catch {}
}

function applyLockStateToVehicle(vehicle, state) {
    if (!vehicle) return;

    const locked = Boolean(state);

    try {
        vehicle.setDoorsLocked(locked ? 2 : 1);
    } catch {}
}

function updateVehicleHud() {
    const vehicle = getLocalVehicle();

    if (!vehicle) {
        if (lastInVehicle) {
            hideVehicleHud();
        }
        return;
    }

    if (!isLocalPlayerDriver()) {
        hideVehicleHud();
        return;
    }

    lastInVehicle = true;

    const fuel = getVehicleFuel(vehicle);
    const engineOn = isVehicleEngineOn(vehicle);

    applyEngineStateToVehicle(vehicle, engineOn);

    sendVehicleHud({
        vehicle: {
            inVehicle: true,
            isDriver: true,
            speed: getVehicleSpeed(vehicle),
            maxSpeed: getVehicleMaxSpeed(vehicle),
            fuel,
            fuelMax: getVehicleFuelMax(vehicle),
            engineHealth: getVehicleEngineHealth(vehicle),
            mileage: getVehicleMileage(vehicle),
            gear: getVehicleGear(),
            doorsLocked: isVehicleLocked(vehicle),
            engineOn: engineOn && fuel > 0,
            seatbeltOn: isSeatbeltOn(),
            lightsOn: isVehicleLightsOn(vehicle),
        },
    });
}

function requestEngineToggle() {
    const now = Date.now();
    if (now - lastEnginePress < 700) {
        console.log("[VEHICLE ENGINE CLIENT] U ignored: debounce.");
        return;
    }
    lastEnginePress = now;

    const vehicle = getLocalVehicle();
    if (!vehicle) {
        console.log("[VEHICLE ENGINE CLIENT] U denied: local player has no vehicle.");
        return;
    }
    try {
        console.log(`[VEHICLE ENGINE CLIENT] Sending toggle: remoteId=${vehicle.remoteId}, seat=${currentVehicleSeat}.`);
        mp.events.callRemote("s:vehicle:engine:toggle");
    } catch (error) {
        console.log("[VEHICLE ENGINE CLIENT] Remote call failed:", error);
    }
}
function requestLockToggle() {
    const now = Date.now();
    if (now - lastLockPress < 700) return;
    lastLockPress = now;

    try {
        mp.events.callRemote("s:vehicle:lock:toggle");
    } catch {}
}

function startVehicleHud() {
    if (vehicleHudInterval) return;
    vehicleHudInterval = setInterval(updateVehicleHud, VEHICLE_HUD_INTERVAL_MS);
}

function stopVehicleHud() {
    if (!vehicleHudInterval) return;
    clearInterval(vehicleHudInterval);
    vehicleHudInterval = null;
}

bindKey(ENGINE_KEY, false, () => {
    requestEngineToggle();
}, {
    allowWhenBlocked: false,
    closeChatBefore: false,
});

bindKey(LOCK_KEY, false, () => {
    requestLockToggle();
}, {
    allowWhenBlocked: false,
    closeChatBefore: false,
});

mp.events.add("c:vehicle:engine:set", (state, isDriverState) => {
    const vehicle = getLocalVehicle();
    if (!vehicle) return;

    if (isDriverState === true) currentVehicleSeat = 0;
    else if (isDriverState === false) currentVehicleSeat = null;

    applyEngineStateToVehicle(vehicle, state);
    if (isLocalPlayerDriver()) updateVehicleHud();
    else hideVehicleHud();
});

mp.events.add("c:vehicle:lock:set", (vehicleRemoteId, state) => {
    try {
        const vehicle = mp.vehicles.atRemoteId(Number(vehicleRemoteId));
        if (!vehicle) return;

        applyLockStateToVehicle(vehicle, state);
        updateVehicleHud();
    } catch {}
});

mp.events.add("c:vehicle:fuel:set", (vehicleRemoteId, value) => {
    const vehicle = getLocalVehicle();
    if (!vehicle || !isLocalPlayerDriver()) return;
    if (Number(vehicle.remoteId) !== Number(vehicleRemoteId)) return;

    serverFuelOverride = {
        vehicleRemoteId: Number(vehicleRemoteId),
        value: Number(value || 0),
        receivedAt: Date.now(),
    };
    updateVehicleHud();
});

mp.events.add("playerEnterVehicle", (vehicle, seat) => {
    currentVehicleSeat = Number(seat);

    if (!isLocalPlayerDriver()) {
        hideVehicleHud();
        return;
    }

    setTimeout(updateVehicleHud, 50);
    setTimeout(updateVehicleHud, 150);
    setTimeout(updateVehicleHud, 500);
    notify("U — запустить/заглушить двигатель, L — открыть/закрыть автомобиль.");
});

mp.events.add("playerLeaveVehicle", () => {
    currentVehicleSeat = null;
    serverFuelOverride = null;
    hideVehicleHud();

    setTimeout(() => {
        if (!getLocalVehicle()) {
            hideVehicleHud();
        }
    }, 250);
});

mp.events.add("playerReady", () => {
    // Server state is authoritative; GTA must not auto-start or auto-stop the
    // engine when the player enters/leaves a vehicle.
    try {
        mp.game.vehicle.defaultEngineBehaviour = false;
        mp.players.local.setConfigFlag(429, true);
    } catch (error) {
        mp.console.logError(`[VEHICLE ENGINE CLIENT] Failed to disable default engine behaviour: ${error.message}`);
    }
    startVehicleHud();
});

mp.events.add("render", () => {
    if (!vehicleHudInterval) {
        startVehicleHud();
    }
});

mp.events.add("vehicleHud:forceUpdate", () => {
    updateVehicleHud();
});

mp.events.add("vehicleHud:hide", () => {
    hideVehicleHud();
});

mp.events.add("vehicle:notify", (payloadJson = "{}") => {
    try {
        const payload = JSON.parse(String(payloadJson || "{}"));
        const message = String(payload?.message || "").trim();
        const type = String(payload?.type || "info").toLowerCase();
        if (!message) return;

        if (global.interfaceLock?.notify) {
            global.interfaceLock.notify(message, type, 3500);
            return;
        }

        if (global.ui?.notify) {
            global.ui.notify(message, type, 3500);
            return;
        }

        notify(message);
    } catch {}
});

startVehicleHud();

console.log("[VEHICLE HUD/CONTROLS] Loaded. Engine: U / Lock: L");
