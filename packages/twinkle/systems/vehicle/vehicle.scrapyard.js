"use strict";

const db = require("../../database/query.js");
const vehicleCommands = require("./vehicle.commands.js");
const vehicleCatalog = require("./vehicle.catalog.js");
const huntingRepository = require("../hunting/hunting.repository.js");
const { getVehicleStorageKey } = require("./vehicle.owner.js");

const SCRAPYARD_PERCENT = 0.75;
const OFFER_LIFETIME_MS = 30_000;
const ACTION_COOLDOWN_MS = 1_500;

const SCRAPYARDS = [
    {
        id: "scrapyard_ls",
        name: "Автомобильная свалка",
        position: new mp.Vector3(-468.18, -1718.94, 18.69),
        radius: 7,
        markerRadius: 4,
        dimension: 0,
        blipSprite: 380,
        blipColor: 5,
    },
    {
        id: "scrapyard_sandy",
        name: "Автомобильная свалка",
        position: new mp.Vector3(2407.18, 3127.64, 48.15),
        radius: 7,
        markerRadius: 4,
        dimension: 0,
        blipSprite: 380,
        blipColor: 5,
    },
    {
        id: "scrapyard_paleto",
        name: "Автомобильная свалка",
        position: new mp.Vector3(95.94, 6363.72, 31.38),
        radius: 7,
        markerRadius: 4,
        dimension: 0,
        blipSprite: 380,
        blipColor: 5,
    },
];

const scrapyardsById = new Map();
const playerOffers = new Map();
const playerCooldowns = new Map();
const soldVehicleCleanupTimers = new Map();

function positiveIntOrNull(value) {
    const number = Math.trunc(Number(value));

    if (!Number.isFinite(number) || number <= 0) {
        return null;
    }

    return number;
}

function normalizeModelName(value) {
    return String(value || "").trim().toLowerCase();
}

function sameOwner(left, right) {
    return String(left ?? "").trim() === String(right ?? "").trim();
}

function getVehicleFallbackPrice(vehicleRow, catalogRow = null) {
    return Math.max(
        0,
        Math.floor(
            Number(
                catalogRow?.gov_price ??
                catalogRow?.price ??
                vehicleRow?.gov_price ??
                vehicleRow?.gos_price ??
                vehicleRow?.price ??
                vehicleRow?.cost ??
                0
            ) || 0
        )
    );
}

function getVehicleDisplayName(vehicleRow, catalogRow = null) {
    return String(
        catalogRow?.display_name ||
        catalogRow?.real_name ||
        vehicleRow?.display_name ||
        vehicleRow?.name ||
        vehicleRow?.model ||
        "vehicle"
    );
}

async function executeQuery(sql, params = []) {
    if (!db || typeof db.query !== "function") {
        throw new Error(
            "database/query.js не экспортирует query(sql, params)."
        );
    }

    const result = await db.query(sql, params);

    if (
        Array.isArray(result) &&
        result.length === 2 &&
        Array.isArray(result[0])
    ) {
        return result[0];
    }

    return result;
}

function getAffectedRows(result) {
    if (!result) {
        return 0;
    }

    if (Number.isFinite(Number(result.affectedRows))) {
        return Number(result.affectedRows);
    }

    if (
        Array.isArray(result) &&
        result[0] &&
        Number.isFinite(Number(result[0].affectedRows))
    ) {
        return Number(result[0].affectedRows);
    }

    return 0;
}

function notify(player, message, type = "info") {
    if (!player || !mp.players.exists(player)) {
        return;
    }

    try {
        player.call("client:scrapyard:notify", [
            String(message),
            String(type),
        ]);
    } catch {}

    try {
        player.outputChatBox(
            `!{#ffd166}[Свалка] !{#ffffff}${String(message)}`
        );
    } catch {}
}

function formatMoney(value) {
    return Math.max(
        0,
        Math.floor(Number(value) || 0)
    ).toLocaleString("ru-RU");
}

function isOnCooldown(player) {
    const expiresAt = playerCooldowns.get(player.id) || 0;
    return Date.now() < expiresAt;
}

function setCooldown(player) {
    playerCooldowns.set(
        player.id,
        Date.now() + ACTION_COOLDOWN_MS
    );
}

function clearOffer(player) {
    if (!player) {
        return;
    }

    playerOffers.delete(player.id);

    try {
        player.call("client:scrapyard:closeOffer");
    } catch {}
}

function getCharacterId(player) {
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
        player.character?.characterId,

        player.characterData?.uuid,
        player.characterData?.UUID,
        player.characterData?.id,
        player.characterData?.characterId,

        player.data?.uuid,
        player.data?.UUID,
        player.data?.characterId,
        player.data?.character_id,

        typeof player.getVariable === "function"
            ? player.getVariable("uuid")
            : null,

        typeof player.getVariable === "function"
            ? player.getVariable("UUID")
            : null,

        typeof player.getVariable === "function"
            ? player.getVariable("characterId")
            : null,

        typeof player.getVariable === "function"
            ? player.getVariable("character_id")
            : null,

        typeof player.getVariable === "function"
            ? player.getVariable("charId")
            : null,
    ];

    for (const candidate of candidates) {
        const id = positiveIntOrNull(candidate);

        if (id) {
            return id;
        }
    }

    return null;
}

function getPlayerVehicle(player) {
    if (!player || !player.vehicle) {
        return null;
    }

    if (!mp.vehicles.exists(player.vehicle)) {
        return null;
    }

    return player.vehicle;
}

function isPlayerDriver(player, vehicle) {
    if (!player || !vehicle || player.vehicle !== vehicle) {
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
        const id = positiveIntOrNull(candidate);

        if (id) {
            return id;
        }
    }

    return null;
}

function getVehiclePlate(vehicle) {
    if (!vehicle) {
        return null;
    }

    const candidates = [
        vehicle.plate,
        vehicle.numberPlate,
        vehicle.plateText,

        typeof vehicle.getVariable === "function"
            ? vehicle.getVariable("plate")
            : null,
    ];

    for (const candidate of candidates) {
        const plate = String(candidate || "").trim();

        if (plate) {
            return plate;
        }
    }

    return null;
}

function getCurrentScrapyard(player) {
    if (!player) {
        return null;
    }

    const scrapyardId = String(
        player.currentScrapyardId || ""
    );

    if (!scrapyardId) {
        return null;
    }

    return scrapyardsById.get(scrapyardId) || null;
}

function getDistance(positionA, positionB) {
    if (!positionA || !positionB) {
        return Number.POSITIVE_INFINITY;
    }

    const dx = Number(positionA.x) - Number(positionB.x);
    const dy = Number(positionA.y) - Number(positionB.y);
    const dz = Number(positionA.z) - Number(positionB.z);

    return Math.sqrt(
        dx * dx +
        dy * dy +
        dz * dz
    );
}

function isVehicleInsideScrapyard(vehicle, scrapyard) {
    if (!vehicle || !scrapyard) {
        return false;
    }

    if (
        Number(vehicle.dimension || 0) !==
        Number(scrapyard.dimension || 0)
    ) {
        return false;
    }

    return (
        getDistance(vehicle.position, scrapyard.position) <=
        scrapyard.radius + 2
    );
}

const ensureVehicleCatalogTable = vehicleCatalog.ensureSchema;
const syncVehicleCatalogFromVehicles = vehicleCatalog.syncPersistedModels;
const syncVehicleCatalogEntries = vehicleCatalog.syncEntries;

async function getCatalogVehicle(model) {
    const normalizedModel = normalizeModelName(model);

    if (!normalizedModel) {
        return null;
    }

    const rows = await executeQuery(
        `
            SELECT
                id,
                model,
                display_name,
                real_name,
                class_name,
                gov_price,
                enabled
            FROM vehicle_catalog
            WHERE LOWER(model) = ?
            LIMIT 1
        `,
        [normalizedModel]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
        return null;
    }

    return rows[0];
}

async function getOwnedVehicleRow(player, vehicle) {
    const characterId = getCharacterId(player);

    if (!characterId) {
        throw new Error(
            "Не удалось определить UUID персонажа."
        );
    }

    const vehicleDatabaseId = getVehicleDatabaseId(vehicle);
    if (!vehicleDatabaseId) {
        throw new Error("У транспорта отсутствует постоянный ID.");
    }
    if (vehicle.isPersonalVehicle !== true) {
        throw new Error("На свалке можно продать только личный транспорт.");
    }
    if (vehicleCommands.getSpawnedVehicle(vehicleDatabaseId) !== vehicle) {
        throw new Error("Личный транспорт не зарегистрирован или уже был заменён.");
    }

    const rows = await executeQuery(
        `
            SELECT *
            FROM vehicles
            WHERE id = ?
            LIMIT 1
        `,
        [vehicleDatabaseId]
    );
    const vehicleRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!vehicleRow) throw new Error("Транспорт не найден в базе данных.");
    if (!sameOwner(vehicleRow.owner, characterId)) {
        throw new Error("Этот транспорт вам не принадлежит.");
    }
    return vehicleRow;
}

function assertLiveVehicleStorageEmpty(player, storageKey) {
    const huntingService = global.twinkleHunting;
    if (!huntingService || typeof huntingService.getVehicleStorageItemCount !== "function") return;
    const itemCount = huntingService.getVehicleStorageItemCount(player, storageKey);
    if (itemCount > 0) {
        const error = new Error("Перед продажей заберите все предметы из багажника.");
        error.vehicleStorageNotEmpty = true;
        error.itemCount = itemCount;
        throw error;
    }
}

function removeLiveEmptyVehicleStorage(player, storageKey) {
    if (!player || !mp.players.exists(player)) return;
    const huntingService = global.twinkleHunting;
    if (!huntingService || typeof huntingService.removeEmptyVehicleStorage !== "function") return;
    try {
        if (!huntingService.removeEmptyVehicleStorage(player, storageKey)) {
            console.error("[VEHICLE SCRAPYARD] Live hunting storage changed after sale commit.");
        }
    } catch (error) {
        console.error("[VEHICLE SCRAPYARD] Live hunting storage cleanup failed:", error);
    }
}

function syncPlayerCashRuntime(player, cash) {
    if (!player || !mp.players.exists(player)) return false;
    const newCash = Math.max(0, Number(cash) || 0);

    player.cash = newCash;

    if ("money" in player) {
        player.money = newCash;
    }

    if (
        player.character &&
        typeof player.character === "object"
    ) {
        player.character.cash = newCash;
    }

    if (
        player.characterData &&
        typeof player.characterData === "object"
    ) {
        player.characterData.cash = newCash;
    }

    try {
        player.setVariable("cash", newCash);
    } catch {}

    try {
        player.call("client:money:update", [
            JSON.stringify({
                cash: newCash,
            }),
        ]);
    } catch {}

    try {
        player.call("c:hud:update", [
            JSON.stringify({ player: { cash: newCash } }),
        ]);
    } catch {}

    return true;
}

async function ensureScrapyardMoneyLogsTable() {
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS vehicle_scrapyard_money_logs (
            id BIGINT NOT NULL AUTO_INCREMENT,
            character_id INT NOT NULL,
            vehicle_id INT NOT NULL,
            vehicle_model VARCHAR(64) NOT NULL,
            vehicle_plate VARCHAR(32) NULL DEFAULT NULL,
            government_price INT NOT NULL DEFAULT 0,
            payout_percent DECIMAL(5,2) NOT NULL DEFAULT 75.00,
            amount INT NOT NULL DEFAULT 0,
            action VARCHAR(32) NOT NULL DEFAULT 'vehicle_scrapyard',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_scrapyard_character (character_id),
            KEY idx_scrapyard_vehicle (vehicle_id),
            KEY idx_scrapyard_created (created_at)
        )
        ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);
}

async function writeMoneyLog(data, connection = null) {
    const run = async (executor) => {
        await executor.query(`
            INSERT INTO vehicle_scrapyard_money_logs (
                character_id,
                vehicle_id,
                vehicle_model,
                vehicle_plate,
                government_price,
                payout_percent,
                amount,
                action
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'vehicle_scrapyard')
        `, [
                data.characterId,
                data.vehicleId,
                data.model,
                data.plate || null,
                data.governmentPrice,
                SCRAPYARD_PERCENT * 100,
                data.amount,
            ]);
    };

    if (connection) return run(connection);
    return db.withConn(run);
}

function isRetryableTransactionError(error) {
    return error?.code === "ER_LOCK_DEADLOCK" ||
        error?.code === "ER_LOCK_WAIT_TIMEOUT" ||
        Number(error?.errno) === 1213 ||
        Number(error?.errno) === 1205;
}

async function runTransactionWithRetry(operation, attempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (!isRetryableTransactionError(error) || attempt >= attempts) throw error;
            await new Promise((resolve) => setTimeout(resolve, attempt * 75));
        }
    }
    throw lastError;
}

async function finalizeVehicleSale({
    characterId,
    vehicleRow,
    vehicleStorageKey,
    governmentPrice,
    payout,
    assertOfferStillValid,
}) {
    await huntingRepository.ensureSchema();
    return runTransactionWithRetry(() => db.withConn(async (connection) => {
        await connection.beginTransaction();
        try {
            const [characters] = await connection.query(
                "SELECT uuid, cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
                [characterId]
            );
            if (!characters?.[0]) {
                throw new Error("Персонаж не найден в базе данных.");
            }

            const [vehicles] = await connection.query(
                "SELECT id, owner, model, plate FROM vehicles WHERE id = ? LIMIT 1 FOR UPDATE",
                [vehicleRow.id]
            );
            const lockedVehicle = vehicles?.[0];
            if (!lockedVehicle || !sameOwner(lockedVehicle.owner, characterId)) {
                throw new Error("Автомобиль уже продан или больше не принадлежит вам.");
            }

            await huntingRepository.assertAndRemoveEmptyVehicleStorage(
                connection,
                characterId,
                vehicleStorageKey
            );
            if (typeof assertOfferStillValid === "function") assertOfferStillValid();

            const cashBefore = Math.max(0, Number(characters[0].cash) || 0);
            const cashAfter = cashBefore + payout;
            const [deleteResult] = await connection.query(
                "DELETE FROM vehicles WHERE id = ? AND owner = ? LIMIT 1",
                [vehicleRow.id, characterId]
            );
            if (getAffectedRows(deleteResult) !== 1) {
                throw new Error("Автомобиль уже продан или изменён.");
            }

            const [cashResult] = await connection.query(
                "UPDATE characters SET cash = ? WHERE uuid = ? LIMIT 1",
                [cashAfter, characterId]
            );
            if (getAffectedRows(cashResult) !== 1) {
                throw new Error("Не удалось начислить деньги персонажу.");
            }

            await writeMoneyLog({
                characterId,
                vehicleId: Number(vehicleRow.id),
                model: normalizeModelName(lockedVehicle.model),
                plate: lockedVehicle.plate,
                governmentPrice,
                amount: payout,
            }, connection);

            await connection.commit();
            return { cashBefore, cashAfter };
        } catch (error) {
            try { await connection.rollback(); } catch {}
            throw error;
        }
    }));
}

function quarantineSoldVehicle(vehicleId, vehicle) {
    const id = positiveIntOrNull(vehicleId);
    if (!id || !vehicle) return;

    vehicleCommands.unregisterSpawnedVehicle(id, vehicle);
    vehicle.isPersonalVehicle = false;
    vehicle.ownerType = "scrapped";
    vehicle.ownerId = 0;
    vehicle.owner_id = 0;
    try { vehicle.engine = false; } catch {}
    try { vehicle.locked = true; } catch {}
    try {
        vehicle.setVariables({
            isPersonalVehicle: false,
            ownerType: "scrapped",
            ownerId: 0,
            owner_id: 0,
            engine: false,
            locked: true,
        });
    } catch {
        try { vehicle.setVariable("isPersonalVehicle", false); } catch {}
        try { vehicle.setVariable("ownerType", "scrapped"); } catch {}
        try { vehicle.setVariable("ownerId", 0); } catch {}
        try { vehicle.setVariable("owner_id", 0); } catch {}
        try { vehicle.setVariable("engine", false); } catch {}
        try { vehicle.setVariable("locked", true); } catch {}
    }

    mp.players.forEach((occupant) => {
        if (!occupant || !mp.players.exists(occupant) || occupant.vehicle !== vehicle) return;
        try { occupant.removeFromVehicle(); } catch {}
    });
}

function scheduleSoldVehicleCleanup(vehicleId, fallbackVehicle, attempt = 0) {
    const id = positiveIntOrNull(vehicleId);
    if (!id) return;

    let destroyed = false;
    try {
        destroyed = vehicleCommands.destroySpawnedVehicle(id);
    } catch (error) {
        console.error(`[VEHICLE SCRAPYARD] Cleanup #${id} failed:`, error);
    }
    if (destroyed) {
        const timer = soldVehicleCleanupTimers.get(id);
        if (timer) clearTimeout(timer);
        soldVehicleCleanupTimers.delete(id);
        return;
    }

    let registeredVehicle = vehicleCommands.getSpawnedVehicle(id);
    const candidate = registeredVehicle || fallbackVehicle;
    if (candidate && mp.vehicles.exists(candidate)) {
        quarantineSoldVehicle(id, candidate);
        registeredVehicle = null;
        if (!registeredVehicle) {
            if (attempt > 0) {
                try {
                    candidate.destroy();
                    soldVehicleCleanupTimers.delete(id);
                    return;
                } catch (error) {
                    console.error(`[VEHICLE SCRAPYARD] Fallback cleanup #${id} failed:`, error);
                }
            }
        }
    } else {
        soldVehicleCleanupTimers.delete(id);
        return;
    }

    if (attempt >= 11) {
        soldVehicleCleanupTimers.delete(id);
        console.error(`[VEHICLE SCRAPYARD] CRITICAL: sold vehicle entity #${id} survived cleanup retries.`);
        return;
    }

    const existingTimer = soldVehicleCleanupTimers.get(id);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(
        () => scheduleSoldVehicleCleanup(id, candidate, attempt + 1),
        Math.min(5_000, 500 * (attempt + 1))
    );
    soldVehicleCleanupTimers.set(id, timer);
}

async function createSellOffer(player) {
    if (!player || !mp.players.exists(player)) {
        return;
    }

    if (isOnCooldown(player)) {
        return;
    }

    setCooldown(player);
    clearOffer(player);

    const scrapyard = getCurrentScrapyard(player);

    if (!scrapyard) {
        return notify(
            player,
            "Вы не находитесь на территории свалки.",
            "error"
        );
    }

    const vehicle = getPlayerVehicle(player);

    if (!vehicle) {
        return notify(
            player,
            "Вы должны находиться в автомобиле.",
            "error"
        );
    }

    if (!isPlayerDriver(player, vehicle)) {
        return notify(
            player,
            "Продать автомобиль может только водитель.",
            "error"
        );
    }

    if (!isVehicleInsideScrapyard(vehicle, scrapyard)) {
        return notify(
            player,
            "Автомобиль должен находиться внутри свалки.",
            "error"
        );
    }

    const vehicleRow = await getOwnedVehicleRow(
        player,
        vehicle
    );

    const catalogRow = await getCatalogVehicle(
        vehicleRow.model
    );

    if (catalogRow && !Number(catalogRow.enabled)) {
        return notify(
            player,
            "Эта модель недоступна для продажи.",
            "error"
        );
    }

    const governmentPrice = getVehicleFallbackPrice(vehicleRow, catalogRow);
    const displayName = getVehicleDisplayName(vehicleRow, catalogRow);

    if (governmentPrice <= 0) {
        return notify(
            player,
            `Для ${displayName} не установлена государственная цена.`,
            "error"
        );
    }

    const payout = Math.max(
        1,
        Math.floor(
            governmentPrice * SCRAPYARD_PERCENT
        )
    );

    const token = [
        player.id,
        vehicleRow.id,
        Date.now(),
        Math.random().toString(36).slice(2),
    ].join(":");

    playerOffers.set(player.id, {
        token,
        scrapyardId: scrapyard.id,
        vehicleEntityId: vehicle.id,
        vehicleDatabaseId: Number(vehicleRow.id),
        characterId: getCharacterId(player),
        expiresAt: Date.now() + OFFER_LIFETIME_MS,
    });

    try {
        player.call("client:scrapyard:showOffer", [
            JSON.stringify({
                token,
                scrapyardId: scrapyard.id,
                scrapyardName: scrapyard.name,
                vehicleId: Number(vehicleRow.id),
                model: normalizeModelName(vehicleRow.model),
                displayName,
                plate:
                    vehicleRow.plate ||
                    getVehiclePlate(vehicle) ||
                    "БЕЗ НОМЕРА",
                governmentPrice,
                percent: SCRAPYARD_PERCENT * 100,
                payout,
                expiresIn: OFFER_LIFETIME_MS,
            }),
        ]);
    } catch {}

    notify(
        player,
        `Свалка предлагает $${formatMoney(payout)}. Нажмите Y для продажи или N для отмены.`,
        "success"
    );
}

async function confirmSellOffer(player, rawToken) {
    if (!player || !mp.players.exists(player)) {
        return;
    }

    if (isOnCooldown(player)) {
        return;
    }

    setCooldown(player);

    const offer = playerOffers.get(player.id);

    if (!offer) {
        return notify(
            player,
            "Предложение о продаже отсутствует.",
            "error"
        );
    }

    const token = String(rawToken || "");

    if (!token || token !== offer.token) {
        clearOffer(player);

        return notify(
            player,
            "Предложение устарело.",
            "error"
        );
    }

    if (Date.now() > offer.expiresAt) {
        clearOffer(player);

        return notify(
            player,
            "Время подтверждения истекло.",
            "error"
        );
    }

    const scrapyard = getCurrentScrapyard(player);

    if (
        !scrapyard ||
        scrapyard.id !== offer.scrapyardId
    ) {
        clearOffer(player);

        return notify(
            player,
            "Вы покинули территорию свалки.",
            "error"
        );
    }

    const vehicle = getPlayerVehicle(player);

    if (!vehicle || !mp.vehicles.exists(vehicle)) {
        clearOffer(player);

        return notify(
            player,
            "Автомобиль больше не существует.",
            "error"
        );
    }

    if (!isPlayerDriver(player, vehicle)) {
        clearOffer(player);

        return notify(
            player,
            "Вы больше не находитесь за рулём.",
            "error"
        );
    }

    if (
        Number(vehicle.id) !==
        Number(offer.vehicleEntityId)
    ) {
        clearOffer(player);

        return notify(
            player,
            "Вы сменили автомобиль.",
            "error"
        );
    }

    if (!isVehicleInsideScrapyard(vehicle, scrapyard)) {
        clearOffer(player);

        return notify(
            player,
            "Автомобиль покинул свалку.",
            "error"
        );
    }

    const characterId = getCharacterId(player);

    if (
        !characterId ||
        Number(characterId) !==
        Number(offer.characterId)
    ) {
        clearOffer(player);

        return notify(
            player,
            "Персонаж был изменён.",
            "error"
        );
    }

    const vehicleRow = await getOwnedVehicleRow(
        player,
        vehicle
    );

    if (
        Number(vehicleRow.id) !==
        Number(offer.vehicleDatabaseId)
    ) {
        clearOffer(player);

        return notify(
            player,
            "Данные автомобиля изменились.",
            "error"
        );
    }

    const catalogRow = await getCatalogVehicle(
        vehicleRow.model
    );

    if (catalogRow && !Number(catalogRow.enabled)) {
        clearOffer(player);

        return notify(
            player,
            "Продажа этой модели недоступна.",
            "error"
        );
    }

    const governmentPrice = getVehicleFallbackPrice(vehicleRow, catalogRow);
    const displayName = getVehicleDisplayName(vehicleRow, catalogRow);

    if (governmentPrice <= 0) {
        clearOffer(player);

        return notify(
            player,
            "Не установлена государственная цена.",
            "error"
        );
    }

    const payout = Math.max(
        1,
        Math.floor(
            governmentPrice * SCRAPYARD_PERCENT
        )
    );

    const vehicleStorageKey = getVehicleStorageKey(vehicle);
    assertLiveVehicleStorageEmpty(player, vehicleStorageKey);
    const assertOfferStillValid = () => {
        if (
            !mp.players.exists(player) ||
            !mp.vehicles.exists(vehicle) ||
            playerOffers.get(player.id) !== offer ||
            getPlayerVehicle(player) !== vehicle ||
            !isPlayerDriver(player, vehicle) ||
            !isVehicleInsideScrapyard(vehicle, scrapyard) ||
            getCharacterId(player) !== characterId ||
            vehicleCommands.getSpawnedVehicle(vehicleRow.id) !== vehicle
        ) {
            throw new Error("Условия продажи изменились. Верните автомобиль на свалку и повторите попытку.");
        }
        assertLiveVehicleStorageEmpty(player, vehicleStorageKey);
    };

    const sale = await finalizeVehicleSale({
        characterId,
        vehicleRow,
        vehicleStorageKey,
        governmentPrice,
        payout,
        assertOfferStillValid,
    });

    // Database state is authoritative after commit. Entity cleanup must not
    // depend on the player remaining connected long enough to receive UI sync.
    scheduleSoldVehicleCleanup(vehicleRow.id, vehicle);
    removeLiveEmptyVehicleStorage(player, vehicleStorageKey);
    clearOffer(player);
    syncPlayerCashRuntime(player, sale.cashAfter);

    notify(
        player,
        `Автомобиль ${displayName} продан за $${formatMoney(payout)}.`,
        "success"
    );

    console.log(
        `[VEHICLE SCRAPYARD] Character ${characterId} sold vehicle #${vehicleRow.id} ${vehicleRow.model} for ${payout}`
    );
}

function createScrapyard(config) {
    const scrapyard = {
        ...config,
        colshape: null,
        marker: null,
        label: null,
        blip: null,
    };

    const {
        position,
        radius,
        markerRadius,
        dimension,
    } = scrapyard;

    scrapyard.colshape = mp.colshapes.newSphere(
        position.x,
        position.y,
        position.z,
        radius
    );

    scrapyard.colshape.dimension = dimension;
    scrapyard.colshape.isVehicleScrapyard = true;
    scrapyard.colshape.scrapyardId = scrapyard.id;

    scrapyard.marker = mp.markers.new(
        1,
        new mp.Vector3(
            position.x,
            position.y,
            position.z - 1
        ),
        markerRadius,
        {
            color: [255, 180, 35, 90],
            visible: true,
            dimension,
        }
    );

    scrapyard.label = mp.labels.new(
        `${scrapyard.name}\n~w~Продажа личного транспорта`,
        new mp.Vector3(
            position.x,
            position.y,
            position.z + 1
        ),
        {
            los: true,
            font: 4,
            drawDistance: 25,
            color: [255, 210, 110, 255],
            dimension,
        }
    );

    scrapyard.blip = mp.blips.new(
        scrapyard.blipSprite,
        position,
        {
            name: scrapyard.name,
            color: scrapyard.blipColor,
            shortRange: true,
            dimension,
        }
    );

    scrapyardsById.set(
        scrapyard.id,
        scrapyard
    );

    console.log(
        `[VEHICLE SCRAPYARD] Created ${scrapyard.id} at ${position.x}, ${position.y}, ${position.z}`
    );
}

mp.events.add(
    "playerEnterColshape",
    (player, shape) => {
        if (!shape || !shape.isVehicleScrapyard) {
            return;
        }

        const scrapyard = scrapyardsById.get(
            shape.scrapyardId
        );

        if (!scrapyard) {
            return;
        }

        player.currentScrapyardId = scrapyard.id;

        try {
            player.call(
                "client:scrapyard:setInside",
                [
                    true,
                    JSON.stringify({
                        id: scrapyard.id,
                        name: scrapyard.name,
                    }),
                ]
            );
        } catch {}
    }
);

mp.events.add(
    "playerExitColshape",
    (player, shape) => {
        if (!shape || !shape.isVehicleScrapyard) {
            return;
        }

        if (
            String(player.currentScrapyardId) ===
            String(shape.scrapyardId)
        ) {
            player.currentScrapyardId = null;
        }

        clearOffer(player);

        try {
            player.call(
                "client:scrapyard:setInside",
                [
                    false,
                    "{}",
                ]
            );
        } catch {}
    }
);

mp.events.add(
    "server:scrapyard:requestOffer",
    (player) => {
        createSellOffer(player).catch((eventError) => {
            console.error(
                "[VEHICLE SCRAPYARD] requestOffer:",
                eventError
            );

            clearOffer(player);

            notify(
                player,
                eventError?.message ||
                    "Не удалось проверить автомобиль.",
                "error"
            );
        });
    }
);

mp.events.add(
    "server:scrapyard:confirm",
    (player, token) => {
        const operation = () => confirmSellOffer(player, token).catch(
            (eventError) => {
                console.error(
                    "[VEHICLE SCRAPYARD] confirm:",
                    eventError
                );

                clearOffer(player);

                notify(
                    player,
                    eventError?.message ||
                        "Не удалось продать автомобиль.",
                    "error"
                );
            }
        );
        const huntingService = global.twinkleHunting;
        if (huntingService && typeof huntingService.runExclusive === "function") {
            huntingService.runExclusive(player, "scrapyard_vehicle_sale", operation);
            return;
        }
        operation();
    }
);

mp.events.add(
    "server:scrapyard:cancel",
    (player) => {
        clearOffer(player);

        notify(
            player,
            "Продажа автомобиля отменена."
        );
    }
);

mp.events.add(
    "playerQuit",
    (player) => {
        playerOffers.delete(player.id);
        playerCooldowns.delete(player.id);
    }
);

async function initialize() {
    try {
        await ensureVehicleCatalogTable();
        await ensureScrapyardMoneyLogsTable();
        await syncVehicleCatalogFromVehicles();

        for (const config of SCRAPYARDS) {
            createScrapyard(config);
        }

        console.log(
            `[VEHICLE SCRAPYARD] Loaded ${SCRAPYARDS.length} scrapyards.`
        );
    } catch (initializeError) {
        console.error(
            "[VEHICLE SCRAPYARD] Initialization error:",
            initializeError
        );
    }
}

initialize();

module.exports = {
    SCRAPYARDS,
    SCRAPYARD_PERCENT,
    ensureVehicleCatalogTable,
    syncVehicleCatalogFromVehicles,
    syncVehicleCatalogEntries,
};
