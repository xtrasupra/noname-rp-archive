"use strict";

const STOP_ANIMATION_KEY = 0x58; // X

let activeAnimationId = null;
const remoteAnimations = new Map();

function parseJson(value, fallback = {}) {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function waitAnimDict(dict, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const startedAt = Date.now();

    try {
      mp.game.streaming.requestAnimDict(dict);
    } catch {
      resolve(false);
      return;
    }

    const timer = setInterval(() => {
      try {
        if (mp.game.streaming.hasAnimDictLoaded(dict)) {
          clearInterval(timer);
          resolve(true);
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      } catch {
        clearInterval(timer);
        resolve(false);
      }
    }, 50);
  });
}

function setAnimationHotkeyHint(isActive) {
  const items = isActive
    ? [...BASE_HUD_HOTKEYS, { name: "Cancel animation", key: "X" }]
    : BASE_HUD_HOTKEYS;

  try {
    mp.events.call("c:hud:hotkeys", JSON.stringify({
      isVisible: true,
      items,
    }));
  } catch {}
}

function getPlayerByRemoteId(remoteId) {
  const id = Number(remoteId);

  if (!Number.isFinite(id)) return null;

  try {
    return mp.players.atRemoteId(id);
  } catch {
    return null;
  }
}

async function playAnimationOnPlayer(player, payload) {
  const dict = String(payload?.dict || "");
  const name = String(payload?.name || "");

  if (!dict || !name || !player) return;

  const loaded = await waitAnimDict(dict);
  if (!loaded) {
    try {
      mp.console.logError(`[ANIMATIONS] Dict not loaded: ${dict}`);
    } catch {}
    return;
  }

  try {
    if (!mp.players.exists(player)) return;

    player.clearTasksImmediately();
    player.taskPlayAnim(
      dict,
      name,
      Number(payload.speed || 8),
      Number(payload.speedMultiplier || -8),
      Number(payload.duration || -1),
      Number(payload.flags || 49),
      0,
      false,
      false,
      false
    );

    if (player === mp.players.local) {
      activeAnimationId = String(payload.id || name);
      setAnimationHotkeyHint(true);
    }
  } catch (error) {
    try {
      mp.console.logError(`[ANIMATIONS] Play error: ${error.message}`);
    } catch {}
  }
}

async function playAnimation(payloadJson = "{}") {
  const payload = parseJson(payloadJson, {});
  const playerId = Number(payload.playerId);
  const player = Number.isFinite(playerId)
    ? getPlayerByRemoteId(playerId)
    : mp.players.local;

  if (Number.isFinite(playerId)) {
    remoteAnimations.set(playerId, payload);
  }

  if (!player) return;

  await playAnimationOnPlayer(player, payload);
}

function stopAnimation(payloadJson = "{}") {
  const payload = parseJson(payloadJson, {});
  const playerId = Number(payload.playerId);
  const player = Number.isFinite(playerId)
    ? getPlayerByRemoteId(playerId)
    : mp.players.local;

  if (Number.isFinite(playerId)) {
    remoteAnimations.delete(playerId);
  }

  try {
    if (player && mp.players.exists(player)) {
      player.clearTasks();
      player.clearTasksImmediately();
    }
  } catch {}

  if (!player || player === mp.players.local) {
    activeAnimationId = null;
    setAnimationHotkeyHint(false);
  }
}

mp.events.add("c:animations:set", (payloadJson = "{}") => {
  const payload = parseJson(payloadJson, {});

  try {
    if (global.ui?.emit) {
      global.ui.emit("f2Menu", "twinkle:f2:animations:set", payload, {
        globalName: "__TWINKLE_F2_ANIMATIONS__",
        retryKey: "f2Menu:animations",
      });
      return;
    }

    global.uiBrowser?.execute?.(`
      window.dispatchEvent(new CustomEvent("twinkle:f2:animations:set", {
        detail: ${JSON.stringify(payload)}
      }));
    `);
  } catch {}
});

mp.events.add("c:animations:play", playAnimation);
mp.events.add("c:animations:stop", stopAnimation);
mp.events.add("c:animations:error", (message = "Animation error.") => {
  try {
    global.ui?.notify?.(String(message), "error");
  } catch {}
});

mp.events.add("f2:animation:play", (animationId) => {
  mp.events.callRemote("s:animations:play", String(animationId || ""));
});

mp.events.add("f2:animation:stop", () => {
  mp.events.callRemote("s:animations:stop");
});

(global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback)))(
  STOP_ANIMATION_KEY,
  false,
  () => {
    if (!activeAnimationId) return;
    mp.events.callRemote("s:animations:stop");
  },
  {
    allowWhenBlocked: true,
    closeChatBefore: false,
  }
);

mp.events.add("f2:animation:favorite", (animationId, enabled) => {
  mp.events.callRemote("s:animations:favorite", String(animationId || ""), Boolean(enabled));
});

mp.events.add("entityStreamIn", (entity) => {
  try {
    if (!entity || entity.type !== "player") return;

    const synced = entity.getVariable("twinkleAnimation");
    const payload = parseJson(synced, null);

    if (payload && payload.dict && payload.name) {
      payload.playerId = Number(entity.remoteId);
      remoteAnimations.set(Number(entity.remoteId), payload);
      playAnimationOnPlayer(entity, payload);
      return;
    }

    const cached = remoteAnimations.get(Number(entity.remoteId));
    if (cached) {
      playAnimationOnPlayer(entity, cached);
    }
  } catch {}
});

mp.events.add("entityStreamOut", (entity) => {
  try {
    if (!entity || entity.type !== "player") return;
    remoteAnimations.delete(Number(entity.remoteId));
  } catch {}
});

console.log("[ANIMATIONS] Loaded");
