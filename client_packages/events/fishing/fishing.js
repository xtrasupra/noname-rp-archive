"use strict";

let fishingActive = false;
let fishingPoints = [];
let fishingPointRange = 30;
let fishingBlips = [];
let currentSessionToken = "";
let activeFishingPage = null;
let fishingScenarioActive = false;
let currentFishingPhase = "";
let timingInputLocked = false;

const FISHING_SHOP_PAGE = "fishingShop";
const FISHING_CAST_PAGE = "fishingCast";
const FISHING_REELING_PAGE = "fishingReeling";
const FISHING_OVERLAY_PAGES = new Set([FISHING_SHOP_PAGE, FISHING_CAST_PAGE, FISHING_REELING_PAGE]);
const E_KEY = 0x45;
const ESC_KEY = 0x1B;
const SPACE_KEY = 0x20;

function parsePayload(raw) {
    try {
        if (!raw) return {};
        if (typeof raw === "object") return raw;
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function getUiBrowser() {
    if (!global.uiBrowser) {
        global.uiBrowser = mp.browsers.new(global.__TWINKLE_CEF_URL__ || "package://cef/index.html");
    }

    return global.uiBrowser;
}

function executeBrowser(code) {
    try {
        getUiBrowser().execute(code);
    } catch (error) {
        try { mp.console.logError(`[FISHING] CEF execute error: ${error.message}`); } catch {}
    }
}

function getActivePage() {
    return global.interfaceLock?.getInterfaceState?.()?.activePage || null;
}

function isFishingOverlayPage(page) {
    return FISHING_OVERLAY_PAGES.has(String(page));
}

function hideFishingCursorIfIdle() {
    if (activeFishingPage || getActivePage()) return;

    try {
        mp.gui.cursor.show(false, false);
    } catch {}
}

function canUseInput() {
    try {
        if (global.interfaceLock?.isChatOpened?.()) return false;
        const activePage = getActivePage();
        return !activePage && !activeFishingPage;
    } catch {
        return true;
    }
}

function openPage(page, payload = {}) {
    const pageName = String(page);
    if (isFishingOverlayPage(pageName)) {
        activeFishingPage = pageName;
    }

    if (global.interfaceLock?.forceOpenPage) {
        global.interfaceLock.forceOpenPage(pageName, null, payload || {});
        return;
    }
    if (global.interfaceLock?.openPage) {
        global.interfaceLock.openPage(pageName, null, payload || {});
        return;
    }

    executeBrowser(`
        (function waitFishingPage() {
            try {
                if (
                    window.twinkleBrowser &&
                    window.twinkleBrowser.pages &&
                    typeof window.twinkleBrowser.pages.set === "function"
                ) {
                    window.twinkleBrowser.pages.set(
                        ${JSON.stringify(pageName)},
                        null,
                        ${JSON.stringify(payload || {})}
                    );
                    return;
                }
            } catch (e) {
                console.log("[FISHING] page open failed", e);
            }
            setTimeout(waitFishingPage, 50);
        })();
    `);
    try { mp.gui.cursor.show(true, true); } catch {}
}

function closePage(page) {
    const pageName = String(page);
    if (activeFishingPage === pageName) {
        activeFishingPage = null;
    }

    if (global.interfaceLock?.closePage) {
        global.interfaceLock.closePage(pageName);
        hideFishingCursorIfIdle();
        return;
    }

    executeBrowser(`
        try {
            window.twinkleBrowser?.interfaces?.close?.(${JSON.stringify(pageName)});
            window.twinkleBrowser?.pages?.close?.(${JSON.stringify(pageName)});
        } catch (e) {}
    `);
    hideFishingCursorIfIdle();
}

function closeFishingPages() {
    activeFishingPage = null;
    currentFishingPhase = "";
    timingInputLocked = false;
    stopFishingScenario();
    closePage(FISHING_CAST_PAGE);
    closePage(FISHING_REELING_PAGE);
}

function clearBlips() {
    fishingBlips.forEach((blip) => {
        try { blip.destroy(); } catch {}
    });
    fishingBlips = [];
}

function createPointBlips() {
    clearBlips();
    if (!fishingActive) return;

    fishingPoints.forEach((point) => {
        const position = point.position || {};
        const blipConfig = point.blip || {};
        try {
            const blip = mp.blips.new(
                Number(blipConfig.sprite || 68),
                new mp.Vector3(Number(position.x || 0), Number(position.y || 0), Number(position.z || 0)),
                {
                    name: String(blipConfig.name || point.name || "Рыбалка"),
                    color: Number(blipConfig.color || 38),
                    scale: Number(blipConfig.scale || 0.65),
                    shortRange: true,
                }
            );
            fishingBlips.push(blip);
        } catch (error) {
            try { mp.console.logError(`[FISHING] blip error: ${error.message}`); } catch {}
        }
    });
}

function getDistance(a, b) {
    if (!a || !b) return Number.MAX_SAFE_INTEGER;
    const dx = Number(a.x || 0) - Number(b.x || 0);
    const dy = Number(a.y || 0) - Number(b.y || 0);
    const dz = Number(a.z || 0) - Number(b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getNearestPoint() {
    if (!fishingActive || fishingPoints.length === 0) return null;
    const player = mp.players.local;
    return fishingPoints
        .map((point) => ({
            point,
            distance: getDistance(player.position, point.position),
        }))
        .filter((entry) => entry.distance <= Number(fishingPointRange || 30))
        .sort((a, b) => a.distance - b.distance)[0]?.point || null;
}

function requestCastSetup() {
    if (!fishingActive) return;
    if (!getNearestPoint()) {
        try { global.notify?.("Подойдите к точке ловли.", "warning"); } catch {}
        return;
    }

    try {
        mp.events.callRemote("server:fishing:requestCastSetup");
    } catch {}
}

function setupFishing(rawPayload) {
    const payload = parsePayload(rawPayload);
    fishingActive = Boolean(payload.active);
    fishingPoints = Array.isArray(payload.points) ? payload.points : [];
    fishingPointRange = Number(payload.pointRange || 30);
    createPointBlips();
}

function teardownFishing() {
    fishingActive = false;
    fishingPoints = [];
    currentSessionToken = "";
    clearBlips();
    closeFishingPages();
}

function openFishingShop(rawPayload) {
    const payload = parsePayload(rawPayload);
    if (
        payload?.contractVersion !== 1 ||
        !Array.isArray(payload?.categories) ||
        !Array.isArray(payload?.items) ||
        !Array.isArray(payload?.guide)
    ) {
        try { global.interfaceLock?.notify?.("Магазин рыбака прислал некорректные данные.", "error"); } catch {}
        return;
    }
    openPage(FISHING_SHOP_PAGE, payload);
}

function closeFishingShop() {
    closePage(FISHING_SHOP_PAGE);
}

function updateReelingPage(payload) {
    currentFishingPhase = String(payload?.phase || "");
    timingInputLocked = currentFishingPhase !== "timing";
    openPage(FISHING_REELING_PAGE, payload);
}

function submitFishingTiming(progress = null) {
    if (activeFishingPage !== FISHING_REELING_PAGE || !currentSessionToken) return;
    if (currentFishingPhase !== "timing" || timingInputLocked) return;
    try {
        if (global.interfaceLock?.isChatOpened?.()) return;
    } catch {}

    timingInputLocked = true;

    const payload = { token: currentSessionToken };
    if (Number.isFinite(Number(progress))) {
        payload.progress = Number(progress);
    }

    try {
        mp.events.callRemote("server:fishing:hook", JSON.stringify(payload));
    } catch {}
}

function startFishingScenario() {
    const player = mp.players.local;
    if (!player || fishingScenarioActive) return;

    try {
        player.taskStartScenarioInPlace("WORLD_HUMAN_STAND_FISHING", 0, true);
        fishingScenarioActive = true;
    } catch (error) {
        try { mp.console.logError(`[FISHING] scenario start error: ${error.message}`); } catch {}
    }
}

function stopFishingScenario() {
    const player = mp.players.local;
    if (!player || !fishingScenarioActive) return;

    try {
        if (typeof player.clearTasksImmediately === "function") player.clearTasksImmediately();
        else if (typeof player.clearTasks === "function") player.clearTasks();
    } catch {}
    fishingScenarioActive = false;
}

mp.events.add("fishing:setup", setupFishing);
mp.events.add("fishing:teardown", teardownFishing);

mp.events.add("fishing:castSetup", (payloadJson) => {
    const payload = parsePayload(payloadJson);
    openPage(FISHING_CAST_PAGE, payload);
});

mp.events.add("fishing:castAccepted", (payloadJson) => {
    const payload = parsePayload(payloadJson);
    currentSessionToken = String(payload.token || "");
    closePage(FISHING_CAST_PAGE);
    startFishingScenario();
    updateReelingPage({
        ...payload,
        phase: payload.phase || "timing",
        token: currentSessionToken,
    });
});

mp.events.add("fishing:timingRetry", (payloadJson) => {
    const payload = parsePayload(payloadJson);
    currentSessionToken = String(payload.token || currentSessionToken || "");
    updateReelingPage({
        ...payload,
        phase: "fail",
        token: currentSessionToken,
    });
});

mp.events.add("fishing:bite", (payloadJson) => {
    const payload = parsePayload(payloadJson);
    currentSessionToken = String(payload.token || currentSessionToken || "");
    updateReelingPage({
        phase: "bite",
        token: currentSessionToken,
        hookWindowMs: Number(payload.hookWindowMs || 5200),
    });
});

mp.events.add("fishing:reelingStart", (payloadJson) => {
    const payload = parsePayload(payloadJson);
    currentSessionToken = String(payload.token || currentSessionToken || "");
    updateReelingPage({
        ...payload,
        phase: "reeling",
        token: currentSessionToken,
    });
});

mp.events.add("fishing:reelingState", (payloadJson) => {
    const payload = parsePayload(payloadJson);
    currentSessionToken = String(payload.token || currentSessionToken || "");
    updateReelingPage({
        ...payload,
        phase: "reeling",
        token: currentSessionToken,
    });
});

mp.events.add("fishing:sessionEnd", (reason = "") => {
    currentSessionToken = "";
    currentFishingPhase = "";
    timingInputLocked = false;
    stopFishingScenario();
    updateReelingPage({
        phase: "result",
        reason: String(reason || "cancelled"),
        closing: true,
    });
    setTimeout(() => closeFishingPages(), 900);
});

mp.events.add("client:fishingShop:open", openFishingShop);
mp.events.add("client:fishingShop:close", closeFishingShop);

mp.events.add("fishingShop:buy", (rawData) => {
    const payload = parsePayload(rawData);
    const items = Array.isArray(payload.items) ? payload.items : [];
    const normalized = items
        .slice(0, 20)
        .map((entry) => ({
            itemId: String(entry?.itemId || entry?.id || ""),
            quantity: Math.min(10, Math.max(1, Math.floor(Number(entry?.quantity || 1)))),
        }))
        .filter((entry) => entry.itemId);

    if (normalized.length === 0) return;
    try {
        mp.events.callRemote("server:fishingShop:buyCart", JSON.stringify({ items: normalized }));
    } catch {}
});

mp.events.add("fishingShop:close", () => {
    closeFishingShop();
    try { mp.events.callRemote("server:fishingShop:close"); } catch {}
});

mp.events.add("fishingCast:start", (rawData) => {
    const payload = parsePayload(rawData);
    const point = getNearestPoint();
    try {
        mp.events.callRemote("server:fishing:startCast", JSON.stringify({
            ...payload,
            pointId: payload.pointId || point?.id || "",
        }));
    } catch {}
});

mp.events.add("fishingCast:close", () => {
    closePage(FISHING_CAST_PAGE);
});

mp.events.add("fishingReeling:hook", (rawData) => {
    const payload = parsePayload(rawData);
    if (payload.token) currentSessionToken = String(payload.token || currentSessionToken || "");
    submitFishingTiming(payload.progress);
});

mp.events.add("fishingReeling:input", (rawData) => {
    const payload = parsePayload(rawData);
    try {
        mp.events.callRemote("server:fishing:reelInput", JSON.stringify({
            token: payload.token || currentSessionToken,
            action: payload.action || "pull",
        }));
    } catch {}
});

mp.events.add("fishingReeling:cancel", () => {
    stopFishingScenario();
    closePage(FISHING_REELING_PAGE);
    try { mp.events.callRemote("server:fishing:cancel"); } catch {}
});

const bindKey = global.bindKey || ((key, hold, cb) => mp.keys.bind(key, hold, cb));

bindKey(E_KEY, false, () => {
    if (!canUseInput()) return;
    requestCastSetup();
}, {
    allowWhenBlocked: false,
    closeChatBefore: false,
});

bindKey(ESC_KEY, false, () => {
    const activePage = getActivePage();
    if (activePage === FISHING_SHOP_PAGE) {
        closeFishingShop();
        try { mp.events.callRemote("server:fishingShop:close"); } catch {}
        return;
    }

    if (activeFishingPage === FISHING_CAST_PAGE) {
        closePage(FISHING_CAST_PAGE);
        return;
    }

    if (activeFishingPage === FISHING_REELING_PAGE) {
        closePage(FISHING_REELING_PAGE);
        try { mp.events.callRemote("server:fishing:cancel"); } catch {}
    }
}, {
    allowWhenBlocked: true,
    closeChatBefore: false,
});

bindKey(SPACE_KEY, false, () => {
    submitFishingTiming();
}, {
    allowWhenBlocked: true,
    closeChatBefore: false,
});

console.log("[FISHING CLIENT] Loaded");
