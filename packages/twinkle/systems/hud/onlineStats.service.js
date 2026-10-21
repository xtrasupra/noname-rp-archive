"use strict";

const db = require("../../database/query.js");
const { rows, getUuid } = require("../../utils/player.js");

const ONLINE_REWARD = {
    enabled: true,
    requiredSeconds: 5 * 60 * 60,
    donate: 300,
    title: "Daily reward",
    description: "Отыграй 5 часов за сутки, чтобы получить 300 доната",
};

let schemaPromise = null;
const cache = new Map();

function pad(value) {
    return String(value).padStart(2, "0");
}

function getTodayKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getMonthKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function getNextMidnightSeconds(date = new Date()) {
    const next = new Date(date);
    next.setHours(24, 0, 0, 0);
    return Math.max(1, Math.ceil((next.getTime() - date.getTime()) / 1000));
}

function formatRemaining(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    return `${hours}ч ${minutes}м`;
}

function formatHours(totalSeconds) {
    return formatRemaining(totalSeconds);
}

async function ensureSchema() {
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        const columns = rows(await db.query("SHOW COLUMNS FROM characters")) || [];
        const names = new Set(columns.map((column) => column.Field));
        const required = {
            online_today_seconds: "INT NOT NULL DEFAULT 0",
            online_month_seconds: "INT NOT NULL DEFAULT 0",
            online_total_seconds: "INT NOT NULL DEFAULT 0",
            online_stat_date: "DATE NULL",
            online_stat_month: "CHAR(7) NULL",
            online_reward_claimed_date: "DATE NULL",
        };

        for (const [column, definition] of Object.entries(required)) {
            if (!names.has(column)) {
                await db.query(`ALTER TABLE characters ADD COLUMN ${column} ${definition}`);
            }
        }

        const oldStatsTable = rows(await db.query("SHOW TABLES LIKE 'character_online_stats'")) || [];
        if (!oldStatsTable.length) return;

        const oldColumns = rows(await db.query("SHOW COLUMNS FROM character_online_stats")) || [];
        const oldColumnNames = new Set(oldColumns.map((column) => column.Field));
        const requiredOldColumns = [
            "character_uuid",
            "stat_date",
            "stat_month",
            "online_seconds",
            "reward_claims",
        ];
        if (!requiredOldColumns.every((column) => oldColumnNames.has(column))) return;

        const today = getTodayKey();
        const month = getMonthKey();

        await db.query(
            `UPDATE characters c
              JOIN character_online_stats s
                ON s.character_uuid = c.uuid AND s.stat_date = ?
               SET c.online_today_seconds = GREATEST(c.online_today_seconds, s.online_seconds),
                   c.online_stat_date = ?,
                   c.online_reward_claimed_date = IF(s.reward_claims > 0, ?, c.online_reward_claimed_date)`,
            [today, today, today]
        );

        await db.query(
            `UPDATE characters c
              JOIN (
                SELECT character_uuid, COALESCE(SUM(online_seconds), 0) AS month_seconds
                  FROM character_online_stats
                 WHERE stat_month = ?
                 GROUP BY character_uuid
              ) s ON s.character_uuid = c.uuid
               SET c.online_month_seconds = GREATEST(c.online_month_seconds, s.month_seconds),
                   c.online_stat_month = ?`,
            [month, month]
        );

        await db.query(
            `UPDATE characters c
              JOIN (
                SELECT character_uuid, COALESCE(SUM(online_seconds), 0) AS total_seconds
                  FROM character_online_stats
                 GROUP BY character_uuid
              ) s ON s.character_uuid = c.uuid
               SET c.online_total_seconds = GREATEST(c.online_total_seconds, s.total_seconds)`
        );
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });

    return schemaPromise;
}

function normalizeState(row, uuid, today, month) {
    const storedDate = row.online_stat_date ? String(row.online_stat_date).slice(0, 10) : "";
    const storedMonth = row.online_stat_month ? String(row.online_stat_month).slice(0, 7) : "";
    const rewardDate = row.online_reward_claimed_date ? String(row.online_reward_claimed_date).slice(0, 10) : "";

    return {
        uuid,
        date: today,
        month,
        todaySeconds: storedDate === today ? Number(row.online_today_seconds || 0) : 0,
        monthSeconds: storedMonth === month ? Number(row.online_month_seconds || 0) : 0,
        totalSeconds: Number(row.online_total_seconds || 0),
        rewardClaims: rewardDate === today ? 1 : 0,
        rewardClaimedDate: rewardDate || null,
        lastTickAt: Date.now(),
    };
}

async function loadStats(uuid) {
    uuid = Number(uuid || 0);
    if (!uuid) return null;

    await ensureSchema();

    const today = getTodayKey();
    const month = getMonthKey();

    await db.query(
        `UPDATE characters
            SET online_today_seconds = IF(online_stat_date = ?, online_today_seconds, 0),
                online_month_seconds = IF(online_stat_month = ?, online_month_seconds, 0),
                online_stat_date = ?,
                online_stat_month = ?
          WHERE uuid = ?`,
        [today, month, today, month, uuid]
    );

    const characterRows = rows(await db.query(
        `SELECT online_today_seconds, online_month_seconds, online_total_seconds,
                online_stat_date, online_stat_month, online_reward_claimed_date
           FROM characters
          WHERE uuid = ?
          LIMIT 1`,
        [uuid]
    ));

    const character = characterRows?.[0];
    if (!character) return null;

    const state = normalizeState(character, uuid, today, month);
    cache.set(uuid, state);
    return state;
}

async function getState(playerOrUuid) {
    const uuid = typeof playerOrUuid === "number" ? playerOrUuid : getUuid(playerOrUuid);
    if (!uuid) return null;

    const today = getTodayKey();
    const month = getMonthKey();
    const current = cache.get(uuid);

    if (current && current.date === today && current.month === month) return current;
    return loadStats(uuid);
}

function getRewardRemainingSeconds(state) {
    if (!state || !ONLINE_REWARD.enabled) return 0;
    if (Number(state.rewardClaims || 0) > 0) return getNextMidnightSeconds();
    return Math.max(0, ONLINE_REWARD.requiredSeconds - Number(state.todaySeconds || 0));
}

function getHudBonusPayloadFromState(state, options = {}) {
    if (!state || !ONLINE_REWARD.enabled) {
        return {
            tasks: {
                isVisible: true,
                merge: true,
                items: [{ id: "daily-online-reward", hidden: true }],
            },
        };
    }

    const claimedToday = Number(state.rewardClaims || 0) > 0;
    const secondsLeft = getRewardRemainingSeconds(state);
    const requiredHours = Math.max(1, Math.floor(Number(ONLINE_REWARD.requiredSeconds || 0) / 3600));
    const activeHours = Math.min(requiredHours, Math.floor(Number(state.todaySeconds || 0) / 3600));
    const dailyTask = claimedToday
        ? { id: "daily-online-reward", hidden: true }
        : {
            id: "daily-online-reward",
            type: "red",
            title: "Daily reward",
            description: `${ONLINE_REWARD.description}. Осталось: ${formatRemaining(secondsLeft)}`,
            image: "",
            progress: {
                steps: requiredHours,
                activeStep: activeHours,
            },
        };

    return {
        tasks: {
            isVisible: true,
            merge: true,
            items: [dailyTask],
        },
    };
}

async function getHudBonusPayload(player, options = {}) {
    const state = await getState(player);
    return getHudBonusPayloadFromState(state, options);
}

async function addOnlineSeconds(player, seconds) {
    const uuid = getUuid(player);
    const delta = Math.max(0, Math.floor(Number(seconds || 0)));
    if (!uuid || delta <= 0) return null;

    let state = await getState(uuid);
    if (!state) return null;

    const today = getTodayKey();
    const month = getMonthKey();
    if (state.date !== today || state.month !== month) {
        state = await loadStats(uuid);
        if (!state) return null;
    }

    state.todaySeconds += delta;
    state.monthSeconds += delta;
    state.totalSeconds += delta;

    await db.query(
        `UPDATE characters
            SET online_today_seconds = online_today_seconds + ?,
                online_month_seconds = online_month_seconds + ?,
                online_total_seconds = online_total_seconds + ?,
                online_stat_date = ?,
                online_stat_month = ?
          WHERE uuid = ?`,
        [delta, delta, delta, state.date, state.month, uuid]
    );

    return state;
}

async function markRewardClaimed(playerOrUuid) {
    const state = await getState(playerOrUuid);
    if (!state) return null;

    state.rewardClaims = 1;
    state.rewardClaimedDate = state.date;

    await db.query(
        `UPDATE characters
            SET online_reward_claimed_date = ?
          WHERE uuid = ?`,
        [state.date, state.uuid]
    );

    return state;
}

function clearPlayer(player) {
    const uuid = getUuid(player);
    if (uuid) cache.delete(uuid);
}

module.exports = {
    ONLINE_REWARD,
    addOnlineSeconds,
    clearPlayer,
    ensureSchema,
    formatHours,
    getHudBonusPayload,
    getHudBonusPayloadFromState,
    getRewardRemainingSeconds,
    getState,
    getUuid,
    loadStats,
    markRewardClaimed,
};
