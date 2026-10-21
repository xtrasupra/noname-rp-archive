"use strict";

const { buildActiveQuestHudTask } = require("../quests/quest.hud.js");

const cache = new Map();
const cacheSessions = new Map();
const SERVER_TIME_ZONE = String(process.env.TWINKLE_TIME_ZONE || "Europe/Riga");

function exists(player) {
    return player && mp.players.exists(player);
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function merge(target, source) {
    if (!source) return target;

    for (const key of Object.keys(source)) {

        const value = source[key];

        if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {

            if (!target[key])
                target[key] = {};

            merge(target[key], value);

        } else {

            target[key] = value;

        }

    }

    return target;
}

function mergeTaskState(previousTasks = {}, patchTasks = {}) {
    const mergedItems = new Map();

    if (Array.isArray(previousTasks.items)) {
        previousTasks.items.forEach((item) => {
            if (item?.id != null) mergedItems.set(String(item.id), item);
        });
    }

    if (Array.isArray(patchTasks.items)) {
        patchTasks.items.forEach((item) => {
            if (item?.id == null) return;

            const key = String(item.id);
            if (item.hidden) {
                mergedItems.delete(key);
                return;
            }

            mergedItems.set(key, item);
        });
    }

    return {
        ...previousTasks,
        ...patchTasks,
        merge: undefined,
        items: Array.from(mergedItems.values()),
    };
}

function applyPatch(target, patch) {
    if (!patch) return target;

    if (patch.tasks?.merge) {
        target.tasks = mergeTaskState(target.tasks, patch.tasks);

        const remainingPatch = { ...patch };
        delete remainingPatch.tasks;
        return merge(target, remainingPatch);
    }

    return merge(target, patch);
}

function getClockPayload() {
    const now = new Date();
    let time;
    let date;

    try {
        time = new Intl.DateTimeFormat("ru-RU", {
            timeZone: SERVER_TIME_ZONE,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(now);
        date = new Intl.DateTimeFormat("ru-RU", {
            timeZone: SERVER_TIME_ZONE,
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }).format(now).replace(/\./g, "/");
    } catch {
        time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        date = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    }

    return {
        serverEpochMs: now.getTime(),
        timeZone: SERVER_TIME_ZONE,
        time,
        date,
    };
}

function getActiveQuestTask(player, character) {
    const snapshot = player?.twinkleQuestState;
    const characterUuid = Number(character?.uuid || character?.id || 0);
    const sessionEpoch = Number(player?.twinkleCharacterSessionEpoch || 0);

    if (
        !snapshot?.active ||
        !Number.isSafeInteger(characterUuid) ||
        characterUuid <= 0 ||
        Number(snapshot.characterUuid) !== characterUuid ||
        !Number.isSafeInteger(sessionEpoch) ||
        sessionEpoch <= 0 ||
        Number(snapshot.sessionEpoch) !== sessionEpoch
    ) {
        return null;
    }

    return buildActiveQuestHudTask(snapshot);
}

function getHudSession(player) {
    return {
        characterUuid: Number(player?.character?.uuid || player?.character?.id || 0),
        sessionEpoch: Number(player?.twinkleCharacterSessionEpoch || 0),
    };
}

function isSameHudSession(player) {
    const current = getHudSession(player);
    const cached = cacheSessions.get(player?.id);

    return Boolean(
        cached &&
        Number.isSafeInteger(current.characterUuid) &&
        current.characterUuid > 0 &&
        Number.isSafeInteger(current.sessionEpoch) &&
        current.sessionEpoch >= 0 &&
        cached.characterUuid === current.characterUuid &&
        cached.sessionEpoch === current.sessionEpoch
    );
}

function setCachedState(player, payload) {
    cache.set(player.id, payload);
    cacheSessions.set(player.id, getHudSession(player));
    return payload;
}

function composeFullSyncTasks(previousTasks, authoritativeTasks) {
    const otherOwnerItems = Array.isArray(previousTasks?.items)
        ? previousTasks.items.filter((item) => String(item?.id || "") !== "quest:current")
        : [];
    const questItems = Array.isArray(authoritativeTasks?.items)
        ? authoritativeTasks.items.filter((item) => String(item?.id || "") === "quest:current")
        : [];
    const items = [...otherOwnerItems, ...questItems];

    return {
        isVisible: questItems.length > 0 || Boolean(previousTasks?.isVisible && otherOwnerItems.length > 0),
        items,
    };
}

function build(player) {

    const character = player.character || {};
    const activeQuestTask = getActiveQuestTask(player, character);

    return {

        visible: true,

        chat: {
            isVisible: true,
            activeChannel: "IC",
            maxMessages: 80,
            channels: ["OOC", "FAM", "IC", "DO", "ME", "TRY", "FRACTION"],
            messages: []
        },

        server: {
            online: `${mp.players.length} / ${mp.config.maxplayers}`,
            x2: false,
            logo: "/tw.png"
        },

        player: {

            needs: {
                water: Math.max(0, Math.min(100, Number(character.water ?? 100))),
                eat: Math.max(0, Math.min(100, Number(character.food ?? 100))),
                id: Number(character.uuid || character.id || 0)
            },

            finance: {
                cash: Number(character.cash || 0),
                bank: Number(character.bank || 0)
            },

            gun: null,

        },

        microphone: {
            isTalking: false
        },

        info: {
            temperature: "+10",
            weatherLabel: "",
            ...getClockPayload(),
            street: "",
            zone: "",
            safeZone: false
        },

        tasks: {
            isVisible: Boolean(activeQuestTask),
            items: activeQuestTask ? [activeQuestTask] : []
        },

        hotkeys: {
            isVisible: true,
            items: [
                { name: "Телефон", key: "↑" },
                { name: "Инвентарь", key: "I" },
                { name: "Планшет", key: "G" },
                { name: "Чат", key: "T" }
            ]
        },

        interaction: null,
        deal: null,
        greeting: null,
        battle: null,
        exchange: null,
        request: null,
        capture: null,
        actionCamera: null,
        admin: {
            enabled: false,
            reports: 0
        },
        vehicle: {
            id: 0,
            model: "",
            plate: "",

            inVehicle: false,
            isDriver: false,

            speed: 0,
            maxSpeed: 240,

            fuel: 0,
            engineHealth: 100,
            mileage: 0,

            gear: 1,

            doorsLocked: false,
            engineOn: false,
            seatbeltOn: false,
            lightsOn: false
        }

    };

}

function state(player) {

    if (!exists(player))
        return null;

    if (!cache.has(player.id) || !isSameHudSession(player))
        setCachedState(player, build(player));

    return cache.get(player.id);

}

function show(player) {

    if (!exists(player))
        return;

    const payload = clone(state(player));

    player.call("c:hud:show", [
        JSON.stringify(payload)
    ]);

}

function hide(player) {

    if (!exists(player))
        return;

    player.call("c:hud:hide");

}

function update(player, patch) {

    if (!exists(player))
        return;

    const current = state(player);

    applyPatch(current, patch);

    player.call("c:hud:update", [
        JSON.stringify(patch)
    ]);

}

function sync(player, initialPatch = null) {

    if (!exists(player))
        return;

    const previousTasks = isSameHudSession(player)
        ? cache.get(player.id)?.tasks
        : null;
    const next = build(player);
    const authoritativeTasks = next.tasks;
    next.tasks = composeFullSyncTasks(previousTasks, next.tasks);
    applyPatch(next, initialPatch);
    // Keep shared task providers first and the authoritative quest task last,
    // matching the stable order used by subsequent full HUD refreshes.
    next.tasks = composeFullSyncTasks(next.tasks, authoritativeTasks);
    setCachedState(player, next);

    show(player);

}

function destroy(player) {

    if (!player)
        return;

    cache.delete(player.id);
    cacheSessions.delete(player.id);

}

function get(player) {

    return state(player);

}

module.exports = {
    build,
    show,
    hide,
    update,
    sync,
    destroy,
    get,
    getClockPayload
};

mp.events.add("playerQuit", destroy);
