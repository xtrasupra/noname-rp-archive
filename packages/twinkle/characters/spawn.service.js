"use strict";

const db = require("../database/query.js");
const { getCondoDimension, getCondoInterior } = require("../systems/condos/condos.config.js");
const { STARTER_SPAWNS } = require("../systems/quests/quest.config.js");

const DEFAULT_SPAWN_TYPE = "default";
const SPAWN_CONTRACT_VERSION = 1;

const DEFAULT_SPAWN = {
    type: DEFAULT_SPAWN_TYPE,
    title: "Начальный спавн",

    position: {
        x: -1037.75,
        y: -2737.62,
        z: 20.17,
    },

    heading: 327.0,
    dimension: 0,
};

const POSITION_SAVE_INTERVAL_MS = 60_000;

/**
 * Не сохраняем позицию персонажа, если он находится
 * в техническом измерении или координаты некорректны.
 *
 * При необходимости можно изменить ограничения.
 */
const MAX_VALID_DIMENSION = 2_147_483_647;

const positionSaveLocks = new Set();

/* -------------------------------------------------------------------------- */
/*                              Базовые функции                               */
/* -------------------------------------------------------------------------- */

function safeJson(value, fallback = null) {
    try {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return fallback;
        }

        if (typeof value === "object") {
            return value;
        }

        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function toInteger(value, fallback = 0) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.floor(number);
}

/**
 * Поддерживает разные варианты ответа:
 *
 * mysql2:
 * [
 *     [rows],
 *     fields
 * ]
 *
 * кастомная обёртка:
 * [row, row]
 *
 * объект:
 * { rows: [...] }
 */
function unwrapRows(result) {
    if (!result) {
        return [];
    }

    if (
        Array.isArray(result) &&
        Array.isArray(result[0])
    ) {
        return result[0];
    }

    if (
        result &&
        Array.isArray(result.rows)
    ) {
        return result.rows;
    }

    if (Array.isArray(result)) {
        return result;
    }

    return [];
}

function unwrapQueryResult(result) {
    if (!result) {
        return null;
    }

    /*
     * mysql2 UPDATE:
     * [ResultSetHeader, fields]
     */
    if (
        Array.isArray(result) &&
        result[0] &&
        !Array.isArray(result[0]) &&
        typeof result[0] === "object"
    ) {
        return result[0];
    }

    return result;
}

function isPlayerValid(player) {
    if (!player) {
        return false;
    }

    try {
        return mp.players.exists(player);
    } catch {
        /*
         * На playerQuit mp.players.exists уже может вернуть false,
         * хотя position и uuid ещё доступны.
         */
        return true;
    }
}

function isValidPosition(position) {
    if (!position) {
        return false;
    }

    const x = Number(
        position.x ??
        position.X
    );

    const y = Number(
        position.y ??
        position.Y
    );

    const z = Number(
        position.z ??
        position.Z
    );

    return (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Number.isFinite(z)
    );
}

function isZeroPosition(position) {
    if (!position) {
        return true;
    }

    return (
        Math.abs(Number(position.x) || 0) < 0.01 &&
        Math.abs(Number(position.y) || 0) < 0.01 &&
        Math.abs(Number(position.z) || 0) < 0.01
    );
}

function normalizePosition(
    rawPosition,
    fallback = DEFAULT_SPAWN
) {
    const source = rawPosition || {};

    const fallbackPosition =
        fallback?.position ||
        fallback ||
        DEFAULT_SPAWN.position;

    const fallbackHeading = toFiniteNumber(
        fallback?.heading ??
        fallbackPosition?.heading,
        DEFAULT_SPAWN.heading
    );

    const fallbackDimension = toInteger(
        fallback?.dimension ??
        fallbackPosition?.dimension,
        DEFAULT_SPAWN.dimension
    );

    return {
        x: toFiniteNumber(
            source.x ?? source.X,
            toFiniteNumber(
                fallbackPosition.x ??
                fallbackPosition.X,
                DEFAULT_SPAWN.position.x
            )
        ),

        y: toFiniteNumber(
            source.y ?? source.Y,
            toFiniteNumber(
                fallbackPosition.y ??
                fallbackPosition.Y,
                DEFAULT_SPAWN.position.y
            )
        ),

        z: toFiniteNumber(
            source.z ?? source.Z,
            toFiniteNumber(
                fallbackPosition.z ??
                fallbackPosition.Z,
                DEFAULT_SPAWN.position.z
            )
        ),

        heading: toFiniteNumber(
            source.heading ??
            source.h ??
            source.H ??
            source.rotation ??
            source.rotationZ,
            fallbackHeading
        ),

        dimension: Math.max(
            0,
            toInteger(
                source.dimension ??
                source.dim ??
                source.Dimension,
                fallbackDimension
            )
        ),
    };
}

function makeSpawn(
    type,
    title,
    rawPosition,
    heading = undefined,
    dimension = undefined,
    extra = {}
) {
    const source = rawPosition || {};

    const normalized = normalizePosition({
        ...source,

        heading:
            heading ??
            source.heading ??
            source.h ??
            source.H,

        dimension:
            dimension ??
            source.dimension ??
            source.dim,
    });

    return {
        ...extra,

        type: String(
            type || DEFAULT_SPAWN_TYPE
        ),

        title: String(
            title || "Место появления"
        ),

        position: {
            x: normalized.x,
            y: normalized.y,
            z: normalized.z,
        },

        heading: normalized.heading,
        dimension: normalized.dimension,
    };
}

/* -------------------------------------------------------------------------- */
/*                        Получение данных персонажа                           */
/* -------------------------------------------------------------------------- */

function getCharacter(player) {
    return (
        player?.character ||
        player?.characterData ||
        player?.data?.character ||
        null
    );
}

function getCharacterUuid(player) {
    const character = getCharacter(player);

    const values = [
        player?.uuid,
        player?.characterId,
        player?.characterUUID,
        player?.characterUuid,

        character?.uuid,
        character?.id,

        player?.data?.uuid,
        player?.data?.characterId,

        typeof player?.getVariable === "function"
            ? player.getVariable("uuid")
            : null,

        typeof player?.getVariable === "function"
            ? player.getVariable("UUID")
            : null,

        typeof player?.getVariable === "function"
            ? player.getVariable("characterId")
            : null,
    ];

    for (const value of values) {
        const uuid = Number(value);

        if (
            Number.isInteger(uuid) &&
            uuid > 0
        ) {
            return uuid;
        }
    }

    return 0;
}

function getCharacterFractionId(player) {
    const character = getCharacter(player);

    const values = [
        character?.fraction_id,
        character?.fractionId,
        character?.fraction,
        character?.organization_id,
        character?.organizationId,

        player?.fraction_id,
        player?.fractionId,
        player?.fraction,
        player?.organization_id,
        player?.organizationId,

        player?.data?.fraction_id,
        player?.data?.fractionId,
        player?.data?.fraction,
        player?.data?.organizationId,

        typeof player?.getVariable === "function"
            ? player.getVariable("fraction_id")
            : null,

        typeof player?.getVariable === "function"
            ? player.getVariable("fractionId")
            : null,

        typeof player?.getVariable === "function"
            ? player.getVariable("fraction")
            : null,

        typeof player?.getVariable === "function"
            ? player.getVariable("organizationId")
            : null,
    ];

    for (const value of values) {
        const fractionId = Number(value);

        if (
            Number.isInteger(fractionId) &&
            fractionId > 0
        ) {
            return fractionId;
        }
    }

    return 0;
}

function getCurrentPlayerPosition(player) {
    if (!player) {
        return null;
    }

    let position;

    try {
        position = player.position;
    } catch {
        return null;
    }

    if (!isValidPosition(position)) {
        return null;
    }

    let heading = 0;
    let dimension = 0;

    try {
        heading = toFiniteNumber(
            player.heading ??
            player.rotation?.z,
            0
        );
    } catch {
        heading = 0;
    }

    try {
        dimension = Math.max(
            0,
            toInteger(player.dimension, 0)
        );
    } catch {
        dimension = 0;
    }

    if (dimension > MAX_VALID_DIMENSION) {
        dimension = 0;
    }

    return normalizePosition({
        x: position.x,
        y: position.y,
        z: position.z,
        heading,
        dimension,
    });
}

/* -------------------------------------------------------------------------- */
/*                           Начальный спавн                                  */
/* -------------------------------------------------------------------------- */

function getDefaultSpawn() {
    const primaryStarterSpawn =
        getGuideStarterSpawns()[0] || null;

    if (primaryStarterSpawn) {
        return makeSpawn(
            DEFAULT_SPAWN.type,
            primaryStarterSpawn.title || DEFAULT_SPAWN.title,
            primaryStarterSpawn.position,
            primaryStarterSpawn.heading,
            primaryStarterSpawn.dimension,
            {
                icon: primaryStarterSpawn.icon,
            }
        );
    }

    return makeSpawn(
        DEFAULT_SPAWN.type,
        DEFAULT_SPAWN.title,
        DEFAULT_SPAWN.position,
        DEFAULT_SPAWN.heading,
        DEFAULT_SPAWN.dimension
    );
}

function isGuideStarterSpawn(spawn) {
    return Boolean(
        spawn &&
        spawn.kind === "npc" &&
        typeof spawn.npcId === "string" &&
        spawn.npcId.startsWith("guide_")
    );
}

function getGuideStarterSpawns() {
    return STARTER_SPAWNS.filter(isGuideStarterSpawn);
}

function getStarterSpawnOptions() {
    return getGuideStarterSpawns().map(
        (spawn, index) => makeSpawn(
            index === 0
                ? DEFAULT_SPAWN_TYPE
                : spawn.type,
            spawn.title,
            spawn.position,
            spawn.heading,
            spawn.dimension,
            {
                icon: spawn.icon,
                kind: spawn.kind,
                npcId: spawn.npcId,
                starterIndex: index,
            }
        )
    );
}

function getRandomStarterSpawn(random = Math.random) {
    const candidates = getStarterSpawnOptions();

    if (!candidates.length) {
        return getDefaultSpawn();
    }

    const randomValue = Number(random());
    const normalizedRandom = Number.isFinite(randomValue)
        ? Math.max(0, Math.min(0.9999999999999999, randomValue))
        : 0;
    const selected = candidates[
        Math.floor(normalizedRandom * candidates.length)
    ] || candidates[0];

    // The concrete NPC point remains an implementation detail. The client
    // sees one familiar initial-spawn option and previews the point chosen
    // once for this selector session.
    return makeSpawn(
        DEFAULT_SPAWN_TYPE,
        DEFAULT_SPAWN.title,
        selected.position,
        selected.heading,
        selected.dimension,
        {
            icon: "default",
            kind: "random",
        }
    );
}

/* -------------------------------------------------------------------------- */
/*                         Последнее место персонажа                           */
/* -------------------------------------------------------------------------- */

function getLastSpawnFromCharacterMemory(player) {
    const character = getCharacter(player);

    if (!character?.position) {
        return null;
    }

    const rawPosition = safeJson(
        character.position,
        null
    );

    if (
        !rawPosition ||
        !isValidPosition(rawPosition)
    ) {
        return null;
    }

    const position =
        normalizePosition(rawPosition);

    if (isZeroPosition(position)) {
        return null;
    }

    return makeSpawn(
        "last",
        "Последнее место",
        position,
        position.heading,
        position.dimension
    );
}

async function getLastSpawnFromDatabase(
    characterUuid
) {
    if (!characterUuid) {
        return null;
    }

    try {
        const result = await db.query(
            `
                SELECT position
                FROM characters
                WHERE uuid = ?
                LIMIT 1
            `,
            [characterUuid]
        );

        const rows = unwrapRows(result);
        const characterRow = rows[0];

        if (!characterRow?.position) {
            return null;
        }

        const rawPosition = safeJson(
            characterRow.position,
            null
        );

        if (
            !rawPosition ||
            !isValidPosition(rawPosition)
        ) {
            console.log(
                `[SPAWN SELECTOR] Character ${characterUuid} has invalid position JSON.`
            );

            return null;
        }

        const position =
            normalizePosition(rawPosition);

        if (isZeroPosition(position)) {
            return null;
        }

        return makeSpawn(
            "last",
            "Последнее место",
            position,
            position.heading,
            position.dimension
        );
    } catch (error) {
        console.error(
            `[SPAWN SELECTOR] Failed to load last position for character ${characterUuid}:`,
            error?.stack || error
        );

        return null;
    }
}

async function getLastSpawn(
    player,
    characterUuid
) {
    /*
     * Сначала используем свежую позицию,
     * уже загруженную в объект персонажа.
     */
    const memorySpawn =
        getLastSpawnFromCharacterMemory(player);

    if (memorySpawn) {
        return memorySpawn;
    }

    return getLastSpawnFromDatabase(
        characterUuid
    );
}

/* -------------------------------------------------------------------------- */
/*                               Дом                                           */
/* -------------------------------------------------------------------------- */

async function getHouseSpawn(characterUuid) {
    if (!characterUuid) {
        return null;
    }

    try {
        const result = await db.query(
            `
                SELECT
                    id,
                    x,
                    y,
                    z,
                    dimension
                FROM houses
                WHERE owner = ?
                   OR owner = ?
                LIMIT 1
            `,
            [
                String(characterUuid),
                characterUuid,
            ]
        );

        const rows = unwrapRows(result);
        const house = rows[0];

        if (!house) {
            return null;
        }

        if (
            !isValidPosition({
                x: house.x,
                y: house.y,
                z: house.z,
            })
        ) {
            return null;
        }

        return makeSpawn(
            "house",
            `Дом #${house.id}`,
            {
                x: house.x,
                y: house.y,
                z: house.z,
            },
            0,
            house.dimension || 0
        );
    } catch (error) {
        console.log(
            "[SPAWN SELECTOR] House spawn skipped:",
            error?.message || error
        );

        return null;
    }
}

/* -------------------------------------------------------------------------- */
/*                              Квартира                                       */
/* -------------------------------------------------------------------------- */

async function getApartmentSpawn(characterUuid) {
    if (!characterUuid) {
        return null;
    }

    try {
        const result = await db.query(
            `
                SELECT
                    id,
                    number,
                    interior
                FROM condos
                WHERE user_id = ?
                LIMIT 1
            `,
            [Number(characterUuid)]
        );

        const rows = unwrapRows(result);
        const apartment = rows[0];

        if (!apartment) {
            return null;
        }

        const interior = getCondoInterior(apartment.interior);
        if (!interior || !isValidPosition(interior)) return null;

        return makeSpawn(
            "apartment",
            `Квартира #${apartment.number || apartment.id}`,
            {
                x: interior.x,
                y: interior.y,
                z: interior.z,
            },
            interior.heading,
            getCondoDimension(apartment.id)
        );
    } catch (error) {
        console.log(
            "[SPAWN SELECTOR] Apartment spawn skipped:",
            error?.message || error
        );

        return null;
    }
}

/* -------------------------------------------------------------------------- */
/*                         Фракционная точка                                   */
/* -------------------------------------------------------------------------- */

function parseFractionSpawnPoints(rawSpawnPoints) {
    const parsed = safeJson(
        rawSpawnPoints,
        []
    );

    let points = [];

    if (Array.isArray(parsed)) {
        points = parsed;
    } else if (
        parsed &&
        typeof parsed === "object"
    ) {
        if (Array.isArray(parsed.points)) {
            points = parsed.points;
        } else if (
            Array.isArray(parsed.spawns)
        ) {
            points = parsed.spawns;
        } else if (
            Array.isArray(parsed.spawn_points)
        ) {
            points = parsed.spawn_points;
        } else {
            points = [parsed];
        }
    }

    return points
        .map((rawPoint, index) => {
            if (
                !rawPoint ||
                typeof rawPoint !== "object"
            ) {
                return null;
            }

            if (!isValidPosition(rawPoint)) {
                return null;
            }

            const position =
                normalizePosition(rawPoint);

            if (isZeroPosition(position)) {
                return null;
            }

            return {
                index,

                name:
                    rawPoint.name ||
                    rawPoint.title ||
                    rawPoint.label ||
                    null,

                x: position.x,
                y: position.y,
                z: position.z,
                heading: position.heading,
                dimension: position.dimension,
            };
        })
        .filter(Boolean);
}

function getLegacyFractionSpawn(fraction) {
    if (!fraction) {
        return null;
    }

    const rawPosition = {
        x: fraction.spawn_x,
        y: fraction.spawn_y,
        z: fraction.spawn_z,
        heading: fraction.spawn_h,
        dimension:
            fraction.spawn_dimension,
    };

    if (!isValidPosition(rawPosition)) {
        return null;
    }

    const position =
        normalizePosition(rawPosition);

    if (isZeroPosition(position)) {
        return null;
    }

    return position;
}

async function findFractionRow(
    fractionIdentifier
) {
    if (!fractionIdentifier) {
        return null;
    }

    /*
     * Сначала строго ищем по fraction_id.
     *
     * В твоей таблице:
     * id = внутренний ID записи;
     * fraction_id = игровой ID фракции.
     */
    let result = await db.query(
        `
            SELECT
                id,
                fraction_id,
                name,
                short_name,
                type,
                spawn_points,
                spawn_x,
                spawn_y,
                spawn_z,
                spawn_h,
                spawn_dimension,
                is_active
            FROM fractions
            WHERE fraction_id = ?
              AND is_active = 1
            LIMIT 1
        `,
        [fractionIdentifier]
    );

    let rows = unwrapRows(result);
    let fraction = rows[0] || null;

    if (fraction) {
        return fraction;
    }

    /*
     * Резервный вариант.
     *
     * Нужен, если где-то в player.character записан
     * внутренний fractions.id, а не fractions.fraction_id.
     */
    result = await db.query(
        `
            SELECT
                id,
                fraction_id,
                name,
                short_name,
                type,
                spawn_points,
                spawn_x,
                spawn_y,
                spawn_z,
                spawn_h,
                spawn_dimension,
                is_active
            FROM fractions
            WHERE id = ?
              AND is_active = 1
            LIMIT 1
        `,
        [fractionIdentifier]
    );

    rows = unwrapRows(result);
    fraction = rows[0] || null;

    return fraction;
}

async function getFractionSpawn(player) {
    const fractionIdentifier =
        getCharacterFractionId(player);

    if (!fractionIdentifier) {
        return null;
    }

    try {
        const fraction =
            await findFractionRow(
                fractionIdentifier
            );

        if (!fraction) {
            console.log(
                `[SPAWN SELECTOR] Fraction ${fractionIdentifier} not found by fraction_id or id.`
            );

            return null;
        }

        const spawnPoints =
            parseFractionSpawnPoints(
                fraction.spawn_points
            );

        const selectedSpawn =
            spawnPoints[0] ||
            getLegacyFractionSpawn(fraction);

        if (!selectedSpawn) {
            console.log(
                `[SPAWN SELECTOR] Fraction ${fraction.fraction_id} (${fraction.name}) has no valid spawn point.`
            );

            return null;
        }

        const displayName =
            fraction.short_name
                ? `${fraction.name} (${fraction.short_name})`
                : fraction.name;

        console.log(
            `[SPAWN SELECTOR] Fraction spawn loaded: identifier=${fractionIdentifier}, rowId=${fraction.id}, fractionId=${fraction.fraction_id}, name=${fraction.name}`
        );

        return makeSpawn(
            "fraction",
            `Фракция: ${displayName}`,
            selectedSpawn,
            selectedSpawn.heading,
            selectedSpawn.dimension
        );
    } catch (error) {
        console.error(
            "[SPAWN SELECTOR] Fraction spawn error:",
            error?.stack || error
        );

        return null;
    }
}

/* -------------------------------------------------------------------------- */
/*                          Формирование списка                                */
/* -------------------------------------------------------------------------- */

async function buildSpawnPayload(player) {
    const characterUuid =
        getCharacterUuid(player);

    const options = [getRandomStarterSpawn()];

    const [
        lastSpawn,
        houseSpawn,
        apartmentSpawn,
        fractionSpawn,
    ] = await Promise.all([
        getLastSpawn(
            player,
            characterUuid
        ),

        getHouseSpawn(characterUuid),

        getApartmentSpawn(characterUuid),

        getFractionSpawn(player),
    ]);

    if (lastSpawn) {
        options.push(lastSpawn);
    }

    if (houseSpawn) {
        options.push(houseSpawn);
    }

    if (apartmentSpawn) {
        options.push(apartmentSpawn);
    }

    if (fractionSpawn) {
        options.push(fractionSpawn);
    }

    return {
        contractVersion: SPAWN_CONTRACT_VERSION,
        selected: DEFAULT_SPAWN_TYPE,
        options,
    };
}

async function getSpawnByType(
    player,
    requestedType = DEFAULT_SPAWN_TYPE,
    { allowFallback = true } = {}
) {
    const type = String(
        requestedType ||
        DEFAULT_SPAWN_TYPE
    ).trim();

    const payload =
        await buildSpawnPayload(player);

    const selected = payload.options.find(
        (option) => option.type === type
    );

    if (selected || !allowFallback) {
        return selected || null;
    }

    return payload.options.find(
        (option) => option.type === DEFAULT_SPAWN_TYPE
    ) || getDefaultSpawn();
}

/* -------------------------------------------------------------------------- */
/*                         Применение спавна                                   */
/* -------------------------------------------------------------------------- */

function applySpawnToPlayer(player, spawn) {
    if (
        !isPlayerValid(player) ||
        !spawn
    ) {
        return false;
    }

    const position = normalizePosition({
        ...spawn.position,
        heading: spawn.heading,
        dimension: spawn.dimension,
    });

    try {
        /*
         * Сначала выставляем dimension,
         * затем координаты.
         */
        player.dimension =
            position.dimension;

        player.position =
            new mp.Vector3(
                position.x,
                position.y,
                position.z
            );

        player.heading =
            position.heading;

        return true;
    } catch (error) {
        console.error(
            "[SPAWN SELECTOR] Failed to apply spawn:",
            error?.stack || error
        );

        return false;
    }
}

/* -------------------------------------------------------------------------- */
/*                        Сохранение последней позиции                         */
/* -------------------------------------------------------------------------- */

function updateCharacterPositionMemory(
    player,
    position
) {
    if (!player || !position) {
        return;
    }

    const serialized =
        JSON.stringify(position);

    const character =
        getCharacter(player);

    if (character) {
        character.position = serialized;
    }

    if (
        player.character &&
        player.character !== character
    ) {
        player.character.position =
            serialized;
    }

    if (
        player.characterData &&
        player.characterData !== character
    ) {
        player.characterData.position =
            serialized;
    }
}

async function saveCharacterPositionData(
    characterUuid,
    position
) {
    if (
        !characterUuid ||
        !position
    ) {
        return false;
    }

    const serializedPosition =
        JSON.stringify({
            x: position.x,
            y: position.y,
            z: position.z,
            heading: position.heading,
            dimension: position.dimension,
        });

    const result = await db.query(
        `
            UPDATE characters
            SET
                position = ?,
                last_play = CURRENT_TIMESTAMP
            WHERE uuid = ?
            LIMIT 1
        `,
        [
            serializedPosition,
            characterUuid,
        ]
    );

    const updateResult =
        unwrapQueryResult(result);

    if (
        updateResult &&
        typeof updateResult.affectedRows ===
            "number" &&
        updateResult.affectedRows < 1
    ) {
        console.log(
            `[SPAWN SELECTOR] Character ${characterUuid} position was not updated: affectedRows=0.`
        );

        return false;
    }

    return true;
}

async function saveCharacterPosition(
    player,
    options = {}
) {
    const {
        force = false,
        silent = true,
    } = options;

    if (!player) {
        return false;
    }

    /*
     * Обязательно получаем uuid и position до первого await.
     * На playerQuit объект игрока затем может быть очищен.
     */
    const characterUuid =
        getCharacterUuid(player);

    const position =
        getCurrentPlayerPosition(player);

    if (!characterUuid) {
        if (!silent) {
            console.log(
                "[SPAWN SELECTOR] Position was not saved: character UUID not found."
            );
        }

        return false;
    }

    if (!position) {
        if (!silent) {
            console.log(
                `[SPAWN SELECTOR] Position was not saved for character ${characterUuid}: invalid player position.`
            );
        }

        return false;
    }

    if (isZeroPosition(position)) {
        if (!silent) {
            console.log(
                `[SPAWN SELECTOR] Position was not saved for character ${characterUuid}: zero coordinates.`
            );
        }

        return false;
    }

    if (
        positionSaveLocks.has(characterUuid) &&
        !force
    ) {
        return false;
    }

    positionSaveLocks.add(characterUuid);

    try {
        const saved =
            await saveCharacterPositionData(
                characterUuid,
                position
            );

        if (!saved) {
            return false;
        }

        updateCharacterPositionMemory(
            player,
            position
        );

        if (!silent) {
            console.log(
                `[SPAWN SELECTOR] Position saved for character ${characterUuid}: ${JSON.stringify(position)}`
            );
        }

        return true;
    } catch (error) {
        console.error(
            `[SPAWN SELECTOR] Failed to save position for character ${characterUuid}:`,
            error?.stack || error
        );

        return false;
    } finally {
        positionSaveLocks.delete(
            characterUuid
        );
    }
}

/**
 * Используй эту функцию после выбора пункта меню,
 * если хочешь применить спавн прямо через сервис.
 */
async function selectSpawn(
    player,
    requestedType =
        DEFAULT_SPAWN_TYPE,
    { resolvedSpawn = null } = {}
) {
    if (!isPlayerValid(player)) {
        return null;
    }

    const type = String(
        requestedType || DEFAULT_SPAWN_TYPE
    ).trim();

    let spawn = null;

    if (resolvedSpawn !== null) {
        const resolvedDimension = Number(resolvedSpawn?.dimension);
        const resolvedHeading = Number(resolvedSpawn?.heading);

        if (
            resolvedSpawn?.type !== type ||
            !isValidPosition(resolvedSpawn?.position) ||
            !Number.isFinite(resolvedHeading) ||
            !Number.isSafeInteger(resolvedDimension) ||
            resolvedDimension < 0 ||
            resolvedDimension > 2147483647
        ) {
            throw new Error(
                "Сессионная точка появления недействительна."
            );
        }

        spawn = makeSpawn(
            type,
            resolvedSpawn.title || DEFAULT_SPAWN.title,
            resolvedSpawn.position,
            resolvedHeading,
            resolvedDimension
        );
    } else {
        spawn = await getSpawnByType(
            player,
            type,
            { allowFallback: false }
        );
    }

    if (!spawn) {
        throw new Error(
            "Запрошенное место появления недоступно."
        );
    }

    const applied =
        applySpawnToPlayer(
            player,
            spawn
        );

    if (!applied) {
        throw new Error(
            "Не удалось применить позицию спавна."
        );
    }

    /*
     * После телепорта сразу сохраняем выбранную позицию.
     */
await saveCharacterPosition(player, {
    force: true,
    silent: true,
    }).catch(console.error);

return spawn;
}

/* -------------------------------------------------------------------------- */
/*                         События сохранения                                  */
/* -------------------------------------------------------------------------- */

/**
 * Этот файл не регистрирует s:spawn:select,
 * потому что у тебя оно уже обрабатывается в:
 *
 * packages/twinkle/characters/characterSelection.js
 *
 * Иначе один выбор будет выполняться дважды.
 */

mp.events.add(
    "playerQuit",
    (player) => {
        /*
         * Не ждём Promise внутри события, но UUID и position
         * считываются синхронно до первого await в функции.
         */
        saveCharacterPosition(
            player,
            {
                force: true,
                silent: true,
            }
        ).catch((error) => {
            console.error(
                "[SPAWN SELECTOR] playerQuit position save error:",
                error?.stack || error
            );
        });
    }
);

/**
 * Периодическое сохранение на случай аварийного
 * завершения сервера без нормального playerQuit.
 */
const positionSaveInterval =
    setInterval(() => {
        try {
            mp.players.forEach((player) => {
                if (!player) {
                    return;
                }

                if (!getCharacterUuid(player)) {
                    return;
                }

                saveCharacterPosition(
                    player,
                    {
                        force: false,
                        silent: true,
                    }
                ).catch((error) => {
                    console.error(
                        "[SPAWN SELECTOR] Periodic position save error:",
                        error?.stack || error
                    );
                });
            });
        } catch (error) {
            console.error(
                "[SPAWN SELECTOR] Position save interval error:",
                error?.stack || error
            );
        }
    }, POSITION_SAVE_INTERVAL_MS);

/*
 * Не даёт Node.js-интервалу мешать корректному
 * завершению процесса, если unref поддерживается.
 */
if (
    positionSaveInterval &&
    typeof positionSaveInterval.unref ===
        "function"
) {
    positionSaveInterval.unref();
}

module.exports = {
    SPAWN_CONTRACT_VERSION,
    DEFAULT_SPAWN_TYPE,
    DEFAULT_SPAWN,

    safeJson,
    unwrapRows,
    normalizePosition,
    makeSpawn,

    getCharacter,
    getCharacterUuid,
    getCharacterFractionId,

    getDefaultSpawn,
    getStarterSpawnOptions,
    getRandomStarterSpawn,
    getLastSpawn,
    getLastSpawnFromDatabase,

    getHouseSpawn,
    getApartmentSpawn,

    parseFractionSpawnPoints,
    getFractionSpawn,

    buildSpawnPayload,
    getSpawnByType,

    applySpawnToPlayer,
    selectSpawn,

    saveCharacterPosition,
};

console.log(
    "[SPAWN SELECTOR] Server service loaded"
);
