"use strict";

const SPAWN_PAGE_NAME = "selectSpawn";

const DEFAULT_SPAWN_TYPE = "default";
const SPAWN_CONTRACT_VERSION = 1;
const MAX_SPAWN_OPTIONS = 20;
const MAX_SPAWN_DIMENSION = 2147483647;

const PREVIEW_FADE_OUT_MS = 150;
const PREVIEW_FADE_IN_MS = 250;
const PREVIEW_STREAM_WARMUP_MS = 350;
const PREVIEW_ACK_TIMEOUT_MS = 1500;
const SELECT_FADE_OUT_MS = 300;
const SELECT_CONFIRM_TIMEOUT_MS = 8000;
const SPAWN_UI_RETRY_DELAYS = Object.freeze([700, 1800]);
const SPAWN_UI_RELOAD_DELAY = 3500;
const SPAWN_UI_FINAL_TIMEOUT = 6500;

const CAMERA_DISTANCE = 6.5;
const CAMERA_HEIGHT = 2.8;
const CAMERA_FOV = 50.0;

const FALLBACK_POINT = {
    x: -1037.75,
    y: -2737.62,
    z: 20.17,
    heading: 327.0,
    dimension: 0,
};

let spawnCamera = null;
let spawnPayload = null;
let spawnSelectedType = DEFAULT_SPAWN_TYPE;
let spawnConfirmedType = DEFAULT_SPAWN_TYPE;

let spawnSelectorOpened = false;
let spawnSelectorSelecting = false;
let spawnSelectorBlockedOnce = false;
let spawnSelectionTimer = null;
let spawnPreviewTimer = null;
let spawnUiSession = 0;
let spawnUiMounted = false;
const spawnUiTimers = new Set();

let previewRequestId = 0;
let openRequestId = 0;

function parseJson(value, fallback = {}) {
    try {
        if (!value) {
            return fallback;
        }

        if (typeof value === "object") {
            return value;
        }

        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function normalizePosition(rawPosition) {
    const position = rawPosition || {};

    return {
        x: toFiniteNumber(
            position.x ?? position.X,
            FALLBACK_POINT.x
        ),

        y: toFiniteNumber(
            position.y ?? position.Y,
            FALLBACK_POINT.y
        ),

        z: toFiniteNumber(
            position.z ?? position.Z,
            FALLBACK_POINT.z
        ),

        heading: toFiniteNumber(
            position.heading ??
            position.h ??
            position.H ??
            position.rotation,
            FALLBACK_POINT.heading
        ),

        dimension: Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    position.dimension ??
                    position.dim ??
                    position.Dimension,
                    FALLBACK_POINT.dimension
                )
            )
        ),
    };
}

function normalizeSpawnOption(option) {
    if (
        !option ||
        typeof option !== "object" ||
        Array.isArray(option)
    ) {
        return null;
    }

    const type = typeof option.type === "string"
        ? option.type.trim()
        : "";

    if (!type || type.length > 64) {
        return null;
    }

    const rawPosition = option.position;
    if (
        !rawPosition ||
        typeof rawPosition !== "object" ||
        Array.isArray(rawPosition) ||
        typeof rawPosition.x !== "number" ||
        !Number.isFinite(rawPosition.x) ||
        rawPosition.x < -20000 ||
        rawPosition.x > 20000 ||
        typeof rawPosition.y !== "number" ||
        !Number.isFinite(rawPosition.y) ||
        rawPosition.y < -20000 ||
        rawPosition.y > 20000 ||
        typeof rawPosition.z !== "number" ||
        !Number.isFinite(rawPosition.z) ||
        rawPosition.z < -2000 ||
        rawPosition.z > 5000 ||
        typeof option.heading !== "number" ||
        !Number.isFinite(option.heading) ||
        option.heading < -360000 ||
        option.heading > 360000 ||
        !Number.isSafeInteger(option.dimension) ||
        option.dimension < 0 ||
        option.dimension > MAX_SPAWN_DIMENSION
    ) {
        return null;
    }

    const boundedOptionalString = (value, maxLength) => {
        if (value === undefined) return undefined;
        if (typeof value !== "string") return null;

        const normalized = value.trim();
        return normalized && normalized.length <= maxLength
            ? normalized
            : null;
    };

    const title = boundedOptionalString(option.title, 96);
    const icon = boundedOptionalString(option.icon, 32);
    const kind = boundedOptionalString(option.kind, 32);
    const npcId = boundedOptionalString(option.npcId, 64);
    const starterIndex = option.starterIndex;

    if (
        title === null ||
        icon === null ||
        kind === null ||
        npcId === null ||
        (
            starterIndex !== undefined &&
            (
                !Number.isSafeInteger(starterIndex) ||
                starterIndex < 0 ||
                starterIndex >= MAX_SPAWN_OPTIONS
            )
        )
    ) {
        return null;
    }

    return {
        type,
        title: title || type,
        ...(icon === undefined ? {} : { icon }),
        ...(kind === undefined ? {} : { kind }),
        ...(npcId === undefined ? {} : { npcId }),
        ...(starterIndex === undefined ? {} : { starterIndex }),
        position: {
            x: rawPosition.x,
            y: rawPosition.y,
            z: rawPosition.z,
        },
        heading: option.heading,
        dimension: option.dimension,
    };
}

function normalizePayload(rawPayload) {
    const parsed = parseJson(rawPayload, null);
    const rawOptions = parsed?.options;
    const uiRevision = parsed?.uiRevision;

    if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        parsed.contractVersion !== SPAWN_CONTRACT_VERSION ||
        !Array.isArray(rawOptions) ||
        rawOptions.length < 1 ||
        rawOptions.length > MAX_SPAWN_OPTIONS ||
        !Number.isSafeInteger(uiRevision) ||
        uiRevision < 1 ||
        (parsed.pending !== undefined && typeof parsed.pending !== "boolean") ||
        typeof parsed.selected !== "string"
    ) {
        return {
            contractVersion: 0,
            selected: DEFAULT_SPAWN_TYPE,
            options: [],
            uiRevision: 0,
        };
    }

    const selected = parsed.selected.trim();
    const options = rawOptions.map(normalizeSpawnOption);
    const types = new Set();

    if (
        !selected ||
        selected.length > 64 ||
        options.some((option) => !option) ||
        options.some((option) => {
            if (types.has(option.type)) return true;
            types.add(option.type);
            return false;
        }) ||
        !types.has(selected)
    ) {
        return {
            contractVersion: 0,
            selected: DEFAULT_SPAWN_TYPE,
            options: [],
            uiRevision,
        };
    }

    return {
        contractVersion: SPAWN_CONTRACT_VERSION,
        selected,
        options,
        pending: Boolean(parsed.pending),
        uiRevision,
    };
}

function getSpawnOption(type) {
    const options = Array.isArray(spawnPayload?.options)
        ? spawnPayload.options
        : [];

    return (
        options.find((option) => option.type === type) ||
        options.find(
            (option) => option.type === DEFAULT_SPAWN_TYPE
        ) ||
        options[0] ||
        null
    );
}

function getSpawnPosition(type) {
    const option = getSpawnOption(type);

    if (!option) {
        return normalizePosition(FALLBACK_POINT);
    }

    return normalizePosition({
        ...option.position,
        heading: option.heading,
        dimension: option.dimension,
    });
}

function openSpawnPage(payload) {
    try {
        if (global.interfaceLock?.forceOpenPage) {
            global.interfaceLock.forceOpenPage(
                SPAWN_PAGE_NAME,
                null,
                payload || {}
            );

            return;
        }

        if (typeof global.openPage === "function") {
            global.openPage(
                SPAWN_PAGE_NAME,
                null,
                payload || {},
                {
                    force: true,
                }
            );
        }
    } catch (error) {
        console.error(
            "[SPAWN SELECTOR] openSpawnPage:",
            error
        );
    }
}

function getSpawnUiRevision() {
    const revision = Number(spawnPayload?.uiRevision || 0);
    return Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
}

function reportSpawnUiStage(stage, revision = getSpawnUiRevision()) {
    try {
        mp.events.callRemote(
            "s:spawn:uiTrace",
            String(stage || "").slice(0, 32),
            Number(revision || 0)
        );
    } catch {}
}

function clearSpawnUiWatchdog() {
    spawnUiSession += 1;
    spawnUiTimers.forEach((timer) => {
        try { clearTimeout(timer); } catch {}
    });
    spawnUiTimers.clear();
}

function scheduleSpawnUiWatchdog(callback, delay) {
    let timer = null;
    timer = setTimeout(() => {
        spawnUiTimers.delete(timer);
        callback();
    }, delay);
    spawnUiTimers.add(timer);
    return timer;
}

function isSpawnPageActive() {
    const activePage = global.interfaceLock?.getInterfaceState?.()?.activePage;
    return activePage === SPAWN_PAGE_NAME && spawnSelectorOpened && Boolean(spawnPayload);
}

function replaySpawnPage(stage) {
    if (!isSpawnPageActive() || spawnUiMounted) return false;

    reportSpawnUiStage(stage);
    openSpawnPage(spawnPayload);
    return true;
}

function startSpawnUiWatchdog() {
    clearSpawnUiWatchdog();

    const session = spawnUiSession;
    spawnUiMounted = false;

    SPAWN_UI_RETRY_DELAYS.forEach((delay, index) => {
        scheduleSpawnUiWatchdog(() => {
            if (session !== spawnUiSession) return;
            replaySpawnPage(`retry-${index + 1}`);
        }, delay);
    });

    scheduleSpawnUiWatchdog(() => {
        if (
            session !== spawnUiSession ||
            spawnUiMounted ||
            !isSpawnPageActive()
        ) return;

        reportSpawnUiStage("cef-reload");

        try {
            const browser = global.interfaceLock?.getUiBrowser?.() || global.uiBrowser;

            if (!browser || typeof browser.reload !== "function") {
                throw new Error("CEF browser reload is unavailable");
            }

            browser.reload(false);
        } catch {
            reportSpawnUiStage("reload-error");
        }
    }, SPAWN_UI_RELOAD_DELAY);

    scheduleSpawnUiWatchdog(() => {
        if (
            session !== spawnUiSession ||
            spawnUiMounted ||
            !isSpawnPageActive()
        ) return;

        reportSpawnUiStage("mount-timeout");

        if (global.interfaceLock?.notify) {
            global.interfaceLock.notify(
                "Интерфейс выбора места появления не загрузился. Переподключитесь к серверу.",
                "error"
            );
        }
    }, SPAWN_UI_FINAL_TIMEOUT);
}

function updateSpawnPage(payload) {
    try {
        if (global.interfaceLock?.openPage) {
            return Boolean(global.interfaceLock.openPage(
                SPAWN_PAGE_NAME,
                null,
                payload || {}
            ));
        }

        openSpawnPage(payload);
        return true;
    } catch (error) {
        console.error("[SPAWN SELECTOR] updateSpawnPage:", error);
        return false;
    }
}

function clearSpawnSelectionTimer() {
    if (!spawnSelectionTimer) return;

    try { clearTimeout(spawnSelectionTimer); } catch {}
    spawnSelectionTimer = null;
}

function clearSpawnPreviewTimer() {
    if (!spawnPreviewTimer) return;
    try { clearTimeout(spawnPreviewTimer); } catch {}
    spawnPreviewTimer = null;
}

function setSpawnSelectionPending(pending) {
    if (!spawnPayload) return;

    spawnPayload = {
        ...spawnPayload,
        pending: Boolean(pending),
    };
    updateSpawnPage(spawnPayload);
}

function recoverSpawnSelection(message) {
    clearSpawnSelectionTimer();
    clearSpawnPreviewTimer();
    spawnSelectorSelecting = false;
    setSpawnSelectionPending(false);
    showCursor(true);
    fadeIn(300);

    if (message && global.interfaceLock?.notify) {
        global.interfaceLock.notify(message, "error");
    }
}

function closeSpawnPage() {
    try {
        if (global.interfaceLock?.closePage) {
            global.interfaceLock.closePage(
                SPAWN_PAGE_NAME
            );

            return;
        }

        if (typeof global.closePage === "function") {
            global.closePage(SPAWN_PAGE_NAME);
        }
    } catch (error) {
        console.error(
            "[SPAWN SELECTOR] closeSpawnPage:",
            error
        );
    }
}

function destroySpawnCamera() {
    if (!spawnCamera) {
        return;
    }

    try {
        spawnCamera.setActive(false);
    } catch {}

    try {
        spawnCamera.destroy();
    } catch {}

    spawnCamera = null;
}

function calculateCameraPosition(point) {
    const heading = (point.heading + 180) * Math.PI / 180;

    return new mp.Vector3(
        point.x + Math.sin(heading) * CAMERA_DISTANCE,
        point.y - Math.cos(heading) * CAMERA_DISTANCE,
        point.z + CAMERA_HEIGHT
    );
}

function startSpawnCamera(rawPoint) {
    const point = normalizePosition(rawPoint);
    const cameraPos = calculateCameraPosition(point);

    try {
        if (!spawnCamera) {
            spawnCamera = mp.cameras.new(
                "default",
                cameraPos,
                new mp.Vector3(0, 0, 0),
                CAMERA_FOV
            );

            spawnCamera.pointAtCoord(
                point.x,
                point.y,
                point.z + 0.9
            );

            spawnCamera.setActive(true);

            mp.game.cam.renderScriptCams(
                true,
                true,
                800,
                true,
                false
            );

            return;
        }

        spawnCamera.setCoord(
            cameraPos.x,
            cameraPos.y,
            cameraPos.z
        );

        spawnCamera.pointAtCoord(
            point.x,
            point.y,
            point.z + 0.9
        );

        mp.game.cam.renderScriptCams(
            true,
            true,
            800,
            true,
            false
        );
    } catch (e) {
        console.error("[SPAWN CAMERA]", e);
    }
}

function stopSpawnCamera() {
    destroySpawnCamera();

    try {
        mp.game.cam.renderScriptCams(
            false,
            false,
            0,
            true,
            false
        );
    } catch {}
}

function setPlayerFrozen(state) {
    try {
        mp.players.local.freezePosition(Boolean(state));
    } catch (error) {
        console.error(
            "[SPAWN SELECTOR] freezePosition:",
            error
        );
    }
}

function setGameplayUiVisible(state) {
    try {
        mp.game.ui.displayRadar(Boolean(state));
    } catch {}

    try {
        mp.game.ui.displayHud(Boolean(state));
    } catch {}
}

function showCursor(state) {
    try {
        mp.gui.cursor.show(
            Boolean(state),
            Boolean(state)
        );
    } catch {}
}

function fadeOut(duration = 150) {
    try {
        mp.game.cam.doScreenFadeOut(duration);
    } catch {}
}

function fadeIn(duration = 300) {
    try {
        mp.game.cam.doScreenFadeIn(duration);
    } catch {}
}

function resetSpawnSelectorLocal(options = {}) {
    const {
        showGameplay = true,
        fadeScreenIn = true,
    } = options;

    clearSpawnSelectionTimer();
    clearSpawnPreviewTimer();
    clearSpawnUiWatchdog();
    spawnUiMounted = false;
    openRequestId += 1;
    previewRequestId += 1;

    spawnSelectorOpened = false;
    spawnSelectorSelecting = false;

    spawnPayload = null;
    spawnSelectedType = DEFAULT_SPAWN_TYPE;
    spawnConfirmedType = DEFAULT_SPAWN_TYPE;

    closeSpawnPage();
    stopSpawnCamera();

    setPlayerFrozen(false);
    showCursor(false);

    if (showGameplay) {
        setGameplayUiVisible(true);
    }

    if (fadeScreenIn) {
        fadeIn(300);
    }
}

function previewSpawn(type) {
    if (!spawnSelectorOpened) {
        return;
    }

    const option = getSpawnOption(type);

    if (!option) {
        return;
    }

    const fallbackType = spawnConfirmedType;
    spawnSelectedType = option.type;

    const currentPreviewRequest =
        ++previewRequestId;

    fadeOut(PREVIEW_FADE_OUT_MS);

    try {
        mp.events.callRemote(
            "s:spawn:preview",
            JSON.stringify({
                contractVersion: SPAWN_CONTRACT_VERSION,
                uiRevision: getSpawnUiRevision(),
                requestId: currentPreviewRequest,
                type: spawnSelectedType,
            })
        );
    } catch (error) {
        console.error("[SPAWN PREVIEW] Remote request failed:", error);
    }

    clearSpawnPreviewTimer();
    spawnPreviewTimer = setTimeout(() => {
        spawnPreviewTimer = null;
        if (
            currentPreviewRequest !== previewRequestId ||
            !spawnSelectorOpened
        ) {
            return;
        }

        spawnSelectedType = fallbackType;
        if (spawnPayload) {
            spawnPayload = {
                ...spawnPayload,
                selected: fallbackType,
            };
            updateSpawnPage(spawnPayload);
        }

        startSpawnCamera(getSpawnPosition(fallbackType));
        fadeIn(PREVIEW_FADE_IN_MS);

        if (global.interfaceLock?.notify) {
            global.interfaceLock.notify(
                "Сервер не подтвердил предпросмотр. Попробуйте ещё раз.",
                "error"
            );
        }
    }, PREVIEW_ACK_TIMEOUT_MS);
}

mp.events.add("c:spawn:previewReady", (rawPayload = "{}") => {
    const payload = parseJson(rawPayload, null);
    const requestId = payload?.requestId;
    const type = payload?.type;

    if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        payload?.contractVersion !== SPAWN_CONTRACT_VERSION ||
        payload?.uiRevision !== getSpawnUiRevision() ||
        !Number.isSafeInteger(requestId) ||
        requestId !== previewRequestId ||
        typeof type !== "string" ||
        type !== spawnSelectedType ||
        !spawnSelectorOpened ||
        spawnSelectorSelecting
    ) {
        return;
    }

    clearSpawnPreviewTimer();
    spawnConfirmedType = type;
    if (spawnPayload) {
        spawnPayload = {
            ...spawnPayload,
            selected: type,
        };
    }
    spawnPreviewTimer = setTimeout(() => {
        spawnPreviewTimer = null;
        if (
            requestId !== previewRequestId ||
            type !== spawnSelectedType ||
            !spawnSelectorOpened
        ) {
            return;
        }

        startSpawnCamera(getSpawnPosition(type));
        fadeIn(PREVIEW_FADE_IN_MS);
    }, PREVIEW_STREAM_WARMUP_MS);
});

mp.events.add("c:spawn:blockOnce", () => {
    spawnSelectorBlockedOnce = true;

    resetSpawnSelectorLocal({
        showGameplay: true,
        fadeScreenIn: true,
    });
});

mp.events.add("c:spawn:forceClose", () => {
    spawnSelectorBlockedOnce = false;

    resetSpawnSelectorLocal({
        showGameplay: true,
        fadeScreenIn: true,
    });
});

mp.events.add(
    "c:spawn:open",
    (payloadJson = "{}") => {
        if (spawnSelectorBlockedOnce) {
            spawnSelectorBlockedOnce = false;

            resetSpawnSelectorLocal({
                showGameplay: true,
                fadeScreenIn: true,
            });

            return;
        }

        const normalizedPayload =
            normalizePayload(payloadJson);

        if (!normalizedPayload.options.length) {
            reportSpawnUiStage("invalid-payload", normalizedPayload.uiRevision);
            console.error(
                "[SPAWN SELECTOR] Server returned no spawn options."
            );

            resetSpawnSelectorLocal({
                showGameplay: true,
                fadeScreenIn: true,
            });

            return;
        }

        clearSpawnSelectionTimer();
        clearSpawnPreviewTimer();

        const currentOpenRequest =
            ++openRequestId;

        previewRequestId += 1;

        spawnPayload = {
            ...normalizedPayload,
            pending: false,
        };
        spawnSelectedType =
            normalizedPayload.selected;
        spawnConfirmedType =
            normalizedPayload.selected;

        spawnSelectorOpened = true;
        spawnSelectorSelecting = false;
        reportSpawnUiStage("client-event");
        startSpawnUiWatchdog();

        fadeOut(PREVIEW_FADE_OUT_MS);

        setPlayerFrozen(true);
        setGameplayUiVisible(false);
        showCursor(false);

        setTimeout(() => {
            if (
                currentOpenRequest !== openRequestId ||
                !spawnSelectorOpened
            ) {
                return;
            }

            openSpawnPage(spawnPayload);

            startSpawnCamera(
                getSpawnPosition(spawnSelectedType)
            );

            showCursor(true);
            fadeIn(300);
        }, PREVIEW_FADE_OUT_MS + PREVIEW_STREAM_WARMUP_MS);
    }
);

mp.events.add("spawnSelector:pageSetFromBrowser", (revision) => {
    if (Number(revision) !== getSpawnUiRevision()) return;
    if (!isSpawnPageActive()) return;

    reportSpawnUiStage("cef-page-set");
});

mp.events.add("spawnSelector:mountedFromBrowser", (revision) => {
    if (Number(revision) !== getSpawnUiRevision()) return;
    if (!isSpawnPageActive()) return;

    spawnUiMounted = true;
    clearSpawnUiWatchdog();
    reportSpawnUiStage("cef-mounted");
    showCursor(true);
});

mp.events.add(
    "spawnSelector:previewFromBrowser",
    (type) => {
        if (
            !spawnSelectorOpened ||
            spawnSelectorSelecting
        ) {
            return;
        }

        previewSpawn(
            String(type || DEFAULT_SPAWN_TYPE)
        );
    }
);

mp.events.add(
    "spawnSelector:selectFromBrowser",
    (type) => {
        if (
            !spawnSelectorOpened ||
            spawnSelectorSelecting
        ) {
            return;
        }

        const requestedType = String(
            type ||
            spawnSelectedType ||
            DEFAULT_SPAWN_TYPE
        );

        const option = getSpawnOption(requestedType);

        if (!option) {
            return;
        }

        spawnSelectorSelecting = true;
        spawnSelectedType = option.type;
        const currentOpenRequest = openRequestId;
        previewRequestId++;
        clearSpawnPreviewTimer();
        setSpawnSelectionPending(true);

        showCursor(false);
        fadeOut(SELECT_FADE_OUT_MS);

        setTimeout(() => {
            if (
                !spawnSelectorSelecting ||
                currentOpenRequest !== openRequestId
            ) {
                return;
            }
            try {
                mp.events.callRemote(
                    "s:spawn:select",
                    spawnSelectedType
                );

                clearSpawnSelectionTimer();
                spawnSelectionTimer = setTimeout(() => {
                    spawnSelectionTimer = null;
                    if (
                        !spawnSelectorSelecting ||
                        currentOpenRequest !== openRequestId
                    ) return;

                    recoverSpawnSelection(
                        "Сервер не подтвердил место появления. Попробуйте ещё раз."
                    );
                }, SELECT_CONFIRM_TIMEOUT_MS);
            } catch (error) {
                console.error(
                    "[SPAWN SELECTOR] select remote:",
                    error
                );

                recoverSpawnSelection(
                    "Не удалось отправить запрос выбора места появления."
                );
            }
        }, SELECT_FADE_OUT_MS + 100);
    }
);

mp.events.add("c:spawn:complete", () => {

    stopSpawnCamera();

    resetSpawnSelectorLocal({
        showGameplay: true,
        fadeScreenIn: false
    });

    try {
        if (global.interfaceLock?.showHud) {
            global.interfaceLock.showHud(null, true);
        }
    } catch {}

    fadeIn(500);

});

mp.events.add(
    "c:spawn:error",
    (message = "Не удалось выбрать место появления.") => {
        console.error(
            `[SPAWN SELECTOR] ${message}`
        );

        recoverSpawnSelection(String(message));
    }
);

console.log(
    "[SPAWN SELECTOR] Client loaded"
);
