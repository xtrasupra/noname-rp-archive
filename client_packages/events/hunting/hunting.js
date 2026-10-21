"use strict";

const INTERACT_KEY = 0x45; // E
const MINIGAME_KEY = 0x20; // SPACE
const INTERACTION_DISTANCE = 3.2;
const TENT_INTERACTION_DISTANCE = 5.5;
const VEHICLE_LOAD_DISTANCE = 5.0;
const AI_TICK_MS = 750;
const ANIMAL_TEST_ESP = false;
const HUNTING_PROCESSING_PAGE = "huntingProcessing";
const ANIMAL_TEST_MAP_BLIPS = false;
const ANIMAL_TEST_DRAW_DISTANCE = 650;
const MUSKET_HASH = Number(mp.game.joaat("weapon_musket")) >>> 0;
const SCOPED_HUNTING_RIFLE_HASH = Number(mp.game.joaat("weapon_sniperrifle")) >>> 0;
const HUNTING_RIFLE_HASHES = [MUSKET_HASH, SCOPED_HUNTING_RIFLE_HASH];
const MELEE_WEAPON_HASHES = new Set([
    Number(mp.game.joaat("weapon_unarmed")) >>> 0,
    Number(mp.game.joaat("weapon_knife")) >>> 0,
]);

function weaponHashesMatch(left, right) {
    const a = Number(left || 0) >>> 0;
    const b = Number(right || 0) >>> 0;
    return Boolean(a && b && (a === b || (Math.fround(a) >>> 0) === (Math.fround(b) >>> 0)));
}

function weaponHashSetHas(set, value) {
    for (const candidate of set) {
        if (weaponHashesMatch(candidate, value)) return true;
    }
    return false;
}

const bindKey = global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback));
const liveAnimals = new Map();
const carcasses = new Map();
const tents = new Map();
const aiCommandAt = new Map();
const forcedReactions = new Map();
const roamTargets = new Map();
const hitThrottle = new Map();
const attackContactSentAt = new Map();
const activeMeleeContacts = new Set();
const animalGroundSyncAt = new Map();
const animalMovementSamples = new Map();
const carcassGroundedAt = new Map();
const packedCarcassGroundedAt = new Map();
const tentGroundSyncAt = new Map();
const previousMapBlips = Array.isArray(global.__twinkleHuntingMapBlips)
    ? global.__twinkleHuntingMapBlips
    : [];
previousMapBlips.splice(0).forEach((entry) => {
    try {
        if (entry?.radius && mp.blips.exists(entry.radius)) entry.radius.destroy();
    } catch {}
    try {
        if (entry?.radiusHandle) {
            mp.game.ui.setBlipAlpha(entry.radiusHandle, 0);
            mp.game.ui.setBlipDisplay?.(entry.radiusHandle, 0);
            mp.game.ui.removeBlip(entry.radiusHandle);
        }
    } catch {}
});
const mapBlips = [];
global.__twinkleHuntingMapBlips = mapBlips;
const animalDebugBlips = new Map();
const previousEntityBlips = global.__twinkleHuntingEntityBlips || {};
[previousEntityBlips.tents, previousEntityBlips.carcasses].forEach((registry) => {
    if (!registry || typeof registry.forEach !== "function") return;
    registry.forEach((entry) => {
        try {
            const blip = entry?.blip || entry;
            if (blip && mp.blips.exists(blip)) blip.destroy();
        } catch {}
    });
});
const tentBlips = new Map();
const carcassBlips = new Map();
global.__twinkleHuntingEntityBlips = { tents: tentBlips, carcasses: carcassBlips };
const CARCASS_GROUND_OFFSETS = Object.freeze({
    dove: 0.1,
    cormorant: 0.12,
    hawk: 0.12,
    rabbit: 0.16,
    wild_pig: 0.3,
    boar: 0.36,
    wolf: 0.34,
    coyote: 0.32,
    deer: 0.42,
    panther: 0.4,
    lion: 0.48,
    chimp: 0.52,
});
const TENT_GROUND_OFFSET_Z = 0.08;

let zones = [];
let sellerSafeZone = null;
let huntActive = false;
let activeQuest = null;
let localOwnerKey = "";
let minigame = null;
let processingChoice = null;
let ticTacToe = null;
let serverClockOffsetMs = 0;
let wasJumping = false;
let lastPvpWarningAt = 0;
let zoneFingerprint = "";
let huntingSetupReceived = false;
let lastMeleeFallbackAt = 0;
let animalTestEsp = ANIMAL_TEST_ESP;
let tentHoldStartedAt = 0;
let tentHoldOwnerStaticId = -1;
let tentHoldTimer = null;
let tentHoldCompleted = false;
let nearbyTentHintOwnerStaticId = -1;

function reportBlockedPvpAttempt(target, weaponHash, kind = "damage") {
    const now = Date.now();
    if (!target || now - lastPvpWarningAt <= 1800) return;
    lastPvpWarningAt = now;
    try {
        mp.events.callRemote(
            "hunting:pvpAttempt",
            getEntityRemoteId(target),
            Number(weaponHash || 0) >>> 0,
            String(kind || "damage")
        );
    } catch {}
}

function parsePayload(raw, fallback = {}) {
    try {
        if (!raw) return fallback;
        if (typeof raw === "object") return raw;

        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function openHuntingProcessingPage(payload) {
    try {
        const openPage = global.openPage || global.interfaceLock?.openPage;
        if (typeof openPage === "function") {
            openPage(HUNTING_PROCESSING_PAGE, null, payload || {});
        }
    } catch {}
}

function closeHuntingProcessingPage() {
    try {
        const closePage = global.closePage || global.interfaceLock?.closePage;
        if (typeof closePage === "function") closePage(HUNTING_PROCESSING_PAGE);
    } catch {}
}

function notify(message, variant = "info") {
    try {
        if (typeof global.notify === "function") {
            global.notify(String(message), variant, 4500);
            return;
        }
    } catch {}

    try {
        mp.gui.chat.push(`!{#a970e8}[Охота] !{#ffffff}${String(message)}`);
    } catch {}
}

function isInputBlocked() {
    try {
        return Boolean(global.isInputBlocked && global.isInputBlocked());
    } catch {
        return false;
    }
}

function getDistance(a, b) {
    if (!a || !b) return Number.MAX_SAFE_INTEGER;

    const dx = Number(a.x || 0) - Number(b.x || 0);
    const dy = Number(a.y || 0) - Number(b.y || 0);
    const dz = Number(a.z || 0) - Number(b.z || 0);

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isInsideZone(position, zone) {
    if (!position || !zone) return false;
    if (Number(position.z) < Number(zone.minZ) || Number(position.z) > Number(zone.maxZ)) return false;

    const dx = Number(position.x) - Number(zone.center.x);
    const dy = Number(position.y) - Number(zone.center.y);
    const radius = Number(zone.radius);

    return dx * dx + dy * dy <= radius * radius;
}

function getZoneAt(position) {
    return zones.find((zone) => isInsideZone(position, zone)) || null;
}

function isInsideSellerSafeZone(position) {
    if (!position || !sellerSafeZone?.center) return false;

    const dx = Number(position.x || 0) - Number(sellerSafeZone.center.x);
    const dy = Number(position.y || 0) - Number(sellerSafeZone.center.y);
    const dz = Math.abs(Number(position.z || 0) - Number(sellerSafeZone.center.z));
    const radius = Number(sellerSafeZone.radius || 0);

    return dz <= 35 && dx * dx + dy * dy <= radius * radius;
}

function isAggressiveAnimal(state) {
    return Boolean(
        state &&
        (
            state.behavior === "aggressive" ||
            state.zoneId === "dangerous" ||
            state.zoneId === "reserve"
        )
    );
}

function getLocalPlayerId() {
    const local = mp.players.local;
    return Number(local.remoteId !== undefined ? local.remoteId : local.id);
}

function getLocalWeaponHash() {
    try {
        const selectedWeapon = Number(mp.game.invoke(
            "0x0A6DB4965674D243",
            mp.players.local.handle
        ) || 0) >>> 0;
        if (selectedWeapon) return selectedWeapon;
    } catch {}

    try {
        return Number(mp.players.local.weapon || 0) >>> 0;
    } catch {
        return 0;
    }
}

function getEntityRemoteId(entity) {
    if (!entity) return -1;

    const value = entity.remoteId !== undefined ? entity.remoteId : entity.id;
    return Number(value);
}

function getEntityModelHash(entity) {
  if (!entity) return 0;

  return Number(entity.model || 0) >>> 0;
}

function getModelGroundOffset(entity, maxOffset = 3) {
    if (!entity) return 0;
    try {
        const dimensions = mp.game.gameplay.getModelDimensions(getEntityModelHash(entity));
        const minimumZ = Number(
            dimensions?.minimum?.z ?? dimensions?.min?.z ?? dimensions?.[0]?.z
        );
        if (!Number.isFinite(minimumZ)) return 0;
        return Math.max(0, Math.min(Number(maxOffset), -minimumZ));
    } catch {
        return 0;
    }
}

function entityMatchesAnimalState(entity, state) {
    if (!entity || !state) return false;
    if (Number(entity.handle) === Number(mp.players.local.handle)) return false;

    try {
        if (entity.getVariable?.("huntingAnimal") === true) return true;
    } catch {}

    const expectedModel = Number(state.modelHash || 0) >>> 0;
    const actualModel = getEntityModelHash(entity);
    if (expectedModel && actualModel && expectedModel === actualModel) return true;

    return entity.type === "ped";
}

function getHuntingAnimalEntity(entity) {
    if (!entity) return null;

    const remoteId = getEntityRemoteId(entity);
    const directState = liveAnimals.get(remoteId);
    if (directState && entityMatchesAnimalState(entity, directState)) return entity;

    let handleMatch = null;
    liveAnimals.forEach((_state, entityId) => {
        if (handleMatch) return;

        const ped = getPed(entityId);
        if (entityExists(ped) && Number(ped.handle) === Number(entity.handle)) {
            handleMatch = ped;
        }
    });
    if (handleMatch) return handleMatch;

    const entityModel = getEntityModelHash(entity);
    const entityPosition = entity.position;
    if (entityModel && entityPosition) {
        let spatialMatch = null;

        liveAnimals.forEach((state, entityId) => {
            if (spatialMatch) return;
            if ((Number(state.modelHash || 0) >>> 0) !== entityModel) return;

            const position = getAnimalPosition(state);
            if (!position || getDistance(position, entityPosition) > 2.75) return;

            spatialMatch = getPed(entityId) || entity;
        });

        if (spatialMatch) return spatialMatch;
    }

    try {
        if (entity.getVariable?.("huntingAnimal") === true) {
            return getPed(getEntityRemoteId(entity)) || entity;
        }
    } catch {}

    if (!liveAnimals.has(remoteId)) return null;

    const ped = getPed(remoteId);
    if (entityExists(ped) && Number(ped.handle) === Number(entity.handle)) return ped;

    return entityMatchesAnimalState(entity, liveAnimals.get(remoteId)) ? entity : null;
}

function isHuntingAnimalEntity(entity) {
    return Boolean(getHuntingAnimalEntity(entity));
}

function isRealPlayerEntity(entity) {
    return Boolean(entity && entity.type === "player" && !isHuntingAnimalEntity(entity));
}

function isLocalDamageSource(sourceEntity, sourcePlayer = null) {
    const local = mp.players.local;

    return Boolean(
        (
            sourceEntity &&
            sourceEntity.type === "player" &&
            Number(sourceEntity.handle) === Number(local.handle)
        ) ||
        (
            sourcePlayer &&
            Number(sourcePlayer.handle) === Number(local.handle)
        )
    );
}

function getPed(entityId) {
    try {
        const ped = mp.peds.atRemoteId(Number(entityId));
        if (ped) return ped;
    } catch {}

    const state = liveAnimals.get(Number(entityId));
    if (!state) return null;

    try {
        const dynamicPed = mp.players.atRemoteId(Number(entityId));
        return entityMatchesAnimalState(dynamicPed, state) ? dynamicPed : null;
    } catch {
        return null;
    }
}

function getObject(entityId) {
    try {
        return mp.objects.atRemoteId(Number(entityId));
    } catch {
        return null;
    }
}

function getVehicle(entityId) {
    try {
        return mp.vehicles.atRemoteId(Number(entityId));
    } catch {
        return null;
    }
}

function getPlayer(entityId) {
    try {
        const player = mp.players.atRemoteId(Number(entityId));
        if (player) return player;
    } catch {
        // Fallback below handles the local player.
    }

    return Number(entityId) === getLocalPlayerId() ? mp.players.local : null;
}

function getCarcassEntity(carcass) {
    if (!carcass || carcass.entityId === null || carcass.entityId === undefined) return null;
    if (carcass.entityType === "ped") {
        try {
            const ped = mp.peds.atRemoteId(Number(carcass.entityId));
            if (ped) return ped;
        } catch {}

        // Dynamic server peds в некоторых версиях RAGE попадают в players pool.
        // Для туши не используем liveAnimals: у неё новый network ID.
        try {
            const dynamicPed = mp.players.atRemoteId(Number(carcass.entityId));
            if (!dynamicPed) return null;
            const markedAsCarcass = dynamicPed.getVariable?.("huntingCarcass") === true;
            const markedId = Number(dynamicPed.getVariable?.("huntingCarcassId"));
            return markedAsCarcass && markedId === Number(carcass.id) ? dynamicPed : null;
        } catch {
            return null;
        }
    }
    if (carcass.entityType === "object") return getObject(carcass.entityId);
    return null;
}

function getCarcassPosition(carcass) {
    const entity = getCarcassEntity(carcass);
    if (entityExists(entity)) return getRenderedEntityPosition(entity) || entity.position;

    return carcass?.position || null;
}

function getCarcassLabelAnchor(carcass) {
    const entity = getCarcassEntity(carcass);

    if (entityExists(entity) && carcass?.entityType === "ped") {
        try {
            const pelvis = entity.getBoneCoords?.(11816, 0, 0, 0.12);
            if (pelvis) return pelvis;
        } catch {}

        try {
            const pelvis = mp.game.ped.getPedBoneCoords(entity.handle, 11816, 0, 0, 0.12);
            if (pelvis) return pelvis;
        } catch {}
    }

    const position = getCarcassPosition(carcass);
    if (!position) return null;
    let z = Number(position.z) + 0.12;

    try {
        const ground = mp.game.gameplay.getGroundZFor3dCoord(
            Number(position.x),
            Number(position.y),
            Number(position.z) + 50,
            false,
            false
        );
        const groundZ = Number(ground?.z ?? ground);
        if (Number.isFinite(groundZ) && Math.abs(groundZ - Number(position.z)) < 8) {
            z = groundZ + 0.24;
        }
    } catch {}

    return new mp.Vector3(Number(position.x), Number(position.y), z);
}

function entityExists(entity) {
    try {
        if (!entity || !entity.handle) return false;
        if (typeof entity.doesExist === "function") return Boolean(entity.doesExist());
        if (mp.game.entity && typeof mp.game.entity.doesExist === "function") {
            return Boolean(mp.game.entity.doesExist(entity.handle));
        }

        return true;
    } catch {
        return Boolean(entity && entity.handle);
    }
}

function setEntityInvincible(entity, state) {
    if (!entityExists(entity)) return;

    try {
        mp.game.invoke("0x3882114BDE571AD4", entity.handle, Boolean(state));
    } catch {}
}

function makeAnimalAlive(ped, state = null) {
    if (!entityExists(ped)) return;

    setEntityInvincible(ped, true);

    try {
        if (typeof ped.setVisible === "function") ped.setVisible(true, false);
        if (typeof ped.resetAlpha === "function") ped.resetAlpha();
        if (typeof ped.setCollision === "function") ped.setCollision(true, true);
        if (typeof ped.freezePosition === "function") ped.freezePosition(false);
    } catch {}

    let resurrected = false;

    try {
        if (typeof ped.isDeadOrDying === "function" && ped.isDeadOrDying(true)) {
            if (typeof ped.resurrect === "function") {
                ped.resurrect();
            } else {
                mp.game.invoke("0x71BC8E838B9C6035", ped.handle);
            }

            resurrected = true;
        }
    } catch {}

    if (resurrected) {
        try {
            mp.game.invoke("0x6B76DC1F3AE6E6A3", ped.handle, 200, 0);
        } catch {}
    }

    try {
        if (typeof ped.setCanRagdoll === "function") ped.setCanRagdoll(true);
        if (typeof ped.setPathCanUseClimbovers === "function") ped.setPathCanUseClimbovers(true);
        if (typeof ped.setPathCanUseLadders === "function") ped.setPathCanUseLadders(false);
        if (typeof ped.setPathCanDropFromHeight === "function") ped.setPathCanDropFromHeight(false);
    } catch {}

    try {
        if (typeof ped.setBlockingOfNonTemporaryEvents === "function") {
            ped.setBlockingOfNonTemporaryEvents(true);
        }
        if (typeof ped.setKeepTask === "function") ped.setKeepTask(true);
    } catch {}

    if (isAggressiveAnimal(state)) {
        try {
            if (typeof ped.setCombatAbility === "function") ped.setCombatAbility(2);
            if (typeof ped.setCombatRange === "function") ped.setCombatRange(2);
            if (typeof ped.setCombatAttributes === "function") {
                ped.setCombatAttributes(5, true);
                ped.setCombatAttributes(46, true);
            }
            if (typeof ped.setFleeAttributes === "function") ped.setFleeAttributes(0, false);
        } catch {}
    }


    snapAnimalToGround(ped, state);
}

function snapAnimalToGround(ped, state) {
    if (!entityExists(ped) || !state || !isLocalAnimalController(ped)) return;
    const entityId = Number(state.entityId);
    const now = Date.now();
    if (now - Number(animalGroundSyncAt.get(entityId) || 0) < 5000) return;

    const position = getRenderedEntityPosition(ped) || state.position;
    if (!position) return;

    try {
        try {
            mp.game.streaming.requestCollisionAtCoord(
                Number(position.x),
                Number(position.y),
                Number(position.z)
            );
        } catch {}
        const result = mp.game.gameplay.getGroundZFor3dCoord(
            Number(position.x),
            Number(position.y),
            Number(position.z) + 100,
            false,
            false
        );
        const groundZ = Number(result?.z ?? result);
        const delta = Math.abs(groundZ - Number(position.z));
        if (!Number.isFinite(groundZ) || delta > 80) return;
        if (delta < 0.35) {
            animalGroundSyncAt.set(entityId, now);
            return;
        }

        mp.game.invoke(
            "0x239A3351AC1DA385",
            ped.handle,
            Number(position.x),
            Number(position.y),
            groundZ,
            false,
            false,
            false
        );
        state.position = { x: Number(position.x), y: Number(position.y), z: groundZ };
        animalGroundSyncAt.set(entityId, now);
        mp.events.callRemote(
            "hunting:animalGrounded",
            entityId,
            Number(position.x),
            Number(position.y),
            groundZ
        );
    } catch {}
}

function settleCarcassOnGround(state, ped, attempt = 0) {
    if (!state || !entityExists(ped) || state.entityType !== "ped") return;
    const carcassId = Number(state.id);
    if (carcassGroundedAt.has(carcassId) && attempt === 0) return;

    const delay = attempt === 0 ? 700 : 450;
    setTimeout(() => {
        if (!carcasses.has(carcassId) || !entityExists(ped)) return;
        try {
            const position = getRenderedEntityPosition(ped) || ped.position || state.position;
            const result = mp.game.gameplay.getGroundZFor3dCoord(
                Number(position.x),
                Number(position.y),
                Number(position.z) + 15,
                false,
                false
            );
            const groundZ = Number(result?.z ?? result);
            if (!Number.isFinite(groundZ) || Math.abs(groundZ - Number(position.z)) > 12) {
                if (attempt < 2) settleCarcassOnGround(state, ped, attempt + 1);
                return;
            }
            if (Number.isFinite(groundZ)) {
                const groundOffset = Math.max(
                    0.08,
                    Number(CARCASS_GROUND_OFFSETS[String(state.speciesId || "")] || 0.24)
                );
                const currentAboveGround = Number(position.z) - groundZ;
                const settledZ = currentAboveGround >= groundOffset && currentAboveGround <= 1.35
                    ? Number(position.z)
                    : groundZ + groundOffset;
                mp.game.invoke(
                    "0x239A3351AC1DA385",
                    ped.handle,
                    Number(position.x),
                    Number(position.y),
                    settledZ,
                    false,
                    false,
                    false
                );
                state.position = { x: Number(position.x), y: Number(position.y), z: settledZ };
                try {
                    if (isCarcassOwnedByLocalPlayer(state)) {
                        mp.events.callRemote(
                            "hunting:carcassGrounded",
                            carcassId,
                            Number(position.x),
                            Number(position.y),
                            settledZ
                        );
                    }
                } catch {}
            }
            try { ped.setCollision(true, true); } catch {}
            try { ped.freezePosition(true); } catch {}
            carcassGroundedAt.set(carcassId, Date.now());
        } catch {
            if (attempt < 2) settleCarcassOnGround(state, ped, attempt + 1);
        }
    }, delay);
}

function makeAnimalDead(ped, state = null) {
    if (!entityExists(ped)) return;

    const alreadyGrounded = Boolean(
        state && carcassGroundedAt.has(Number(state.id))
    );
    try { ped.setVisible(true, false); } catch {}
    try { ped.resetAlpha(); } catch {}
    try { ped.setCollision(true, true); } catch {}
    try { ped.freezePosition(alreadyGrounded); } catch {}
    setEntityInvincible(ped, false);

    try {
        mp.game.invoke("0x6B76DC1F3AE6E6A3", ped.handle, 0, 0);
        mp.game.invoke("0xAE99FB955581844A", ped.handle, 1500, 60000, 0, false, false, false);
    } catch {}
    if (state) settleCarcassOnGround(state, ped);
}

function playAnimalKillEffect(state) {
    const position = getCarcassPosition(state) || state?.position;
    if (!position) return;
    if (getDistance(mp.players.local.position, position) > 180) return;

    if (isCarcassOwnedByLocalPlayer(state)) {
        try { mp.game.graphics.startScreenEffect("SuccessFranklin", 650, false); } catch {}
        try {
            mp.game.audio.playSoundFrontend(-1, "CHECKPOINT_PERFECT", "HUD_MINI_GAME_SOUNDSET", true);
        } catch {}
    }
}

function detachBag(object) {
    if (!entityExists(object)) return;

    try {
        if (typeof object.detach === "function") {
            object.detach(true, true);
            return;
        }

        mp.game.invoke("0x961AC54BF0613F5D", object.handle, true, true);
    } catch {}
}

function attachBag(carcass) {
    const object = getCarcassEntity(carcass);
    const carrier = getPlayer(carcass.carrierId);

    if (!entityExists(object) || !entityExists(carrier)) return;
    packedCarcassGroundedAt.delete(Number(carcass.id));
    try { object.freezePosition(false); } catch {}
    try { object.setVisible(true, false); } catch {}
    try { object.resetAlpha(); } catch {}
    try { object.setCollision(true, true); } catch {}

    try {
        const spineBone = mp.game.invoke("0x3F428D08BE5AAE31", carrier.handle, 24818);

        if (typeof object.attachTo === "function") {
            object.attachTo(
                carrier.handle,
                spineBone,
                0.02,
                -0.20,
                0.01,
                0.0,
                90.0,
                0.0,
                false,
                false,
                false,
                false,
                2,
                true
            );
            return;
        }

        mp.game.invoke(
            "0x6B9BBD38AB0796DF",
            object.handle,
            carrier.handle,
            spineBone,
            0.02,
            -0.20,
            0.01,
            0.0,
            90.0,
            0.0,
            false,
            false,
            false,
            false,
            2,
            true
        );
    } catch {}
}

function settlePackedCarcassOnGround(state, object, attempt = 0) {
    if (!state || !entityExists(object) || state.entityType !== "object" || state.stage === "carried") return;
    const carcassId = Number(state.id);
    if (packedCarcassGroundedAt.has(carcassId) && attempt === 0) return;
    const position = getRenderedEntityPosition(object) || object.position || state.position;
    if (!position) return;
    try {
        try {
            mp.game.streaming.requestCollisionAtCoord(
                Number(position.x), Number(position.y), Number(position.z)
            );
        } catch {}
        const result = mp.game.gameplay.getGroundZFor3dCoord(
            Number(position.x),
            Number(position.y),
            Number(position.z) + 60,
            false,
            false
        );
        const groundZ = Number(result?.z ?? result);
        if (!Number.isFinite(groundZ) || Math.abs(groundZ - Number(position.z)) > 80) {
            if (attempt < 10) setTimeout(() => settlePackedCarcassOnGround(state, object, attempt + 1), 250);
            return;
        }
        const settledZ = groundZ + getModelGroundOffset(object, 1.2) + 0.03;
        mp.game.invoke(
            "0x239A3351AC1DA385",
            object.handle,
            Number(position.x),
            Number(position.y),
            settledZ,
            false,
            false,
            false
        );
        try { object.setVisible(true, false); } catch {}
        try { object.resetAlpha(); } catch {}
        try { object.setCollision(true, true); } catch {}
        try { object.freezePosition(true); } catch {}
        state.position = { x: Number(position.x), y: Number(position.y), z: settledZ };
        packedCarcassGroundedAt.set(carcassId, Date.now());
        try {
            if (isCarcassOwnedByLocalPlayer(state)) {
                mp.events.callRemote(
                    "hunting:bagGrounded",
                    carcassId,
                    Number(position.x),
                    Number(position.y),
                    settledZ
                );
            }
        } catch {}
    } catch {
        if (attempt < 10) setTimeout(() => settlePackedCarcassOnGround(state, object, attempt + 1), 250);
    }
}

function applyAnimalState(state, attempt = 0) {
    const ped = getPed(state && state.entityId);
    if (entityExists(ped)) makeAnimalAlive(ped, state);
    if (attempt < 8 && !animalGroundSyncAt.has(Number(state?.entityId))) {
        setTimeout(() => applyAnimalState(state, attempt + 1), 250);
    }
}

function applyCarcassState(state) {
    if (!state) return false;

    const entity = getCarcassEntity(state);
    if (!entityExists(entity)) return false;

    if (state.entityType === "ped") {
        makeAnimalDead(entity, state);
        return true;
    }

    if (state.stage === "carried" && state.carrierId !== null) {
        attachBag(state);
    } else {
        detachBag(entity);
        settlePackedCarcassOnGround(state, entity);
    }
    return true;
}

function applyCarcassStateWithRetry(state, attempt = 0) {
    if (!state || !carcasses.has(Number(state.id))) return;
    if (applyCarcassState(state) || attempt >= 12) return;
    setTimeout(() => applyCarcassStateWithRetry(state, attempt + 1), 150);
}

function applyTentStateWithRetry(state, attempt = 0) {
    if (!state || !tents.has(Number(state.ownerStaticId))) return;
    const object = getObject(state.entityId);
    if (!entityExists(object)) {
        if (attempt < 20) setTimeout(() => applyTentStateWithRetry(state, attempt + 1), 150);
        return;
    }

    try {
        if (typeof object.setVisible === "function") object.setVisible(true, false);
        if (typeof object.resetAlpha === "function") object.resetAlpha();
        if (typeof object.setCollision === "function") object.setCollision(true, true);
        if (typeof object.freezePosition === "function") object.freezePosition(true);
    } catch {}

    const ownerStaticId = Number(state.ownerStaticId);
    if (Date.now() - Number(tentGroundSyncAt.get(ownerStaticId) || 0) < 5000) return;
    const position = state.position || object.position;
    if (!position) return;

    try {
        try {
            mp.game.streaming.requestCollisionAtCoord(
                Number(position.x), Number(position.y), Number(position.z)
            );
        } catch {}
        const result = mp.game.gameplay.getGroundZFor3dCoord(
            Number(position.x),
            Number(position.y),
            Number(position.z) + 100,
            false,
            false
        );
        const groundZ = Number(result?.z ?? result);
        // The original compact tent has a ground-aligned pivot. Applying the
        // full model minimum bound lifts the whole prop into the air.
        const tentZ = groundZ + TENT_GROUND_OFFSET_Z;
        const delta = Math.abs(tentZ - Number(position.z));
        if (!Number.isFinite(groundZ) || !Number.isFinite(tentZ) || delta > 80) {
            if (attempt < 20) setTimeout(() => applyTentStateWithRetry(state, attempt + 1), 250);
            return;
        }
        if (delta < 0.05) {
            tentGroundSyncAt.set(ownerStaticId, Date.now());
            return;
        }

        mp.game.invoke(
            "0x239A3351AC1DA385",
            object.handle,
            Number(position.x),
            Number(position.y),
            tentZ,
            false,
            false,
            false
        );
        state.position = { x: Number(position.x), y: Number(position.y), z: tentZ };
        tentGroundSyncAt.set(ownerStaticId, Date.now());
        if (isTentOwnedByLocalPlayer(state)) {
            mp.events.callRemote(
                "hunting:tentGrounded",
                ownerStaticId,
                Number(state.entityId),
                Number(position.x),
                Number(position.y),
                tentZ
            );
        }
    } catch {}
}

function clearMapBlips() {
    while (mapBlips.length) {
        const entry = mapBlips.pop();

        try {
            if (entry.center && mp.blips.exists(entry.center)) entry.center.destroy();
        } catch {}

        try {
            if (entry.radius && mp.blips.exists(entry.radius)) entry.radius.destroy();
        } catch {}

        try {
            if (entry.radiusHandle && mp.game.ui && typeof mp.game.ui.removeBlip === "function") {
                try { mp.game.ui.setBlipAlpha(entry.radiusHandle, 0); } catch {}
                try { mp.game.ui.setBlipDisplay?.(entry.radiusHandle, 0); } catch {}
                mp.game.ui.removeBlip(entry.radiusHandle);
            }
        } catch {}
    }
}

function removeLegacyHuntingRadiusBlips(zoneList) {
    const ui = mp.game.ui;
    if (
        !ui || typeof ui.getFirstBlipInfoId !== "function" ||
        typeof ui.getNextBlipInfoId !== "function" ||
        typeof ui.doesBlipExist !== "function" ||
        typeof ui.getBlipInfoIdCoord !== "function"
    ) return;

    const targets = (Array.isArray(zoneList) ? zoneList : []).map((zone) => ({
        x: Number(zone?.center?.x),
        y: Number(zone?.center?.y),
        color: Number(zone?.mapColor),
    })).filter((zone) => Number.isFinite(zone.x) && Number.isFinite(zone.y));
    if (targets.length === 0) return;

    try {
        let blip = ui.getFirstBlipInfoId(9);
        let guard = 0;
        while (blip && ui.doesBlipExist(blip) && guard++ < 128) {
            const next = ui.getNextBlipInfoId(9);
            let coordinates = null;
            let color = null;
            try { coordinates = ui.getBlipInfoIdCoord(blip); } catch {}
            try { color = Number(ui.getBlipColour?.(blip)); } catch {}
            const matches = coordinates && targets.some((target) => (
                Math.hypot(
                    Number(coordinates.x) - target.x,
                    Number(coordinates.y) - target.y
                ) <= 6 &&
                (!Number.isFinite(color) || color === target.color)
            ));
            if (matches) {
                try { ui.setBlipAlpha(blip, 0); } catch {}
                try { ui.setBlipDisplay?.(blip, 0); } catch {}
                try { ui.removeBlip(blip); } catch {}
            }
            blip = next;
        }
    } catch {}
}

function destroyTentBlip(ownerStaticId) {
    const entry = tentBlips.get(Number(ownerStaticId));
    if (!entry) return;
    try {
        if (entry.blip && mp.blips.exists(entry.blip)) entry.blip.destroy();
    } catch {}
    tentBlips.delete(Number(ownerStaticId));
}

function clearTentBlips() {
    Array.from(tentBlips.keys()).forEach(destroyTentBlip);
}

function destroyCarcassBlip(carcassId) {
    const entry = carcassBlips.get(Number(carcassId));
    if (!entry) return;
    try {
        if (entry.blip && mp.blips.exists(entry.blip)) entry.blip.destroy();
    } catch {}
    carcassBlips.delete(Number(carcassId));
}

function clearCarcassBlips() {
    Array.from(carcassBlips.keys()).forEach(destroyCarcassBlip);
}

function syncCarcassBlip(carcass) {
    if (!carcass) return;
    const carcassId = Number(carcass.id);
    destroyCarcassBlip(carcassId);

    // A carcass marker is private. The permanent owner key is required so a
    // recycled remote player id can never expose somebody else's carcass.
    if (
        !huntingSetupReceived || !huntActive || !localOwnerKey ||
        carcass.stage !== "raw" || !carcass.ownerKey ||
        String(carcass.ownerKey) !== String(localOwnerKey)
    ) return;

    const position = getCarcassPosition(carcass);
    if (!position) return;
    try {
        const attemptsUsed = Math.max(0, Number(carcass.attemptsUsed || 0));
        const attemptsMax = Math.max(1, Number(carcass.attemptsMax || 3));
        const attemptsText = `${Math.min(attemptsUsed, attemptsMax)}/${attemptsMax}`;
        const blip = mp.blips.new(141, new mp.Vector3(
            Number(position.x),
            Number(position.y),
            Number(position.z)
        ), {
            name: carcass.spoiled
                ? `Испорченная туша: ${carcass.speciesName}`
                : `Туша: ${carcass.speciesName} · ${attemptsText}`,
            color: carcass.spoiled ? 1 : 2,
            scale: 0.58,
            shortRange: false,
            dimension: Number(carcass.dimension || 0),
        });
        blip.setDisplay?.(2);
        carcassBlips.set(carcassId, { blip });
    } catch {}
}

function syncTentBlip(tent) {
    if (!tent) return;
    const ownerStaticId = Number(tent.ownerStaticId);
    destroyTentBlip(ownerStaticId);
    if (!huntActive || !isTentOwnedByLocalPlayer(tent) || !tent.position) return;

    try {
        const blip = mp.blips.new(587, new mp.Vector3(
            Number(tent.position.x),
            Number(tent.position.y),
            Number(tent.position.z)
        ), {
            name: "Моя охотничья палатка",
            color: 2,
            scale: 0.55,
            shortRange: false,
            dimension: Number(tent.dimension || 0),
        });
        blip.setDisplay?.(2);
        tentBlips.set(ownerStaticId, { blip });
    } catch {}
}

function createMapBlips() {
    clearMapBlips();

    if (huntingSetupReceived && huntActive) zones.forEach((zone) => {
        let radiusBlip = null;
        const position = new mp.Vector3(
            Number(zone.center.x),
            Number(zone.center.y),
            Number(zone.center.z)
        );

        try {
            // Managed RAGE blips are destroyed reliably on setup/reconnect.
            // Native radius handles could survive a client hot-reload.
            radiusBlip = mp.blips.new(1, position, {
                name: zone.name,
                color: Number(zone.mapColor),
                alpha: 82,
                radius: Number(zone.radius),
                shortRange: false,
                dimension: 0,
            });
            radiusBlip.setDisplay?.(2);
        } catch {}

        mapBlips.push({ radius: radiusBlip, radiusHandle: 0, center: null });
    });

    // Безопасная зона Джереми остаётся только зелёным маркером в игровом мире.
}

function destroyAnimalDebugBlip(entityId) {
    const blip = animalDebugBlips.get(Number(entityId));
    if (!blip) return;

    try {
        if (mp.blips.exists(blip)) blip.destroy();
    } catch {}

    animalDebugBlips.delete(Number(entityId));
}

function clearAnimalDebugBlips() {
    Array.from(animalDebugBlips.keys()).forEach(destroyAnimalDebugBlip);
}

function getRenderedEntityPosition(entity) {
  if (!entityExists(entity)) return null;
  return entity.position || null;
}

function getAnimalPosition(state) {
    const ped = getPed(state && state.entityId);
    if (entityExists(ped)) return getRenderedEntityPosition(ped);
    return state && state.position ? state.position : null;
}

function getAnimalEspAnchor(ped) {
    if (!entityExists(ped)) return null;

    try {
        if (typeof ped.getBoneCoords === "function") {
            const head = ped.getBoneCoords(31086, 0, 0, 0.28);
            if (head) return head;
        }
    } catch {}

    try {
        const head = mp.game.ped.getPedBoneCoords(ped.handle, 31086, 0, 0, 0.28);
        if (head) return head;
    } catch {}

    const position = getRenderedEntityPosition(ped);
    if (!position) return null;

    return new mp.Vector3(
        Number(position.x),
        Number(position.y),
        Number(position.z) + 1.25
    );
}

function worldToScreen(position) {
    if (!position) return null;

    try {
        const screen = mp.game.graphics.getScreenCoordFromWorldCoord(
            Number(position.x),
            Number(position.y),
            Number(position.z)
        );

        const x = Number(screen?.screenX ?? screen?.x);
        const y = Number(screen?.screenY ?? screen?.y);
        if (screen && screen.result !== false && Number.isFinite(x) && Number.isFinite(y)) {
            return {
                x,
                y,
            };
        }
    } catch {}

    try {
        const screen = mp.game.graphics.world3dToScreen2d(position);
        const x = Number(screen?.x ?? screen?.screenX);
        const y = Number(screen?.y ?? screen?.screenY);
        if (screen && Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    } catch {}

    return null;
}

function drawAnimalEsp(state, ped) {
    const position = getRenderedEntityPosition(ped);
    const headPosition = getAnimalEspAnchor(ped);
    if (!position || !headPosition) return;

    const playerPosition = getRenderedEntityPosition(mp.players.local) || mp.players.local.position;
    const distance = getDistance(playerPosition, position);
    if (distance > ANIMAL_TEST_DRAW_DISTANCE) return;

    const headScreen = worldToScreen(headPosition);
    if (!headScreen) return;

    const color = state.zoneId === "reserve"
        ? [195, 95, 255, 255]
        : state.behavior === "aggressive"
            ? [255, 75, 75, 255]
            : [80, 165, 255, 255];

    drawText(
        `#${state.debugId || state.entityId} · ${state.speciesName} · ${state.behavior === "aggressive" ? "агрессивное" : "пугливое"} · ${Math.round(distance)} м`,
        [headScreen.x, headScreen.y - 0.018],
        { color, scale: [0.36, 0.36] }
    );
}

function syncAnimalDebugBlip(state) {
    if (!state) return;

    const entityId = Number(state.entityId);
    if (!ANIMAL_TEST_ESP || !ANIMAL_TEST_MAP_BLIPS) {
        destroyAnimalDebugBlip(entityId);
        return;
    }
    const position = getAnimalPosition(state);
    if (!position) return;

    let blip = animalDebugBlips.get(entityId);
    const zone = zones.find((entry) => entry.id === state.zoneId);

    if (blip) {
        try {
            if (!mp.blips.exists(blip)) {
                animalDebugBlips.delete(entityId);
                blip = null;
            }
        } catch {}
    }

    if (!blip) {
        try {
            blip = mp.blips.new(141, new mp.Vector3(
                Number(position.x),
                Number(position.y),
                Number(position.z)
            ), {
                name: `ТЕСТ #${state.debugId || entityId}: ${state.speciesName}`,
                color: Number(zone?.mapColor || 5),
                scale: 0.48,
                alpha: 220,
                shortRange: false,
                dimension: 0,
            });

            if (typeof blip.setDisplay === "function") blip.setDisplay(2);
            if (typeof blip.showNumberOn === "function") {
                blip.showNumberOn(Math.max(1, Math.min(99, Number(state.debugId || entityId))));
            }

            animalDebugBlips.set(entityId, blip);
        } catch {
            return;
        }
    }

    try {
        const nextPosition = new mp.Vector3(
            Number(position.x),
            Number(position.y),
            Number(position.z)
        );

        blip.position = nextPosition;

        if (typeof blip.setCoords === "function") {
            blip.setCoords(nextPosition);
        }

        if (blip.handle && mp.game.ui && typeof mp.game.ui.setBlipCoords === "function") {
            mp.game.ui.setBlipCoords(blip.handle, nextPosition.x, nextPosition.y, nextPosition.z);
        }
    } catch {}
}

function drawText(text, position, options = {}) {
    mp.game.graphics.drawText(String(text), position, {
        font: options.font === undefined ? 0 : options.font,
        color: options.color || [255, 255, 255, 230],
        scale: options.scale || [0.38, 0.38],
        outline: options.outline === undefined ? true : options.outline,
        center: options.center === undefined ? true : options.center,
    });
}

function drawAnimalTestEsp() {
    if (!animalTestEsp) return;

    let streamedCount = 0;

    liveAnimals.forEach((state, entityId) => {
        const ped = getPed(entityId);
        if (!entityExists(ped)) return;

        drawAnimalEsp(state, ped);
        streamedCount += 1;
    });

    drawText(`ТЕСТ ОХОТЫ: ${liveAnimals.size} животных · загружено рядом ${streamedCount}`, [0.5, 0.055], {
        color: [255, 225, 95, 245],
        scale: [0.38, 0.38],
    });
}

function isStimulantHearingActive() {
    try {
        return Number(mp.players.local.getVariable("huntingStimulantUntil") || 0) > getServerNow();
    } catch {
        return false;
    }
}

function drawStimulantHearing() {
    if (!huntActive || animalTestEsp || !isStimulantHearingActive()) return;
    const localPosition = getRenderedEntityPosition(mp.players.local) || mp.players.local.position;

    liveAnimals.forEach((state, entityId) => {
        const ped = getPed(entityId);
        if (!entityExists(ped)) return;
        const position = getRenderedEntityPosition(ped);
        const anchor = getAnimalEspAnchor(ped);
        if (!position || !anchor) return;
        const distance = getDistance(localPosition, position);
        if (distance > 180) return;
        const screen = worldToScreen(anchor);
        if (!screen) return;
        drawText(
            `СЛУХ · ${state.speciesName} · ${Math.round(distance)} м`,
            [screen.x, screen.y - 0.018],
            { color: [223, 190, 115, 245], scale: [0.34, 0.34] }
        );
    });
}

function drawActiveHuntingTask() {
    if (!huntActive) return;

    const taskText = activeQuest
        ? String(
            activeQuest.description ||
            `Добудьте тушу «${activeQuest.speciesName || activeQuest.speciesId || "животного"}».`
        )
        : "Свободная охота";

    drawText(`Охота: ${taskText}`, [0.5, 0.105], {
        color: [220, 185, 255, 245],
        scale: [0.38, 0.38],
    });
}

function isCarcassOwnedByOther(carcass) {
    if (!carcass) return false;
    if (carcass.ownerKey) return String(carcass.ownerKey) !== String(localOwnerKey);
    return carcass.ownerPlayerId !== null &&
        carcass.ownerPlayerId !== undefined &&
        Number(carcass.ownerPlayerId) !== getLocalPlayerId();
}

function isCarcassOwnedByLocalPlayer(carcass) {
    if (!carcass) return false;
    if (carcass.ownerKey && localOwnerKey) {
        return String(carcass.ownerKey) === String(localOwnerKey);
    }

    return carcass.ownerPlayerId !== null &&
        carcass.ownerPlayerId !== undefined &&
        Number(carcass.ownerPlayerId) === getLocalPlayerId();
}

function isTentOwnedByLocalPlayer(tent) {
    if (!tent) return false;
    const localStaticId = String(localOwnerKey).startsWith("static:")
        ? Number(String(localOwnerKey).slice(7))
        : 0;
    return localStaticId > 0 && Number(tent.ownerStaticId) === localStaticId;
}

function drawCarcassLabels() {
    if (!huntActive) return;
    const playerPosition = mp.players.local.position;

    carcasses.forEach((carcass) => {
        if (carcass.stage !== "raw") return;

        if (Number(carcass.dimension || 0) !== Number(mp.players.local.dimension || 0)) return;
        const position = getCarcassPosition(carcass);
        if (!position || getDistance(playerPosition, position) > 18) return;

        try {
            const worldPosition = getCarcassLabelAnchor(carcass);
            const screen = worldToScreen(worldPosition);

            if (!screen) return;

            const timer = getRemainingText(carcass);

            if (carcass.spoiled) {
                drawText(`Туша '${carcass.speciesName}' испорчена | ${timer}`, [screen.x, screen.y], {
                    color: [255, 65, 65, 245],
                    scale: [0.33, 0.33],
                });
                return;
            }

            const ownedByOther = isCarcassOwnedByOther(carcass);
            const attemptsUsed = Math.max(0, Number(carcass.attemptsUsed || 0));
            const attemptsMax = Math.max(1, Number(carcass.attemptsMax || 3));
            const fraction = `${Math.min(attemptsUsed, attemptsMax)}/${attemptsMax}`;

            drawText(
                ownedByOther
                    ? `Туша '${carcass.speciesName}' | ${timer} | Туша другого охотника | ${fraction} попыток`
                    : `Туша '${carcass.speciesName}' | ${timer} | Нажмите E чтобы разделать | ${fraction} попыток`,
                [screen.x, screen.y],
                {
                    color: [75, 235, 105, 245],
                    scale: [0.31, 0.31],
                }
            );
        } catch {}
    });
}

function getServerNow() {
    return Date.now() - serverClockOffsetMs;
}

function getRemainingText(carcass) {
    const remaining = Math.max(0, Number(carcass.expiresAt || 0) - getServerNow());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getLocalCarriedCarcass() {
    const localId = getLocalPlayerId();

    for (const carcass of carcasses.values()) {
        if (carcass.stage === "carried" && Number(carcass.carrierId) === localId) {
            return carcass;
        }
    }

    return null;
}

function forEachStreamedVehicle(callback) {
    try {
        mp.vehicles.forEachInStreamRange(callback);
        return;
    } catch {}

    try {
        mp.vehicles.forEach(callback);
    } catch {}
}

function getNearestVehicle(maxDistance = VEHICLE_LOAD_DISTANCE) {
    const playerPosition = mp.players.local.position;
    let nearest = null;
    let nearestDistance = Number(maxDistance);

    forEachStreamedVehicle((vehicle) => {
        if (!entityExists(vehicle)) return;

        const distance = getDistance(playerPosition, vehicle.position);

        if (distance <= nearestDistance) {
            nearest = vehicle;
            nearestDistance = distance;
        }
    });

    return nearest;
}

function getNearestGroundCarcass() {
    const playerPosition = mp.players.local.position;
    let nearest = null;
    let nearestDistance = INTERACTION_DISTANCE;

    carcasses.forEach((carcass) => {
        if (["carried", "trunk"].includes(carcass.stage)) return;
        if (!huntActive && carcass.stage === "raw") return;
        if (Number(carcass.dimension || 0) !== Number(mp.players.local.dimension || 0)) return;

        const position = getCarcassLabelAnchor(carcass) || getCarcassPosition(carcass);
        if (!position) return;

        const horizontalDistance = Math.hypot(
            Number(playerPosition.x) - Number(position.x),
            Number(playerPosition.y) - Number(position.y)
        );
        const verticalDistance = Math.abs(Number(playerPosition.z) - Number(position.z));
        if (horizontalDistance <= nearestDistance && verticalDistance <= 8) {
            nearest = carcass;
            nearestDistance = horizontalDistance;
        }
    });

    return nearest;
}

function getNearestTent(maxDistance = TENT_INTERACTION_DISTANCE) {
    const playerPosition = mp.players.local.position;
    let nearest = null;
    let nearestDistance = Number(maxDistance);

    tents.forEach((tent) => {
        if (!tent?.position) return;
        if (Number(tent.dimension || 0) !== Number(mp.players.local.dimension || 0)) return;
        const distance = getDistance(playerPosition, tent.position);
        if (distance > nearestDistance) return;
        nearest = tent;
        nearestDistance = distance;
    });
    return nearest;
}

function getNearestOwnedTent(maxDistance = TENT_INTERACTION_DISTANCE) {
    const playerPosition = mp.players.local.position;
    let nearest = null;
    let nearestDistance = Number(maxDistance);

    tents.forEach((tent) => {
        if (!tent?.position || !isTentOwnedByLocalPlayer(tent)) return;
        if (Number(tent.dimension || 0) !== Number(mp.players.local.dimension || 0)) return;
        const distance = getDistance(playerPosition, tent.position);
        if (distance > nearestDistance) return;
        nearest = tent;
        nearestDistance = distance;
    });
    return nearest;
}

function getInteractionPrompt() {
    const carried = getLocalCarriedCarcass();

    if (carried) {
        const nearbyVehicle = getNearestVehicle();
        const ownTent = getNearestOwnedTent();

        return {
            carcass: carried,
            vehicle: ownTent ? null : nearbyVehicle,
            tent: ownTent,
            storage: Boolean(nearbyVehicle || ownTent),
            enabled: Boolean(nearbyVehicle || ownTent),
            text: "",
        };
    }

    const carcass = getNearestGroundCarcass();
    if (!carcass) {
        const tent = getNearestOwnedTent() || getNearestTent();
        if (tent) {
            const owned = isTentOwnedByLocalPlayer(tent);
            return {
                carcass: null,
                vehicle: null,
                tent,
                storage: true,
                enabled: owned,
                text: owned ? "" : "Чужая охотничья палатка",
            };
        }

        const vehicle = getNearestVehicle();
        if (vehicle) {
            return {
                carcass: null,
                vehicle,
                tent: null,
                storage: true,
                enabled: true,
                text: "",
            };
        }
        return null;
    }

    const timer = getRemainingText(carcass);
    let text = "";
    let enabled = true;
    const ownedByOther = isCarcassOwnedByOther(carcass);

    if (ownedByOther) {
        text = "Туша закреплена за другим охотником";
        enabled = false;
    } else if (carcass.spoiled) {
        text = `${carcass.speciesName}: туша испорчена · ${timer}`;
        enabled = false;
    } else if (carcass.stage === "raw") {
        text = `[E] Разделать и упаковать: ${carcass.speciesName}`;
    } else if (carcass.stage === "bagged") {
        text = "[E] Поднять упакованную тушу";
    }

    return { carcass, vehicle: null, enabled, text };
}

function getMarkerPosition() {
    if (!minigame) return 0;

    const elapsed = Date.now() - minigame.startedAt;
    const phase = elapsed % minigame.cycleMs / minigame.cycleMs;
    return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
}

function drawMinigame() {
    if (!minigame) return;

    const barX = 0.5;
    const barY = 0.79;
    const barWidth = 0.34;
    const barHeight = 0.028;
    const targetX = barX - barWidth / 2 + minigame.target * barWidth;
    const targetWidth = minigame.targetWidth * barWidth;
    const markerX = barX - barWidth / 2 + getMarkerPosition() * barWidth;

    mp.game.graphics.drawRect(barX, barY, barWidth + 0.008, barHeight + 0.012, 8, 10, 14, 220);
    mp.game.graphics.drawRect(barX, barY, barWidth, barHeight, 75, 80, 90, 225);
    mp.game.graphics.drawRect(targetX, barY, targetWidth, barHeight, 75, 215, 120, 235);
    mp.game.graphics.drawRect(markerX, barY, 0.006, barHeight + 0.014, 255, 255, 255, 255);

    drawText(minigame.title, [0.5, 0.735], {
        color: [255, 255, 255, 245],
        scale: [0.48, 0.48],
    });
    drawText("Нажмите SPACE, когда белая метка окажется в зелёной области", [0.5, 0.835], {
        color: [205, 215, 230, 235],
        scale: [0.34, 0.34],
    });
}

function drawProcessingChoice() {
    if (!processingChoice) return;

    mp.game.graphics.drawRect(0.5, 0.76, 0.48, 0.19, 8, 11, 12, 235);
    drawText(`Разделка туши '${processingChoice.speciesName}'`, [0.5, 0.695], {
        color: [100, 235, 125, 245],
        scale: [0.48, 0.48],
    });
    drawText("[M] Крестики-нолики — 1 верёвка и 1 мешок", [0.5, 0.75], {
        color: [235, 235, 235, 245],
        scale: [0.36, 0.36],
    });
    drawText("[A] Автоматически — 3 верёвки и 3 мешка", [0.5, 0.795], {
        color: [235, 205, 125, 245],
        scale: [0.36, 0.36],
    });
    drawText(`Использовано попыток: ${processingChoice.attemptsUsed}/${processingChoice.attemptsMax}`, [0.5, 0.84], {
        color: [175, 180, 190, 235],
        scale: [0.3, 0.3],
    });
}

function drawTicTacToe() {
    if (!ticTacToe) return;

    const size = 0.075;
    const startX = 0.5 - size;
    const startY = 0.68;
    mp.game.graphics.drawRect(0.5, 0.77, 0.35, 0.43, 7, 10, 12, 240);
    drawText(ticTacToe.title || "Разделка туши", [0.5, 0.585], {
        color: [105, 235, 130, 245],
        scale: [0.46, 0.46],
    });

    for (let index = 0; index < 9; index += 1) {
        const row = Math.floor(index / 3);
        const column = index % 3;
        const x = startX + column * size;
        const y = startY + row * size;
        const value = ticTacToe.board[index] || String(index + 1);
        mp.game.graphics.drawRect(x, y, size - 0.004, size - 0.004, 42, 47, 50, 245);
        drawText(value, [x, y - 0.017], {
            color: value === "X"
                ? [90, 230, 120, 255]
                : value === "O"
                    ? [245, 100, 100, 255]
                    : [150, 155, 165, 210],
            scale: [0.6, 0.6],
        });
    }

    drawText("Вы — X. Ход: NUM 1–9", [0.5, 0.93], {
        color: [215, 220, 225, 240],
        scale: [0.34, 0.34],
    });
}

function getNearestPlayerToPed(ped, maxDistance) {
    let nearest = null;
    let distanceToNearest = Number(maxDistance);

    try {
        mp.players.forEachInStreamRange((player) => {
            if (!entityExists(player)) return;

            const distance = getDistance(ped.position, player.position);
            if (distance <= distanceToNearest) {
                nearest = player;
                distanceToNearest = distance;
            }
        });
    } catch {
        const local = mp.players.local;
        if (getDistance(ped.position, local.position) <= distanceToNearest) nearest = local;
    }

    return nearest;
}

function isLocalAnimalController(ped) {
    if (!entityExists(ped)) return false;

    try {
        const controller = ped.controller;
        if (controller && typeof controller === "object") {
            return Number(controller.handle) === Number(mp.players.local.handle) ||
                getEntityRemoteId(controller) === getLocalPlayerId();
        }

        if (Number.isFinite(Number(controller))) {
            return Number(controller) === getLocalPlayerId();
        }
    } catch {}

    try {
        return Boolean(mp.game.network.hasControlOfEntity(ped.handle));
    } catch {
        return false;
    }
}

function requestAnimalControl(ped) {
    if (!entityExists(ped)) return false;
    if (isLocalAnimalController(ped)) return true;

    try {
        mp.game.network.requestControlOfEntity(ped.handle);
    } catch {}

    return isLocalAnimalController(ped);
}

function commandAnimalCombat(ped, target) {
    if (!requestAnimalControl(ped) || !entityExists(target)) return false;

    try {
        if (typeof ped.setBlockingOfNonTemporaryEvents === "function") {
            ped.setBlockingOfNonTemporaryEvents(true);
        }
        if (typeof ped.setFleeAttributes === "function") ped.setFleeAttributes(0, false);
        if (typeof ped.setCombatAbility === "function") ped.setCombatAbility(2);
        if (typeof ped.setCombatRange === "function") ped.setCombatRange(2);
        if (typeof ped.setCombatMovement === "function") ped.setCombatMovement(3);
        if (
            typeof ped.isFleeing === "function" &&
            ped.isFleeing() &&
            typeof ped.clearTasksImmediately === "function"
        ) {
            ped.clearTasksImmediately();
        }
    } catch {}

    try {
        if (typeof ped.taskCombat === "function") {
            ped.taskCombat(target.handle, 0, 16);
            return true;
        }
    } catch {}

    try {
        mp.game.task.combatPed(ped.handle, target.handle, 0, 16);
        return true;
    } catch {}

    return false;
}

function isAnimalVisiblyAttacking(ped) {
    if (!entityExists(ped)) return false;

    try {
        if (typeof ped.isPerformingMeleeAction === "function" && ped.isPerformingMeleeAction()) return true;
    } catch {}

    try {
        if (mp.game.invoke("0xDCCA191DF9980FD7", ped.handle)) return true;
    } catch {}

    return false;
}

function reportAnimalAttackContact(entityId, ped, target, now) {
    if (!isLocalAnimalController(ped) || !entityExists(target)) {
        activeMeleeContacts.delete(entityId);
        return;
    }
    if (getDistance(getRenderedEntityPosition(ped), getRenderedEntityPosition(target)) > 3.15) {
        activeMeleeContacts.delete(entityId);
        return;
    }
    if (!isAnimalVisiblyAttacking(ped)) {
        activeMeleeContacts.delete(entityId);
        return;
    }
    if (activeMeleeContacts.has(entityId)) return;
    if (now - Number(attackContactSentAt.get(entityId) || 0) < 350) return;

    activeMeleeContacts.add(entityId);
    attackContactSentAt.set(entityId, now);
    mp.events.callRemote(
        "hunting:animalAttackContact",
        Number(entityId),
        getEntityRemoteId(target)
    );
}

function commandAnimalFlee(ped, target) {
    if (!requestAnimalControl(ped) || !entityExists(target)) return false;

    try {
        if (typeof ped.taskSmartFlee === "function") {
            ped.taskSmartFlee(target.handle, 120, 12000, false, false);
            return true;
        }
    } catch {}

    try {
        mp.game.task.smartFleePed(ped.handle, target.handle, 120, 12000, false, false);
        return true;
    } catch {}

    return false;
}

function commandAnimalRoam(ped, target) {
    if (!requestAnimalControl(ped) || !target) return false;

    const x = Number(target.x);
    const y = Number(target.y);
    let z = Number(target.z);
    const speed = Number(target.speed || 1.0);

    try {
        mp.game.streaming.requestCollisionAtCoord(x, y, z);
        const ground = mp.game.gameplay.getGroundZFor3dCoord(x, y, z + 100, false, false);
        const groundZ = Number(ground?.z ?? ground);
        if (Number.isFinite(groundZ) && Math.abs(groundZ - z) <= 100) z = groundZ;
    } catch {}

    try {
        if (typeof ped.taskFollowNavMeshToCoord === "function") {
            ped.taskFollowNavMeshToCoord(x, y, z, speed, -1, 2.0, true, 0.0);
            return true;
        }
    } catch {}

    try {
        mp.game.task.followNavMeshToCoord(
            ped.handle,
            x,
            y,
            z,
            speed,
            -1,
            2.0,
            true,
            0.0
        );
        return true;
    } catch {}

    try {
        mp.game.task.goStraightToCoord(ped.handle, x, y, z, speed, -1, 0, 0);
        return true;
    } catch {}

    return false;
}

function recoverStuckAnimal(ped, state, entityId, reactionActive, now) {
    if (!entityExists(ped) || !isLocalAnimalController(ped)) return;
    const position = getRenderedEntityPosition(ped) || ped.position;
    if (!position) return;
    const previous = animalMovementSamples.get(Number(entityId));
    if (!previous || now - Number(previous.at || 0) < 4500) return;
    const moved = getDistance(position, previous.position);
    animalMovementSamples.set(Number(entityId), {
        at: now,
        position: { x: Number(position.x), y: Number(position.y), z: Number(position.z) },
    });
    if (reactionActive || moved >= 0.45) return;
    try { ped.clearTasksImmediately(); } catch {}
    animalGroundSyncAt.delete(Number(entityId));
    snapAnimalToGround(ped, state);
    aiCommandAt.delete(Number(entityId));
    const target = roamTargets.get(Number(entityId));
    if (target) commandAnimalRoam(ped, target);
}

function updateAnimalAi() {
    const now = Date.now();

    liveAnimals.forEach((state, entityId) => {
        const ped = getPed(entityId);
        if (!entityExists(ped)) return;

        try {
            if (typeof ped.isDeadOrDying === "function" && ped.isDeadOrDying(true)) {
                makeAnimalAlive(ped, state);
                aiCommandAt.delete(entityId);
            }
        } catch {}

        const lastCommand = Number(aiCommandAt.get(entityId) || 0);
        const reaction = forcedReactions.get(entityId);
        if (!animalMovementSamples.has(Number(entityId))) {
            const position = getRenderedEntityPosition(ped) || ped.position;
            if (position) {
                animalMovementSamples.set(Number(entityId), {
                    at: now,
                    position: { x: Number(position.x), y: Number(position.y), z: Number(position.z) },
                });
            }
        } else {
            recoverStuckAnimal(
                ped,
                state,
                entityId,
                Boolean(reaction && now < Number(reaction.until || 0)),
                now
            );
        }

        if (reaction && now >= Number(reaction.until || 0)) {
            forcedReactions.delete(entityId);
        } else if (reaction) {
            const attacker = getPlayer(Number(reaction.attackerId));
            if (entityExists(attacker)) {
                const reactionIsAggressive = String(reaction.behavior || state.behavior) === "aggressive";
                if (reactionIsAggressive) {
                    reportAnimalAttackContact(entityId, ped, attacker, now);
                }

                if (now - lastCommand < 900) return;

                const reacted = reactionIsAggressive
                    ? commandAnimalCombat(ped, attacker)
                    : commandAnimalFlee(ped, attacker);

                if (reacted) aiCommandAt.set(entityId, now);
                return;
            }
        }

        const roamTarget = roamTargets.get(entityId);
        if (roamTarget && now - lastCommand >= 4500 && commandAnimalRoam(ped, roamTarget)) {
            aiCommandAt.set(entityId, now);
        }
    });
}

function updateStimulantHearing() {
    // Visual hearing is rendered every frame while the two-minute stimulant is active.
}

mp.events.add("hunting:setup", (raw) => {
    const payload = parsePayload(raw, null);
    if (!payload) return;

    huntingSetupReceived = true;
    serverClockOffsetMs = Date.now() - Number(payload.serverNow || Date.now());
    const nextZones = Array.isArray(payload.zones) ? payload.zones : [];
    const nextSellerSafeZone = payload.sellerSafeZone || null;
    const nextHuntActive = Boolean(payload.hunt?.active);
    const nextZoneFingerprint = JSON.stringify({
        zones: nextZones,
        sellerSafeZone: nextSellerSafeZone,
        huntActive: nextHuntActive,
    });
    zones = nextZones;
    sellerSafeZone = nextSellerSafeZone;
    huntActive = nextHuntActive;
    activeQuest = payload.hunt?.quest || null;
    localOwnerKey = String(payload.localOwnerKey || "");
    zoneFingerprint = nextZoneFingerprint;
    clearAnimalDebugBlips();
    clearCarcassBlips();
    liveAnimals.clear();
    carcasses.clear();
    carcassGroundedAt.clear();
    packedCarcassGroundedAt.clear();
    clearTentBlips();
    tents.clear();
    tentGroundSyncAt.clear();
    forcedReactions.clear();
    roamTargets.clear();
    attackContactSentAt.clear();
    activeMeleeContacts.clear();
    animalGroundSyncAt.clear();
    animalMovementSamples.clear();
    if (tentHoldTimer) clearTimeout(tentHoldTimer);
    tentHoldTimer = null;
    tentHoldStartedAt = 0;
    tentHoldOwnerStaticId = -1;
    tentHoldCompleted = false;
    nearbyTentHintOwnerStaticId = -1;

    // Remove the three legacy native radius handles created by older builds.
    // Matching both exact hunting centres and colours avoids touching areas
    // owned by other resources.
    removeLegacyHuntingRadiusBlips(zones);

    (Array.isArray(payload.animals) ? payload.animals : []).forEach((state) => {
        liveAnimals.set(Number(state.entityId), state);
        applyAnimalState(state);
        syncAnimalDebugBlip(state);
    });

    (Array.isArray(payload.carcasses) ? payload.carcasses : []).forEach((state) => {
        carcasses.set(Number(state.id), state);
        applyCarcassStateWithRetry(state);
        syncCarcassBlip(state);
    });

    (Array.isArray(payload.tents) ? payload.tents : []).forEach((state) => {
        tents.set(Number(state.ownerStaticId), state);
        applyTentStateWithRetry(state);
        syncTentBlip(state);
    });

    // Always rebuild from the authoritative session flag. This also cleans up
    // native radius handles left behind by an older setup/reload.
    createMapBlips();
});

mp.events.add("hunting:animalSpawned", (raw) => {
    const state = parsePayload(raw, null);
    if (!state) return;

    liveAnimals.set(Number(state.entityId), state);
    applyAnimalState(state);
    syncAnimalDebugBlip(state);
});

mp.events.add("hunting:animalReact", (raw) => {
    const payload = parsePayload(raw, null);
    if (!payload) return;

    const entityId = Number(payload.entityId);
    const state = liveAnimals.get(entityId);
    const ped = getPed(entityId);
    const attacker = getPlayer(Number(payload.attackerId));
    if (!state) return;
    if (payload.behavior && !payload.transient) state.behavior = String(payload.behavior);
    const reactionBehavior = String(payload.reactionBehavior || payload.behavior || state.behavior);

    const now = Date.now();
    const currentReaction = forcedReactions.get(entityId);

    if (
        !payload.forced &&
        currentReaction?.forced &&
        now < Number(currentReaction.until || 0)
    ) {
        return;
    }

    forcedReactions.set(entityId, {
        attackerId: Number(payload.attackerId),
        behavior: reactionBehavior,
        forced: Boolean(payload.forced),
        until: now + Math.max(500, Math.min(
            15000,
            Number(payload.durationMs || (payload.forced
                ? (reactionBehavior === "aggressive" ? 15000 : 12000)
                : (reactionBehavior === "aggressive" ? 7000 : 6000)))
        )),
    });

    if (!entityExists(ped) || !entityExists(attacker)) return;
    if (!payload.forced && now - Number(aiCommandAt.get(entityId) || 0) < 4500) return;

    const reacted = reactionBehavior === "aggressive"
        ? commandAnimalCombat(ped, attacker)
        : commandAnimalFlee(ped, attacker);

    if (reacted) aiCommandAt.set(entityId, now);
});

mp.events.add("hunting:animalRemoved", (raw) => {
    const payload = parsePayload(raw, {});
    const entityId = Number(payload.entityId);

    liveAnimals.delete(entityId);
    aiCommandAt.delete(entityId);
    forcedReactions.delete(entityId);
    roamTargets.delete(entityId);
    attackContactSentAt.delete(entityId);
    activeMeleeContacts.delete(entityId);
    animalGroundSyncAt.delete(entityId);
    animalMovementSamples.delete(entityId);
    destroyAnimalDebugBlip(entityId);
});

mp.events.add("hunting:animalKilled", (raw) => {
    const state = parsePayload(raw, null);
    if (!state) return;

    const animalEntityId = Number(state.animalEntityId ?? state.entityId);
    liveAnimals.delete(animalEntityId);
    aiCommandAt.delete(animalEntityId);
    forcedReactions.delete(animalEntityId);
    roamTargets.delete(animalEntityId);
    attackContactSentAt.delete(animalEntityId);
    activeMeleeContacts.delete(animalEntityId);
    animalGroundSyncAt.delete(animalEntityId);
    destroyAnimalDebugBlip(animalEntityId);
    carcasses.set(Number(state.id), state);
    carcassGroundedAt.delete(Number(state.id));
    applyCarcassStateWithRetry(state);
    syncCarcassBlip(state);
    playAnimalKillEffect(state);
});

mp.events.add("hunting:animalHealth", (raw) => {
    const payload = parsePayload(raw, null);
    if (!payload) return;

    const state = liveAnimals.get(Number(payload.entityId));
    if (!state) return;

    state.hits = Number(payload.hits || 0);
    state.hitsRequired = Math.max(1, Number(payload.hitsRequired || 1));
    state.healthPercent = Math.max(0, Number(payload.healthPercent || 0));
    state.spoiled = Boolean(payload.spoiled);
});

mp.events.add("hunting:carcassState", (raw) => {
    const state = parsePayload(raw, null);
    if (!state) return;

    carcasses.set(Number(state.id), state);

    applyCarcassStateWithRetry(state);
    syncCarcassBlip(state);
});

mp.events.add("hunting:carcassRemoved", (raw) => {
    const payload = parsePayload(raw, {});
    const carcassId = Number(payload.id);
    carcasses.delete(carcassId);
    carcassGroundedAt.delete(carcassId);
    packedCarcassGroundedAt.delete(carcassId);
    destroyCarcassBlip(carcassId);
});

mp.events.add("hunting:tentState", (raw) => {
    const state = parsePayload(raw, null);
    if (!state) return;
    tents.set(Number(state.ownerStaticId), state);
    applyTentStateWithRetry(state);
    syncTentBlip(state);
});

mp.events.add("hunting:tentRemoved", (raw) => {
    const payload = parsePayload(raw, {});
    const ownerStaticId = Number(payload.ownerStaticId);
    tents.delete(ownerStaticId);
    tentGroundSyncAt.delete(ownerStaticId);
    destroyTentBlip(ownerStaticId);
    if (tentHoldOwnerStaticId === ownerStaticId) {
        if (tentHoldTimer) clearTimeout(tentHoldTimer);
        tentHoldTimer = null;
        tentHoldStartedAt = 0;
        tentHoldOwnerStaticId = -1;
        tentHoldCompleted = false;
    }
    if (nearbyTentHintOwnerStaticId === ownerStaticId) {
        nearbyTentHintOwnerStaticId = -1;
    }
});

mp.events.add("hunting:moveAnimal", (raw) => {
    const payload = parsePayload(raw, null);
    if (!payload) return;

    const state = liveAnimals.get(Number(payload.entityId));
    const ped = getPed(payload.entityId);
    if (!state) return;

    state.position = {
        x: Number(payload.x),
        y: Number(payload.y),
        z: Number(payload.z),
    };
    roamTargets.set(Number(payload.entityId), {
        x: Number(payload.x),
        y: Number(payload.y),
        z: Number(payload.z),
        speed: Number(payload.speed || 1),
    });
    syncAnimalDebugBlip(state);
    if (!entityExists(ped)) return;

    const reaction = forcedReactions.get(Number(payload.entityId));
    if (reaction && Date.now() < Number(reaction.until || 0)) return;

    try {
        let targetZ = Number(payload.z);

        try {
            const groundResult = mp.game.gameplay.getGroundZFor3dCoord(
                Number(payload.x),
                Number(payload.y),
                targetZ + 100,
                false,
                false
            );
            const groundZ = Number(groundResult?.z ?? groundResult);

            if (Number.isFinite(groundZ) && groundZ > 1) {
                targetZ = groundZ;
            }
        } catch {}

        const roamTarget = roamTargets.get(Number(payload.entityId));
        roamTarget.z = targetZ;

        if (commandAnimalRoam(ped, roamTarget)) {
            aiCommandAt.set(Number(payload.entityId), Date.now());
        }
    } catch {}
});

mp.events.add("hunting:minigameStart", (raw) => {
    const payload = parsePayload(raw, null);
    if (!payload) return;

    minigame = {
        token: String(payload.token),
        title: String(payload.title || "Охота"),
        cycleMs: Math.max(800, Number(payload.cycleMs || 1500)),
        target: Number(payload.target || 0.5),
        targetWidth: Number(payload.targetWidth || 0.2),
        startedAt: Date.now(),
        submitted: false,
    };
});

mp.events.add("hunting:minigameFinish", () => {
    minigame = null;
});

mp.events.add("hunting:processingChoice", (raw) => {
    const payload = parsePayload(raw, null);
    if (!payload) return;
    minigame = null;
    ticTacToe = null;
    processingChoice = {
        carcassId: Number(payload.carcassId),
        speciesName: String(payload.speciesName || "животного"),
        attemptsUsed: Math.max(0, Number(payload.attemptsUsed || 0)),
        attemptsMax: Math.max(1, Number(payload.attemptsMax || 3)),
        submitted: false,
    };
    openHuntingProcessingPage({
        phase: "choice",
        ...processingChoice,
        pending: false,
    });
});

mp.events.add("hunting:processingChoiceClose", () => {
    processingChoice = null;
    if (!ticTacToe) closeHuntingProcessingPage();
});

mp.events.add("hunting:tttStart", (raw) => {
    const payload = parsePayload(raw, null);
    if (!payload) return;
    processingChoice = null;
    minigame = null;
    ticTacToe = {
        token: String(payload.token || ""),
        carcassId: Number(payload.carcassId || 0),
        speciesName: String(payload.speciesName || "животного"),
        title: String(payload.title || "Разделка туши"),
        board: Array.isArray(payload.board) ? payload.board.slice(0, 9) : Array(9).fill(""),
        attemptsUsed: Math.max(0, Number(payload.attemptsUsed || 0)),
        attemptsMax: Math.max(1, Number(payload.attemptsMax || 3)),
        pending: false,
        pendingAt: 0,
    };
    openHuntingProcessingPage({ phase: "ttt", ...ticTacToe });
});

mp.events.add("hunting:tttState", (raw) => {
    const payload = parsePayload(raw, null);
    if (!payload || !ticTacToe || String(payload.token) !== ticTacToe.token) return;
    ticTacToe.board = Array.isArray(payload.board)
        ? payload.board.slice(0, 9)
        : ticTacToe.board;
    ticTacToe.pending = false;
    openHuntingProcessingPage({ phase: "ttt", ...ticTacToe });
});

mp.events.add("hunting:tttFinish", () => {
    ticTacToe = null;
    processingChoice = null;
    closeHuntingProcessingPage();
});

mp.events.add("huntingProcessing:choose", (raw) => {
    const payload = parsePayload(raw, {});
    if (!processingChoice || processingChoice.submitted) return;
    const mode = String(payload.mode || "");
    if (mode !== "minigame" && mode !== "auto") return;
    processingChoice.submitted = true;
    openHuntingProcessingPage({ phase: "choice", ...processingChoice, pending: true });
    mp.events.callRemote(
        "hunting:chooseProcessingMode",
        Number(processingChoice.carcassId),
        mode
    );
    setTimeout(() => {
        if (!processingChoice) return;
        processingChoice.submitted = false;
        openHuntingProcessingPage({ phase: "choice", ...processingChoice, pending: false });
    }, 1800);
});

mp.events.add("huntingProcessing:move", (raw) => {
    const payload = parsePayload(raw, {});
    const cell = Number(payload.cell);
    if (
        !ticTacToe ||
        ticTacToe.pending ||
        String(payload.token || "") !== ticTacToe.token ||
        !Number.isInteger(cell) ||
        cell < 0 ||
        cell > 8 ||
        ticTacToe.board[cell]
    ) return;
    ticTacToe.pending = true;
    ticTacToe.pendingAt = Date.now();
    openHuntingProcessingPage({ phase: "ttt", ...ticTacToe });
    mp.events.callRemote("hunting:tttMove", ticTacToe.token, cell);
});

mp.events.add("huntingProcessing:close", () => {
    if (!processingChoice && !ticTacToe) {
        closeHuntingProcessingPage();
        return;
    }
    openHuntingProcessingPage({
        phase: ticTacToe ? "ttt" : "choice",
        ...(ticTacToe || processingChoice),
        pending: true,
        closing: true,
    });
    mp.events.callRemote("hunting:cancelProcessing");
});

mp.events.add("hunting:notify", (message) => {
    notify(message);
});

mp.events.add("hunting:debugEsp", (enabled) => {
    animalTestEsp = Boolean(enabled);
    if (!animalTestEsp) clearAnimalDebugBlips();
    notify(`VH животных: ${animalTestEsp ? "включён" : "выключен"}.`);
});

function requestHuntingSetup() {
    try {
        mp.events.callRemote("hunting:requestSetup");
    } catch {}
}

function enableOutgoingDamageEvents() {
    try {
        mp.game.weapon.setEnableLocalOutgoingDamage(true);
    } catch {}
}

mp.events.add("playerReady", () => {
    enableOutgoingDamageEvents();
    huntActive = false;
    activeQuest = null;
    zoneFingerprint = "";
    createMapBlips();
    clearTentBlips();
    clearCarcassBlips();
    requestHuntingSetup();
});

mp.events.add("entityControllerChange", (entity, newController) => {
    try {
        const entityId = getEntityRemoteId(entity);
        if (!liveAnimals.has(entityId) || !getHuntingAnimalEntity(entity)) return;
        if (!newController || Number(newController.handle) !== Number(mp.players.local.handle)) return;

        applyAnimalState(liveAnimals.get(entityId));
        aiCommandAt.delete(entityId);
        setTimeout(updateAnimalAi, 50);
    } catch {}
});

mp.events.add("entityStreamIn", (entity) => {
    const remoteId = getEntityRemoteId(entity);

    if (liveAnimals.has(remoteId) && getHuntingAnimalEntity(entity)) {
        applyAnimalState(liveAnimals.get(remoteId));
        aiCommandAt.delete(remoteId);
        setTimeout(updateAnimalAi, 100);
        return;
    }

    carcasses.forEach((state) => {
        if (Number(state.entityId) === remoteId) {
            setTimeout(() => applyCarcassStateWithRetry(state), 100);
        }
    });

    tents.forEach((state) => {
        if (Number(state.entityId) === remoteId) {
            setTimeout(() => applyTentStateWithRetry(state), 100);
        }
    });
});

function reportAnimalHit(target, weaponHash) {
    if (!target || !isHuntingAnimalEntity(target)) return false;

    const remoteId = getEntityRemoteId(target);
    if (!liveAnimals.has(remoteId)) return false;

    const now = Date.now();
    const normalizedWeaponHash = Number(weaponHash || getLocalWeaponHash()) >>> 0;

    if (HUNTING_RIFLE_HASHES.some((hash) => weaponHashesMatch(normalizedWeaponHash, hash))) {
        const state = liveAnimals.get(remoteId);
        const origin = getShotRayOrigin();
        const points = getAnimalShotPoints(state, target);
        if (origin && !hasClearShotLine(origin, points, target, getAnimalShotRadius(state))) {
            global.__twinkleLastHuntingAnimalShot = null;
            return true;
        }
        global.__twinkleLastHuntingAnimalShot = {
            at: now,
            weaponHash: normalizedWeaponHash,
            entityId: remoteId,
        };

        // Firearm shots are sent once by the inventory module so ammo and
        // animal damage are committed by the server in the same operation.
        return true;
    }

    if (now - Number(hitThrottle.get(remoteId) || 0) >= 65) {
        hitThrottle.set(remoteId, now);
        mp.events.callRemote(
            "hunting:hitAnimal",
            remoteId,
            Number(weaponHash || getLocalWeaponHash())
        );
    }

    return true;
}

function tryReportMeleeFallback() {
    const now = Date.now();
    if (now - lastMeleeFallbackAt < 520) return;

    const weaponHash = getLocalWeaponHash();
    if (!weaponHashSetHas(MELEE_WEAPON_HASHES, weaponHash)) return;

    let attacking = false;
    try {
        attacking = [24, 140, 141, 142].some((control) => (
            mp.game.controls.isControlPressed(0, control)
        ));
    } catch {}
    if (!attacking) return;

    const playerPosition = getRenderedEntityPosition(mp.players.local) || mp.players.local.position;
    let nearest = null;
    let nearestDistance = 2.25;

    liveAnimals.forEach((_state, entityId) => {
        const ped = getPed(entityId);
        if (!entityExists(ped)) return;

        const distance = getDistance(playerPosition, getRenderedEntityPosition(ped));
        if (distance > nearestDistance) return;

        nearest = ped;
        nearestDistance = distance;
    });

    if (!nearest) return;
    lastMeleeFallbackAt = now;
    reportAnimalHit(nearest, weaponHash);
}

function findAnimalAtShotPosition(targetPosition, maxDistance = 3.25) {
    if (!targetPosition) return null;

    let nearest = null;
    let nearestDistance = Number(maxDistance);

    liveAnimals.forEach((_state, entityId) => {
        const ped = getPed(entityId);
        if (!entityExists(ped)) return;

        const position = getRenderedEntityPosition(ped);
        const distance = getDistance(position, targetPosition);
        if (distance > nearestDistance) return;

        nearest = ped;
        nearestDistance = distance;
    });

    return nearest;
}

function getHuntingAnimalEntityId(entity) {
    const animal = getHuntingAnimalEntity(entity);
    if (!animal) return -1;

    const directId = getEntityRemoteId(animal);
    if (liveAnimals.has(directId)) return directId;

    let matchedId = -1;
    liveAnimals.forEach((_state, entityId) => {
        if (matchedId >= 0) return;

        const ped = getPed(entityId);
        if (entityExists(ped) && Number(ped.handle) === Number(animal.handle)) {
            matchedId = Number(entityId);
        }
    });

    return matchedId;
}

function getShotRayOrigin() {
    try {
        const camera = mp.game.cam.getGameplayCamCoord();
        if (camera) return camera;
    } catch {}
    return getRenderedEntityPosition(mp.players.local) || mp.players.local.position;
}

function getGameplayCameraRayEnd(origin, distance = 430) {
    if (!origin) return null;
    try {
        const rotation = mp.game.cam.getGameplayCamRot(2);
        if (!rotation) return null;
        const pitch = Number(rotation.x || 0) * Math.PI / 180;
        const yaw = Number(rotation.z || 0) * Math.PI / 180;
        const horizontal = Math.abs(Math.cos(pitch));
        return {
            x: Number(origin.x) - Math.sin(yaw) * horizontal * Number(distance),
            y: Number(origin.y) + Math.cos(yaw) * horizontal * Number(distance),
            z: Number(origin.z) + Math.sin(pitch) * Number(distance),
        };
    } catch {
        return null;
    }
}

function getPointToSegmentDistance(point, start, end) {
    if (!point || !start || !end) return { distance: Number.MAX_SAFE_INTEGER, t: -1 };
    const ab = {
        x: Number(end.x) - Number(start.x),
        y: Number(end.y) - Number(start.y),
        z: Number(end.z) - Number(start.z),
    };
    const ap = {
        x: Number(point.x) - Number(start.x),
        y: Number(point.y) - Number(start.y),
        z: Number(point.z) - Number(start.z),
    };
    const lengthSquared = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
    if (lengthSquared <= 0.0001) return { distance: getDistance(point, start), t: 0 };
    const rawT = (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / lengthSquared;
    const t = Math.max(0, Math.min(1, rawT));
    const projected = {
        x: Number(start.x) + ab.x * t,
        y: Number(start.y) + ab.y * t,
        z: Number(start.z) + ab.z * t,
    };
    return { distance: getDistance(point, projected), t: rawT };
}

function getAnimalShotRadius(state) {
    return ["dove", "cormorant", "hawk", "rabbit"].includes(String(state?.speciesId || ""))
        ? 1.65
        : 2.8;
}

function getAnimalShotPoints(state, ped) {
    const root = getRenderedEntityPosition(ped) || getAnimalPosition(state);
    if (!root) return [];
    const points = [root];
    const head = getAnimalEspAnchor(ped);
    if (head) {
        points.push(head, {
            x: (Number(root.x) + Number(head.x)) / 2,
            y: (Number(root.y) + Number(head.y)) / 2,
            z: (Number(root.z) + Number(head.z)) / 2,
        });
    }
    return points;
}

function hasClearShotLine(origin, points, ped, tolerance = 1.2) {
    if (!origin || !Array.isArray(points) || points.length === 0) return false;
    if (!mp.raycasting || typeof mp.raycasting.testPointToPoint !== "function") return true;

    // Map + objects. Vegetation is intentionally excluded so bushes do not
    // turn a visually clear hunting shot into a false miss.
    return [...points].reverse().some((point) => {
        try {
            const start = new mp.Vector3(Number(origin.x), Number(origin.y), Number(origin.z));
            const end = new mp.Vector3(Number(point.x), Number(point.y), Number(point.z));
            const hit = mp.raycasting.testPointToPoint(start, end, mp.players.local, 17);
            if (!hit) return true;
            if (
                hit.entity && ped &&
                Number(hit.entity.handle) === Number(ped.handle)
            ) return true;
            return Boolean(
                hit.position && getDistance(hit.position, point) <= Number(tolerance)
            );
        } catch {
            return true;
        }
    });
}

function resolveHuntingShotTarget(targetPosition, targetEntity, maxDistance = 7.5) {
    const origin = getShotRayOrigin();
    const directId = getHuntingAnimalEntityId(targetEntity);
    if (directId >= 0) {
        const state = liveAnimals.get(directId);
        const ped = getPed(directId) || targetEntity;
        const points = getAnimalShotPoints(state, ped);
        return !origin || hasClearShotLine(origin, points, ped, getAnimalShotRadius(state))
            ? directId
            : -1;
    }

    if (targetPosition) {
        const endpointCandidates = [];
        liveAnimals.forEach((state, entityId) => {
            const ped = getPed(entityId);
            if (!entityExists(ped)) return;
            const points = getAnimalShotPoints(state, ped);
            const distance = points.reduce(
                (best, point) => Math.min(best, getDistance(point, targetPosition)),
                Number.MAX_SAFE_INTEGER
            );
            if (distance <= Number(maxDistance)) {
                endpointCandidates.push({
                    id: Number(entityId), state, ped, points, distance,
                });
            }
        });
        endpointCandidates.sort((a, b) => a.distance - b.distance);
        const visibleEndpoint = endpointCandidates.find((candidate) => (
            !origin || hasClearShotLine(
                origin,
                candidate.points,
                candidate.ped,
                getAnimalShotRadius(candidate.state)
            )
        ));
        if (visibleEndpoint) return visibleEndpoint.id;
    }

    // На дальних дистанциях RAGE нередко не передаёт targetEntity, а
    // targetPosition находится за моделью. Ищем ped вдоль фактического луча,
    // а не только в сфере возле конечной точки.
    if (!origin) return -1;
    const rayEnds = [];
    if (targetPosition && getDistance(origin, targetPosition) > 2) rayEnds.push(targetPosition);
    const cameraRayEnd = getGameplayCameraRayEnd(origin, 430);
    if (cameraRayEnd) rayEnds.push(cameraRayEnd);
    if (rayEnds.length === 0) return -1;
    const rayCandidates = new Map();
    liveAnimals.forEach((state, entityId) => {
        const ped = getPed(entityId);
        if (!entityExists(ped)) return;
        const position = getRenderedEntityPosition(ped) || getAnimalPosition(state);
        if (!position || getDistance(origin, position) > 425) return;
        getAnimalShotPoints(state, ped).forEach((point) => {
            rayEnds.forEach((rayEnd) => {
                const candidate = getPointToSegmentDistance(point, origin, rayEnd);
                if (candidate.t < 0 || candidate.t > 1.05) return;
                if (candidate.distance > getAnimalShotRadius(state)) return;
                const current = rayCandidates.get(Number(entityId));
                const alongDistance = getDistance(origin, point);
                if (
                    !current || candidate.distance < current.rayDistance ||
                    (
                        Math.abs(candidate.distance - current.rayDistance) < 0.01 &&
                        alongDistance < current.alongDistance
                    )
                ) {
                    rayCandidates.set(Number(entityId), {
                        id: Number(entityId), state, ped,
                        points: getAnimalShotPoints(state, ped),
                        rayDistance: candidate.distance,
                        alongDistance,
                    });
                }
            });
        });
    });

    const ordered = Array.from(rayCandidates.values()).sort((a, b) => (
        a.rayDistance - b.rayDistance || a.alongDistance - b.alongDistance
    ));
    const visible = ordered.find((candidate) => hasClearShotLine(
        origin,
        candidate.points,
        candidate.ped,
        getAnimalShotRadius(candidate.state)
    ));
    return visible ? visible.id : -1;
}

global.__twinkleResolveHuntingShotTarget = resolveHuntingShotTarget;

mp.events.add("playerWeaponShot", (targetPosition, targetEntity) => {
    try {
        const entityId = resolveHuntingShotTarget(targetPosition, targetEntity);
        const weaponHash = getLocalWeaponHash();

        // Реакция на звук не зависит от того, попал ли стрелок в животное.
        // Сервер дополнительно ограничивает частоту этого события.
        mp.events.callRemote("hunting:gunshotHeard", weaponHash);

        if (entityId >= 0 && HUNTING_RIFLE_HASHES.some((hash) => weaponHashesMatch(weaponHash, hash))) {
            global.__twinkleLastHuntingAnimalShot = {
                at: Date.now(),
                weaponHash,
                entityId,
            };
        }
    } catch {}
});

mp.events.add("outgoingDamage", (sourceEntity, targetEntity, sourcePlayer, weapon) => {
    try {
        const animalSource = getHuntingAnimalEntity(sourceEntity);
        if (animalSource) return false;

        const localSource = isLocalDamageSource(sourceEntity, sourcePlayer);
        const animal = getHuntingAnimalEntity(targetEntity);

        if (animal && localSource) {
            reportAnimalHit(animal, weapon);
            return true;
        }

        if (!localSource) return false;

        const playerTarget = isRealPlayerEntity(targetEntity) &&
            Number(targetEntity.handle) !== Number(mp.players.local.handle)
            ? targetEntity
            : null;

        if (playerTarget) {
            const damageWeaponHash = Number(weapon || getLocalWeaponHash()) >>> 0;
            const localZone = getZoneAt(mp.players.local.position);
            const targetZone = getZoneAt(playerTarget.position);
            const sellerSafe = isInsideSellerSafeZone(mp.players.local.position) ||
                isInsideSellerSafeZone(playerTarget.position);

            if (HUNTING_RIFLE_HASHES.some((hash) => weaponHashesMatch(damageWeaponHash, hash))) {
                if (localZone || targetZone || sellerSafe) {
                    notify("Охотничья винтовка не наносит урон игрокам.", "error");
                    reportBlockedPvpAttempt(playerTarget, damageWeaponHash, "hunting_rifle");
                }
                return true;
            }

            if (localZone || targetZone || sellerSafe) {
                const now = Date.now();
                if (now - lastPvpWarningAt > 1800) {
                    notify("В охотничьих зонах запрещено наносить урон игрокам.", "error");
                    reportBlockedPvpAttempt(playerTarget, damageWeaponHash, "weapon");
                }

                return true;
            }
        }

        return false;
    } catch {
        return false;
    }
});

mp.events.add("meleeActionDamage", (source, target, weaponHash) => {
    try {
        if (getHuntingAnimalEntity(source)) return false;

        const localSource = isLocalDamageSource(source);
        const animal = getHuntingAnimalEntity(target);
        if (animal && localSource) {
            reportAnimalHit(animal, weaponHash);
            return true;
        }

        if (!localSource) return false;

        const playerTarget = isRealPlayerEntity(target) &&
            Number(target.handle) !== Number(mp.players.local.handle)
            ? target
            : null;

        if (
            playerTarget &&
            (
                getZoneAt(mp.players.local.position) ||
                getZoneAt(playerTarget.position) ||
                isInsideSellerSafeZone(mp.players.local.position) ||
                isInsideSellerSafeZone(playerTarget.position)
            )
        ) {
            const now = Date.now();
            if (now - lastPvpWarningAt > 1800) {
                notify("В охотничьих зонах запрещено наносить урон игрокам.", "error");
                reportBlockedPvpAttempt(playerTarget, weaponHash, "melee");
            }

            return true;
        }

        return false;
    } catch {
        return false;
    }
});

mp.events.add("incomingDamage", (_sourceEntity, sourcePlayer, targetEntity) => {
    try {
        if (targetEntity && Number(targetEntity.handle) !== Number(mp.players.local.handle)) return false;
        if (isInsideSellerSafeZone(mp.players.local.position)) return true;
        if (isHuntingAnimalEntity(_sourceEntity) || isHuntingAnimalEntity(sourcePlayer)) return true;

        return Boolean(
            isRealPlayerEntity(sourcePlayer) &&
            (
                getZoneAt(mp.players.local.position) ||
                getZoneAt(sourcePlayer.position)
            )
        );
    } catch {
        return false;
    }
});

bindKey(INTERACT_KEY, true, () => {
    // keyHold=true runs repeatedly while E remains pressed. Keep exactly one
    // timer/server hold instead of restarting the 1.2s threshold every frame.
    if (tentHoldCompleted || tentHoldTimer || tentHoldOwnerStaticId > 0) return;
    if (
        minigame || processingChoice || ticTacToe || isInputBlocked() ||
        getLocalCarriedCarcass() || mp.players.local.vehicle
    ) return;
    const tent = getNearestOwnedTent();
    if (!tent) return;
    if (tentHoldTimer) clearTimeout(tentHoldTimer);
    tentHoldCompleted = false;
    tentHoldStartedAt = Date.now();
    tentHoldOwnerStaticId = Number(tent.ownerStaticId || -1);
    mp.events.callRemote("hunting:tentHoldStart", tentHoldOwnerStaticId);
    tentHoldTimer = setTimeout(() => {
        tentHoldTimer = null;
        const ownerStaticId = tentHoldOwnerStaticId;
        const currentTent = getNearestOwnedTent();
        const canFold = ownerStaticId > 0 && currentTent &&
            Number(currentTent.ownerStaticId) === ownerStaticId &&
            !minigame && !processingChoice && !ticTacToe &&
            !isInputBlocked() && !getLocalCarriedCarcass() &&
            !mp.players.local.vehicle;
        tentHoldStartedAt = 0;
        tentHoldOwnerStaticId = -1;
        if (!canFold) {
            mp.events.callRemote("hunting:tentHoldCancel");
            return;
        }
        tentHoldCompleted = true;
        // Fold while E is still held; releasing the key only clears the local
        // completion flag and cannot trigger a second interaction.
        mp.events.callRemote("hunting:tentFoldAll", ownerStaticId);
    }, 1200);
});

bindKey(INTERACT_KEY, false, () => {
    if (minigame || processingChoice || ticTacToe || isInputBlocked()) return;

    if (tentHoldCompleted) {
        tentHoldCompleted = false;
        return;
    }

    if (tentHoldOwnerStaticId > 0) {
        if (tentHoldTimer) clearTimeout(tentHoldTimer);
        tentHoldTimer = null;
        tentHoldStartedAt = 0;
        tentHoldOwnerStaticId = -1;
        mp.events.callRemote("hunting:tentHoldCancel");
    }

    const prompt = getInteractionPrompt();
    if (!prompt || !prompt.enabled) return;

    const vehicleId = prompt.vehicle ? getEntityRemoteId(prompt.vehicle) : -1;
    const carcassId = prompt.carcass ? Number(prompt.carcass.id) : -1;

    if (prompt.storage) {
        mp.events.callRemote(
            "hunting:storageInteract",
            vehicleId,
            Number(prompt.tent?.ownerStaticId || -1)
        );
        return;
    }

    mp.events.callRemote(
        "hunting:interact",
        carcassId,
        vehicleId,
        getLocalWeaponHash()
    );
});

bindKey(MINIGAME_KEY, false, () => {
    if (!minigame || minigame.submitted) return;
    if (Date.now() - minigame.startedAt < 550) return;

    minigame.submitted = true;
    mp.events.callRemote("hunting:minigameResult", minigame.token, getMarkerPosition());
});

mp.events.add("render", () => {
    const zone = getZoneAt(mp.players.local.position);
    const insideSellerSafeZone = isInsideSellerSafeZone(mp.players.local.position);

    if (insideSellerSafeZone) {
        try {
            [24, 25, 47, 58, 140, 141, 142, 257, 263, 264].forEach((control) => {
                mp.game.controls.disableControlAction(0, control, true);
            });
        } catch {}
    }

    if (zone && huntActive) {
        drawText(`${zone.name} · ${zone.subtitle}`, [0.5, 0.9], {
            color: zone.color || [255, 255, 255, 230],
            scale: [0.47, 0.47],
        });
    }

    drawAnimalTestEsp();
    drawStimulantHearing();
    drawActiveHuntingTask();
    tryReportMeleeFallback();

    if (minigame || processingChoice || ticTacToe) {
        try {
            mp.game.controls.disableControlAction(0, 22, true);
            mp.game.controls.disableControlAction(0, 24, true);
            mp.game.controls.disableControlAction(0, 25, true);
        } catch {}

        if (minigame) drawMinigame();
        if (ticTacToe) {
            if (ticTacToe.pending && Date.now() - Number(ticTacToe.pendingAt || 0) > 1800) {
                ticTacToe.pending = false;
            }
        }
        return;
    }

    drawCarcassLabels();

    const prompt = getInteractionPrompt();
    if (prompt && prompt.text) {
        drawText(prompt.text, [0.5, 0.84], {
            color: prompt.enabled ? [255, 255, 255, 240] : [255, 125, 125, 235],
            scale: [0.39, 0.39],
        });
    }
});

setInterval(() => {
    updateAnimalAi();
    updateStimulantHearing();

    const nearbyOwnedTent = huntActive ? getNearestOwnedTent() : null;
    const nearbyOwnerStaticId = Number(nearbyOwnedTent?.ownerStaticId || -1);
    if (nearbyOwnerStaticId > 0) {
        if (
            nearbyTentHintOwnerStaticId !== nearbyOwnerStaticId &&
            !isInputBlocked() && !getLocalCarriedCarcass()
        ) {
            notify("Удерживайте E, чтобы свернуть палатку.");
            nearbyTentHintOwnerStaticId = nearbyOwnerStaticId;
        }
    } else {
        // Leaving the interaction radius arms the one-time hint for the next
        // approach, without spamming it while the player remains nearby.
        nearbyTentHintOwnerStaticId = -1;
    }

    if (animalTestEsp && ANIMAL_TEST_MAP_BLIPS) {
        liveAnimals.forEach(syncAnimalDebugBlip);
    }

    carcasses.forEach((state) => {
        if (state.stage === "carried") applyCarcassState(state);
    });

    const carried = getLocalCarriedCarcass();
    let jumping = false;

    if (carried && !minigame) {
        try {
            jumping = Boolean(mp.game.invoke("0xCEDABC5900A0BF97", mp.players.local.handle));
        } catch {}
    }

    if (jumping && !wasJumping) {
        mp.events.callRemote("hunting:jumpWhileCarrying");
    }

    wasJumping = jumping;
}, AI_TICK_MS);

setTimeout(requestHuntingSetup, 1500);
setTimeout(enableOutgoingDamageEvents, 1000);
setInterval(() => {
    if (!huntingSetupReceived) requestHuntingSetup();
}, 5000);

console.log("[HUNTING] Client loaded");
