"use strict";
const hudSnapshot = global.twinkleHudSnapshot;

if (!hudSnapshot) {
    throw new Error("HUD snapshot bootstrap must load before hud.js");
}

let hudState = {};

const LOCAL_VOICE_KEY = 0x42;
const ADMIN_VOICE_KEY = 0x78; // F9; N is reserved by the vehicle scrapyard.
const DEFAULT_SERVER_TIME_ZONE = "Europe/Riga";
const HUD_SERVER_REFRESH_MS = 60 * 1000;
const HUD_WEATHER = {
    label: "Ясно",
    temperature: "+10",
    gameWeather: "EXTRASUNNY"
};

let isLocalTalking = false;
let isAdminTalking = false;
let voiceReady = false;
let localAdminLevel = 0;
let localVoiceRange = 12;
let lastLocalVoiceDown = false;
let lastAdminVoiceDown = false;
const incomingVoice = new Map();
const talkingRemoteIds = new Set();
let serverTimeOffsetMs = 0;
let serverTimeZone = DEFAULT_SERVER_TIME_ZONE;
let lastServerHudRefreshAt = 0;

function parsePayload(payloadJson) {
    try {
        if (!payloadJson) return {};
        if (typeof payloadJson === "object") return payloadJson;
        return JSON.parse(payloadJson);
    } catch {
        return {};
    }
}

function isAnyVoiceActive() {
    return isLocalTalking || isAdminTalking;
}

function getAdminLevel() {
    return Number(
        localAdminLevel ||
        mp.players.local?.getVariable?.("adminLevel") ||
        mp.players.local?.getVariable?.("admin") ||
        0
    );
}

function canUseVoice() {
    try {
        if (mp.players.local?.getVariable?.("isMuted")) return false;
        if (mp.players.local?.getVariable?.("vmuted")) return false;
    } catch {}
    return true;
}

function updateHudMicrophone() {
    pushHud({
        microphone: {
            isTalking: isAnyVoiceActive()
        }
    });
}

function setVoiceMuted(muted) {
    try {
        mp.voiceChat.muted = muted;
    } catch (e) {
        mp.console.logError(`[VOICE] muted error: ${e.message}`);
    }
}

function isKeyDown(keyCode) {
    try {
        if (mp.keys?.isDown) return Boolean(mp.keys.isDown(keyCode));
    } catch {}

    return false;
}

function isVoiceInputBlocked() {
    try {
        if (typeof global.isInputBlocked === "function" && global.isInputBlocked()) return true;
        if (global.interfaceLock?.isChatOpened?.()) return true;
    } catch {}

    return false;
}

function callVoiceRemote(eventName) {
    try {
        mp.events.callRemote(eventName);
        return true;
    } catch (error) {
        mp.console.logError(`[VOICE] ${eventName}: ${error.message}`);
        return false;
    }
}

function startLocalVoice() {
    if (isLocalTalking || !voiceReady || !canUseVoice() || isVoiceInputBlocked()) return;

    if (isAdminTalking) stopAdminVoice();

    isLocalTalking = true;
    setVoiceMuted(false);

    if (!callVoiceRemote("server:voice:local:start")) {
        isLocalTalking = false;
        setVoiceMuted(true);
    }
    updateHudMicrophone();
}

function stopLocalVoice() {
    if (!isLocalTalking) return;

    isLocalTalking = false;

    callVoiceRemote("server:voice:local:stop");

    if (!isAnyVoiceActive()) setVoiceMuted(true);

    updateHudMicrophone();
}

function startAdminVoice() {
    if (isAdminTalking || !voiceReady || !canUseVoice() || isVoiceInputBlocked() || getAdminLevel() < 1) return;

    if (isLocalTalking) stopLocalVoice();

    isAdminTalking = true;
    setVoiceMuted(false);

    if (!callVoiceRemote("server:voice:admin:start")) {
        isAdminTalking = false;
        setVoiceMuted(true);
    }
    updateHudMicrophone();
}

function stopAdminVoice() {
    if (!isAdminTalking) return;

    isAdminTalking = false;

    callVoiceRemote("server:voice:admin:stop");

    if (!isAnyVoiceActive()) setVoiceMuted(true);

    updateHudMicrophone();
}

function stopAllVoice() {
    const hadLocal = isLocalTalking;
    const hadAdmin = isAdminTalking;

    isLocalTalking = false;
    isAdminTalking = false;

    if (hadLocal) callVoiceRemote("server:voice:local:stop");
    if (hadAdmin) callVoiceRemote("server:voice:admin:stop");

    setVoiceMuted(true);
    updateHudMicrophone();
}

function initVoiceSettings() {
    try { mp.voiceChat.muted = true; } catch {}
    try { mp.voiceChat.defaultVolume = 1; } catch {}

    try {
        mp.voiceChat.gameOutputEnabled = true;
    } catch {}
}

function resetIncomingPlayer(player) {
    if (!player || player === mp.players.local) return;
    talkingRemoteIds.delete(Number(player.remoteId));
    try {
        player.voiceVolume = 0;
        player.voice3d = true;
    } catch {}
}

mp.events.add("client:voice:ready", (range, adminLevel) => {
    localVoiceRange = Math.max(1, Number(range || 15));
    localAdminLevel = Math.max(0, Number(adminLevel || 0));
    voiceReady = true;
    stopAllVoice();
});

mp.events.add("client:voice:speaker", (remoteId, mode, enabled, range) => {
    const id = Number(remoteId);
    const player = mp.players.atRemoteId(id);

    if (!enabled) {
        incomingVoice.delete(id);
        talkingRemoteIds.delete(id);
        if (player && player !== mp.players.local) resetIncomingPlayer(player);
        return;
    }

    const normalizedMode = mode === "admin" ? "admin" : "local";
    localVoiceRange = Math.max(1, Number(range || localVoiceRange));
    incomingVoice.set(id, normalizedMode);

    if (!player || player === mp.players.local) return;

    try {
        player.voice3d = normalizedMode !== "admin";
        player.voiceVolume = 1;
    } catch {}
});

mp.events.add("playerStartTalking", (player) => {
    if (!player || player === mp.players.local || !incomingVoice.has(player.remoteId)) return;
    talkingRemoteIds.add(Number(player.remoteId));
});

mp.events.add("playerStopTalking", (player) => {
    if (!player || player === mp.players.local) return;
    talkingRemoteIds.delete(Number(player.remoteId));
});

mp.events.add("entityStreamIn", (entity) => {
    if (!entity || entity.type !== "player") return;
    const mode = incomingVoice.get(entity.remoteId);
    if (!mode) return;
    try {
        entity.voice3d = mode !== "admin";
        entity.voiceVolume = 1;
    } catch {}
});

mp.events.add("entityStreamOut", (entity) => {
    if (!entity || entity.type !== "player") return;
    talkingRemoteIds.delete(Number(entity.remoteId));
    if (incomingVoice.get(entity.remoteId) !== "admin") resetIncomingPlayer(entity);
});

setInterval(() => {
    const localPlayer = mp.players.local;
    if (!localPlayer) return;

    for (const [remoteId, mode] of incomingVoice.entries()) {
        const player = mp.players.atRemoteId(remoteId);
        if (!player) continue;

        try {
            if (mode === "admin") {
                player.voice3d = false;
                player.voiceVolume = 1;
                continue;
            }

            const distance = mp.game.system.vdist(
                localPlayer.position.x,
                localPlayer.position.y,
                localPlayer.position.z,
                player.position.x,
                player.position.y,
                player.position.z
            );
            player.voice3d = true;
            player.voiceVolume = Math.max(0, Math.min(1, 1 - distance / localVoiceRange));
        } catch {}
    }
}, 150);

setInterval(() => {
    const inputBlocked = isVoiceInputBlocked();
    const localDown = !inputBlocked && isKeyDown(LOCAL_VOICE_KEY);
    const adminDown = !inputBlocked && isKeyDown(ADMIN_VOICE_KEY);

    if (localDown !== lastLocalVoiceDown) {
        lastLocalVoiceDown = localDown;
        if (localDown) startLocalVoice();
        else stopLocalVoice();
    }

    if (adminDown !== lastAdminVoiceDown) {
        lastAdminVoiceDown = adminDown;
        if (adminDown) startAdminVoice();
        else stopAdminVoice();
    }
}, 50);

mp.events.add("playerQuit", (player) => {
    if (!player || player === mp.players.local) return;
    incomingVoice.delete(player.remoteId);
    talkingRemoteIds.delete(Number(player.remoteId));
});

mp.events.add("c:hud:gameplayReady", (state) => {
    if (Boolean(state)) {
        syncWorldClock();
        patchHud({
            info: {
                ...getHudDateTime(),
                ...getStreetInfo(),
                temperature: hudState.info?.temperature ?? HUD_WEATHER.temperature,
                weatherLabel: hudState.info?.weatherLabel ?? HUD_WEATHER.label,
            },
        });
        requestServerHudRefresh(true);
        return;
    }

    lastServerHudRefreshAt = 0;
    stopAllVoice();
    incomingVoice.clear();
    talkingRemoteIds.clear();
});

global.twinkleVoiceState = {
    isTalking(playerOrRemoteId) {
        const remoteId = typeof playerOrRemoteId === "object"
            ? Number(playerOrRemoteId?.remoteId)
            : Number(playerOrRemoteId);

        return talkingRemoteIds.has(remoteId);
    },
    getMode(playerOrRemoteId) {
        const remoteId = typeof playerOrRemoteId === "object"
            ? Number(playerOrRemoteId?.remoteId)
            : Number(playerOrRemoteId);

        return incomingVoice.get(remoteId) || "none";
    },
    isLocalTalking: isAnyVoiceActive,
};

function pushHud(data, show = false) {
    try {
        const previousMicrophone = hudState.microphone || {};
        const previousTasks = hudState.tasks || {};
        const previousPlayer = hudState.player || {};

        hudState = {
            ...hudState,
            ...(data || {})
        };

        if (data?.player) {
            hudState.player = {
                ...previousPlayer,
                ...data.player,
                finance: {
                    ...(previousPlayer.finance || {}),
                    ...(data.player.finance || {}),
                },
                needs: {
                    ...(previousPlayer.needs || {}),
                    ...(data.player.needs || {}),
                },
                gun: data.player.gun
                    ? {
                        ...(previousPlayer.gun || {}),
                        ...data.player.gun,
                    }
                    : previousPlayer.gun,
            };
        }

        if (data?.microphone) {
            hudState.microphone = {
                ...previousMicrophone,
                ...data.microphone
            };
        }

        if (data?.tasks?.merge) {
            const mergedItems = new Map();

            if (Array.isArray(previousTasks.items)) {
                previousTasks.items.forEach((item) => {
                    if (item?.id != null) mergedItems.set(String(item.id), item);
                });
            }

            if (Array.isArray(data.tasks.items)) {
                data.tasks.items.forEach((item) => {
                    if (item?.id == null) return;

                    const key = String(item.id);
                    if (item.hidden) {
                        mergedItems.delete(key);
                        return;
                    }

                    mergedItems.set(key, item);
                });
            }

            hudState.tasks = {
                ...previousTasks,
                ...data.tasks,
                merge: undefined,
                items: Array.from(mergedItems.values()),
            };
        }

        hudState.microphone = {
            ...(hudState.microphone || {}),
            isTalking: isAnyVoiceActive()
        };

        const payload = global.uiState?.patch
            ? global.uiState.patch("hud", hudState, {
                eventName: "twinkle:hud:update",
                globalName: "__TWINKLE_HUD_PAYLOAD__",
                retryKey: "hud:payload",
                push: false
            })
            : hudState;

        hudSnapshot.remember(payload);

        const json = JSON.stringify(payload);

        if (global.uiBrowser?.execute) {
            global.uiBrowser.execute(`
                (() => {

                    if (${show}) {
                        window.dispatchEvent(new CustomEvent("twinkle:hud:show"));
                    }

                    window.dispatchEvent(new CustomEvent("twinkle:hud:update",{
                        detail:${json}
                    }));

                })();
            `);
        }
    } catch (e) {
        console.log("[HUD PUSH]", e);
    }
}

function patchHud(data = {}) {
    const payload = parsePayload(data);

    if (payload.player) {
        payload.player = normalizePlayerHudPayload(payload.player);
    }

    if (payload.microphone) {
        payload.microphone = {
            ...payload.microphone,
            isTalking: isAnyVoiceActive()
        };
    }

    pushHud(payload);
}

function resetHudState() {
    global.interfaceLock?.releaseInteraction?.("hud-contract");
    hudState = {};

    if (global.uiState?.clear) {
        global.uiState.clear("hud");
    }
}

global.resetHudState = resetHudState;

function normalizePlayerHudPayload(player = {}) {
    const nextPlayer = {
        ...player,
    };

    if (
        player.cash != null ||
        player.bank != null ||
        player.money != null
    ) {
        nextPlayer.finance = {
            ...(player.finance || {}),
            ...(player.cash != null || player.money != null
                ? { cash: Number(player.cash ?? player.money ?? 0) }
                : {}),
            ...(player.bank != null ? { bank: Number(player.bank || 0) } : {}),
        };

        delete nextPlayer.cash;
        delete nextPlayer.money;
        delete nextPlayer.bank;
    }

    return nextPlayer;
}

function attachLiveHudInfo(payload = {}) {
    const nextPayload = parsePayload(payload);

    updateServerClock(nextPayload.info || {});

    if (nextPayload.player) {
        nextPayload.player = normalizePlayerHudPayload(nextPayload.player);
    }

    const receivedInfo = nextPayload.info || {};

    return {
        ...nextPayload,
        info: {
            ...receivedInfo,
            ...getHudDateTime(),
            ...getStreetInfo(),
            temperature: receivedInfo.temperature ?? hudState.info?.temperature ?? HUD_WEATHER.temperature,
            weatherLabel: receivedInfo.weatherLabel ?? hudState.info?.weatherLabel ?? HUD_WEATHER.label,
        },
    };
}

function forwardHudAction(remoteEvent, payloadJson = "{}") {
    try {
        mp.events.callRemote(remoteEvent, payloadJson);
    } catch (e) {
        console.log(`[HUD ACTION] ${remoteEvent} error:`, e);
    }
}

function pad(value) {
    return String(value).padStart(2, "0");
}

function updateServerClock(info = {}) {
    const serverEpochMs = Number(info.serverEpochMs);

    if (Number.isFinite(serverEpochMs) && serverEpochMs > 0) {
        serverTimeOffsetMs = serverEpochMs - Date.now();
    }

    if (typeof info.timeZone === "string" && info.timeZone.trim()) {
        serverTimeZone = info.timeZone.trim();
    }
}

function getServerNowParts() {
    const now = new Date(Date.now() + serverTimeOffsetMs);

    try {
        const parts = new Intl.DateTimeFormat("ru-RU", {
            timeZone: serverTimeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        }).formatToParts(now);
        const byType = {};

        parts.forEach((part) => {
            if (part.type !== "literal") byType[part.type] = part.value;
        });

        return {
            year: Number(byType.year || now.getUTCFullYear()),
            month: Number(byType.month || now.getUTCMonth() + 1),
            day: Number(byType.day || now.getUTCDate()),
            hour: Number(byType.hour || now.getUTCHours() + 3) % 24,
            minute: Number(byType.minute || now.getUTCMinutes()),
            second: Number(byType.second || now.getUTCSeconds()),
        };
    } catch {
        return {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            day: now.getDate(),
            hour: now.getHours(),
            minute: now.getMinutes(),
            second: now.getSeconds(),
        };
    }
}

function syncWorldClock(parts = getServerNowParts()) {
    try {
        mp.game.time.setClockTime(parts.hour, parts.minute, parts.second);
    } catch {}

    try {
        mp.game.gameplay.setWeatherTypeNowPersist(HUD_WEATHER.gameWeather);
    } catch {
        try { mp.game.gameplay.setWeatherTypeNow(HUD_WEATHER.gameWeather); } catch {}
    }
}

function getHudDateTime() {
    const now = getServerNowParts();

    return {
        time: `${pad(now.hour)}:${pad(now.minute)}`,
        date: `${pad(now.day)}/${pad(now.month)}/${now.year}`
    };
}

function getStreetInfo() {
    try {
        const position = mp.players.local?.position;
        if (!position) return {};

        const streetHashes = mp.game.pathfind.getStreetNameAtCoord(
            position.x,
            position.y,
            position.z,
            0,
            0
        );
        const streetHash = Array.isArray(streetHashes)
            ? streetHashes[0]
            : (streetHashes?.streetName ?? streetHashes?.x ?? streetHashes ?? 0);
        const crossingHash = Array.isArray(streetHashes)
            ? streetHashes[1]
            : (streetHashes?.crossingRoad ?? streetHashes?.y ?? 0);
        const street = streetHash ? mp.game.ui.getStreetNameFromHashKey(streetHash) : "";
        const crossing = crossingHash ? mp.game.ui.getStreetNameFromHashKey(crossingHash) : "";
        const zoneKey = mp.game.zone.getNameOfZone(position.x, position.y, position.z);
        const zone = zoneKey ? mp.game.ui.getLabelText(zoneKey) : "";

        return {
            street: crossing ? `${street} / ${crossing}` : street,
            zone: zone && zone !== "NULL" ? zone : zoneKey,
        };
    } catch {
        return {};
    }
}

function requestServerHudRefresh(force = false) {
    if (!force && !global.__TWINKLE_GAMEPLAY_READY__) return;

    const now = Date.now();
    if (!force && now - lastServerHudRefreshAt < HUD_SERVER_REFRESH_MS) return;
    lastServerHudRefreshAt = now;

    try {
        mp.events.callRemote("s:hud:syncOnline");
    } catch (error) {
        lastServerHudRefreshAt = 0;
        try { mp.console.logError(`[HUD] Server refresh failed: ${error.message}`); } catch {}
    }
}

setInterval(() => {
    if (!global.__TWINKLE_GAMEPLAY_READY__) return;

    const info = {
        ...getHudDateTime(),
        ...getStreetInfo(),
        temperature: hudState.info?.temperature ?? HUD_WEATHER.temperature,
        weatherLabel: hudState.info?.weatherLabel ?? HUD_WEATHER.label,
    };

    syncWorldClock();
    patchHud({ info });
    requestServerHudRefresh();
}, 1000);

mp.events.add("c:hud:show", (payloadJson = "{}") => {
    resetHudState();
    const payload = attachLiveHudInfo(payloadJson);

    payload.visible = true;

    payload.microphone = {
        ...(payload.microphone || {}),
        isTalking: isAnyVoiceActive()
    };

    if (global.interfaceLock?.showHud) {
        global.interfaceLock.showHud(payload, true);
        return;
    }

    pushHud(payload, true);

});
mp.events.add("c:hud:update", (payloadJson = "{}") => {
    const payload = attachLiveHudInfo(payloadJson);

    payload.microphone = {
        ...(payload.microphone || {}),
        isTalking: isAnyVoiceActive()
    };

    pushHud(payload);
});

mp.events.add("client:hud:setContract", (contractJson = "{}") => {
    const contract = parsePayload(contractJson, null);
    if (contract && contract.enabled !== false) {
        global.interfaceLock?.acquireInteraction?.("hud-contract");
    } else {
        global.interfaceLock?.releaseInteraction?.("hud-contract");
    }

    patchHud({
        contract
    });
});

mp.events.add("c:hud:patch", patchHud);
mp.events.add("c:hud:server", (payloadJson = "{}") => patchHud({ server: parsePayload(payloadJson) }));
mp.events.add("c:hud:player", (payloadJson = "{}") => patchHud({ player: parsePayload(payloadJson) }));
mp.events.add("c:hud:info", (payloadJson = "{}") => patchHud({ info: parsePayload(payloadJson) }));
mp.events.add("c:hud:tasks", (payloadJson = "{}") => patchHud({ tasks: parsePayload(payloadJson) }));
mp.events.add("c:hud:hotkeys", (payloadJson = "{}") => patchHud({ hotkeys: parsePayload(payloadJson) }));
mp.events.add("c:hud:interaction", (payloadJson = "{}") => patchHud({ interaction: parsePayload(payloadJson, null) }));
mp.events.add("c:hud:deal", (payloadJson = "{}") => patchHud({ deal: parsePayload(payloadJson, null) }));
mp.events.add("c:hud:greeting", (payloadJson = "{}") => patchHud({ greeting: parsePayload(payloadJson, null) }));
mp.events.add("c:hud:battle", (payloadJson = "{}") => patchHud({ battle: parsePayload(payloadJson, null) }));
mp.events.add("c:hud:exchange", (payloadJson = "{}") => patchHud({ exchange: parsePayload(payloadJson, null) }));
mp.events.add("c:hud:request", (payloadJson = "{}") => patchHud({ request: parsePayload(payloadJson, null) }));
mp.events.add("c:hud:capture", (payloadJson = "{}") => patchHud({ capture: parsePayload(payloadJson, null) }));
mp.events.add("c:hud:actionCamera", (payloadJson = "{}") => patchHud({ actionCamera: parsePayload(payloadJson, null) }));
mp.events.add("client:money:update", (payload = 0) => {
    const value = typeof payload === "object"
        ? Number(payload.cash ?? payload.money ?? 0)
        : Number(payload || 0);

    patchHud({
        player: {
            finance: {
                cash: Math.max(0, value)
            }
        }
    });
});

mp.events.add("client:bank:update", (payload = 0) => {
    const value = typeof payload === "object"
        ? Number(payload.bank ?? 0)
        : Number(payload || 0);

    patchHud({
        player: {
            finance: {
                bank: Math.max(0, value)
            }
        }
    });
});

mp.events.add("client:donate:update", (payload = 0) => {
    const value = typeof payload === "object"
        ? Number(payload.donate ?? payload.balance ?? 0)
        : Number(payload || 0);

    if (global.uiBrowser?.execute) {
        global.uiBrowser.execute(`
            (() => {
                const donate = ${Math.max(0, value)};
                const previous = window.__F2_MENU_PAYLOAD__ || {};
                const shop = { ...(previous.shop || {}), balance: donate, donate };
                const payload = { ...previous, shop, balance: donate, donate };
                window.__F2_MENU_PAYLOAD__ = payload;
                window.dispatchEvent(new CustomEvent("twinkle:f2:update", { detail: payload }));
                window.dispatchEvent(new CustomEvent("twinkle:donate:update", {
                    detail: { donate }
                }));
                window.TWINKLE_F2?.setPayload?.(payload);
            })();
        `);
    }
});

mp.events.add("hud:exchange:accept", (payloadJson = "{}") => forwardHudAction("s:hud:exchange:accept", payloadJson));
mp.events.add("hud:exchange:decline", (payloadJson = "{}") => forwardHudAction("s:hud:exchange:decline", payloadJson));
mp.events.add("hud:request:accept", (payloadJson = "{}") => forwardHudAction("s:hud:request:accept", payloadJson));
mp.events.add("hud:request:decline", (payloadJson = "{}") => forwardHudAction("s:hud:request:decline", payloadJson));

mp.events.add("c:hud:hide", () => {

    if (global.interfaceLock?.hideHud) {
        global.interfaceLock.hideHud();
        return;
    }

});

initVoiceSettings();

console.log("[HUD/VOICE] Loaded. Local voice: B / Admin voice: F9");
