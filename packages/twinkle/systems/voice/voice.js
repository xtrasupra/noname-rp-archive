"use strict";

const { getAdminLevel, getUuid } = require("../../utils/player.js");
const authFlow = require("../../auth/authFlow.js");
const muteService = require("../admin/mute.service.js");

const LOCAL_VOICE_RANGE = 15.0;
const VOICE_UPDATE_INTERVAL = 350;
const VOICE_START_COOLDOWN_MS = 250;
const activeLinks = new Map();
const lastVoiceStartAt = new Map();

function isValidPlayer(player) {
    return Boolean(player && mp.players.exists(player));
}

function isAdmin(player) {
    return getAdminLevel(player) > 0;
}

function canUseGameplayVoice(player) {
    return Boolean(
        isValidPlayer(player) &&
        player.auth === true &&
        player.character &&
        player.voiceMuteHydrated === true &&
        authFlow.isPhase(player, authFlow.PHASE.IN_GAME) &&
        !isVoiceMuted(player)
    );
}

function canListenToGameplayVoice(player) {
    return Boolean(
        isValidPlayer(player) &&
        player.auth === true &&
        player.character &&
        authFlow.isPhase(player, authFlow.PHASE.IN_GAME)
    );
}

function isVoiceMuted(player) {
    return Boolean(
        player?.getVariable?.("isMuted") ||
        player?.getVariable?.("vmuted") ||
        player?.isMuted
    );
}

function distance(a, b) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function linkKey(speaker, listener) {
    return `${speaker.id}:${listener.id}`;
}

function desiredMode(speaker, listener) {
    if (!isValidPlayer(speaker) || !isValidPlayer(listener) || speaker === listener) {
        return null;
    }
    if (!canListenToGameplayVoice(listener)) return null;
    if (isVoiceMuted(speaker)) return null;

    if (speaker.adminVoiceActive === true) {
        return isAdmin(speaker) && isAdmin(listener) ? "admin" : null;
    }

    if (speaker.localVoiceActive !== true) return null;
    if (Number(speaker.dimension) !== Number(listener.dimension)) return null;
    if (distance(speaker.position, listener.position) > LOCAL_VOICE_RANGE) return null;
    return "local";
}

function syncVoiceState(player) {
    if (!player) return;

    const mode = player.adminVoiceActive === true
        ? "admin"
        : player.localVoiceActive === true
            ? "local"
            : "none";

    try {
        player.setVariable("voiceActive", mode !== "none");
        player.setVariable("voiceMode", mode);
    } catch {}
}

function canStartVoice(player, mode) {
    const now = Date.now();
    const key = `${Number(player?.id)}:${String(mode)}`;
    const previous = lastVoiceStartAt.get(key) || 0;

    if (now - previous < VOICE_START_COOLDOWN_MS) return false;

    lastVoiceStartAt.set(key, now);
    return true;
}

function notifyListener(listener, speaker, mode, enabled) {
    try {
        listener.call("client:voice:speaker", [
            Number(speaker.id),
            String(mode || "none"),
            Boolean(enabled),
            LOCAL_VOICE_RANGE,
        ]);
    } catch (error) {
        console.error("[VOICE] client:voice:speaker:", error.message);
    }
}

function enableLink(speaker, listener, mode) {
    const key = linkKey(speaker, listener);
    const previousMode = activeLinks.get(key);
    if (previousMode === mode) return;

    if (previousMode) {
        try { speaker.disableVoiceTo(listener); } catch {}
        notifyListener(listener, speaker, previousMode, false);
    }

    try {
        speaker.enableVoiceTo(listener);
        activeLinks.set(key, mode);
        notifyListener(listener, speaker, mode, true);
    } catch (error) {
        console.error("[VOICE] enable link:", error.message);
    }
}

function disableLink(speaker, listener) {
    const key = linkKey(speaker, listener);
    const previousMode = activeLinks.get(key);
    if (!previousMode) return;

    activeLinks.delete(key);
    try { speaker.disableVoiceTo(listener); } catch {}
    notifyListener(listener, speaker, previousMode, false);
}

function updateSpeaker(speaker) {
    if (!isValidPlayer(speaker)) return;

    mp.players.forEach((listener) => {
        if (!isValidPlayer(listener) || listener === speaker) return;
        const mode = desiredMode(speaker, listener);
        if (mode) enableLink(speaker, listener, mode);
        else disableLink(speaker, listener);
    });
}

function stopSpeaker(player) {
    if (!player) return;
    player.localVoiceActive = false;
    player.adminVoiceActive = false;
    syncVoiceState(player);
    if (isValidPlayer(player)) updateSpeaker(player);
}

function cleanupPlayer(player) {
    if (!player) return;

    mp.players.forEach((other) => {
        if (!isValidPlayer(other) || other === player) return;
        disableLink(player, other);
        disableLink(other, player);
    });

    for (const key of Array.from(activeLinks.keys())) {
        const [speakerId, listenerId] = key.split(":").map(Number);
        if (speakerId === player.id || listenerId === player.id) activeLinks.delete(key);
    }

    lastVoiceStartAt.delete(`${Number(player.id)}:local`);
    lastVoiceStartAt.delete(`${Number(player.id)}:admin`);
}

mp.events.add("playerJoin", (player) => {
    player.localVoiceActive = false;
    player.adminVoiceActive = false;
    player.voiceMuteHydrated = false;
    syncVoiceState(player);
});

mp.events.add("playerQuit", cleanupPlayer);

mp.events.add("server:voice:local:start", (player) => {
    if (!canUseGameplayVoice(player)) {
        stopSpeaker(player);
        return;
    }
    if (player.localVoiceActive === true && player.adminVoiceActive !== true) return;
    if (!canStartVoice(player, "local")) return;

    player.adminVoiceActive = false;
    player.localVoiceActive = true;
    syncVoiceState(player);
    updateSpeaker(player);
});

mp.events.add("server:voice:local:stop", (player) => {
    if (!isValidPlayer(player)) return;
    if (player.localVoiceActive !== true) return;

    player.localVoiceActive = false;
    syncVoiceState(player);
    updateSpeaker(player);
});

mp.events.add("server:voice:admin:start", (player) => {
    if (!canUseGameplayVoice(player) || !isAdmin(player)) {
        stopSpeaker(player);
        return;
    }
    if (player.adminVoiceActive === true) return;
    if (!canStartVoice(player, "admin")) return;

    player.localVoiceActive = false;
    player.adminVoiceActive = true;
    syncVoiceState(player);
    updateSpeaker(player);
});

mp.events.add("server:voice:admin:stop", (player) => {
    if (!isValidPlayer(player)) return;
    if (player.adminVoiceActive !== true) return;

    player.adminVoiceActive = false;
    syncVoiceState(player);
    updateSpeaker(player);
});

mp.events.add("twinkle:character:loaded", (player) => {
    const characterUuid = getUuid(player);

    player.localVoiceActive = false;
    player.adminVoiceActive = false;
    player.voiceMuteHydrated = false;
    cleanupPlayer(player);
    syncVoiceState(player);

    muteService.checkMuteOnJoin(player).then(() => {
        if (!isValidPlayer(player) || getUuid(player) !== characterUuid) return;

        player.voiceMuteHydrated = true;

        try {
            player.call("client:voice:ready", [LOCAL_VOICE_RANGE, getAdminLevel(player)]);
        } catch {}
    }).catch((error) => {
        console.error(
            `[VOICE] Mute hydration failed for character ${characterUuid}:`,
            error?.message || error
        );
    });
});

setInterval(() => {
    mp.players.forEach((speaker) => {
        if (speaker?.localVoiceActive === true || speaker?.adminVoiceActive === true) {
            if (!canUseGameplayVoice(speaker)) {
                stopSpeaker(speaker);
                return;
            }
            updateSpeaker(speaker);
        }
    });
}, VOICE_UPDATE_INTERVAL);

console.log("[VOICE] Loaded. Proximity: B / Admin channel: F9");
