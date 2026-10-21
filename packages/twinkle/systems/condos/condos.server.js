"use strict";

const db = require("../../database");
const authFlow = require("../../auth/authFlow.js");
const furnitureService = require("../objectEditor/furniture.service");
const {
  INTERACTION_DISTANCE,
  SELL_REFUND_PERCENT,
  getCondoDimension,
  getCondoInterior,
} = require("./condos.config");

const condos = new Map();
const buildings = new Map();
const activeOperations = new Set();
const sellConfirmations = new Map();
let schemaAvailable = false;

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function playerExists(player) {
  try {
    return Boolean(player && (!mp.players?.exists || mp.players.exists(player)));
  } catch {
    return Boolean(player);
  }
}

function getCharacter(player) {
  return player?.character || player?.characterData || null;
}

function getCharacterUuid(player) {
  const character = getCharacter(player);
  return normalizeId(
    character?.uuid || player?.characterUuid || player?.characterId || player?.uuid
  );
}

function getCharacterName(player) {
  const character = getCharacter(player) || {};
  const firstName = character.username || character.firstname || character.firstName || "";
  const lastName = character.lastname || character.lastName || "";
  return [firstName, lastName].filter(Boolean).join(" ").trim() || player?.name || "Unknown";
}

function ensureCharacter(player) {
  const uuid = getCharacterUuid(player);

  if (
    !playerExists(player) ||
    !player.auth ||
    !authFlow.isPhase(player, authFlow.PHASE.IN_GAME)
  ) {
    throw new Error("Персонаж не авторизован.");
  }

  if (!uuid) {
    throw new Error("Сначала выберите персонажа.");
  }

  return uuid;
}

function distance(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const dx = toNumber(left.x) - toNumber(right.x);
  const dy = toNumber(left.y) - toNumber(right.y);
  const dz = toNumber(left.z) - toNumber(right.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function condoPosition(condo) {
  return { x: condo.x, y: condo.y, z: condo.z };
}

function isNearCondo(player, condo, maxDistance = INTERACTION_DISTANCE + 1) {
  return Number(player?.dimension || 0) === 0
    && distance(player?.position, condoPosition(condo)) <= maxDistance;
}

function formatMoney(value) {
  return `$${Math.max(0, Math.floor(toNumber(value))).toLocaleString("en-US")}`;
}

function condoAddress(condo) {
  const building = buildings.get(normalizeId(condo.condo_big_id));
  const parts = [condo.address, condo.street].filter(Boolean);

  if (building?.number) parts.push(`дом ${building.number}`);
  parts.push(`кв. ${condo.number}`);
  return parts.join(", ");
}

function notify(player, message, variant = "info") {
  if (!playerExists(player)) return;

  try {
    player.call("c:condos:notify", [String(message), String(variant)]);
  } catch {}
}

function syncCash(player, cash) {
  const nextCash = Math.max(0, toNumber(cash));
  if (player.character) player.character.cash = nextCash;
  if (player.characterData) player.characterData.cash = nextCash;

  try { player.setVariable("cash", nextCash); } catch {}
  try {
    player.call("c:hud:update", [JSON.stringify({ player: { cash: nextCash } })]);
  } catch {}
}

function syncOwnedCondo(player, condoId) {
  const id = normalizeId(condoId);
  if (player.character) player.character.apartment = id || null;
  if (player.characterData) player.characterData.apartment = id || null;

  try { player.setVariable("condo_id", id); } catch {}
}

function clearSellConfirmations(uuid) {
  const prefix = `${normalizeId(uuid)}:`;
  for (const key of sellConfirmations.keys()) {
    if (key.startsWith(prefix)) sellConfirmations.delete(key);
  }
}

function normalizeCondoRow(row) {
  return {
    id: normalizeId(row.id),
    number: row.number,
    condo_big_id: normalizeId(row.condo_big_id),
    address: String(row.address || ""),
    street: String(row.street || ""),
    price: Math.max(0, toNumber(row.price)),
    user_id: normalizeId(row.user_id),
    user_name: String(row.user_name || ""),
    pin: toNumber(row.pin),
    is_safe: toNumber(row.is_safe),
    is_sec: Boolean(toNumber(row.is_sec)),
    is_lock: Boolean(toNumber(row.is_lock)),
    interior: Math.trunc(toNumber(row.interior)),
    x: toNumber(row.x),
    y: toNumber(row.y),
    z: toNumber(row.z),
    rot: toNumber(row.rot),
    tax_score: toNumber(row.tax_score),
    tax_money: toNumber(row.tax_money),
    marker: null,
    colshape: null,
  };
}

function normalizeBuildingRow(row) {
  return {
    id: normalizeId(row.id),
    number: row.number,
    address: String(row.address || ""),
    street: String(row.street || ""),
    x: toNumber(row.x),
    y: toNumber(row.y),
    z: toNumber(row.z),
    blip: null,
  };
}

function updateBuildingBlip(buildingId) {
  const building = buildings.get(normalizeId(buildingId));
  if (!building?.blip) return;

  // Condo buildings always use the same white style so the pause-menu map
  // groups all of them into one scrollable "Квартиры" legend entry.
  try { building.blip.color = 0; } catch {}
}

function nearbyPayload(condo) {
  return {
    id: condo.id,
    number: condo.number,
    address: condoAddress(condo),
    price: condo.price,
    owned: condo.user_id > 0,
    locked: condo.is_lock,
  };
}

function setNearbyCondo(player, condo) {
  player.__nearbyCondoId = condo?.id || 0;

  try {
    player.call("c:condos:nearby", [condo ? JSON.stringify(nearbyPayload(condo)) : "null"]);
  } catch {}
}

function createWorldObjects() {
  for (const building of buildings.values()) {
    try {
      building.blip = mp.blips.new(475, new mp.Vector3(building.x, building.y, building.z), {
        color: 0,
        scale: 0.55,
        name: "Квартиры",
        shortRange: true,
      });
    } catch (err) {
      console.log(`[CONDOS] Не удалось создать blip здания #${building.id}:`, err.message);
    }
  }

  for (const condo of condos.values()) {
    try {
      condo.marker = mp.markers.new(1, new mp.Vector3(condo.x, condo.y, condo.z), 0.55, {
        color: [189, 255, 105, 110],
        visible: true,
        dimension: 0,
      });

      condo.colshape = mp.colshapes.newSphere(condo.x, condo.y, condo.z + 0.4, 1.25);
      condo.colshape.condoId = condo.id;
    } catch (err) {
      console.log(`[CONDOS] Не удалось создать вход квартиры #${condo.id}:`, err.message);
    }
  }

  for (const buildingId of buildings.keys()) updateBuildingBlip(buildingId);
}

async function loadAllCondos() {
  schemaAvailable = false;

  try {
    const [schemaRows] = await db.pool.query(
      `
      SELECT TABLE_NAME, COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('condos', 'condos_big', 'property_furniture')
      `
    );
    const availableColumns = new Map();
    for (const row of schemaRows || []) {
      const table = String(row.TABLE_NAME);
      if (!availableColumns.has(table)) availableColumns.set(table, new Set());
      availableColumns.get(table).add(String(row.COLUMN_NAME));
    }
    const requiredSchema = new Map([
      ["condos", ["id", "number", "condo_big_id", "address", "street", "x", "y", "z", "price", "user_id", "user_name", "interior", "is_lock", "tax_money"]],
      ["condos_big", ["id", "number", "address", "street", "x", "y", "z"]],
      ["property_furniture", ["id", "property_type", "property_id", "active", "owner_uuid"]],
    ]);
    const missing = [];
    for (const [table, columns] of requiredSchema) {
      const actual = availableColumns.get(table);
      if (!actual) {
        missing.push(`${table}.*`);
        continue;
      }
      for (const column of columns) {
        if (!actual.has(column)) missing.push(`${table}.${column}`);
      }
    }
    if (missing.length) {
      console.warn(
        `[CONDOS] Disabled: incomplete schema (${missing.join(", ")}). ` +
        "Apply reviewed, versioned migrations only after a verified backup."
      );
      return;
    }

    await furnitureService.ensureFurnitureSchema();

    console.log("[CONDOS] Loading apartments...");

    const [buildingRows, condoRows] = await Promise.all([
      db.query("SELECT id, number, address, street, x, y, z FROM condos_big ORDER BY id"),
      db.query("SELECT * FROM condos ORDER BY id"),
    ]);

    for (const row of buildingRows || []) {
      const building = normalizeBuildingRow(row);
      if (building.id) buildings.set(building.id, building);
    }

    for (const row of condoRows || []) {
      const condo = normalizeCondoRow(row);
      if (condo.id) condos.set(condo.id, condo);
    }

    createWorldObjects();
    schemaAvailable = true;
    console.log(`[CONDOS] Loaded apartments: ${condos.size}, buildings: ${buildings.size}`);
  } catch (err) {
    schemaAvailable = false;
    console.error("[CONDOS] Ошибка загрузки:", err);
  }
}

async function refreshTabletApartments(player, activeApartmentId = undefined) {
  if (!schemaAvailable || !playerExists(player) || !getCharacterUuid(player)) return;

  try {
    const apartments = await furnitureService.getTabletProperties(player, "apartment");
    const payload = { apartments };

    if (activeApartmentId !== undefined) {
      payload.activeApartmentId = activeApartmentId;
    }

    player.call("client:property:tablet:update", [JSON.stringify(payload)]);
  } catch (err) {
    console.log("[CONDOS] Не удалось обновить планшет:", err.message);
  }
}

function ensureExteriorInteraction(player, condo) {
  if (!condo) throw new Error("Квартира не найдена.");
  if (player.vehicle) throw new Error("Выйдите из транспорта.");
  if (!isNearCondo(player, condo)) throw new Error("Подойдите ближе ко входу квартиры.");
}

function enterCondo(player, condoId) {
  const uuid = ensureCharacter(player);
  const condo = condos.get(normalizeId(condoId));
  ensureExteriorInteraction(player, condo);

  if (!condo.user_id) {
    throw new Error(`Квартира свободна. Цена: ${formatMoney(condo.price)}. Для покупки используйте /buycondo.`);
  }

  if (condo.is_lock && condo.user_id !== uuid) {
    throw new Error("Дверь квартиры закрыта.");
  }

  const interior = getCondoInterior(condo.interior);
  if (!interior) throw new Error(`Интерьер #${condo.interior} не настроен.`);

  player.__condoSession = {
    condoId: condo.id,
    ownerUuid: condo.user_id,
  };

  player.dimension = getCondoDimension(condo.id);
  player.position = new mp.Vector3(interior.x, interior.y, interior.z + 1);
  player.heading = interior.heading;

  try { player.call("client:interface:close", ["tablet"]); } catch {}
  try {
    player.call("c:condos:entered", [JSON.stringify({
      condoId: condo.id,
      exit: { x: interior.x, y: interior.y, z: interior.z },
    })]);
  } catch {}

  notify(player, `Вы вошли в квартиру #${condo.number}.`, "success");
}

function exitCondo(player, force = false) {
  const session = player?.__condoSession;
  const condo = condos.get(normalizeId(session?.condoId));

  if (!session || !condo) throw new Error("Вы не находитесь в квартире.");

  const interior = getCondoInterior(condo.interior);
  const expectedDimension = getCondoDimension(condo.id);

  if (!force) {
    if (Number(player.dimension || 0) !== expectedDimension) {
      throw new Error("Некорректное измерение квартиры.");
    }

    if (!interior || distance(player.position, interior) > INTERACTION_DISTANCE + 1.5) {
      throw new Error("Подойдите к выходу из квартиры.");
    }
  }

  player.dimension = 0;
  player.position = new mp.Vector3(condo.x, condo.y, condo.z + 1);
  player.heading = condo.rot;
  player.__condoSession = null;

  try { player.call("c:condos:left", []); } catch {}
  notify(player, "Вы вышли из квартиры.", "success");
}

async function buyCondo(player, condoId) {
  const uuid = ensureCharacter(player);
  const id = normalizeId(condoId || player.__nearbyCondoId);
  const condo = condos.get(id);
  ensureExteriorInteraction(player, condo);

  const operationKey = `buy:${uuid}`;
  if (activeOperations.has(operationKey)) throw new Error("Операция уже выполняется.");
  activeOperations.add(operationKey);

  try {
    const result = await db.withConn(async (connection) => {
      await connection.beginTransaction();

      try {
        const [characters] = await connection.query(
          "SELECT uuid, cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
          [uuid]
        );
        const character = characters?.[0];

        if (!character) throw new Error("Персонаж не найден.");

        const [ownedRows] = await connection.query(
          "SELECT id FROM condos WHERE user_id = ? LIMIT 1",
          [uuid]
        );

        if (ownedRows?.[0]) throw new Error("У вас уже есть квартира.");

        const [condoRows] = await connection.query(
          "SELECT id, number, condo_big_id, address, street, price, user_id FROM condos WHERE id = ? LIMIT 1 FOR UPDATE",
          [id]
        );
        const lockedCondo = condoRows?.[0];

        if (!lockedCondo) throw new Error("Квартира не найдена.");
        if (normalizeId(lockedCondo.user_id)) throw new Error("Квартира уже куплена.");

        const price = Math.max(0, toNumber(lockedCondo.price));
        const cash = Math.max(0, toNumber(character.cash));
        if (cash < price) throw new Error(`Недостаточно наличных. Нужно ${formatMoney(price)}.`);

        const [cashUpdate] = await connection.query(
          "UPDATE characters SET cash = cash - ? WHERE uuid = ? AND cash >= ?",
          [price, uuid, price]
        );

        if (Number(cashUpdate?.affectedRows || 0) !== 1) {
          throw new Error("Не удалось списать деньги за квартиру.");
        }

        const [condoUpdate] = await connection.query(
          `
          UPDATE condos
          SET user_id = ?, user_name = ?, pin = 0, is_safe = 0,
              is_sec = 0, is_lock = 1, tax_money = 0
          WHERE id = ? AND (user_id = 0 OR user_id IS NULL)
          `,
          [uuid, getCharacterName(player), id]
        );

        if (Number(condoUpdate?.affectedRows || 0) !== 1) {
          throw new Error("Квартиру уже купил другой игрок.");
        }

        await connection.commit();
        return { cash: cash - price, price };
      } catch (err) {
        try { await connection.rollback(); } catch {}
        throw err;
      }
    });

    condo.user_id = uuid;
    condo.user_name = getCharacterName(player);
    condo.pin = 0;
    condo.is_safe = 0;
    condo.is_sec = false;
    condo.is_lock = true;
    condo.tax_money = 0;
    syncCash(player, result.cash);
    syncOwnedCondo(player, condo.id);
    player.__condoBuyOffer = null;
    updateBuildingBlip(condo.condo_big_id);
    await refreshTabletApartments(player, condo.id);
    notify(player, `Вы купили квартиру #${condo.number} за ${formatMoney(result.price)}.`, "success");
    return true;
  } finally {
    activeOperations.delete(operationKey);
  }
}

async function sellCondo(player, condoId) {
  const uuid = ensureCharacter(player);
  const id = normalizeId(condoId);
  const condo = condos.get(id);

  if (!condo || condo.user_id !== uuid) throw new Error("Эта квартира вам не принадлежит.");

  const confirmationKey = `${uuid}:${id}`;
  const confirmationExpiresAt = sellConfirmations.get(confirmationKey) || 0;
  const refund = Math.floor(condo.price * SELL_REFUND_PERCENT / 100);

  if (confirmationExpiresAt < Date.now()) {
    const expiresAt = Date.now() + 10_000;
    sellConfirmations.set(confirmationKey, expiresAt);
    setTimeout(() => {
      if (sellConfirmations.get(confirmationKey) === expiresAt) {
        sellConfirmations.delete(confirmationKey);
      }
    }, 10_100);
    notify(
      player,
      `Повторите продажу в течение 10 секунд. Вы получите ${formatMoney(refund)} (${SELL_REFUND_PERCENT}% стоимости).`,
      "warning"
    );
    return false;
  }

  sellConfirmations.delete(confirmationKey);
  const operationKey = `sell:${uuid}`;
  if (activeOperations.has(operationKey)) throw new Error("Операция уже выполняется.");
  activeOperations.add(operationKey);

  try {
    const result = await db.withConn(async (connection) => {
      await connection.beginTransaction();

      try {
        const [characters] = await connection.query(
          "SELECT uuid, cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
          [uuid]
        );
        const character = characters?.[0];
        if (!character) throw new Error("Персонаж не найден.");

        const [condoRows] = await connection.query(
          "SELECT id, price, user_id FROM condos WHERE id = ? LIMIT 1 FOR UPDATE",
          [id]
        );
        const lockedCondo = condoRows?.[0];

        if (!lockedCondo || normalizeId(lockedCondo.user_id) !== uuid) {
          throw new Error("Эта квартира вам не принадлежит.");
        }

        const currentRefund = Math.floor(
          Math.max(0, toNumber(lockedCondo.price)) * SELL_REFUND_PERCENT / 100
        );

        const [furnitureRows] = await connection.query(
          `
          SELECT id
          FROM property_furniture
          WHERE property_type = 'apartment' AND property_id = ? AND active = 1
          FOR UPDATE
          `,
          [id]
        );

        const [cashUpdate] = await connection.query(
          "UPDATE characters SET cash = cash + ? WHERE uuid = ?",
          [currentRefund, uuid]
        );

        if (Number(cashUpdate?.affectedRows || 0) !== 1) {
          throw new Error("Не удалось начислить деньги за продажу квартиры.");
        }

        const [condoUpdate] = await connection.query(
          `
          UPDATE condos
          SET user_id = 0, user_name = '', pin = 0, is_safe = 0,
              is_sec = 0, is_lock = 0, tax_money = 0
          WHERE id = ? AND user_id = ?
          `,
          [id, uuid]
        );

        if (Number(condoUpdate?.affectedRows || 0) !== 1) {
          throw new Error("Не удалось продать квартиру.");
        }

        await connection.query(
          `
          UPDATE property_furniture
          SET active = 0
          WHERE property_type = 'apartment' AND property_id = ? AND active = 1
          `,
          [id]
        );

        await connection.commit();
        return {
          cash: Math.max(0, toNumber(character.cash)) + currentRefund,
          refund: currentRefund,
          furnitureIds: (furnitureRows || []).map((row) => Number(row.id)),
        };
      } catch (err) {
        try { await connection.rollback(); } catch {}
        throw err;
      }
    });

    try {
      mp.players.forEach((occupant) => {
        if (normalizeId(occupant?.__condoSession?.condoId) !== id) return;
        try { exitCondo(occupant, true); } catch {}
      });
    } catch {
      if (player.__condoSession?.condoId === id) exitCondo(player, true);
    }
    furnitureService.destroyFurnitureObjects(result.furnitureIds);

    condo.user_id = 0;
    condo.user_name = "";
    condo.pin = 0;
    condo.is_safe = 0;
    condo.is_sec = false;
    condo.is_lock = false;
    condo.tax_money = 0;
    syncCash(player, result.cash);
    syncOwnedCondo(player, 0);
    clearSellConfirmations(uuid);
    updateBuildingBlip(condo.condo_big_id);
    await refreshTabletApartments(player, null);
    notify(player, `Квартира продана. Получено ${formatMoney(result.refund)}.`, "success");
    return true;
  } finally {
    activeOperations.delete(operationKey);
  }
}

async function setCondoLock(player, condoId, targetLocked) {
  const uuid = ensureCharacter(player);
  const id = normalizeId(condoId);
  const condo = condos.get(id);

  if (!condo || condo.user_id !== uuid) throw new Error("Эта квартира вам не принадлежит.");

  const locked = targetLocked === true || targetLocked === 1 || targetLocked === "1" || targetLocked === "true";
  const result = await db.query(
    "UPDATE condos SET is_lock = ? WHERE id = ? AND user_id = ?",
    [locked ? 1 : 0, id, uuid]
  );

  if (Number(result?.affectedRows || 0) !== 1) {
    throw new Error("Не удалось изменить состояние двери.");
  }

  condo.is_lock = locked;
  await refreshTabletApartments(player, id);
  notify(player, locked ? "Дверь квартиры закрыта." : "Дверь квартиры открыта.", "success");
}

function setCondoRoute(player, condoId) {
  const uuid = ensureCharacter(player);
  const condo = condos.get(normalizeId(condoId));

  if (!condo || condo.user_id !== uuid) throw new Error("Эта квартира вам не принадлежит.");
  player.call("c:condos:route", [condo.x, condo.y]);
  notify(player, "Маршрут до квартиры построен.", "success");
}

async function interactWithCondo(player, condoId) {
  ensureCharacter(player);

  if (player.__condoSession) {
    exitCondo(player);
    return;
  }

  const condo = condos.get(normalizeId(condoId || player.__nearbyCondoId));
  ensureExteriorInteraction(player, condo);

  if (!condo.user_id) {
    const offer = player.__condoBuyOffer;

    if (offer?.condoId === condo.id && Number(offer.expiresAt || 0) >= Date.now()) {
      player.__condoBuyOffer = null;
      return buyCondo(player, condo.id);
    }

    player.__condoBuyOffer = {
      condoId: condo.id,
      expiresAt: Date.now() + 10_000,
    };
    try { player.call("c:condos:offer", [JSON.stringify(nearbyPayload(condo))]); } catch {}
    return;
  }

  enterCondo(player, condo.id);
}

function findOwnedCondo(uuid) {
  return [...condos.values()].find((condo) => condo.user_id === normalizeId(uuid)) || null;
}

function handleAsync(player, action) {
  Promise.resolve()
    .then(action)
    .catch((err) => {
      console.log("[CONDOS] Event error:", err.message);
      notify(player, err.message || "Операция с квартирой не выполнена.", "error");
      refreshTabletApartments(player).catch(() => {});
    });
}

mp.events.add("playerEnterColshape", (player, shape) => {
  // `shape.type` is a read-only RAGE MP field (it always equals "colshape").
  // Use our own condoId metadata instead.
  if (!shape || !normalizeId(shape.condoId)) return;
  const condo = condos.get(normalizeId(shape.condoId));
  if (condo) setNearbyCondo(player, condo);
});

mp.events.add("playerExitColshape", (player, shape) => {
  if (!shape || !normalizeId(shape.condoId)) return;
  if (normalizeId(player.__nearbyCondoId) === normalizeId(shape.condoId)) {
    setNearbyCondo(player, null);
    player.__condoBuyOffer = null;
  }
});

mp.events.add("playerQuit", (player) => {
  const uuid = getCharacterUuid(player);
  player.__nearbyCondoId = 0;
  player.__condoBuyOffer = null;
  player.__condoSession = null;
  if (uuid) activeOperations.delete(`buy:${uuid}`);
  if (uuid) activeOperations.delete(`sell:${uuid}`);
  if (uuid) clearSellConfirmations(uuid);
});

mp.events.add("playerDeath", (player) => {
  if (!player?.__condoSession) return;

  // Do not leave a dead/revived player stranded in a private dimension with
  // the session already cleared. The hospital flow will later move them again.
  try {
    exitCondo(player, true);
  } catch {
    player.__condoSession = null;
    player.dimension = 0;
    try { player.call("c:condos:left", []); } catch {}
  }
});

mp.events.add("s:condos:interact", (player, condoId) => {
  handleAsync(player, () => interactWithCondo(player, condoId));
});

mp.events.add("s:condos:enter", (player, condoId) => {
  handleAsync(player, () => enterCondo(player, condoId));
});

mp.events.add("s:condos:exit", (player) => {
  handleAsync(player, () => exitCondo(player));
});

mp.events.add("s:condos:buy", (player, condoId) => {
  handleAsync(player, () => buyCondo(player, condoId));
});

mp.events.add("s:condos:sell", (player, condoId) => {
  handleAsync(player, () => sellCondo(player, condoId));
});

mp.events.add("s:condos:setLock", (player, condoId, locked) => {
  handleAsync(player, () => setCondoLock(player, condoId, locked));
});

mp.events.add("s:condos:route", (player, condoId) => {
  handleAsync(player, () => setCondoRoute(player, condoId));
});

// Compatibility aliases for the names used by the provided legacy client.
mp.events.add("server:condos:enter", (player, condoId) => {
  handleAsync(player, () => enterCondo(player, condoId));
});
mp.events.add("server:condos:buy", (player, condoId) => {
  handleAsync(player, () => buyCondo(player, condoId));
});
mp.events.add("server:condos:lockStatus", (player, condoId, locked) => {
  handleAsync(player, () => setCondoLock(player, condoId, locked));
});

mp.registerCommand("buycondo", (player, fullText, args = []) => {
  const id = normalizeId(args[0] || fullText || player.__nearbyCondoId);
  handleAsync(player, () => buyCondo(player, id));
});

mp.registerCommand("sellcondo", (player) => {
  handleAsync(player, () => {
    const condo = findOwnedCondo(ensureCharacter(player));
    if (!condo) throw new Error("У вас нет квартиры.");
    return sellCondo(player, condo.id);
  });
});

mp.registerCommand("condolock", (player) => {
  handleAsync(player, () => {
    const condo = findOwnedCondo(ensureCharacter(player));
    if (!condo) throw new Error("У вас нет квартиры.");
    return setCondoLock(player, condo.id, !condo.is_lock);
  });
});

mp.registerCommand("exitcondo", (player) => {
  handleAsync(player, () => exitCondo(player));
});

loadAllCondos();

global.__TWINKLE_CONDOS__ = {
  buildings,
  condos,
  findOwnedCondo,
  getCondoDimension,
  refreshTabletApartments,
};

module.exports = global.__TWINKLE_CONDOS__;
