"use strict";

const db = require("../../database/query.js");

const {
    getAdminLevel,
    getPlayerUuid,
} = require("../../utils/player.js");

const FUEL_TICK_MS = 5_000;
const DATABASE_SYNC_MS = 30_000;

const LOCK_RANGE = 5;

const DEFAULT_FUEL_CONSUMPTION = 1;
const IDLE_FUEL_WASTE = 0.02;
const MOVE_FUEL_WASTE = 0.0008;

const dirtyVehicles = new Set();

async function query(sql, params = []) {
    if (!db || typeof db.query !== "function") {
        throw new Error(
            "database/query.js не экспортирует функцию query(sql, params)."
        );
    }

    const result = await db.query(sql, params);

    if (
        Array.isArray(result) &&
        result.length === 2 &&
        (
            Array.isArray(result[0]) ||
            typeof result[0] === "object"
        )
    ) {
        return result[0];
    }

    return result;
}

function positiveInt(value) {
    const number = Math.trunc(Number(value));

    if (!Number.isFinite(number) || number <= 0) {
        return null;
    }

    return number;
}

function toBoolean(value) {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        return value !== 0;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();

        if (
            normalized === "true" ||
            normalized === "1" ||
            normalized === "yes"
        ) {
            return true;
        }

        if (
            normalized === "false" ||
            normalized === "0" ||
            normalized === "no" ||
            normalized === ""
        ) {
            return false;
        }
    }

    return Boolean(value);
}

function clamp(value, minimum, maximum) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return minimum;
    }

    return Math.max(
        minimum,
        Math.min(maximum, number)
    );
}

function notify(player, message, color = "#66ccff") {
    if (!player || !mp.players.exists(player)) {
        return;
    }

    try {
        player.call("chat:client:add", [
            JSON.stringify({
                message: String(message),
                color,
            }),
        ]);

        return;
    } catch {}

    try {
        player.outputChatBox(
            `!{${color}}${String(message)}`
        );
    } catch {}
}

function notifyVehicle(player, message, type = "info") {
    if (!player || !mp.players.exists(player)) {
        return;
    }

    try {
        player.call("vehicle:notify", [
            JSON.stringify({
                message: String(message),
                type: String(type || "info"),
            }),
        ]);
        return;
    } catch {}

    const color =
        type === "error"
            ? "#ff6666"
            : type === "success"
                ? "#66cc66"
                : type === "warning"
                    ? "#ffcc66"
                    : "#66ccff";

    notify(player, message, color);
}

function getDistance(positionA, positionB) {
    if (!positionA || !positionB) {
        return Number.POSITIVE_INFINITY;
    }

    const dx =
        Number(positionA.x || 0) -
        Number(positionB.x || 0);

    const dy =
        Number(positionA.y || 0) -
        Number(positionB.y || 0);

    const dz =
        Number(positionA.z || 0) -
        Number(positionB.z || 0);

    return Math.sqrt(
        dx * dx +
        dy * dy +
        dz * dz
    );
}

function isDriver(player) {
    if (!player || !player.vehicle) {
        return false;
    }
    return (
        Number(player.seat) === 0 ||
        Number(player.seat) === -1
    );
}

function getVehicleDatabaseId(vehicle) {
    if (!vehicle) {
        return null;
    }

    const candidates = [
        vehicle.vehicleId,
        vehicle.vehicle_id,
        vehicle.sqlId,
        vehicle.sqlID,
        vehicle.dbId,
        vehicle.dbid,
        vehicle.databaseId,

        typeof vehicle.getVariable === "function"
            ? vehicle.getVariable("vehicleId")
            : null,

        typeof vehicle.getVariable === "function"
            ? vehicle.getVariable("vehicle_id")
            : null,

        typeof vehicle.getVariable === "function"
            ? vehicle.getVariable("sqlId")
            : null,

        typeof vehicle.getVariable === "function"
            ? vehicle.getVariable("dbId")
            : null,
    ];

    for (const candidate of candidates) {
        const vehicleId = positiveInt(candidate);

        if (vehicleId) {
            return vehicleId;
        }
    }

    return null;
}

function getVehicleOwnerType(vehicle) {
    if (!vehicle) {
        return "none";
    }

    try {
        const ownerType = String(
            vehicle.getVariable("ownerType") || ""
        )
            .trim()
            .toLowerCase();

        if (ownerType) {
            return ownerType;
        }
    } catch {}

    /*
     * Новая система /cargive и /carspawn устанавливает:
     *
     * vehicleId
     * ownerId
     * isPersonalVehicle
     *
     * Поэтому ownerType необязателен.
     */
    const vehicleId = getVehicleDatabaseId(vehicle);
    const ownerId = getVehicleOwnerId(vehicle);

    if (vehicleId && ownerId) {
        return "player";
    }

    if (isAdminVehicle(vehicle)) {
        return "admin";
    }

    return "none";
}

function getVehicleOwnerId(vehicle) {
    if (!vehicle) {
        return 0;
    }

    const candidates = [
        vehicle.ownerId,
        vehicle.owner_id,
        vehicle.owner,

        typeof vehicle.getVariable === "function"
            ? vehicle.getVariable("ownerId")
            : null,

        typeof vehicle.getVariable === "function"
            ? vehicle.getVariable("owner_id")
            : null,

        typeof vehicle.getVariable === "function"
            ? vehicle.getVariable("owner")
            : null,
    ];

    for (const candidate of candidates) {
        const ownerId = positiveInt(candidate);

        if (ownerId) {
            return ownerId;
        }
    }

    return 0;
}

function isPersonalVehicle(vehicle) {
    if (!vehicle) {
        return false;
    }

    try {
        const state = vehicle.getVariable(
            "isPersonalVehicle"
        );

        if (state !== undefined && state !== null) {
            return toBoolean(state);
        }
    } catch {}

    if (vehicle.isPersonalVehicle === true) {
        return true;
    }

    return Boolean(
        getVehicleDatabaseId(vehicle) &&
        getVehicleOwnerId(vehicle)
    );
}

function isAdminVehicle(vehicle) {
    if (!vehicle) {
        return false;
    }

    try {
        if (
            toBoolean(
                vehicle.getVariable("adminVehicle")
            )
        ) {
            return true;
        }
    } catch {}

    if (vehicle.adminVehicle === true) {
        return true;
    }

    try {
        return (
            String(
                vehicle.getVariable("ownerType") || ""
            ).toLowerCase() === "admin"
        );
    } catch {}

    return false;
}

/*
|--------------------------------------------------------------------------
| Vehicle access
|--------------------------------------------------------------------------
*/

function canControlVehicle(player, vehicle) {
    if (
        !player ||
        !vehicle ||
        !mp.players.exists(player) ||
        !mp.vehicles.exists(vehicle)
    ) {
        return false;
    }

    const adminLevel = Number(
        getAdminLevel(player)
    ) || 0;

    if (isAdminVehicle(vehicle)) {
        return adminLevel >= 1;
    }

    const ownerType = getVehicleOwnerType(vehicle);
    const ownerId = getVehicleOwnerId(vehicle);
    const playerUuid = positiveInt(
        getPlayerUuid(player)
    );

    if (ownerType === "player") {
        return Boolean(
            playerUuid &&
            ownerId &&
            Number(ownerId) === Number(playerUuid)
        );
    }

    return false;
}

/*
|--------------------------------------------------------------------------
| Поиск ближайшей машины
|--------------------------------------------------------------------------
*/

function getNearestVehicle(
    player,
    range = LOCK_RANGE
) {
    if (!player || !mp.players.exists(player)) {
        return null;
    }

    let nearestVehicle = null;
    let nearestDistance = Number(range);

    mp.vehicles.forEach((vehicle) => {
        if (
            !vehicle ||
            !mp.vehicles.exists(vehicle)
        ) {
            return;
        }

        if (
            Number(vehicle.dimension || 0) !==
            Number(player.dimension || 0)
        ) {
            return;
        }

        const distance = getDistance(
            player.position,
            vehicle.position
        );

        if (distance <= nearestDistance) {
            nearestVehicle = vehicle;
            nearestDistance = distance;
        }
    });

    return nearestVehicle;
}

function getVehicleForLock(player) {
    if (!player || !mp.players.exists(player)) {
        return null;
    }

    if (
        player.vehicle &&
        mp.vehicles.exists(player.vehicle)
    ) {
        return player.vehicle;
    }

    return getNearestVehicle(player, LOCK_RANGE);
}

/*
|--------------------------------------------------------------------------
| Vehicle state
|--------------------------------------------------------------------------
*/

function getVehicleEngine(vehicle) {
    if (!vehicle) {
        return false;
    }

    try {
        const state = vehicle.getVariable("engine");

        if (state !== undefined && state !== null) {
            return toBoolean(state);
        }
    } catch {}

    return toBoolean(vehicle.engine);
}

function setVehicleEngine(
    vehicle,
    state,
    markDirty = true
) {
    if (!vehicle || !mp.vehicles.exists(vehicle)) {
        return false;
    }

    const enabled = Boolean(state);

    vehicle.engineState = enabled;

    try {
        vehicle.setVariable("engine", enabled);
    } catch {}

    try {
        vehicle.engine = enabled;
    } catch {}

    if (markDirty) {
        markVehicleDirty(vehicle);
    }

    return enabled;
}

function getVehicleLocked(vehicle) {
    if (!vehicle) {
        return false;
    }

    try {
        const state = vehicle.getVariable("locked");

        if (state !== undefined && state !== null) {
            return toBoolean(state);
        }
    } catch {}

    return toBoolean(vehicle.locked);
}

function setVehicleLocked(
    vehicle,
    state,
    markDirty = true
) {
    if (!vehicle || !mp.vehicles.exists(vehicle)) {
        return false;
    }

    const locked = Boolean(state);

    try {
        vehicle.setVariable("locked", locked);
    } catch {}

    try {
        vehicle.locked = locked;
    } catch {}

    if (markDirty) {
        markVehicleDirty(vehicle);
    }

    return locked;
}

function getVehicleFuel(vehicle) {
    if (!vehicle) {
        return 0;
    }

    try {
        const variableFuel = vehicle.getVariable("fuel");

        if (
            variableFuel !== undefined &&
            variableFuel !== null
        ) {
            return Math.max(
                0,
                Number(variableFuel) || 0
            );
        }
    } catch {}

    return Math.max(
        0,
        Number(vehicle.fuel) || 0
    );
}

function setVehicleFuel(
    vehicle,
    value,
    markDirty = true
) {
    if (!vehicle || !mp.vehicles.exists(vehicle)) {
        return 0;
    }

    const fuel = Math.max(
        0,
        Number(value) || 0
    );

    vehicle.fuel = fuel;

    try {
        vehicle.setVariable("fuel", fuel);
    } catch {}

    if (markDirty) {
        markVehicleDirty(vehicle);
    }

    return fuel;
}

function getVehicleFuelConsumption(vehicle) {
    if (!vehicle) {
        return DEFAULT_FUEL_CONSUMPTION;
    }

    try {
        const consumption = Number(
            vehicle.getVariable("fuelConsumption")
        );

        if (
            Number.isFinite(consumption) &&
            consumption > 0
        ) {
            return consumption;
        }
    } catch {}

    const runtimeConsumption = Number(
        vehicle.fuelConsumption
    );

    if (
        Number.isFinite(runtimeConsumption) &&
        runtimeConsumption > 0
    ) {
        return runtimeConsumption;
    }

    return DEFAULT_FUEL_CONSUMPTION;
}

/*
|--------------------------------------------------------------------------
| State synchronization
|--------------------------------------------------------------------------
*/

function syncVehicleEngineForPlayer(
    player,
    vehicle,
    driverState = isDriver(player)
) {
    if (
        !player ||
        !vehicle ||
        !mp.players.exists(player) ||
        !mp.vehicles.exists(vehicle)
    ) {
        return;
    }

    try {
        player.call("c:vehicle:engine:set", [
            getVehicleEngine(vehicle),
            Boolean(driverState),
        ]);
    } catch {}
}

function syncVehicleLockForPlayer(
    player,
    vehicle
) {
    if (
        !player ||
        !vehicle ||
        !mp.players.exists(player) ||
        !mp.vehicles.exists(vehicle)
    ) {
        return;
    }

    try {
        player.call("c:vehicle:lock:set", [
            vehicle.id,
            getVehicleLocked(vehicle),
        ]);
    } catch {}
}

function syncVehicleFuelForPlayer(
    player,
    vehicle
) {
    if (
        !player ||
        !vehicle ||
        !mp.players.exists(player) ||
        !mp.vehicles.exists(vehicle)
    ) {
        return;
    }

    try {
        player.call("c:vehicle:fuel:set", [
            vehicle.id,
            getVehicleFuel(vehicle),
        ]);
    } catch {}
}

function syncVehicleForPlayer(
    player,
    vehicle,
    driverState = isDriver(player)
) {
    syncVehicleEngineForPlayer(player, vehicle, driverState);
    syncVehicleLockForPlayer(player, vehicle);
    syncVehicleFuelForPlayer(player, vehicle);
}

function syncVehicleForOccupants(vehicle) {

    if (!vehicle || !mp.vehicles.exists(vehicle))
        return;

    mp.players.forEach((player)=>{

        if(!player.vehicle)
            return;

        if(player.vehicle!==vehicle)
            return;

        syncVehicleForPlayer(player, vehicle);
        player.call("vehicleHud:update");

        hud.update(player, {
            vehicle: {
                inVehicle: true,
                isDriver: isDriver(player),
                speed: Math.round(getVehicleSpeed(vehicle)),
                maxSpeed: getVehicleMaxSpeed(vehicle),
                fuel: getVehicleFuel(vehicle),
                engineHealth: getVehicleEngineHealth(vehicle),
                mileage: getVehicleMileage(vehicle),
                doorsLocked: getVehicleLocked(vehicle),
                engineOn: getVehicleEngine(vehicle),
                seatbeltOn: getSeatbeltState(player),
                lightsOn: getVehicleLightsState(vehicle)
            }
        });

    });

}

function syncVehicleLockForAll(vehicle) {
    if (
        !vehicle ||
        !mp.vehicles.exists(vehicle)
    ) {
        return;
    }

    mp.players.forEach((target) => {
        if (
            !target ||
            !mp.players.exists(target)
        ) {
            return;
        }

        if (
            Number(target.dimension || 0) !==
            Number(vehicle.dimension || 0)
        ) {
            return;
        }

        syncVehicleLockForPlayer(target, vehicle);
    });
}

/*
|--------------------------------------------------------------------------
| Database state synchronization
|--------------------------------------------------------------------------
*/

function markVehicleDirty(vehicle) {
    const vehicleId = getVehicleDatabaseId(vehicle);

    if (!vehicleId || !isPersonalVehicle(vehicle)) {
        return;
    }

    dirtyVehicles.add(vehicleId);
}

function findVehicleEntityByDatabaseId(vehicleId) {
    const id = positiveInt(vehicleId);

    if (!id) {
        return null;
    }

    let foundVehicle = null;

    mp.vehicles.forEach((vehicle) => {
        if (foundVehicle) {
            return;
        }

        if (
            Number(getVehicleDatabaseId(vehicle)) === id
        ) {
            foundVehicle = vehicle;
        }
    });

    return foundVehicle;
}

async function saveVehicleState(vehicle) {
    if (
        !vehicle ||
        !mp.vehicles.exists(vehicle)
    ) {
        return false;
    }

    return withFuelMutation(vehicle, async () => {
        const vehicleId = getVehicleDatabaseId(vehicle);

        if (!vehicleId || !isPersonalVehicle(vehicle)) {
            return false;
        }

        const position = vehicle.position;
        const heading =
            Number(vehicle.heading) ||
            Number(vehicle.rotation?.z) ||
            0;
        const fuel = getVehicleFuel(vehicle);
        const locked = getVehicleLocked(vehicle);
        const engine = getVehicleEngine(vehicle);
        let health = 1000;

        try {
            health = clamp(
                Number(vehicle.health) || 1000,
                0,
                1000
            );
        } catch {}

        await query(
            `
                UPDATE vehicles
                SET
                    pos_x = ?,
                    pos_y = ?,
                    pos_z = ?,
                    heading = ?,
                    dimension = ?,
                    fuel = ?,
                    locked = ?,
                    engine = ?,
                    health = ?
                WHERE id = ?
                LIMIT 1
            `,
            [
                Number(position?.x) || 0,
                Number(position?.y) || 0,
                Number(position?.z) || 0,
                heading,
                Number(vehicle.dimension) || 0,
                fuel,
                locked ? 1 : 0,
                engine ? 1 : 0,
                health,
                vehicleId,
            ]
        );

        return true;
    });
}

async function flushDirtyVehicles() {
    if (dirtyVehicles.size === 0) {
        return;
    }

    const vehicleIds = Array.from(dirtyVehicles);
    dirtyVehicles.clear();

    for (const vehicleId of vehicleIds) {
        const vehicle = findVehicleEntityByDatabaseId(
            vehicleId
        );

        if (!vehicle) {
            continue;
        }

        try {
            await saveVehicleState(vehicle);
        } catch (saveError) {
            dirtyVehicles.add(vehicleId);

            console.error(
                `[VEHICLE CONTROL] Save vehicle #${vehicleId}:`,
                saveError
            );
        }
    }
}

/*
|--------------------------------------------------------------------------
| Events
|--------------------------------------------------------------------------
*/

const hud = require("../hud/hud.service");

mp.events.add("playerEnterVehicle", (player, vehicle, seat) => {

    hud.show(player);
    syncVehicleForPlayer(
        player,
        vehicle,
        Number(seat) === 0 || Number(seat) === -1
    );

    hud.update(player, {
        vehicle: {
            inVehicle: true,
            isDriver: isDriver(player),
            speed: 0,
            maxSpeed: 240,
            fuel: getVehicleFuel(vehicle),
            engineOn: getVehicleEngine(vehicle),
            doorsLocked: getVehicleLocked(vehicle),
            seatbeltOn: false,
            lightsOn: false,
            engineHealth: 100,
            mileage: 0
        }
    });

});

mp.events.add("playerExitVehicle", (player, vehicle) => {
hud.update(player,{
    vehicle:{
        inVehicle:false,
        isDriver:false,
        speed:0,
        fuel:0,
        engineOn:false,
        doorsLocked:false,
        seatbeltOn:false,
        lightsOn:false
    }
});
}
);

mp.events.add(
    "s:vehicle:engine:toggle",
    (player) => {
        try {
            if (
                !player ||
                !mp.players.exists(player)
            ) {
                return;
            }

            const vehicle = player.vehicle;

            if (
                !vehicle ||
                !mp.vehicles.exists(vehicle)
            ) {
                return notify(
                    player,
                    "Вы должны находиться в транспорте.",
                    "#ff6666"
                );
            }

            if (!isDriver(player)) {
                return notify(
                    player,
                    "Зажиганием может управлять только водитель.",
                    "#ff6666"
                );
            }

            if (!canControlVehicle(player, vehicle)) {
                return notify(
                    player,
                    "У вас нет ключей от этого транспорта.",
                    "#ff6666"
                );
            }

            const fuel = getVehicleFuel(vehicle);

            if (fuel <= 0) {
                setVehicleEngine(vehicle, false);
                syncVehicleForOccupants(vehicle);

                return notify(
                    player,
                    "В транспорте нет топлива.",
                    "#ff6666"
                );
            }

            const newState = setVehicleEngine(
                vehicle,
                !getVehicleEngine(vehicle)
            );

            syncVehicleForOccupants(vehicle);

            hud.update(player,{
                vehicle:{
                    engineOn:newState
                }
            });

            notify(
                player,
                newState ? "Двигатель запущен." : "Двигатель заглушен.",
                newState ? "#66cc66" : "#ffcc66"
            );
            
        } catch (eventError) {
            console.error(
                "[VEHICLE ENGINE TOGGLE ERROR]",
                eventError
            );
        }
    }
);

function updateVehicleHud(player) {

    if (!player || !mp.players.exists(player))
        return;

    if (!player.vehicle)
        return;

    if (!isDriver(player))
        return;

    const vehicle = player.vehicle;

    let speed = 0;

    try {

        const v = vehicle.velocity;

        speed = Math.round(
            Math.sqrt(
                v.x * v.x +
                v.y * v.y +
                v.z * v.z
            ) * 3.6
        );

    } catch {}

    hud.update(player, {
        vehicle: {
            speed,
            fuel: getVehicleFuel(vehicle),
            engineOn: getVehicleEngine(vehicle),
            doorsLocked: getVehicleLocked(vehicle)
        }
    });

}

setInterval(() => {

    mp.players.forEach(updateVehicleHud);

}, 200);

mp.events.add(
    "s:vehicle:lock:toggle",
    (player) => {
        try {
            if (
                !player ||
                !mp.players.exists(player)
            ) {
                return;
            }

            const vehicle = getVehicleForLock(player);

            if (
                !vehicle ||
                !mp.vehicles.exists(vehicle)
            ) {
                return notify(
                    player,
                    "Рядом нет транспорта.",
                    "#ff6666"
                );
            }

            if (
                player.vehicle &&
                !isDriver(player)
            ) {
                return notify(
                    player,
                    "Закрывать транспорт может только водитель.",
                    "#ff6666"
                );
            }

            if (!canControlVehicle(player, vehicle)) {
                return notify(
                    player,
                    "У вас нет ключей от этого транспорта.",
                    "#ff6666"
                );
            }

            const locked = setVehicleLocked(
                vehicle,
                !getVehicleLocked(vehicle)
            );

            hud.update(player,{
            vehicle:{
                doorsLocked:locked
            }
            });

            syncVehicleLockForAll(vehicle);

            notify(
                player,
                locked
                    ? "Транспорт закрыт."
                    : "Транспорт открыт.",
                locked
                    ? "#ffcc66"
                    : "#66cc66"
            );
        } catch (eventError) {
            console.error(
                "[VEHICLE LOCK TOGGLE ERROR]",
                eventError
            );
        }
    }
);

const fuelMutationTails = new WeakMap();

async function withFuelMutation(vehicle, operation) {
    if (!vehicle || !mp.vehicles.exists(vehicle) || typeof operation !== "function") {
        return false;
    }

    const previous = fuelMutationTails.get(vehicle) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const tail = previous.catch(() => {}).then(() => gate);
    fuelMutationTails.set(vehicle, tail);

    await previous.catch(() => {});
    try {
        return await operation();
    } finally {
        release();
        if (fuelMutationTails.get(vehicle) === tail) fuelMutationTails.delete(vehicle);
    }
}

const fuelInterval = setInterval(() => {
    try {
        mp.vehicles.forEach((vehicle) => {
            if (
                !vehicle ||
                !mp.vehicles.exists(vehicle) ||
                fuelMutationTails.has(vehicle) ||
                !getVehicleEngine(vehicle)
            ) {
                return;
            }

            let fuel = getVehicleFuel(vehicle);

            if (fuel <= 0) {
                setVehicleFuel(vehicle, 0);
                setVehicleEngine(vehicle, false);

                syncVehicleForOccupants(vehicle);
                return;
            }

            let speed = 0;

            try {
                if (
                    typeof vehicle.getSpeed === "function"
                ) {
                    speed = Math.max(
                        0,
                        Number(vehicle.getSpeed()) || 0
                    );
                }
            } catch {}

            const consumption =
                getVehicleFuelConsumption(vehicle);

            const idleWaste =
                IDLE_FUEL_WASTE * consumption;

            const moveWaste =
                speed *
                MOVE_FUEL_WASTE *
                consumption;

            fuel = setVehicleFuel(
                vehicle,
                fuel - idleWaste - moveWaste
            );

            mp.players.forEach((player)=>{

            if(player.vehicle!==vehicle)
                return;

            hud.update(player,{
                vehicle:{
                    fuel
                }
            });

            });

            if (fuel <= 0) {
                setVehicleFuel(vehicle, 0);
                setVehicleEngine(vehicle, false);

                syncVehicleForOccupants(vehicle);
                return;
            }

            syncVehicleForOccupants(vehicle);
        });
    } catch (tickError) {
        console.error(
            "[VEHICLE FUEL TICK ERROR]",
            tickError
        );
    }
}, FUEL_TICK_MS);

/*
|--------------------------------------------------------------------------
| Database interval
|--------------------------------------------------------------------------
*/

const databaseInterval = setInterval(() => {
    flushDirtyVehicles().catch((flushError) => {
        console.error(
            "[VEHICLE CONTROL] Database flush:",
            flushError
        );
    });
}, DATABASE_SYNC_MS);

/*
|--------------------------------------------------------------------------
| Shutdown
|--------------------------------------------------------------------------
*/

async function shutdown() {
    try {
        clearInterval(fuelInterval);
        clearInterval(databaseInterval);

        mp.vehicles.forEach((vehicle) => {
            if (
                vehicle &&
                mp.vehicles.exists(vehicle) &&
                isPersonalVehicle(vehicle)
            ) {
                markVehicleDirty(vehicle);
            }
        });

        await flushDirtyVehicles();
    } catch (shutdownError) {
        console.error(
            "[VEHICLE CONTROL] Shutdown:",
            shutdownError
        );
    }
}

/*
 * Некоторые сборки могут не иметь данных событий.
 * Они не мешают обычной работе сервера.
 */
try {
    mp.events.add("serverShutdown", async () => {
        mp.events.delayShutdown = true;
        try {
            await shutdown();
        } finally {
            mp.events.delayShutdown = false;
        }
    });
} catch {}

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
    getVehicleDatabaseId,
    getVehicleOwnerType,
    getVehicleOwnerId,
    isPersonalVehicle,
    isAdminVehicle,
    canControlVehicle,

    getVehicleEngine,
    setVehicleEngine,

    getVehicleLocked,
    setVehicleLocked,

    getVehicleFuel,
    setVehicleFuel,
    getVehicleFuelConsumption,
    withFuelMutation,

    getNearestVehicle,
    getVehicleForLock,

    syncVehicleEngineForPlayer,
    syncVehicleLockForPlayer,
    syncVehicleFuelForPlayer,
    syncVehicleForPlayer,
    syncVehicleForOccupants,
    syncVehicleLockForAll,

    markVehicleDirty,
    saveVehicleState,
    flushDirtyVehicles,
};

console.log(
    "[VEHICLE CONTROL] Owner/engine/lock/fuel system loaded."
);
