"use strict";

const F2_KEY = 0x71;
const PAGE_NAME = "f2Menu";

const F2_PUSH_OPTIONS = {
    eventName: "twinkle:f2:update",
    globalName: "__F2_MENU_PAYLOAD__",
    apiName: "TWINKLE_F2",
    apiMethod: "setPayload",
    spreadPayload: true,
    retryKey: "f2Menu:payload",
};

const CASE_ACTION_COOLDOWN = 3500;

let f2MenuLoading = false;
let pendingPayload = null;
let f2Opened = false;
let f2CaseActionLocked = false;

function parseJson(value, fallback = {}) {
    return global.ui?.parseJson
        ? global.ui.parseJson(value, fallback)
        : (() => {
            try {
                if (!value) return fallback;
                if (typeof value === "object") return value;
                return JSON.parse(value);
            } catch {
                return fallback;
            }
        })();
}

function getActivePage() {
    return global.ui?.getState?.()?.activePage ||
        global.interfaceLock?.getInterfaceState?.()?.activePage ||
        null;
}

function notifySafe(message, variant = "info") {
    try {
        if (global.ui?.notify) {
            global.ui.notify(message, variant);
            return;
        }

        if (global.interfaceLock?.notify) {
            global.interfaceLock.notify(message, variant);
            return;
        }

        if (typeof notify === "function") notify(message, variant);
    } catch {}
}

function openFallback(payload) {
    const pageProps = {
        payload,
        initialPayload: payload,
    };

    const pagePayload = {
        payload,
        initialPayload: payload,
    };

    if (global.interfaceLock?.openPage) {
        return global.interfaceLock.openPage(PAGE_NAME, pageProps, pagePayload);
    }

    if (typeof openPage === "function") {
        openPage(PAGE_NAME, pageProps, pagePayload);
        return true;
    }

    return false;
}

function sendPayloadToF2() {
    if (!pendingPayload) return;

    if (global.ui?.update) {
        global.ui.update(PAGE_NAME, pendingPayload, F2_PUSH_OPTIONS);
        return;
    }

    const json = JSON.stringify(pendingPayload);

    try {
        global.uiBrowser?.execute?.(`
            try {
                const payload = ${json};
                window.__F2_MENU_PAYLOAD__ = payload;
                window.dispatchEvent(new CustomEvent("twinkle:f2:update", { detail: payload }));

                if (window.TWINKLE_F2 && typeof window.TWINKLE_F2.setPayload === "function") {
                    window.TWINKLE_F2.setPayload(payload);
                }
            } catch (error) {
                console.log("[F2 PAYLOAD SEND ERROR]", error);
            }
        `);
    } catch (error) {
        console.log("[F2 MENU] CEF exec error:", error);
    }
}

function sendF2InventoryToCef(payload = {}) {
    const safePayload = parseJson(payload, {});

    if (global.ui?.emit) {
        global.ui.emit(PAGE_NAME, "twinkle:f2:inventory:set", safePayload, {
            globalName: "__TWINKLE_F2_INVENTORY__",
            retryKey: "f2Menu:inventory",
        });
        return;
    }

    const json = JSON.stringify(safePayload);

    try {
        global.uiBrowser?.execute?.(`
            try {
                const payload = ${json};
                window.__TWINKLE_F2_INVENTORY__ = payload;
                window.dispatchEvent(new CustomEvent("twinkle:f2:inventory:set", { detail: payload }));
            } catch (error) {
                console.log("[F2 INVENTORY SEND ERROR]", error);
            }
        `);
    } catch {}
}

function sendF2CaseResultToCef(payload = {}) {
    f2CaseActionLocked = false;

    const safePayload = parseJson(payload, {});
    const requestId = `${safePayload.action || "case"}:${safePayload.case?.id || safePayload.caseId || ""}:${safePayload.amount || 1}:${Date.now()}`;
    const nextPayload = {
        ...safePayload,
        requestId,
    };

    if (global.ui?.emit) {
        global.ui.emit(PAGE_NAME, "twinkle:f2:case:result", nextPayload, {
            retryKey: "f2Menu:caseResult",
        });
        return;
    }

    const json = JSON.stringify(nextPayload);

    try {
        global.uiBrowser?.execute?.(`
            try {
                const payload = ${json};
                window.dispatchEvent(new CustomEvent("twinkle:f2:case:result", { detail: payload }));
            } catch (error) {
                console.log("[F2 CASE RESULT SEND ERROR]", error);
            }
        `);
    } catch {}
}

function openF2Menu(payload = {}) {
    f2MenuLoading = false;
    pendingPayload = parseJson(payload, {});
    f2Opened = false;

    let opened = false;

    try {
        if (global.ui?.open) {
            opened = global.ui.open(PAGE_NAME, pendingPayload, {
                ...F2_PUSH_OPTIONS,
                cursor: true,
                chat: false,
                exclusive: true,
                push: true,
            });
        } else {
            opened = openFallback(pendingPayload);
        }
    } catch (error) {
        console.log("[F2 MENU] open error:", error);
        opened = false;
    }

    if (!opened) {
        return false;
    }

    f2Opened = true;

    try {
        mp.gui.cursor.show(true, true);
        mp.gui.chat.activate(false);
    } catch {}

    sendPayloadToF2();

    return true;
}

function closeF2Menu() {
    f2MenuLoading = false;
    pendingPayload = null;
    f2Opened = false;
    f2CaseActionLocked = false;

    try {
        if (global.interfaceLock?.closeChatOnly) {
            global.interfaceLock.closeChatOnly();
        } else {
            mp.gui.chat.activate(false);
        }
    } catch {}

    try {
        if (global.ui?.close) {
            global.ui.close(PAGE_NAME, { chat: false });
        } else if (global.interfaceLock?.closePage) {
            global.interfaceLock.closePage(PAGE_NAME);
        } else if (typeof closePage === "function") {
            closePage(PAGE_NAME);
        }
    } catch (error) {
        console.log("[F2 MENU] close error:", error);
    }
}

function requestF2Menu() {
    if (f2MenuLoading) return;

    const activePage = getActivePage();

    if (activePage && activePage !== PAGE_NAME) {
        return;
    }

    f2MenuLoading = true;

    try {
        mp.events.callRemote("s:f2menu:request");
    } catch (error) {
        f2MenuLoading = false;
        console.log("[F2 MENU] request error:", error);
        notifySafe("Ошибка открытия меню F2.", "error");
    }
}

function toggleF2Menu() {
    const activePage = getActivePage();

    if (activePage === PAGE_NAME) {
        closeF2Menu();
        return;
    }

    if (activePage) {
        return;
    }

    requestF2Menu();
}

function requestCaseAction(remoteEvent, payloadJson = "{}") {
    if (f2CaseActionLocked) {
        notifySafe("Кейс уже обрабатывается. Подождите.", "error");
        return;
    }

    f2CaseActionLocked = true;

    try {
        mp.events.callRemote(remoteEvent, payloadJson);
    } catch (error) {
        f2CaseActionLocked = false;
        console.log("[F2 CASE] request error:", error);
        notifySafe("Ошибка действия с кейсом.", "error");
        return;
    }

    setTimeout(() => {
        f2CaseActionLocked = false;
    }, CASE_ACTION_COOLDOWN);
}

const bindKey = global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback));

bindKey(F2_KEY, false, toggleF2Menu, {
    allowWhenBlocked: true,
    closeChatBefore: true,
});

mp.events.add("c:f2menu:open", (payloadJson = "{}") => {

    const payload = parseJson(payloadJson, {});

    console.log("[F2 PAYLOAD]");
    console.log(JSON.stringify(payload, null, 2));

    openF2Menu(payload);

});

mp.events.add("c:f2menu:update", (payloadJson = "{}") => {
    pendingPayload = parseJson(payloadJson, {});
    sendPayloadToF2();
});

mp.events.add("c:f2menu:ready", () => {
    if (!f2Opened) return;
    sendPayloadToF2();
});

mp.events.add("c:f2menu:close", closeF2Menu);

mp.events.add("c:f2menu:error", (message) => {
    f2MenuLoading = false;
    notifySafe(message || "Ошибка открытия меню F2.", "error");
});

mp.events.add("c:f2menu:inventory:set", sendF2InventoryToCef);
mp.events.add("c:f2menu:case:result", sendF2CaseResultToCef);

mp.events.add("f2:inventory:request", () => {
    mp.events.callRemote("s:f2:inventory:request");
});

mp.events.add("f2:inventory:claim", (payloadJson = "{}") => {
    mp.events.callRemote("s:f2:inventory:claim", payloadJson);
});

mp.events.add("f2:inventory:sell", (payloadJson = "{}") => {
    mp.events.callRemote("s:f2:inventory:sell", payloadJson);
});

mp.events.add("f2:case:buy", (payloadJson = "{}") => {
    requestCaseAction("s:f2:case:buy", payloadJson);
});

mp.events.add("f2:case:open", (payloadJson = "{}") => {
    requestCaseAction("s:f2:case:open", payloadJson);
});

console.log("[F2 MENU] Loaded");
