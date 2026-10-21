"use strict";

let npcDialogHint = false;
let npcDialogOpened = false;
let npcDialogCamera = null;
let lastNpcDialogPayload = null;

const NPC_DIALOG_PAGE = "npcDialog";
const HUNTING_SHOP_PAGE = "huntingShop";
const E_KEY = 0x45;
const ESC_KEY = 0x1B;
const ALT_KEY = 0x12;
const F4_KEY = 0x73;

let systemCloseLocked = false;

function parsePayload(payloadJson) {
    try {
        if (!payloadJson) return {};
        if (typeof payloadJson === "object") return payloadJson;
        return JSON.parse(payloadJson);
    } catch {
        return {};
    }
}

function getActivePage() {
    return global.interfaceLock?.getInterfaceState?.()?.activePage || null;
}

function canOpenNpcDialog() {
    const activePage = getActivePage();

    if (!activePage) return true;
    return activePage === NPC_DIALOG_PAGE;
}

function freezePlayer(state) {
    const player = mp.players.local;

    try {
        player.freezePosition(Boolean(state));
    } catch {}

    try {
        player.setInvincible(Boolean(state));
    } catch {}

    try {
        player.setCanBeDamaged(!state);
    } catch {}
}

function destroyDialogCamera() {
    if (!npcDialogCamera) return;

    try {
        mp.game.cam.renderScriptCams(false, true, 650, true, false);
        npcDialogCamera.destroy();
    } catch {}

    npcDialogCamera = null;
}

function createDialogCamera(payload) {
    if (npcDialogCamera) return;

    const npcPos = payload?.camera?.position || payload?.position;
    if (!npcPos) return;

    const player = mp.players.local;
    const p = player.position;

    const npcX = Number(npcPos.x);
    const npcY = Number(npcPos.y);
    const npcZ = Number(npcPos.z);

    const dx = p.x - npcX;
    const dy = p.y - npcY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const dirX = dx / len;
    const dirY = dy / len;

    const camPos = new mp.Vector3(
        npcX + dirX * 2.2,
        npcY + dirY * 2.2,
        npcZ + 1.15
    );

    const lookAt = new mp.Vector3(
        npcX,
        npcY,
        npcZ + 0.85
    );

    npcDialogCamera = mp.cameras.new(
        "npcDialogCamera",
        camPos,
        new mp.Vector3(0, 0, 0),
        42
    );

    npcDialogCamera.pointAtCoord(lookAt.x, lookAt.y, lookAt.z);
    npcDialogCamera.setActive(true);

    mp.game.cam.renderScriptCams(true, true, 750, true, false);
}

function startDialogMode(payload) {
    if (npcDialogOpened) return;

    if (!global.interfaceLock?.openPage) return false;

    const opened = global.interfaceLock.openPage(
        NPC_DIALOG_PAGE,
        null,
        payload || {}
    );

    if (!opened) return false;

    npcDialogOpened = true;
    lastNpcDialogPayload = payload || {};

    freezePlayer(true);
    createDialogCamera(payload);

    try {
        mp.gui.cursor.show(true, true);
    } catch {}

    return true;
}

function stopDialogMode() {
    if (!npcDialogOpened && !npcDialogCamera) return;

    npcDialogOpened = false;

    destroyDialogCamera();
    freezePlayer(false);
    lastNpcDialogPayload = null;

    if (global.interfaceLock?.closePage) {
        global.interfaceLock.closePage(NPC_DIALOG_PAGE);
    } else {
        try {
            mp.game.ui.displayRadar(true);
            mp.game.ui.displayHud(true);
            mp.gui.cursor.show(false, false);
        } catch {}
    }
}

function openNpcDialog(payload = {}) {
    if (!canOpenNpcDialog()) return;

    if (npcDialogOpened) {
        lastNpcDialogPayload = payload || {};
        global.interfaceLock?.openPage?.(
            NPC_DIALOG_PAGE,
            null,
            payload || {}
        );
        return;
    }

    if (!startDialogMode(payload)) {
        try {
            mp.events.callRemote("server:npcDialog:end");
        } catch {}
    }
}

function closeNpcDialog() {
    if (!npcDialogOpened && getActivePage() !== NPC_DIALOG_PAGE) return;

    stopDialogMode();
}

function openInterface(id, payload) {
    if (String(id) === NPC_DIALOG_PAGE) {
        openNpcDialog(payload);
        return;
    }

    if (String(id) === HUNTING_SHOP_PAGE && global.interfaceLock?.forceOpenPage) {
        global.interfaceLock.forceOpenPage(HUNTING_SHOP_PAGE, null, payload || {});
        return;
    }

    if (global.interfaceLock?.openPage) {
        global.interfaceLock.openPage(String(id), null, payload || {});
    }
}

function closeInterface(id) {
    if (String(id) === NPC_DIALOG_PAGE) {
        closeNpcDialog();
        return;
    }

    if (global.interfaceLock?.closePage) {
        global.interfaceLock.closePage(String(id));
    }
}

function isAltPressed() {
    try {
        if (mp.keys?.isDown?.(ALT_KEY)) return true;
    } catch {}

    try {
        return Boolean(mp.game.controls.isControlPressed(0, 19));
    } catch {}

    return false;
}

function isSystemMenuActive() {
    try {
        if (mp.game.ui.isPauseMenuActive()) return true;
    } catch {}

    try {
        if (mp.game.invoke("0xB0034A223497FFCB")) return true;
    } catch {}

    return false;
}

function hasClosableNpcInterface() {
    const activePage = getActivePage();

    return Boolean(
        npcDialogOpened ||
        npcDialogCamera ||
        activePage === NPC_DIALOG_PAGE ||
        activePage === HUNTING_SHOP_PAGE
    );
}

function closeNpcInterfacesForSystemMenu() {
    if (systemCloseLocked || !hasClosableNpcInterface()) return;

    systemCloseLocked = true;

    if (getActivePage() === HUNTING_SHOP_PAGE) {
        closeInterface(HUNTING_SHOP_PAGE);
        try {
            mp.events.callRemote("server:huntingShop:close");
        } catch {}
    }

    if (npcDialogOpened || npcDialogCamera || getActivePage() === NPC_DIALOG_PAGE) {
        stopDialogMode();
        try {
            mp.events.callRemote("server:npcDialog:end");
        } catch {}
    }

    try {
        mp.gui.cursor.show(false, false);
    } catch {}

    setTimeout(() => {
        systemCloseLocked = false;
    }, 750);
}

const startedNpcScenarios = new Set();

function getNpcEntityKey(entity) {
    return Number(entity?.remoteId ?? entity?.id ?? entity?.handle ?? -1);
}

function applyNpcPedState(entity, forceScenario = false) {
    if (!entity || (entity.type !== "ped" && entity.type !== "player")) return;

    let npcDialogId = null;
    try {
        npcDialogId = entity.getVariable("npcDialogId");
    } catch {}
    if (!npcDialogId) return;

    const heading = Number(entity.getVariable("npcHeading") || 0);
    const scenario = entity.getVariable("npcScenario");

    try {
        entity.setHeading(heading);
        entity.freezePosition(true);
        entity.setInvincible(true);
        entity.setCanBeDamaged(false);
        entity.setCanBeTargetted?.(false);
        try { mp.game.ped.setCanBeTargetted(entity.handle, false); } catch {}
        entity.setProofs(true, true, true, true, true, true, true, true);
        entity.setBlockingOfNonTemporaryEvents(true);
        entity.setCanRagdoll(false);
        entity.setFleeAttributes?.(0, false);
        entity.setCombatAbility?.(0);
        entity.setCombatMovement?.(0);
        entity.setCombatAttributes?.(46, false);
        entity.setKeepTask?.(true);
    } catch {}

    if (scenario) {
        const entityKey = getNpcEntityKey(entity);
        let scenarioInterrupted = Boolean(forceScenario) || !startedNpcScenarios.has(entityKey);
        try {
            scenarioInterrupted = scenarioInterrupted ||
                Boolean(entity.isFleeing?.()) ||
                Boolean(entity.isInCombat?.(mp.players.local.handle)) ||
                Boolean(entity.isRagdoll?.());
        } catch {
            scenarioInterrupted = Boolean(forceScenario) || !startedNpcScenarios.has(entityKey);
        }

        if (!scenarioInterrupted) return;
        try {
            entity.clearTasksImmediately?.();
            entity.setHeading(heading);
            entity.taskStartScenarioInPlace(String(scenario), 0, true);
            startedNpcScenarios.add(entityKey);
        } catch {}
    }
}

function normalizeDialogAction(rawData) {
    let data = rawData;

    try {
        if (typeof rawData === "string") {
            try {
                data = JSON.parse(rawData);
            } catch {
                data = {
                    id: rawData,
                };
            }
        }
    } catch {
        data = {};
    }

    if (!data || typeof data !== "object") {
        data = {};
    }

    const payload = data.payload || data || {};

    if (payload.next || payload.action || payload.close) {
        return {
            ...payload,
            id: payload.id || data.id || null,
            label: payload.label || data.label || null,
            nodeId: payload.nodeId || lastNpcDialogPayload?.nodeId || null,
            npcId: payload.npcId || lastNpcDialogPayload?.id || null,
        };
    }

    const actionId = payload.id || data.id;

    if (!actionId || !lastNpcDialogPayload?.actions?.length) {
        return payload;
    }

    const action = lastNpcDialogPayload.actions.find((item) => {
        return String(item.id) === String(actionId);
    });

    if (!action) {
        return payload;
    }

    return {
        ...(action.payload || {}),
        id: action.id,
        label: action.label,
        nodeId: lastNpcDialogPayload.nodeId || null,
        npcId: lastNpcDialogPayload.id || null,
    };
}

function tryOpenNpcDialog() {
    if (!npcDialogHint) return;
    if (npcDialogOpened) return;
    if (!canOpenNpcDialog()) return;

    try {
        mp.events.callRemote("server:npcDialog:tryOpen");
    } catch {}
}

function requestEndNpcDialog() {
    if (!npcDialogOpened) return;

    try {
        mp.events.callRemote("server:npcDialog:end");
    } catch {}
}

mp.events.add("entityStreamIn", (entity) => {
    applyNpcPedState(entity, true);
    setTimeout(() => {
        try { applyNpcPedState(entity, false); } catch {}
    }, 350);
});

mp.events.add("entityStreamOut", (entity) => {
    startedNpcScenarios.delete(getNpcEntityKey(entity));
});

setInterval(() => {
    const apply = (entity) => {
        try { applyNpcPedState(entity, false); } catch {}
    };
    try { mp.peds.forEachInStreamRange(apply); } catch {}
    try {
        mp.players.forEachInStreamRange((entity) => {
            if (entity !== mp.players.local) apply(entity);
        });
    } catch {}
}, 2000);

mp.events.add("client:interface:open", (id, payloadJson) => {
    const payload = parsePayload(payloadJson);
    openInterface(id, payload);
});

mp.events.add("client:interface:close", (id) => {
    closeInterface(id);
});

mp.events.add("client:huntingShop:open", (payloadJson) => {
    const payload = parsePayload(payloadJson);
    stopDialogMode();
    openInterface(HUNTING_SHOP_PAGE, payload);
});

mp.events.add("client:huntingShop:close", () => {
    closeInterface(HUNTING_SHOP_PAGE);
});

mp.events.add("client:npcDialog:setHint", (state) => {
    npcDialogHint = Boolean(state);
});

mp.events.add("interface:lock:closing", (page) => {
    if (String(page) !== "*" && String(page) !== NPC_DIALOG_PAGE) return;
    stopDialogMode();
});

const bindKey = global.bindKey || ((key, hold, cb) => mp.keys.bind(key, hold, cb));

bindKey(E_KEY, false, () => {
    tryOpenNpcDialog();
}, {
    allowWhenBlocked: false,
    closeChatBefore: false,
});

bindKey(ESC_KEY, false, () => {
    if (getActivePage() === HUNTING_SHOP_PAGE) {
        closeInterface(HUNTING_SHOP_PAGE);
        mp.events.callRemote("server:huntingShop:close");
        return;
    }

    requestEndNpcDialog();
}, {
    allowWhenBlocked: true,
    closeChatBefore: false,
});

bindKey(F4_KEY, false, () => {
    if (!isAltPressed()) return;

    closeNpcInterfacesForSystemMenu();
}, {
    allowWhenBlocked: true,
    closeChatBefore: true,
});

setInterval(() => {
    if (!hasClosableNpcInterface()) return;
    if (!isSystemMenuActive()) return;

    closeNpcInterfacesForSystemMenu();
}, 150);

mp.events.add("npcDialog:action", (dataJson) => {
    try {
        const payload = normalizeDialogAction(dataJson);

        mp.events.callRemote(
            "server:npcDialog:action",
            JSON.stringify(payload || {})
        );
    } catch (e) {
        console.log("[NPC_DIALOG] action send error:", e);
    }
});

mp.events.add("npcDialog:end", () => {
    requestEndNpcDialog();
});

mp.events.add("huntingShop:buy", (rawData) => {
    const payload = parsePayload(rawData);
    if (Array.isArray(payload.items)) {
        const items = payload.items.slice(0, 20).map((entry) => ({
            itemId: String(entry?.itemId || entry?.id || ""),
            quantity: Math.min(10, Math.max(1, Math.floor(Number(entry?.quantity || 1)))),
        })).filter((entry) => entry.itemId);
        if (items.length > 0) {
            mp.events.callRemote("server:huntingShop:buyCart", JSON.stringify({ items }));
        }
        return;
    }
    const itemId = payload.itemId || payload.id;
    const quantity = Math.min(10, Math.max(1, Math.floor(Number(payload.quantity || 1))));
    if (!itemId) return;

    mp.events.callRemote("server:huntingShop:buy", String(itemId), quantity);
});

mp.events.add("huntingShop:close", () => {
    closeInterface(HUNTING_SHOP_PAGE);
    mp.events.callRemote("server:huntingShop:close");
});

mp.events.add("playerQuit", () => {
    stopDialogMode();
});

console.log("[NPC_DIALOG] Client loaded");
