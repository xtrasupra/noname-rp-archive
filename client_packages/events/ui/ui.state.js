"use strict";

const DEFAULT_TTL_MS = 0;
const stateStore = {};
const eventStore = {};

function parseJson(value, fallback = {}) {
    try {
        if (!value) return fallback;
        if (typeof value === "object") return value;
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function clone(value) {
    return parseJson(JSON.stringify(value || {}), {});
}

function mergePayload(previous, next) {
    const result = {
        ...(previous || {}),
        ...(next || {}),
    };

    for (const key of Object.keys(next || {})) {
        if (Array.isArray(next[key])) {
            result[key] = next[key];
        } else if (
            next[key] &&
            typeof next[key] === "object" &&
            !Array.isArray(next[key]) &&
            previous?.[key] &&
            typeof previous[key] === "object" &&
            !Array.isArray(previous[key])
        ) {
            result[key] = mergePayload(previous[key], next[key]);
        }
    }

    return result;
}

function now() {
    return Date.now();
}

function getEntry(page) {
    const entry = stateStore[String(page)];
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= now()) {
        delete stateStore[String(page)];
        return null;
    }
    return entry;
}

function push(page, payload, options = {}) {
    const ui = global.ui;
    if (!ui?.pushReliable) return false;

    ui.pushReliable(String(page), payload || {}, {
        eventName: options.eventName || `twinkle:${page}:update`,
        globalName: options.globalName || `__TWINKLE_${String(page).toUpperCase()}_PAYLOAD__`,
        retryKey: options.retryKey || `${page}:state`,
        retryDelays: options.retryDelays || [0, 100, 300, 700],
        apiName: options.apiName,
        apiMethod: options.apiMethod,
    });

    return true;
}

function remember(page, payload = {}, options = {}) {
    page = String(page);
    const safePayload = clone(payload);
    const ttl = Number(options.ttlMs ?? DEFAULT_TTL_MS);

    stateStore[page] = {
        payload: safePayload,
        updatedAt: now(),
        expiresAt: ttl > 0 ? now() + ttl : 0,
        options: {
            eventName: options.eventName,
            globalName: options.globalName,
            retryKey: options.retryKey,
            retryDelays: options.retryDelays,
            apiName: options.apiName,
            apiMethod: options.apiMethod,
        },
    };

    if (options.push !== false) {
        push(page, safePayload, stateStore[page].options);
    }

    return safePayload;
}

function patch(page, payload = {}, options = {}) {
    page = String(page);
    const current = get(page, {});
    return remember(page, mergePayload(current, parseJson(payload, {})), options);
}

function get(page, fallback = {}) {
    const entry = getEntry(page);
    return entry ? clone(entry.payload) : clone(fallback);
}

function clear(page) {
    delete stateStore[String(page)];
}

function rememberEvent(page, eventName, payload = {}, options = {}) {
    const key = `${page}:${eventName}`;
    eventStore[key] = {
        page: String(page),
        eventName: String(eventName),
        payload: clone(payload),
        options: { ...options },
        updatedAt: now(),
    };
}

function replay(page = null) {
    const targetPage = page == null ? null : String(page);

    for (const [storedPage, entry] of Object.entries(stateStore)) {
        if (targetPage && targetPage !== storedPage) continue;
        push(storedPage, entry.payload, entry.options || {});
    }

    for (const entry of Object.values(eventStore)) {
        if (targetPage && targetPage !== entry.page) continue;
        push(entry.page, entry.payload, {
            ...(entry.options || {}),
            eventName: entry.eventName,
            retryKey: entry.options?.retryKey || `${entry.page}:${entry.eventName}`,
        });
    }
}

function open(page, payload = {}, options = {}) {
    const nextPayload = remember(page, payload, {
        ...options,
        push: false,
    });

    if (global.ui?.open) {
        const opened = global.ui.open(page, nextPayload, {
            ...options,
            push: true,
        });

        if (opened) {
            setTimeout(() => replay(page), 100);
            setTimeout(() => replay(page), 500);
        }

        return opened;
    }

    return false;
}

function update(page, payload = {}, options = {}) {
    return remember(page, payload, options);
}

global.uiState = {
    clear,
    get,
    open,
    patch,
    remember,
    rememberEvent,
    replay,
    update,
};

mp.events.add("playerReady", () => {
    setTimeout(() => replay(), 1000);
});

console.log("[UI STATE] Loaded");
