"use strict";

const ANIM_DICT = "mp_arresting";
const ANIM_NAME = "idle";
const CUFF_MODEL = mp.game.joaat("p_cs_cuffs_02_s");
const CUFF_BONE = 0x188e;
const CUFF_OFFSET = Object.freeze({
  x: -0.02,
  y: 0.063,
  z: 0.0,
});
const CUFF_ROTATION = Object.freeze({
  x: 75.0,
  y: 0.0,
  z: 76.0,
});
const cuffObjects = new Map();
const syncingPlayers = new Set();
let localCuffed = false;

function playerKey(player) {
  return Number(player?.remoteId ?? player?.id ?? -1);
}

function playerExists(player) {
  try {
    return Boolean(player && mp.players.exists(player));
  } catch {
    return false;
  }
}

function isCuffed(player) {
  if (!playerExists(player)) return false;
  return player === mp.players.local
    ? localCuffed || Boolean(player.getVariable("adminCuffed"))
    : Boolean(player.getVariable("adminCuffed"));
}

async function waitForPlayer(player, attempts = 240) {
  for (let i = 0; i < attempts; i += 1) {
    if (!playerExists(player)) return false;
    if (player.handle !== 0) return true;
    await mp.game.waitAsync(0);
  }
  return false;
}

async function loadAnimDict(attempts = 300) {
  mp.game.streaming.requestAnimDict(ANIM_DICT);
  for (let i = 0; i < attempts; i += 1) {
    if (mp.game.streaming.hasAnimDictLoaded(ANIM_DICT)) return true;
    mp.game.streaming.requestAnimDict(ANIM_DICT);
    await mp.game.waitAsync(10);
  }
  return false;
}

async function loadCuffModel(attempts = 300) {
  if (!mp.game.streaming.isModelValid(CUFF_MODEL)) return false;
  mp.game.streaming.requestModel(CUFF_MODEL);
  for (let i = 0; i < attempts; i += 1) {
    if (mp.game.streaming.hasModelLoaded(CUFF_MODEL)) return true;
    mp.game.streaming.requestModel(CUFF_MODEL);
    await mp.game.waitAsync(10);
  }
  return false;
}

function destroyCuffObject(player) {
  const key = playerKey(player);
  const object = cuffObjects.get(key);
  if (!object) return;

  try {
    if (mp.objects.exists(object)) object.destroy();
  } catch {}
  cuffObjects.delete(key);
}

function stopCuffAnimation(player) {
  if (!playerExists(player) || player.handle === 0) return;
  try {
    mp.game.invoke("0xDF1AF8B5D56542FA", player.handle, false);
  } catch {}
  try {
    player.stopAnimTask(ANIM_DICT, ANIM_NAME, 2.0);
  } catch {}
}

function playCuffAnimation(player) {
  if (!playerExists(player) || player.handle === 0) return;
  try {
    mp.game.invoke("0xDF1AF8B5D56542FA", player.handle, true);
  } catch {}
  try {
    if (!player.isPlayingAnim(ANIM_DICT, ANIM_NAME, 3)) {
      player.taskPlayAnim(
        ANIM_DICT,
        ANIM_NAME,
        1.0,
        -8.0,
        -1,
        49,
        0.0,
        false,
        false,
        false
      );
    }
  } catch (error) {
    mp.console.logError(`[ADMIN CUFFS] Animation error: ${error.message}`);
  }
}

function isObjectAttached(object, player) {
  try {
    return Boolean(
      object &&
      mp.objects.exists(object) &&
      object.handle !== 0 &&
      playerExists(player) &&
      player.handle !== 0 &&
      mp.game.invoke("0xEFBE71898A993728", object.handle, player.handle)
    );
  } catch {
    return false;
  }
}

function attachCuffObject(object, player) {
  if (!object || object.handle === 0 || !playerExists(player) || player.handle === 0) {
    return false;
  }

  try {
    const handBone = player.getBoneIndex(CUFF_BONE);
    object.setCollision(false, false);

    object.attachTo(
      player.handle,
      handBone,
      CUFF_OFFSET.x,
      CUFF_OFFSET.y,
      CUFF_OFFSET.z,
      CUFF_ROTATION.x,
      CUFF_ROTATION.y,
      CUFF_ROTATION.z,
      false,
      false,
      false,
      false,
      2,
      true
    );
    return isObjectAttached(object, player);
  } catch (error) {
    mp.console.logError(`[ADMIN CUFFS] Attach error: ${error.message}`);
    return false;
  }
}

async function createCuffObject(player) {
  const key = playerKey(player);
  const current = cuffObjects.get(key);
  if (current) {
    try {
      if (mp.objects.exists(current)) {
        if (!isObjectAttached(current, player)) attachCuffObject(current, player);
        return current;
      }
    } catch {}
    cuffObjects.delete(key);
  }

  try {
    const object = mp.objects.new(CUFF_MODEL, player.position, {
      dimension: player.dimension,
      alpha: 255,
    });
    cuffObjects.set(key, object);

    // mp.objects.new возвращается раньше, чем GTA создаёт handle объекта.
    // Если прикреплять сразу, вызов молча игнорируется и наручники падают.
    for (let i = 0; i < 180; i += 1) {
      if (!playerExists(player) || !isCuffed(player)) {
        destroyCuffObject(player);
        return null;
      }
      if (object.handle !== 0 && attachCuffObject(object, player)) return object;
      await mp.game.waitAsync(0);
    }

    destroyCuffObject(player);
    mp.console.logError("[ADMIN CUFFS] Prop handle/attachment timeout");
    return null;
  } catch (error) {
    mp.console.logError(`[ADMIN CUFFS] Prop error: ${error.message}`);
    destroyCuffObject(player);
    return null;
  }
}

async function syncCuffedPlayer(player) {
  const key = playerKey(player);
  if (key < 0 || syncingPlayers.has(key)) return;
  syncingPlayers.add(key);

  try {
    if (!isCuffed(player)) {
      destroyCuffObject(player);
      stopCuffAnimation(player);
      return;
    }

    const [ready, animationReady, modelReady] = await Promise.all([
      waitForPlayer(player),
      loadAnimDict(),
      loadCuffModel(),
    ]);

    if (!ready || !playerExists(player) || !isCuffed(player)) return;
    if (animationReady) playCuffAnimation(player);
    if (modelReady) await createCuffObject(player);
  } catch (error) {
    mp.console.logError(`[ADMIN CUFFS] Sync error: ${error.message}`);
  } finally {
    syncingPlayers.delete(key);
  }
}

function applyState(player, state) {
  if (!player) return;
  if (player === mp.players.local) localCuffed = Boolean(state);

  if (!state) {
    destroyCuffObject(player);
    stopCuffAnimation(player);
    return;
  }

  void syncCuffedPlayer(player);
}

mp.events.addDataHandler("adminCuffed", (entity, value) => {
  if (entity?.type === "player") applyState(entity, Boolean(value));
});

mp.events.add("client:adminCuffs:set", (state) => {
  applyState(mp.players.local, Boolean(state));
});

mp.events.add("entityStreamIn", (entity) => {
  if (entity?.type === "player" && entity.getVariable("adminCuffed")) {
    void syncCuffedPlayer(entity);
  }
});

mp.events.add("entityStreamOut", (entity) => {
  if (entity?.type === "player") destroyCuffObject(entity);
});

mp.events.add("playerQuit", (player) => destroyCuffObject(player));

mp.events.add("render", () => {
  mp.players.forEachInStreamRange((player) => {
    if (!isCuffed(player)) return;

    const object = cuffObjects.get(playerKey(player));
    const objectMissing = !object || !mp.objects.exists(object);
    const objectDetached = !objectMissing && !isObjectAttached(object, player);
    let animationMissing = true;
    try {
      animationMissing = !player.isPlayingAnim(ANIM_DICT, ANIM_NAME, 3);
    } catch {}

    if (objectMissing || objectDetached || animationMissing) void syncCuffedPlayer(player);
  });

  if (!isCuffed(mp.players.local)) return;
  localCuffed = true;

  const localObject = cuffObjects.get(playerKey(mp.players.local));
  if (
    !localObject ||
    !mp.objects.exists(localObject) ||
    !isObjectAttached(localObject, mp.players.local)
  ) {
    void syncCuffedPlayer(mp.players.local);
  }

  [21, 22, 24, 25, 37, 44, 45, 47, 58, 75, 140, 141, 142, 143, 257, 263, 264]
    .forEach((control) => mp.game.controls.disableControlAction(0, control, true));
});

void loadAnimDict();
void loadCuffModel();
console.log("[ADMIN CUFFS] Client loaded");
