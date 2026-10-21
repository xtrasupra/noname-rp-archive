"use strict";

const db = require("../../database");
const {
    getAdminLevel,
    getUuid,
} = require("../../utils/player.js");
const { sanitizeText } = require("../../utils/text.js");

let schemaPromise = null;

function isAdmin(player) {
    return getAdminLevel(player) > 0;
}

function getCharacterName(player) {
    return (
        player?.rpName ||
        player?.character?.rpName ||
        player?.character?.name ||
        player?.name ||
        `Player_${player.id}`
    );
}

const getCharacterId = getUuid;

function callSafe(player, eventName, args = []) {
    try {
        if (player && mp.players.exists(player)) {
            player.call(eventName, args);
        }
    } catch (error) {
        console.log(`[NAMETAGS] call ${eventName}:`, error.message);
    }
}

function setSyncedNametagData(player) {
    const uuid = getCharacterId(player);
    const name = getCharacterName(player);
    const adminLevel = getAdminLevel(player);
    const adminDuty = Boolean(player?.adminDuty || player?.getVariable?.("adminDuty"));

    try {
        player.setVariable("nametag:name", sanitizeText(name));
        player.setVariable("nametag:uuid", uuid);
        player.setVariable("nametag:admin", adminLevel > 0);
        player.setVariable("nametag:adminLevel", adminLevel);
        player.setVariable("nametag:adminDuty", adminDuty);
        player.setVariable("nametag:adminDutyLabel", adminDuty ? "Администратор проекта" : "");
    } catch {}
}

async function ensureSchema() {
    if (schemaPromise) return schemaPromise;

    schemaPromise = db.query(`
        CREATE TABLE IF NOT EXISTS character_known_players (
            character_uuid BIGINT NOT NULL,
            target_uuid BIGINT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (character_uuid, target_uuid),
            INDEX idx_character_known_players_target (target_uuid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((error) => {
        schemaPromise = null;
        throw error;
    });

    return schemaPromise;
}

async function getKnownList(player) {
    const uuid = getCharacterId(player);
    if (!uuid) return [];

    await ensureSchema();

    const rows = await db.query(
        "SELECT target_uuid FROM character_known_players WHERE character_uuid = ?",
        [uuid]
    );

    return rows
        .map((row) => Number(row.target_uuid || 0))
        .filter(Boolean);
}

async function sendKnownList(player) {
    try {
        const known = isAdmin(player) ? ["*"] : await getKnownList(player);

        callSafe(player, "nametags:updateKnown", [JSON.stringify(known)]);
    } catch (error) {
        console.log("[NAMETAGS] known load:", error.message);
        callSafe(player, "nametags:updateKnown", [JSON.stringify([])]);
    }
}

async function knowCharacterUuid(player, targetUuid) {
    const playerUuid = getCharacterId(player);
    targetUuid = Number(targetUuid || 0);

    if (!playerUuid || !targetUuid || playerUuid === targetUuid) return false;

    await ensureSchema();

    await db.query(
        `INSERT IGNORE INTO character_known_players (character_uuid, target_uuid)
         VALUES (?, ?)`,
        [playerUuid, targetUuid]
    );

    await sendKnownList(player);

    return true;
}

async function knowPlayer(player, target, mutual = false) {
    const ok = await knowCharacterUuid(player, getCharacterId(target));

    if (ok && mutual && target) {
        await knowCharacterUuid(target, getCharacterId(player));
    }

    return ok;
}

async function forgetPlayer(player, target) {
    const playerUuid = getCharacterId(player);
    const targetUuid = getCharacterId(target);

    if (!playerUuid || !targetUuid) return false;

    await ensureSchema();

    await db.query(
        "DELETE FROM character_known_players WHERE character_uuid = ? AND target_uuid = ?",
        [playerUuid, targetUuid]
    );

    await sendKnownList(player);

    return true;
}

function findPlayerById(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return null;

    let found = null;

    mp.players.forEach((player) => {
        if (Number(player.id) === numericId || getCharacterId(player) === numericId) {
            found = player;
        }
    });

    return found;
}

function notify(player, message, color = "#c392ff") {
    callSafe(player, "chat:client:add", [JSON.stringify({
        id: `nametag-${Date.now()}`,
        text: message,
        color,
    })]);
}

function registerCommand(name, handler) {
    if (mp.registerCommand) {
        mp.registerCommand(name, handler);
        return;
    }

    if (mp.events?.addCommand) {
        mp.events.addCommand(name, handler);
    }
}

mp.events.add("twinkle:character:loaded", (player) => {
    setSyncedNametagData(player);
    sendKnownList(player);
});

mp.events.add("playerReady", (player) => {
    setSyncedNametagData(player);
    sendKnownList(player);
});

mp.events.add("nametags:server:refreshKnown", (player) => {
    setSyncedNametagData(player);
    sendKnownList(player);
});

registerCommand("meet", async (player, _fullText, args = []) => {
    const target = findPlayerById(args[0]);

    if (!target) {
        notify(player, "Игрок не найден. Используйте /meet ID или /meet UUID.", "#ff5b7a");
        return;
    }

    if (target === player) {
        notify(player, "С собой знакомиться не нужно, бро.", "#ffcc66");
        return;
    }

    await knowPlayer(player, target, true);

    notify(player, `Вы познакомились с ${getCharacterName(target)}.`, "#66e3a1");
    notify(target, `Вы познакомились с ${getCharacterName(player)}.`, "#66e3a1");
});

ensureSchema()
    .then(() => console.log("[NAMETAGS] Identity schema ready"))
    .catch((error) => console.log("[NAMETAGS] Identity schema error:", error.message));

module.exports = {
    ensureSchema,
    knowCharacterUuid,
    knowPlayer,
    forgetPlayer,
    sendKnownList,
    setSyncedNametagData,
};
