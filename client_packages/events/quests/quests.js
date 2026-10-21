"use strict";

try {
    global.__twinkleQuestClientRuntime?.shutdown?.();
} catch (error) {
    try { mp.console.logError(`[QUESTS] Previous client runtime shutdown failed: ${error.message}`); } catch {}
}

const QUEST_CONTRACT_VERSION = 1;
const TARGET_BLIP_SPRITE = 1;
const TARGET_BLIP_COLOR = 5;
const TARGET_MARKER_TYPE = 1;
const TARGET_ROUTE_RETRY_MS = 50;
const TARGET_ROUTE_TIMEOUT_MS = 3000;
const REQUEST_COOLDOWN_MS = 1000;
const INITIAL_REQUEST_DELAYS_MS = Object.freeze([0, 750, 2000]);

const runtime = {
    active: true,
    state: null,
    stateGeneration: 0,
    expectedSessionEpoch: null,
    targetKey: "",
    targetGeneration: 0,
    blip: null,
    marker: null,
    routeTimer: null,
    lastRequestAt: 0,
    requestTimers: [],
    handlers: [],
    shutdown: null,
};

global.__twinkleQuestClientRuntime = runtime;

function registerQuestEvent(name, handler) {
    const guarded = (...args) => {
        if (!runtime.active) return undefined;
        return handler(...args);
    };

    mp.events.add(name, guarded);
    runtime.handlers.push({ name, handler: guarded });
}

function parseJson(value, fallback = null) {
    try {
        if (value === null || value === undefined || value === "") return fallback;
        if (typeof value === "object") return value;
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
}

function normalizePosition(position) {
    if (!position || !isFiniteNumber(position.x) || !isFiniteNumber(position.y) || !isFiniteNumber(position.z)) {
        return null;
    }

    return {
        x: Number(position.x),
        y: Number(position.y),
        z: Number(position.z),
    };
}

function normalizeTarget(target) {
    if (!target || typeof target !== "object") return null;

    const position = normalizePosition(target.position);
    if (!position) return null;

    return {
        kind: String(target.kind || "location"),
        label: String(target.label || "Quest target").slice(0, 96),
        position,
        dimension: Math.max(0, Math.floor(Number(target.dimension || 0))),
    };
}

function normalizeState(rawState) {
    const state = parseJson(rawState, null);
    if (
        !state ||
        state.version !== QUEST_CONTRACT_VERSION ||
        typeof state.characterUuid !== "number" ||
        !Number.isSafeInteger(state.characterUuid) ||
        state.characterUuid <= 0 ||
        typeof state.sessionEpoch !== "number" ||
        !Number.isSafeInteger(state.sessionEpoch) ||
        state.sessionEpoch <= 0 ||
        typeof state.revision !== "number" ||
        !Number.isSafeInteger(state.revision) ||
        state.revision < 0
    ) return null;

    const active = state.active && typeof state.active === "object"
        ? {
            questId: String(state.active.questId || ""),
            questVersion: Math.max(1, Math.floor(Number(state.active.questVersion || 1))),
            title: String(state.active.title || "Quest").slice(0, 96),
            stepId: String(state.active.stepId || ""),
            objective: String(state.active.objective || "").slice(0, 240),
            progress: state.active.progress && isFiniteNumber(state.active.progress.current) && isFiniteNumber(state.active.progress.target)
                ? {
                    current: Math.max(0, Number(state.active.progress.current)),
                    target: Math.max(1, Number(state.active.progress.target)),
                }
                : null,
            target: normalizeTarget(state.active.target),
        }
        : null;

    return {
        version: QUEST_CONTRACT_VERSION,
        characterUuid: state.characterUuid,
        sessionEpoch: state.sessionEpoch,
        revision: state.revision,
        active: active && active.questId && active.stepId ? active : null,
        available: Array.isArray(state.available)
            ? state.available.slice(0, 50).map((entry) => ({
                questId: String(entry?.questId || ""),
                title: String(entry?.title || "Quest").slice(0, 96),
                status: String(entry?.status || "available"),
            })).filter((entry) => entry.questId)
            : [],
    };
}

function destroyTarget() {
    const blip = runtime.blip;
    const marker = runtime.marker;

    runtime.targetGeneration += 1;
    if (runtime.routeTimer) clearTimeout(runtime.routeTimer);
    runtime.routeTimer = null;
    runtime.blip = null;
    runtime.marker = null;
    runtime.targetKey = "";

    try {
        if (Number(blip?.handle || 0) > 0) blip.setRoute?.(false);
    } catch {}
    try { blip?.destroy?.(); } catch {}
    try { marker?.destroy?.(); } catch {}
}

function activateTargetRoute(blip, generation, deadline = Date.now() + TARGET_ROUTE_TIMEOUT_MS) {
    if (
        !runtime.active || runtime.targetGeneration !== generation ||
        runtime.blip !== blip
    ) return;

    if (Number(blip?.handle || 0) > 0) {
        try { blip.setRoute(true); } catch (error) {
            try { mp.console.logError(`[QUESTS] target route failed: ${error.message}`); } catch {}
        }
        return;
    }

    if (Date.now() >= deadline) {
        try { mp.console.logError("[QUESTS] target blip handle was not ready before timeout."); } catch {}
        return;
    }

    runtime.routeTimer = setTimeout(() => {
        runtime.routeTimer = null;
        activateTargetRoute(blip, generation, deadline);
    }, TARGET_ROUTE_RETRY_MS);
}

function makeTargetKey(active) {
    if (!active?.target) return "";
    const position = active.target.position;
    return [
        active.questId,
        active.questVersion,
        active.stepId,
        active.target.kind,
        active.target.dimension,
        position.x.toFixed(2),
        position.y.toFixed(2),
        position.z.toFixed(2),
    ].join(":");
}

function createTarget(active) {
    const target = active?.target;
    if (!target) return;

    const position = new mp.Vector3(
        target.position.x,
        target.position.y,
        target.position.z
    );

    try {
        runtime.blip = mp.blips.new(TARGET_BLIP_SPRITE, position, {
            name: target.label,
            color: TARGET_BLIP_COLOR,
            scale: 0.9,
            shortRange: false,
            dimension: target.dimension,
        });
        activateTargetRoute(runtime.blip, runtime.targetGeneration);
    } catch (error) {
        try { mp.console.logError(`[QUESTS] target blip failed: ${error.message}`); } catch {}
    }

    try {
        runtime.marker = mp.markers.new(
            TARGET_MARKER_TYPE,
            new mp.Vector3(target.position.x, target.position.y, target.position.z - 0.9),
            1.4,
            {
                color: [255, 204, 64, 150],
                visible: true,
                dimension: target.dimension,
            }
        );
    } catch (error) {
        try { mp.console.logError(`[QUESTS] target marker failed: ${error.message}`); } catch {}
    }
}

function syncTarget(state) {
    const active = state?.active || null;
    const key = makeTargetKey(active);

    if (!key) {
        destroyTarget();
        return;
    }

    if (runtime.targetKey === key) return;

    destroyTarget();
    runtime.targetKey = key;
    createTarget(active);
}

function pushHud(state) {
    const active = state?.active || null;
    const task = active
        ? {
            id: "quest:current",
            type: "yellow",
            title: active.title,
            description: active.objective,
            progress: active.progress
                ? {
                    steps: Math.max(1, Number(active.progress.target || 1)),
                    activeStep: Math.max(0, Number(active.progress.current || 0)),
                }
                : undefined,
        }
        : {
            id: "quest:current",
            type: "yellow",
            title: "Задание",
            description: "",
            hidden: true,
        };

    try {
        mp.events.call("c:hud:tasks", JSON.stringify({
            // Visibility is shared. Active quests reveal it; removal preserves
            // another task provider's current visibility decision.
            ...(active ? { isVisible: true } : {}),
            merge: true,
            items: [task],
        }));
    } catch {}
}

function pushCef(state) {
    const payload = state || {
        version: QUEST_CONTRACT_VERSION,
        revision: 0,
        active: null,
        available: [],
    };
    const json = JSON.stringify(payload);

    try {
        if (global.ui?.emit) {
            global.ui.emit("f2Menu", "twinkle:quests:state", payload, {
                globalName: "__TWINKLE_QUEST_STATE__",
                retryKey: "quests:state",
            });
        }
    } catch {}

    try {
        global.uiBrowser?.execute?.(`
            (() => {
                const state = ${json};
                window.__TWINKLE_QUEST_STATE__ = state;
                const previous = window.__F2_MENU_PAYLOAD__ || {};
                const nextPayload = { ...previous, quests: state };
                window.__F2_MENU_PAYLOAD__ = nextPayload;
                window.dispatchEvent(new CustomEvent("twinkle:quests:state", { detail: state }));
                window.dispatchEvent(new CustomEvent("twinkle:f2:update", { detail: nextPayload }));
                window.TWINKLE_F2?.setPayload?.(nextPayload);
            })();
        `);
    } catch (error) {
        try { mp.console.logError(`[QUESTS] CEF push failed: ${error.message}`); } catch {}
    }
}

function notifyStepChange(previous, next) {
    const previousStep = previous?.active?.stepId || "";
    const nextStep = next?.active?.stepId || "";
    if (!nextStep || previousStep === nextStep) return;

    try {
        if (global.ui?.notify) {
            global.ui.notify(next.active.objective, "info");
        }
    } catch {}
}

function applyState(rawState) {
    if (!runtime.active || !global.__TWINKLE_GAMEPLAY_READY__) return;

    const state = normalizeState(rawState);
    if (!state) return;
    if (state.sessionEpoch !== runtime.expectedSessionEpoch) return;
    if (
        runtime.state &&
        state.sessionEpoch === runtime.state.sessionEpoch &&
        state.revision < runtime.state.revision
    ) return;

    const previous = runtime.state;
    runtime.state = state;
    runtime.stateGeneration += 1;
    global.__TWINKLE_QUEST_STATE__ = state;

    syncTarget(state);
    pushHud(state);
    pushCef(state);
    notifyStepChange(previous, state);
}

function requestState(force = false) {
    if (!runtime.active) return;

    const now = Date.now();
    if (!force && now - runtime.lastRequestAt < REQUEST_COOLDOWN_MS) return;
    runtime.lastRequestAt = now;

    try {
        mp.events.callRemote("s:quests:requestState");
    } catch (error) {
        try { mp.console.logError(`[QUESTS] state request failed: ${error.message}`); } catch {}
    }
}

function clearRequestTimers() {
    runtime.requestTimers.forEach((timer) => clearTimeout(timer));
    runtime.requestTimers.length = 0;
}

function requestInitialState() {
    clearRequestTimers();
    const startingGeneration = runtime.stateGeneration;

    INITIAL_REQUEST_DELAYS_MS.forEach((delay) => {
        const timer = setTimeout(() => {
            const index = runtime.requestTimers.indexOf(timer);
            if (index >= 0) runtime.requestTimers.splice(index, 1);
            if (!runtime.active || !global.__TWINKLE_GAMEPLAY_READY__) return;
            if (delay > 0 && runtime.stateGeneration !== startingGeneration) return;
            requestState(true);
        }, delay);

        runtime.requestTimers.push(timer);
    });
}

function handleGpsFromBrowser(rawPayload) {
    if (!runtime.active) return;

    const payload = parseJson(rawPayload, {});
    const active = runtime.state?.active;
    if (!active) return;

    const matches =
        String(payload.questId || "") === active.questId &&
        Number(payload.questVersion || 0) === Number(active.questVersion) &&
        String(payload.stepId || "") === active.stepId;

    if (!matches) return;

    syncTarget(runtime.state);
    try {
        if (global.ui?.notify) global.ui.notify("Quest GPS route updated.", "success");
    } catch {}
}

registerQuestEvent("c:quests:state", applyState);
registerQuestEvent("quests:gpsFromBrowser", handleGpsFromBrowser);
registerQuestEvent("playerReady", requestInitialState);
registerQuestEvent("c:twinkle:resourcesReady", requestInitialState);
registerQuestEvent("c:hud:gameplayReady", (ready, sessionEpoch) => {
    if (Boolean(ready)) {
        const normalizedSessionEpoch = Number(sessionEpoch);
        if (!Number.isSafeInteger(normalizedSessionEpoch) || normalizedSessionEpoch <= 0) return;
        runtime.expectedSessionEpoch = normalizedSessionEpoch;
        requestInitialState();
        return;
    }

    clearRequestTimers();
    runtime.state = null;
    runtime.stateGeneration += 1;
    runtime.expectedSessionEpoch = null;
    global.__TWINKLE_QUEST_STATE__ = null;
    destroyTarget();
    pushHud(null);
    pushCef(null);
});
registerQuestEvent("playerDeath", () => destroyTarget());
registerQuestEvent("playerQuit", () => destroyTarget());

runtime.shutdown = () => {
    runtime.active = false;
    clearRequestTimers();
    destroyTarget();
    runtime.state = null;
    runtime.handlers.length = 0;
};

try { mp.console.logInfo("[QUESTS] Client bridge loaded"); } catch {}
