"use strict";

const itemsConfig = require("./inventory.items.js");
const repository = require("./inventory.repository.js");
const database = require("../../database/query.js");

const {
  getStaticId,
  getPlayerName,
  safeCall,
  notify,
  createUid,
  parseJson,
} = require("./inventory.utils.js");

const MAX_WEIGHT = 75;
const ENVIRONMENT_SLOT_COUNT = 50;
const ENVIRONMENT_RANGE = 4.0;
const WORLD_DROP_LIFETIME_MS = 30 * 60 * 1000;
const WORLD_DROP_SWEEP_INTERVAL_MS = 60 * 1000;
const MAX_WORLD_DROPS = 500;
const worldDrops = new Map();
const worldDropClaims = new Set();
let worldDropReservations = 0;
const inventoryOperationChains = new Map();
const INTERNAL_ITEM_USE_TOKEN = Symbol("twinkle.inventory.item-use");
const CHARACTER_WEARABLES_VERSION = 1;
const CHARACTER_WEARABLE_ITEM_ID = "character_wearable";

function getQuestService() {
  return require("../quests/quest.service.js");
}

function isInternalItemUseToken(token) {
  return token === INTERNAL_ITEM_USE_TOKEN;
}

function runInventoryExclusive(player, label, operation) {
  const staticId = Number(getStaticId(player));
  const playerId = Number(player?.id);
  const key = staticId > 0 ? `static:${staticId}` : `player:${playerId}`;
  const previous = inventoryOperationChains.get(key) || Promise.resolve();
  let current = null;

  current = previous
    .catch(() => {})
    .then(operation)
    .catch((error) => {
      console.error(`[INVENTORY] exclusive operation failed (${label}, ${key}):`, error);
      return false;
    })
    .finally(() => {
      if (inventoryOperationChains.get(key) === current) {
        inventoryOperationChains.delete(key);
      }
    });

  inventoryOperationChains.set(key, current);
  return current;
}

function runInventoryExclusiveOrThrow(player, label, operation) {
  const staticId = Number(getStaticId(player));
  const playerId = Number(player?.id);
  const key = staticId > 0 ? `static:${staticId}` : `player:${playerId}`;
  const previous = inventoryOperationChains.get(key) || Promise.resolve();
  let current = null;

  current = previous
    .catch(() => {})
    .then(operation)
    .finally(() => {
      if (inventoryOperationChains.get(key) === current) {
        inventoryOperationChains.delete(key);
      }
    });

  inventoryOperationChains.set(key, current);
  return current;
}

function lockedInventoryOperation(label, operation) {
  return (player, ...args) => runInventoryExclusive(
    player,
    label,
    () => operation(player, ...args)
  );
}

const DEFAULT_CLOTHES = {
  mask: { component: 1, drawable: 0, texture: 0, palette: 0 },
  gloves: { component: 3, drawable: 15, texture: 0, palette: 0 },
  legs: { component: 4, drawable: 14, texture: 0, palette: 0 },
  bag: { component: 5, drawable: 0, texture: 0, palette: 0 },
  shoes: { component: 6, drawable: 34, texture: 0, palette: 0 },
  accessory: { component: 7, drawable: 0, texture: 0, palette: 0 },
  chain: { component: 7, drawable: 0, texture: 0, palette: 0 },
  undershirt: { component: 8, drawable: 15, texture: 0, palette: 0 },
  armor: { armour: 0 },
  decals: { component: 10, drawable: 0, texture: 0, palette: 0 },
  top: { component: 11, drawable: 15, texture: 0, palette: 0 },
};

const DEFAULT_PROPS = {
  hat: { prop: 0 },
  glasses: { prop: 1 },
  ears: { prop: 2 },
  watch: { prop: 6 },
  bracelet: { prop: 7 },
};

const WEARABLE_EQUIPMENT_SLOTS = new Set([
  "hat",
  "mask",
  "glasses",
  "ears",
  "top",
  "undershirt",
  "legs",
  "shoes",
  "armor",
  "bag",
  "accessory",
  "gloves",
  "decals",
  "chain",
  "watch",
  "bracelet",
]);

const CHARACTER_CREATION_COMPONENTS = Object.freeze([
  { component: 3, slot: "gloves", name: "Стартовые перчатки", weight: 0.2 },
  { component: 4, slot: "legs", name: "Стартовый низ", weight: 0.7 },
  { component: 6, slot: "shoes", name: "Стартовая обувь", weight: 0.7 },
  { component: 8, slot: "undershirt", name: "Стартовая майка", weight: 0.3 },
  { component: 11, slot: "top", name: "Стартовый верх", weight: 0.8 },
]);

const CHARACTER_CREATION_DEFAULTS = Object.freeze({
  male: Object.freeze({
    3: Object.freeze({ drawable: 15, texture: 0, palette: 0 }),
    4: Object.freeze({ drawable: 21, texture: 0, palette: 0 }),
    6: Object.freeze({ drawable: 34, texture: 0, palette: 0 }),
    8: Object.freeze({ drawable: 15, texture: 0, palette: 0 }),
    11: Object.freeze({ drawable: 15, texture: 0, palette: 0 }),
  }),
  female: Object.freeze({
    3: Object.freeze({ drawable: 15, texture: 0, palette: 0 }),
    4: Object.freeze({ drawable: 14, texture: 0, palette: 0 }),
    6: Object.freeze({ drawable: 35, texture: 0, palette: 0 }),
    8: Object.freeze({ drawable: 15, texture: 0, palette: 0 }),
    11: Object.freeze({ drawable: 15, texture: 0, palette: 0 }),
  }),
});

function getPlayerGender(player) {
  const character = player?.character || player?.characterData || {};
  const customization = parseJson(character.customization, {});
  return String(character.gender || customization.gender || "male").toLowerCase() === "female"
    ? "female"
    : "male";
}

function getDefaultClothes(player, slot) {
  const fallback = DEFAULT_CLOTHES[slot];
  if (!fallback?.component) return fallback;

  const genderDefaults = CHARACTER_CREATION_DEFAULTS[getPlayerGender(player)];
  const genderDefault = genderDefaults?.[fallback.component];
  return genderDefault ? { ...fallback, ...genderDefault } : fallback;
}

const WEAPON_WORLD_MODELS = {
  pistol: "w_pi_pistol",
  rifle: "w_ar_carbinerifle",
};

const WORLD_DROP_FALLBACK_MODEL = "prop_paper_bag_small";

function isWeaponItem(item) {
  return Boolean(item?.weaponHash);
}

function canUseQuickSlot(item) {
  return Boolean(item?.quick || isWeaponItem(item));
}

function getItemWorldModel(item) {
  if (!item) return WORLD_DROP_FALLBACK_MODEL;

  const itemId = String(item.itemId || item.id || "");
  return item.worldModel || item.dropModel || item.backModel || WEAPON_WORLD_MODELS[itemId] || WORLD_DROP_FALLBACK_MODEL;
}

function modelHash(model) {
  if (typeof model === "number") return model;
  if (typeof mp !== "undefined" && typeof mp.joaat === "function") {
    return mp.joaat(String(model));
  }
  return model;
}

function getDropPosition(player, distance = 1.15) {
  const position = player?.position || { x: 0, y: 0, z: 0 };
  const heading = Number(player?.heading || 0) * Math.PI / 180;

  return new mp.Vector3(
    Number(position.x || 0) + Math.sin(-heading) * distance,
    Number(position.y || 0) + Math.cos(heading) * distance,
    Number(position.z || 0) - 0.95
  );
}

function spawnDroppedItemProp(player, item, amount = 1) {
  try {
    if (!mp?.objects?.new) return null;

    const object = mp.objects.new(
      modelHash(getItemWorldModel(item)),
      getDropPosition(player),
      {
        dimension: Number(player?.dimension || 0),
        rotation: new mp.Vector3(0, 0, Number(player?.heading || 0)),
      }
    );

    try {
      object.setVariable("inventoryDrop", JSON.stringify({
        itemId: item.itemId || item.id,
        name: item.name,
        amount: Math.max(1, Number(amount || 1)),
      }));
    } catch {}

    return object;
  } catch (e) {
    console.error("[INVENTORY] spawnDroppedItemProp error:", e);
    return null;
  }
}

function cloneInventoryItem(item, amount, uid = null) {
  const copy = { ...item };
  copy.uid = uid || createUid(item.itemId || item.id || "drop");
  copy.amount = Math.max(1, Number(amount || item.amount || 1));
  return copy;
}

function distanceBetween(a, b) {
  const dx = Number(a?.x || 0) - Number(b?.x || 0);
  const dy = Number(a?.y || 0) - Number(b?.y || 0);
  const dz = Number(a?.z || 0) - Number(b?.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function destroyWorldDrop(drop) {
  try {
    if (drop?.object && typeof drop.object.destroy === "function") {
      drop.object.destroy();
    }
  } catch {}
}

function removeWorldDrop(uid, drop = worldDrops.get(String(uid || ""))) {
  if (!drop) return false;
  worldDrops.delete(String(uid || drop.uid || ""));
  destroyWorldDrop(drop);
  return true;
}

function pruneWorldDrops(now = Date.now()) {
  for (const [uid, drop] of worldDrops.entries()) {
    if (worldDropClaims.has(uid)) continue;
    if (now - Number(drop.createdAt || 0) < WORLD_DROP_LIFETIME_MS) continue;
    removeWorldDrop(uid, drop);
  }
}

function reserveWorldDropCapacity() {
  pruneWorldDrops();
  if (worldDrops.size + worldDropReservations >= MAX_WORLD_DROPS) return false;
  worldDropReservations += 1;
  return true;
}

function releaseWorldDropCapacity() {
  worldDropReservations = Math.max(0, worldDropReservations - 1);
}

function createWorldDrop(player, item, amount = 1) {
  const preserveUid = item?.internalOnly === true ? String(item.uid || "") : null;
  const dropItem = cloneInventoryItem(item, amount, preserveUid);
  const object = spawnDroppedItemProp(player, dropItem, dropItem.amount);
  const position = object?.position || getDropPosition(player);
  const drop = {
    uid: dropItem.uid,
    item: dropItem,
    position,
    dimension: Number(player?.dimension || 0),
    object,
    createdAt: Date.now(),
  };

  try {
    object?.setVariable?.("inventoryDrop", JSON.stringify({
      uid: drop.uid,
      itemId: dropItem.itemId || dropItem.id,
      name: dropItem.name,
      amount: dropItem.amount,
    }));
  } catch {}

  worldDrops.set(drop.uid, drop);
  return drop;
}

function getNearbyEnvironment(player) {
  pruneWorldDrops();
  const position = player?.position || { x: 0, y: 0, z: 0 };
  const dimension = Number(player?.dimension || 0);
  const drops = [...worldDrops.values()]
    .filter((drop) => drop.dimension === dimension)
    .map((drop) => ({ ...drop, distance: distanceBetween(position, drop.position) }))
    .filter((drop) => drop.distance <= ENVIRONMENT_RANGE)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, ENVIRONMENT_SLOT_COUNT);

  const slots = Array.from({ length: ENVIRONMENT_SLOT_COUNT }, () => null);
  const items = {};

  drops.forEach((drop, index) => {
    slots[index] = drop.uid;
    items[drop.uid] = drop.item;
  });

  return {
    type: "world",
    title: "Окружение",
    slots,
    items,
  };
}

function findNearbyWorldDrop(player, uid) {
  const drop = worldDrops.get(String(uid || ""));
  if (!drop) return null;
  if (drop.dimension !== Number(player?.dimension || 0)) return null;
  return distanceBetween(player?.position, drop.position) <= ENVIRONMENT_RANGE ? drop : null;
}

function buildQuickWeapons(inv, activeUid = null) {
  return (inv.quick || [])
    .map((uid, slot) => {
      const item = uid ? inv.items?.[uid] : null;
      if (!item || !isWeaponItem(item)) return null;

      return {
        slot,
        uid,
        itemId: item.itemId || item.id,
        weaponHash: Number(item.weaponHash || 0),
        model: item.backModel || getItemWorldModel(item),
        active: String(uid) === String(activeUid || ""),
      };
    })
    .filter(Boolean);
}

function syncQuickWeaponVisuals(player, inv) {
  const activeUid = player?.activeInventoryWeapon?.uid || null;
  const weapons = buildQuickWeapons(inv, activeUid);
  const payload = JSON.stringify({ activeUid, weapons });

  try {
    player.setVariable("inventoryQuickWeapons", payload);
    player.setVariable("activeWeaponUid", activeUid);
  } catch {}

  safeCall(player, "inventory:client:quickWeapons", [payload]);
}

function clearActiveWeaponIfMissing(player, inv) {
  const active = player?.activeInventoryWeapon;
  if (!active?.uid || inv.items?.[active.uid]) return;

  try {
    player.removeWeapon(Number(active.weaponHash || 0));
  } catch {}

  player.activeInventoryWeapon = null;

  try {
    player.setVariable("activeWeaponUid", null);
    player.setVariable("activeWeaponItemId", null);
    player.setVariable("activeWeaponAmmoItem", null);
  } catch {}
}

function getItemConfig(itemId) {
  return itemsConfig[String(itemId || "").trim()] || null;
}

function isBoundItem(item) {
  const itemId = String(item?.itemId || item?.id || "");
  return Boolean(getItemConfig(itemId)?.bound || item?.bound);
}

function rehydrateInventoryItem(item) {
  if (!item) return null;
  const config = getItemConfig(item.itemId || item.id);
  if (!config) return item;

  // Старые записи инвентаря могли быть сохранены до появления оружейных полей.
  // Состояние экземпляра (UID, количество, прочность) сохраняем, а статические
  // параметры безопасно восстанавливаем из актуального конфига.
  [
    "id", "name", "type", "weight", "equipSlot", "weaponHash", "ammoItem",
    "maxDurability", "durabilityLossPerShot", "melee", "quick",
  ].forEach((key) => {
    if (item[key] === undefined || item[key] === null || item[key] === "") {
      item[key] = config[key];
    }
  });
  item.itemId = item.itemId || config.id;
  if (String(item.speciesId || "") === "lion") {
    item.speciesName = "Белый тигр";
    if (String(item.itemId || item.id) === "hunting_spoiled_carcass") {
      item.name = "Испорченная туша «Белый тигр»";
    }
  }
  if (String(item.itemId) === "hunting_rifle_scoped") {
    item.weaponHash = config.weaponHash;
    // Миграция уже существующих экземпляров: раньше обе винтовки
    // ошибочно использовали один hunting_ammo.
    item.ammoItem = config.ammoItem;
  }
  return item;
}

function ensureItemDurability(item) {
  if (!item) return null;

  const config = getItemConfig(item.itemId || item.id);
  const configuredMaximum = Number(item.maxDurability || config?.maxDurability || 0);

  if (!Number.isFinite(configuredMaximum) || configuredMaximum <= 0) return null;

  const maximum = Math.max(1, Math.round(configuredMaximum));
  const stored = Number(item.durability);
  const current = Number.isFinite(stored)
    ? Math.max(0, Math.min(maximum, Math.round(stored)))
    : maximum;

  item.maxDurability = maximum;
  item.durability = current;

  return { current, maximum };
}

function ensureInventoryDurability(inv) {
  Object.values(inv?.items || {}).forEach((item) => {
    rehydrateInventoryItem(item);
    ensureItemDurability(item);
  });
}

function damageItemDurability(inv, item, amount) {
  const condition = ensureItemDurability(item);
  const damage = Math.max(0, Math.round(Number(amount || 0)));

  if (!condition || damage <= 0) {
    return { ok: false, broken: false, durability: condition?.current ?? null, maxDurability: condition?.maximum ?? null };
  }

  const durability = Math.max(0, condition.current - damage);
  item.durability = durability;

  if (durability <= 0) {
    removeItemUidEverywhere(inv, item.uid);
  }

  return {
    ok: true,
    broken: durability <= 0,
    durability,
    maxDurability: condition.maximum,
  };
}

function clearActiveWeaponState(player, weaponHash = 0, weaponUid = "") {
  const normalizedHash = Number(weaponHash || 0) >>> 0;
  const activeHash = Number(player?.activeInventoryWeapon?.weaponHash || 0) >>> 0;
  const normalizedUid = String(weaponUid || "");
  const activeUid = String(player?.activeInventoryWeapon?.uid || "");
  const shouldClear = normalizedUid
    ? activeUid === normalizedUid
    : (!normalizedHash || !activeHash || activeHash === normalizedHash);

  if (!shouldClear) return;

  player.activeInventoryWeapon = null;

  try {
    player.setVariable("activeWeaponUid", null);
    player.setVariable("activeWeaponItemId", null);
    player.setVariable("activeWeaponAmmoItem", null);
  } catch {}
}

function setActiveWeaponState(player, item, weaponHash, selectedInHand = true) {
  if (!player || !item || !weaponHash) return;
  const previousSelectedAt = String(player?.activeInventoryWeapon?.uid || "") === String(item.uid || "")
    ? Number(player?.activeInventoryWeapon?.selectedAt || 0)
    : 0;

  player.activeInventoryWeapon = {
    uid: item.uid,
    itemId: item.itemId || item.id,
    weaponHash: Number(weaponHash),
    ammoItem: item.ammoItem || null,
    selectedAt: selectedInHand ? Date.now() : previousSelectedAt,
  };

  try {
    player.setVariable("activeWeaponUid", item.uid);
    player.setVariable("activeWeaponItemId", item.itemId || item.id);
    player.setVariable("activeWeaponAmmoItem", item.ammoItem || null);
  } catch {}
}

function getEquippedItemById(inv, itemId) {
  const normalizedItemId = String(itemId || "").trim();
  if (!normalizedItemId) return null;

  for (const uid of Object.values(inv?.equipment || {})) {
    const item = uid ? inv.items[uid] : null;
    if (item && (item.itemId || item.id) === normalizedItemId) return item;
  }

  return null;
}

function getOwnedUsableItemById(inv, itemId) {
  const normalizedItemId = String(itemId || "").trim();
  if (!normalizedItemId) return null;

  const equipped = getEquippedItemById(inv, normalizedItemId);
  const candidates = [equipped, ...Object.values(inv?.items || {})]
    .filter((item, index, items) => (
      item &&
      (item.itemId || item.id) === normalizedItemId &&
      items.findIndex((entry) => entry?.uid === item.uid) === index
    ));

  return candidates.find((item) => {
    const condition = ensureItemDurability(item);
    return !condition || condition.current > 0;
  }) || null;
}

function weaponHashesMatch(left, right) {
  const a = Number(left || 0) >>> 0;
  const b = Number(right || 0) >>> 0;
  if (!a || !b) return false;
  if (a === b) return true;

  // RAGE can expose weapon hashes through a float-backed native value. Large
  // unsigned hashes then arrive rounded (WEAPON_MUSKET: 2828843422 ->
  // 2828843520). Compare that representation only after ownership has been
  // limited to equipment/quick slots; the canonical DB hash is used afterward.
  return (Math.fround(a) >>> 0) === (Math.fround(b) >>> 0);
}

function getActiveWeaponItem(inv, player, weaponHash) {
  const normalizedHash = Number(weaponHash || 0) >>> 0;
  if (!normalizedHash) return null;

  const equipmentUids = Object.values(inv?.equipment || {}).filter(Boolean);
  const quickUids = (Array.isArray(inv?.quick) ? inv.quick : []).filter(Boolean);
  const accessibleUids = new Set([...equipmentUids, ...quickUids]);
  const activeUid = String(player?.activeInventoryWeapon?.uid || "");
  const activeItem = activeUid && accessibleUids.has(activeUid)
    ? rehydrateInventoryItem(inv.items[activeUid])
    : null;

  if (
    activeItem?.ammoItem &&
    weaponHashesMatch(activeItem.weaponHash, normalizedHash)
  ) {
    return activeItem;
  }

  // Оружие из экипировки важнее быстрого слота. Это позволяет восстановить
  // активный UID после входа/перезагрузки, не сканируя произвольные предметы.
  for (const uid of [...equipmentUids, ...quickUids]) {
    const item = rehydrateInventoryItem(inv.items[uid]);
    if (
      item?.ammoItem &&
      weaponHashesMatch(item.weaponHash, normalizedHash)
    ) {
      return item;
    }
  }

  return null;
}

function refreshEquippedWeaponsForAmmo(player, inv, ammoItemId) {
  const normalizedAmmoItem = String(ammoItemId || "");
  if (!normalizedAmmoItem) return;
  const ammoAmount = getAmmoAmount(inv, normalizedAmmoItem);
  const uids = new Set(Object.values(inv?.equipment || {}).filter(Boolean));
  const activeUid = String(player?.activeInventoryWeapon?.uid || "");
  if (activeUid) uids.add(activeUid);

  uids.forEach((uid) => {
    const item = rehydrateInventoryItem(inv?.items?.[uid]);
    if (!item?.weaponHash || String(item.ammoItem || "") !== normalizedAmmoItem) return;
    const hash = Number(item.weaponHash);
    try { player.giveWeapon(hash, ammoAmount); } catch {}
    try { player.setWeaponAmmo(hash, ammoAmount); } catch {}
    safeCall(player, "inventory:client:weaponEquipped", [hash, ammoAmount, false]);
  });
}

function removeEquippedItemFromPlayer(player, item, slot = null) {
  if (item?.weaponHash) {
    const weaponHash = Number(item.weaponHash);
    const activeUid = String(player?.activeInventoryWeapon?.uid || "");
    const itemUid = String(item.uid || "");
    const removesActiveWeapon = !activeUid || !itemUid || activeUid === itemUid;

    if (removesActiveWeapon) {
      try {
        player.removeWeapon(weaponHash);
      } catch {}

      safeCall(player, "inventory:client:weaponRemoved", [weaponHash]);
    }

    clearActiveWeaponState(player, weaponHash, itemUid);
  }

  if (slot) clearEquipmentSlotVisual(player, slot);
}

function getFreeSlot(slots) {
  return slots.findIndex((slot) => slot === null);
}

function getWeight(inv) {
  return Object.values(inv.items || {}).reduce((total, item) => {
    return total + Number(item.weight || 0) * Number(item.amount || 1);
  }, 0);
}

function holsterActiveWeapon(player, inv = null) {
  const active = player?.activeInventoryWeapon;
  if (!active?.uid || !active?.weaponHash) return false;

  const inventoryItem = inv?.items?.[active.uid];
  removeEquippedItemFromPlayer(player, {
    ...(inventoryItem || {}),
    uid: active.uid,
    itemId: inventoryItem?.itemId || active.itemId,
    weaponHash: Number(active.weaponHash),
  });

  if (inv) syncQuickWeaponVisuals(player, inv);
  return true;
}

function boundedInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function buildCharacterCreationWearables(character) {
  const customization = parseJson(character?.customization, {});
  const savedClothes = parseJson(character?.clothes, {});
  const components = savedClothes?.components && typeof savedClothes.components === "object"
    ? savedClothes.components
    : savedClothes;
  const gender = String(character?.gender || customization?.gender || "male").toLowerCase() === "female"
    ? "female"
    : "male";
  const defaults = CHARACTER_CREATION_DEFAULTS[gender];

  return CHARACTER_CREATION_COMPONENTS.map((definition) => {
    const fallback = defaults[definition.component];
    const saved = components && typeof components === "object"
      ? components[definition.component] || components[String(definition.component)]
      : null;

    return {
      ...definition,
      clothes: {
        component: definition.component,
        drawable: boundedInteger(saved?.drawable ?? saved?.drawableId ?? saved?.id, 0, 600, fallback.drawable),
        texture: boundedInteger(saved?.texture ?? saved?.textureId, 0, 100, fallback.texture),
        palette: boundedInteger(saved?.palette, 0, 3, fallback.palette),
      },
    };
  });
}

async function ensureCharacterWearables(player, character = player?.character) {
  try {
    const staticId = getStaticId(player);
    const baseConfig = getItemConfig(CHARACTER_WEARABLE_ITEM_ID);
    if (!staticId || !character || !baseConfig) {
      return { ok: false, reason: "invalid" };
    }

    const inv = await repository.getInventory(staticId);
    const metadata = inv.metadata && typeof inv.metadata === "object" ? inv.metadata : {};
    if (Number(metadata.characterWearablesVersion || 0) >= CHARACTER_WEARABLES_VERSION) {
      return { ok: true, created: 0, migrated: false };
    }

    let created = 0;
    for (const wearable of buildCharacterCreationWearables(character)) {
      const currentUid = inv.equipment[wearable.slot] || null;
      if (currentUid && inv.items[currentUid]) continue;

      const uid = createUid(CHARACTER_WEARABLE_ITEM_ID);
      inv.items[uid] = {
        ...baseConfig,
        uid,
        itemId: baseConfig.id,
        id: baseConfig.id,
        amount: 1,
        stackable: false,
        bound: true,
        ownerStaticId: Number(staticId),
        source: "character_creation",
        equipSlot: wearable.slot,
        name: wearable.name,
        weight: wearable.weight,
        clothes: wearable.clothes,
        actions: Array.isArray(baseConfig.actions) ? baseConfig.actions.slice() : ["equip", "info"],
      };
      inv.equipment[wearable.slot] = uid;
      created += 1;
    }

    inv.metadata = {
      ...metadata,
      characterWearablesVersion: CHARACTER_WEARABLES_VERSION,
    };
    await repository.saveInventory(staticId, inv);

    return { ok: true, created, migrated: true };
  } catch (error) {
    console.error("[INVENTORY] ensureCharacterWearables error:", error);
    return { ok: false, reason: "error" };
  }
}

function getAmmoAmount(inv, ammoItemId) {
  if (!ammoItemId) return 0;

  let amount = 0;

  Object.values(inv.items || {}).forEach((item) => {
    if ((item.itemId || item.id) === ammoItemId) {
      amount += Number(item.amount || 0);
    }
  });

  return amount;
}

function getItemAmountFromInventory(inv, itemId) {
  let amount = 0;

  Object.values(inv?.items || {}).forEach((item) => {
    if ((item.itemId || item.id) === String(itemId)) {
      amount += Number(item.amount || 1);
    }
  });

  return amount;
}

function normalizeRequirements(requirements) {
  return (Array.isArray(requirements) ? requirements : [])
    .map((requirement) => ({
      itemId: String(requirement?.itemId || requirement?.id || "").trim(),
      amount: Math.max(1, Number(requirement?.amount || 1)),
    }))
    .filter((requirement) => requirement.itemId);
}

function removeItemUidEverywhere(inv, uid) {
  delete inv.items[uid];

  inv.slots = inv.slots.map((slot) => (slot === uid ? null : slot));
  inv.quick = inv.quick.map((slot) => (slot === uid ? null : slot));

  for (const key of Object.keys(inv.equipment)) {
    if (inv.equipment[key] === uid) {
      inv.equipment[key] = null;
    }
  }
}

function removeAmmoFromInventory(inv, ammoItemId, amount = 1) {
  let left = Math.max(1, Number(amount || 1));

  for (const [uid, item] of Object.entries(inv.items || {})) {
    if (left <= 0) break;
    if ((item.itemId || item.id) !== ammoItemId) continue;

    const itemAmount = Number(item.amount || 1);

    if (itemAmount > left) {
      item.amount = itemAmount - left;
      left = 0;
      break;
    }

    left -= itemAmount;
    removeItemUidEverywhere(inv, uid);
  }

  return left <= 0;
}

function buildPayload(player, inv, environment = null) {
  ensureInventoryDurability(inv);
  const character = player.character || player.characterData || {};
  const resolvedEnvironment = environment && typeof environment === "object"
    ? environment
    : getNearbyEnvironment(player);

  return {
    player: {
      name: getPlayerName(player),
      static: getStaticId(player),
    },
    maxWeight: MAX_WEIGHT,
    currentWeight: getWeight(inv),
    activeQuickUid: player?.activeInventoryWeapon?.uid || null,
    slots: inv.slots,
    quick: inv.quick,
    equipment: inv.equipment,
    items: inv.items,
    environment: resolvedEnvironment,
    vitalsState: {
      contractVersion: 1,
      revision: Math.max(0, Math.trunc(Number(player?.__inventoryVitalsRevision || 0))),
      vitals: {
        health: Math.max(0, Math.min(100, Number(player.health || 0))),
        food: Math.max(0, Math.min(100, Number(character.food ?? 100))),
        water: Math.max(0, Math.min(100, Number(character.water ?? 100))),
      },
    },
  };
}

async function syncInventory(player, inv, open = false, environment = null) {
  clearActiveWeaponIfMissing(player, inv);
  syncQuickWeaponVisuals(player, inv);
  const payload = buildPayload(player, inv, environment);

  safeCall(player, open ? "inventory:client:open" : "inventory:client:update", [
    JSON.stringify(payload),
  ]);
}

function reportInventoryItemRemoved(player, item, reason) {
  if (!item) return;
  try {
    global.twinkleHunting?.onInventoryItemRemoved?.(player, { ...item }, String(reason || "removed"));
  } catch (error) {
    console.error("[INVENTORY] Hunting removal sync failed:", error);
  }
}

function getSlotContainer(inv, source) {
  if (source === "inventory") return inv.slots;
  if (source === "quick") return inv.quick;
  return null;
}

function normalizeEquipmentSlot(index) {
  return String(index || "") === "clothes" ? "top" : String(index || "");
}

function getSlotValue(inv, source, index) {
  if (source === "equipment") {
    return inv.equipment[normalizeEquipmentSlot(index)] || null;
  }

  const container = getSlotContainer(inv, source);
  if (!container) return null;

  return container[Number(index)] || null;
}

function setSlotValue(inv, source, index, value) {
  if (source === "equipment") {
    const slot = normalizeEquipmentSlot(index);
    if (!Object.prototype.hasOwnProperty.call(inv.equipment, slot)) return false;
    inv.equipment[slot] = value;
    return true;
  }

  const container = getSlotContainer(inv, source);
  if (!container) return false;

  const slotIndex = Number(index);

  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= container.length) {
    return false;
  }

  container[slotIndex] = value;
  return true;
}

function findUidLocation(inv, uid) {
  const inventoryIndex = inv.slots.indexOf(uid);
  if (inventoryIndex >= 0) return { source: "inventory", index: inventoryIndex };
  const quickIndex = inv.quick.indexOf(uid);
  if (quickIndex >= 0) return { source: "quick", index: quickIndex };
  const equipmentSlot = Object.keys(inv.equipment || {}).find((slot) => inv.equipment[slot] === uid);
  return equipmentSlot ? { source: "equipment", index: equipmentSlot } : null;
}

async function toggleMaskSuit(player, uid) {
  try {
    const staticId = getStaticId(player);
    if (!staticId || !uid) return { ok: false, reason: "invalid" };

    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const item = inv.items?.[uid];
    if (!item || String(item.itemId || item.id) !== "hunting_mask_suit") {
      return { ok: false, reason: "wrong_item" };
    }

    if (inv.equipment.top === uid) {
      const replacedUid = String(item.maskReplacedTopUid || "");
      const replacedLocation = replacedUid ? findUidLocation(inv, replacedUid) : null;
      if (replacedUid && replacedLocation && replacedLocation.source !== "equipment") {
        setSlotValue(inv, replacedLocation.source, replacedLocation.index, uid);
        inv.equipment.top = replacedUid;
      } else {
        const freeSlot = getFreeSlot(inv.slots);
        if (freeSlot < 0) return { ok: false, reason: "slots" };
        inv.equipment.top = null;
        inv.slots[freeSlot] = uid;
      }
      delete item.maskReplacedTopUid;
      await repository.saveInventory(staticId, inv);
      await syncInventory(player, inv, false);
      return { ok: true, equipped: false, broken: false, item: { ...item } };
    }

    const source = findUidLocation(inv, uid);
    if (!source || source.source === "equipment") return { ok: false, reason: "location" };
    const condition = ensureItemDurability(item);
    if (!condition || condition.current <= 0) return { ok: false, reason: "broken" };

    if (condition.current <= 20) {
      removeItemUidEverywhere(inv, uid);
      await repository.saveInventory(staticId, inv);
      await syncInventory(player, inv, false);
      return { ok: true, equipped: false, broken: true, durability: 0, maxDurability: condition.maximum };
    }

    const replacedUid = inv.equipment.top || null;
    setSlotValue(inv, source.source, source.index, replacedUid);
    inv.equipment.top = uid;
    item.maskReplacedTopUid = replacedUid;
    item.durability = condition.current - 20;

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    return {
      ok: true,
      equipped: true,
      broken: false,
      durability: item.durability,
      maxDurability: condition.maximum,
      item: { ...item },
    };
  } catch (error) {
    console.error("[INVENTORY] toggleMaskSuit error:", error);
    return { ok: false, reason: "error" };
  }
}

function removeUidFromSlots(inv, uid) {
  inv.slots = inv.slots.map((slot) => (slot === uid ? null : slot));
  inv.quick = inv.quick.map((slot) => (slot === uid ? null : slot));

  for (const key of Object.keys(inv.equipment)) {
    if (inv.equipment[key] === uid) {
      inv.equipment[key] = null;
    }
  }
}

function putUidToFreeInventorySlot(inv, uid) {
  const freeSlot = getFreeSlot(inv.slots);
  if (freeSlot === -1) return false;

  inv.slots[freeSlot] = uid;
  return true;
}

async function applyEquipmentItem(player, item, selectInHand = false) {
  if (!item) return false;

  try {
    const condition = ensureItemDurability(item);
    if (condition && condition.current <= 0) return false;

    if (item.armor) {
      player.armour = Number(item.armor || 0);
    }

    if (item.clothes) {
      player.setClothes(
        Number(item.clothes.component),
        Number(item.clothes.drawable),
        Number(item.clothes.texture || 0),
        Number(item.clothes.palette || 0)
      );
    }

    if (item.prop) {
      player.setProp(
        Number(item.prop.prop),
        Number(item.prop.drawable),
        Number(item.prop.texture || 0)
      );
    }

    if (item.weaponHash) {
      if (item.melee || !item.ammoItem) {
        const hash = Number(item.weaponHash);
        player.giveWeapon(hash, 1);
        if (selectInHand) setActiveWeaponState(player, item, hash);
        safeCall(player, "inventory:client:weaponEquipped", [hash, 1, Boolean(selectInHand)]);
      } else {
        const equipped = await useWeapon(player, item, selectInHand);
        if (!equipped) return false;
      }
    }

    return true;
  } catch (e) {
    console.error("[INVENTORY] applyEquipmentItem error:", e);
    return false;
  }
}

function clearEquipmentSlotVisual(player, slot) {
  try {
    const defaultClothes = getDefaultClothes(player, slot);
    const defaultProp = DEFAULT_PROPS[slot];

    if (slot === "armor") {
      player.armour = 0;
      return;
    }

    if (defaultClothes) {
      player.setClothes(
        Number(defaultClothes.component),
        Number(defaultClothes.drawable),
        Number(defaultClothes.texture || 0),
        Number(defaultClothes.palette || 0)
      );
      return;
    }

    if (defaultProp) {
      const propId = Number(defaultProp.prop);

      if (typeof player.setProp === "function") {
        player.setProp(propId, -1, 0);
      }

      return;
    }
  } catch (e) {
    console.error("[INVENTORY] clearEquipmentSlotVisual error:", e);
  }
}

async function openInventory(player, environment = null) {
  try {
    const staticId = getStaticId(player);

    if (!staticId) {
      notify(player, "UUID игрока не найден.", "#ff6666");
      return false;
    }

    const inv = await repository.getInventory(staticId);
    await syncInventory(player, inv, true, environment);

    return true;
  } catch (e) {
    console.error("[INVENTORY] openInventory error:", e);
    notify(player, "Ошибка открытия инвентаря.", "#ff6666");
    return false;
  }
}

async function addItem(player, itemId, amount = 1) {
  try {
    const staticId = getStaticId(player);
    const config = getItemConfig(itemId);
    const count = Math.max(1, Number(amount || 1));

    if (!staticId || !config || config.bound === true || config.internalOnly === true) return false;

    const inv = await repository.getInventory(staticId);
    const addedWeight = Number(config.weight || 0) * count;
    if (getWeight(inv) + addedWeight > MAX_WEIGHT) {
      notify(player, "Недостаточно свободного веса в инвентаре.", "#ff6666");
      return false;
    }

    if (config.stackable) {
      const existing = Object.values(inv.items).find((item) => {
        return (item.itemId || item.id) === config.id;
      });

      if (existing) {
        existing.amount = Number(existing.amount || 0) + count;

        await repository.saveInventory(staticId, inv);
        await syncInventory(player, inv, false);
        refreshEquippedWeaponsForAmmo(player, inv, config.id);

        return true;
      }
    }

    const freeSlot = getFreeSlot(inv.slots);
    if (freeSlot === -1) return false;

    const uid = createUid(config.id);

    inv.items[uid] = {
      ...config,
      uid,
      itemId: config.id,
      amount: count,
      ...(Number(config.maxDurability || 0) > 0
        ? { durability: Number(config.maxDurability), maxDurability: Number(config.maxDurability) }
        : {}),
    };

    inv.slots[freeSlot] = uid;

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    refreshEquippedWeaponsForAmmo(player, inv, config.id);

    return true;
  } catch (e) {
    console.error("[INVENTORY] addItem error:", e);
    notify(player, "Ошибка выдачи предмета.", "#ff6666");
    return false;
  }
}

async function addItems(player, requirements) {
  try {
    const staticId = getStaticId(player);
    const normalized = normalizeRequirements(requirements);
    if (!staticId || normalized.length === 0) return false;

    const prepared = normalized.map((requirement) => ({
      ...requirement,
      config: getItemConfig(requirement.itemId),
    }));
    if (prepared.some((entry) => !entry.config || entry.config.bound === true || entry.config.internalOnly === true)) return false;

    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const addedWeight = prepared.reduce(
      (total, entry) => total + Number(entry.config.weight || 0) * entry.amount,
      0
    );
    if (getWeight(inv) + addedWeight > MAX_WEIGHT) return false;

    for (const entry of prepared) {
      const { config, amount } = entry;
      const existing = config.stackable
        ? Object.values(inv.items || {}).find((item) => (item.itemId || item.id) === config.id)
        : null;

      if (existing) {
        existing.amount = Number(existing.amount || 0) + amount;
        continue;
      }

      const freeSlot = getFreeSlot(inv.slots);
      if (freeSlot === -1) return false;
      const uid = createUid(config.id);
      inv.items[uid] = {
        ...config,
        uid,
        itemId: config.id,
        amount,
        ...(Number(config.maxDurability || 0) > 0
          ? { durability: Number(config.maxDurability), maxDurability: Number(config.maxDurability) }
          : {}),
      };
      inv.slots[freeSlot] = uid;
    }

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    prepared.forEach((entry) => refreshEquippedWeaponsForAmmo(player, inv, entry.config.id));
    return true;
  } catch (e) {
    console.error("[INVENTORY] addItems error:", e);
    return false;
  }
}

async function foldHuntingTentWithContents(
  player,
  profile,
  bags = [],
  durability = 0,
  expectedTentPlacedAt = 0
) {
  const staticId = getStaticId(player);
  const storedBags = Array.isArray(bags) ? bags : [];
  const tentDurability = Math.max(0, Math.round(Number(durability || 0)));
  if (!staticId || !profile) return { ok: false, reason: "invalid" };
  if (storedBags.length > 0) return { ok: false, reason: "not_empty" };

  const entries = storedBags.map((bag) => ({
    itemId: String(bag?.itemId || bag?.id || "hunting_carcass_bag"),
    overrides: { ...bag },
  }));
  if (tentDurability > 0) {
    entries.push({ itemId: "hunting_tent", overrides: { durability: tentDurability } });
  }
  if (entries.some((entry) => !getItemConfig(entry.itemId))) {
    return { ok: false, reason: "invalid_item" };
  }

  try {
    await repository.ensureInventory(staticId);
    let committedInventory = null;
    let committedProfile = null;
    let createdItems = [];

    await database.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const [inventoryRows] = await connection.query(
          "SELECT inventory FROM character_inventories WHERE static_id = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        const [profileRows] = await connection.query(
          "SELECT profile FROM hunting_profiles WHERE static_id = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        const lockedProfile = parseJson(profileRows?.[0]?.profile, {});
        const lockedTent = lockedProfile?.tent;
        const expectedPlacedAt = Math.max(0, Number(expectedTentPlacedAt || 0));
        if (
          !lockedTent?.deployed ||
          (
            expectedPlacedAt > 0 &&
            Number(lockedTent.placedAt || 0) !== expectedPlacedAt
          )
        ) {
          throw Object.assign(new Error("stale_tent"), { code: "HUNTING_TENT_STALE" });
        }
        if (Array.isArray(lockedTent.bags) && lockedTent.bags.length > 0) {
          throw Object.assign(new Error("tent_not_empty"), { code: "HUNTING_TENT_NOT_EMPTY" });
        }
        const nextLockedProfile = {
          ...lockedProfile,
          tent: null,
          pendingTentReturn: null,
          lastSeenAt: Math.max(Date.now(), Number(profile?.lastSeenAt || 0)),
        };
        const inv = repository.normalizeInventory(parseJson(inventoryRows?.[0]?.inventory, repository.createDefaultInventory()));
        ensureInventoryDurability(inv);

        const freeSlots = inv.slots.reduce((total, slot) => total + (slot === null ? 1 : 0), 0);
        if (freeSlots < entries.length) throw Object.assign(new Error("slots"), { code: "HUNTING_TENT_SLOTS" });
        const addedWeight = entries.reduce((total, entry) => {
          const config = getItemConfig(entry.itemId);
          return total + Math.max(0, Number(entry.overrides?.weight ?? config.weight ?? 0));
        }, 0);
        if (getWeight(inv) + addedWeight > MAX_WEIGHT) {
          throw Object.assign(new Error("weight"), { code: "HUNTING_TENT_WEIGHT" });
        }

        createdItems = entries.map((entry) => {
          const config = getItemConfig(entry.itemId);
          const uid = createUid(config.id);
          const item = {
            ...config,
            ...entry.overrides,
            uid,
            itemId: config.id,
            id: config.id,
            amount: 1,
            stackable: false,
            ...(Number(config.maxDurability || 0) > 0
              ? {
                  durability: Math.max(0, Number(entry.overrides?.durability ?? config.maxDurability)),
                  maxDurability: Number(config.maxDurability),
                }
              : {}),
          };
          const freeSlot = getFreeSlot(inv.slots);
          inv.items[uid] = item;
          inv.slots[freeSlot] = uid;
          return item;
        });

        await connection.query(
          "UPDATE character_inventories SET inventory = ? WHERE static_id = ?",
          [JSON.stringify(inv), staticId]
        );
        await connection.query(
          `INSERT INTO hunting_profiles (static_id, profile)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE profile = VALUES(profile), updated_at = CURRENT_TIMESTAMP`,
          [staticId, JSON.stringify(nextLockedProfile)]
        );
        await connection.commit();
        committedInventory = inv;
        committedProfile = nextLockedProfile;
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });

    await syncInventory(player, committedInventory, false);
    return { ok: true, items: createdItems, profile: committedProfile };
  } catch (error) {
    if (error?.code === "HUNTING_TENT_SLOTS") return { ok: false, reason: "slots" };
    if (error?.code === "HUNTING_TENT_WEIGHT") return { ok: false, reason: "weight" };
    if (error?.code === "HUNTING_TENT_STALE") return { ok: false, reason: "stale" };
    if (error?.code === "HUNTING_TENT_NOT_EMPTY") return { ok: false, reason: "not_empty" };
    console.error("[INVENTORY] foldHuntingTentWithContents error:", error);
    return { ok: false, reason: "error" };
  }
}

async function updateHuntingTentPosition(player, expectedTentPlacedAt, position) {
  const staticId = getStaticId(player);
  const nextPosition = {
    x: Number(position?.x),
    y: Number(position?.y),
    z: Number(position?.z),
  };
  if (!staticId || !Object.values(nextPosition).every(Number.isFinite)) {
    return { ok: false, reason: "invalid" };
  }

  try {
    let committedProfile = null;
    await database.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const [profileRows] = await connection.query(
          "SELECT profile FROM hunting_profiles WHERE static_id = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        const lockedProfile = parseJson(profileRows?.[0]?.profile, {});
        const lockedTent = lockedProfile?.tent;
        const expectedPlacedAt = Math.max(0, Number(expectedTentPlacedAt || 0));
        if (
          !lockedTent?.deployed ||
          (
            expectedPlacedAt > 0 &&
            Number(lockedTent.placedAt || 0) !== expectedPlacedAt
          )
        ) {
          throw Object.assign(new Error("stale_tent"), { code: "HUNTING_TENT_STALE" });
        }

        committedProfile = {
          ...lockedProfile,
          tent: {
            ...lockedTent,
            position: nextPosition,
          },
          lastSeenAt: Date.now(),
        };
        await connection.query(
          "UPDATE hunting_profiles SET profile = ?, updated_at = CURRENT_TIMESTAMP WHERE static_id = ?",
          [JSON.stringify(committedProfile), staticId]
        );
        await connection.commit();
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });
    return { ok: true, profile: committedProfile };
  } catch (error) {
    if (error?.code === "HUNTING_TENT_STALE") return { ok: false, reason: "stale" };
    console.error("[INVENTORY] updateHuntingTentPosition error:", error);
    return { ok: false, reason: "error" };
  }
}

async function transferHuntingTentBag(player, direction, sourceIndex, maxTentWeight = 90, sourceUid = "") {
  const staticId = getStaticId(player);
  const normalizedDirection = String(direction || "");
  const index = Math.floor(Number(sourceIndex));
  const normalizedSourceUid = String(sourceUid || "").trim();
  if (
    !staticId || !["take", "put"].includes(normalizedDirection) ||
    (normalizedDirection === "take" && (!Number.isInteger(index) || index < 0)) ||
    (normalizedDirection === "put" && !normalizedSourceUid && (!Number.isInteger(index) || index < 0))
  ) {
    return { ok: false, reason: "invalid" };
  }

  try {
    await repository.ensureInventory(staticId);
    let committedInventory = null;
    let committedProfile = null;
    let movedItem = null;

    await database.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const [inventoryRows] = await connection.query(
          "SELECT inventory FROM character_inventories WHERE static_id = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        const [profileRows] = await connection.query(
          "SELECT profile FROM hunting_profiles WHERE static_id = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        const inv = repository.normalizeInventory(parseJson(inventoryRows?.[0]?.inventory, repository.createDefaultInventory()));
        ensureInventoryDurability(inv);
        const profile = parseJson(profileRows?.[0]?.profile, null);
        if (!profile?.tent?.deployed || !Array.isArray(profile.tent.bags)) {
          throw Object.assign(new Error("tent"), { transferReason: "tent" });
        }
        const spoiledConfig = getItemConfig("hunting_spoiled_carcass");
        profile.tent.bags.forEach((bag) => {
          if (
            String(bag?.itemId || bag?.id) === "hunting_carcass_bag" &&
            Number(bag?.freshUntil || 0) <= Date.now()
          ) {
            Object.assign(bag, spoiledConfig || {}, {
              itemId: "hunting_spoiled_carcass",
              id: "hunting_spoiled_carcass",
              name: `Испорченная туша «${bag.speciesName || "животного"}»`,
              spoiledAt: Date.now(),
            });
          }
        });

        if (normalizedDirection === "take") {
          const stored = profile.tent.bags[index];
          if (!stored) throw Object.assign(new Error("missing"), { transferReason: "missing" });
          const config = getItemConfig(stored.itemId || stored.id || "hunting_carcass_bag");
          if (!config) throw Object.assign(new Error("item"), { transferReason: "invalid_item" });
          const freeSlot = getFreeSlot(inv.slots);
          if (freeSlot === -1) throw Object.assign(new Error("slots"), { transferReason: "slots" });
          const itemWeight = Math.max(0, Number(stored.weight ?? config.weight ?? 0));
          if (getWeight(inv) + itemWeight > MAX_WEIGHT) {
            throw Object.assign(new Error("weight"), { transferReason: "weight" });
          }
          const uid = createUid(config.id);
          movedItem = {
            ...config,
            ...stored,
            uid,
            itemId: config.id,
            id: config.id,
            amount: 1,
            stackable: false,
          };
          profile.tent.bags.splice(index, 1);
          inv.items[uid] = movedItem;
          inv.slots[freeSlot] = uid;
        } else {
          const uid = normalizedSourceUid || inv.slots[index];
          const item = uid ? inv.items?.[uid] : null;
          if (
            !item || String(item.itemId || item.id) !== "hunting_carcass_bag" ||
            Number(item.freshUntil || 0) <= Date.now()
          ) {
            throw Object.assign(new Error("bag"), { transferReason: "bag" });
          }
          const itemWeight = Math.max(0, Number(item.huntingWeight || item.weight || 0));
          const tentWeight = profile.tent.bags.reduce(
            (total, entry) => total + Math.max(0, Number(entry?.huntingWeight || entry?.weight || 0)),
            0
          );
          if (tentWeight + itemWeight > Math.max(1, Number(maxTentWeight || 90))) {
            throw Object.assign(new Error("capacity"), { transferReason: "capacity" });
          }
          movedItem = { ...item };
          removeItemUidEverywhere(inv, uid);
          profile.tent.bags.push(movedItem);
        }

        profile.lastSeenAt = Date.now();
        await connection.query(
          "UPDATE character_inventories SET inventory = ? WHERE static_id = ?",
          [JSON.stringify(inv), staticId]
        );
        await connection.query(
          "UPDATE hunting_profiles SET profile = ?, updated_at = CURRENT_TIMESTAMP WHERE static_id = ?",
          [JSON.stringify(profile), staticId]
        );
        await connection.commit();
        committedInventory = inv;
        committedProfile = profile;
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });

    await syncInventory(player, committedInventory, false);
    if (normalizedDirection === "put") reportInventoryItemRemoved(player, movedItem, "tent_transfer");
    return { ok: true, profile: committedProfile, item: movedItem };
  } catch (error) {
    if (!error?.transferReason) console.error("[INVENTORY] transferHuntingTentBag error:", error);
    return { ok: false, reason: error?.transferReason || "error" };
  }
}

async function transferHuntingVehicleBag(
  player,
  storageKey,
  direction,
  sourceIndex,
  maxVehicleWeight = 120,
  sourceUid = ""
) {
  const staticId = getStaticId(player);
  const key = String(storageKey || "").trim();
  const normalizedDirection = String(direction || "");
  const index = Math.floor(Number(sourceIndex));
  const normalizedSourceUid = String(sourceUid || "").trim();
  if (
    !staticId || !key || !["take", "put"].includes(normalizedDirection) ||
    (normalizedDirection === "take" && !normalizedSourceUid && (!Number.isInteger(index) || index < 0)) ||
    (normalizedDirection === "put" && !normalizedSourceUid)
  ) {
    return { ok: false, reason: "invalid" };
  }

  try {
    await repository.ensureInventory(staticId);
    let committedInventory = null;
    let committedProfile = null;
    let movedItem = null;

    await database.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const [inventoryRows] = await connection.query(
          "SELECT inventory FROM character_inventories WHERE static_id = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        const [profileRows] = await connection.query(
          "SELECT profile FROM hunting_profiles WHERE static_id = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        const inv = repository.normalizeInventory(parseJson(inventoryRows?.[0]?.inventory, repository.createDefaultInventory()));
        ensureInventoryDurability(inv);
        // Vehicle storage is available even before a character has ever
        // started hunting, so a hunting profile row is optional here.
        const profile = parseJson(profileRows?.[0]?.profile, null) || {
          active: false,
          mode: null,
          currentQuest: null,
          vehicleBags: {},
          lastSeenAt: Date.now(),
        };
        if (!profile.vehicleBags || typeof profile.vehicleBags !== "object" || Array.isArray(profile.vehicleBags)) {
          profile.vehicleBags = {};
        }
        if (!Array.isArray(profile.vehicleBags[key])) profile.vehicleBags[key] = [];
        const storedBags = profile.vehicleBags[key];
        const spoiledConfig = getItemConfig("hunting_spoiled_carcass");
        storedBags.forEach((bag) => {
          if (
            String(bag?.itemId || bag?.id) === "hunting_carcass_bag" &&
            Number(bag?.freshUntil || 0) <= Date.now()
          ) {
            Object.assign(bag, spoiledConfig || {}, {
              itemId: "hunting_spoiled_carcass",
              id: "hunting_spoiled_carcass",
              name: `Испорченная туша «${bag.speciesName || "животного"}»`,
              spoiledAt: Date.now(),
            });
          }
        });

        if (normalizedDirection === "take") {
          const storedIndex = normalizedSourceUid
            ? storedBags.findIndex((entry) => String(entry?.uid || "") === normalizedSourceUid)
            : index;
          const stored = storedBags[storedIndex];
          if (!stored || storedIndex < 0) {
            throw Object.assign(new Error("missing"), { transferReason: "missing" });
          }
          const config = getItemConfig(stored.itemId || stored.id || "hunting_carcass_bag");
          if (!config) throw Object.assign(new Error("item"), { transferReason: "invalid_item" });
          const freeSlot = getFreeSlot(inv.slots);
          if (freeSlot === -1) throw Object.assign(new Error("slots"), { transferReason: "slots" });
          const amount = Math.max(1, Number(stored.amount || 1));
          const itemWeight = Math.max(
            0,
            Number(stored.huntingWeight ?? stored.weight ?? config.weight ?? 0) * amount
          );
          if (getWeight(inv) + itemWeight > MAX_WEIGHT) {
            throw Object.assign(new Error("weight"), { transferReason: "weight" });
          }
          const storedUid = String(stored.uid || "");
          const uid = storedUid && !inv.items[storedUid] ? storedUid : createUid(config.id);
          movedItem = {
            ...config,
            ...stored,
            uid,
            itemId: config.id,
            id: config.id,
            amount,
            stackable: Boolean(stored.stackable ?? config.stackable),
          };
          storedBags.splice(storedIndex, 1);
          inv.items[uid] = movedItem;
          inv.slots[freeSlot] = uid;
        } else {
          const item = inv.items?.[normalizedSourceUid];
          const sourceSlotMatches = Number.isInteger(index) && index >= 0 &&
            String(inv.slots?.[index] || "") === normalizedSourceUid;
          if (!item || !sourceSlotMatches || !getItemConfig(item.itemId || item.id)) {
            throw Object.assign(new Error("item"), { transferReason: "item" });
          }
          if (isBoundItem(item)) {
            throw Object.assign(new Error("bound"), { transferReason: "bound" });
          }
          if (storedBags.length >= 50) {
            throw Object.assign(new Error("slots"), { transferReason: "capacity_slots" });
          }
          const itemWeight = Math.max(
            0,
            Number(item.huntingWeight || item.weight || 0) * Math.max(1, Number(item.amount || 1))
          );
          const storedWeight = storedBags.reduce(
            (total, entry) => total + Math.max(
              0,
              Number(entry?.huntingWeight || entry?.weight || 0) * Math.max(1, Number(entry?.amount || 1))
            ),
            0
          );
          if (storedWeight + itemWeight > Math.max(1, Number(maxVehicleWeight || 120))) {
            throw Object.assign(new Error("capacity"), { transferReason: "capacity" });
          }
          movedItem = { ...item };
          removeItemUidEverywhere(inv, normalizedSourceUid);
          storedBags.push(movedItem);
        }

        profile.lastSeenAt = Date.now();
        await connection.query(
          "UPDATE character_inventories SET inventory = ? WHERE static_id = ?",
          [JSON.stringify(inv), staticId]
        );
        await connection.query(
          `INSERT INTO hunting_profiles (static_id, profile)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE profile = VALUES(profile), updated_at = CURRENT_TIMESTAMP`,
          [staticId, JSON.stringify(profile)]
        );
        await connection.commit();
        committedInventory = inv;
        committedProfile = profile;
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });

    await syncInventory(player, committedInventory, false);
    refreshEquippedWeaponsForAmmo(
      player,
      committedInventory,
      String(movedItem?.itemId || movedItem?.id || "")
    );
    if (normalizedDirection === "put") reportInventoryItemRemoved(player, movedItem, "vehicle_transfer");
    return { ok: true, profile: committedProfile, item: movedItem };
  } catch (error) {
    if (!error?.transferReason) console.error("[INVENTORY] transferHuntingVehicleBag error:", error);
    return { ok: false, reason: error?.transferReason || "error" };
  }
}

async function purchaseItems(player, requirements, price = 0, options = {}) {
  const staticId = getStaticId(player);
  const normalized = normalizeRequirements(requirements);
  const purchasePrice = Math.max(0, Math.round(Number(price || 0)));
  const paymentType = String(options?.paymentType || "cash") === "card" ? "card" : "cash";
  const paymentField = paymentType === "card" ? "bank" : "cash";
  if (!staticId || normalized.length === 0) return { ok: false, reason: "invalid" };

  const prepared = normalized.map((requirement) => ({
    ...requirement,
    config: getItemConfig(requirement.itemId),
  }));
  if (prepared.some((entry) => !entry.config || entry.config.bound === true || entry.config.internalOnly === true)) {
    return { ok: false, reason: "invalid" };
  }

  try {
    await repository.ensureInventory(staticId);
    let committedInventory = null;
    let remainingCash = null;
    let transactionResult = null;

    await database.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const [characters] = await connection.query(
          "SELECT cash, bank FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        if (!characters?.[0]) throw Object.assign(new Error("character_missing"), { purchaseReason: "character" });
        const currentBalance = Math.max(0, Number(characters[0][paymentField] || 0));
        if (currentBalance < purchasePrice) {
          throw Object.assign(new Error("not_enough_cash"), { purchaseReason: "cash" });
        }

        const [rows] = await connection.query(
          "SELECT inventory FROM character_inventories WHERE static_id = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        const inv = repository.normalizeInventory(parseJson(
          rows?.[0]?.inventory,
          repository.createDefaultInventory()
        ));
        ensureInventoryDurability(inv);

        const addedWeight = prepared.reduce(
          (total, entry) => total + Number(entry.config.weight || 0) * entry.amount,
          0
        );
        if (getWeight(inv) + addedWeight > MAX_WEIGHT) {
          throw Object.assign(new Error("inventory_weight"), { purchaseReason: "weight" });
        }

        const freeSlotsCount = inv.slots.reduce((total, uid) => total + (uid === null ? 1 : 0), 0);
        const requiredSlots = prepared.reduce((total, entry) => {
          if (!entry.config.stackable) return total + Math.max(1, Math.floor(entry.amount));
          const existing = Object.values(inv.items || {}).some(
            (item) => (item.itemId || item.id) === entry.config.id
          );
          return total + (existing ? 0 : 1);
        }, 0);
        if (requiredSlots > freeSlotsCount) {
          throw Object.assign(new Error("inventory_slots"), { purchaseReason: "slots" });
        }

        for (const entry of prepared) {
          const { config, amount } = entry;
          const existing = config.stackable
            ? Object.values(inv.items || {}).find((item) => (item.itemId || item.id) === config.id)
            : null;
          if (existing) {
            existing.amount = Number(existing.amount || 0) + amount;
            continue;
          }

          const instanceCount = config.stackable ? 1 : Math.max(1, Math.floor(amount));
          for (let instance = 0; instance < instanceCount; instance += 1) {
            const freeSlot = getFreeSlot(inv.slots);
            if (freeSlot === -1) {
              throw Object.assign(new Error("inventory_slots"), { purchaseReason: "slots" });
            }
            const uid = createUid(config.id);
            inv.items[uid] = {
              ...config,
              uid,
              itemId: config.id,
              amount: config.stackable ? amount : 1,
              ...(Number(config.maxDurability || 0) > 0
                ? { durability: Number(config.maxDurability), maxDurability: Number(config.maxDurability) }
                : {}),
            };
            inv.slots[freeSlot] = uid;
          }
        }

        remainingCash = currentBalance - purchasePrice;
        await connection.query(
          "UPDATE character_inventories SET inventory = ? WHERE static_id = ?",
          [JSON.stringify(repository.normalizeInventory(inv)), staticId]
        );
        if (purchasePrice > 0) {
          await connection.query(
            `UPDATE characters SET ${paymentField} = ? WHERE uuid = ?`,
            [remainingCash, staticId]
          );
        }
        if (typeof options.transactionWork === "function") {
          transactionResult = await options.transactionWork(connection, {
            inventory: inv,
            items: prepared.map((entry) => ({
              amount: entry.amount,
              itemId: entry.config.id,
            })),
            price: purchasePrice,
            paymentType,
            remainingCash,
            staticId,
          });
        }
        await connection.commit();
        committedInventory = inv;
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });

    await syncInventory(player, committedInventory, false);
    prepared.forEach((entry) => refreshEquippedWeaponsForAmmo(player, committedInventory, entry.config.id));
    return { ok: true, balance: remainingCash, cash: paymentType === "cash" ? remainingCash : Number(player?.character?.cash || 0), bank: paymentType === "card" ? remainingCash : Number(player?.character?.bank || 0), paymentType, transactionResult };
  } catch (error) {
    if (!error?.purchaseReason) console.error("[INVENTORY] purchaseItems error:", error);
    return {
      ok: false,
      reason: error?.purchaseReason || error?.businessReason || "database",
    };
  }
}

async function sellItemInstances(player, rawUids, options = {}) {
  const staticId = getStaticId(player);
  const uids = [...new Set((Array.isArray(rawUids) ? rawUids : []).map((uid) => String(uid || "").trim()).filter(Boolean))];
  if (!staticId || uids.length < 1 || uids.length > 100) return { ok: false, reason: "invalid" };

  try {
    await repository.ensureInventory(staticId);
    let committedInventory = null;
    let soldItems = [];
    let totalPrice = 0;
    let nextCash = 0;

    await database.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const [characters] = await connection.query(
          "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        if (!characters?.[0]) throw Object.assign(new Error("character"), { saleReason: "character" });
        const [rows] = await connection.query(
          "SELECT inventory FROM character_inventories WHERE static_id = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        const inv = repository.normalizeInventory(parseJson(rows?.[0]?.inventory, repository.createDefaultInventory()));
        ensureInventoryDurability(inv);

        soldItems = uids.map((uid) => inv.items?.[uid]).filter(Boolean);
        if (soldItems.length !== uids.length) throw Object.assign(new Error("missing"), { saleReason: "missing" });
        if (typeof options.validateItem === "function" && soldItems.some((item) => !options.validateItem(item))) {
          throw Object.assign(new Error("invalid_item"), { saleReason: "invalid_item" });
        }
        const prices = soldItems.map((item) => Math.max(0, Math.round(Number(options.getPrice?.(item) || 0))));
        if (prices.some((price) => price < 1)) throw Object.assign(new Error("price"), { saleReason: "price" });
        totalPrice = prices.reduce((sum, price) => sum + price, 0);
        soldItems.forEach((item) => removeItemUidEverywhere(inv, item.uid));
        nextCash = Math.max(0, Number(characters[0].cash || 0)) + totalPrice;

        await connection.query(
          "UPDATE character_inventories SET inventory = ? WHERE static_id = ?",
          [JSON.stringify(inv), staticId]
        );
        await connection.query("UPDATE characters SET cash = ? WHERE uuid = ?", [nextCash, staticId]);
        if (typeof options.transactionWork === "function") {
          await options.transactionWork(connection, { items: soldItems, nextCash, staticId, totalPrice });
        }
        await connection.commit();
        committedInventory = inv;
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });

    await syncInventory(player, committedInventory, false);
    soldItems.forEach((item) => reportInventoryItemRemoved(player, item, "item_sale"));
    return { ok: true, cash: nextCash, items: soldItems.map((item) => ({ ...item })), totalPrice };
  } catch (error) {
    if (!error?.saleReason) console.error("[INVENTORY] sellItemInstances error:", error);
    return { ok: false, reason: error?.saleReason || "error" };
  }
}

async function sellHuntingBag(
  player,
  nearbyStorageKeys = [],
  speciesValues = {},
  coefficient = 1,
  preferredInventoryUid = ""
) {
  const staticId = getStaticId(player);
  if (!staticId) return { ok: false, reason: "character" };
  const allowedStorageKeys = new Set(
    (Array.isArray(nearbyStorageKeys) ? nearbyStorageKeys : [])
      .map((key) => String(key || ""))
      .filter(Boolean)
  );
  const priceCoefficient = Math.max(0, Number(coefficient || 0));
  const preferredUid = String(preferredInventoryUid || "").trim();

  try {
    await repository.ensureInventory(staticId);
    let committedInventory = null;
    let committedProfile = null;
    let soldItem = null;
    let source = "";
    let nextCash = 0;
    let price = 0;

    await database.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const [characters] = await connection.query(
          "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        if (!characters?.[0]) throw Object.assign(new Error("character"), { saleReason: "character" });
        const [inventoryRows] = await connection.query(
          "SELECT inventory FROM character_inventories WHERE static_id = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        const [profileRows] = await connection.query(
          "SELECT profile FROM hunting_profiles WHERE static_id = ? LIMIT 1 FOR UPDATE",
          [staticId]
        );
        const inv = repository.normalizeInventory(parseJson(inventoryRows?.[0]?.inventory, repository.createDefaultInventory()));
        ensureInventoryDurability(inv);
        const profile = parseJson(profileRows?.[0]?.profile, { vehicleBags: {} }) || { vehicleBags: {} };
        if (!profile.vehicleBags || typeof profile.vehicleBags !== "object") profile.vehicleBags = {};
        const now = Date.now();
        const isFresh = (item) => (
          String(item?.itemId || item?.id) === "hunting_carcass_bag" &&
          Number(item?.freshUntil || 0) > now
        );

        const preferredItem = preferredUid ? inv.items?.[preferredUid] : null;
        soldItem = isFresh(preferredItem)
          ? preferredItem
          : Object.values(inv.items || {})
            .filter(isFresh)
            .sort((left, right) => Number(right?.harvestedAt || 0) - Number(left?.harvestedAt || 0))[0] || null;
        if (soldItem) {
          source = "inventory";
          removeItemUidEverywhere(inv, soldItem.uid);
        } else {
          for (const storageKey of allowedStorageKeys) {
            const bags = profile.vehicleBags[storageKey];
            if (!Array.isArray(bags)) continue;
            const bagIndex = bags.findIndex(isFresh);
            if (bagIndex < 0) continue;
            [soldItem] = bags.splice(bagIndex, 1);
            source = `vehicle:${storageKey}`;
            break;
          }
        }
        if (!soldItem) throw Object.assign(new Error("missing"), { saleReason: "missing" });

        const base = Number(speciesValues[String(soldItem.speciesId)] || 250);
        const weightFactor = Math.max(0.7, Number(soldItem.huntingWeight || 10) / 20);
        price = Math.max(1, Math.round(base * weightFactor * priceCoefficient));
        nextCash = Math.max(0, Number(characters[0].cash || 0)) + price;

        await connection.query(
          "UPDATE character_inventories SET inventory = ? WHERE static_id = ?",
          [JSON.stringify(inv), staticId]
        );
        await connection.query(
          `INSERT INTO hunting_profiles (static_id, profile)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE profile = VALUES(profile), updated_at = CURRENT_TIMESTAMP`,
          [staticId, JSON.stringify(profile)]
        );
        await connection.query("UPDATE characters SET cash = ? WHERE uuid = ?", [nextCash, staticId]);
        await connection.commit();
        committedInventory = inv;
        committedProfile = profile;
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });

    await syncInventory(player, committedInventory, false);
    if (source === "inventory") reportInventoryItemRemoved(player, soldItem, "hunting_sale");
    return {
      ok: true,
      item: { ...soldItem },
      source,
      price,
      cash: nextCash,
      profile: committedProfile,
    };
  } catch (error) {
    if (!error?.saleReason) console.error("[INVENTORY] sellHuntingBag error:", error);
    return { ok: false, reason: error?.saleReason || "error" };
  }
}

async function addItemInstance(player, itemId, overrides = {}) {
  try {
    const staticId = getStaticId(player);
    const config = getItemConfig(itemId);
    if (!staticId || !config || config.bound === true || config.internalOnly === true) return { ok: false, reason: "invalid" };

    const inv = await repository.getInventory(staticId);
    const freeSlot = getFreeSlot(inv.slots);
    if (freeSlot === -1) return { ok: false, reason: "slots" };

    const itemWeight = Math.max(0, Number(overrides.weight ?? config.weight ?? 0));
    if (getWeight(inv) + itemWeight > MAX_WEIGHT) {
      return { ok: false, reason: "weight" };
    }

    const uid = createUid(config.id);
    const item = {
      ...config,
      ...overrides,
      uid,
      itemId: config.id,
      amount: 1,
      stackable: false,
      ...(Number(config.maxDurability || 0) > 0
        ? {
            durability: Number(overrides.durability ?? config.maxDurability),
            maxDurability: Number(config.maxDurability),
          }
        : {}),
    };

    inv.items[uid] = item;
    inv.slots[freeSlot] = uid;
    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    return { ok: true, item: { ...item } };
  } catch (e) {
    console.error("[INVENTORY] addItemInstance error:", e);
    return { ok: false, reason: "error" };
  }
}

async function reconcileBoundItemInstances(connection, owner, descriptors = []) {
  if (!connection || typeof connection.query !== "function") {
    throw new TypeError("A database connection is required.");
  }

  const staticId = Number(typeof owner === "number" ? owner : getStaticId(owner));
  if (!Number.isSafeInteger(staticId) || staticId <= 0) {
    throw new Error("Персонаж не загружен.");
  }

  const byDocumentKey = new Map();
  for (const raw of Array.isArray(descriptors) ? descriptors : []) {
    const itemConfig = raw?.itemId ? getItemConfig(raw.itemId) : null;
    const documentKey = String(raw?.documentKey || itemConfig?.documentKey || "").trim();
    const active = Boolean(raw?.active);
    if (!documentKey) throw new Error("Ключ bound-предмета не задан.");
    if (active && (!itemConfig || itemConfig.bound !== true)) {
      throw new Error("Конфигурация bound-предмета в инвентаре недоступна.");
    }
    byDocumentKey.set(documentKey, {
      active,
      documentKey,
      expectedUid: String(raw?.expectedUid || ""),
      itemConfig,
      metadata: raw?.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
    });
  }
  const normalized = [...byDocumentKey.values()];
  if (!normalized.length) return { inventory: null, entries: [] };

  await connection.query(
    `INSERT INTO character_inventories (static_id, inventory)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE static_id = VALUES(static_id)`,
    [staticId, JSON.stringify(repository.createDefaultInventory())]
  );
  const [rows] = await connection.query(
    "SELECT inventory FROM character_inventories WHERE static_id = ? LIMIT 1 FOR UPDATE",
    [staticId]
  );
  const inv = repository.normalizeInventory(
    parseJson(rows?.[0]?.inventory, repository.createDefaultInventory())
  );
  const entries = [];

  for (const descriptor of normalized) {
    const matches = Object.entries(inv.items || {}).filter(([, item]) => (
      isBoundItem(item) && String(item.documentKey || "") === descriptor.documentKey
    ));
    if (!descriptor.active) {
      matches.forEach(([uid]) => removeItemUidEverywhere(inv, uid));
      entries.push({ documentKey: descriptor.documentKey, item: null, added: false, removed: matches.length });
      continue;
    }

    const preferred = matches.find(([uid, item]) => (
      descriptor.expectedUid && (uid === descriptor.expectedUid || String(item?.uid || "") === descriptor.expectedUid)
    ));
    const [existingUid = "", existing = null] = preferred || matches[0] || [];
    matches.forEach(([uid]) => {
      if (uid !== existingUid) removeItemUidEverywhere(inv, uid);
    });

    const previousWeight = existing ? Math.max(0, Number(existing.weight || 0)) : 0;
    const nextWeight = Math.max(0, Number(descriptor.metadata.weight ?? descriptor.itemConfig.weight ?? 0));
    if (getWeight(inv) - previousWeight + nextWeight > MAX_WEIGHT) {
      const error = new Error("Недостаточно свободного веса в инвентаре для bound-предмета.");
      error.inventoryReason = "weight";
      throw error;
    }

    let uid = String(existingUid || existing?.uid || "");
    let added = false;
    if (!existing) {
      const freeSlot = getFreeSlot(inv.slots);
      if (freeSlot === -1) {
        const error = new Error("Нет свободного слота в инвентаре для bound-предмета.");
        error.inventoryReason = "slots";
        throw error;
      }
      uid = createUid(descriptor.itemConfig.id);
      inv.slots[freeSlot] = uid;
      added = true;
    } else {
      const placed = inv.slots.includes(uid) || inv.quick.includes(uid) || Object.values(inv.equipment).includes(uid);
      if (!placed) {
        const freeSlot = getFreeSlot(inv.slots);
        if (freeSlot === -1) {
          const error = new Error("Нет свободного слота для восстановления bound-предмета.");
          error.inventoryReason = "slots";
          throw error;
        }
        inv.slots[freeSlot] = uid;
      }
    }

    const item = {
      ...descriptor.itemConfig,
      ...(existing || {}),
      ...descriptor.metadata,
      uid,
      itemId: descriptor.itemConfig.id,
      id: descriptor.itemConfig.id,
      amount: 1,
      stackable: false,
      bound: true,
      documentKey: descriptor.documentKey,
      ownerStaticId: staticId,
      usable: Boolean(descriptor.itemConfig.usable),
      useEvent: descriptor.itemConfig.useEvent,
      actions: Array.isArray(descriptor.itemConfig.actions) ? descriptor.itemConfig.actions.slice() : ["use", "info"],
    };
    inv.items[uid] = item;
    entries.push({ documentKey: descriptor.documentKey, item: { ...item }, added, removed: Math.max(0, matches.length - 1) });
  }

  await connection.query(
    "UPDATE character_inventories SET inventory = ? WHERE static_id = ?",
    [JSON.stringify(inv), staticId]
  );

  return { inventory: inv, entries };
}

function runPlayersExclusive(players, label, operation) {
  const keyed = [...new Map((players || []).map((player) => {
    const staticId = Number(getStaticId(player));
    const key = staticId > 0 ? `static:${staticId}` : `player:${Number(player?.id)}`;
    return [key, { key, player }];
  })).values()].sort((left, right) => left.key.localeCompare(right.key));
  const previous = Promise.all(keyed.map(({ key }) => (inventoryOperationChains.get(key) || Promise.resolve()).catch(() => {})));
  let current = null;
  current = previous.then(operation).catch((error) => {
    console.error(`[INVENTORY] exclusive multi-player operation failed (${label}):`, error);
    return false;
  }).finally(() => {
    keyed.forEach(({ key }) => {
      if (inventoryOperationChains.get(key) === current) inventoryOperationChains.delete(key);
    });
  });
  keyed.forEach(({ key }) => inventoryOperationChains.set(key, current));
  return current;
}

async function stageConsumeItemByUid(connection, owner, uid, expectedItemId, amount = 1) {
  if (!connection || typeof connection.query !== "function") throw new TypeError("A database connection is required.");
  const staticId = Number(typeof owner === "number" ? owner : getStaticId(owner));
  const safeUid = String(uid || "").trim();
  const expected = String(expectedItemId || "").trim();
  const count = Math.max(1, Math.floor(Number(amount || 1)));
  if (!Number.isSafeInteger(staticId) || staticId <= 0 || !safeUid || !expected) {
    throw Object.assign(new Error("Некорректный предмет."), { inventoryReason: "invalid" });
  }
  await connection.query(
    `INSERT INTO character_inventories (static_id, inventory)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE static_id = VALUES(static_id)`,
    [staticId, JSON.stringify(repository.createDefaultInventory())]
  );
  const [rows] = await connection.query(
    "SELECT inventory FROM character_inventories WHERE static_id = ? LIMIT 1 FOR UPDATE",
    [staticId]
  );
  const inv = repository.normalizeInventory(parseJson(rows?.[0]?.inventory, repository.createDefaultInventory()));
  const item = inv.items?.[safeUid];
  if (!item || String(item.itemId || item.id) !== expected) {
    throw Object.assign(new Error("Предмет не найден."), { inventoryReason: "wrong_item" });
  }
  const currentAmount = Math.max(1, Number(item.amount || 1));
  if (currentAmount < count) throw Object.assign(new Error("Недостаточно предметов."), { inventoryReason: "amount" });
  const snapshot = { ...item };
  if (item.stackable && currentAmount > count) item.amount = currentAmount - count;
  else removeItemUidEverywhere(inv, safeUid);
  await connection.query(
    "UPDATE character_inventories SET inventory = ? WHERE static_id = ?",
    [JSON.stringify(inv), staticId]
  );
  return { inventory: inv, item: snapshot };
}

async function stageBoundItemInstance(connection, owner, itemId, overrides = {}) {
  const config = getItemConfig(itemId);
  const documentKey = String(overrides.documentKey || config?.documentKey || "").trim();
  if (!config || config.bound !== true || !documentKey) {
    throw new Error("Конфигурация документа в инвентаре недоступна.");
  }
  const result = await reconcileBoundItemInstances(connection, owner, [{
    active: true,
    itemId,
    documentKey,
    expectedUid: overrides.expectedUid,
    metadata: overrides,
  }]);
  const entry = result.entries[0];
  return { added: Boolean(entry?.added), inventory: result.inventory, item: entry?.item || null };
}

async function stageInternalItemInstance(connection, owner, itemId, overrides = {}, preferredUid = "") {
  if (!connection || typeof connection.query !== "function") throw new TypeError("A database connection is required.");
  const staticId = Number(typeof owner === "number" ? owner : getStaticId(owner));
  const config = getItemConfig(itemId);
  if (!Number.isSafeInteger(staticId) || staticId <= 0 || !config?.internalOnly || config.bound === true) {
    throw Object.assign(new Error("Внутренний предмет недоступен."), { inventoryReason: "invalid" });
  }
  await connection.query(
    `INSERT INTO character_inventories (static_id, inventory)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE static_id = VALUES(static_id)`,
    [staticId, JSON.stringify(repository.createDefaultInventory())]
  );
  const [inventoryRows] = await connection.query(
    "SELECT inventory FROM character_inventories WHERE static_id = ? LIMIT 1 FOR UPDATE",
    [staticId]
  );
  const inv = repository.normalizeInventory(parseJson(inventoryRows?.[0]?.inventory, repository.createDefaultInventory()));
  const freeSlot = getFreeSlot(inv.slots);
  if (freeSlot === -1) throw Object.assign(new Error("Нет свободного места для ваучера."), { inventoryReason: "slots" });
  const nextWeight = Math.max(0, Number(overrides.weight ?? config.weight ?? 0));
  if (getWeight(inv) + nextWeight > MAX_WEIGHT) {
    throw Object.assign(new Error("Недостаточно свободного веса для ваучера."), { inventoryReason: "weight" });
  }
  let uid = String(preferredUid || "").trim();
  if (!uid || inv.items?.[uid]) uid = createUid(config.id);
  const item = {
    ...config,
    ...overrides,
    uid,
    itemId: config.id,
    id: config.id,
    amount: 1,
    stackable: false,
    bound: false,
    internalOnly: true,
  };
  inv.items[uid] = item;
  inv.slots[freeSlot] = uid;
  await connection.query("UPDATE character_inventories SET inventory = ? WHERE static_id = ?", [JSON.stringify(inv), staticId]);
  return { inventory: inv, item: { ...item } };
}

async function syncInventorySnapshot(player, inventory) {
  if (!player || !inventory) return false;
  await syncInventory(player, inventory, false);
  return true;
}

async function syncCurrentInventory(player) {
  const staticId = getStaticId(player);
  if (!staticId) return false;
  const inventory = await repository.getInventory(staticId);
  await syncInventory(player, inventory, false);
  return true;
}

async function getItemsById(player, itemIds) {
  try {
    const staticId = getStaticId(player);
    if (!staticId) return [];

    const accepted = new Set(
      (Array.isArray(itemIds) ? itemIds : [itemIds])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    const inv = await repository.getInventory(staticId);

    return Object.values(inv.items || {})
      .filter((item) => accepted.has(String(item.itemId || item.id)))
      .map((item) => ({ ...item }));
  } catch (e) {
    console.error("[INVENTORY] getItemsById error:", e);
    return [];
  }
}

async function getOwnedItemByUid(player, uid, expectedItemId = "") {
  try {
    const staticId = getStaticId(player);
    if (!staticId || !uid) return null;
    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const item = inv.items?.[String(uid)];
    if (!item) return null;
    const expected = String(expectedItemId || "").trim();
    if (expected && String(item.itemId || item.id) !== expected) return null;
    return { ...item };
  } catch (e) {
    console.error("[INVENTORY] getOwnedItemByUid error:", e);
    return null;
  }
}

async function updateItemMetadataByUid(player, uid, expectedItemId, updates = {}) {
  try {
    const staticId = getStaticId(player);
    const expected = String(expectedItemId || "").trim();
    if (!staticId || !uid || !expected || !updates || typeof updates !== "object") return false;
    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const item = inv.items?.[String(uid)];
    if (!item || String(item.itemId || item.id) !== expected) return false;

    const protectedKeys = new Set(["uid", "id", "itemId", "amount", "weaponHash"]);
    Object.entries(updates).forEach(([key, value]) => {
      if (!protectedKeys.has(key)) item[key] = value;
    });
    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    return true;
  } catch (e) {
    console.error("[INVENTORY] updateItemMetadataByUid error:", e);
    return false;
  }
}

async function damageItemByUid(player, uid, expectedItemIds = [], amount = 1) {
  try {
    const staticId = getStaticId(player);
    const normalizedUid = String(uid || "");
    const accepted = new Set(
      (Array.isArray(expectedItemIds) ? expectedItemIds : [expectedItemIds])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    const damage = Math.max(1, Math.round(Number(amount || 1)));

    if (!staticId || !normalizedUid) return { ok: false, reason: "invalid" };

    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const item = inv.items?.[normalizedUid];
    const itemId = String(item?.itemId || item?.id || "");

    if (!item || (accepted.size > 0 && !accepted.has(itemId))) {
      return { ok: false, reason: "missing" };
    }

    const result = damageItemDurability(inv, item, damage);
    if (!result.ok) return { ok: false, reason: "durability", ...result };

    if (result.broken && Number(item.weaponHash || 0)) {
      removeEquippedItemFromPlayer(player, item);
    }

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    if (result.broken) {
      reportInventoryItemRemoved(player, item, "broken");
    }

    return {
      ok: true,
      item: { ...item },
      ...result,
    };
  } catch (e) {
    console.error("[INVENTORY] damageItemByUid error:", e);
    return { ok: false, reason: "error" };
  }
}

async function takeFirstMatchingItem(player, itemId, matcher = null) {
  try {
    const staticId = getStaticId(player);
    const normalizedItemId = String(itemId || "").trim();
    if (!staticId || !normalizedItemId) return { ok: false, reason: "invalid" };

    const inv = await repository.getInventory(staticId);
    const item = Object.values(inv.items || {}).find((entry) => (
      String(entry.itemId || entry.id) === normalizedItemId &&
      (typeof matcher !== "function" || matcher(entry))
    ));
    if (!item) return { ok: false, reason: "missing" };

    removeItemUidEverywhere(inv, item.uid);
    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    reportInventoryItemRemoved(player, item, "take_matching");
    return { ok: true, item: { ...item } };
  } catch (e) {
    console.error("[INVENTORY] takeFirstMatchingItem error:", e);
    return { ok: false, reason: "error" };
  }
}

async function spoilExpiredHuntingBags(player, now = Date.now()) {
  try {
    const staticId = getStaticId(player);
    if (!staticId) return 0;

    const inv = await repository.getInventory(staticId);
    const spoiledConfig = getItemConfig("hunting_spoiled_carcass");
    let changed = 0;

    Object.values(inv.items || {}).forEach((item) => {
      if (
        String(item.itemId || item.id) !== "hunting_carcass_bag" ||
        Number(item.freshUntil || 0) > Number(now)
      ) return;

      const preserved = {
        uid: item.uid,
        speciesId: item.speciesId,
        speciesName: item.speciesName,
        huntingWeight: item.huntingWeight,
        harvestedAt: item.harvestedAt,
        spoiledAt: Number(now),
      };
      Object.assign(item, spoiledConfig, preserved, {
        itemId: spoiledConfig.id,
        id: spoiledConfig.id,
        name: `Испорченная туша «${item.speciesName || "животного"}»`,
        weight: Number(item.huntingWeight || spoiledConfig.weight || 10),
        amount: 1,
      });
      changed += 1;
    });

    if (changed > 0) {
      await repository.saveInventory(staticId, inv);
      await syncInventory(player, inv, false);
    }

    return changed;
  } catch (e) {
    console.error("[INVENTORY] spoilExpiredHuntingBags error:", e);
    return 0;
  }
}

async function getOwnedItemCondition(player, itemId) {
  try {
    const staticId = getStaticId(player);
    if (!staticId) return null;
    const inv = await repository.getInventory(staticId);
    const item = getOwnedUsableItemById(inv, itemId);
    if (!item) return null;
    const condition = ensureItemDurability(item);
    return {
      uid: item.uid,
      durability: condition?.current ?? null,
      maxDurability: condition?.maximum ?? null,
    };
  } catch (e) {
    console.error("[INVENTORY] getOwnedItemCondition error:", e);
    return null;
  }
}

async function completeHuntingProcessing(
  player,
  requirements,
  knifeItemId,
  knifeDamage,
  bagOverrides = {},
  addBagToInventory = true
) {
  try {
    const staticId = getStaticId(player);
    const normalized = normalizeRequirements(requirements);
    const bagConfig = getItemConfig("hunting_carcass_bag");
    const damage = Math.max(1, Math.round(Number(knifeDamage || 1)));
    if (!staticId || !bagConfig) return { ok: false, reason: "invalid" };

    const inv = await repository.getInventory(staticId);
    const knife = getOwnedUsableItemById(inv, knifeItemId);
    const condition = ensureItemDurability(knife);
    if (!knife || !condition || condition.current < damage) {
      return { ok: false, reason: "knife" };
    }

    const enough = normalized.every((requirement) => (
      getItemAmountFromInventory(inv, requirement.itemId) >= requirement.amount
    ));
    if (!enough) return { ok: false, reason: "items" };

    normalized.forEach((requirement) => {
      let left = requirement.amount;
      for (const [uid, item] of Object.entries(inv.items || {})) {
        if (left <= 0) break;
        if (String(item.itemId || item.id) !== requirement.itemId) continue;
        const itemAmount = Number(item.amount || 1);
        if (item.stackable && itemAmount > left) {
          item.amount = itemAmount - left;
          left = 0;
        } else {
          left -= itemAmount;
          if (item.weaponHash) removeEquippedItemFromPlayer(player, item);
          removeItemUidEverywhere(inv, uid);
        }
      }
    });

    const freeSlot = addBagToInventory ? getFreeSlot(inv.slots) : -1;
    if (addBagToInventory && freeSlot === -1) return { ok: false, reason: "slots" };
    const bagWeight = Math.max(0, Number(bagOverrides.weight ?? bagConfig.weight ?? 0));
    if (addBagToInventory && getWeight(inv) + bagWeight > MAX_WEIGHT) {
      return { ok: false, reason: "weight" };
    }

    const durability = damageItemDurability(inv, knife, damage);
    if (!durability.ok) return { ok: false, reason: "knife" };
    if (durability.broken && knife.weaponHash) removeEquippedItemFromPlayer(player, knife);

    const uid = createUid(bagConfig.id);
    const bag = {
      ...bagConfig,
      ...bagOverrides,
      uid,
      itemId: bagConfig.id,
      amount: 1,
      stackable: false,
      weight: bagWeight,
    };
    if (addBagToInventory) {
      inv.items[uid] = bag;
      inv.slots[freeSlot] = uid;
    }

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    if (durability.broken) {
      notify(player, "Охотничий нож сломан и удалён из инвентаря.", "#ff6666");
    }

    return { ok: true, item: { ...bag }, durability };
  } catch (e) {
    console.error("[INVENTORY] completeHuntingProcessing error:", e);
    return { ok: false, reason: "error" };
  }
}

async function removeItem(player, uid, amount = 1) {
  try {
    const staticId = getStaticId(player);
    if (!staticId || !uid) return false;

    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const item = inv.items[uid];

    if (!item) return false;

    const equippedSlot = Object.keys(inv.equipment || {})
      .find((slot) => inv.equipment[slot] === uid) || null;

    if (equippedSlot && String(item.itemId || item.id) === "hunting_mask_suit") {
      notify(player, "Сначала снимите маскхалат через действие «Надеть / снять».", "#ff6666");
      return false;
    }

    const count = Math.max(1, Number(amount || 1));

    let removedWholeItem = false;
    if (item.stackable && Number(item.amount || 1) > count) {
      item.amount -= count;
    } else {
      removedWholeItem = true;
      removeItemUidEverywhere(inv, uid);

      const activeUid = String(player?.activeInventoryWeapon?.uid || "");
      if (item.weaponHash && (!activeUid || activeUid === String(uid))) {
        removeEquippedItemFromPlayer(player, item, equippedSlot);
      } else if (equippedSlot) {
        if (item.weaponHash) {
          clearEquipmentSlotVisual(player, equippedSlot);
        } else {
          removeEquippedItemFromPlayer(player, item, equippedSlot);
        }
      }
    }

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    if (removedWholeItem) reportInventoryItemRemoved(player, item, "remove");

    return true;
  } catch (e) {
    console.error("[INVENTORY] removeItem error:", e);
    return false;
  }
}

async function consumeItemByUid(player, uid, expectedItemId, amount = 1) {
  try {
    const staticId = getStaticId(player);
    const expected = String(expectedItemId || "").trim();
    const count = Math.max(1, Number(amount || 1));
    if (!staticId || !uid || !expected) return { ok: false, reason: "invalid" };

    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const item = inv.items?.[uid];
    if (!item || String(item.itemId || item.id) !== expected) {
      return { ok: false, reason: "wrong_item" };
    }

    const currentAmount = Math.max(1, Number(item.amount || 1));
    if (currentAmount < count) return { ok: false, reason: "amount" };
    const snapshot = { ...item };

    let removedWholeItem = false;
    if (item.stackable && currentAmount > count) {
      item.amount = currentAmount - count;
    } else {
      removedWholeItem = true;
      if (item.weaponHash) removeEquippedItemFromPlayer(player, item);
      removeItemUidEverywhere(inv, uid);
    }

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    if (removedWholeItem) reportInventoryItemRemoved(player, snapshot, "consume");
    return { ok: true, item: snapshot };
  } catch (e) {
    console.error("[INVENTORY] consumeItemByUid error:", e);
    return { ok: false, reason: "error" };
  }
}

async function hasItems(player, requirements) {
  try {
    const staticId = getStaticId(player);
    const normalized = normalizeRequirements(requirements);

    if (!staticId || normalized.length === 0) return false;

    const inv = await repository.getInventory(staticId);
    return normalized.every((requirement) => {
      return getItemAmountFromInventory(inv, requirement.itemId) >= requirement.amount;
    });
  } catch (e) {
    console.error("[INVENTORY] hasItems error:", e);
    return false;
  }
}

async function hasEquippedItem(player, itemId) {
  try {
    const staticId = getStaticId(player);
    if (!staticId) return false;

    const inv = await repository.getInventory(staticId);
    const item = getEquippedItemById(inv, itemId);
    if (!item) return false;

    const condition = ensureItemDurability(item);
    return !condition || condition.current > 0;
  } catch (e) {
    console.error("[INVENTORY] hasEquippedItem error:", e);
    return false;
  }
}

async function getEquippedItem(player, itemId) {
  try {
    const staticId = getStaticId(player);
    if (!staticId) return null;
    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const uid = Object.values(inv.equipment || {}).find((candidate) => {
      const item = candidate ? inv.items?.[candidate] : null;
      return String(item?.itemId || item?.id || "") === String(itemId || "");
    });
    return uid && inv.items?.[uid] ? { ...inv.items[uid] } : null;
  } catch (error) {
    console.error("[INVENTORY] getEquippedItem error:", error);
    return null;
  }
}

async function removeItems(player, requirements) {
  try {
    const staticId = getStaticId(player);
    const normalized = normalizeRequirements(requirements);

    if (!staticId || normalized.length === 0) return false;

    const inv = await repository.getInventory(staticId);
    const enough = normalized.every((requirement) => {
      return getItemAmountFromInventory(inv, requirement.itemId) >= requirement.amount;
    });

    if (!enough) return false;

    normalized.forEach((requirement) => {
      let left = requirement.amount;

      for (const [uid, item] of Object.entries(inv.items || {})) {
        if (left <= 0) break;
        if ((item.itemId || item.id) !== requirement.itemId) continue;

        const itemAmount = Number(item.amount || 1);

        if (item.stackable && itemAmount > left) {
          item.amount = itemAmount - left;
          left = 0;
        } else {
          left -= itemAmount;
          if (item.weaponHash) removeEquippedItemFromPlayer(player, item);
          removeItemUidEverywhere(inv, uid);
        }
      }
    });

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    return true;
  } catch (e) {
    console.error("[INVENTORY] removeItems error:", e);
    return false;
  }
}

async function consumeItemsAndDamageEquipped(player, requirements, equippedItemId, damageAmount) {
  try {
    const staticId = getStaticId(player);
    const normalized = normalizeRequirements(requirements);

    if (!staticId || normalized.length === 0) return { ok: false, reason: "invalid" };

    const inv = await repository.getInventory(staticId);
    const equippedItem = getOwnedUsableItemById(inv, equippedItemId);
    const condition = ensureItemDurability(equippedItem);

    if (!equippedItem || (condition && condition.current <= 0)) {
      return { ok: false, reason: "equipment" };
    }

    const enough = normalized.every((requirement) => {
      return getItemAmountFromInventory(inv, requirement.itemId) >= requirement.amount;
    });

    if (!enough) return { ok: false, reason: "items" };

    normalized.forEach((requirement) => {
      let left = requirement.amount;

      for (const [uid, item] of Object.entries(inv.items || {})) {
        if (left <= 0) break;
        if ((item.itemId || item.id) !== requirement.itemId) continue;

        const itemAmount = Number(item.amount || 1);
        if (item.stackable && itemAmount > left) {
          item.amount = itemAmount - left;
          left = 0;
        } else {
          left -= itemAmount;
          removeItemUidEverywhere(inv, uid);
        }
      }
    });

    const itemName = equippedItem.name || String(equippedItemId);
    const weaponHash = Number(equippedItem.weaponHash || 0);
    const durability = damageItemDurability(inv, equippedItem, damageAmount);

    if (!durability.ok) return { ok: false, reason: "durability" };

    if (durability.broken && weaponHash) {
      removeEquippedItemFromPlayer(player, equippedItem);
    }

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);

    if (durability.broken) {
      notify(player, `${itemName} сломан и удалён из инвентаря.`, "#ff6666");
    }

    return { ok: true, ...durability };
  } catch (e) {
    console.error("[INVENTORY] consumeItemsAndDamageEquipped error:", e);
    return { ok: false, reason: "error" };
  }
}

function nearestTransferTarget(player, maximumDistance = 3) {
  let nearest = null;
  let nearestDistance = Number(maximumDistance || 3);
  try {
    mp.players.forEach((candidate) => {
      if (!candidate || candidate === player || !mp.players.exists(candidate)) return;
      if (Number(candidate.dimension || 0) !== Number(player.dimension || 0)) return;
      const currentDistance = distanceBetween(player.position, candidate.position);
      if (currentDistance <= nearestDistance && Number(getStaticId(candidate) || 0) > 0) {
        nearest = candidate;
        nearestDistance = currentDistance;
      }
    });
  } catch {}
  return nearest;
}

async function giveItem(player, uid, amount = 1) {
  const target = nearestTransferTarget(player, 3);
  if (!target) {
    notify(player, "Рядом нет игрока для передачи предмета.", "#ff6666");
    return false;
  }
  return runPlayersExclusive([player, target], "giveItem", async () => {
    let transferUid = String(uid || "");
    const sourceStaticId = Number(getStaticId(player) || 0);
    const targetStaticId = Number(getStaticId(target) || 0);
    if (!sourceStaticId || !targetStaticId || sourceStaticId === targetStaticId
      || Number(player.dimension || 0) !== Number(target.dimension || 0)
      || distanceBetween(player.position, target.position) > 3) {
      notify(player, "Игрок отошёл слишком далеко.", "#ff6666");
      return false;
    }

    let previewInventory = await repository.getInventory(sourceStaticId);
    let previewItem = previewInventory.items?.[transferUid];
    if (!previewItem) return false;
    if (isBoundItem(previewItem) && ((previewItem.miningRentalType && global.twinkleMining?.releaseRentalItem)
      || (previewItem.forestryRentalType && global.twinkleForestry?.releaseRentalItem))) {
      try {
        const bridge = previewItem.forestryRentalType ? global.twinkleForestry : global.twinkleMining;
        const released = await bridge.releaseRentalItem(player, { ...previewItem });
        transferUid = String(released?.voucher?.uid || "");
        if (!transferUid) return false;
        previewInventory = await repository.getInventory(sourceStaticId);
        previewItem = previewInventory.items?.[transferUid];
      } catch (error) {
        notify(player, error.message || "Не удалось подготовить аренду к передаче.", "#ff6666");
        return false;
      }
    }
    if (!previewItem || isBoundItem(previewItem)) {
      notify(player, "Персональный документ нельзя передать.", "#ff6666");
      return false;
    }

    let committedSource = null;
    let committedTarget = null;
    let transferredItem = null;
    let removedWholeItem = false;
    let equippedSlot = null;
    try {
      await database.withConn(async (connection) => {
        await connection.beginTransaction();
        try {
          const orderedIds = [sourceStaticId, targetStaticId].sort((left, right) => left - right);
          for (const staticId of orderedIds) {
            await connection.query(
              `INSERT INTO character_inventories (static_id, inventory) VALUES (?, ?)
               ON DUPLICATE KEY UPDATE static_id = VALUES(static_id)`,
              [staticId, JSON.stringify(repository.createDefaultInventory())]
            );
          }
          const [lockedRows] = await connection.query(
            "SELECT static_id, inventory FROM character_inventories WHERE static_id IN (?, ?) ORDER BY static_id FOR UPDATE",
            orderedIds
          );
          const byStaticId = new Map((lockedRows || []).map((row) => [Number(row.static_id), repository.normalizeInventory(parseJson(row.inventory, repository.createDefaultInventory()))]));
          const sourceInventory = byStaticId.get(sourceStaticId);
          const targetInventory = byStaticId.get(targetStaticId);
          const item = sourceInventory?.items?.[transferUid];
          if (!item || isBoundItem(item)) throw new Error("Предмет уже недоступен для передачи.");
          if (Number(player.dimension || 0) !== Number(target.dimension || 0) || distanceBetween(player.position, target.position) > 3) {
            throw new Error("Игрок отошёл слишком далеко.");
          }
          const availableAmount = Math.max(1, Math.floor(Number(item.amount || 1)));
          const count = item.stackable ? boundedInteger(amount, 1, availableAmount, 1) : 1;
          const addedWeight = Math.max(0, Number(item.weight || 0)) * count;
          if (getWeight(targetInventory) + addedWeight > MAX_WEIGHT) throw new Error("У игрока недостаточно свободного веса.");

          let targetItem = item.stackable
            ? Object.values(targetInventory.items || {}).find((candidate) => String(candidate.itemId || candidate.id) === String(item.itemId || item.id))
            : null;
          if (targetItem) {
            targetItem.amount = Math.max(1, Number(targetItem.amount || 1)) + count;
            transferredItem = { ...targetItem, amount: count };
          } else {
            const freeSlot = getFreeSlot(targetInventory.slots);
            if (freeSlot === -1) throw new Error("У игрока нет свободного слота.");
            let nextUid = !item.stackable || count === availableAmount ? transferUid : createUid(item.itemId || item.id || "item");
            if (targetInventory.items?.[nextUid]) {
              if (item.internalOnly === true) throw new Error("Конфликт защищённого ваучера. Передача отменена.");
              nextUid = createUid(item.itemId || item.id || "item");
            }
            targetItem = { ...item, uid: nextUid, amount: count };
            targetInventory.items[nextUid] = targetItem;
            targetInventory.slots[freeSlot] = nextUid;
            transferredItem = { ...targetItem };
          }

          equippedSlot = Object.keys(sourceInventory.equipment || {}).find((slot) => sourceInventory.equipment[slot] === transferUid) || null;
          if (item.stackable && availableAmount > count) item.amount = availableAmount - count;
          else { removedWholeItem = true; removeItemUidEverywhere(sourceInventory, transferUid); }
          await connection.query("UPDATE character_inventories SET inventory = ? WHERE static_id = ?", [JSON.stringify(sourceInventory), sourceStaticId]);
          await connection.query("UPDATE character_inventories SET inventory = ? WHERE static_id = ?", [JSON.stringify(targetInventory), targetStaticId]);
          await connection.commit();
          committedSource = sourceInventory;
          committedTarget = targetInventory;
        } catch (error) {
          try { await connection.rollback(); } catch {}
          throw error;
        }
      });
    } catch (error) {
      notify(player, error.message || "Не удалось передать предмет.", "#ff6666");
      return false;
    }

    if (removedWholeItem && equippedSlot) removeEquippedItemFromPlayer(player, previewItem, equippedSlot);
    await syncInventory(player, committedSource, false);
    await syncInventory(target, committedTarget, false);
    notify(player, `${transferredItem.name} передан игроку ${getPlayerName(target)}.`, "#66ccff");
    notify(target, `${getPlayerName(player)} передал вам: ${transferredItem.name}.`, "#66ccff");
    return true;
  });
}

async function dropItem(player, uid, amount = 1) {
  try {
    const staticId = getStaticId(player);
    if (!staticId || !uid) return false;

    const inv = await repository.getInventory(staticId);
    const item = inv.items[uid];
    if (!item) return false;

    if (isBoundItem(item) && ((item.miningRentalType && global.twinkleMining?.releaseRentalItem)
      || (item.forestryRentalType && global.twinkleForestry?.releaseRentalItem))) {
      try {
        const bridge = item.forestryRentalType ? global.twinkleForestry : global.twinkleMining;
        const released = await bridge.releaseRentalItem(player, { ...item });
        if (!released?.voucher?.uid) return false;
        return dropItem(player, released.voucher.uid, 1);
      } catch (error) {
        notify(player, error.message || "Не удалось прекратить аренду.", "#ff6666");
        return false;
      }
    }

    if (isBoundItem(item)) {
      notify(player, "Персональный документ нельзя выбросить.", "#ff6666");
      return false;
    }

    const itemAmount = Math.max(1, Math.floor(Number(item.amount || 1)));
    const count = boundedInteger(amount, 1, itemAmount, 1);
    const droppedAmount = Math.min(count, itemAmount);

    if (!reserveWorldDropCapacity()) {
      notify(player, "В окружении слишком много предметов. Попробуйте позже.", "#ff6666");
      return false;
    }

    try {
      const droppedItem = { ...item };
      const removedWholeItem = !item.stackable || Number(item.amount || 1) <= droppedAmount;

      if (item.stackable && Number(item.amount || 1) > droppedAmount) {
        item.amount = Number(item.amount || 1) - droppedAmount;
      } else {
        removeItemUidEverywhere(inv, uid);
      }

      await repository.saveInventory(staticId, inv);
      createWorldDrop(player, droppedItem, droppedAmount);
      if (removedWholeItem) reportInventoryItemRemoved(player, droppedItem, "world_drop");
      await syncInventory(player, inv, false);

      return true;
    } finally {
      releaseWorldDropCapacity();
    }
  } catch (e) {
    console.error("[INVENTORY] dropItem error:", e);
    return false;
  }
}

async function moveItem(player, from, to) {
  try {
    const staticId = getStaticId(player);
    if (!staticId || !from || !to) return false;

    const inv = await repository.getInventory(staticId);

    if (from.source === "environment") {
      const uid = String(from.uid || "");
      if (!uid || worldDropClaims.has(uid)) {
        notify(player, "Этот предмет уже подбирают.", "#ff6666");
        return false;
      }

      worldDropClaims.add(uid);
      try {
        const drop = findNearbyWorldDrop(player, uid);
        if (!drop || to.source !== "inventory") return false;

        const targetUid = getSlotValue(inv, to.source, to.index);
        if (targetUid) {
          notify(player, "Слот занят.", "#ff6666");
          return false;
        }
        const pickupWeight = Math.max(0, Number(drop.item?.weight || 0)) * Math.max(1, Number(drop.item?.amount || 1));
        if (getWeight(inv) + pickupWeight > MAX_WEIGHT) {
          notify(player, "Недостаточно свободного веса в инвентаре.", "#ff6666");
          return false;
        }
        if (inv.items[drop.uid]) return false;

        inv.items[drop.uid] = drop.item;
        setSlotValue(inv, "inventory", to.index, drop.uid);

        await repository.saveInventory(staticId, inv);
        removeWorldDrop(drop.uid, drop);
        await syncInventory(player, inv, false);
        return true;
      } finally {
        worldDropClaims.delete(uid);
      }
    }

    if (from.source === "equipment") from = { ...from, index: normalizeEquipmentSlot(from.index) };
    if (to.source === "equipment") to = { ...to, index: normalizeEquipmentSlot(to.index) };

    const uid = getSlotValue(inv, from.source, from.index);
    if (!uid || !inv.items[uid]) return false;

    const item = inv.items[uid];

    if (to.source === "environment") {
      if (isBoundItem(item) && ((item.miningRentalType && global.twinkleMining?.releaseRentalItem)
        || (item.forestryRentalType && global.twinkleForestry?.releaseRentalItem))) {
        try {
          const bridge = item.forestryRentalType ? global.twinkleForestry : global.twinkleMining;
          const released = await bridge.releaseRentalItem(player, { ...item });
          if (!released?.voucher?.uid) return false;
          return dropItem(player, released.voucher.uid, 1);
        } catch (error) {
          notify(player, error.message || "Не удалось прекратить аренду.", "#ff6666");
          return false;
        }
      }
      if (isBoundItem(item)) {
        notify(player, "Персональный документ нельзя выбросить.", "#ff6666");
        return false;
      }

      if (!reserveWorldDropCapacity()) {
        notify(player, "В окружении слишком много предметов. Попробуйте позже.", "#ff6666");
        return false;
      }

      try {
        const droppedItem = { ...item };
        removeItemUidEverywhere(inv, uid);

        await repository.saveInventory(staticId, inv);
        if (from.source === "equipment") {
          removeEquippedItemFromPlayer(player, item, from.index);
        }
        createWorldDrop(player, droppedItem, Number(droppedItem.amount || 1));
        reportInventoryItemRemoved(player, droppedItem, "world_drop");
        await syncInventory(player, inv, false);
        return true;
      } finally {
        releaseWorldDropCapacity();
      }
    }

    if (
      String(item.itemId || item.id) === "hunting_mask_suit" &&
      (to.source === "equipment" || from.source === "equipment")
    ) {
      notify(player, "Маскхалат надевается и снимается только действием «Надеть / снять».", "#ff6666");
      return false;
    }

    if (
      to.source === "quick" &&
      !item.quick &&
      item.equipSlot !== "weaponPrimary" &&
      item.equipSlot !== "weaponSecondary"
    ) {
      notify(player, "Этот предмет нельзя положить в быстрый слот.", "#ff6666");
      return false;
    }

    if (to.source === "equipment") {
      if (!WEARABLE_EQUIPMENT_SLOTS.has(String(to.index))) {
        notify(player, "Этот слот нельзя использовать для экипировки.", "#ff6666");
        return false;
      }

      if (!item.equipSlot || item.equipSlot !== to.index) {
        notify(player, "Этот предмет нельзя экипировать в выбранный слот.", "#ff6666");
        return false;
      }

      const currentUid = inv.equipment[to.index] || null;
      const currentItem = currentUid ? inv.items[currentUid] : null;

      if (currentItem) {
        removeEquippedItemFromPlayer(player, currentItem, to.index);
      }

      setSlotValue(inv, from.source, from.index, currentUid || null);
      inv.equipment[to.index] = uid;

      await applyEquipmentItem(player, item, true);

      await repository.saveInventory(staticId, inv);
      await syncInventory(player, inv, false);
      return true;
    }

    if (from.source === "equipment" && to.source === "inventory") {
      const sourceSlot = from.index;
      if (!WEARABLE_EQUIPMENT_SLOTS.has(String(sourceSlot))) return false;

      const targetUid = getSlotValue(inv, to.source, to.index);

      if (targetUid) {
        const targetItem = inv.items[targetUid];

        if (!targetItem || targetItem.equipSlot !== sourceSlot) {
          notify(player, "В занятый слот можно положить только совместимый предмет.", "#ff6666");
          return false;
        }

        removeEquippedItemFromPlayer(player, item, sourceSlot);

        inv.equipment[sourceSlot] = targetUid;
        setSlotValue(inv, to.source, to.index, uid);
        await applyEquipmentItem(player, targetItem, true);
      } else {
        removeEquippedItemFromPlayer(player, item, sourceSlot);
        inv.equipment[sourceSlot] = null;
        setSlotValue(inv, to.source, to.index, uid);
        clearEquipmentSlotVisual(player, sourceSlot);
      }

      await repository.saveInventory(staticId, inv);
      await syncInventory(player, inv, false);
      return true;
    }

    const targetUid = getSlotValue(inv, to.source, to.index);

    setSlotValue(inv, from.source, from.index, targetUid || null);
    setSlotValue(inv, to.source, to.index, uid);

    const activeUid = String(player?.activeInventoryWeapon?.uid || "");
    const isWeaponAccessible = (source) => source === "equipment" || source === "quick";
    if (activeUid === String(uid) && !isWeaponAccessible(to.source)) {
      removeEquippedItemFromPlayer(player, item);
    } else if (
      targetUid &&
      activeUid === String(targetUid) &&
      !isWeaponAccessible(from.source)
    ) {
      removeEquippedItemFromPlayer(player, inv.items[targetUid]);
    }

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    return true;
  } catch (e) {
    console.error("[INVENTORY] moveItem error:", e);
    return false;
  }
}

async function executeItemUse(player, item, staticId, uid) {
  if (!item?.usable || !item.useEvent) return false;

  mp.events.call(item.useEvent, player, { ...item }, INTERNAL_ITEM_USE_TOKEN);
  await getQuestService().recordProgress(player, {
    type: "inventory.item_used",
    subjectId: String(item.itemId || item.id || ""),
    idempotencyKey: `inventory_used:${staticId}:${String(item.uid || uid)}`,
    amount: Math.max(1, Number(item.amount || 1)),
    metadata: {
      itemId: item.itemId || item.id || null,
      uid: item.uid || uid,
    },
  }, { sync: true });

  return true;
}

async function useItem(player, uid) {
  try {
    const staticId = getStaticId(player);
    if (!staticId || !uid) return false;

    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const item = inv.items[uid];

    return await executeItemUse(player, item, staticId, uid);
  } catch (e) {
    console.error("[INVENTORY] useItem error:", e);
    return false;
  }
}

async function equipItem(player, uid, source = null, index = null) {
  try {
    const staticId = getStaticId(player);
    if (!staticId || !uid) return false;

    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const item = inv.items[uid];

    if (!item || !item.equipSlot) return false;
    if (String(item.itemId || item.id) === "hunting_mask_suit") {
      notify(player, "Используйте действие «Надеть / снять» для маскхалата.", "#ff6666");
      return false;
    }

    const actualSource = findUidLocation(inv, uid);
    if (!actualSource) return false;

    const requestedSource = source === null || source === undefined ? null : String(source);
    const requestedIndex = requestedSource === "equipment"
      ? normalizeEquipmentSlot(index)
      : Number(index);
    const requestHasLocation = requestedSource !== null || (index !== null && index !== undefined);
    if (
      requestHasLocation &&
      (
        requestedSource !== actualSource.source ||
        requestedIndex !== actualSource.index
      )
    ) return false;

    const slot = item.equipSlot;
    if (!WEARABLE_EQUIPMENT_SLOTS.has(String(slot))) {
      notify(player, "Оружие теперь используется через быстрые слоты 1-5.", "#ff6666");
      return false;
    }
    const currentUid = inv.equipment[slot] || null;

    if (actualSource.source === "equipment") {
      if (actualSource.index !== slot) return false;
      return await applyEquipmentItem(player, item, true);
    }

    if (currentUid) {
      const returnsToExplicitInventorySlot = actualSource.source === "inventory";
      const movingItemAlreadyFreesInventorySlot = inv.slots.includes(uid);
      if (
        !returnsToExplicitInventorySlot &&
        !movingItemAlreadyFreesInventorySlot &&
        getFreeSlot(inv.slots) === -1
      ) {
        notify(player, "Нет места, чтобы снять текущий предмет.", "#ff6666");
        return false;
      }
    }

    if (currentUid && inv.items[currentUid]?.weaponHash) {
      removeEquippedItemFromPlayer(player, inv.items[currentUid], slot);
    }

    removeUidFromSlots(inv, uid);

    if (currentUid) {
      const returned = actualSource.source === "inventory"
        ? setSlotValue(inv, "inventory", actualSource.index, currentUid)
        : putUidToFreeInventorySlot(inv, currentUid);

      if (!returned) {
        notify(player, "Нет места, чтобы снять текущий предмет.", "#ff6666");
        await syncInventory(player, inv, false);
        return false;
      }
    }

    inv.equipment[slot] = uid;

    const applied = await applyEquipmentItem(player, item, true);
    if (!applied && item.weaponHash) {
      notify(player, "Не удалось достать оружие.", "#ff6666");
      return false;
    }

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);

    return true;
  } catch (e) {
    console.error("[INVENTORY] equipItem error:", e);
    return false;
  }
}

async function equipItemByItemId(player, itemId) {
  try {
    const staticId = getStaticId(player);
    const config = getItemConfig(itemId);
    if (!staticId || !config?.equipSlot) return false;

    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const equippedUid = inv.equipment[config.equipSlot] || null;
    const matches = Object.values(inv.items || {})
      .filter((item) => (item.itemId || item.id) === config.id)
      .reverse();
    const item = matches.find((entry) => entry.uid === equippedUid) || matches[0];
    if (!item?.uid) return false;

    if (item.uid === equippedUid) {
      return await applyEquipmentItem(player, item, true);
    }

    return await equipItem(player, item.uid);
  } catch (e) {
    console.error("[INVENTORY] equipItemByItemId error:", e);
    return false;
  }
}

async function restoreEquipment(player) {
  try {
    if (player?.jailData) {
      return false;
    }

    const staticId = getStaticId(player);
    if (!staticId) return false;

    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);

    for (const slot of WEARABLE_EQUIPMENT_SLOTS) {
      clearEquipmentSlotVisual(player, slot);
    }

    for (const [slot, uid] of Object.entries(inv.equipment || {})) {
      const item = uid ? inv.items[uid] : null;
      if (!item || (WEARABLE_EQUIPMENT_SLOTS.has(slot) && item.equipSlot !== slot)) {
        if (uid) inv.equipment[slot] = null;
        continue;
      }

      await applyEquipmentItem(player, item, false);
    }

    await repository.saveInventory(staticId, inv);

    return true;
  } catch (e) {
    console.error("[INVENTORY] restoreEquipment error:", e);
    return false;
  }
}

async function useQuickSlot(player, index) {
  try {
    const staticId = getStaticId(player);
    const quickIndex = Number(index);

    if (
      !staticId ||
      !Number.isInteger(quickIndex) ||
      quickIndex < 0 ||
      quickIndex > 4
    ) {
      return false;
    }

    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);
    const uid = inv.quick[quickIndex];
    const item = uid ? inv.items[uid] : null;

    if (!item) return false;

    if (!item.weaponHash && item.usable && item.useEvent) {
      return await executeItemUse(player, item, staticId, uid);
    }

    if (!item?.weaponHash) {
      return false;
    }

    const condition = ensureItemDurability(item);
    if (condition && condition.current <= 0) return false;

    if (String(player?.activeInventoryWeapon?.uid || "") === String(uid)) {
      holsterActiveWeapon(player, inv);
      notify(player, `Вы убрали ${item.name}.`, "#66ccff");
      return true;
    }

    if (player?.activeInventoryWeapon?.uid) {
      holsterActiveWeapon(player, null);
    }

    const equipped = await applyEquipmentItem(player, item, true);
    if (equipped && (item.melee || !item.ammoItem)) {
      syncQuickWeaponVisuals(player, inv);
    }
    return equipped;
  } catch (e) {
    console.error("[INVENTORY] useQuickSlot error:", e);
    return false;
  }
}

async function unequipItem(player, slot) {
  try {
    const staticId = getStaticId(player);
    if (!staticId || !slot) return false;
    slot = normalizeEquipmentSlot(slot);

    const inv = await repository.getInventory(staticId);
    const uid = inv.equipment[slot];

    if (!uid) return false;

    const item = inv.items[uid];

    if (String(item?.itemId || item?.id) === "hunting_mask_suit") {
      notify(player, "Используйте действие «Надеть / снять» для маскхалата.", "#ff6666");
      return false;
    }

    const freeSlot = getFreeSlot(inv.slots);
    if (freeSlot === -1) {
      notify(player, "Нет свободного места в инвентаре.", "#ff6666");
      return false;
    }

    inv.equipment[slot] = null;
    inv.slots[freeSlot] = uid;

    if (item?.weaponHash) {
      removeEquippedItemFromPlayer(player, item, slot);
    }

    if (!item?.weaponHash) clearEquipmentSlotVisual(player, slot);

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);

    return true;
  } catch (e) {
    console.error("[INVENTORY] unequipItem error:", e);
    return false;
  }
}

async function splitItem(player, uid, amount) {
  try {
    const staticId = getStaticId(player);
    const splitAmount = Number(amount);

    if (!staticId || !uid || !Number.isInteger(splitAmount) || splitAmount <= 0) {
      return false;
    }

    const inv = await repository.getInventory(staticId);
    const item = inv.items[uid];

    if (!item || !item.stackable || item.amount <= splitAmount) {
      return false;
    }

    const freeSlot = getFreeSlot(inv.slots);
    if (freeSlot === -1) return false;

    item.amount -= splitAmount;

    const newUid = createUid(item.itemId || item.id);

    inv.items[newUid] = {
      ...item,
      uid: newUid,
      amount: splitAmount,
    };

    inv.slots[freeSlot] = newUid;

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);

    return true;
  } catch (e) {
    console.error("[INVENTORY] splitItem error:", e);
    return false;
  }
}

async function useWeapon(player, item, selectInHand = false) {
  try {
    if (player?.jailData) {
      try { player.removeAllWeapons(); } catch {}
      notify(player, "Оружие недоступно в деморгане.", "#ff6666");
      return false;
    }

    const staticId = getStaticId(player);

    if (!staticId || !item?.weaponHash || !item?.ammoItem) {
      return false;
    }

    const condition = ensureItemDurability(item);
    if (condition && condition.current <= 0) {
      notify(player, `${item.name} сломано.`, "#ff6666");
      return false;
    }

    const inv = await repository.getInventory(staticId);
    const active = player.activeInventoryWeapon;

    if (active?.uid && String(active.uid) === String(item.uid)) {
      await holsterActiveWeapon(player, inv);
      notify(player, "\u0412\u044b \u0443\u0431\u0440\u0430\u043b\u0438 " + item.name + ".", "#66ccff");
      return true;
    }

    if (active?.uid) {
      await holsterActiveWeapon(player, null);
    }

    const ammoAmount = getAmmoAmount(inv, item.ammoItem);

    if (ammoAmount <= 0) {
      notify(player, "Нет патронов для этого оружия.", "#ff6666");
    }

    const hash = Number(item.weaponHash);

    player.giveWeapon(hash, ammoAmount);

    try {
      player.setWeaponAmmo(hash, ammoAmount);
    } catch {}

    setActiveWeaponState(player, item, hash, Boolean(selectInHand));

    syncQuickWeaponVisuals(player, inv);
    syncHudWeapon(player, item, ammoAmount);

    safeCall(player, "inventory:client:weaponEquipped", [
      hash,
      ammoAmount,
      Boolean(selectInHand),
    ]);

    notify(player, `${item.name} экипировано. Патронов: ${ammoAmount}.`, "#66ccff");

    return true;
  } catch (e) {
    console.error("[INVENTORY] useWeapon error:", e);
    return false;
  }
}

async function handleWeaponShot(player, weaponHash, amount = 1) {
  try {
    if (player?.jailData) {
      try { player.removeAllWeapons(); } catch {}
      return {
        ok: false,
        reason: "jail_restricted",
        ammo: 0,
        weaponHash: Number(weaponHash || 0) >>> 0,
      };
    }

    const staticId = getStaticId(player);
    let requestedWeaponHash = Number(weaponHash || 0) >>> 0;
    const shotAmount = Math.max(1, Math.min(Number(amount || 1), 30));
    const shotAt = Date.now();

    if (!staticId) {
      return { ok: false, reason: "invalid_weapon", ammo: 0 };
    }

    // Один физический выстрел некоторых клиентов может породить два события в
    // одном кадре. Не даём им списать два патрона и нанести двойной урон.
    if (shotAt - Number(player.__inventoryLastAcceptedShotAt || 0) < 180) {
      return { ok: false, reason: "shot_duplicate", ammo: 0 };
    }

    const serverWeaponHash = Number(player?.weapon || 0) >>> 0;
    let activeWeaponHash = Number(player?.activeInventoryWeapon?.weaponHash || 0) >>> 0;
    const unarmedHash = typeof mp !== "undefined" && mp?.joaat
      ? Number(mp.joaat("weapon_unarmed")) >>> 0
      : 0;

    // В RAGE playerWeaponShot иногда приходит в тот же тик, когда player.weapon
    // ещё содержит WEAPON_UNARMED. В этом узком случае используем только
    // серверно сохранённый UID активного оружия, а не произвольный hash клиента.
    const inv = await repository.getInventory(staticId);
    ensureInventoryDurability(inv);

    if (!requestedWeaponHash || requestedWeaponHash === unarmedHash) {
      requestedWeaponHash = activeWeaponHash || (
        serverWeaponHash && serverWeaponHash !== unarmedHash ? serverWeaponHash : 0
      );
    }

    if (!requestedWeaponHash) {
      return { ok: false, reason: "invalid_weapon", ammo: 0 };
    }

    const equippedItem = getActiveWeaponItem(inv, player, requestedWeaponHash);

    if (!equippedItem) return { ok: false, reason: "weapon_not_owned", ammo: 0 };

    const canonicalWeaponHash = Number(equippedItem.weaponHash || 0) >>> 0;
    if (!canonicalWeaponHash || !weaponHashesMatch(canonicalWeaponHash, requestedWeaponHash)) {
      return { ok: false, reason: "weapon_not_owned", ammo: 0 };
    }

    const activeUid = String(player?.activeInventoryWeapon?.uid || "");
    const recentlySelectedFromInventory =
      weaponHashesMatch(activeWeaponHash, canonicalWeaponHash) &&
      activeUid === String(equippedItem.uid || "") &&
      shotAt - Number(player?.activeInventoryWeapon?.selectedAt || 0) <= 3000;
    if (
      serverWeaponHash &&
      serverWeaponHash !== unarmedHash &&
      !weaponHashesMatch(serverWeaponHash, canonicalWeaponHash) &&
      !recentlySelectedFromInventory
    ) {
      return { ok: false, reason: "weapon_not_active", ammo: 0 };
    }

    requestedWeaponHash = canonicalWeaponHash;

    // player.weapon и activeInventoryWeapon не переживают часть RAGE reload/login
    // сценариев. Владение подтверждено БД и предмет находится только в equipment/
    // quick, поэтому восстанавливаем серверное активное состояние до списания.
    setActiveWeaponState(player, equippedItem, requestedWeaponHash, false);
    activeWeaponHash = requestedWeaponHash;

    const condition = ensureItemDurability(equippedItem);
    if (condition && condition.current <= 0) {
      return { ok: false, reason: "weapon_broken", ammo: 0 };
    }

    const active = {
      uid: equippedItem.uid,
      itemId: equippedItem.itemId || equippedItem.id,
      weaponHash: requestedWeaponHash,
      ammoItem: equippedItem.ammoItem,
    };
    const currentAmmo = getAmmoAmount(inv, active.ammoItem);

    if (currentAmmo <= 0) {
      await syncInventory(player, inv, false);
      return { ok: false, reason: "no_ammo", ammo: 0 };
    }

    const removeAmount = Math.min(currentAmmo, shotAmount);
    const removed = removeAmmoFromInventory(inv, active.ammoItem, removeAmount);

    if (!removed) return { ok: false, reason: "ammo_changed", ammo: currentAmmo };

    const newAmmo = Math.max(0, currentAmmo - removeAmount);
    const itemConfig = getItemConfig(equippedItem.itemId || equippedItem.id);
    const wearResult = damageItemDurability(
      inv,
      equippedItem,
      Number(equippedItem.durabilityLossPerShot || itemConfig?.durabilityLossPerShot || 1)
    );
    const weaponBroken = Boolean(wearResult.ok && wearResult.broken);

    if (weaponBroken) {
      removeEquippedItemFromPlayer(player, equippedItem);
      notify(player, `${equippedItem.name} сломалось и удалено из инвентаря.`, "#ff6666");
    } else if (newAmmo <= 0) {
      notify(player, "Патроны закончились.", "#ff6666");
    }

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);
    player.__inventoryLastAcceptedShotAt = shotAt;

    return {
      ok: true,
      weaponHash: requestedWeaponHash,
      itemId: equippedItem.itemId || equippedItem.id,
      uid: equippedItem.uid,
      ammo: newAmmo,
      consumed: removeAmount,
      weaponBroken,
      durability: wearResult.durability,
      maxDurability: wearResult.maxDurability,
    };
  } catch (e) {
    console.error("[INVENTORY] handleWeaponShot error:", e);
    return { ok: false, reason: "error", ammo: 0 };
  }
}

async function damageEquippedItem(player, itemId, amount) {
  try {
    const staticId = getStaticId(player);
    const normalizedItemId = String(itemId || "").trim();
    const damage = Math.max(1, Math.round(Number(amount || 1)));

    if (!staticId || !normalizedItemId) return { ok: false };

    const inv = await repository.getInventory(staticId);
    const item = getOwnedUsableItemById(inv, normalizedItemId);

    if (!item) return { ok: false };

    const weaponHash = Number(item.weaponHash || 0);
    const itemName = item.name || normalizedItemId;
    const result = damageItemDurability(inv, item, damage);

    if (!result.ok) return result;

    if (result.broken) {
      if (weaponHash) {
        removeEquippedItemFromPlayer(player, item);
      }

      notify(player, `${itemName} сломан и удалён из инвентаря.`, "#ff6666");
    }

    await repository.saveInventory(staticId, inv);
    await syncInventory(player, inv, false);

    return result;
  } catch (e) {
    console.error("[INVENTORY] damageEquippedItem error:", e);
    return { ok: false };
  }
}

module.exports = {
  openInventory,
  addItem: lockedInventoryOperation("addItem", addItem),
  addItems: lockedInventoryOperation("addItems", addItems),
  foldHuntingTentWithContents: lockedInventoryOperation("foldHuntingTentWithContents", foldHuntingTentWithContents),
  updateHuntingTentPosition: lockedInventoryOperation("updateHuntingTentPosition", updateHuntingTentPosition),
  transferHuntingTentBag: lockedInventoryOperation("transferHuntingTentBag", transferHuntingTentBag),
  transferHuntingVehicleBag: lockedInventoryOperation("transferHuntingVehicleBag", transferHuntingVehicleBag),
  purchaseItems: lockedInventoryOperation("purchaseItems", purchaseItems),
  sellItemInstances: lockedInventoryOperation("sellItemInstances", sellItemInstances),
  sellHuntingBag: lockedInventoryOperation("sellHuntingBag", sellHuntingBag),
  addItemInstance: lockedInventoryOperation("addItemInstance", addItemInstance),
  reconcileBoundItemInstances,
  stageBoundItemInstance,
  stageInternalItemInstance,
  stageConsumeItemByUid,
  syncInventorySnapshot,
  syncCurrentInventory,
  getItemsById,
  getOwnedItemByUid,
  updateItemMetadataByUid: lockedInventoryOperation("updateItemMetadataByUid", updateItemMetadataByUid),
  damageItemByUid: lockedInventoryOperation("damageItemByUid", damageItemByUid),
  takeFirstMatchingItem: lockedInventoryOperation("takeFirstMatchingItem", takeFirstMatchingItem),
  spoilExpiredHuntingBags: lockedInventoryOperation("spoilExpiredHuntingBags", spoilExpiredHuntingBags),
  getOwnedItemCondition,
  completeHuntingProcessing: lockedInventoryOperation("completeHuntingProcessing", completeHuntingProcessing),
  removeItem: lockedInventoryOperation("removeItem", removeItem),
  consumeItemByUid: lockedInventoryOperation("consumeItemByUid", consumeItemByUid),
  hasItems,
  hasEquippedItem,
  getEquippedItem,
  removeItems: lockedInventoryOperation("removeItems", removeItems),
  consumeItemsAndDamageEquipped: lockedInventoryOperation("consumeItemsAndDamageEquipped", consumeItemsAndDamageEquipped),
  moveItem: lockedInventoryOperation("moveItem", moveItem),
  useItem: lockedInventoryOperation("useItem", useItem),
  equipItem: lockedInventoryOperation("equipItem", equipItem),
  equipItemByItemId: lockedInventoryOperation("equipItemByItemId", equipItemByItemId),
  ensureCharacterWearables: lockedInventoryOperation("ensureCharacterWearables", ensureCharacterWearables),
  restoreEquipment: lockedInventoryOperation("restoreEquipment", restoreEquipment),
  useQuickSlot: lockedInventoryOperation("useQuickSlot", useQuickSlot),
  unequipItem: lockedInventoryOperation("unequipItem", unequipItem),
  splitItem: lockedInventoryOperation("splitItem", splitItem),
  giveItem,
  dropItem: lockedInventoryOperation("dropItem", dropItem),
  useWeapon: lockedInventoryOperation("useWeapon", useWeapon),
  handleWeaponShot: lockedInventoryOperation("handleWeaponShot", handleWeaponShot),
  damageEquippedItem: lockedInventoryOperation("damageEquippedItem", damageEquippedItem),
  toggleMaskSuit: lockedInventoryOperation("toggleMaskSuit", toggleMaskSuit),
  runExclusive: runInventoryExclusive,
  runExclusiveOrThrow: runInventoryExclusiveOrThrow,
  isInternalItemUseToken,
};

const worldDropSweepTimer = setInterval(pruneWorldDrops, WORLD_DROP_SWEEP_INTERVAL_MS);
worldDropSweepTimer.unref?.();
