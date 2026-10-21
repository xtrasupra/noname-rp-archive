"use strict";

const bindKey = global.bindKey || ((key, hold, cb) => mp.keys.bind(key, hold, cb));
const CUFF_KEY = 0x36;
const ESCORT_KEY = 0x37;
const ESCORT_DICT = "majestic_animations_custom";
const OFFICER_ANIM = "arrest_owner";
const SUSPECT_ANIM = "arrest_follower";
const activeEscorts = new Set();

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

async function loadAnimDict(dict, attempts = 300) {
  mp.game.streaming.requestAnimDict(dict);
  for (let i = 0; i < attempts; i += 1) {
    if (mp.game.streaming.hasAnimDictLoaded(dict)) return true;
    mp.game.streaming.requestAnimDict(dict);
    await mp.game.waitAsync(10);
  }
  return false;
}

function remotePlayer(id) {
  const remoteId = Number(id);
  if (!Number.isInteger(remoteId) || remoteId < 0) return null;
  try {
    return mp.players.atRemoteId(remoteId) || null;
  } catch {
    return null;
  }
}

function stopEscortFor(player) {
  if (!playerExists(player) || player.handle === 0) return;
  activeEscorts.delete(playerKey(player));

  try {
    if (player.isAttached()) player.detach(true, true);
  } catch {}

  try {
    player.stopAnimTask(ESCORT_DICT, OFFICER_ANIM, 2.0);
    player.stopAnimTask(ESCORT_DICT, SUSPECT_ANIM, 2.0);
  } catch {}
}

function playLoopAnim(player, name) {
  if (!playerExists(player) || player.handle === 0) return;
  try {
    if (!player.isPlayingAnim(ESCORT_DICT, name, 3)) {
      player.taskPlayAnim(ESCORT_DICT, name, 8.0, -8.0, -1, 49, 0.0, false, false, false);
    }
  } catch (error) {
    mp.console.logError(`[FORCE CUFFS] animation ${name}: ${error.message}`);
  }
}

function attachSuspect(officer, suspect) {
  if (!playerExists(officer) || !playerExists(suspect)) return;
  if (officer.handle === 0 || suspect.handle === 0) return;

  try {
    if (!suspect.isAttachedTo(officer.handle)) {
      suspect.attachTo(
        officer.handle,
        10000,
        0.0,
        0.6,
        0.0,
        0.0,
        0.0,
        0.0,
        true,
        false,
        false,
        false,
        2,
        true
      );
    }
  } catch (error) {
    mp.console.logError(`[FORCE CUFFS] attach: ${error.message}`);
  }

  try {
    const boneRotation = mp.game.entity.getBoneRotation(officer.handle, 91);
    suspect.setHeading(boneRotation.z - 90.0);
    officer.setIkTarget(4, suspect.handle, 24818, 0.0, -0.12, -0.1, 0, -1, -1);
    officer.setIkTarget(3, suspect.handle, 61007, -0.1, -0.06, -0.075, 0, 200, -1);
  } catch {}
}

async function syncEscort(officer, suspect) {
  if (!playerExists(officer) || !playerExists(suspect)) return;
  activeEscorts.add(playerKey(officer));
  activeEscorts.add(playerKey(suspect));

  if (!(await loadAnimDict(ESCORT_DICT))) {
    mp.console.logError("[FORCE CUFFS] majestic_animations_custom not loaded");
    return;
  }

  playLoopAnim(officer, OFFICER_ANIM);
  playLoopAnim(suspect, SUSPECT_ANIM);
  attachSuspect(officer, suspect);
}

function syncFromVariables(entity) {
  if (!playerExists(entity)) return;

  const officerId = Number(entity.getVariable("twinkleEscortOfficer") ?? -1);
  if (officerId >= 0) {
    const officer = remotePlayer(officerId);
    if (officer) void syncEscort(officer, entity);
    return;
  }

  const suspectId = Number(entity.getVariable("twinkleEscortTarget") ?? -1);
  if (suspectId >= 0) {
    const suspect = remotePlayer(suspectId);
    if (suspect) void syncEscort(entity, suspect);
    return;
  }

  stopEscortFor(entity);
}

bindKey(CUFF_KEY, false, () => {
  mp.events.callRemote("server:forceCuffs:toggleCuffs");
});

bindKey(ESCORT_KEY, false, () => {
  mp.events.callRemote("server:forceCuffs:toggleEscort");
});

mp.events.addDataHandler("twinkleEscortOfficer", (entity) => {
  if (entity?.type === "player") syncFromVariables(entity);
});

mp.events.addDataHandler("twinkleEscortTarget", (entity) => {
  if (entity?.type === "player") syncFromVariables(entity);
});

mp.events.add("client:forceCuffs:startEscort", (otherRemoteId) => {
  const other = remotePlayer(otherRemoteId);
  const local = mp.players.local;
  if (!other) return;

  if (Number(local.getVariable("twinkleEscortOfficer") ?? -1) === Number(otherRemoteId)) {
    void syncEscort(other, local);
  } else {
    void syncEscort(local, other);
  }
});

mp.events.add("client:forceCuffs:stopEscort", () => {
  stopEscortFor(mp.players.local);
});

mp.events.add("entityStreamIn", (entity) => {
  if (entity?.type === "player") syncFromVariables(entity);
});

mp.events.add("entityStreamOut", (entity) => {
  if (entity?.type === "player") stopEscortFor(entity);
});

mp.events.add("playerQuit", (player) => stopEscortFor(player));

mp.events.add("playerReady", () => {
  void loadAnimDict(ESCORT_DICT);
});

mp.events.add("render", () => {
  mp.players.forEachInStreamRange((player) => {
    const officerId = Number(player.getVariable("twinkleEscortOfficer") ?? -1);
    if (officerId >= 0) {
      const officer = remotePlayer(officerId);
      if (officer) void syncEscort(officer, player);
    }
  });

  const local = mp.players.local;
  const localOfficer = Number(local.getVariable("twinkleEscortOfficer") ?? -1);
  if (localOfficer >= 0) {
    [21, 22, 24, 25, 37, 44, 45, 47, 58, 75, 140, 141, 142, 143, 257, 263, 264]
      .forEach((control) => mp.game.controls.disableControlAction(0, control, true));
  }
});

void loadAnimDict(ESCORT_DICT);
console.log("[FORCE CUFFS] Client loaded");
