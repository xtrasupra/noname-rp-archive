"use strict";

const bindKey = global.bindKey || ((key, hold, cb) => mp.keys.bind(key, hold, cb));

const WAYPOINT_KEY = 0x73; // F4
const FREECAM_KEY = 0x74; // F5
const ALT_KEY = 0x12;
const SHIFT_KEY = 0x10;
const CTRL_KEY = 0x11;
const UP_KEY = 0x45; // E
const DOWN_KEY = 0x51; // Q
const WAYPOINT_BLIP_TYPE = 8;

const FREECAM_SYNC_INTERVAL = 200;
const FREECAM_BASE_STEP = 1.0;
const FREECAM_FAST_MULTIPLIER = 4;
const FREECAM_STREAM_OFFSET_Z = 50;

let freeCam = null;
let syncTimer = 0;
let businessPreviewVisible = false;
let waypointTeleporting = false;
let freeCamTogglePending = false;

function getPlayer() {
  return mp.players.local;
}

function getAdminLevel() {
  const player = getPlayer();

  try {
    return Number(
      player?.getVariable?.("adminLevel") ||
      player?.getVariable?.("admin") ||
      0
    ) || 0;
  } catch {
    return 0;
  }
}

function isAdmin() {
  return getAdminLevel() >= 1;
}

function notify(message, variant = "info", duration = 4500) {
  const text = String(message ?? "").trim();
  if (!text) return false;

  try {
    if (typeof global.interfaceLock?.notify !== "function") return false;
    global.interfaceLock.notify(text, variant, duration);
    return true;
  } catch (e) {
    console.log("[ADMIN UI] notification error:", e.message);
    return false;
  }
}

function getNormalizedVector(vector) {
  const magnitude = Math.sqrt(
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
  );

  if (magnitude <= 0.0001) {
    return new mp.Vector3(0, 0, 0);
  }

  return new mp.Vector3(
    vector.x / magnitude,
    vector.y / magnitude,
    vector.z / magnitude
  );
}

function getCrossProduct(first, second) {
  return new mp.Vector3(
    first.y * second.z - first.z * second.y,
    first.z * second.x - first.x * second.z,
    first.x * second.y - first.y * second.x
  );
}

function setEntityGhost(entity, enabled) {
  if (!entity || !entity.handle) return;

  try {
    entity.setAlpha(enabled ? 0 : 255);
    entity.setVisible(!enabled, false);
    entity.setCollision(!enabled, !enabled);
  } catch (e) {
    console.log("[ADMIN FREECAM] ghost error:", e.message);
  }
}

function setPlayerState(state) {
  const player = getPlayer();
  if (!player || !player.handle) return;

  try {
    const enabled = Boolean(state);

    player.setInvincible(enabled || Boolean(freeCam));
    player.setAlpha((enabled || freeCam) && !businessPreviewVisible ? 0 : 255);
    if (businessPreviewVisible) player.setVisible(true, false);
  } catch {}
}

function setLocalPlayerFreeCamState(enabled) {
  const player = getPlayer();
  if (!player || !player.handle) return;

  try {
    player.freezePosition(Boolean(enabled));
    player.setInvincible(Boolean(enabled));
    player.setVelocity(0, 0, 0);
    setEntityGhost(player, businessPreviewVisible ? false : Boolean(enabled));
  } catch (e) {
    console.log("[ADMIN FREECAM] player state error:", e.message);
  }
}

function startFreeCam() {
  if (freeCam) return;

  if (waypointTeleporting) {
    // The server already enabled the flag, so immediately return it to the
    // disabled state instead of mixing FreeCam with an active teleport.
    try {
      mp.events.callRemote("admin:fly:toggle");
    } catch {}
    return;
  }

  const player = getPlayer();
  if (!player || !player.handle) return;

  try {
    const position = player.position;
    const rotation = mp.game.cam.getGameplayCamRot(2);

    freeCam = mp.cameras.new(
      "default",
      new mp.Vector3(position.x, position.y, position.z),
      rotation,
      45
    );

    freeCam.setActive(true);
    freeCam.setFov(45);
    mp.game.cam.renderScriptCams(true, false, 0, true, false);
    setLocalPlayerFreeCamState(true);
    syncTimer = 0;

    notify(
      "FreeCam включена. WASD — движение, E/Q — высота, Shift/Ctrl — скорость.",
      "success"
    );
  } catch (e) {
    freeCam = null;
    setLocalPlayerFreeCamState(false);
    console.log("[ADMIN FREECAM] start error:", e.message);

    try {
      mp.events.callRemote("admin:fly:toggle");
    } catch {}
  }
}

function stopFreeCam() {
  const player = getPlayer();
  let destination = null;
  let heading = null;

  if (freeCam) {
    try {
      destination = freeCam.getCoord();
      heading = freeCam.getRot(2).z;
    } catch {}

    try {
      freeCam.destroy(true);
    } catch {}

    freeCam = null;
  }

  try {
    mp.game.cam.renderScriptCams(false, false, 0, true, false);
  } catch {}

  if (player && player.handle && destination) {
    try {
      player.setCoordsNoOffset(
        Number(destination.x),
        Number(destination.y),
        Number(destination.z),
        false,
        false,
        false
      );
      player.setHeading(Number(heading) || 0);
      mp.events.callRemote(
        "admin:fly:finish",
        Number(destination.x),
        Number(destination.y),
        Number(destination.z)
      );
    } catch (e) {
      console.log("[ADMIN FREECAM] finish position error:", e.message);
    }
  }

  setLocalPlayerFreeCamState(false);

  if (destination) {
    notify("FreeCam выключена.", "info");
  }
}

function disableFreeCamControls() {
  const controls = [
    1, 2, 21, 22, 24, 25, 30, 31, 32, 33, 34, 35, 36, 38, 44,
    218, 219, 220, 221,
  ];

  for (const control of controls) {
    mp.game.controls.disableControlAction(0, control, true);
  }
}

function moveFreeCam() {
  if (!freeCam) return;

  if (
    mp.gui.cursor.visible ||
    global.interfaceLock?.isControlsBlocked?.()
  ) {
    return;
  }

  const player = getPlayer();
  if (!player || !player.handle) return;

  disableFreeCamControls();

  try {
    const rotation = freeCam.getRot(2);
    const position = freeCam.getCoord();
    const direction = freeCam.getDirection();
    const normalizedDirection = getNormalizedVector(direction);
    const rightVector = getCrossProduct(
      normalizedDirection,
      new mp.Vector3(0, 0, 1)
    );

    const fastMode = mp.keys.isDown(SHIFT_KEY);
    const fastMultiplier = fastMode ? FREECAM_FAST_MULTIPLIER : 1;
    const slowMultiplier = !fastMode && mp.keys.isDown(CTRL_KEY) ? 0.2 : 1;
    const frameTime = Math.max(0.001, Math.min(0.05, mp.game.misc.getFrameTime()));
    const frameScale = frameTime * 60;
    const movementStep = FREECAM_BASE_STEP * fastMultiplier * slowMultiplier * frameScale;

    const lookX = mp.game.controls.getDisabledControlNormal(0, 220);
    const lookY = mp.game.controls.getDisabledControlNormal(0, 221);
    const moveX = mp.game.controls.getDisabledControlNormal(0, 218);
    const moveY = mp.game.controls.getDisabledControlNormal(0, 219);

    let upMovement = 0;
    if (mp.keys.isDown(UP_KEY)) upMovement += movementStep;
    if (mp.keys.isDown(DOWN_KEY)) upMovement -= movementStep;

    const nextPosition = new mp.Vector3(
      position.x - direction.x * moveY * movementStep + rightVector.x * moveX * movementStep,
      position.y - direction.y * moveY * movementStep + rightVector.y * moveX * movementStep,
      position.z - direction.z * moveY * movementStep + rightVector.z * moveX * movementStep + upMovement
    );

    const nextPitch = Math.max(-89, Math.min(89, rotation.x + lookY * -5));
    const nextHeading = rotation.z + lookX * -5;

    freeCam.setCoord(nextPosition.x, nextPosition.y, nextPosition.z);
    freeCam.setRot(nextPitch, 0, nextHeading, 2);

    const streamPosition = new mp.Vector3(
      nextPosition.x,
      nextPosition.y,
      nextPosition.z - FREECAM_STREAM_OFFSET_Z
    );

    player.setCoordsNoOffset(
      streamPosition.x,
      streamPosition.y,
      streamPosition.z,
      false,
      false,
      false
    );
    player.setRotation(0, 0, nextHeading, 0, true);
    player.setVelocity(0, 0, 0);

    const now = Date.now();
    if (now - syncTimer >= FREECAM_SYNC_INTERVAL) {
      syncTimer = now;
      mp.events.callRemote(
        "admin:fly:syncPosition",
        streamPosition.x,
        streamPosition.y,
        streamPosition.z
      );
    }
  } catch (e) {
    console.log("[ADMIN FREECAM] render error:", e.message);
  }
}

function getWaypointPosition() {
  try {
    let waypointType = WAYPOINT_BLIP_TYPE;
    try {
      const nativeWaypointType = Number(mp.game.ui.getWaypointBlipEnumId?.());
      if (Number.isFinite(nativeWaypointType) && nativeWaypointType >= 0) waypointType = nativeWaypointType;
    } catch {}
    const blip = mp.game.ui.getFirstBlipInfoId(waypointType);
    if (!mp.game.ui.doesBlipExist(blip)) return null;

    const position = mp.game.ui.getBlipInfoIdCoord(blip);
    const x = Number(position?.x);
    const y = Number(position?.y);
    const z = Number(position?.z);

    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return {
      x,
      y,
      z: Number.isFinite(z) && z !== 0 ? z : 30,
    };
  } catch (e) {
    console.log("[ADMIN WAYPOINT] read error:", e.message);
    return null;
  }
}

function getTeleportEntity() {
  const player = getPlayer();
  if (!player || !player.handle) return null;

  return player.vehicle && player.vehicle.handle ? player.vehicle : player;
}

function setTeleportPosition(x, y, z) {
  const entity = getTeleportEntity();
  if (!entity) return false;

  const position = {
    x: Number(x),
    y: Number(y),
    z: Number(z),
  };

  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    return false;
  }

  try {
    entity.setVelocity(0, 0, 0);
    entity.setCoordsNoOffset(
      position.x,
      position.y,
      position.z,
      false,
      false,
      false
    );
    mp.events.callRemote(
      "admin:waypoint:teleport",
      position.x,
      position.y,
      position.z
    );
    return true;
  } catch (e) {
    console.log("[ADMIN WAYPOINT] teleport error:", e.message);
    return false;
  }
}

function requestCollision(x, y, z) {
  try {
    mp.game.streaming.requestCollisionAtCoord(Number(x), Number(y), Number(z));
  } catch {}
}

function getGroundZ(x, y, sourceZ) {
  try {
    requestCollision(x, y, sourceZ);

    const result = mp.game.gameplay.getGroundZFor3dCoord(
      Number(x),
      Number(y),
      Number(sourceZ),
      false,
      false
    );

    if (typeof result === "boolean") return null;

    const groundZ = Number(result?.z ?? result);
    return Number.isFinite(groundZ) ? groundZ : null;
  } catch {
    return null;
  }
}

function teleportToWaypoint() {
  if (!isAdmin() || waypointTeleporting || mp.keys.isDown(ALT_KEY)) return;

  if (freeCam || freeCamTogglePending) {
    notify("Сначала выключите FreeCam клавишей F5.", "warning");
    return;
  }

  const waypoint = getWaypointPosition();
  if (!waypoint) {
    notify("Поставьте метку на карте.", "warning");
    return;
  }

  waypointTeleporting = true;
  const initialZ = waypoint.z + 3;

  requestCollision(waypoint.x, waypoint.y, initialZ);
  if (!setTeleportPosition(waypoint.x, waypoint.y, initialZ)) {
    waypointTeleporting = false;
    return;
  }

  setTimeout(() => {
    const entity = getTeleportEntity();
    const current = entity?.position || waypoint;
    const firstGroundZ = getGroundZ(current.x, current.y, current.z);

    if (firstGroundZ !== null) {
      setTeleportPosition(current.x, current.y, firstGroundZ);
    }

    setTimeout(() => {
      const settledEntity = getTeleportEntity();
      const settled = settledEntity?.position || current;
      const finalGroundZ = getGroundZ(settled.x, settled.y, settled.z + 1000);

      if (finalGroundZ !== null) {
        setTeleportPosition(settled.x, settled.y, finalGroundZ);
      }

      waypointTeleporting = false;
      notify("Телепорт по метке выполнен.", "success");
    }, 200);
  }, 600);
}

mp.events.add("setPlayerState", (state) => {
  setPlayerState(state);
});

mp.events.add("business:preview:visibility", (active) => {
  businessPreviewVisible = Boolean(active);
  const player = getPlayer();
  if (!player || !player.handle) return;

  if (businessPreviewVisible) {
    setEntityGhost(player, false);
    return;
  }

  setEntityGhost(player, Boolean(freeCam));
  try {
    player.freezePosition(Boolean(freeCam));
  } catch {}
});

bindKey(WAYPOINT_KEY, false, teleportToWaypoint);

bindKey(FREECAM_KEY, false, () => {
  if (!isAdmin()) return;

  if (waypointTeleporting) {
    notify("Дождитесь завершения телепорта по метке.", "warning");
    return;
  }

  if (freeCamTogglePending) return;

  freeCamTogglePending = true;
  mp.events.callRemote("admin:fly:toggle");

  setTimeout(() => {
    freeCamTogglePending = false;
  }, 2000);
});

mp.events.add("admin:fly:set", (enabled) => {
  freeCamTogglePending = false;

  if (enabled) {
    startFreeCam();
    return;
  }

  if (!freeCam && waypointTeleporting) return;
  stopFreeCam();
});

mp.events.add("admin:fly:ghostPlayer", (remoteId, enabled) => {
  const player = mp.players.atRemoteId(Number(remoteId));
  if (!player) return;

  setEntityGhost(player, Boolean(enabled));
});

mp.events.add("entityStreamIn", (entity) => {
  if (!entity || entity.type !== "player") return;

  if (entity.getVariable("adminFlyEnabled")) {
    setEntityGhost(entity, true);
  }
});

mp.events.add("render", () => {
  moveFreeCam();
});

global.adminFreeCam = {
  isEnabled: () => Boolean(freeCam),
  getPosition: () => freeCam?.getCoord?.() || null,
  getRotation: () => freeCam?.getRot?.(2) || null,
};

console.log("[ADMIN] Waypoint teleport: F4. FreeCam: F5.");
