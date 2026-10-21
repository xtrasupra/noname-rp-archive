"use strict";

const HEAD_OVERLAY_MAX_INDEX = Object.freeze([
    23, 28, 33, 14, 94, 32, 11, 10, 9, 17, 16, 11, 1
]);

function clampNumber(value, min, max, fallback = min) {
    const number = Number(value);
    const normalized = Number.isFinite(number) ? number : fallback;
    return Math.max(min, Math.min(max, normalized));
}

function normalizeHeadOverlayValue(overlayId, value) {
    const normalized = Math.trunc(clampNumber(value, 0, 255, 255));
    if (normalized === 255) return 255;

    return Math.min(HEAD_OVERLAY_MAX_INDEX[overlayId], normalized);
}

let previewCamera = null;
let previewPed = null;
let currentPayload = null;
let previewToken = 0;
let selectionUiSession = 0;
let selectionUiMounted = false;
let selectionUiTimers = [];
let selectionSubmitPending = false;
let selectionSubmitTimer = null;

const SELECTION_PAGE = "characterSelection";
const SELECTION_RETRY_DELAYS = Object.freeze([700, 1800]);
const SELECTION_RELOAD_DELAY = 3500;
const SELECTION_FINAL_TIMEOUT = 6500;
const SELECTION_SUBMIT_TIMEOUT = 8000;

const PREVIEW_DIMENSION = 0;

const PREVIEW_POS = new mp.Vector3(-75.0, -818.7, 326.18);
const PREVIEW_HEADING = 180.0;

const CAMERA_POS = new mp.Vector3(-75.0, -822.2, 327.15);
const CAMERA_LOOK_AT = new mp.Vector3(-75.0, -818.7, 326.72);

function getUiBrowser() {
    if (global.interfaceLock?.getUiBrowser) {
        return global.interfaceLock.getUiBrowser();
    }

    if (!global.uiBrowser) {
        global.uiBrowser = mp.browsers.new(global.__TWINKLE_CEF_URL__ || "package://cef/index.html");
    }

    return global.uiBrowser;
}

function openPage(page, props = null, payload = null, force = false) {
    if (global.interfaceLock) {
        if (force && global.interfaceLock.forceOpenPage) {
            return global.interfaceLock.forceOpenPage(page, props, payload);
        }

        if (global.interfaceLock.openPage) {
            return global.interfaceLock.openPage(page, props, payload);
        }
    }

    const browser = getUiBrowser();

    browser.execute(`
        (function waitTwinkle() {
            if (window.twinkleBrowser && window.twinkleBrowser.pages) {
                window.twinkleBrowser.pages.set(
                    ${JSON.stringify(page)},
                    ${JSON.stringify(props)},
                    ${JSON.stringify(payload)}
                );
                return;
            }

            setTimeout(waitTwinkle, 50);
        })();
    `);

    return true;
}

function closePage(page) {
    if (global.interfaceLock?.closePage) {
        global.interfaceLock.closePage(page);
        return;
    }

    if (!global.uiBrowser) return;

    global.uiBrowser.execute(`
        if (window.twinkleBrowser && window.twinkleBrowser.pages) {
            window.twinkleBrowser.pages.close(${JSON.stringify(page)});
        }
    `);
}

function notifySafe(message, variant = "info") {
    if (global.interfaceLock?.notify) {
        global.interfaceLock.notify(message, variant);
    }
}

function pushSelectionPayload() {
    if (!currentPayload || !isSelectionPageActive()) return false;

    return Boolean(openPage(SELECTION_PAGE, null, currentPayload));
}

function clearSelectionSubmission({ restorePage = false } = {}) {
    if (selectionSubmitTimer) {
        clearTimeout(selectionSubmitTimer);
        selectionSubmitTimer = null;
    }

    selectionSubmitPending = false;

    if (!currentPayload) return;

    currentPayload = {
        ...currentPayload,
        pending: false,
    };

    if (restorePage) {
        pushSelectionPayload();
        mp.gui.cursor.show(true, true);
        mp.game.ui.displayRadar(false);
    }
}

function submitSelectionEvent(eventName, ...args) {
    if (selectionSubmitPending || !currentPayload || !isSelectionPageActive()) {
        return false;
    }

    selectionSubmitPending = true;
    currentPayload = {
        ...currentPayload,
        pending: true,
    };
    pushSelectionPayload();

    try {
        mp.events.callRemote(eventName, ...args);
    } catch {
        clearSelectionSubmission({ restorePage: true });
        notifySafe("Не удалось отправить запрос выбора персонажа.", "error");
        return false;
    }

    selectionSubmitTimer = setTimeout(() => {
        if (!selectionSubmitPending) return;

        clearSelectionSubmission({ restorePage: true });
        notifySafe("Сервер не подтвердил выбор персонажа. Попробуйте ещё раз.", "error");
    }, SELECTION_SUBMIT_TIMEOUT);

    return true;
}

function safeParse(value, fallback = null) {
    try {
        if (!value) return fallback;
        if (typeof value === "object") return value;

        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function getSelectionUiRevision() {
    const revision = Number(currentPayload?.uiRevision || 0);
    return Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
}

function reportSelectionUiStage(stage, revision = getSelectionUiRevision()) {
    try {
        mp.events.callRemote(
            "s:characters:uiTrace",
            String(stage || "").slice(0, 32),
            Number(revision || 0)
        );
    } catch {}
}

function clearSelectionUiWatchdog() {
    selectionUiSession += 1;

    selectionUiTimers.forEach((timer) => clearTimeout(timer));
    selectionUiTimers = [];
}

function isSelectionPageActive() {
    const activePage = global.interfaceLock?.getInterfaceState?.()?.activePage;
    return activePage === SELECTION_PAGE && Boolean(currentPayload);
}

function replaySelectionPage(stage) {
    if (!isSelectionPageActive() || selectionUiMounted) return false;

    reportSelectionUiStage(stage);

    if (global.interfaceLock?.forceOpenPage) {
        return Boolean(
            global.interfaceLock.forceOpenPage(SELECTION_PAGE, null, currentPayload)
        );
    }

    return Boolean(openPage(SELECTION_PAGE, null, currentPayload, true));
}

function startSelectionUiWatchdog() {
    clearSelectionUiWatchdog();

    const session = selectionUiSession;
    selectionUiMounted = false;

    SELECTION_RETRY_DELAYS.forEach((delay, index) => {
        selectionUiTimers.push(setTimeout(() => {
            if (session !== selectionUiSession) return;
            replaySelectionPage(`retry-${index + 1}`);
        }, delay));
    });

    selectionUiTimers.push(setTimeout(() => {
        if (
            session !== selectionUiSession ||
            selectionUiMounted ||
            !isSelectionPageActive()
        ) return;

        reportSelectionUiStage("cef-reload");

        try {
            const browser = getUiBrowser();

            if (!browser || typeof browser.reload !== "function") {
                throw new Error("CEF browser reload is unavailable");
            }

            browser.reload(false);
        } catch {
            reportSelectionUiStage("reload-error");
        }
    }, SELECTION_RELOAD_DELAY));

    selectionUiTimers.push(setTimeout(() => {
        if (
            session !== selectionUiSession ||
            selectionUiMounted ||
            !isSelectionPageActive()
        ) return;

        reportSelectionUiStage("mount-timeout");
        notifySafe("Интерфейс выбора персонажа не загрузился. Переподключитесь к серверу.", "error");
    }, SELECTION_FINAL_TIMEOUT));
}

function destroyPreviewPed() {
    if (previewPed && mp.peds.exists(previewPed)) {
        previewPed.destroy();
    }

    previewPed = null;
}

function destroyPreviewCamera() {
    if (previewCamera) {
        previewCamera.destroy();
        previewCamera = null;
    }

    mp.game.cam.renderScriptCams(false, true, 500, true, false);
}

function destroyPreview() {
    previewToken++;
    destroyPreviewPed();
    destroyPreviewCamera();
}

function createPreviewCamera() {
    if (previewCamera) {
        previewCamera.destroy();
        previewCamera = null;
    }

    previewCamera = mp.cameras.new(
        "default",
        CAMERA_POS,
        new mp.Vector3(0, 0, 0),
        34
    );

    previewCamera.pointAtCoord(
        CAMERA_LOOK_AT.x,
        CAMERA_LOOK_AT.y,
        CAMERA_LOOK_AT.z
    );

    previewCamera.setActive(true);

    mp.game.cam.renderScriptCams(true, true, 500, true, false);
}

function requestModel(model) {
    return new Promise((resolve) => {
        if (mp.game.streaming.hasModelLoaded(model)) {
            resolve(true);
            return;
        }

        mp.game.streaming.requestModel(model);

        let attempts = 0;

        const timer = setInterval(() => {
            attempts++;

            if (mp.game.streaming.hasModelLoaded(model)) {
                clearInterval(timer);
                resolve(true);
                return;
            }

            if (attempts >= 200) {
                clearInterval(timer);
                resolve(false);
            }
        }, 25);
    });
}

function getCharacterById(characterId) {
    if (!currentPayload || !Array.isArray(currentPayload.slots)) {
        return null;
    }

    const slot = currentPayload.slots.find((item) => {
        return (
            item &&
            item.character &&
            Number(item.character.id) === Number(characterId)
        );
    });

    return slot?.character || null;
}

function getModelByCharacter(character) {
    const gender = String(character?.gender || "male").toLowerCase();

    if (gender === "female" || gender === "woman") {
        return mp.game.joaat("mp_f_freemode_01");
    }

    return mp.game.joaat("mp_m_freemode_01");
}

function applyDefaultClothes(ped, gender) {
    const isFemale = String(gender || "male").toLowerCase() === "female";

    if (isFemale) {
        ped.setComponentVariation(3, 15, 0, 0);
        ped.setComponentVariation(4, 14, 0, 0);
        ped.setComponentVariation(6, 35, 0, 0);
        ped.setComponentVariation(8, 15, 0, 0);
        ped.setComponentVariation(11, 15, 0, 0);
    } else {
        ped.setComponentVariation(3, 15, 0, 0);
        ped.setComponentVariation(4, 21, 0, 0);
        ped.setComponentVariation(6, 34, 0, 0);
        ped.setComponentVariation(8, 15, 0, 0);
        ped.setComponentVariation(11, 15, 0, 0);
    }
}

function applyCustomization(ped, customization) {
    const data = safeParse(customization);
    if (!data) return;

    const face = data.face || data.headBlend || data.blend;

    if (face) {
        ped.setHeadBlendData(
            Number(face.mother ?? face.shapeFirst ?? face.shape1 ?? 0),
            Number(face.father ?? face.shapeSecond ?? face.shape2 ?? 0),
            Number(face.shapeThird ?? face.shape3 ?? 0),
            Number(face.skinMother ?? face.skinFirst ?? face.skin1 ?? 0),
            Number(face.skinFather ?? face.skinSecond ?? face.skin2 ?? 0),
            Number(face.skinThird ?? face.skin3 ?? 0),
            Number(face.shapeMix ?? 0.5),
            Number(face.skinMix ?? 0.5),
            Number(face.thirdMix ?? 0),
            false
        );
    }

    const features = data.features || data.faceFeatures;

    if (features) {
        Object.keys(features).forEach((key) => {
            const index = Number(key);
            const value = Number(features[key]);

            if (!Number.isNaN(index) && !Number.isNaN(value)) {
                ped.setFaceFeature(index, value);
            }
        });
    }
}

function applyAppearance(ped, appearance) {
    const data = safeParse(appearance);
    if (!data) return;

    if (data.eyeColor != null) {
        ped.setEyeColor(clampNumber(data.eyeColor, 0, 31, 0));
    }

    if (data.hairColor != null) {
        ped.setHairColor(
            Number(data.hairColor),
            Number(data.hairHighlightColor || 0)
        );
    }

    const overlays = data.headOverlays || data.overlays;

    if (Array.isArray(overlays)) {
        overlays.forEach((overlay, index) => {
            if (!overlay || index > 12) return;

            const value = normalizeHeadOverlayValue(index,
                overlay.value ?? overlay.index ?? overlay.id ?? 255
            );

            const opacity = clampNumber(overlay.opacity, 0, 1, 1);

            ped.setHeadOverlay(index, value, opacity);

            if (overlay.color != null) {
                mp.game.ped.setHeadOverlayColor(
                    ped.handle,
                    index,
                    clampNumber(overlay.colorType, 0, 2, 1),
                    clampNumber(overlay.color, 0, 63, 0),
                    clampNumber(overlay.secondColor, 0, 63, 0)
                );
            }
        });
    }
}

function applyClothes(ped, clothes) {
    const data = safeParse(clothes);
    if (!data) return;

    const components = data.components || data;

    Object.keys(components).forEach((key) => {
        const item = components[key];
        if (!item) return;

        const componentId = Number(item.component ?? item.componentId ?? key);
        const drawable = Number(item.drawable ?? item.drawableId ?? item.id ?? 0);
        const texture = Number(item.texture ?? item.textureId ?? 0);
        const palette = Number(item.palette ?? 0);

        if (Number.isNaN(componentId)) return;

        ped.setComponentVariation(componentId, drawable, texture, palette);
    });

    const props = data.props || data.accessories || {};

    Object.keys(props).forEach((key) => {
        const item = props[key];
        if (!item) return;

        const propId = Number(item.prop ?? item.propId ?? key);
        const drawable = Number(item.drawable ?? item.drawableId ?? item.id ?? -1);
        const texture = Number(item.texture ?? item.textureId ?? 0);

        if (Number.isNaN(propId)) return;

        if (drawable < 0) {
            ped.clearProp(propId);
        } else {
            ped.setPropIndex(propId, drawable, texture, true);
        }
    });
}

function applyCharacterToPed(ped, character) {
    applyDefaultClothes(ped, character.gender);
    applyCustomization(ped, character.customization);
    applyAppearance(ped, character.appearance);
    applyClothes(ped, character.clothes);
}

async function createPreview(character) {
    if (!character) return;

    const token = ++previewToken;

    destroyPreviewPed();
    createPreviewCamera();

    const model = getModelByCharacter(character);
    const loaded = await requestModel(model);

    if (!loaded || token !== previewToken) {
        return;
    }

    previewPed = mp.peds.new(
        model,
        PREVIEW_POS,
        PREVIEW_HEADING,
        PREVIEW_DIMENSION
    );

    if (!previewPed) {
        return;
    }

    previewPed.freezePosition(true);
    previewPed.setInvincible(true);
    previewPed.setCollision(false, false);
    previewPed.setAlpha(255, false);
    previewPed.taskStandStill(-1);

    applyCharacterToPed(previewPed, character);

    mp.game.streaming.setModelAsNoLongerNeeded(model);
}

function getFirstCharacterSlot(payload) {
    if (!payload || !Array.isArray(payload.slots)) {
        return null;
    }

    return payload.slots.find((slot) => {
        return slot && slot.state === "character" && slot.character;
    }) || null;
}

mp.events.add("c:characterSelection:open", (payloadJson) => {
    const payload = safeParse(payloadJson, null);

    if (!payload || !Array.isArray(payload.slots)) {
        reportSelectionUiStage("invalid-payload", payload?.uiRevision);
        notifySafe("Сервер передал некорректные данные персонажей.", "error");
        return;
    }

    clearSelectionSubmission();
    currentPayload = {
        ...payload,
        pending: false,
    };
    reportSelectionUiStage("client-event");

    const opened = openPage(SELECTION_PAGE, null, currentPayload, true);

    if (!opened) {
        notifySafe("Сначала закройте текущий интерфейс.", "error");
        return;
    }

    startSelectionUiWatchdog();

    openPage("notifications");

    mp.gui.cursor.show(true, true);
    mp.game.ui.displayRadar(false);

    const firstSlot = getFirstCharacterSlot(payload);

    if (firstSlot) {
        createPreview(firstSlot.character);
    }
});

mp.events.add("c:characterSelection:close", () => {
    clearSelectionSubmission();
    clearSelectionUiWatchdog();
    closePage(SELECTION_PAGE);

    destroyPreview();

    currentPayload = null;

    mp.gui.cursor.show(false, false);
    mp.game.ui.displayRadar(false);
});

mp.events.add("characterSelection:previewFromBrowser", (characterId, slotId) => {
    const character = getCharacterById(characterId);

    if (character) {
        createPreview(character);
    }
});

mp.events.add("characterSelection:pageSetFromBrowser", (revision) => {
    if (Number(revision) !== getSelectionUiRevision()) return;
    if (!isSelectionPageActive()) return;

    reportSelectionUiStage("cef-page-set");
});

mp.events.add("characterSelection:mountedFromBrowser", (revision) => {
    if (Number(revision) !== getSelectionUiRevision()) return;
    if (!isSelectionPageActive()) return;

    selectionUiMounted = true;
    clearSelectionUiWatchdog();
    reportSelectionUiStage("cef-mounted");

    mp.gui.cursor.show(true, true);
    mp.game.ui.displayRadar(false);
});

mp.events.add("characterSelection:selectFromBrowser", (characterId, slotId) => {
    submitSelectionEvent(
        "s:characters:select",
        Number(characterId),
        Number(slotId)
    );
});

mp.events.add("characterSelection:createFromBrowser", (slotId) => {
    submitSelectionEvent(
        "s:characters:create",
        Number(slotId)
    );
});

mp.events.add("c:auth:error", () => {
    if (!selectionSubmitPending) return;

    clearSelectionSubmission({ restorePage: true });
});

mp.events.add("characterSelection:purchaseSlotFromBrowser", (slotId) => {
    mp.events.callRemote(
        "s:characters:purchaseSlot",
        Number(slotId)
    );
});

mp.events.add("characterSelection:lockedSlotFromBrowser", (slotId) => {
    mp.events.callRemote(
        "s:characters:lockedSlot",
        Number(slotId)
    );
});

mp.events.add("playerReady", () => {
    clearSelectionSubmission();
    clearSelectionUiWatchdog();
    selectionUiMounted = false;
    currentPayload = null;
    destroyPreview();
});
