"use strict";

const PHONE_PAGE = "phone";
const PHONE_KEY = 0x26; // Arrow Up

function getActivePage() {
    try {
        return global.ui?.getState?.()?.activePage ||
            global.interfaceLock?.getInterfaceState?.()?.activePage ||
            null;
    } catch {
        return null;
    }
}

function isInputBlocked() {
    try {
        const state = global.interfaceLock?.getInterfaceState?.() || {};

        return Boolean(
            state.chatOpened ||
            global.__TWINKLE_CHAT_OPENED__ ||
            global.__TWINKLE_INPUT_FOCUSED__ ||
            Date.now() < Number(global.__TWINKLE_INPUT_LOCK_UNTIL__ || 0)
        );
    } catch {
        return false;
    }
}

function openPhone(force = false) {
    const activePage = getActivePage();

    if (!force && activePage && activePage !== PHONE_PAGE) {
        return false;
    }

    if (global.ui?.open) {
        return global.ui.open(PHONE_PAGE, {}, {
            cursor: true,
            chat: false,
            exclusive: true,
        });
    }

    if (global.interfaceLock?.openPage) {
        return global.interfaceLock.openPage(PHONE_PAGE, {}, {}, { force });
    }

    return false;
}

function closePhone() {
    if (global.ui?.close) {
        global.ui.close(PHONE_PAGE, { chat: true });
        return;
    }

    if (global.interfaceLock?.closePage) {
        global.interfaceLock.closePage(PHONE_PAGE);
    }
}

function togglePhone() {
    if (isInputBlocked()) return;

    const activePage = getActivePage();

    if (activePage === PHONE_PAGE) {
        closePhone();
        return;
    }

    openPhone(false);
}

if (typeof global.bindKey === "function") {
    global.bindKey(PHONE_KEY, false, togglePhone, {
        allowWhenBlocked: false,
        closeChatBefore: false,
        allowWhenInputFocused: false,
    });
} else {
    mp.keys.bind(PHONE_KEY, false, togglePhone);
}

mp.events.add("phone:client:open", () => openPhone(true));
mp.events.add("phone:client:close", closePhone);

console.log("[PHONE CLIENT] Loaded");
