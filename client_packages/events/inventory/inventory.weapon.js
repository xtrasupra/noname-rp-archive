"use strict";

const MUSKET_HASH = Number(mp.game.joaat("weapon_musket")) >>> 0;
const SNIPER_RIFLE_HASH = Number(mp.game.joaat("weapon_sniperrifle")) >>> 0;
const LARGE_SCOPE_COMPONENT_HASH = Number(mp.game.joaat("COMPONENT_AT_SCOPE_LARGE")) >>> 0;
const trackedAmmo = new Map();
let lastWeaponShotEventAt = 0;

function weaponHashesMatch(left, right) {
    const a = Number(left || 0) >>> 0;
    const b = Number(right || 0) >>> 0;
    return Boolean(a && b && (a === b || (Math.fround(a) >>> 0) === (Math.fround(b) >>> 0)));
}

function syncWeaponAmmo(weaponHash, ammo) {
    const hash = Number(weaponHash || 0);
    const ammoAmount = Math.max(0, Number(ammo || 0));
    if (!hash) return;

    trackedAmmo.set(hash >>> 0, ammoAmount);

    try {
        mp.game.weapon.setPedAmmo(mp.players.local.handle, hash, ammoAmount);
    } catch {}

    if (weaponHashesMatch(hash, MUSKET_HASH) && ammoAmount > 0) {
        try {
            mp.game.weapon.setAmmoInClip(mp.players.local.handle, hash, 1);
        } catch {}
    }
}

function getNativeAmmo(weaponHash) {
    const hash = Number(weaponHash || 0);
    if (!hash) return null;

    try {
        const ammo = mp.game.weapon.getAmmoInPed(mp.players.local.handle, hash);
        if (Number.isFinite(Number(ammo))) return Math.max(0, Number(ammo));
    } catch {}

    try {
        const ammo = mp.game.invoke("0x015A522136D7F951", mp.players.local.handle, hash);
        if (Number.isFinite(Number(ammo))) return Math.max(0, Number(ammo));
    } catch {}

    return null;
}

function selectInventoryWeapon(weaponHash) {
    const hash = Number(weaponHash || 0);
    if (!hash) return;

    try {
        mp.game.weapon.setCurrentPed(mp.players.local.handle, hash, true);
        return;
    } catch {}

    try {
        mp.game.invoke("0xADF692B254977C0C", mp.players.local.handle, hash, true);
    } catch {}
}

function getCurrentWeaponHash() {
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

function syncShot(weaponHash, amount = 1, animalEntityId = -1) {
    try {
        mp.events.callRemote(
            "inventory:server:weaponShot",
            Number(weaponHash || 0),
            Math.max(1, Math.min(30, Number(amount || 1))),
            Number(animalEntityId)
        );
    } catch (e) {
        try {
            mp.console.logError(`[INVENTORY WEAPON SHOT ERROR] ${e.message}`);
        } catch {}
    }
}

function removeInventoryWeapon(weaponHash) {
    const hash = Number(weaponHash || 0);
    if (!hash) return;

    trackedAmmo.delete(hash >>> 0);
    let removed = false;

    try {
        mp.game.weapon.removeFromPed(mp.players.local.handle, hash);
        removed = true;
    } catch {}

    if (!removed) {
        try {
            mp.game.invoke("0x4899CB088EDF59B8", mp.players.local.handle, hash);
        } catch {}
    }

    pushWeaponHud(0, 0, "", 0, false);
}

mp.events.add("inventory:client:weaponEquipped", (weaponHash, ammo, third = false, totalAmmo = null, isVisible = true) => {
    const hash = Number(weaponHash || 0);
    const ammoAmount = Number(ammo || 0);
    const selectInHand = typeof third === "boolean" ? third : false;
    const weaponName = typeof third === "string" ? third : "";

    syncWeaponAmmo(hash, ammoAmount);
    pushWeaponHud(hash, ammoAmount, weaponName, totalAmmo, isVisible);
    if (weaponHashesMatch(hash, SNIPER_RIFLE_HASH)) {
        try {
            mp.game.invoke(
                "0xD966D51AA5B28BB9",
                mp.players.local.handle,
                hash,
                LARGE_SCOPE_COMPONENT_HASH
            );
        } catch {}
    }

    if (selectInHand) {
        selectInventoryWeapon(hash);
    }

    setTimeout(() => {
        syncWeaponAmmo(hash, ammoAmount);
        if (selectInHand) selectInventoryWeapon(hash);
    }, 250);
});

mp.events.add("inventory:client:weaponRemoved", (weaponHash) => {
    removeInventoryWeapon(weaponHash);
});

mp.events.add("inventory:client:weaponShotResult", (weaponHash, ammo, accepted, reason = "") => {
    if (!accepted) {
        try {
            mp.console.logWarning(`[INVENTORY WEAPON] shot rejected: ${String(reason || "unknown")}`);
        } catch {}
        return;
    }
    syncWeaponAmmo(Number(weaponHash || 0), Number(ammo || 0));
    pushWeaponHud(weaponHash, ammo);
});

mp.events.add("render", () => {
    try {
        mp.game.ui.displayAmmoThisFrame(false);
        mp.game.ui.hideHudComponentThisFrame(2);
        mp.game.ui.hideHudComponentThisFrame(19);
        mp.game.ui.hideHudComponentThisFrame(20);
        mp.game.controls.disableControlAction(0, 14, true);
        mp.game.controls.disableControlAction(0, 15, true);
        mp.game.controls.disableControlAction(0, 37, true);
        mp.game.controls.disableControlAction(0, 157, true);
        mp.game.controls.disableControlAction(0, 158, true);
        mp.game.controls.disableControlAction(0, 159, true);
        mp.game.controls.disableControlAction(0, 160, true);
        mp.game.controls.disableControlAction(0, 161, true);
    } catch {}
});

mp.events.add("playerWeaponShot", (targetPosition, targetEntity) => {
    const weaponHash = getCurrentWeaponHash();
    if (!weaponHash) return;

    const shotAt = Date.now();
    if (shotAt - lastWeaponShotEventAt < 120) return;
    lastWeaponShotEventAt = shotAt;

    const nativeAmmo = getNativeAmmo(weaponHash);
    if (nativeAmmo !== null) trackedAmmo.set(Number(weaponHash) >>> 0, nativeAmmo);

    let animalEntityId = -1;

    try {
        if (typeof global.__twinkleResolveHuntingShotTarget === "function") {
            animalEntityId = Number(
                global.__twinkleResolveHuntingShotTarget(targetPosition, targetEntity)
            );
        }
    } catch {}

    if (!Number.isInteger(animalEntityId) || animalEntityId < 0) {
        const huntingShot = global.__twinkleLastHuntingAnimalShot;
        const handledByHunting = huntingShot &&
            weaponHashesMatch(huntingShot.weaponHash, weaponHash) &&
            Number(huntingShot.at || 0) >= shotAt - 75 &&
            Date.now() - Number(huntingShot.at || 0) < 300;

        animalEntityId = handledByHunting ? Number(huntingShot.entityId) : -1;
    }

    syncShot(weaponHash, 1, animalEntityId);
});

setInterval(() => {
    const weaponHash = Number(getCurrentWeaponHash() || 0);
    if (!weaponHash) return;

    const normalizedHash = weaponHash >>> 0;
    const nativeAmmo = getNativeAmmo(weaponHash);
    if (nativeAmmo === null) return;

    const previousAmmo = trackedAmmo.get(normalizedHash);
    if (previousAmmo === undefined) {
        trackedAmmo.set(normalizedHash, nativeAmmo);
        return;
    }

    if (nativeAmmo < previousAmmo) {
        const difference = Math.min(30, previousAmmo - nativeAmmo);

        if (Date.now() - lastWeaponShotEventAt > 350) {
            const huntingShot = global.__twinkleLastHuntingAnimalShot;
            const animalEntityId = huntingShot &&
                weaponHashesMatch(huntingShot.weaponHash, normalizedHash) &&
                Date.now() - Number(huntingShot.at || 0) < 700
                ? Number(huntingShot.entityId)
                : -1;
            syncShot(weaponHash, difference, animalEntityId);
        }
    }

    trackedAmmo.set(normalizedHash, nativeAmmo);
}, 150);

function pushWeaponHud(weaponHash, ammo, weaponName = "", totalAmmo = null, isVisible = true) {
    try {
        mp.events.call("c:hud:update", JSON.stringify({
            player: {
                gun: {
                    isVisible: Boolean(isVisible && Number(weaponHash || 0)),
                    weaponHash: Number(weaponHash || 0),
                    weaponName: String(weaponName || "Оружие"),
                    ammo: Math.max(0, Number(ammo || 0)),
                    totalAmmo: Math.max(0, Number(totalAmmo ?? ammo ?? 0)),
                },
            },
        }));
    } catch {}
}

const weaponOutfitObjects = new Map();
const weaponOutfitSyncing = new Set();
const weaponOutfitPending = new Map();
const weaponOutfitGenerations = new Map();

const WEAPON_OUTFIT_DEFAULT_MODEL = "prop_paper_bag_small";
const WEAPON_OUTFIT_BONES = {
    pistol: 51826,
    smg: 58271,
    back: 24818,
};
const WEAPON_OUTFIT_TRANSFORMS = {
    pistol: {
        bone: WEAPON_OUTFIT_BONES.back,
        offset: { x: -0.08, y: -0.16, z: 0.08 },
        rotation: { x: 0.0, y: 0.0, z: 8.0 },
    },
    smg: {
        bone: WEAPON_OUTFIT_BONES.back,
        offset: { x: -0.11, y: -0.17, z: -0.02 },
        rotation: { x: 0.0, y: 0.0, z: 8.0 },
    },
    shotgun: {
        bone: WEAPON_OUTFIT_BONES.back,
        offset: { x: -0.12, y: -0.18, z: 0.12 },
        rotation: { x: 0.0, y: 0.0, z: 8.0 },
    },
    rifle: {
        bone: WEAPON_OUTFIT_BONES.back,
        offset: { x: -0.13, y: -0.18, z: -0.13 },
        rotation: { x: 0.0, y: 0.0, z: 8.0 },
    },
};

function parseJsonSafe(value, fallback = {}) {
    try {
        if (!value) return fallback;
        if (typeof value === "object") return value;
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function playerVisualKey(player) {
    return Number(player?.remoteId ?? player?.id ?? -1);
}

function visualObjectKey(player, uid) {
    return String(playerVisualKey(player)) + ":" + String(uid);
}

function playerExists(player) {
    try {
        return Boolean(player && mp.players.exists(player));
    } catch {
        return false;
    }
}

function hashModel(model) {
    if (typeof model === "number") return model;
    return mp.game.joaat(String(model || WEAPON_OUTFIT_DEFAULT_MODEL));
}

async function loadModel(model, attempts = 240) {
    const hash = hashModel(model);
    if (!mp.game.streaming.isModelValid(hash) || !mp.game.streaming.isModelInCdimage(hash)) return null;

    mp.game.streaming.requestModel(hash);
    for (let i = 0; i < attempts; i += 1) {
        if (mp.game.streaming.hasModelLoaded(hash)) return hash;
        mp.game.streaming.requestModel(hash);
        await mp.game.waitAsync(10);
    }

    return null;
}

function normalizeModelName(model) {
    return String(model || "").toLowerCase();
}

function getWeaponOutfitKind(weapon) {
    const model = normalizeModelName(weapon?.model);
    const itemId = String(weapon?.itemId || "").toLowerCase();

    if (model.startsWith("w_pi_") || itemId.includes("pistol") || itemId.includes("revolver") || itemId.includes("stungun")) {
        return "pistol";
    }

    if (model.startsWith("w_sb_") || itemId.includes("smg") || itemId.includes("pdw")) {
        return "smg";
    }

    if (model.startsWith("w_sg_") || itemId.includes("shotgun")) {
        return "shotgun";
    }

    return "rifle";
}

function getWeaponOutfitTransform(weapon) {
    return WEAPON_OUTFIT_TRANSFORMS[getWeaponOutfitKind(weapon)] || WEAPON_OUTFIT_TRANSFORMS.rifle;
}

function destroyWeaponOutfitByKey(key) {
    const object = weaponOutfitObjects.get(key);
    if (!object) return;

    try {
        if (mp.objects.exists(object)) object.destroy();
    } catch {}

    weaponOutfitObjects.delete(key);
}

function destroyWeaponOutfits(player) {
    const prefix = String(playerVisualKey(player)) + ":";
    Array.from(weaponOutfitObjects.keys()).forEach((key) => {
        if (key.startsWith(prefix)) destroyWeaponOutfitByKey(key);
    });
}

function cancelWeaponOutfitSync(player) {
    const playerKey = playerVisualKey(player);
    weaponOutfitGenerations.set(playerKey, Number(weaponOutfitGenerations.get(playerKey) || 0) + 1);
    weaponOutfitPending.delete(playerKey);
    destroyWeaponOutfits(player);
}

function attachWeaponOutfitObject(object, player, weapon) {
    if (!object || object.handle === 0 || !playerExists(player) || player.handle === 0) {
        return false;
    }

    const transform = getWeaponOutfitTransform(weapon);
    const offset = transform.offset;
    const rotation = transform.rotation;

    try {
        const bone = player.getBoneIndex(transform.bone);
        object.setCollision(false, false);
        object.attachTo(
            player.handle,
            bone,
            offset.x,
            offset.y,
            offset.z,
            rotation.x,
            rotation.y,
            rotation.z,
            false,
            false,
            false,
            false,
            2,
            true
        );
        return true;
    } catch (e) {
        try {
            mp.console.logError("[INVENTORY WEAPON OUTFIT ATTACH ERROR] " + e.message);
        } catch {}
        return false;
    }
}

async function ensureWeaponOutfit(player, weapon) {
    if (!weapon?.uid || !weapon?.model || !playerExists(player)) return;

    const key = visualObjectKey(player, weapon.uid);
    const current = weaponOutfitObjects.get(key);
    if (current) {
        try {
            if (mp.objects.exists(current)) {
                if (current.handle !== 0) attachWeaponOutfitObject(current, player, weapon);
                return;
            }
        } catch {}
        weaponOutfitObjects.delete(key);
    }

    const hash = await loadModel(weapon.model);
    if (!hash || !playerExists(player)) return;

    try {
        const object = mp.objects.new(hash, player.position, {
            dimension: Number(player.dimension || 0),
        });
        object.notifyStreaming = true;
        object.__twinkleWeaponOutfit = { player, weapon };
        weaponOutfitObjects.set(key, object);

        for (let i = 0; i < 160; i += 1) {
            if (!playerExists(player)) {
                destroyWeaponOutfitByKey(key);
                return;
            }

            if (!mp.objects.exists(object)) {
                weaponOutfitObjects.delete(key);
                return;
            }

            if (object.handle !== 0 && attachWeaponOutfitObject(object, player, weapon)) return;
            await mp.game.waitAsync(0);
        }

        destroyWeaponOutfitByKey(key);
    } catch (e) {
        destroyWeaponOutfitByKey(key);
        try {
            mp.console.logError("[INVENTORY WEAPON OUTFIT ERROR] " + e.message);
        } catch {}
    }
}

function getWeaponOutfitPayload(player, raw = null) {
    const payload = parseJsonSafe(raw ?? player.getVariable("inventoryQuickWeapons"), {});
    const activeUid = String(payload.activeUid || player.getVariable("activeWeaponUid") || "");
    const weapons = Array.isArray(payload.weapons) ? payload.weapons : [];

    return { activeUid, weapons };
}

async function syncWeaponOutfits(player, raw = null) {
    if (!playerExists(player)) return;

    const playerKey = playerVisualKey(player);
    const generation = Number(weaponOutfitGenerations.get(playerKey) || 0) + 1;
    weaponOutfitGenerations.set(playerKey, generation);
    weaponOutfitPending.set(playerKey, { player, raw, generation });
    if (weaponOutfitSyncing.has(playerKey)) return;
    weaponOutfitSyncing.add(playerKey);

    try {
        while (weaponOutfitPending.has(playerKey)) {
            const request = weaponOutfitPending.get(playerKey);
            weaponOutfitPending.delete(playerKey);
            if (!request || !playerExists(request.player)) continue;

            const payload = getWeaponOutfitPayload(request.player, request.raw);
            const visible = payload.weapons.filter((weapon) => {
                return weapon?.uid && weapon?.model && String(weapon.uid) !== payload.activeUid;
            });
            const allowedKeys = new Set(visible.map((weapon) => visualObjectKey(request.player, weapon.uid)));
            const prefix = String(playerKey) + ":";

            Array.from(weaponOutfitObjects.keys()).forEach((objectKey) => {
                if (objectKey.startsWith(prefix) && !allowedKeys.has(objectKey)) {
                    destroyWeaponOutfitByKey(objectKey);
                }
            });

            for (const weapon of visible) {
                await ensureWeaponOutfit(request.player, weapon);
                if (weaponOutfitGenerations.get(playerKey) !== request.generation) break;
            }
        }
    } finally {
        weaponOutfitSyncing.delete(playerKey);
        if (weaponOutfitPending.has(playerKey)) {
            const latest = weaponOutfitPending.get(playerKey);
            weaponOutfitPending.delete(playerKey);
            syncWeaponOutfits(latest.player, latest.raw);
        }
    }
}

function syncAllWeaponOutfits() {
    try {
        mp.players.forEach((player) => {
            if (!player || player.type !== "player") return;
            syncWeaponOutfits(player);
        });
    } catch {}
}

mp.events.add("inventory:client:quickWeapons", (raw = "{}") => {
    syncWeaponOutfits(mp.players.local, raw);
    setTimeout(() => syncWeaponOutfits(mp.players.local), 250);
    setTimeout(() => syncWeaponOutfits(mp.players.local), 750);
});

try {
    mp.events.addDataHandler("inventoryQuickWeapons", (entity, value) => {
        if (!entity || entity.type !== "player") return;
        syncWeaponOutfits(entity, value);
    });

    mp.events.addDataHandler("activeWeaponUid", (entity) => {
        if (!entity || entity.type !== "player") return;
        syncWeaponOutfits(entity);
    });
} catch {}

mp.events.add("entityStreamIn", (entity) => {
    if (entity?.__twinkleWeaponOutfit) {
        const data = entity.__twinkleWeaponOutfit;
        attachWeaponOutfitObject(entity, data.player, data.weapon);
        return;
    }

    if (entity?.type === "player") {
        syncWeaponOutfits(entity);
    }
});

mp.events.add("entityStreamOut", (entity) => {
    if (!entity) return;

    if (entity.type === "player") {
        cancelWeaponOutfitSync(entity);
    }
});

mp.events.add("playerQuit", (player) => {
    cancelWeaponOutfitSync(player);
    weaponOutfitGenerations.delete(playerVisualKey(player));
});

mp.events.add("playerReady", () => {
    setTimeout(syncAllWeaponOutfits, 500);
    setTimeout(syncAllWeaponOutfits, 1500);
});

setTimeout(syncAllWeaponOutfits, 1500);

console.log("[INVENTORY WEAPON] Loaded");
