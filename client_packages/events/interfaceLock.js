"use strict";

const hudSnapshot = global.twinkleHudSnapshot;

if (!hudSnapshot) {
    throw new Error("HUD snapshot bootstrap must load before interfaceLock.js");
}

global.uiBrowser = global.uiBrowser || null;

if (global.uiBrowser && typeof global.uiBrowser.reload === "function") {
    try {
        global.uiBrowser.reload(false);
    } catch {
        global.uiBrowser = null;
    }
}

global.__TWINKLE_GAMEPLAY_READY__ = false;
global.__TWINKLE_GAMEPLAY_OVERLAYS_SUPPRESSED__ = false;

global.__TWINKLE_CHAT_OPENED__ = global.__TWINKLE_CHAT_OPENED__ || false;
global.__TWINKLE_INPUT_FOCUSED__ = global.__TWINKLE_INPUT_FOCUSED__ || false;
global.__TWINKLE_MINING_CHALLENGE_ACTIVE__ = false;
global.__TWINKLE_FORESTRY_CHALLENGE_ACTIVE__ = false;

// GTA control disabling does not stop JavaScript key callbacks. Install one
// gate before the rest of the client packages load, so legacy direct binds
// cannot open chat/inventory/jobs while the mining CEF owns all input.
if (!global.__TWINKLE_GUARDED_KEY_BIND__) {
    const originalBind = mp.keys.bind.bind(mp.keys);
    try {
        const guardedBind = (key, hold, callback) => originalBind(key, hold, (...args) => {
            if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__ || global.__TWINKLE_FORESTRY_CHALLENGE_ACTIVE__) return;
            callback(...args);
        });
        mp.keys.bind = guardedBind;
        if (mp.keys.bind !== guardedBind) throw new Error("mp.keys.bind is not writable");
        global.__TWINKLE_GUARDED_KEY_BIND__ = originalBind;
    } catch (error) {
        try { mp.console.logError(`[INTERFACE LOCK] Direct key guard failed: ${error.message}`); } catch {}
    }
}

const UI_STATE = {
    activePage: null,
    activePayload: null,
    hudVisible: false,
};

let gameplayReady = false;
let uiCommandGeneration = 0;
let uiCommandSequence = 0;
const interactionOwners = new Set();
const gameplayOverlaySuppressors = new Set();

const UI_API_RETRY_LIMIT = 100;

const BACKGROUND_PAGES = new Set([
    "notifications",
]);

const OVERLAY_INTERFACES = new Set([
    "notifications",
    "licenseDocument",
    "radialMenu",
    "fishingShop",
    "fishingCast",
    "fishingReeling",
    "npcDialog",
    "truckerResult",
    "miningChallenge",
    "forestryChallenge",
]);

const BLOCKING_PAGES = new Set([
    "auth",
    "characterSelection",
    "characterCreator",
    "characterCustomizer",
    "spawn",
    "selectSpawn",
    "f2Menu",
    "inventory",
    "gmenu",
    "tablet",
    "furnitureEditor",
    "radialMenu",
    "huntingShop",
    "huntingProcessing",
    "dialog",
    "npcDialog",
    "fishingShop",
    "fishingCast",
    "fishingReeling",
    "fuelStation",
    "ls-customs",
    "government-computer",
    "drivingSchool",
    "phone",
    "furnitureEditor",
    "rent-car",
    "truckerRental",
    "miningEquipment",
    "miningChallenge",
    "forestryEquipment",
    "forestryChallenge",
    "auto-service",
    "vehicle-dealership",
    "character",
    "businessShop",
]);

function getUiBrowser() {
    if (!global.uiBrowser) {
        global.uiBrowser = mp.browsers.new("package://cef/index.html");
    }

    return global.uiBrowser;
}

function showCursor(state) {
    try {
        mp.gui.cursor.show(Boolean(state), Boolean(state));
    } catch {}
}

function safeExecute(code) {
    try {
        getUiBrowser().execute(code);
    } catch (e) {
        try {
            mp.console.logError(`[INTERFACE LOCK EXEC ERROR] ${e.message}`);
        } catch {}
    }
}

function syncInteractionCursor() {
    showCursor(Boolean(UI_STATE.activePage || interactionOwners.size > 0));
}

function acquireInteraction(owner) {
    const normalizedOwner = String(owner || "").trim();
    if (!normalizedOwner) return false;

    interactionOwners.add(normalizedOwner);
    syncInteractionCursor();
    return true;
}

function releaseInteraction(owner) {
    const normalizedOwner = String(owner || "").trim();
    if (!normalizedOwner) return false;

    const removed = interactionOwners.delete(normalizedOwner);
    syncInteractionCursor();
    return removed;
}

function createPageCommand(page) {
    return {
        generation: uiCommandGeneration,
        page: String(page),
        token: ++uiCommandSequence,
    };
}

function invalidateAllUiCommands() {
    uiCommandGeneration += 1;
    return uiCommandGeneration;
}

function buildUiGenerationGuard(generation) {
    return `
        const currentUiGeneration = window.__TWINKLE_UI_GENERATION__;

        if (
            typeof currentUiGeneration === "number" &&
            currentUiGeneration > ${generation}
        ) return;

        if (currentUiGeneration !== ${generation}) {
            window.__TWINKLE_UI_GENERATION__ = ${generation};
            window.__TWINKLE_PAGE_TOKENS__ = {};
        } else {
            window.__TWINKLE_PAGE_TOKENS__ ??= {};
        }
    `;
}

function rawOpenPage(page, props = null, payload = null) {
    const command = createPageCommand(page);
    const openScript = `
        (function waitTwinkle(attempt) {
            ${buildUiGenerationGuard(command.generation)}

            const currentToken = Number(
                window.__TWINKLE_PAGE_TOKENS__[${JSON.stringify(command.page)}] || 0
            );

            if (currentToken > ${command.token}) return;

            window.__TWINKLE_PAGE_TOKENS__[${JSON.stringify(command.page)}] = ${command.token};

            if (
                window.twinkleBrowser &&
                window.twinkleBrowser.pages &&
                typeof window.twinkleBrowser.pages.set === "function"
            ) {
                window.twinkleBrowser.pages.set(
                    ${JSON.stringify(page)},
                    ${JSON.stringify(props)},
                    ${JSON.stringify(payload)}
                );
                return;
            }

            if (attempt < ${UI_API_RETRY_LIMIT}) {
                setTimeout(function () { waitTwinkle(attempt + 1); }, 50);
            } else {
                console.warn("[INTERFACE LOCK] Timed out opening page ${command.page}");
            }
        })(0);
    `;

    safeExecute(openScript);
}

function rawOpenInterface(id, payload = null) {
    const command = createPageCommand(id);

    safeExecute(`
        (function waitTwinkleInterface(attempt) {
            ${buildUiGenerationGuard(command.generation)}

            const currentToken = Number(
                window.__TWINKLE_PAGE_TOKENS__[${JSON.stringify(command.page)}] || 0
            );

            if (currentToken > ${command.token}) return;

            window.__TWINKLE_PAGE_TOKENS__[${JSON.stringify(command.page)}] = ${command.token};

            if (
                window.twinkleBrowser &&
                window.twinkleBrowser.interfaces &&
                typeof window.twinkleBrowser.interfaces.open === "function"
            ) {
                const payload = ${JSON.stringify(payload || {})};
                window.twinkleBrowser.interfaces.open(
                    ${JSON.stringify(command.page)},
                    payload
                );
                window.dispatchEvent(new CustomEvent(
                    ${JSON.stringify(`twinkle:${command.page}:update`)},
                    { detail: payload }
                ));
                return;
            }

            if (attempt < ${UI_API_RETRY_LIMIT}) {
                setTimeout(function () { waitTwinkleInterface(attempt + 1); }, 50);
            } else {
                console.warn("[INTERFACE LOCK] Timed out opening interface ${command.page}");
            }
        })(0);
    `);
}

function rawClosePage(page, command = createPageCommand(page)) {
    safeExecute(`
        (function waitClose(attempt) {
            ${buildUiGenerationGuard(command.generation)}
            window.__TWINKLE_PAGE_TOKENS__[${JSON.stringify(command.page)}] = ${command.token};

            if (
                window.twinkleBrowser &&
                window.twinkleBrowser.pages &&
                typeof window.twinkleBrowser.pages.close === "function"
            ) {
                window.twinkleBrowser.pages.close(${JSON.stringify(page)});
                return;
            }

            if (attempt < ${UI_API_RETRY_LIMIT}) {
                setTimeout(function () { waitClose(attempt + 1); }, 50);
            } else {
                console.warn("[INTERFACE LOCK] Timed out closing page ${command.page}");
            }
        })(0);
    `);
}

function rawCloseInterface(id, command = createPageCommand(id)) {
    safeExecute(`
        (function waitCloseInterface(attempt) {
            ${buildUiGenerationGuard(command.generation)}
            window.__TWINKLE_PAGE_TOKENS__[${JSON.stringify(command.page)}] = ${command.token};

            if (
                window.twinkleBrowser &&
                window.twinkleBrowser.interfaces &&
                typeof window.twinkleBrowser.interfaces.close === "function"
            ) {
                window.twinkleBrowser.interfaces.close(${JSON.stringify(id)});
                return;
            }

            if (
                window.twinkleBrowser &&
                typeof window.twinkleBrowser.closeInterface === "function"
            ) {
                window.twinkleBrowser.closeInterface(${JSON.stringify(id)});
                return;
            }

            if (
                window.twinkleBrowser &&
                window.twinkleBrowser.pages &&
                typeof window.twinkleBrowser.pages.close === "function"
            ) {
                window.twinkleBrowser.pages.close(${JSON.stringify(id)});
                return;
            }

            if (attempt < ${UI_API_RETRY_LIMIT}) {
                setTimeout(function () { waitCloseInterface(attempt + 1); }, 50);
            } else {
                console.warn("[INTERFACE LOCK] Timed out closing interface ${command.page}");
            }
        })(0);
    `);
}

function rawCloseEverywhere(page) {
    const command = createPageCommand(page);
    rawCloseInterface(page, command);
    rawClosePage(page, command);
}

function rawCloseAllPages() {
    const generation = invalidateAllUiCommands();
    safeExecute(`
        (function waitCloseAllPages(attempt) {
            ${buildUiGenerationGuard(generation)}

            if (
                window.twinkleBrowser &&
                window.twinkleBrowser.pages &&
                typeof window.twinkleBrowser.pages.closeAll === "function"
            ) {
                window.twinkleBrowser.pages.closeAll();
                return;
            }

            if (attempt < ${UI_API_RETRY_LIMIT}) {
                setTimeout(function () { waitCloseAllPages(attempt + 1); }, 50);
            } else {
                console.warn("[INTERFACE LOCK] Timed out closing all pages");
            }
        })(0);
    `);
}

function rawCloseAllInterfaces() {
    const generation = invalidateAllUiCommands();
    safeExecute(`
        (function waitCloseAllInterfaces(attempt) {
            ${buildUiGenerationGuard(generation)}

            if (window.twinkleBrowser) {
            if (
                window.twinkleBrowser.pages &&
                typeof window.twinkleBrowser.pages.closeAll === "function"
            ) {
                window.twinkleBrowser.pages.closeAll();
            }

            if (
                window.twinkleBrowser.interfaces &&
                typeof window.twinkleBrowser.interfaces.closeAll === "function"
            ) {
                window.twinkleBrowser.interfaces.closeAll();
            }

                return;
            }

            if (attempt < ${UI_API_RETRY_LIMIT}) {
                setTimeout(function () { waitCloseAllInterfaces(attempt + 1); }, 50);
            } else {
                console.warn("[INTERFACE LOCK] Timed out closing all interfaces");
            }
        })(0);
    `);
}

function rawCloseAllOverlays() {
    safeExecute(`
        (function waitCloseAllOverlays(attempt) {
            if (
                window.twinkleBrowser &&
                window.twinkleBrowser.interfaces &&
                typeof window.twinkleBrowser.interfaces.closeAll === "function"
            ) {
                window.twinkleBrowser.interfaces.closeAll();
                return;
            }

            if (attempt < ${UI_API_RETRY_LIMIT}) {
                setTimeout(function () { waitCloseAllOverlays(attempt + 1); }, 50);
            }
        })(0);
    `);
}

function forceShowHudDom(payload = {}) {
    safeExecute(`
        try {
            const payload = ${JSON.stringify(payload || {})};

            window.__TWINKLE_HUD_BLOCKED__ = false;

            const selectors = [
                '[data-page="hud"]',
                '[data-interface="hud"]',
                '[data-name="hud"]',
                '#hud',
                '.hud',
                '.hud-page',
                '.hud-wrapper',
                '.hud-content',
                '.hud-root',
                '.twinkle-hud',
                '.interface-hud',
                '.hud-chat',
                '.chat',
                '.chat-wrapper'
            ];

            for (const selector of selectors) {
                document.querySelectorAll(selector).forEach((el) => {
                    el.style.display = "";
                    el.style.visibility = "";
                    el.style.opacity = "";
                    el.style.pointerEvents = "";
                });
            }

            window.dispatchEvent(new CustomEvent("twinkle:hud:update", {
                detail: {
                    ...payload,
                    visible: true,
                    blocked: false
                }
            }));

            if (window.TWINKLE_HUD) {
                window.TWINKLE_HUD.show?.();
                window.TWINKLE_HUD.setVisible?.(true);
                window.TWINKLE_HUD.update?.({
                    ...payload,
                    visible: true,
                    blocked: false
                });
                window.TWINKLE_HUD.setPayload?.({
                    ...payload,
                    visible: true,
                    blocked: false
                });
            }
        } catch (e) {
            console.log("[INTERFACE LOCK HUD RESTORE ERROR]", e);
        }
    `);
}

function isBackgroundPage(page) {
    return BACKGROUND_PAGES.has(String(page));
}

function isBlockingPage(page) {
    return BLOCKING_PAGES.has(String(page));
}

function isChatOpened() {
    return Boolean(
        global.__TWINKLE_CHAT_OPENED__ ||
        global.__TWINKLE_INPUT_FOCUSED__
    );
}

function syncChatState(opened = false) {
    global.__TWINKLE_CHAT_OPENED__ = Boolean(opened);
    global.__TWINKLE_INPUT_FOCUSED__ = Boolean(opened);

    safeExecute(`
        try {
            window.__TWINKLE_CHAT_OPENED__ = ${Boolean(opened)};
            window.__TWINKLE_INPUT_FOCUSED__ = ${Boolean(opened)};
        } catch {}
    `);
}

function closeChatOnly() {
    syncChatState(false);

    safeExecute(`
        try {
            window.__TWINKLE_CHAT_OPENED__ = false;
            window.__TWINKLE_INPUT_FOCUSED__ = false;

            if (window.TWINKLE_HUD_CHAT) {
                window.TWINKLE_HUD_CHAT.closeInput?.();
            }

            window.dispatchEvent(new CustomEvent("twinkle:chat:force-close"));
        } catch {}
    `);

    try {
        mp.gui.chat.activate(false);
    } catch {}

    try {
        mp.events.call("interface:chat:forceClose");
    } catch {}
}

function isInputBlocked() {
    try {
        if (isChatOpened()) return true;
        if (UI_STATE.activePage) return true;
        if (interactionOwners.size > 0) return true;
    } catch {}

    return false;
}

function bindKey(key, hold, callback, options = {}) {
    const boundHandler = () => {
        try {
            if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__) return;
            const opts = typeof options === "boolean"
                ? { allowWhenBlocked: options }
                : options;

            const allowWhenBlocked = Boolean(opts.allowWhenBlocked);
            const closeChatBefore = Boolean(opts.closeChatBefore);

            if (isChatOpened()) {
                if (closeChatBefore) {
                    closeChatOnly();
                } else {
                    return;
                }
            }

            if (!allowWhenBlocked && isInputBlocked()) {
                return;
            }

            callback();
        } catch (e) {
            try {
                mp.console.logError(`[BIND KEY ERROR] ${e.message}`);
            } catch {}
        }
    };
    mp.keys.bind(key, hold, boundHandler);
    return boundHandler;
}

function closeHudChat() {
    closeChatOnly();
}

function hideHud() {
    UI_STATE.hudVisible = false;

    safeExecute(`
        try {
            window.__TWINKLE_HUD_BLOCKED__ = true;
        } catch {}
    `);

    rawCloseEverywhere("hud");
    closeHudChat();

    try {
        mp.game.ui.displayHud(false);
        mp.game.ui.displayRadar(false);
    } catch {}
}

function setGameplayOverlaySuppressed(owner, suppressed = true) {
    const normalizedOwner = String(owner || "").trim();
    if (!normalizedOwner) return gameplayOverlaySuppressors.size > 0;

    if (suppressed) gameplayOverlaySuppressors.add(normalizedOwner);
    else gameplayOverlaySuppressors.delete(normalizedOwner);

    const active = gameplayOverlaySuppressors.size > 0;
    global.__TWINKLE_GAMEPLAY_OVERLAYS_SUPPRESSED__ = active;

    if (active) {
        hideHud();
        rawCloseAllOverlays();
        try {
            mp.game.ui.displayHud(false);
            mp.game.ui.displayRadar(false);
        } catch {}
    }

    return active;
}

function isGameplayOverlaySuppressed() {
    return gameplayOverlaySuppressors.size > 0;
}

function rememberHudPayload(payload) {
    return hudSnapshot.remember(payload);
}

function showHud(payload = null, force = false) {
    if (payload) {
        rememberHudPayload(payload);
    }

    if (!gameplayReady || isGameplayOverlaySuppressed()) {
        hideHud();
        return false;
    }

    if (UI_STATE.activePage && !force) {
        return false;
    }

    UI_STATE.hudVisible = true;

    const hudPayload = {
        ...(hudSnapshot.get() || {}),
        visible: true,
        blocked: false,
    };

    if (global.uiState?.remember) {
        global.uiState.remember("hud", hudPayload, {
            eventName: "twinkle:hud:update",
            globalName: "__TWINKLE_HUD_PAYLOAD__",
            retryKey: "hud:payload",
            push: false,
        });
    }

    try {
        mp.game.ui.displayHud(true);
        mp.game.ui.displayRadar(true);
    } catch {}

    safeExecute(`
        try {
            window.__TWINKLE_HUD_BLOCKED__ = false;
        } catch {}
    `);

rawOpenPage("hud", {
    overlay: true
}, hudPayload);
    forceShowHudDom(hudPayload);

    try {
        mp.events.call("chat:client:restore");
    } catch {}

    return true;
}

function restoreHudAfterInterfaceClose() {
    if (!gameplayReady) return;
    if (isGameplayOverlaySuppressed()) return;
    if (UI_STATE.activePage) return;

    try {
        mp.game.ui.displayHud(true);
        mp.game.ui.displayRadar(true);
    } catch {}

    setTimeout(() => {
        if (!UI_STATE.activePage) {
            showHud(hudSnapshot.get());
            try {
                mp.events.call("chat:client:restore");
            } catch {}
        }
    }, 50);

    setTimeout(() => {
        if (!UI_STATE.activePage) {
            showHud(hudSnapshot.get());
            try {
                mp.events.call("chat:client:restore");
            } catch {}
        }
    }, 200);

    setTimeout(() => {
        if (!UI_STATE.activePage) {
            showHud(hudSnapshot.get());
            try {
                mp.events.call("chat:client:restore");
            } catch {}
        }
    }, 500);
}

function openPage(page, props = null, payload = null, options = {}) {
    page = String(page);
    const cachePayload = payload || props || {};

    if (page === "auth") {
        setGameplayOverlaySuppressed("auth", true);
    }

    if (page === "hud") {
        hudSnapshot.remember(payload || hudSnapshot.get() || {});

        if (UI_STATE.activePage) {
            hideHud();
            return false;
        }

        return showHud(hudSnapshot.get());
    }

    if (isBackgroundPage(page)) {
        if (global.uiState?.remember) {
            global.uiState.remember(page, cachePayload, {
                retryKey: `${page}:payload`,
                push: false,
            });
        }

        if (OVERLAY_INTERFACES.has(page)) {
            rawOpenInterface(page, payload || props || {});
        } else {
            rawOpenPage(page, props, payload);
        }

        return true;
    }

    if (isBlockingPage(page)) {
        if (interactionOwners.size > 0 && !interactionOwners.has(page) && !options.force) {
            showCursor(true);
            return false;
        }

        if (isChatOpened() && !options.force) {
            showCursor(true);
            return false;
        }

        if (
            UI_STATE.activePage &&
            UI_STATE.activePage !== page &&
            !options.force
        ) {
            showCursor(true);
            return false;
        }

        if (
            UI_STATE.activePage &&
            UI_STATE.activePage !== page
        ) {
            const previousPage = UI_STATE.activePage;

            try {
                mp.events.call("interface:lock:closing", previousPage);
            } catch {}

            if (OVERLAY_INTERFACES.has(previousPage)) {
                rawCloseInterface(previousPage);
            } else {
                rawClosePage(previousPage);
            }
        }

        hideHud();

        UI_STATE.activePage = page;
        UI_STATE.activePayload = {
            props,
            payload,
        };

        if (global.uiState?.remember) {
            global.uiState.remember(page, cachePayload, {
                retryKey: `${page}:payload`,
                push: false,
            });
        }

        if (OVERLAY_INTERFACES.has(page)) {
            rawOpenInterface(page, payload || props || {});
        } else {
            rawOpenPage(page, props, payload);
        }
        showCursor(true);

        try {
            mp.game.ui.displayHud(false);
            mp.game.ui.displayRadar(false);
        } catch {}

        setTimeout(() => {
            if (UI_STATE.activePage === page) {
                hideHud();
                showCursor(true);
            }
        }, 150);

        setTimeout(() => {
            if (UI_STATE.activePage === page) {
                hideHud();
                showCursor(true);
            }
        }, 500);

        return true;
    }

    if (global.uiState?.remember) {
        global.uiState.remember(page, cachePayload, {
            retryKey: `${page}:payload`,
            push: false,
        });
    }

    rawOpenPage(page, props, payload);
    showCursor(true);

    return true;
}

function openInterface(id, payload = null, options = {}) {
    id = String(id);

    if (!OVERLAY_INTERFACES.has(id)) {
        return false;
    }

    if (isGameplayOverlaySuppressed() && id !== "notifications") {
        return false;
    }

    const interactive = Boolean(options.interactive);
    const interactionOwner = String(options.owner || id);

    if (interactive) {
        if (isChatOpened() || UI_STATE.activePage) return false;
        if (interactionOwners.size > 0 && !interactionOwners.has(interactionOwner)) return false;
    }

    if (global.uiState?.remember) {
        global.uiState.remember(id, payload || {}, {
            retryKey: `${id}:payload`,
            push: false,
        });
    }

    rawOpenInterface(id, payload || {});
    if (interactive) acquireInteraction(interactionOwner);

    return true;
}

function forceOpenPage(page, props = null, payload = null) {
    invalidateAllUiCommands();

    return openPage(page, props, payload, {
        force: true,
    });
}

function closePage(page) {
    page = String(page);
    const releasesAuthSuppression = page === "auth" && UI_STATE.activePage === page;

    if (isBackgroundPage(page)) {
        rawCloseEverywhere(page);
        return;
    }

    try {
        mp.events.call("interface:lock:closing", page);
    } catch {}

    if (OVERLAY_INTERFACES.has(page)) {
        releaseInteraction(page);
        rawCloseInterface(page);

        if (UI_STATE.activePage === page) {
            UI_STATE.activePage = null;
            UI_STATE.activePayload = null;

            syncInteractionCursor();
            restoreHudAfterInterfaceClose();
        }

        return;
    }

    rawCloseEverywhere(page);

    if (UI_STATE.activePage === page) {
        if (releasesAuthSuppression) setGameplayOverlaySuppressed("auth", false);
        UI_STATE.activePage = null;
        UI_STATE.activePayload = null;

        syncInteractionCursor();
        restoreHudAfterInterfaceClose();
    }
}

function closeActivePage() {
    if (!UI_STATE.activePage) return;

    closePage(UI_STATE.activePage);
}

function closeAllPages() {
    try {
        mp.events.call("interface:lock:closing", "*");
    } catch {}

    rawCloseAllInterfaces();

    UI_STATE.activePage = null;
    UI_STATE.activePayload = null;
    UI_STATE.hudVisible = false;
    interactionOwners.clear();

    showCursor(false);
    restoreHudAfterInterfaceClose();
}

function resetInterfaceSession() {
    try {
        mp.events.call("interface:lock:closing", "*");
    } catch {}

    rawCloseAllInterfaces();

    UI_STATE.activePage = null;
    UI_STATE.activePayload = null;
    UI_STATE.hudVisible = false;
    hudSnapshot.reset();
    interactionOwners.clear();

    if (global.uiState?.clear) {
        global.uiState.clear("hud");
    }

    if (typeof global.resetHudState === "function") {
        global.resetHudState();
    }

    showCursor(false);
    hideHud();
}

const NOTIFICATION_VARIANTS = new Set(["info", "success", "warning", "error"]);

function normalizeNotificationVariant(value, fallback = "info") {
    const normalized = String(value || "").trim().toLowerCase();
    const aliases = {
        danger: "error",
        fail: "error",
        failed: "error",
        warn: "warning",
        ok: "success",
    };
    const candidate = aliases[normalized] || normalized;

    return NOTIFICATION_VARIANTS.has(candidate) ? candidate : fallback;
}

function normalizeNotificationDuration(value) {
    const duration = Number(value);
    if (!Number.isFinite(duration)) return 4500;
    return Math.max(750, Math.min(30000, Math.round(duration)));
}

function normalizeNotificationPayload(first, second, third) {
    if (first && typeof first === "object" && !Array.isArray(first)) {
        return {
            message: String(first.message ?? first.text ?? "").trim(),
            variant: normalizeNotificationVariant(first.variant ?? first.type),
            duration: normalizeNotificationDuration(first.duration),
        };
    }

    const firstText = String(first ?? "").trim();
    const secondText = String(second ?? "").trim();
    const firstVariant = normalizeNotificationVariant(firstText, "");
    const secondVariant = normalizeNotificationVariant(secondText, "");

    if (firstVariant) {
        return {
            message: secondText,
            variant: firstVariant,
            duration: normalizeNotificationDuration(third),
        };
    }

    return {
        message: firstText || secondText,
        variant: secondVariant || "info",
        duration: normalizeNotificationDuration(third),
    };
}

function notify(message, variant = "info", duration = 4500) {
    const generation = uiCommandGeneration;

    safeExecute(`
        (function waitNotify(attempt) {
            ${buildUiGenerationGuard(generation)}

            if (
                window.twinkleBrowser &&
                typeof window.twinkleBrowser.notify === "function"
            ) {
                window.twinkleBrowser.notify(
                    ${JSON.stringify(message)},
                    {
                        variant: ${JSON.stringify(variant)},
                        duration: ${Number(duration)},
                        closable: true
                    }
                );
                return;
            }

            if (attempt < ${UI_API_RETRY_LIMIT}) {
                setTimeout(function () { waitNotify(attempt + 1); }, 50);
            } else {
                console.warn("[INTERFACE LOCK] Timed out sending notification");
            }
        })(0);
    `);
}

function canOpenPage(page) {
    page = String(page);

    if (isBackgroundPage(page)) {
        return true;
    }

    if (page === "hud") {
        return !UI_STATE.activePage;
    }

    if (!isBlockingPage(page)) {
        return true;
    }

    if (isChatOpened()) {
        return false;
    }

    if (interactionOwners.size > 0 && !interactionOwners.has(page)) {
        return false;
    }

    return !UI_STATE.activePage || UI_STATE.activePage === page;
}

function getInterfaceState() {
    return {
        activePage: UI_STATE.activePage,
        activePayload: UI_STATE.activePayload,
        hudVisible: UI_STATE.hudVisible,
        chatOpened: isChatOpened(),
        interactionOwners: Array.from(interactionOwners),
        controlsBlocked: isInputBlocked(),
    };
}

global.interfaceLock = {
    getUiBrowser,

    openPage,
    openInterface,
    forceOpenPage,

    closePage,
    closeActivePage,
    closeAllPages,
    resetInterfaceSession,

    notify,

    canOpenPage,
    getInterfaceState,

    isInputBlocked,
    isControlsBlocked: isInputBlocked,
    acquireInteraction,
    releaseInteraction,

    isChatOpened,
    closeChatOnly,
    syncChatState,

    bindKey,

    showHud,
    rememberHudPayload,
    hideHud,
    setGameplayOverlaySuppressed,
    isGameplayOverlaySuppressed,
};

global.openPage = openPage;
global.closePage = closePage;
global.closeAllPages = closeAllPages;
global.notify = notify;

global.isInputBlocked = isInputBlocked;
global.isControlsBlocked = isInputBlocked;
global.bindKey = bindKey;

global.closeChatOnly = closeChatOnly;
global.syncChatState = syncChatState;

const ESC_KEY = 0x1B;

bindKey(ESC_KEY, false, () => {
    if (isChatOpened()) {
        closeChatOnly();
        return;
    }

    if (UI_STATE.activePage) {
        // Authentication must only close after the authoritative success event.
        if (UI_STATE.activePage === "auth") return;
        // Driving School owns cancellation so the authoritative server session
        // is closed before the page disappears.
        if (UI_STATE.activePage === "drivingSchool") return;
        closeActivePage();
    }
}, {
    allowWhenBlocked: true,
    closeChatBefore: false,
});

mp.events.add("client:notification", (first = "info", second = "", third = 4500) => {
    const payload = normalizeNotificationPayload(first, second, third);

    if (!payload.message) return;

    notify(payload.message, payload.variant, payload.duration);
});

mp.events.add("c:hud:gameplayReady", (state) => {
    gameplayReady = Boolean(state);
    global.__TWINKLE_GAMEPLAY_READY__ = gameplayReady;

    if (!gameplayReady) {
        resetInterfaceSession();
        return;
    }

    if (!UI_STATE.activePage) {
        showHud(hudSnapshot.get(), true);
    }
});

mp.events.add("twinkle:cef:ready", () => {
    try {
        mp.events.callRemote("s:ui:cefReady");
    } catch {}

    const activePage = UI_STATE.activePage;

    if (activePage) {
        const envelope = UI_STATE.activePayload || {};
        if (OVERLAY_INTERFACES.has(activePage)) {
            rawOpenInterface(activePage, envelope.payload ?? envelope.props ?? {});
        } else {
            rawOpenPage(activePage, envelope.props ?? null, envelope.payload ?? null);
        }
        showCursor(true);
        return;
    }

    if (gameplayReady) {
        showHud(hudSnapshot.get(), true);
    } else {
        hideHud();
    }
});

mp.events.add("c:twinkle:resourcesReady", () => {
    gameplayReady = false;
    global.__TWINKLE_GAMEPLAY_READY__ = false;
    resetInterfaceSession();
});

console.log("[INTERFACE LOCK] Loaded");
