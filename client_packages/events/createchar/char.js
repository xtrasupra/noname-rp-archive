"use strict";

let ccCamera = null;
let ccActive = false;
let ccFocus = "body";
let ccControlTick = null;

const HEAD_OVERLAY_MAX_INDEX = Object.freeze([
    23, 28, 33, 14, 94, 32, 11, 10, 9, 17, 16, 11, 1
]);

const CC_POS = new mp.Vector3(402.8664, -996.4108, -99.00027);
const CC_HEADING = 180.0;

const CC_CAMERA = {
    face: {
        pos: new mp.Vector3(402.8664, -998.15, -98.18),
        lookAt: new mp.Vector3(402.8664, -996.4108, -98.32),
        fov: 28
    },
    body: {
        pos: new mp.Vector3(402.8664, -1001.15, -98.45),
        lookAt: new mp.Vector3(402.8664, -996.4108, -98.45),
        fov: 38
    }
};

function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isNaN(n) ? fallback : n;
}

function normalizeHeadOverlayValue(overlayId, value) {
    const normalized = Math.trunc(num(value, 255));
    if (normalized === 255) return 255;

    return Math.max(
        0,
        Math.min(HEAD_OVERLAY_MAX_INDEX[overlayId], normalized)
    );
}

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

function notify(message, variant = "info", duration = 4500) {
    if (global.interfaceLock?.notify) {
        global.interfaceLock.notify(message, variant, duration);
        return;
    }

    const browser = getUiBrowser();

    browser.execute(`
        (function waitNotify() {
            if (window.twinkleBrowser && window.twinkleBrowser.notifications) {
                window.twinkleBrowser.notifications.push({
                    message: ${JSON.stringify(message)},
                    variant: ${JSON.stringify(variant)},
                    duration: ${Number(duration)},
                    closable: true
                });
                return;
            }

            setTimeout(waitNotify, 50);
        })();
    `);
}

function setCcSlot(slot) {
    const finalSlot = Number(slot) || 1;

    if (!global.uiBrowser) return;

    global.uiBrowser.execute(`
        (function waitCcSlot() {
            if (window.setCcSlot) {
                window.setCcSlot(${JSON.stringify(finalSlot)});
                console.log("[CC SLOT SET]", ${JSON.stringify(finalSlot)});
                return;
            }

            setTimeout(waitCcSlot, 50);
        })();
    `);
}

function requestModel(model) {
    return new Promise((resolve) => {
        if (mp.game.streaming.hasModelLoaded(model)) {
            resolve(true);
            return;
        }

        mp.game.streaming.requestModel(model);

        const timer = setInterval(() => {
            if (mp.game.streaming.hasModelLoaded(model)) {
                clearInterval(timer);
                resolve(true);
            }
        }, 25);
    });
}

function lockCreatorPlayer() {
    const player = mp.players.local;

    player.freezePosition(true);
    player.setInvincible(true);
    player.setCanRagdoll(false);
    player.setProofs(true, true, true, true, true, true, true, true);
    player.clearTasksImmediately();

    mp.game.ui.displayRadar(false);

    if (ccControlTick) return;

    ccControlTick = setInterval(() => {
        mp.game.controls.disableAllControlActions(0);
        mp.game.controls.disableAllControlActions(1);
        mp.game.controls.disableAllControlActions(2);

        player.freezePosition(true);
        mp.game.ui.displayRadar(false);
    }, 0);
}

function unlockCreatorPlayer() {
    const player = mp.players.local;

    if (ccControlTick) {
        clearInterval(ccControlTick);
        ccControlTick = null;
    }

    player.freezePosition(false);
    player.setInvincible(false);
    player.setCanRagdoll(true);
    player.setProofs(false, false, false, false, false, false, false, false);
    player.clearTasksImmediately();
}

function setupCreatorPlayer() {
    const player = mp.players.local;

    player.position = CC_POS;
    player.setHeading(CC_HEADING);

    mp.game.streaming.requestCollisionAtCoord(CC_POS.x, CC_POS.y, CC_POS.z);

    lockCreatorPlayer();
}

function applyCreatorCamera(type = "body") {
    if (!ccActive) return;

    const cfg = CC_CAMERA[type] || CC_CAMERA.body;

    if (!ccCamera) {
        ccCamera = mp.cameras.new("default", cfg.pos, new mp.Vector3(0, 0, 0), cfg.fov);
        ccCamera.setActive(true);
        mp.game.cam.renderScriptCams(true, false, 0, true, false);
    } else {
        ccCamera.setCoord(cfg.pos.x, cfg.pos.y, cfg.pos.z);
        ccCamera.setFov(cfg.fov);
    }

    ccCamera.pointAtCoord(cfg.lookAt.x, cfg.lookAt.y, cfg.lookAt.z);
}

function destroyCreatorCamera() {
    if (ccCamera) {
        ccCamera.destroy();
        ccCamera = null;
    }

    mp.game.cam.renderScriptCams(false, false, 0, true, false);
}

function applyDefaultClothes(gender) {
    const player = mp.players.local;
    const isFemale = String(gender || "male").toLowerCase() === "female";

    if (isFemale) {
        player.setComponentVariation(3, 15, 0, 0);
        player.setComponentVariation(4, 14, 0, 0);
        player.setComponentVariation(6, 35, 0, 0);
        player.setComponentVariation(8, 15, 0, 0);
        player.setComponentVariation(11, 15, 0, 0);
    } else {
        player.setComponentVariation(3, 15, 0, 0);
        player.setComponentVariation(4, 21, 0, 0);
        player.setComponentVariation(6, 34, 0, 0);
        player.setComponentVariation(8, 15, 0, 0);
        player.setComponentVariation(11, 15, 0, 0);
    }
}

async function setCreatorGender(gender) {
    const modelName = gender === "female" ? "mp_f_freemode_01" : "mp_m_freemode_01";
    const model = mp.game.joaat(modelName);

    await requestModel(model);

    mp.players.local.model = model;

    setTimeout(() => {
        setupCreatorPlayer();
        applyDefaultClothes(gender);
        applyCreatorCamera(ccFocus);
        mp.game.streaming.setModelAsNoLongerNeeded(model);
    }, 150);
}

function openCreatorPage(slot = 1) {
    const opened = openPage("characterCustomizer", null, null, true);

    if (!opened) {
        notify("Сначала закройте текущий интерфейс.", "error");
        return false;
    }

    openPage("notifications");

    setTimeout(() => setCcSlot(slot), 50);
    setTimeout(() => setCcSlot(slot), 300);
    setTimeout(() => setCcSlot(slot), 700);
    setTimeout(() => setCcSlot(slot), 1200);

    return true;
}

function closeCreatorPage() {
    closePage("characterCustomizer");
}

function startCreator(slot = 1) {
    ccActive = true;
    ccFocus = "body";

    const opened = openCreatorPage(slot);

    if (!opened) {
        ccActive = false;
        return;
    }

    mp.gui.cursor.show(true, true);

    setCreatorGender("male");

    setTimeout(() => {
        setupCreatorPlayer();
        applyCreatorCamera("body");
    }, 250);
}

function stopCreator() {
    ccActive = false;

    closeCreatorPage();
    destroyCreatorCamera();

    mp.gui.cursor.show(false, false);
    unlockCreatorPlayer();
}

function setHeadOverlaySafe(overlayId, value, opacity = 1, color1 = 0, color2 = 0) {
    const player = mp.players.local;

    const id = Math.max(0, Math.min(12, num(overlayId, 0)));
    const val = normalizeHeadOverlayValue(id, value);

    const alpha = Math.max(
        0,
        Math.min(1, num(opacity, 1))
    );

    player.setHeadOverlay(
        id,
        val,
        alpha,
        num(color1, 0),
        num(color2, 0)
    );
}

mp.events.add("c:characterCreator:open", (slot = 1) => {
    startCreator(Number(slot) || 1);
});

mp.events.add("c:character:create:init", (slot = 1) => {
    startCreator(Number(slot) || 1);
});

mp.events.add("c:characterCreator:close", () => {
    stopCreator();
});

mp.events.add("cc:camera:start", () => {
    ccActive = true;
    lockCreatorPlayer();
    applyCreatorCamera(ccFocus);
});

mp.events.add("cc:camera:stop", () => {
    stopCreator();
});

mp.events.add("cc:focus", (type) => {
    if (!ccActive) return;

    ccFocus = type === "face" ? "face" : "body";
    applyCreatorCamera(ccFocus);
});

mp.events.add("cc:setGender", (gender) => {
    if (!ccActive) return;

    setCreatorGender(String(gender));
});

mp.events.add("cc:setHeadBlend", (father, mother, skinFather, skinMother, shapeMix, skinMix) => {
    if (!ccActive) return;

    mp.players.local.setHeadBlendData(
        num(mother),
        num(father),
        0,
        num(skinMother),
        num(skinFather),
        0,
        num(shapeMix, 0.5),
        num(skinMix, 0.5),
        0,
        false
    );
});

mp.events.add("cc:setHair", (hairId) => {
    if (!ccActive) return;

    mp.players.local.setComponentVariation(2, num(hairId), 0, 0);
});

mp.events.add("cc:setHairColor", (color1, color2) => {
    if (!ccActive) return;

    mp.players.local.setHairColor(num(color1), num(color2));
});

mp.events.add("cc:setClothes", (component, drawable, texture) => {
    if (!ccActive) return;

    mp.players.local.setComponentVariation(
        num(component),
        num(drawable),
        num(texture),
        0
    );
});

mp.events.add("cc:setFaceFeature", (index, value) => {
    if (!ccActive) return;

    mp.players.local.setFaceFeature(
        num(index),
        Math.max(-1, Math.min(1, num(value)))
    );
});

mp.events.add("cc:setEyeColor", (color) => {
    if (!ccActive) return;

    mp.players.local.setEyeColor(
        Math.max(0, Math.min(31, num(color)))
    );
});

mp.events.add(
    "cc:setHeadOverlay",
    (overlayId, value, opacity = 1, color1 = 0, color2 = 0) => {
        if (!ccActive) return;

        setHeadOverlaySafe(
            overlayId,
            value,
            opacity,
            color1,
            color2
        );
    }
);

mp.events.add("cc:setHeadOverlayColor", (overlayId, colorType, color1, color2 = 0) => {
    if (!ccActive) return;

    mp.players.local.setHeadOverlayColor(
        Math.max(0, Math.min(12, num(overlayId, 0))),
        num(colorType, 1),
        num(color1, 0),
        num(color2, 0)
    );
});

mp.events.add("cc:save", (rawData, maybePayloadJson) => {
    mp.console.logInfo(`[CC SAVE CLIENT RAW] raw=${String(rawData).slice(0, 300)} active=${ccActive}`);

    let slot = 1;
    let payloadJson = "{}";

    try {
        if (typeof rawData === "string") {
            const data = JSON.parse(rawData);

            slot = Number(data.slot) || 1;
            payloadJson = String(data.payload || "{}");
        } else {
            slot = Number(rawData) || 1;
            payloadJson = String(maybePayloadJson || "{}");
        }
    } catch (err) {
        mp.console.logError(`[CC SAVE PARSE ERROR] ${err.message}`);
        return;
    }

    mp.console.logInfo(`[CC SAVE PARSED] slot=${slot} payloadLength=${payloadJson.length}`);

    if (!payloadJson || payloadJson === "{}") {
        mp.console.logError("[CC SAVE BLOCKED] empty payload");
        return;
    }

    if (!ccActive) {
        mp.console.logError("[CC SAVE WARNING] ccActive=false, but save will continue");
    }

    mp.events.callRemote("s:characters:save", slot, payloadJson);

    mp.console.logInfo("[CC SAVE REMOTE SENT]");
});

mp.events.add("c:characterCreator:error", (message) => {
    notify(message || "Ошибка создания персонажа.", "error");
});

mp.events.add("c:characterCreator:success", () => {
    notify("Персонаж успешно создан.", "success", 3000);
    stopCreator();
});

mp.events.add("cc:debug", (reason) => {
    mp.console.logInfo(`[CC DEBUG] ${String(reason)}`);
});
