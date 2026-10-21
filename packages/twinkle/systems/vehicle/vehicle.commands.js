"use strict";

const vehicleCatalog = require("./vehicle.catalog.js");

const db = require("../../database/query.js");
const tuningService = require("../lsc/tuning.service.js");
const chatService = require("../chat/chat.service.js");

const MIN_ADMIN_LEVEL = 7;
const DEFAULT_FUEL = 60;
const MAX_PLATE_LENGTH = 8;

const spawnedPersonalVehicles = new Map();

async function query(sql, params = []) {
    if (!db || typeof db.query !== "function") {
        throw new Error(
            "database/query.js не экспортирует query(sql, params)."
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

function getInsertId(result) {
    if (!result) {
        return null;
    }

    const directId = Number(result.insertId);

    if (Number.isInteger(directId) && directId > 0) {
        return directId;
    }

    if (Array.isArray(result) && result[0]) {
        const nestedId = Number(result[0].insertId);

        if (
            Number.isInteger(nestedId) &&
            nestedId > 0
        ) {
            return nestedId;
        }
    }

    return null;
}

function normalizeString(value) {
    return String(value ?? "").trim();
}

function normalizeModel(value) {
    return normalizeString(value).toLowerCase();
}

function normalizePlate(value) {
    return normalizeString(value)
        .toUpperCase()
        .replace(/[^A-ZА-ЯЁ0-9]/gi, "")
        .slice(0, MAX_PLATE_LENGTH);
}

function positiveInt(value) {
    const number = Math.trunc(Number(value));

    if (!Number.isFinite(number) || number <= 0) {
        return null;
    }

    return number;
}

function normalizeColor(value) {
    const color = Math.trunc(Number(value));

    if (!Number.isFinite(color)) {
        return null;
    }

    return Math.max(0, Math.min(255, color));
}

function isValidModel(model) {
    return /^[a-z0-9_]{1,64}$/i.test(
        String(model || "")
    );
}

function send(player, message, color = "#ffffff") {
    if (!player || !mp.players.exists(player)) {
        return;
    }

    try {
        chatService.sendToPlayer(player, String(message), color, {
            channelType: "server",
            author: "Vehicle",
        });
    } catch (chatError) {
        console.error("[VEHICLE CHAT] HUD delivery failed:", chatError);
        try {
            player.outputChatBox(`!{${color}}${message}`);
        } catch {}
    }
}

function success(player, message) {
    send(
        player,
        `[Транспорт] ${message}`,
        "#66dd88"
    );
}

function error(player, message) {
    send(
        player,
        `[Транспорт] ${message}`,
        "#ff6666"
    );
}

function info(player, message) {
    send(
        player,
        `[Транспорт] ${message}`,
        "#66ccff"
    );
}

function getAdminLevel(player) {
    if (!player) {
        return 0;
    }

    const candidates = [
        player.adminLevel,
        player.admin_level,
        player.admin,

        player.character?.adminLevel,
        player.character?.admin_level,
        player.character?.admin,

        player.characterData?.adminLevel,
        player.characterData?.admin_level,
        player.characterData?.admin,

        player.data?.adminLevel,
        player.data?.admin_level,
        player.data?.admin,

        typeof player.getVariable === "function"
            ? player.getVariable("adminLevel")
            : null,

        typeof player.getVariable === "function"
            ? player.getVariable("admin_level")
            : null,

        typeof player.getVariable === "function"
            ? player.getVariable("admin")
            : null,
    ];

    for (const candidate of candidates) {
        const level = Math.trunc(Number(candidate));

        if (
            Number.isFinite(level) &&
            level > 0
        ) {
            return level;
        }
    }

    return 0;
}

function hasAccess(player) {
    return getAdminLevel(player) >= MIN_ADMIN_LEVEL;
}

function getPlayerUuid(player) {
    if (!player) {
        return null;
    }

    const candidates = [
        player.uuid,
        player.UUID,
        player.characterId,
        player.character_id,
        player.sqlId,
        player.dbid,

        player.character?.uuid,
        player.character?.UUID,
        player.character?.id,

        player.characterData?.uuid,
        player.characterData?.UUID,
        player.characterData?.id,

        player.data?.uuid,
        player.data?.UUID,
        player.data?.characterId,

        typeof player.getVariable === "function"
            ? player.getVariable("uuid")
            : null,

        typeof player.getVariable === "function"
            ? player.getVariable("UUID")
            : null,

        typeof player.getVariable === "function"
            ? player.getVariable("characterId")
            : null,
    ];

    for (const candidate of candidates) {
        const uuid = positiveInt(candidate);

        if (uuid) {
            return uuid;
        }
    }

    return null;
}

function findOnlinePlayerByUuid(uuid) {
    let foundPlayer = null;

    mp.players.forEach((player) => {
        if (foundPlayer) {
            return;
        }

        if (
            Number(getPlayerUuid(player)) ===
            Number(uuid)
        ) {
            foundPlayer = player;
        }
    });

    return foundPlayer;
}

function getSpawnPosition(player, distance = 4) {
    const heading = Number(player.heading) || 0;
    const radians = heading * Math.PI / 180;

    const forwardX = -Math.sin(radians);
    const forwardY = Math.cos(radians);

    return new mp.Vector3(
        Number(player.position.x) + forwardX * distance,
        Number(player.position.y) + forwardY * distance,
        Number(player.position.z) + 0.5
    );
}

async function findCharacterByUuid(uuid) {
    try {
        const rows = await query(
            `
                SELECT *
                FROM characters
                WHERE uuid = ?
                LIMIT 1
            `,
            [uuid]
        );

        if (
            Array.isArray(rows) &&
            rows.length > 0
        ) {
            const character = rows[0];

            return {
                ...character,
                ownerId:
                    positiveInt(character.account_id) ||
                    positiveInt(character.uuid) ||
                    positiveInt(character.id),
            };
        }
    } catch (queryError) {
        const message = String(
            queryError?.message || ""
        ).toLowerCase();

        if (
            !message.includes("unknown column") &&
            !message.includes("doesn't exist")
        ) {
            throw queryError;
        }
    }

    const rows = await query(
        `
            SELECT *
            FROM characters
            WHERE id = ?
            LIMIT 1
        `,
        [uuid]
    );

    if (
        !Array.isArray(rows) ||
        rows.length === 0
    ) {
        return null;
    }

    return {
        ...rows[0],
        ownerId: positiveInt(rows[0].id),
    };
}

const ensureCatalogModel = vehicleCatalog.ensureModel;

async function getVehicleRowById(vehicleId) {
    const rows = await query(
        `
            SELECT *
            FROM vehicles
            WHERE id = ?
            LIMIT 1
        `,
        [vehicleId]
    );

    if (
        !Array.isArray(rows) ||
        rows.length === 0
    ) {
        return null;
    }

    return rows[0];
}

async function insertVehicle(data) {
    const result = await query(
        `
            INSERT INTO vehicles (
                owner,
                model,
                pos_x,
                pos_y,
                pos_z,
                heading,
                dimension,
                fuel,
                mileage,
                locked,
                engine,
                health,
                plate,
                color1,
                color2
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `,
        [
            data.ownerId,
            data.model,
            Number(data.position.x) || 0,
            Number(data.position.y) || 0,
            Number(data.position.z) || 0,
            Number(data.heading) || 0,
            Number(data.dimension) || 0,
            DEFAULT_FUEL,
            0,
            0,
            0,
            1000,
            data.plate,
            data.color1,
            data.color2,
        ]
    );

    const vehicleId = getInsertId(result);

    if (!vehicleId) {
        throw new Error(
            "База не вернула insertId транспорта."
        );
    }

    return vehicleId;
}

async function deleteVehicleRow(vehicleId) {
    await query(
        `
            DELETE FROM vehicles
            WHERE id = ?
            LIMIT 1
        `,
        [vehicleId]
    );
}

async function updateVehiclePosition(
    vehicleId,
    position,
    heading,
    dimension
) {
    await query(
        `
            UPDATE vehicles
            SET
                pos_x = ?,
                pos_y = ?,
                pos_z = ?,
                heading = ?,
                dimension = ?,
                engine = 0
            WHERE id = ?
            LIMIT 1
        `,
        [
            Number(position.x) || 0,
            Number(position.y) || 0,
            Number(position.z) || 0,
            Number(heading) || 0,
            Number(dimension) || 0,
            vehicleId,
        ]
    );
}

function getSpawnedVehicle(vehicleId) {
    const id = positiveInt(vehicleId);

    if (!id) {
        return null;
    }

    const vehicle = spawnedPersonalVehicles.get(id);

    if (!vehicle) {
        return null;
    }

    if (!mp.vehicles.exists(vehicle)) {
        spawnedPersonalVehicles.delete(id);
        return null;
    }

    return vehicle;
}

function registerPersonalVehicle(vehicle, row) {
    const vehicleId = positiveInt(row.id);
    const ownerId = positiveInt(row.owner);
    const model = normalizeModel(row.model);
    const plate = normalizePlate(
        row.plate || `CAR${vehicleId}`
    );

    if (!vehicleId) {
        throw new Error("Некорректный ID транспорта.");
    }

    if (!ownerId) {
        throw new Error("Некорректный владелец транспорта.");
    }

    /*
    |--------------------------------------------------------------------------
    | Runtime
    |--------------------------------------------------------------------------
    */

    vehicle.vehicleId = vehicleId;
    vehicle.vehicle_id = vehicleId;
    vehicle.sqlId = vehicleId;
    vehicle.sqlID = vehicleId;
    vehicle.dbId = vehicleId;
    vehicle.dbid = vehicleId;

    vehicle.ownerId = ownerId;
    vehicle.owner_id = ownerId;

    vehicle.ownerType = "player";

    vehicle.modelName = model;
    vehicle.model = model;
    vehicle.displayName = String(row.display_name || model);

    vehicle.isPersonalVehicle = true;

    vehicle.fuel = Math.max(
        0,
        Number(row.fuel) || 0
    );

    vehicle.fuelMax = Math.max(1, Number(row.fuel_max) || DEFAULT_FUEL);

    vehicle.mileage = Math.max(
        0,
        Number(row.mileage) || 0
    );

    vehicle.fuelConsumption = Math.max(
        0.1,
        Number(row.fuelConsumption) || 1
    );

    try {
        vehicle.locked = Boolean(Number(row.locked));
    } catch {}

    try {
        vehicle.engine = Boolean(Number(row.engine));
    } catch {}

    try {
        vehicle.health = Math.max(
            0,
            Math.min(
                1000,
                Number(row.health) || 1000
            )
        );
    } catch {}

    /*
    |--------------------------------------------------------------------------
    | Synced variables
    |--------------------------------------------------------------------------
    */

    try {
        vehicle.setVariable("vehicleId", vehicleId);
        vehicle.setVariable("vehicleDbId", vehicleId);
        vehicle.setVariable("vehicle_id", vehicleId);

        vehicle.setVariable("sqlId", vehicleId);
        vehicle.setVariable("dbId", vehicleId);

        vehicle.setVariable("ownerId", ownerId);
        vehicle.setVariable("owner_id", ownerId);

        vehicle.setVariable("ownerType", "player");

        vehicle.setVariable("model", model);
        vehicle.setVariable("modelName", model);
        vehicle.setVariable("displayName", vehicle.displayName);

        vehicle.setVariable("plate", plate);

        vehicle.setVariable(
            "isPersonalVehicle",
            true
        );

        vehicle.setVariable(
            "fuel",
            vehicle.fuel
        );

        vehicle.setVariable("fuelMax", vehicle.fuelMax);


        vehicle.setVariable(
            "mileage",
            vehicle.mileage
        );

        vehicle.setVariable(
            "fuelConsumption",
            vehicle.fuelConsumption
        );

        vehicle.setVariable(
            "locked",
            Boolean(Number(row.locked))
        );

        vehicle.setVariable(
            "engine",
            Boolean(Number(row.engine))
        );

        vehicle.setVariable(
            "health",
            Math.max(
                0,
                Math.min(
                    1000,
                    Number(row.health) || 1000
                )
            )
        );
    } catch {}

    /*
    |--------------------------------------------------------------------------
    | Registry
    |--------------------------------------------------------------------------
    */
    tuningService.sync(vehicle, row.tuning_json);


    spawnedPersonalVehicles.set(
        vehicleId,
        vehicle
    );

    return vehicle;
}

function getCommandVehicleEngine(vehicle, fallback = false) {
    if (!vehicle || !mp.vehicles.exists(vehicle)) return Boolean(fallback);

    try {
        const state = vehicle.getVariable("engine");
        if (state !== undefined && state !== null) return Boolean(state);
    } catch {}

    try { return Boolean(vehicle.engine); } catch {}
    return Boolean(fallback);
}

async function setCommandVehicleEngine(vehicle, vehicleId, state) {
    const enabled = Boolean(state);
    try { vehicle.setVariable("engine", enabled); } catch {}
    try { vehicle.engine = enabled; } catch {}
    await query("UPDATE vehicles SET engine = ? WHERE id = ?", [enabled ? 1 : 0, vehicleId]);
    return enabled;
}
function destroySpawnedVehicle(vehicleId) {
    const id = positiveInt(vehicleId);

    if (!id) {
        return false;
    }

    const vehicle = getSpawnedVehicle(id);

    if (!vehicle) {
        spawnedPersonalVehicles.delete(id);
        return false;
    }

    try {
        if (!mp.vehicles.exists(vehicle)) {
            spawnedPersonalVehicles.delete(id);
            return true;
        }
        vehicle.destroy();
        spawnedPersonalVehicles.delete(id);
        return true;
    } catch (destroyError) {
        console.error(
            `[VEHICLE] Destroy #${id}:`,
            destroyError
        );

        return false;
    }
}

function unregisterSpawnedVehicle(vehicleId, expectedVehicle = null) {
    const id = positiveInt(vehicleId);
    if (!id) return false;

    const registeredVehicle = getSpawnedVehicle(id);
    if (expectedVehicle && registeredVehicle && registeredVehicle !== expectedVehicle) {
        return false;
    }

    spawnedPersonalVehicles.delete(id);
    return true;
}

function createVehicleEntity(
    row,
    position,
    heading,
    dimension
) {
    const vehicleId = positiveInt(row.id);
    const ownerId = positiveInt(row.owner);
    const model = normalizeModel(row.model);

    if (!vehicleId) {
        throw new Error(
            "У транспорта отсутствует корректный ID."
        );
    }

    if (!ownerId) {
        throw new Error(
            "У транспорта отсутствует owner."
        );
    }

    if (!isValidModel(model)) {
        throw new Error(
            `Некорректная модель: ${row.model}`
        );
    }

    const plate = normalizePlate(
        row.plate || `CAR${vehicleId}`
    );

    const color1 =
        normalizeColor(row.color1) ?? 0;

    const color2 =
        normalizeColor(row.color2) ?? color1;

    const vehicle = mp.vehicles.new(
        mp.joaat(model),
        position,
        {
            heading: Number(heading) || 0,
            dimension: Number(dimension) || 0,
            numberPlate: plate,
            color: [
                [color1, color1, color1],
                [color2, color2, color2],
            ],
            locked: Boolean(Number(row.locked)),
            engine: false,
        }
    );

    try {
        vehicle.health = Math.max(
            0,
            Math.min(
                1000,
                Number(row.health) || 1000
            )
        );
    } catch {}

    try {
        vehicle.locked =
            Boolean(Number(row.locked));
    } catch {}

    try {
        vehicle.engine = false;
    } catch {}

    return registerPersonalVehicle(
        vehicle,
        {
            ...row,
            id: vehicleId,
            owner: ownerId,
            model,
            plate,
        }
    );
}

mp.registerCommand(
    "cargive",
    async (
        admin,
        fullText,
        rawUuid,
        rawModel,
        rawPlate,
        rawColor
    ) => {
        const commandText = String(fullText || "").trim();
        const fallbackArgs = commandText.split(/\s+/).filter(Boolean);
        if (fallbackArgs.length > 0) {
            [rawUuid, rawModel, rawPlate, rawColor] = fallbackArgs;
        } else if (Array.isArray(rawUuid)) {
            [rawUuid, rawModel, rawPlate, rawColor] = rawUuid;
        }

        console.log(
            "[CARGIVE] Called by " + (admin?.name || "unknown") +
            " (uuid=" + (getPlayerUuid(admin) || 0) +
            ", admin=" + getAdminLevel(admin) + "): " +
            (commandText || "<no arguments>")
        );

        try {
            if (!hasAccess(admin)) {
                return error(
                    admin,
                    "Command rejected: admin level " + getAdminLevel(admin) + ", required " + MIN_ADMIN_LEVEL + "."
                );
            }

            info(admin, "CARGIVE accepted. Checking character, model and database...");

            const uuid = positiveInt(rawUuid);
            const model = normalizeModel(rawModel);
            const plate = normalizePlate(rawPlate);
            const color = normalizeColor(rawColor);

            if (
                !uuid ||
                !model ||
                !plate ||
                color === null
            ) {
                return info(
                    admin,
                    "Invalid arguments: UUID=" + (rawUuid || "-") + ", model=" + (rawModel || "-") + ", plate=" + (rawPlate || "-") + ", color=" + (rawColor ?? "-") + ". Usage: /cargive [UUID] [model] [plate] [color]"
                );
            }

            if (!isValidModel(model)) {
                return error(
                    admin,
                    "Invalid vehicle model name."
                );
            }

            console.log(`[CARGIVE] Arguments validated: uuid=${uuid}, model=${model}, plate=${plate}, color=${color}`);
            const character =
                await findCharacterByUuid(uuid);

            if (!character) {
                return error(
                    admin,
                    "Character UUID " + uuid + " was not found."
                );
            }

            const ownerId = positiveInt(
                character.ownerId
            );

            if (!ownerId) {
                return error(
                    admin,
                    "Could not determine the vehicle owner account."
                );
            }

            console.log(`[CARGIVE] Character found: uuid=${uuid}, owner=${ownerId}`);

            await ensureCatalogModel(model);
            console.log(`[CARGIVE] Catalog model ensured: ${model}`);

            const target =
                findOnlinePlayerByUuid(uuid);

            const spawnTarget = target || admin;
            const position =
                getSpawnPosition(spawnTarget);

            const heading =
                Number(spawnTarget.heading) || 0;

            const dimension =
                Number(spawnTarget.dimension) || 0;

            const vehicleId = await insertVehicle({
                ownerId,
                model,
                position,
                heading,
                dimension,
                plate,
                color1: color,
                color2: color,
            });

            console.log(`[CARGIVE] Database row inserted: #${vehicleId}`);

            const row = {
                id: vehicleId,
                owner: ownerId,
                model,
                fuel: DEFAULT_FUEL,
                mileage: 0,
                locked: 0,
                engine: 0,
                health: 1000,
                plate,
                color1: color,
                color2: color,
            };

            try {
                const vehicle = createVehicleEntity(
                    row,
                    position,
                    heading,
                    dimension
                );
                await setCommandVehicleEngine(vehicle, vehicleId, true);
            } catch (spawnError) {
                await deleteVehicleRow(vehicleId)
                    .catch(() => {});

                throw spawnError;
            }

            console.log(`[CARGIVE] Vehicle entity spawned: #${vehicleId}`);

            success(
                admin,
                `Выдан транспорт #${vehicleId} ${model} персонажу UUID ${uuid}.`
            );

            if (target && target !== admin) {
                success(
                    target,
                    `Вам выдан автомобиль ${model} с номером ${plate}.`
                );
            }

            console.log(
                `[CARGIVE] ${admin.name} gave #${vehicleId} ${model} to UUID ${uuid}`
            );
        } catch (commandError) {
            console.error(
                "[CARGIVE] Error:",
                commandError
            );

            error(
                admin,
                "CARGIVE failed: " + (commandError?.code || commandError?.message || "unknown error")
            );
        }
    }
);

mp.registerCommand(
    "carspawn",
    async (
        admin,
        fullText,
        rawVehicleId
    ) => {
        try {
            if (!hasAccess(admin)) {
                return error(
                    admin,
                    `Команда отклонена: ваш админ-уровень ${getAdminLevel(admin)}, требуется ${MIN_ADMIN_LEVEL}.`
                );
            }

            const vehicleId =
                positiveInt(rawVehicleId);

            if (!vehicleId) {
                return info(
                    admin,
                    "Использование: /carspawn [ID транспорта]"
                );
            }

            const row =
                await getVehicleRowById(vehicleId);

            if (!row) {
                return error(
                    admin,
                    `Транспорт #${vehicleId} не найден.`
                );
            }

            const existingVehicle = getSpawnedVehicle(vehicleId);
            const previousEngineState = getCommandVehicleEngine(
                existingVehicle,
                Boolean(Number(row.engine))
            );
            const nextEngineState = !previousEngineState;

            if (existingVehicle) {
                destroySpawnedVehicle(vehicleId);
            }

            const position =
                getSpawnPosition(admin);

            const heading =
                Number(admin.heading) || 0;

            const dimension =
                Number(admin.dimension) || 0;

            const vehicle = createVehicleEntity(
                {
                    ...row,
                    engine: nextEngineState ? 1 : 0,
                },
                position,
                heading,
                dimension
            );

            try {
                await updateVehiclePosition(
                    vehicleId,
                    position,
                    heading,
                    dimension
                );
                await setCommandVehicleEngine(vehicle, vehicleId, nextEngineState);
            } catch (updateError) {
                destroySpawnedVehicle(vehicleId);
                throw updateError;
            }

            success(
                admin,
                `Транспорт #${vehicleId} ${row.model} создан возле вас.`
            );
        } catch (commandError) {
            console.error(
                "[CARSPAWN] Error:",
                commandError
            );

            error(
                admin,
                commandError?.message ||
                    "Не удалось создать транспорт."
            );
        }
    }
);

mp.registerCommand(
    "cardespawn",
    (
        admin,
        fullText,
        rawVehicleId
    ) => {
        try {
            if (!hasAccess(admin)) {
                return error(
                    admin,
                    `Команда отклонена: ваш админ-уровень ${getAdminLevel(admin)}, требуется ${MIN_ADMIN_LEVEL}.`
                );
            }

            const vehicleId =
                positiveInt(rawVehicleId);

            if (!vehicleId) {
                return info(
                    admin,
                    "Использование: /cardespawn [ID транспорта]"
                );
            }

            if (!destroySpawnedVehicle(vehicleId)) {
                return error(
                    admin,
                    `Entity транспорта #${vehicleId} не найдена.`
                );
            }

            success(
                admin,
                `Entity транспорта #${vehicleId} удалена.`
            );
        } catch (commandError) {
            console.error(
                "[CARDESPAWN] Error:",
                commandError
            );

            error(
                admin,
                commandError?.message ||
                    "Не удалось удалить транспорт."
            );
        }
    }
);

vehicleCatalog.ensureSchema()
    .then(() => {
        console.log(
            "[VEHICLE COMMANDS] Loaded: /cargive, /carspawn, /cardespawn."
        );
    })
    .catch((initializeError) => {
        console.error(
            "[VEHICLE COMMANDS] Initialization error:",
            initializeError
        );
    });

module.exports = {
    spawnedPersonalVehicles,
    getSpawnedVehicle,
    destroySpawnedVehicle,
    unregisterSpawnedVehicle,
    createVehicleEntity,
};
