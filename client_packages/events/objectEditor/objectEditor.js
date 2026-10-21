"use strict";

let screenResolution = mp.game.graphics.getScreenActiveResolution(0, 0);

const MOVE_SENSITIVITY = 50;
const ROT_SENSITIVITY = 800;
const PAGE_NAME = "furnitureEditor";

const ENTER_KEY = 0x0D;
const SPACE_KEY = 0x20;
const ESC_KEY = 0x1B;
const ALT_KEY = 0x12;
const BACKQUOTE_KEY = 0xC0;
const H_KEY = 0x48;
const R_KEY = 0x52;
const G_KEY = 0x47;
const LEFT_KEY = 0x25;
const UP_KEY = 0x26;
const RIGHT_KEY = 0x27;
const DOWN_KEY = 0x28;

let selObj = null;
let oldPos = null;
let oldRot = null;
let activeContext = null;
let mode = "Move";
let curBtn = "";
let oldCursorPos = [0, 0];
let xbox;
let ybox;
let zbox;
let pendingFurniturePayload = null;
let furnitureInterfaceHidden = false;

const bindKey = global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback));

function parseJson(value, fallback = {}) {
    try {
        if (!value) return fallback;
        if (typeof value === "object") return value;
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function toVector3(value, fallback = { x: 0, y: 0, z: 0 }) {
    const vector = value || fallback;

    return new mp.Vector3(
        toNumber(vector.x, fallback.x),
        toNumber(vector.y, fallback.y),
        toNumber(vector.z, fallback.z),
    );
}

function cloneVector(value) {
    return {
        x: toNumber(value?.x),
        y: toNumber(value?.y),
        z: toNumber(value?.z),
    };
}

function getActivePage() {
    return global.interfaceLock?.getInterfaceState?.()?.activePage || null;
}

function notifySafe(message, variant = "info") {
    try {
        if (global.interfaceLock?.notify) {
            global.interfaceLock.notify(message, variant);
            return;
        }

        if (typeof notify === "function") {
            notify(message, variant);
        }
    } catch {}
}

function execCef(code) {
    try {
        const browser = global.interfaceLock?.getUiBrowser?.()
            || global.uiBrowser
            || globalThis.twinkleBrowser?.browser
            || globalThis.twinkleBrowser?.cef
            || globalThis.browser;

        if (browser?.execute) {
            browser.execute(code);
            return true;
        }
    } catch (e) {
        console.log("[FURNITURE EDITOR] CEF exec error:", e);
    }

    return false;
}

function sendFurniturePayloadToCef(open = false) {
    if (!pendingFurniturePayload) return;

    const payload = global.uiState?.remember
        ? global.uiState.remember(PAGE_NAME, pendingFurniturePayload, {
            eventName: "twinkle:furnitureEditor:update",
            globalName: "__TWINKLE_FURNITURE_EDITOR_PAYLOAD__",
            retryKey: "furnitureEditor:payload",
            push: false,
        })
        : pendingFurniturePayload;

    const json = JSON.stringify(payload);

    execCef(`
        try {
            const payload = ${json};
            window.__TWINKLE_FURNITURE_EDITOR_PAYLOAD__ = payload;

            window.dispatchEvent(new CustomEvent("twinkle:furnitureEditor:update", {
                detail: payload
            }));

            if (window.TWINKLE_FURNITURE_EDITOR) {
                if (${Boolean(open)} && typeof window.TWINKLE_FURNITURE_EDITOR.open === "function") {
                    window.TWINKLE_FURNITURE_EDITOR.open(payload);
                } else if (typeof window.TWINKLE_FURNITURE_EDITOR.setPayload === "function") {
                    window.TWINKLE_FURNITURE_EDITOR.setPayload(payload);
                }
            }
        } catch (e) {
            console.log("[FURNITURE EDITOR PAYLOAD ERROR]", e);
        }
    `);
}

function isFurnitureEditorActive() {
    return getActivePage() === PAGE_NAME || Boolean(selObj);
}

function dispatchFurnitureEditorKey(code, pressed = true, duration = 150) {
    if (!isFurnitureEditorActive()) return;

    execCef(`
        try {
            window.dispatchEvent(new CustomEvent("twinkle:furnitureEditor:key", {
                detail: {
                    code: ${JSON.stringify(code)},
                    pressed: ${Boolean(pressed)},
                    duration: ${Number(duration)}
                }
            }));
        } catch (e) {
            console.log("[FURNITURE EDITOR KEY ERROR]", e);
        }
    `);
}

function setFurnitureInterfaceHidden(hidden) {
    furnitureInterfaceHidden = Boolean(hidden);

    execCef(`
        try {
            const hidden = ${Boolean(furnitureInterfaceHidden)};
            window.dispatchEvent(new CustomEvent("twinkle:furnitureEditor:hidden", {
                detail: { hidden }
            }));

            if (window.TWINKLE_FURNITURE_EDITOR) {
                window.TWINKLE_FURNITURE_EDITOR.setHidden?.(hidden);
            }
        } catch (e) {
            console.log("[FURNITURE EDITOR HIDE ERROR]", e);
        }
    `);
}

function toggleFurnitureInterfaceHidden() {
    setFurnitureInterfaceHidden(!furnitureInterfaceHidden);
}

function openFurnitureEditor(payload = {}) {
    pendingFurniturePayload = parseJson(payload, {});
    furnitureInterfaceHidden = false;
    let opened = false;

    try {
        if (global.interfaceLock?.forceOpenPage) {
            opened = global.interfaceLock.forceOpenPage(PAGE_NAME, null, pendingFurniturePayload);
        } else if (global.interfaceLock?.openPage) {
            opened = global.interfaceLock.openPage(PAGE_NAME, null, pendingFurniturePayload, { force: true });
        } else if (typeof openPage === "function") {
            openPage(PAGE_NAME, null, pendingFurniturePayload);
            opened = true;
        }
    } catch (e) {
        console.log("[FURNITURE EDITOR] open error:", e);
        opened = false;
    }

    if (!opened) {
        notifySafe("Сначала закройте текущий интерфейс.", "error");
        return false;
    }

    try {
        mp.gui.cursor.show(true, true);
        mp.gui.chat.activate(false);
    } catch {}

    setTimeout(() => sendFurniturePayloadToCef(true), 100);
    setTimeout(() => sendFurniturePayloadToCef(true), 300);
    setTimeout(() => sendFurniturePayloadToCef(true), 700);
    setTimeout(() => setFurnitureInterfaceHidden(false), 120);

    return true;
}

function updateFurnitureEditor(payload = {}) {
    pendingFurniturePayload = parseJson(payload, {});

    if (getActivePage() !== PAGE_NAME) {
        openFurnitureEditor(pendingFurniturePayload);
        return;
    }

    sendFurniturePayloadToCef(false);
    setTimeout(() => sendFurniturePayloadToCef(false), 150);
}

function closeFurnitureEditor() {
    pendingFurniturePayload = null;
    furnitureInterfaceHidden = false;

    try {
        if (global.interfaceLock?.closePage) {
            global.interfaceLock.closePage(PAGE_NAME);
        } else if (typeof closePage === "function") {
            closePage(PAGE_NAME);
        }
    } catch (e) {
        console.log("[FURNITURE EDITOR] close error:", e);
    }
}

function getModelHash(model) {
    if (typeof model === "number") return model;

    const asNumber = Number(model);
    if (Number.isFinite(asNumber) && String(model).trim() !== "") {
        return asNumber;
    }

    return mp.game.joaat(String(model));
}

function createPreviewObject(model, position, rotation, dimension) {
    const object = mp.objects.new(
        getModelHash(model),
        toVector3(position, mp.players.local.position),
    );

    try {
        object.position = toVector3(position, mp.players.local.position);
        object.rotation = toVector3(rotation, { x: 0, y: 0, z: 0 });
        object.dimension = toNumber(dimension, mp.players.local.dimension || 0);
    } catch {}

    try {
        object.setCollision(false, false);
    } catch {}

    return object;
}

function startEditor(object, context = {}) {
    if (!object) return;

    if (selObj) {
        cancel(false);
    }

    selObj = object;
    activeContext = context || {};
    mode = "Move";
    curBtn = "";
    oldPos = cloneVector(selObj.position);
    oldRot = cloneVector(selObj.rotation);
    oldCursorPos = mp.gui.cursor.position || [0, 0];

    try {
        selObj.setCollision(false, false);
        mp.gui.cursor.show(true, true);
        mp.gui.chat.activate(false);
    } catch {}
}

function restoreCursorAfterEditor() {
    try {
        const activePage = getActivePage();
        mp.gui.cursor.show(Boolean(activePage), Boolean(activePage));
    } catch {}
}

function cleanupEditor() {
    if (!selObj) return;

    try {
        selObj.destroy();
    } catch {}

    selObj = null;
    oldPos = null;
    oldRot = null;
    activeContext = null;
    curBtn = "";
    restoreCursorAfterEditor();
}

function switchMode() {
    mode = mode === "Move" ? "Rotation" : "Move";
    notifySafe(mode === "Move" ? "Режим перемещения" : "Режим поворота");
}

function groundObject() {
    if (!selObj) return;

    try {
        selObj.placeOnGroundProperly();
        const pos = selObj.getCoords(true);
        const rot = selObj.getRotation(2);
        selObj.position = new mp.Vector3(pos.x, pos.y, pos.z);
        selObj.rotation = new mp.Vector3(rot.x, rot.y, rot.z);
    } catch (e) {
        console.log("[OBJECT EDITOR] ground error:", e);
    }
}

function cancel(callServer = true) {
    if (!selObj) return;

    const context = activeContext || {};

    cleanupEditor();

    if (callServer) {
        try {
            mp.events.callRemote("s:objectEditor:cancel", JSON.stringify(context));
        } catch {}
    }
}

function saveChanges() {
    if (!selObj) return;

    const pos = selObj.getCoords(true);
    const rot = selObj.getRotation(2);
    const context = activeContext || {};

    try {
        if (context.mode === "command") {
            mp.events.callRemote(
                "objecteditor:finish",
                selObj.id,
                JSON.stringify(pos),
                JSON.stringify(rot),
                context.modelHash || selObj.model,
            );
        } else {
            mp.events.callRemote("s:objectEditor:save", JSON.stringify({
                ...context,
                position: {
                    x: pos.x,
                    y: pos.y,
                    z: pos.z,
                },
                rotation: {
                    x: rot.x,
                    y: rot.y,
                    z: rot.z,
                },
                dimension: toNumber(selObj.dimension, context.dimension || 0),
                modelHash: selObj.model,
            }));
        }
    } catch (e) {
        console.log("[OBJECT EDITOR] save error:", e);
        notifySafe("Не удалось сохранить объект.", "error");
        return;
    }

    cleanupEditor();
}

function isAltPressed() {
    try {
        if (mp.keys?.isDown?.(0x12)) return true;
    } catch {}

    try {
        return mp.game.controls.isControlPressed(0, 19);
    } catch {
        return false;
    }
}

function nudgeObject(key) {
    if (!selObj) return;

    const moveStep = 0.05;
    const rotateStep = 5;
    const alt = isAltPressed();
    const pos = selObj.position;
    const rot = selObj.rotation;

    if (alt) {
        if (key === UP_KEY) {
            selObj.position = new mp.Vector3(pos.x, pos.y, pos.z + moveStep);
        } else if (key === DOWN_KEY) {
            selObj.position = new mp.Vector3(pos.x, pos.y, pos.z - moveStep);
        } else if (key === LEFT_KEY) {
            selObj.rotation = new mp.Vector3(rot.x, rot.y, rot.z - rotateStep);
        } else if (key === RIGHT_KEY) {
            selObj.rotation = new mp.Vector3(rot.x, rot.y, rot.z + rotateStep);
        }

        return;
    }

    if (key === UP_KEY) {
        selObj.position = new mp.Vector3(pos.x, pos.y + moveStep, pos.z);
    } else if (key === DOWN_KEY) {
        selObj.position = new mp.Vector3(pos.x, pos.y - moveStep, pos.z);
    } else if (key === LEFT_KEY) {
        selObj.position = new mp.Vector3(pos.x - moveStep, pos.y, pos.z);
    } else if (key === RIGHT_KEY) {
        selObj.position = new mp.Vector3(pos.x + moveStep, pos.y, pos.z);
    }
}

function bindEditorKey(key, code, callback, options = {}) {
    bindKey(key, false, () => {
        if (!isFurnitureEditorActive()) return;

        dispatchFurnitureEditorKey(code);

        if (!selObj && !options.runWithoutObject) return;

        callback();
    }, {
        allowWhenBlocked: true,
        closeChatBefore: false,
    });
}

function bindEditorPulseKey(key, code) {
    bindKey(key, false, () => {
        if (!isFurnitureEditorActive()) return;
        dispatchFurnitureEditorKey(code);
    }, {
        allowWhenBlocked: true,
        closeChatBefore: false,
    });
}

function normalizeActionPayload(rawPayload) {
    const payload = parseJson(rawPayload, {});

    if (pendingFurniturePayload) {
        payload.propertyKind = payload.propertyKind || pendingFurniturePayload.propertyKind;
        payload.propertyId = payload.propertyId || pendingFurniturePayload.propertyId;
    }

    return JSON.stringify(payload);
}

function forwardFurnitureAction(remoteEvent, rawPayload) {
    try {
        mp.events.callRemote(remoteEvent, normalizeActionPayload(rawPayload));
    } catch (e) {
        console.log(`[FURNITURE EDITOR] ${remoteEvent} error:`, e);
        notifySafe("Не удалось выполнить действие.", "error");
    }
}

function drawAxisHandle(handle, color, label) {
    if (!handle) return;

    mp.game.graphics.drawRect(handle.x, handle.y, 0.015, 0.026, color[0], color[1], color[2], 255);
    mp.game.graphics.drawText(label, [handle.x, handle.y - 0.016], {
        font: 2,
        color: [255, 255, 255, 255],
        scale: [0.5, 0.5],
        outline: false,
    });
}

function isHandleHit(handle, mouseRel) {
    return handle
        && mouseRel.x >= handle.x - 0.01
        && mouseRel.x <= handle.x + 0.009
        && mouseRel.y >= handle.y - 0.015
        && mouseRel.y <= handle.y + 0.009;
}

function updateDrag(cursorDir) {
    if (!selObj || !curBtn) return;

    if (curBtn === "x") {
        const mainPos = mp.game.graphics.world3dToScreen2d(selObj.position.x, selObj.position.y, selObj.position.z);
        const refPos = mode === "Move"
            ? mp.game.graphics.world3dToScreen2d(selObj.position.x + 1, selObj.position.y, selObj.position.z)
            : mp.game.graphics.world3dToScreen2d(selObj.position.x, selObj.position.y + 1, selObj.position.z);

        if (!mainPos || !refPos) return;

        const screenDir = { x: refPos.x - mainPos.x, y: refPos.y - mainPos.y };
        const magnitude = cursorDir.x * screenDir.x + cursorDir.y * screenDir.y;

        if (mode === "Move") {
            selObj.position = new mp.Vector3(selObj.position.x + magnitude * MOVE_SENSITIVITY, selObj.position.y, selObj.position.z);
        } else {
            selObj.rotation = new mp.Vector3(selObj.rotation.x - magnitude * ROT_SENSITIVITY, selObj.rotation.y, selObj.rotation.z);
        }
    } else if (curBtn === "y") {
        const mainPos = mp.game.graphics.world3dToScreen2d(selObj.position.x, selObj.position.y, selObj.position.z);
        const refPos = mode === "Move"
            ? mp.game.graphics.world3dToScreen2d(selObj.position.x, selObj.position.y + 1, selObj.position.z)
            : mp.game.graphics.world3dToScreen2d(selObj.position.x + 1, selObj.position.y, selObj.position.z);

        if (!mainPos || !refPos) return;

        const screenDir = { x: refPos.x - mainPos.x, y: refPos.y - mainPos.y };
        const magnitude = cursorDir.x * screenDir.x + cursorDir.y * screenDir.y;

        if (mode === "Move") {
            selObj.position = new mp.Vector3(selObj.position.x, selObj.position.y + magnitude * MOVE_SENSITIVITY, selObj.position.z);
        } else {
            selObj.rotation = new mp.Vector3(selObj.rotation.x, selObj.rotation.y + magnitude * ROT_SENSITIVITY, selObj.rotation.z);
        }
    } else if (curBtn === "z") {
        const mainPos = mp.game.graphics.world3dToScreen2d(selObj.position.x, selObj.position.y, selObj.position.z);
        const refPos = mp.game.graphics.world3dToScreen2d(selObj.position.x, selObj.position.y, selObj.position.z + 1);

        if (!mainPos || !refPos) return;

        const screenDir = { x: refPos.x - mainPos.x, y: refPos.y - mainPos.y };
        const magnitude = cursorDir.x * screenDir.x + cursorDir.y * screenDir.y;

        if (mode === "Move") {
            selObj.position = new mp.Vector3(selObj.position.x, selObj.position.y, selObj.position.z + magnitude * MOVE_SENSITIVITY);
        } else {
            selObj.rotation = new mp.Vector3(selObj.rotation.x, selObj.rotation.y, selObj.rotation.z + cursorDir.x * ROT_SENSITIVITY * 0.2);
        }
    }
}

mp.events.add("client:createObject", (model, pos) => {
    try {
        const object = createPreviewObject(model, pos, { x: 0, y: 0, z: mp.players.local.heading || 0 }, mp.players.local.dimension || 0);
        startEditor(object, {
            mode: "command",
            model,
            modelHash: object.model,
        });
    } catch (e) {
        console.log("[OBJECT EDITOR] create object error:", e);
        notifySafe("Не удалось создать объект для редактирования.", "error");
    }
});

mp.events.add("c:objectEditor:startPlacement", (payloadJson = "{}") => {
    const payload = parseJson(payloadJson, {});

    if (!payload.model) {
        notifySafe("У предмета не указана модель.", "error");
        return;
    }

    try {
        const object = createPreviewObject(payload.model, payload.position, payload.rotation, payload.dimension);
        startEditor(object, payload);
    } catch (e) {
        console.log("[OBJECT EDITOR] start placement error:", e);
        notifySafe("Не удалось создать объект для редактирования.", "error");
    }
});

mp.events.add("objecteditor:start", (objid, context = {}) => {
    const objectId = Array.isArray(objid) ? objid[0] : objid;
    const object = mp.objects.at(objectId);

    if (!object) return;

    startEditor(object, parseJson(context, {}));
});

mp.events.add("render", () => {
    if (!selObj) return;

    screenResolution = mp.game.graphics.getScreenActiveResolution(0, 0);

    mp.game.graphics.drawLine(selObj.position.x - 1.0, selObj.position.y, selObj.position.z, selObj.position.x + 1.0, selObj.position.y, selObj.position.z, 0, 0, 255, 255);
    mp.game.graphics.drawLine(selObj.position.x, selObj.position.y - 1.0, selObj.position.z, selObj.position.x, selObj.position.y + 1.0, selObj.position.z, 255, 0, 0, 255);
    mp.game.graphics.drawLine(selObj.position.x, selObj.position.y, selObj.position.z - 1.0, selObj.position.x, selObj.position.y, selObj.position.z + 1.0, 0, 255, 0, 255);

    xbox = mp.game.graphics.world3dToScreen2d(selObj.position.x + 1.0, selObj.position.y, selObj.position.z);
    ybox = mp.game.graphics.world3dToScreen2d(selObj.position.x, selObj.position.y + 1.0, selObj.position.z);
    zbox = mp.game.graphics.world3dToScreen2d(selObj.position.x, selObj.position.y, selObj.position.z + 1.0);

    drawAxisHandle(xbox, [0, 0, 255], "X");
    drawAxisHandle(ybox, [255, 0, 0], "Y");
    drawAxisHandle(zbox, [0, 255, 0], "Z");

    const pos = mp.gui.cursor.position || oldCursorPos;
    const cursorDir = {
        x: (pos[0] - oldCursorPos[0]) / screenResolution.x,
        y: (pos[1] - oldCursorPos[1]) / screenResolution.y,
    };

    updateDrag(cursorDir);
    oldCursorPos = pos;
});

mp.events.add("click", (x, y, upOrDown) => {
    if (!selObj) return;

    const mouseRel = {
        x: x / screenResolution.x,
        y: y / screenResolution.y,
    };

    if (upOrDown === "up") {
        curBtn = "";
        return;
    }

    if (upOrDown !== "down") return;

    if (isHandleHit(xbox, mouseRel)) {
        curBtn = "x";
    } else if (isHandleHit(ybox, mouseRel)) {
        curBtn = "y";
    } else if (isHandleHit(zbox, mouseRel)) {
        curBtn = "z";
    }
});

bindEditorKey(ENTER_KEY, "Enter", saveChanges);
bindEditorKey(SPACE_KEY, "Space", saveChanges);
bindEditorKey(ESC_KEY, "Escape", () => cancel(true));
bindEditorKey(R_KEY, "KeyR", switchMode);
bindEditorKey(G_KEY, "KeyG", groundObject);
bindEditorKey(H_KEY, "KeyH", toggleFurnitureInterfaceHidden, { runWithoutObject: true });
bindEditorKey(LEFT_KEY, "ArrowLeft", () => nudgeObject(LEFT_KEY));
bindEditorKey(UP_KEY, "ArrowUp", () => nudgeObject(UP_KEY));
bindEditorKey(RIGHT_KEY, "ArrowRight", () => nudgeObject(RIGHT_KEY));
bindEditorKey(DOWN_KEY, "ArrowDown", () => nudgeObject(DOWN_KEY));
bindEditorPulseKey(ALT_KEY, "AltLeft");
bindEditorPulseKey(BACKQUOTE_KEY, "Backquote");

mp.events.add("c:furnitureEditor:open", (payloadJson = "{}") => {
    openFurnitureEditor(payloadJson);
});

mp.events.add("c:furnitureEditor:update", (payloadJson = "{}") => {
    updateFurnitureEditor(payloadJson);
});

mp.events.add("c:furnitureEditor:close", () => {
    closeFurnitureEditor();
});

mp.events.add("c:furnitureEditor:error", (message) => {
    notifySafe(message || "Ошибка редактора мебели.", "error");
});

mp.events.add("furnitureEditor:readyFromBrowser", () => {
    sendFurniturePayloadToCef(true);
});

mp.events.add("furnitureEditor:closeFromBrowser", () => {
    if (selObj) {
        cancel(true);
    }

    closeFurnitureEditor();
});

mp.events.add("furnitureEditor:toggleHiddenFromBrowser", () => {
    dispatchFurnitureEditorKey("KeyH");
    toggleFurnitureInterfaceHidden();
});

mp.events.add("furnitureEditor:buyFromBrowser", (rawPayload = "{}") => {
    forwardFurnitureAction("s:objectEditor:buy", rawPayload);
});

mp.events.add("furnitureEditor:moveFromBrowser", (rawPayload = "{}") => {
    forwardFurnitureAction("s:objectEditor:move", rawPayload);
});

mp.events.add("furnitureEditor:deleteFromBrowser", (rawPayload = "{}") => {
    forwardFurnitureAction("s:objectEditor:delete", rawPayload);
});

mp.events.add("furnitureEditor:deleteAllFromBrowser", (rawPayload = "{}") => {
    forwardFurnitureAction("s:objectEditor:deleteAll", rawPayload);
});

mp.events.add("furnitureEditor:findFromBrowser", (rawPayload = "{}") => {
    forwardFurnitureAction("s:objectEditor:find", rawPayload);
});

mp.events.add("c:objectEditor:markFurniture", (payloadJson = "{}") => {
    const payload = parseJson(payloadJson, {});
    const position = payload.position || {};

    try {
        mp.game.ui.setNewWaypoint(toNumber(position.x), toNumber(position.y));
    } catch {}

    notifySafe("Метка мебели добавлена на карту.");
});

console.log("[OBJECT EDITOR] Loaded");
