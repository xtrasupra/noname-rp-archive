"use strict";

const LICENSE_DOCUMENT_PAGE = "licenseDocument";
const LICENSE_DOCUMENT_INTERACTION_OWNER = "licenseDocument";
const MOVEMENT_CHECK_MS = 250;
const MOVEMENT_CLOSE_DELAY_MS = 3000;
const MOVEMENT_THRESHOLD = 0.12;

let movementTimer = null;
let closeTimer = null;
let lastPosition = null;
let documentOpened = false;

function parseJson(value, fallback = {}) {
    try {
        if (!value) return fallback;
        if (typeof value === "object") return value;
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function getPlayerPosition() {
    try {
        const position = mp.players.local?.position;

        if (!position) return null;

        return {
            x: Number(position.x || 0),
            y: Number(position.y || 0),
            z: Number(position.z || 0),
        };
    } catch {
        return null;
    }
}

function getDistance(left, right) {
    if (!left || !right) return 0;

    const dx = Number(left.x || 0) - Number(right.x || 0);
    const dy = Number(left.y || 0) - Number(right.y || 0);
    const dz = Number(left.z || 0) - Number(right.z || 0);

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getUiBrowser() {
    return global.interfaceLock?.getUiBrowser?.()
        || global.uiBrowser
        || globalThis.twinkleBrowser?.browser
        || globalThis.twinkleBrowser?.cef
        || globalThis.browser
        || null;
}

function execCef(code) {
    try {
        const browser = getUiBrowser();

        if (browser?.execute) {
            browser.execute(code);
            return true;
        }
    } catch (e) {
        try {
            mp.console.logError(`[LICENSE DOCUMENT] CEF exec error: ${e.message || e}`);
        } catch {}
    }

    return false;
}

function clearCloseTimer() {
    if (!closeTimer) return;

    clearTimeout(closeTimer);
    closeTimer = null;
}

function clearMovementTimer() {
    if (!movementTimer) return;

    clearInterval(movementTimer);
    movementTimer = null;
}

function closeLicenseDocument() {
    documentOpened = false;
    lastPosition = null;
    clearCloseTimer();
    clearMovementTimer();

    try {
        global.interfaceLock?.releaseInteraction?.(LICENSE_DOCUMENT_INTERACTION_OWNER);
    } catch {}

    try {
        if (global.interfaceLock?.closePage) {
            global.interfaceLock.closePage(LICENSE_DOCUMENT_PAGE);
            return;
        }

        if (typeof closePage === "function") {
            closePage(LICENSE_DOCUMENT_PAGE);
            return;
        }
    } catch {}

    execCef(`
        try {
            if (window.twinkleBrowser?.interfaces?.close) {
                window.twinkleBrowser.interfaces.close(${JSON.stringify(LICENSE_DOCUMENT_PAGE)});
            } else if (window.twinkleBrowser?.closeInterface) {
                window.twinkleBrowser.closeInterface(${JSON.stringify(LICENSE_DOCUMENT_PAGE)});
            }
        } catch {}
    `);
}

function scheduleCloseAfterMovement() {
    if (closeTimer) return;

    closeTimer = setTimeout(() => {
        closeLicenseDocument();
    }, MOVEMENT_CLOSE_DELAY_MS);
}

function startMovementWatcher() {
    clearMovementTimer();
    clearCloseTimer();

    lastPosition = getPlayerPosition();

    movementTimer = setInterval(() => {
        if (!documentOpened) {
            clearMovementTimer();
            return;
        }

        const currentPosition = getPlayerPosition();

        if (!currentPosition) return;

        if (lastPosition && getDistance(lastPosition, currentPosition) >= MOVEMENT_THRESHOLD) {
            scheduleCloseAfterMovement();
            clearMovementTimer();
            return;
        }

        lastPosition = currentPosition;
    }, MOVEMENT_CHECK_MS);
}

function openLicenseDocument(rawPayload = "{}") {
    const payload = parseJson(rawPayload, {});
    let opened = false;

    try {
        const interfaceState = global.interfaceLock?.getInterfaceState?.();

        if (interfaceState?.activePage === "radialMenu") {
            global.interfaceLock.closePage("radialMenu");
        }

        if (global.interfaceLock?.openInterface) {
            opened = global.interfaceLock.openInterface(LICENSE_DOCUMENT_PAGE, payload, {
                interactive: true,
                owner: LICENSE_DOCUMENT_INTERACTION_OWNER,
            }) !== false;
        } else {
            opened = execCef(`
                if (window.twinkleBrowser?.interfaces?.open) {
                    window.twinkleBrowser.interfaces.open(${JSON.stringify(LICENSE_DOCUMENT_PAGE)}, ${JSON.stringify(payload)});
                }
            `);
        }
    } catch (e) {
        try {
            mp.console.logError(`[LICENSE DOCUMENT] open error: ${e.message || e}`);
        } catch {}
    }

    if (!opened) return;

    documentOpened = true;
    startMovementWatcher();
}

function resetLicenseDocumentState() {
    documentOpened = false;
    lastPosition = null;
    clearCloseTimer();
    clearMovementTimer();

    try {
        global.interfaceLock?.releaseInteraction?.(LICENSE_DOCUMENT_INTERACTION_OWNER);
    } catch {}
}

mp.events.add("c:licenseDocument:show", (payloadJson = "{}") => {
    openLicenseDocument(payloadJson);
});

mp.events.add("c:document:show", (payloadJson = "{}") => {
    openLicenseDocument(payloadJson);
});

mp.events.add("c:licenseDocument:hide", () => {
    closeLicenseDocument();
});

mp.events.add("document:closeFromBrowser", () => {
    closeLicenseDocument();
});

mp.events.add("interface:lock:closing", (page) => {
    if (page === LICENSE_DOCUMENT_PAGE || page === "*") {
        resetLicenseDocumentState();
    }
});

mp.events.add("playerQuit", () => {
    closeLicenseDocument();
});

try {
    mp.console.logInfo("[LICENSE DOCUMENT] Loaded");
} catch {}
