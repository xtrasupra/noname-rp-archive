const crypto = require("crypto");
const db = require("../../database/query.js");
const furnitureService = require("../objectEditor/furniture.service.js");
const hud = require("../hud/hud.service.js");

// interiorList и garageList
// const interiorList = [ ... ];
// const garageList = [ ... ];

const houses = new Map();
const activeInteractions = new WeakMap();
const purchaseSessions = new Map();
const garageExitShapes = new Map();
const PROPERTY_INTERACTION_DISTANCE = 4;
const PURCHASE_SESSION_TTL_MS = 30000;
const GARAGE_INTERIOR = Object.freeze({ x: 228.75, y: -1005.72, z: -99.0, heading: 180 });
const PROPERTY_TABLET_CACHE_TTL_MS = 15000;
const propertyTabletCache = new Map();

function getPlayerUuid(player) {
    return Number(
        player?.character?.uuid ||
        player?.uuid ||
        player?.characterId ||
        player?.getVariable?.("uuid") ||
        0
    );
}

function isOwnedBy(house, uuid) {
    return Number(house?.user_id || 0) === Number(uuid) || String(house?.owner || "") === String(uuid);
}

function distanceBetween(left, right) {
    if (!left || !right) return Number.POSITIVE_INFINITY;
    return Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y), Number(left.z) - Number(right.z));
}

function notify(player, message, color = "#ffffff") {
    void color;
    try { player.outputChatBox(message); } catch {}
}

function closePurchaseContract(player) {
    try { player.call("client:hud:setContract", [JSON.stringify({ enabled: false })]); } catch {}
}

function clearPurchaseSession(player) {
    const session = purchaseSessions.get(Number(player?.id));
    if (session?.timeout) clearTimeout(session.timeout);
    purchaseSessions.delete(Number(player?.id));
}

function setInteraction(player, shape, house, type, garageIndex = 0) {
    activeInteractions.set(player, { shape, houseId: Number(house.id), type, garageIndex: Number(garageIndex || 0) });
    player.call("client:property:interaction", [JSON.stringify({
        contractVersion: 1,
        type,
        houseNumber: Number(house.number || house.id),
        price: Math.max(0, Number(house.price || 0)),
    })]);
}

function clearInteraction(player, shape = null) {
    const context = activeInteractions.get(player);
    if (!context || (shape && context.shape !== shape)) return;
    activeInteractions.delete(player);
    try { player.call("client:property:interaction", ["null"]); } catch {}
}

function propertyCacheKey(player) {
    const uuid = getPlayerUuid(player);
    return uuid ? String(uuid) : "";
}

function sanitizePropertyPayload(payload = {}) {
    return {
        houses: Array.isArray(payload.houses) ? payload.houses : [],
        apartments: Array.isArray(payload.apartments) ? payload.apartments : [],
    };
}

async function getPropertyTabletPayload(player, options = {}) {
    const key = propertyCacheKey(player);
    if (!key) return { houses: [], apartments: [] };

    const now = Date.now();
    const cached = propertyTabletCache.get(key);

    if (!options.force && cached?.payload && cached.expiresAt > now) {
        return cached.payload;
    }

    if (!options.force && cached?.promise) {
        return cached.promise;
    }

    const promise = Promise.all([
        buildTabletHouses(player),
        furnitureService.getTabletProperties(player, "apartment").catch((error) => {
            console.warn("[PROPERTY TABLET] Apartments unavailable:", error.message);
            return [];
        }),
    ])
        .then(([propertyList, apartmentList]) => {
            const payload = sanitizePropertyPayload({
                houses: propertyList || [],
                apartments: apartmentList || [],
            });

            propertyTabletCache.set(key, {
                payload,
                expiresAt: Date.now() + PROPERTY_TABLET_CACHE_TTL_MS,
            });

            return payload;
        })
        .catch((error) => {
            propertyTabletCache.delete(key);
            throw error;
        });

    propertyTabletCache.set(key, {
        ...(cached || {}),
        promise,
        expiresAt: now + 2500,
    });

    return promise;
}

async function pushPropertyTablet(player, options = {}) {
    const key = propertyCacheKey(player);
    const cached = key ? propertyTabletCache.get(key) : null;

    if (options.force && cached?.payload && !options.skipCachedPush) {
        try {
            player.call("client:property:tablet:update", [
                JSON.stringify(cached.payload)
            ]);
        } catch {}
    }

    const payload = await getPropertyTabletPayload(player, options);

    player.call("client:property:tablet:update", [
        JSON.stringify(payload)
    ]);

    return payload;
}

function preloadPropertyTablet(player) {
    return pushPropertyTablet(player, {
        force: true,
        reason: "preload",
    }).catch(() => null);
}

function invalidatePropertyTablet(playerOrUuid) {
    const key = typeof playerOrUuid === "string" || typeof playerOrUuid === "number"
        ? String(playerOrUuid)
        : propertyCacheKey(playerOrUuid);

    if (key) propertyTabletCache.delete(key);
}

async function loadAllHouses() {
    try {
        console.log('[HOUSES] Загрузка домов...');
        const rows = await db.query('SELECT * FROM houses');
        console.log('[HOUSES] Получено записей:', rows.length);

        rows.forEach(row => {
        const houseData = {
            id: row.id,
            number: row.number,
            address: row.address,
            street: row.street,

            price: Number(row.price),

            user_id: Number(row.user_id || 0),
            user_name: row.user_name,
            owner: String(row.owner || ""),
            is_lock: Number(row.is_lock || 0),

            interior: row.interior,

            x: parseFloat(row.x),
            y: parseFloat(row.y),
            z: parseFloat(row.z),
            rot: parseFloat(row.rot),

            ginterior1: row.ginterior1,
            gx1: parseFloat(row.gx1),
            gy1: parseFloat(row.gy1),
            gz1: parseFloat(row.gz1),
            grot1: parseFloat(row.grot1),

            ginterior2: row.ginterior2,
            gx2: parseFloat(row.gx2),
            gy2: parseFloat(row.gy2),
            gz2: parseFloat(row.gz2),
            grot2: parseFloat(row.grot2),

            ginterior3: row.ginterior3,
            gx3: parseFloat(row.gx3),
            gy3: parseFloat(row.gy3),
            gz3: parseFloat(row.gz3),
            grot3: parseFloat(row.grot3),

            blip: null,
            garageBlips: []
        };
            houses.set(row.id, houseData);

            const pos = new mp.Vector3(row.x, row.y, row.z);
            const color = (row.user_id > 0) ? 59 : 69;
            const blip = mp.blips.new(40, pos, {
                color: color,
                scale: 0.4,
                name: `Дом`,
                shortRange: true
            });
            houseData.blip = blip;

            const garageConfigs = [
                { int: row.ginterior1, x: row.gx1, y: row.gy1, z: row.gz1, name: 'Гараж 1' },
                { int: row.ginterior2, x: row.gx2, y: row.gy2, z: row.gz2, name: 'Гараж 2' },
                { int: row.ginterior3, x: row.gx3, y: row.gy3, z: row.gz3, name: 'Гараж 3' }
            ];

            garageConfigs.forEach((g, index) => {
                if (g.int >= 0 && g.x && g.y && g.z) {
                    const posG = new mp.Vector3(parseFloat(g.x), parseFloat(g.y), parseFloat(g.z));
                    const garageBlip = mp.blips.new(473, posG, {
                        color: color,
                        scale: 0.4,
                        // A shared label lets GTA group all garage blips into one
                        // pause-map legend entry, just like residential houses.
                        name: `Гараж`,
                        shortRange: true
                    });
                    houseData.garageBlips.push(garageBlip);
                }
            });

            const cpHouse = mp.colshapes.newSphere(pos.x, pos.y, pos.z + 0.5, 0.5);
            if (cpHouse) {
                cpHouse.houseId = row.id;
                cpHouse.type = 'house';
            }

            const marker = mp.markers.new(1, pos, 0.5, {
                color: [189, 255, 105, 100],
                visible: true,
                dimension: 0
            });

            garageConfigs.forEach((g, index) => {
                if (g.int >= 0 && g.x && g.y && g.z) {
                    const posG = new mp.Vector3(parseFloat(g.x), parseFloat(g.y), parseFloat(g.z));
                    const cpGarage = mp.colshapes.newSphere(posG.x, posG.y, posG.z, 1.5);
                    if (cpGarage) {
                        cpGarage.houseId = row.id;
                        cpGarage.garageIndex = index + 1;
                        cpGarage.type = 'garage';
                    }

                    const garMarker = mp.markers.new(1, posG, 1.0, {
                        color: [0, 255, 255, 100],
                        visible: true,
                        dimension: 0
                    });
                }
            });
        });
        console.log(`[HOUSES] Загружено домов: ${houses.size}`);
    } catch (err) {
        console.error('[HOUSES] Ошибка загрузки:', err);
    }
}

mp.events.add('playerEnterColshape', (player, shape) => {
    if (!player || !shape || !shape.type) return;
    console.log('[HOUSES] Enter colshape', shape.type, shape.houseId);

    if (shape.type === 'house') {
        const houseId = shape.houseId;
        const house = houses.get(houseId);
        if (!house) return;

        setInteraction(player, shape, house, 'house');
    } else if (shape.type === 'garage') {
        const houseId = shape.houseId;
        const house = houses.get(houseId);
        if (!house) return;
        setInteraction(player, shape, house, 'garage', shape.garageIndex);
    } else if (shape.type === 'garageExit') {
        const house = houses.get(Number(shape.houseId));
        if (house) setInteraction(player, shape, house, 'garageExit', shape.garageIndex);
    }
});

mp.events.add('playerExitColshape', (player, shape) => clearInteraction(player, shape));

function enterHouse(player, houseId) {
    const house = houses.get(houseId);
    if (!house) return;
    const interior = house.interior;
    const coords = interiorList[interior];
    if (!coords) {
        player.outputChatBox('~r~Ошибка: интерьер не найден');
        return;
    }
    player.dimension = houseId;
    player.position = new mp.Vector3(coords[0], coords[1], coords[2] + 1);
    player.heading = coords[3];
}

function enterGarage(player, houseId, garageIndex) {
    const house = houses.get(houseId);
    if (!house) return;
    const key = `ginterior${garageIndex}`;
    const garageId = house[key];
    if (garageId < 0) {
        player.outputChatBox('~r~Гараж недоступен');
        return;
    }
    const target = player.vehicle || player;
    if (player.vehicle && ![0, -1].includes(Number(player.seat))) {
        notify(player, 'Only the driver can enter the garage.', '#ff6666');
        return;
    }
    const exitKey = `${houseId}:${garageIndex}`;
    if (!garageExitShapes.has(exitKey)) {
        const exitShape = mp.colshapes.newSphere(GARAGE_INTERIOR.x, GARAGE_INTERIOR.y, GARAGE_INTERIOR.z, 3, Number(houseId));
        exitShape.type = 'garageExit';
        exitShape.houseId = Number(houseId);
        exitShape.garageIndex = Number(garageIndex);
        garageExitShapes.set(exitKey, exitShape);
    }
    target.dimension = Number(houseId);
    target.position = new mp.Vector3(GARAGE_INTERIOR.x, GARAGE_INTERIOR.y, GARAGE_INTERIOR.z);
    if (target === player) player.heading = GARAGE_INTERIOR.heading;
}

function exitGarage(player, houseId, garageIndex) {
    const house = houses.get(Number(houseId));
    if (!house) return;
    const position = {
        x: Number(house[`gx${garageIndex}`]), y: Number(house[`gy${garageIndex}`]),
        z: Number(house[`gz${garageIndex}`]), heading: Number(house[`grot${garageIndex}`] || 0),
    };
    if (![position.x, position.y, position.z, position.heading].every(Number.isFinite)) return;
    const target = player.vehicle || player;
    if (player.vehicle && ![0, -1].includes(Number(player.seat))) return;
    target.dimension = 0;
    target.position = new mp.Vector3(position.x, position.y, position.z);
    if (target === player) player.heading = position.heading;
}

mp.events.add('exitHouse', (player) => {
    const houseId = player.getVariable('house_id');
    if (!houseId) {
        player.outputChatBox('~r~Вы не находитесь в доме.');
        return;
    }
    const house = houses.get(houseId);
    if (!house) return;
    player.dimension = 0;
    player.position = new mp.Vector3(house.x, house.y, house.z);
    player.heading = house.rot;
    player.outputChatBox('~g~Вы вышли из дома.');
});

mp.events.add('playerQuit', (player) => {
    clearInteraction(player);
    clearPurchaseSession(player);
});

async function buildTabletHouses(player) {

    const uuid = Number(
        player?.character?.uuid ||
        player?.uuid ||
        player?.characterId ||
        player?.getVariable?.("uuid") ||
        0
    );

    console.log("================================");
    console.log("[TABLET] Player debug", {
        name: player?.name,
        uuid,
        playerUuid: player?.uuid,
        characterUuid: player?.character?.uuid,
        variableUuid: player?.getVariable?.("uuid")
    });


    if (!uuid) {
        console.log("[TABLET] UUID NOT FOUND");
        return [];
    }


    const rows = await db.query(`
        SELECT
            id,
            number,
            address,
            street,
            price,
            is_lock,
            user_id,
            owner
        FROM houses
        WHERE user_id = ?
           OR owner = ?
    `,[uuid, String(uuid)]);


    console.log("[TABLET] SQL result:", rows.length);


    const owned = rows.map(house => {

        console.log("[TABLET MATCH]", {
            id: house.id,
            user_id: house.user_id,
            owner: house.owner
        });


        return {

            id: house.id,

            number: house.number,

            title:
                `Дом #${house.number}`,

            address:
                house.address ||
                `Дом #${house.number}`,

            image:
                "/property/house.png",

            propertyType:
                "house",

            owner:
                String(uuid),


            locked:Boolean(Number(house.is_lock || 0)),

            paidUntil:"-",

            residentLimit:5,

            residents:[],
            furniture:[],
            interiors:[],
            garage:[],
            storage:[],
            access:[],
            logs:[],
            actions:[],

            settings:{},


            features:[
                {
                    label:"Стоимость",
                    value:`$${house.price || 0}`
                },
                {
                    label:"Улица",
                    value:house.street || "-"
                }
            ]
        };
    });


    console.log("[TABLET] Owned houses:", owned.length);

    console.log("================================");


    return owned;
}

async function debugDatabase() {
    try {
        const dbName = await db.query(`
            SELECT DATABASE() AS db
        `);

        console.log("[DEBUG DATABASE]", dbName);

        const house = await db.query(`
            SELECT id, user_id, owner
            FROM houses
            WHERE id = 1
        `);

        console.log("[DEBUG HOUSE ID 1]", house);

    } catch (e) {
        console.error("[DEBUG DATABASE ERROR]", e);
    }
}


debugDatabase();
loadAllHouses();

mp.events.add(
    "server:property:tablet:request",
    async (player) => {

        try {

            const payload = await pushPropertyTablet(player, {
                force: true,
                reason: "request",
            });

            console.log(
                "[PROPERTY TABLET] SEND:",
                payload.houses.length
            );

        } catch (e) {

            console.error(
                "[PROPERTY TABLET ERROR]",
                e
            );

            player.call(
                "client:property:tablet:update",
                [
                    JSON.stringify({
                        houses: [],
                        apartments: []
                    })
                ]
            );
        }

    }
);

mp.events.add(
    "server:property:route",
    (player, houseId) => {

        const house = houses.get(Number(houseId));
        if (!house) return;

        player.call(
            "client:property:setWaypoint",
            [
                house.x,
                house.y
            ]
        );

    }
);

mp.events.add(
    "server:property:lock",
    async (player, houseId, state) => {

        houseId = Number(houseId);

        const house = houses.get(houseId);

        if (!house)
            return;

        const uuid = Number(
            player.character?.uuid ??
            player.getVariable("uuid") ??
            0
        );

        if (Number(house.user_id) !== uuid) {
            player.outputChatBox("~r~Это не ваш дом.");
            return;
        }

        house.is_lock = state ? 1 : 0;

        await db.query(
            "UPDATE houses SET is_lock = ? WHERE id = ?",
            [
                house.is_lock,
                houseId
            ]
        );

        player.outputChatBox(
            state
                ? "~g~Дом закрыт."
                : "~g~Дом открыт."
        );

        player.call(
            "client:property:tablet:updateLock",
            [
                houseId,
                state
            ]
        );

        invalidatePropertyTablet(player);
        pushPropertyTablet(player, {
            force: true,
            reason: "lock",
            skipCachedPush: true,
        }).catch(() => null);

    }
);

mp.events.add("twinkle:character:loaded", (player) => {
    setTimeout(() => {
        preloadPropertyTablet(player);
    }, 1200);
});

mp.events.add("playerQuit", (player) => {
    invalidatePropertyTablet(player);
});

mp.events.add(
    "server:property:enterHouse",
    (player, houseId) => {

        const house = houses.get(Number(houseId));
        if (!house) return;

        // Проверка владельца
        const uuid = Number(
            player.character?.uuid ??
            player.getVariable("uuid") ??
            0
        );

        if (
            Number(house.user_id) !== uuid &&
            String(house.owner) !== String(uuid)
        ) {
            player.outputChatBox("~r~Это не ваш дом.");
            return;
        }

        // Проверка замка
        if (Number(house.is_lock) === 1) {
            player.outputChatBox("~r~Дом закрыт.");
            return;
        }

        // Используем существующую функцию
        enterHouse(player, Number(houseId));
    }
);

mp.events.add(
    "server:property:exitHouse",
    (player) => {

        const house = houses.get(player.dimension);

        if (!house) {
            player.outputChatBox("~r~Вы не находитесь в доме.");
            return;
        }

        player.dimension = 0;
        player.position = new mp.Vector3(
            house.x,
            house.y,
            house.z
        );
        player.heading = house.rot;
    }
);

mp.events.add(
    "server:property:enterGarage",
    (player, houseId, garageIndex) => {

        const house = houses.get(Number(houseId));
        if (!house) return;

        const uuid = Number(
            player.character?.uuid ??
            player.getVariable("uuid") ??
            0
        );

        if (
            Number(house.user_id) !== uuid &&
            String(house.owner) !== String(uuid)
        ) {
            player.outputChatBox("~r~Это не ваш гараж.");
            return;
        }

        enterGarage(
            player,
            Number(houseId),
            Number(garageIndex)
        );
    }
);

function handlePropertyInteract(player) {
    const context = activeInteractions.get(player);
    const house = context ? houses.get(Number(context.houseId)) : null;
    if (!context || !house) return;
    const expectedPosition = context.type === "house" ? house : context.type === "garageExit"
        ? GARAGE_INTERIOR
        : { x: house[`gx${context.garageIndex}`], y: house[`gy${context.garageIndex}`], z: house[`gz${context.garageIndex}`] };
    const expectedDimension = context.type === "garageExit" ? Number(house.id) : 0;
    if (Number(player.dimension) !== expectedDimension || distanceBetween(player.position, expectedPosition) > PROPERTY_INTERACTION_DISTANCE) {
        clearInteraction(player);
        return;
    }
    const uuid = getPlayerUuid(player);
    if (!uuid) return;
    if (context.type === "garageExit") return exitGarage(player, house.id, context.garageIndex);
    if (context.type === "garage") {
        if (!isOwnedBy(house, uuid)) return notify(player, "This garage does not belong to you.", "#ff6666");
        return enterGarage(player, house.id, context.garageIndex);
    }
    if (Number(house.user_id || 0) > 0) {
        return notify(player, isOwnedBy(house, uuid) ? "Use the tablet to manage your house." : "This house is already owned.", "#ffcc66");
    }
    clearPurchaseSession(player);
    const token = crypto.randomBytes(18).toString("hex");
    const session = { token, houseId: Number(house.id), uuid, playerName: String(player.name || "Unknown"), createdAt: Date.now(), processing: false, timeout: null };
    session.timeout = setTimeout(() => {
        if (purchaseSessions.get(Number(player.id)) !== session) return;
        purchaseSessions.delete(Number(player.id));
        closePurchaseContract(player);
    }, PURCHASE_SESSION_TTL_MS);
    purchaseSessions.set(Number(player.id), session);
    player.call("client:hud:setContract", [JSON.stringify({
        id: `house:${house.id}`, enabled: true, title: `Buy house #${house.number || house.id}`,
        description: `${house.address || house.street || "Property"}. Price: $${Number(house.price).toLocaleString("en-US")}.`,
        trueAction: { label: "Buy", event: "contract:accept", payload: { type: "housePurchase", token } },
        falseAction: { label: "Cancel", event: "contract:decline", payload: { type: "housePurchase", token } },
    })]);
}

mp.events.add("server:property:interact", handlePropertyInteract);
mp.events.add("buyHouse", handlePropertyInteract);

function parseHouseContract(rawPayload) {
    let payload = rawPayload;
    try { if (typeof rawPayload === "string") payload = JSON.parse(rawPayload); } catch { return null; }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    if (payload.type !== "housePurchase" || typeof payload.token !== "string" || !/^[a-f0-9]{36}$/.test(payload.token)) return null;
    return payload;
}

mp.events.add("server:contract:accept", async (player, rawPayload) => {
    const payload = parseHouseContract(rawPayload);
    if (!payload) return;
    const session = purchaseSessions.get(Number(player.id));
    if (!session || session.token !== payload.token || session.processing || Date.now() - session.createdAt > PURCHASE_SESSION_TTL_MS) {
        return notify(player, "The purchase offer has expired.", "#ff6666");
    }
    const house = houses.get(session.houseId);
    const context = activeInteractions.get(player);
    if (!house || !context || context.houseId !== house.id || context.type !== "house" || distanceBetween(player.position, house) > PROPERTY_INTERACTION_DISTANCE) {
        clearPurchaseSession(player); closePurchaseContract(player);
        return notify(player, "Return to the house entrance.", "#ff6666");
    }
    session.processing = true;
    try {
        const result = await db.withConn(async (connection) => {
            await connection.beginTransaction();
            try {
                const [[character]] = await connection.query("SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE", [session.uuid]);
                const [[lockedHouse]] = await connection.query("SELECT user_id, owner, price FROM houses WHERE id = ? LIMIT 1 FOR UPDATE", [house.id]);
                if (!character || !lockedHouse) throw new Error("PROPERTY_NOT_FOUND");
                if (Number(lockedHouse.user_id || 0) > 0 || Number(lockedHouse.owner || 0) > 0) throw new Error("PROPERTY_ALREADY_OWNED");
                const price = Math.max(0, Number(lockedHouse.price || house.price));
                if (Number(character.cash || 0) < price) throw new Error("INSUFFICIENT_CASH");
                await connection.query("UPDATE characters SET cash = cash - ? WHERE uuid = ?", [price, session.uuid]);
                await connection.query("UPDATE houses SET user_id = ?, user_name = ?, owner = ? WHERE id = ?", [session.uuid, session.playerName, String(session.uuid), house.id]);
                await connection.commit();
                return { cash: Number(character.cash) - price, price };
            } catch (error) {
                try { await connection.rollback(); } catch {}
                throw error;
            }
        });
        house.user_id = session.uuid; house.user_name = session.playerName; house.owner = String(session.uuid);
        try { if (house.blip) house.blip.color = 59; } catch {}
        house.garageBlips.forEach((blip) => { try { blip.color = 59; } catch {} });
        try {
            if (player.character) player.character.cash = result.cash;
            if (player.characterData) player.characterData.cash = result.cash;
            player.setVariable("cash", result.cash);
            player.setVariable("house_id", house.id);
        } catch {}
        try { hud.update(player, { player: { finance: { cash: result.cash } } }); } catch {}
        invalidatePropertyTablet(player);
        notify(player, `House #${house.number || house.id} purchased for $${result.price.toLocaleString("en-US")}.`, "#66ff99");
    } catch (error) {
        const message = error?.message === "INSUFFICIENT_CASH" ? "Not enough cash."
            : error?.message === "PROPERTY_ALREADY_OWNED" ? "This house has already been purchased." : "House purchase failed.";
        console.error("[HOUSES] Purchase failed:", error);
        notify(player, message, "#ff6666");
    } finally {
        clearPurchaseSession(player);
        closePurchaseContract(player);
    }
});

mp.events.add("server:contract:decline", (player, rawPayload) => {
    const payload = parseHouseContract(rawPayload);
    if (!payload) return;
    const session = purchaseSessions.get(Number(player.id));
    if (!session || session.token !== payload.token) return;
    clearPurchaseSession(player);
    closePurchaseContract(player);
});

module.exports = { houses };
