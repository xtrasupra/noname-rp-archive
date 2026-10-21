"use strict";

const INVENTORY_PAGE = "inventory";
const INVENTORY_KEY = 0x49; // I
const QUICK_SLOT_KEYS = [0x31, 0x32, 0x33, 0x34, 0x35]; // 1-5

let inventoryOpened = false;
let inventoryLoading = false;
let lastPayload = null;
let retryTimers = [];
let lastQuickUseAt = 0;
let pendingUseTimer = null;
let inventoryServerSessionOpen = false;
let latestVitalsRevision = -1;

function parseJson(value, fallback = {}) {
    try {
        if (!value) return fallback;
        if (typeof value === "object") return value;
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function getActivePage() {
    try {
        return global.ui?.getState?.()?.activePage ||
            global.interfaceLock?.getInterfaceState?.()?.activePage ||
            null;
    } catch {
        return null;
    }
}

function isChatBlocked() {
    try {
        const state = global.interfaceLock?.getInterfaceState?.();

        return Boolean(
            state?.chatOpened ||
            global.__TWINKLE_CHAT_OPENED__ ||
            global.__TWINKLE_INPUT_FOCUSED__ ||
            Date.now() < Number(global.__TWINKLE_INPUT_LOCK_UNTIL__ || 0)
        );
    } catch {
        return false;
    }
}

function notifySafe(message, variant = "error") {
    try {
        if (global.ui?.notify) {
            global.ui.notify(message, variant);
            return;
        }

        if (global.interfaceLock?.notify) {
            global.interfaceLock.notify(message, variant);
            return;
        }

        if (typeof notify === "function") {
            notify(message, variant);
            return;
        }

        mp.gui.chat.push(String(message));
    } catch {}
}

function getUiBrowser() {
    try {
        if (global.ui?.getBrowser) {
            return global.ui.getBrowser();
        }

        if (global.interfaceLock?.getUiBrowser) {
            return global.interfaceLock.getUiBrowser();
        }

        if (!global.uiBrowser) {
            global.uiBrowser = mp.browsers.new(global.__TWINKLE_CEF_URL__ || "package://cef/index.html");
        }

        return global.uiBrowser;
    } catch {
        return null;
    }
}

function execCef(code) {
    try {
        if (global.ui?.execute) {
            return global.ui.execute(code);
        }

        const browser = getUiBrowser();

        if (!browser || typeof browser.execute !== "function") {
            return false;
        }

        browser.execute(code);
        return true;
    } catch (e) {
        try {
            mp.console.logError(`[INVENTORY EXEC ERROR] ${e.message}`);
        } catch {}

        return false;
    }
}

function clearRetryTimers() {
    retryTimers.forEach((timer) => {
        try {
            clearTimeout(timer);
        } catch {}
    });

    retryTimers = [];
}

function pushPayloadToCef(method, payload = {}) {
    const safePayload = parseJson(payload, {});

    try {
        global.__INVENTORY_PAYLOAD__ = safePayload;
    } catch {}

    if (global.ui?.pushToCef) {
        global.ui.pushToCef(INVENTORY_PAGE, safePayload, {
            eventName: `twinkle:inventory:${method}`,
            globalName: "__INVENTORY_PAYLOAD__",
            apiName: "INVENTORY",
            apiMethod: method,
        });
        return;
    }

    const json = JSON.stringify(safePayload);

    execCef(`
        try {
            window.__INVENTORY_PAYLOAD__ = ${json};

            window.dispatchEvent(new CustomEvent("twinkle:inventory:${method}", {
                detail: ${json}
            }));

            if (
                window.INVENTORY &&
                typeof window.INVENTORY[${JSON.stringify(method)}] === "function"
            ) {
                window.INVENTORY[${JSON.stringify(method)}](${json});
            }
        } catch (e) {
            console.log("[INVENTORY CEF PUSH ERROR]", e);
        }
    `);
}

function pushInventoryReliable(method, payload = {}) {
    clearRetryTimers();

    if (global.ui?.pushReliable) {
        global.ui.pushReliable(INVENTORY_PAGE, parseJson(payload, {}), {
            eventName: `twinkle:inventory:${method}`,
            globalName: "__INVENTORY_PAYLOAD__",
            apiName: "INVENTORY",
            apiMethod: method,
            retryKey: `inventory:${method}`,
            retryDelays: [0, 100, 300, 600, 1000],
        });
        return;
    }

    pushPayloadToCef(method, payload);

    [100, 300, 600, 1000].forEach((delay) => {
        retryTimers.push(setTimeout(() => {
            pushPayloadToCef(method, payload);
        }, delay));
    });
}

function restoreGameUi() {
    try {
        mp.gui.cursor.show(false, false);
    } catch {}

    try {
        mp.gui.chat.activate(true);
    } catch {}

    try {
        if (global.interfaceLock?.showHud) {
            global.interfaceLock.showHud(null, true);
        } else if (global.interfaceLock?.openPage) {
            global.interfaceLock.openPage("hud");
        }
    } catch {}

    try {
        if (global.interfaceLock?.openPage) {
            global.interfaceLock.openPage("notifications");
        }
    } catch {}

    execCef(`
        try {
            window.__TWINKLE_HUD_BLOCKED__ = false;

            window.dispatchEvent(new CustomEvent("twinkle:hud:restore"));
            window.dispatchEvent(new CustomEvent("twinkle:hud:refresh"));
        } catch {}
    `);
}

function openInventory(payload = {}) {
    const activePage = getActivePage();

    if (activePage && activePage !== INVENTORY_PAGE) {
        inventoryLoading = false;
        return false;
    }

    const safePayload = parseJson(payload, {});

    lastPayload = safePayload;
    inventoryOpened = true;
    inventoryLoading = false;

    const pageProps = {
        ...safePayload,
        payload: safePayload,
    };

    const pagePayload = {
        ...safePayload,
        payload: safePayload,
    };

    if (global.ui?.open) {
        const opened = global.ui.open(INVENTORY_PAGE, safePayload, {
            cursor: true,
            chat: false,
            exclusive: true,
            spreadPayload: true,
            push: false,
        });

        if (!opened) {
            inventoryOpened = false;
            inventoryLoading = false;
            return false;
        }
    } else if (!global.interfaceLock?.openPage) {
        try {
            if (typeof openPage === "function") {
                openPage(INVENTORY_PAGE, pageProps, pagePayload);
            }
        } catch {}

        try {
            mp.gui.cursor.show(true, true);
        } catch {}
    } else {
        const opened = global.interfaceLock.openPage(
            INVENTORY_PAGE,
            pageProps,
            pagePayload,
            {
                force: false,
            }
        );

        if (!opened) {
            inventoryOpened = false;
            inventoryLoading = false;
            return false;
        }
    }

    pushInventoryReliable("open", safePayload);

    try {
        mp.gui.cursor.show(true, true);
    } catch {}

    try {
        mp.gui.chat.activate(false);
    } catch {}

    return true;
}

function updateInventory(payload = {}) {
    const safePayload = parseJson(payload, {});

    lastPayload = safePayload;

    if (!inventoryOpened && getActivePage() !== INVENTORY_PAGE) {
        return;
    }

    pushInventoryReliable("setPayload", safePayload);
}

function normalizeVital(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(100, numeric));
}

function normalizeVitalsEnvelope(raw) {
    const payload = parseJson(raw, {});
    const revision = payload.revision;
    const rawVitals = payload.vitals;

    if (
        payload.contractVersion !== 1 ||
        !Number.isSafeInteger(revision) ||
        revision < 0 ||
        !rawVitals ||
        typeof rawVitals !== "object" ||
        Array.isArray(rawVitals) ||
        typeof rawVitals.health !== "number" ||
        !Number.isFinite(rawVitals.health) ||
        typeof rawVitals.food !== "number" ||
        !Number.isFinite(rawVitals.food) ||
        typeof rawVitals.water !== "number" ||
        !Number.isFinite(rawVitals.water)
    ) {
        return null;
    }

    return {
        contractVersion: 1,
        revision,
        vitals: {
            health: normalizeVital(rawVitals.health, 100),
            food: normalizeVital(rawVitals.food, 100),
            water: normalizeVital(rawVitals.water, 100),
        },
    };
}

function pushVitalsToCef(envelope) {
    const json = JSON.stringify(envelope);
    execCef(`
        try {
            window.dispatchEvent(new CustomEvent("twinkle:inventory:vitals", {
                detail: ${json}
            }));
        } catch (e) {
            console.log("[INVENTORY VITALS CEF PUSH ERROR]", e);
        }
    `);
}

function updateInventoryVitals(raw = "{}") {
    const envelope = normalizeVitalsEnvelope(raw);
    if (!envelope || envelope.revision <= latestVitalsRevision) return;
    latestVitalsRevision = envelope.revision;

    if (lastPayload && typeof lastPayload === "object") {
        lastPayload = { ...lastPayload, vitalsState: envelope };
    }

    if (!inventoryOpened && getActivePage() !== INVENTORY_PAGE) return;
    if (lastPayload && typeof lastPayload === "object") {
        pushInventoryReliable("setPayload", lastPayload);
        return;
    }

    pushVitalsToCef(envelope);
}

function finalizeInventoryClose(notifyServer = true, notifyCef = true) {
    const hadInventoryState = inventoryOpened || inventoryLoading || lastPayload !== null || inventoryServerSessionOpen;
    inventoryOpened = false;
    inventoryLoading = false;
    lastPayload = null;

    if (notifyServer && inventoryServerSessionOpen) {
        inventoryServerSessionOpen = false;
        try { mp.events.callRemote("inventory:server:close"); } catch {}
    } else if (!notifyServer) {
        inventoryServerSessionOpen = false;
    }

    clearRetryTimers();

    if (notifyCef && hadInventoryState) pushPayloadToCef("close", {});
}

function closeInventory(notifyServer = true) {
    finalizeInventoryClose(notifyServer, true);

    try {
        if (global.ui?.close) {
            global.ui.close(INVENTORY_PAGE, { chat: true });
        } else if (global.interfaceLock?.closePage) {
            global.interfaceLock.closePage(INVENTORY_PAGE);
        } else if (typeof closePage === "function") {
            closePage(INVENTORY_PAGE);
        }
    } catch (e) {
        console.log("[INVENTORY CLOSE ERROR]", e.message);
    }

    restoreGameUi();
}

function useQuickSlot(index) {
    if (isChatBlocked()) return;
    if (inventoryOpened || getActivePage() === INVENTORY_PAGE) return;

    try {
        const now = Date.now();

        if (now - lastQuickUseAt < 300) {
            return;
        }

        lastQuickUseAt = now;
        mp.events.callRemote("inventory:server:quickUse", Number(index));
    } catch (e) {
        try {
            mp.console.logError(`[INVENTORY QUICK SLOT ERROR] ${e.message}`);
        } catch {}
    }
}

function toggleInventory() {
    if (inventoryLoading) return;

    const activePage = getActivePage();

    if (inventoryOpened || activePage === INVENTORY_PAGE) {
        closeInventory();
        return;
    }

    if (isChatBlocked()) {
        return;
    }

    if (activePage) {
        return;
    }

    inventoryLoading = true;

    try {
        mp.events.callRemote("inventory:server:open");
    } catch (e) {
        inventoryLoading = false;
        console.log("[INVENTORY REQUEST ERROR]", e.message);
        notifySafe("Ошибка открытия инвентаря.", "error");
    }
}

mp.events.add("inventory:client:open", (raw = "{}") => {
    inventoryServerSessionOpen = true;
    if (!openInventory(parseJson(raw, {}))) {
        finalizeInventoryClose(true, false);
    }
});

mp.events.add("inventory:client:update", (raw = "{}") => {
    updateInventory(parseJson(raw, {}));
});

mp.events.add("inventory:client:vitals", updateInventoryVitals);

mp.events.add("inventory:client:close", () => {
    closeInventory(false);
});

mp.events.add("interface:lock:closing", (page) => {
    const closingPage = String(page || "");
    if (closingPage !== INVENTORY_PAGE && closingPage !== "*") return;
    finalizeInventoryClose(true, true);
});

mp.events.add("inventory:cef:move", (raw) => {
    mp.events.callRemote("inventory:server:move", raw);
});

mp.events.add("inventory:cef:action", (raw) => {
    const payload = parseJson(raw, {});
    if (String(payload?.action || "") !== "use") {
        mp.events.callRemote("inventory:server:action", raw);
        return;
    }

    if (pendingUseTimer) return;
    closeInventory();
    pendingUseTimer = setTimeout(() => {
        pendingUseTimer = null;
        try {
            mp.events.callRemote("inventory:server:action", JSON.stringify(payload));
        } catch (e) {
            try { mp.console.logError(`[INVENTORY USE ERROR] ${e.message}`); } catch {}
        }
    }, 0);
});

if (typeof global.bindKey === "function") {
    global.bindKey(
        INVENTORY_KEY,
        false,
        () => {
            toggleInventory();
        },
        {
            allowWhenBlocked: true,
            closeChatBefore: false,
            allowWhenInputFocused: false,
        }
    );

    QUICK_SLOT_KEYS.forEach((key, index) => {
        global.bindKey(
            key,
            false,
            () => useQuickSlot(index),
            {
                allowWhenBlocked: false,
                closeChatBefore: false,
                allowWhenInputFocused: false,
            }
        );
    });
} else {
    mp.keys.bind(INVENTORY_KEY, false, () => {
        if (isChatBlocked()) return;
        toggleInventory();
    });

    QUICK_SLOT_KEYS.forEach((key, index) => {
        mp.keys.bind(key, false, () => useQuickSlot(index));
    });
}

mp.events.add("playerCommand", (command) => {
    const args = String(command || "").trim().split(/\s+/);
    const cmd = String(args[0] || "").toLowerCase();

    if (cmd !== "inv") return;

    toggleInventory();
});

console.log("[INVENTORY CLIENT] Loaded");
