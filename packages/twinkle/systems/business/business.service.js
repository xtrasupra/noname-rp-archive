"use strict";

const db = require("../../database/query.js");
const inventory = require("../inventory/inventory.service.js");
const { getCanonicalAppearance } = require("./business.appearance.js");
const vehicleControl = require("../vehicle/vehicle.control.js");
const quests = require("../quests/quest.service.js");
const repository = require("./business.repository.js");
const {
  calculateFullRefuel,
  isDriverSeat,
  normalizeFuelCapacity,
} = require("./business.fuel.js");
const {
  normalizeRequestedPurchaseQuantity,
  resolvePurchasedQuantity,
} = require("./business.purchase.js");
const {
  APPEARANCE_BUSINESS_TYPES,
  BUSINESS_BY_ID,
  BUSINESS_CONTRACT_VERSION,
  CUSTOMER_RANGE,
  MAX_EMPLOYEES,
  MAX_PURCHASE_QUANTITY,
  MAX_SUPPLY_QUANTITY,
  PERMISSIONS,
  SUPPLY_DELIVERY_MS,
  BUSINESS_TAX_RATE,
} = require("./business.config.js");

const BUSINESS_TYPE_LABELS = Object.freeze({
  grocery: "Продуктовый магазин",
  gunstore: "Оружейный магазин",
  barber: "Парикмахерская",
  tattoo: "Тату-салон",
  clothing: "Магазин одежды",
  lsc: "Автомастерская",
  gas: "Автозаправка",
  hunting: "Охотничий магазин",
  fishing: "Рыболовный магазин",
});

function getBusinessTypeLabel(type) {
  return BUSINESS_TYPE_LABELS[String(type || "")] || "Бизнес";
}

function getCharacterUuid(player) {
  return Number(
    player?.uuid || player?.staticId || player?.characterId || player?.character?.uuid ||
    player?.characterData?.uuid || player?.getVariable?.("uuid") || 0
  );
}

function getCharacterName(player) {
  return String(
    player?.character?.name || player?.characterName || player?.name || `Персонаж ${getCharacterUuid(player)}`
  ).slice(0, 128);
}

function distance(first, second) {
  if (!first || !second) return Number.POSITIVE_INFINITY;
  const x = Number(first.x || 0) - Number(second.x || 0);
  const y = Number(first.y || 0) - Number(second.y || 0);
  const z = Number(first.z || 0) - Number(second.z || 0);
  return Math.sqrt(x * x + y * y + z * z);
}

function isNearBusiness(player, businessId, range = CUSTOMER_RANGE) {
  const config = BUSINESS_BY_ID.get(String(businessId || ""));
  return Boolean(
    config && player && Number(player.dimension || 0) === Number(config.dimension || 0) &&
    distance(player.position, config.position) <= Number(range)
  );
}

function businessError(reason, message) {
  const error = new Error(message || reason);
  error.businessReason = reason;
  return error;
}

let supplyFulfillmentPromise = null;

function normalizePaymentType(value) {
  const type = String(value || "cash").toLowerCase();
  if (type !== "cash" && type !== "card") throw businessError("payment", "Invalid payment method.");
  return type;
}

function getCatalogPrice(business, product) {
  const value = Number(business?.catalog?.[product.id] ?? product.price ?? 0);
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function getCustomerPreview(product) {
  const preview = product?.preview;
  if (!preview || typeof preview !== "object") return null;
  const type = String(preview.type || "");
  const focus = ["full", "torso", "legs", "feet", "head"].includes(String(preview.focus || ""))
    ? String(preview.focus)
    : undefined;
  if (type === "component") {
    return {
      type,
      ...(focus ? { focus } : {}),
      component: Math.max(0, Math.min(11, Math.floor(Number(preview.component || 0)))),
      drawable: Math.max(0, Math.floor(Number(preview.drawable || 0))),
      texture: Math.max(0, Math.floor(Number(preview.texture || 0))),
      palette: Math.max(0, Math.min(3, Math.floor(Number(preview.palette || 0)))),
    };
  }
  if (type === "prop") {
    return {
      type,
      ...(focus ? { focus } : {}),
      prop: Math.max(0, Math.min(7, Math.floor(Number(preview.prop || 0)))),
      drawable: Math.max(-1, Math.floor(Number(preview.drawable ?? -1))),
      texture: Math.max(0, Math.floor(Number(preview.texture || 0))),
    };
  }
  if (type === "hair") {
    return {
      type,
      ...(focus ? { focus } : {}),
      hairId: Math.max(0, Math.floor(Number(preview.hairId || 0))),
      color1: Math.max(0, Math.min(63, Math.floor(Number(preview.color1 || 0)))),
      color2: Math.max(0, Math.min(63, Math.floor(Number(preview.color2 || 0)))),
    };
  }
  if (type === "tattoo") {
    const collection = String(preview.collection || "").slice(0, 64);
    const overlay = String(preview.overlay || "").slice(0, 64);
    return collection && overlay
      ? { type, ...(focus ? { focus } : {}), collection, overlay }
      : null;
  }
  return null;
}

function normalizeLines(lines) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 40) {
    throw businessError("invalid", "Invalid sale lines.");
  }
  return lines.map((line) => {
    const stockKey = String(line?.stockKey || "").trim();
    const quantity = Math.floor(Number(line?.quantity || 0));
    if (!stockKey || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SUPPLY_QUANTITY) {
      throw businessError("invalid", "Invalid stock quantity.");
    }
    return {
      id: String(line?.id || stockKey).slice(0, 64),
      name: String(line?.name || line?.id || stockKey).slice(0, 96),
      quantity,
      stockKey,
      unitPrice: Math.max(0, Math.round(Number(line?.unitPrice || 0))),
    };
  });
}

async function stageSale(connection, options) {
  const businessId = String(options?.businessId || "");
  const lines = normalizeLines(options?.lines);
  const totalPrice = Math.max(0, Math.round(Number(options?.totalPrice || 0)));
  const paymentType = normalizePaymentType(options?.paymentType || "cash");
  const business = await repository.getBusiness(businessId, connection, true);
  if (!business) throw businessError("not_found", "Business not found.");
  if (options?.player && options?.customerAccessValidated !== true && !isNearBusiness(options.player, businessId)) {
    throw businessError("range", "Move closer to the business.");
  }
  if (!business.isOpen) throw businessError("closed", "The business is closed.");
  if (business.ownerUuid && business.taxPaidUntil && new Date(business.taxPaidUntil).getTime() < Date.now()) {
    throw businessError("tax", "Business tax is overdue.");
  }

  if (options?.validateCatalog) {
    const config = BUSINESS_BY_ID.get(businessId);
    const expectedTotal = lines.reduce((sum, line) => {
      const product = config?.products?.find((entry) => entry.id === line.id);
      if (!product) throw businessError("invalid", "Product no longer exists.");
      return sum + getCatalogPrice(business, product) * line.quantity;
    }, 0);
    if (expectedTotal !== totalPrice) throw businessError("price_changed", "The product price has changed.");
  }
  if (options?.pricingKey) {
    const multiplier = Math.max(50, Math.min(200, Number(business.catalog?.[options.pricingKey] || 100)));
    const pricingLines = Array.isArray(options?.pricingLines) ? options.pricingLines : [];
    const expectedTotal = pricingLines.length
      ? pricingLines.reduce((sum, line) => (
          sum + Math.max(0, Math.round(Number(line?.unitPrice || 0) * multiplier / 100)) * Math.max(1, Number(line?.quantity || 1))
        ), 0)
      : Math.max(0, Math.round(Number(options?.basePrice || 0) * multiplier / 100));
    if (expectedTotal !== totalPrice) throw businessError("price_changed", "The service price has changed.");
  }

  const stock = { ...(business.stock || {}) };
  for (const line of lines) {
    const available = Math.max(0, Math.floor(Number(stock[line.stockKey] || 0)));
    if (available < line.quantity) {
      throw businessError("stock", `${line.name} is out of stock.`);
    }
    stock[line.stockKey] = available - line.quantity;
  }

  const nextCashBalance = business.cashBalance + (paymentType === "cash" ? totalPrice : 0);
  const nextBankBalance = business.bankBalance + (paymentType === "card" ? totalPrice : 0);
  await connection.query(
    `UPDATE twinkle_businesses
        SET stock_json = ?, cash_balance = ?, bank_balance = ?, revision = revision + 1
      WHERE id = ?`,
    [JSON.stringify(stock), nextCashBalance, nextBankBalance, businessId]
  );
  const [saleResult] = await connection.query(
    `INSERT INTO twinkle_business_sales
      (business_id, buyer_uuid, actor_uuid, sale_kind, items_json, total_price)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      businessId,
      options?.buyerUuid || null,
      options?.actorUuid || null,
      String(options?.kind || "retail").slice(0, 32),
      JSON.stringify(lines),
      totalPrice,
    ]
  );
  await connection.query(
    `INSERT INTO twinkle_business_ledger
      (business_id, actor_uuid, action, amount, balance_after, details_json)
     VALUES (?, ?, 'sale', ?, ?, ?)`,
    [businessId, options?.actorUuid || options?.buyerUuid || null, totalPrice, paymentType === "cash" ? nextCashBalance : nextBankBalance, JSON.stringify({ lines, paymentType, cashBalance: nextCashBalance, bankBalance: nextBankBalance })]
  );
  return { bankBalance: nextBankBalance, cashBalance: nextCashBalance, business, saleId: Number(saleResult?.insertId || 0), stock };
}

function createPurchaseOptions(
  businessId,
  player,
  lines,
  totalPrice,
  kind = "retail",
  paymentType = "cash",
  pricing = null,
  access = null
) {
  const characterUuid = getCharacterUuid(player);
  return {
    transactionWork: (connection) => stageSale(connection, {
      actorUuid: characterUuid,
      businessId,
      buyerUuid: characterUuid,
      kind,
      lines,
      paymentType,
      player,
      customerAccessValidated: access?.customerAccessValidated === true,
      pricingKey: pricing?.key,
      basePrice: pricing?.basePrice,
      pricingLines: pricing?.lines,
      totalPrice,
      validateCatalog: kind === "retail",
    }),
    paymentType,
  };
}

async function getCustomerPayload(player, businessId) {
  const config = BUSINESS_BY_ID.get(String(businessId || ""));
  const business = config ? await repository.getBusiness(config.id) : null;
  if (!config || !business) throw businessError("not_found", "Business not found.");
  return {
    contractVersion: BUSINESS_CONTRACT_VERSION,
    business: {
      id: config.id,
      isOpen: business.isOpen && (!business.ownerUuid || !business.taxPaidUntil || new Date(business.taxPaidUntil).getTime() >= Date.now()),
      name: business.name,
      ownerUuid: business.ownerUuid,
      ownerName: business.ownerName || "Государство",
      purchasePrice: business.purchasePrice,
      type: business.type,
      description: String(config.description || ""),
      district: String(config.district || "Лос-Сантос"),
      controlLabel: business.ownerUuid ? "Частный владелец" : "Государство",
      interfaceMode: config.type === "gas"
        ? "fuel"
        : APPEARANCE_BUSINESS_TYPES.includes(config.type) ? "appearance" : "catalog",
      blip: {
        color: Number(config.blip?.color || 0),
        label: String(config.blip?.name || config.name),
        sprite: Number(config.blip?.sprite || 52),
      },
    },
    balances: {
      cash: Math.max(0, Number(player?.character?.cash || 0)),
      card: Math.max(0, Number(player?.character?.bank || 0)),
    },
    appearance: getCanonicalAppearance(player),
    fuelStation: config.type === "gas" ? getFuelStationState(player) : null,
    products: config.products.map((item) => ({
      description: String(item.description || ""),
      id: item.id,
      kind: item.kind,
      name: item.name,
      category: String(item.category || "Каталог"),
      price: getCatalogPrice(business, item),
      preview: getCustomerPreview(item),
      stock: Math.max(0, Math.floor(Number(business.stock?.[item.stockKey] || 0))),
    })),
  };
}

function findProduct(businessId, productId) {
  const config = BUSINESS_BY_ID.get(String(businessId || ""));
  const product = config?.products?.find((entry) => entry.id === String(productId || ""));
  if (!config || !product) throw businessError("invalid", "Product not found.");
  return { config, product };
}

async function purchaseInventoryProduct(player, businessId, productId, rawQuantity, paymentTypeRaw, access = null) {
  const { product } = findProduct(businessId, productId);
  const business = await repository.getBusiness(businessId);
  const paymentType = normalizePaymentType(paymentTypeRaw);
  const quantity = Math.floor(Number(rawQuantity || 1));
  if (product.kind !== "item" || quantity < 1 || quantity > MAX_PURCHASE_QUANTITY) {
    throw businessError("invalid", "Invalid purchase quantity.");
  }
  const unitPrice = getCatalogPrice(business, product);
  const totalPrice = unitPrice * quantity;
  const result = await inventory.purchaseItems(
    player,
    [{ itemId: product.id, amount: Math.max(1, Number(product.amount || 1)) * quantity }],
    totalPrice,
    createPurchaseOptions(
      businessId,
      player,
      [{ id: product.id, name: product.name, quantity, stockKey: product.stockKey, unitPrice }],
      totalPrice,
      "retail",
      paymentType,
      null,
      access
    )
  );
  if (!result?.ok) throw businessError(result?.reason || "database", "Purchase failed.");
  if (player?.character) {
    player.character.cash = result.cash;
    player.character.bank = result.bank;
  }
  return { cash: result.cash, bank: result.bank, saleId: Number(result.transactionResult?.saleId || 0), totalPrice };
}

async function purchaseAppearanceProduct(player, businessId, productId, paymentTypeRaw, access = null) {
  const { product } = findProduct(businessId, productId);
  const business = await repository.getBusiness(businessId);
  const paymentType = normalizePaymentType(paymentTypeRaw);
  const paymentField = paymentType === "card" ? "bank" : "cash";
  const unitPrice = getCatalogPrice(business, product);
  if (product.kind !== "hair" && product.kind !== "tattoo") {
    throw businessError("invalid", "This is not an appearance service.");
  }
  const characterUuid = getCharacterUuid(player);
  if (!characterUuid) throw businessError("character", "Character not loaded.");
  let nextCustomization = null;
  let nextAppearance = null;
  let remainingCash = 0;
  let saleId = 0;

  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [characters] = await connection.query(
        "SELECT cash, bank, customization, appearance FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const character = characters?.[0];
      if (!character) throw businessError("character", "Character not loaded.");
      const currentBalance = Math.max(0, Number(character[paymentField] || 0));
      if (currentBalance < unitPrice) throw businessError("cash", "Not enough funds.");
      remainingCash = currentBalance - unitPrice;
      nextCustomization = repository.parseJson(character.customization, {});
      nextAppearance = repository.parseJson(character.appearance, {});

      if (product.kind === "hair") {
        nextCustomization.hair = {
          ...(nextCustomization.hair || {}),
          ...product.appearance,
        };
      } else {
        const decoration = { ...product.decoration };
        const decorations = Array.isArray(nextAppearance.decorations) ? nextAppearance.decorations.slice(0, 31) : [];
        const alreadyOwned = decorations.some((entry) => (
          String(entry?.collection || "") === String(decoration.collection || "")
          && String(entry?.overlay || "") === String(decoration.overlay || "")
        ));
        if (alreadyOwned) throw businessError("already_owned", "You already own this tattoo.");
        decorations.push(decoration);
        nextAppearance.decorations = decorations;
      }

      await connection.query(
        `UPDATE characters SET ${paymentField} = ?, customization = ?, appearance = ? WHERE uuid = ?`,
        [remainingCash, JSON.stringify(nextCustomization), JSON.stringify(nextAppearance), characterUuid]
      );
      const sale = await stageSale(connection, {
        actorUuid: characterUuid,
        businessId,
        buyerUuid: characterUuid,
        kind: product.kind,
        lines: [{ id: product.id, name: product.name, quantity: 1, stockKey: product.stockKey, unitPrice }],
        paymentType,
        player,
        customerAccessValidated: access?.customerAccessValidated === true,
        totalPrice: unitPrice,
        validateCatalog: true,
      });
      saleId = Number(sale?.saleId || 0);
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });

  if (player?.character) {
    player.character[paymentField] = remainingCash;
    player.character.customization = JSON.stringify(nextCustomization);
    player.character.appearance = JSON.stringify(nextAppearance);
  }
  if (product.kind === "hair") {
    const hair = nextCustomization.hair || {};
    player.setClothes(2, Number(hair.hairId || 0), 0, 0);
    player.setHairColor(Number(hair.color1 || 0), Number(hair.color2 || 0));
  } else {
    player.setVariable("twinkleDecorations", JSON.stringify(nextAppearance.decorations || []));
  }
  return { cash: Number(player?.character?.cash || 0), bank: Number(player?.character?.bank || 0), saleId, totalPrice: unitPrice };
}

function getVehicleFuelMax(vehicle) {
  let rawCapacity;
  try {
    rawCapacity = vehicle?.getVariable?.("fuelMax") ?? vehicle?.fuelMax ?? 60;
  } catch {}
  const capacity = normalizeFuelCapacity(rawCapacity ?? 60);
  if (capacity === null) {
    throw businessError("vehicle_fuel", "The vehicle fuel capacity is invalid.");
  }
  return capacity;
}

function assertRefuelVehicleReady(player, vehicle, unavailableMessage) {
  if (!vehicle || !mp.vehicles.exists(vehicle) || player?.vehicle !== vehicle || !isDriverSeat(player.seat)) {
    throw businessError("vehicle", unavailableMessage || "The vehicle is no longer available for refuelling.");
  }
  if (vehicleControl.getVehicleEngine(vehicle)) {
    throw businessError("vehicle_engine", "Turn off the engine before refuelling.");
  }
}

function getFuelStationState(player) {
  const vehicle = player?.vehicle;
  if (!vehicle || !mp.vehicles.exists(vehicle)) {
    return {
      canRefuel: false,
      reason: "no_vehicle",
      recommendedProductId: "petrol_95",
      vehicle: null,
    };
  }

  const capacity = getVehicleFuelMax(vehicle);
  const fuel = Math.max(0, Math.min(capacity, Number(vehicleControl.getVehicleFuel(vehicle) || 0)));
  const engineOn = Boolean(vehicleControl.getVehicleEngine(vehicle));
  let reason = "ready";
  if (!isDriverSeat(player.seat)) reason = "not_driver";
  else if (engineOn) reason = "engine_on";
  else if (fuel >= capacity) reason = "full";

  return {
    canRefuel: reason === "ready",
    reason,
    recommendedProductId: "petrol_95",
    vehicle: {
      name: String(
        vehicle.getVariable("displayName") || vehicle.getVariable("modelName") || vehicle.displayName || "Vehicle"
      ).slice(0, 96),
      plate: String(vehicle.numberPlate || vehicle.getVariable("plate") || "").slice(0, 8),
      fuel: Math.round(fuel * 10) / 10,
      capacity: Math.round(capacity * 10) / 10,
      percent: Math.round((fuel / capacity) * 1000) / 10,
      engineOn,
    },
  };
}

async function purchaseFuel(player, businessId, productId, paymentTypeRaw) {
  const { product } = findProduct(businessId, productId);
  const business = await repository.getBusiness(businessId);
  const paymentType = normalizePaymentType(paymentTypeRaw);
  const paymentField = paymentType === "card" ? "bank" : "cash";
  const unitPrice = getCatalogPrice(business, product);
  if (product.kind !== "fuel") throw businessError("invalid", "Fuel product not found.");
  const vehicle = player?.vehicle;
  assertRefuelVehicleReady(player, vehicle, "You must be the current driver of a vehicle to refuel it.");
  return vehicleControl.withFuelMutation(vehicle, async () => {
    assertRefuelVehicleReady(player, vehicle);
    const capacity = getVehicleFuelMax(vehicle);
    const refuel = calculateFullRefuel(vehicleControl.getVehicleFuel(vehicle), capacity);
    const { nextFuel, billedLitres: quantity } = refuel;
    if (quantity < 1) throw businessError("fuel_full", "The fuel tank is full.");
    const characterUuid = getCharacterUuid(player);
    const vehicleDbId = Number(vehicleControl.getVehicleDatabaseId(vehicle) || 0);
    if (!characterUuid) throw businessError("character", "Character not loaded.");
    const totalPrice = unitPrice * quantity;
    let remainingCash = 0;
    let saleId = 0;

    await db.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const [characters] = await connection.query(
          "SELECT cash, bank FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
          [characterUuid]
        );
        if (!characters?.[0]) throw businessError("character", "Character not loaded.");
        const currentBalance = Math.max(0, Number(characters[0][paymentField] || 0));
        if (currentBalance < totalPrice) throw businessError("cash", "Not enough funds.");
        if (vehicleDbId) {
          const [vehicles] = await connection.query(
            "SELECT id FROM vehicles WHERE id = ? LIMIT 1 FOR UPDATE",
            [vehicleDbId]
          );
          if (!vehicles?.[0]) throw businessError("vehicle", "The vehicle no longer exists.");
        }
        remainingCash = currentBalance - totalPrice;
        await connection.query(`UPDATE characters SET ${paymentField} = ? WHERE uuid = ?`, [remainingCash, characterUuid]);
        if (vehicleDbId) {
          await connection.query("UPDATE vehicles SET fuel = ? WHERE id = ?", [nextFuel, vehicleDbId]);
        }
        const sale = await stageSale(connection, {
          actorUuid: characterUuid,
          businessId,
          buyerUuid: characterUuid,
          kind: "fuel",
          lines: [{ id: product.id, name: product.name, quantity, stockKey: product.stockKey, unitPrice }],
          paymentType,
          player,
          totalPrice,
          validateCatalog: true,
        });
        saleId = Number(sale?.saleId || 0);
        assertRefuelVehicleReady(player, vehicle);
        await connection.commit();
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });
    if (player?.character) player.character[paymentField] = remainingCash;
    vehicleControl.setVehicleFuel(vehicle, nextFuel);
    vehicleControl.syncVehicleFuelForPlayer(player, vehicle);
    return { cash: Number(player?.character?.cash || 0), bank: Number(player?.character?.bank || 0), fuel: nextFuel, quantity, saleId, totalPrice };
  });
}

async function purchaseCustomerProduct(player, businessId, productId, quantity, paymentType, access = null) {
  const customerAccessValidated = access?.customerAccessValidated === true;
  if (!customerAccessValidated && !isNearBusiness(player, businessId)) {
    throw businessError("range", "Move closer to the business.");
  }
  const { config, product } = findProduct(businessId, productId);
  const requestedQuantity = normalizeRequestedPurchaseQuantity(config.type, product.kind, quantity);
  if (!requestedQuantity.valid) {
    throw businessError("invalid", "This product must be purchased one at a time.");
  }
  const normalizedQuantity = requestedQuantity.quantity;
  let result;
  if (product.kind === "item") {
    result = await purchaseInventoryProduct(
      player,
      businessId,
      productId,
      normalizedQuantity,
      paymentType,
      { customerAccessValidated }
    );
  } else if (product.kind === "fuel") {
    result = await purchaseFuel(player, businessId, productId, paymentType);
  } else {
    result = await purchaseAppearanceProduct(
      player,
      businessId,
      productId,
      paymentType,
      { customerAccessValidated }
    );
  }

  let equipped;
  if (config.type === "clothing" && product.kind === "item") {
    equipped = await inventory.equipItemByItemId(player, product.id);
  } else if (product.kind === "hair" || product.kind === "tattoo") {
    equipped = true;
  }

  try {
    await recordBusinessQuestProgress(player, businessId, product, result, normalizedQuantity);
  } catch (error) {
    console.error(`[BUSINESS] Purchase ${Number(result?.saleId || 0)} committed but quest progress failed:`, error);
  }
  return {
    ...result,
    productId: product.id,
    productKind: product.kind,
    productName: String(product.name || product.id).slice(0, 128),
    quantity: resolvePurchasedQuantity(product.kind, normalizedQuantity, result.quantity),
    ...(typeof equipped === "boolean" ? { equipped } : {}),
  };
}

async function recordBusinessQuestProgress(player, businessId, product, result, quantity) {
  const characterUuid = getCharacterUuid(player);
  if (!characterUuid || !product || !result) return;

  const amount = Math.max(1, Math.floor(Number(quantity || 1)));
  const totalPrice = Math.max(0, Math.floor(Number(result.totalPrice || 0)));
  const balanceAfter = Number.isFinite(Number(result.cash))
    ? Number(result.cash)
    : Number(result.bank || 0);
  const saleIdentity = Number(result.saleId || 0) > 0
    ? `sale:${Number(result.saleId)}`
    : `balance:${balanceAfter}:price:${totalPrice}`;
  const keyBase = `business:${characterUuid}:${businessId}:${product.id}:${saleIdentity}`;
  const metadata = {
    businessId,
    productId: product.id,
    productKind: product.kind,
    quantity: amount,
    totalPrice,
  };

  await quests.recordProgress(player, {
    type: "business.purchase_completed",
    subjectId: businessId,
    idempotencyKey: `${keyBase}:purchase`,
    amount,
    metadata,
  }, { sync: false });

  if (product.kind === "item") {
    await quests.recordProgress(player, {
      type: "inventory.item_bought",
      subjectId: product.id,
      idempotencyKey: `${keyBase}:item`,
      amount,
      metadata,
    }, { sync: false });
  }

  if (totalPrice > 0) {
    await quests.recordProgress(player, {
      type: "finance.cash_spent",
      subjectId: businessId,
      idempotencyKey: `${keyBase}:cash_spent`,
      amount: totalPrice,
      metadata,
    }, { sync: true });
  } else {
    await quests.syncPlayer(player);
  }
}

async function getAccess(connection, business, characterUuid) {
  if (Number(business.ownerUuid) === Number(characterUuid)) {
    return { owner: true, permissions: PERMISSIONS.slice() };
  }
  const [rows] = await connection.query(
    "SELECT permissions_json FROM twinkle_business_employees WHERE business_id = ? AND character_uuid = ? LIMIT 1",
    [business.id, characterUuid]
  );
  return { owner: false, permissions: repository.parseJson(rows?.[0]?.permissions_json, []) };
}

async function requirePermission(connection, business, characterUuid, permission) {
  const access = await getAccess(connection, business, characterUuid);
  if (!access.owner && !access.permissions.includes(permission)) {
    throw businessError("permission", "You do not have permission for this action.");
  }
  return access;
}

async function getManagementPayload(player) {
  const characterUuid = getCharacterUuid(player);
  if (!characterUuid) return { businesses: [] };
  const businesses = await repository.getCharacterBusinesses(characterUuid);
  return {
    contractVersion: BUSINESS_CONTRACT_VERSION,
    businesses: await Promise.all(businesses.map(async (business) => {
      const config = BUSINESS_BY_ID.get(business.id);
      const isOwner = Number(business.ownerUuid) === characterUuid;
      const permissions = isOwner ? PERMISSIONS.slice() : business.employeePermissions;
      const canViewLogs = isOwner || permissions.includes("view_logs");
      const canManageBalance = isOwner || permissions.includes("manage_balance");
      const canManageProducts = isOwner || permissions.includes("manage_products");
      const canOrderStock = isOwner || permissions.includes("order_stock");
      const [employees, activity, analytics] = await Promise.all([
        isOwner ? repository.getEmployees(business.id) : Promise.resolve([]),
        canViewLogs ? repository.getRecentActivity(business.id) : Promise.resolve({ ledger: [], supplies: [] }),
        canViewLogs ? repository.getAnalytics(business.id) : Promise.resolve({ buyersMonth: 0, revenueDay: 0, revenueWeek: 0, revenueMonth: 0, salesMonth: 0, topProducts: [] }),
      ]);
      return {
        balances: canManageBalance ? { cash: business.cashBalance, card: business.bankBalance } : { cash: 0, card: 0 },
        analytics,
        employees,
        id: business.id,
        isOpen: business.isOpen && (!business.ownerUuid || !business.taxPaidUntil || new Date(business.taxPaidUntil).getTime() >= Date.now()),
        isOwner,
        ledger: activity.ledger,
        name: business.name,
        ownerName: business.ownerName,
        permissions,
        priceEditingEnabled: canManageProducts,
        products: (canManageProducts ? (config?.products || []) : []).map((product) => ({
          id: product.id,
          kind: product.kind,
          name: product.name,
          basePrice: product.price,
          price: getCatalogPrice(business, product),
        })),
        purchasePrice: business.purchasePrice,
        salePrice: business.salePrice,
        stock: Object.entries(canOrderStock ? (business.stock || {}) : {}).map(([stockKey, quantity]) => {
          const product = config?.products?.find((entry) => entry.stockKey === stockKey);
          return {
            label: stockKey === "service_units" ? "Service materials" : (product?.name || stockKey),
            quantity: Math.max(0, Number(quantity || 0)),
            stockKey,
            unitCost: Math.max(1, Number(config?.supplyCosts?.[stockKey] || product?.stockCost || 25)),
          };
        }),
        supplies: activity.supplies,
        tax: {
          dailyPrice: Math.max(100, Math.round(business.purchasePrice * BUSINESS_TAX_RATE)),
          paidUntil: business.taxPaidUntil,
        },
        type: business.type,
      };
    })),
  };
}

async function changeBalance(player, businessId, action, rawAmount, balanceTypeRaw = "cash") {
  const characterUuid = getCharacterUuid(player);
  const amount = Math.floor(Number(rawAmount || 0));
  if (!characterUuid || !Number.isInteger(amount) || amount < 1 || amount > 100000000) {
    throw businessError("invalid", "Invalid amount.");
  }
  let remainingCash = 0;
  const balanceType = normalizePaymentType(balanceTypeRaw);
  const characterField = balanceType === "card" ? "bank" : "cash";
  const businessField = balanceType === "card" ? "bank_balance" : "cash_balance";
  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [characters] = await connection.query("SELECT cash, bank FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE", [characterUuid]);
      const business = await repository.getBusiness(businessId, connection, true);
      if (!characters?.[0] || !business) throw businessError("not_found", "Business or character not found.");
      await requirePermission(connection, business, characterUuid, "manage_balance");
      const cash = Math.max(0, Number(characters[0][characterField] || 0));
      const businessBalance = balanceType === "card" ? business.bankBalance : business.cashBalance;
      const deposit = String(action) === "deposit";
      if (!deposit && String(action) !== "withdraw") throw businessError("invalid", "Invalid balance action.");
      if (deposit && cash < amount) throw businessError("cash", "Not enough cash.");
      if (!deposit && businessBalance < amount) throw businessError("balance", "Business balance is insufficient.");
      remainingCash = deposit ? cash - amount : cash + amount;
      const nextBalance = deposit ? businessBalance + amount : businessBalance - amount;
      await connection.query(`UPDATE characters SET ${characterField} = ? WHERE uuid = ?`, [remainingCash, characterUuid]);
      await connection.query(`UPDATE twinkle_businesses SET ${businessField} = ?, revision = revision + 1 WHERE id = ?`, [nextBalance, business.id]);
      await connection.query(
        `INSERT INTO twinkle_business_ledger
          (business_id, actor_uuid, action, amount, balance_after, details_json)
         VALUES (?, ?, ?, ?, ?, '{}')`,
        [business.id, characterUuid, `${deposit ? "deposit" : "withdraw"}_${balanceType}`, deposit ? amount : -amount, nextBalance]
      );
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
  if (player?.character) player.character[characterField] = remainingCash;
  if (player?.characterData) player.characterData[characterField] = remainingCash;
  try { player?.setVariable?.(characterField, remainingCash); } catch {}
  return { cash: Number(player?.character?.cash || 0), bank: Number(player?.character?.bank || 0) };
}

async function toggleOpen(player, businessId, open) {
  const characterUuid = getCharacterUuid(player);
  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const business = await repository.getBusiness(businessId, connection, true);
      if (!business) throw businessError("not_found", "Business not found.");
      await requirePermission(connection, business, characterUuid, "toggle_open");
      await connection.query("UPDATE twinkle_businesses SET is_open = ?, revision = revision + 1 WHERE id = ?", [open ? 1 : 0, business.id]);
      await connection.query(
        `INSERT INTO twinkle_business_ledger
          (business_id, actor_uuid, action, amount, balance_after, details_json)
         VALUES (?, ?, 'toggle_open', 0, ?, ?)`,
        [business.id, characterUuid, business.cashBalance, JSON.stringify({ open: Boolean(open) })]
      );
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function orderSupply(player, businessId, stockKeyRaw, rawQuantity, balanceTypeRaw = "card") {
  const characterUuid = getCharacterUuid(player);
  const stockKey = String(stockKeyRaw || "").trim();
  const quantity = Math.floor(Number(rawQuantity || 0));
  if (!stockKey || quantity < 1 || quantity > MAX_SUPPLY_QUANTITY) throw businessError("invalid", "Invalid supply order.");
  const config = BUSINESS_BY_ID.get(String(businessId || ""));
  if (!config) throw businessError("not_found", "Business not found.");
  const product = config.products.find((entry) => entry.stockKey === stockKey);
  const unitPrice = Math.max(1, Number(product?.stockCost || config.supplyCosts?.[stockKey] || 25));
  const totalPrice = unitPrice * quantity;
  const balanceType = normalizePaymentType(balanceTypeRaw);
  const businessField = balanceType === "card" ? "bank_balance" : "cash_balance";
  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const business = await repository.getBusiness(businessId, connection, true);
      if (!business) throw businessError("not_found", "Business not found.");
      await requirePermission(connection, business, characterUuid, "order_stock");
      if (!Object.prototype.hasOwnProperty.call(business.stock || {}, stockKey)) throw businessError("invalid", "Unknown stock item.");
      const businessBalance = balanceType === "card" ? business.bankBalance : business.cashBalance;
      if (businessBalance < totalPrice) throw businessError("balance", "Business balance is insufficient.");
      const nextBalance = businessBalance - totalPrice;
      await connection.query(
        `UPDATE twinkle_businesses SET ${businessField} = ?, revision = revision + 1 WHERE id = ?`,
        [nextBalance, business.id]
      );
      await connection.query(
        `INSERT INTO twinkle_business_supplies
          (business_id, actor_uuid, stock_key, quantity, unit_price, total_price, status, available_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [business.id, characterUuid, stockKey, quantity, unitPrice, totalPrice, new Date(Date.now() + SUPPLY_DELIVERY_MS)]
      );
      await connection.query(
        `INSERT INTO twinkle_business_ledger
          (business_id, actor_uuid, action, amount, balance_after, details_json)
         VALUES (?, ?, 'supply', ?, ?, ?)`,
        [business.id, characterUuid, -totalPrice, nextBalance, JSON.stringify({ quantity, stockKey, unitPrice, balanceType, status: "pending" })]
      );
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function fulfillDueSupplies() {
  if (supplyFulfillmentPromise) return supplyFulfillmentPromise;
  supplyFulfillmentPromise = (async () => {
    await repository.ensureSchema();
    return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [orders] = await connection.query(
        `SELECT id, business_id, stock_key, quantity
           FROM twinkle_business_supplies
          WHERE status = 'pending' AND available_at IS NOT NULL AND available_at <= NOW()
          ORDER BY id ASC LIMIT 100 FOR UPDATE`
      );
      for (const order of orders || []) {
        const business = await repository.getBusiness(order.business_id, connection, true);
        if (!business) continue;
        const stock = { ...(business.stock || {}) };
        stock[order.stock_key] = Math.max(0, Number(stock[order.stock_key] || 0)) + Math.max(0, Number(order.quantity || 0));
        await connection.query(
          "UPDATE twinkle_businesses SET stock_json = ?, revision = revision + 1 WHERE id = ?",
          [JSON.stringify(stock), business.id]
        );
        await connection.query(
          "UPDATE twinkle_business_supplies SET status = 'delivered' WHERE id = ? AND status = 'pending'",
          [order.id]
        );
      }
      await connection.commit();
      return Number(orders?.length || 0);
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
    });
  })().finally(() => {
    supplyFulfillmentPromise = null;
  });
  return supplyFulfillmentPromise;
}

async function updateProductPrice(player, businessId, productIdRaw, rawPrice) {
  const characterUuid = getCharacterUuid(player);
  const productId = String(productIdRaw || "");
  const config = BUSINESS_BY_ID.get(String(businessId || ""));
  const product = config?.products?.find((entry) => entry.id === productId);
  const price = Math.floor(Number(rawPrice || 0));
  if (!product || !Number.isInteger(price) || price < Math.max(1, Math.floor(product.price * 0.5)) || price > Math.ceil(product.price * 2)) {
    throw businessError("price", "Price must be between 50% and 200% of the base price.");
  }
  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const business = await repository.getBusiness(businessId, connection, true);
      if (!business) throw businessError("not_found", "Business not found.");
      await requirePermission(connection, business, characterUuid, "manage_products");
      const catalog = { ...(business.catalog || {}), [productId]: price };
      await connection.query(
        "UPDATE twinkle_businesses SET catalog_json = ?, revision = revision + 1 WHERE id = ?",
        [JSON.stringify(catalog), business.id]
      );
      await connection.query(
        `INSERT INTO twinkle_business_ledger
          (business_id, actor_uuid, action, amount, balance_after, details_json)
         VALUES (?, ?, 'price_update', 0, ?, ?)`,
        [business.id, characterUuid, business.cashBalance, JSON.stringify({ basePrice: product.price, price, productId })]
      );
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function payTax(player, businessId, rawDays, balanceTypeRaw = "card") {
  const characterUuid = getCharacterUuid(player);
  const days = Math.floor(Number(rawDays || 0));
  if (days < 1 || days > 30) throw businessError("invalid", "Tax can be paid for 1 to 30 days.");
  const balanceType = normalizePaymentType(balanceTypeRaw);
  const balanceField = balanceType === "card" ? "bank_balance" : "cash_balance";
  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const business = await repository.getBusiness(businessId, connection, true);
      if (!business) throw businessError("not_found", "Business not found.");
      await requirePermission(connection, business, characterUuid, "manage_taxes");
      const dailyPrice = Math.max(100, Math.round(business.purchasePrice * BUSINESS_TAX_RATE));
      const totalPrice = dailyPrice * days;
      const currentBalance = balanceType === "card" ? business.bankBalance : business.cashBalance;
      if (currentBalance < totalPrice) throw businessError("balance", "Business balance is insufficient.");
      const nextBalance = currentBalance - totalPrice;
      const baseDate = Math.max(Date.now(), business.taxPaidUntil ? new Date(business.taxPaidUntil).getTime() : 0);
      const paidUntil = new Date(baseDate + days * 24 * 60 * 60 * 1000);
      await connection.query(
        `UPDATE twinkle_businesses SET ${balanceField} = ?, tax_paid_until = ?, revision = revision + 1 WHERE id = ?`,
        [nextBalance, paidUntil, business.id]
      );
      await connection.query(
        `INSERT INTO twinkle_business_ledger
          (business_id, actor_uuid, action, amount, balance_after, details_json)
         VALUES (?, ?, 'tax', ?, ?, ?)`,
        [business.id, characterUuid, -totalPrice, nextBalance, JSON.stringify({ balanceType, days, paidUntil })]
      );
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function setSaleListing(player, businessId, rawPrice) {
  const characterUuid = getCharacterUuid(player);
  const price = rawPrice === null || rawPrice === undefined || Number(rawPrice) <= 0
    ? null
    : Math.floor(Number(rawPrice));
  if (price !== null && !Number.isSafeInteger(price)) throw businessError("price", "Invalid listing price.");
  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const business = await repository.getBusiness(businessId, connection, true);
      if (!business || Number(business.ownerUuid) !== characterUuid) throw businessError("permission", "Only the owner can list a business.");
      if (price !== null && (price < Math.floor(business.purchasePrice * 0.25) || price > business.purchasePrice * 10)) {
        throw businessError("price", "Listing price is outside the allowed range.");
      }
      await connection.query(
        "UPDATE twinkle_businesses SET sale_price = ?, revision = revision + 1 WHERE id = ?",
        [price, business.id]
      );
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

function marketplaceListing(business) {
  const config = BUSINESS_BY_ID.get(business.id);
  const stateOwned = !business.ownerUuid;
  const price = stateOwned ? business.purchasePrice : business.salePrice;
  const typeLabel = getBusinessTypeLabel(business.type);
  return {
    id: `business:${business.id}`,
    title: business.name,
    category: "businesses",
    price: Math.max(1, Number(price || business.purchasePrice)),
    placementPrice: 0,
    phone: stateOwned ? "Государственное объявление" : "Объявление владельца",
    seller: stateOwned ? "Штат Сан-Андреас" : business.ownerName,
    description: `${typeLabel}: управляемый склад, раздельный учёт наличных и безналичных средств, а также управление через планшет владельца.`,
    image: "/property/business.png",
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    likes: 0,
    views: 0,
    favorited: false,
    purchasable: true,
    specs: [
      { label: "Тип", value: typeLabel },
      { label: "Владелец", value: stateOwned ? "Государство" : business.ownerName },
      { label: "Статус", value: business.isOpen ? "Открыт" : "Закрыт" },
    ],
  };
}

async function getMarketplacePayload() {
  const businesses = await repository.getMarketplaceBusinesses();
  return { listings: businesses.map(marketplaceListing) };
}

async function purchaseMarketplaceBusiness(player, listingIdRaw, paymentTypeRaw) {
  const characterUuid = getCharacterUuid(player);
  const businessId = String(listingIdRaw || "").replace(/^business:/, "");
  const paymentType = normalizePaymentType(paymentTypeRaw);
  const paymentField = paymentType === "card" ? "bank" : "cash";
  if (!characterUuid || !BUSINESS_BY_ID.has(businessId)) throw businessError("invalid", "Invalid business listing.");
  let remainingBalance = 0;
  let sellerUuid = 0;
  let sellerBank = 0;
  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [buyers] = await connection.query("SELECT cash, bank FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE", [characterUuid]);
      const business = await repository.getBusiness(businessId, connection, true);
      if (!buyers?.[0] || !business) throw businessError("not_found", "Business or buyer not found.");
      if (Number(business.ownerUuid) === characterUuid) throw businessError("owned", "You already own this business.");
      const price = business.ownerUuid ? business.salePrice : business.purchasePrice;
      if (!price) throw businessError("listing", "This business is no longer listed.");
      const currentBalance = Math.max(0, Number(buyers[0][paymentField] || 0));
      if (currentBalance < price) throw businessError("cash", "Not enough funds.");
      remainingBalance = currentBalance - price;
      await connection.query(`UPDATE characters SET ${paymentField} = ? WHERE uuid = ?`, [remainingBalance, characterUuid]);
      if (business.ownerUuid) {
        sellerUuid = Number(business.ownerUuid);
        const [sellerUpdate] = await connection.query("UPDATE characters SET bank = bank + ? WHERE uuid = ?", [price, business.ownerUuid]);
        if (Number(sellerUpdate?.affectedRows || 0) !== 1) throw businessError("target", "The seller character no longer exists.");
        const [sellerRows] = await connection.query("SELECT bank FROM characters WHERE uuid = ? LIMIT 1", [business.ownerUuid]);
        sellerBank = Math.max(0, Number(sellerRows?.[0]?.bank || 0));
      }
      await connection.query("DELETE FROM twinkle_business_employees WHERE business_id = ?", [business.id]);
      const nextTaxPaidUntil = business.ownerUuid
        ? business.taxPaidUntil
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await connection.query(
        "UPDATE twinkle_businesses SET owner_uuid = ?, owner_name = ?, sale_price = NULL, tax_paid_until = ?, revision = revision + 1 WHERE id = ?",
        [characterUuid, getCharacterName(player), nextTaxPaidUntil, business.id]
      );
      await connection.query(
        `INSERT INTO twinkle_business_ledger
          (business_id, actor_uuid, action, amount, balance_after, details_json)
         VALUES (?, ?, 'marketplace_purchase', ?, 0, ?)`,
        [business.id, characterUuid, -price, JSON.stringify({ paymentType, previousOwnerUuid: business.ownerUuid })]
      );
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
  if (player?.character) player.character[paymentField] = remainingBalance;
  if (player?.characterData) player.characterData[paymentField] = remainingBalance;
  try { player?.setVariable?.(paymentField, remainingBalance); } catch {}
  return {
    bank: Number(player?.character?.bank || 0),
    cash: Number(player?.character?.cash || 0),
    sellerBank,
    sellerUuid,
  };
}

async function sellBusinessToState(player, businessId) {
  const characterUuid = getCharacterUuid(player);
  if (!isNearBusiness(player, businessId)) throw businessError("range", "Visit the business sale marker.");
  let payout = 0;
  let bankAfter = 0;
  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const business = await repository.getBusiness(businessId, connection, true);
      if (!business || Number(business.ownerUuid) !== characterUuid) throw businessError("permission", "Only the owner can sell this business.");
      const [characters] = await connection.query("SELECT bank FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE", [characterUuid]);
      if (!characters?.[0]) throw businessError("character", "Character not found.");
      payout = Math.floor(business.purchasePrice * 0.75) + business.cashBalance + business.bankBalance;
      bankAfter = Math.max(0, Number(characters[0].bank || 0)) + payout;
      await connection.query("UPDATE characters SET bank = ? WHERE uuid = ?", [bankAfter, characterUuid]);
      await connection.query("DELETE FROM twinkle_business_employees WHERE business_id = ?", [business.id]);
      await connection.query(
        "UPDATE twinkle_businesses SET owner_uuid = NULL, owner_name = '', sale_price = NULL, cash_balance = 0, bank_balance = 0, is_open = 0, tax_paid_until = NULL, revision = revision + 1 WHERE id = ?",
        [business.id]
      );
      await connection.query(
        `INSERT INTO twinkle_business_ledger
          (business_id, actor_uuid, action, amount, balance_after, details_json)
         VALUES (?, ?, 'state_sale', ?, 0, ?)`,
        [business.id, characterUuid, payout, JSON.stringify({ commissionRate: 0.25 })]
      );
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
  if (player?.character) player.character.bank = bankAfter;
  if (player?.characterData) player.characterData.bank = bankAfter;
  try { player?.setVariable?.("bank", bankAfter); } catch {}
  return { bank: bankAfter, cash: Number(player?.character?.cash || 0), payout };
}

function normalizePermissions(value) {
  const requested = Array.isArray(value) ? value : [];
  return PERMISSIONS.filter((permission) => requested.includes(permission));
}

async function upsertEmployee(player, businessId, targetUuidRaw, permissionsRaw) {
  const characterUuid = getCharacterUuid(player);
  const targetUuid = Number(targetUuidRaw);
  if (!Number.isSafeInteger(targetUuid) || targetUuid <= 0 || targetUuid === characterUuid) throw businessError("invalid", "Invalid employee.");
  const permissions = normalizePermissions(permissionsRaw);
  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const business = await repository.getBusiness(businessId, connection, true);
      if (!business) throw businessError("not_found", "Business not found.");
      if (Number(business.ownerUuid) !== characterUuid) {
        throw businessError("permission", "Only the business owner can manage employees.");
      }
      const [characters] = await connection.query("SELECT uuid, name FROM characters WHERE uuid = ? LIMIT 1", [targetUuid]);
      if (!characters?.[0]) throw businessError("target", "Character not found.");
      const [countRows] = await connection.query("SELECT COUNT(*) AS total FROM twinkle_business_employees WHERE business_id = ?", [business.id]);
      const [existing] = await connection.query(
        "SELECT character_uuid FROM twinkle_business_employees WHERE business_id = ? AND character_uuid = ? LIMIT 1",
        [business.id, targetUuid]
      );
      if (!existing?.[0] && Number(countRows?.[0]?.total || 0) >= MAX_EMPLOYEES) throw businessError("limit", "Employee limit reached.");
      await connection.query(
        `INSERT INTO twinkle_business_employees
          (business_id, character_uuid, character_name, permissions_json)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE character_name = VALUES(character_name), permissions_json = VALUES(permissions_json)`,
        [business.id, targetUuid, String(characters[0].name || `Персонаж ${targetUuid}`).slice(0, 128), JSON.stringify(permissions)]
      );
      await connection.query(
        `INSERT INTO twinkle_business_ledger
          (business_id, actor_uuid, action, amount, balance_after, details_json)
         VALUES (?, ?, 'employee_upsert', 0, ?, ?)`,
        [business.id, characterUuid, business.cashBalance, JSON.stringify({ permissions, targetUuid })]
      );
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function removeEmployee(player, businessId, targetUuidRaw) {
  const characterUuid = getCharacterUuid(player);
  const targetUuid = Number(targetUuidRaw);
  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const business = await repository.getBusiness(businessId, connection, true);
      if (!business) throw businessError("not_found", "Business not found.");
      if (Number(business.ownerUuid) !== characterUuid) {
        throw businessError("permission", "Only the business owner can manage employees.");
      }
      await connection.query("DELETE FROM twinkle_business_employees WHERE business_id = ? AND character_uuid = ?", [business.id, targetUuid]);
      await connection.query(
        `INSERT INTO twinkle_business_ledger
          (business_id, actor_uuid, action, amount, balance_after, details_json)
         VALUES (?, ?, 'employee_remove', 0, ?, ?)`,
        [business.id, characterUuid, business.cashBalance, JSON.stringify({ targetUuid })]
      );
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function syncAppearance(player) {
  const characterUuid = getCharacterUuid(player);
  if (!characterUuid) return;
  const rows = await db.query("SELECT appearance, customization FROM characters WHERE uuid = ? LIMIT 1", [characterUuid]);
  const appearance = repository.parseJson(rows?.[0]?.appearance, {});
  const customization = repository.parseJson(rows?.[0]?.customization, {});
  const hair = customization?.hair && typeof customization.hair === "object" ? customization.hair : null;
  if (hair) {
    player.setClothes(2, Math.max(0, Number(hair.hairId || 0)), 0, 0);
    player.setHairColor(
      Math.max(0, Math.min(63, Number(hair.color1 || 0))),
      Math.max(0, Math.min(63, Number(hair.color2 || 0)))
    );
  }
  player.setVariable("twinkleDecorations", JSON.stringify(appearance.decorations || []));
}

async function restoreCustomerPreview(player) {
  if (!player || !getCharacterUuid(player)) return;
  await inventory.restoreEquipment(player);
  await syncAppearance(player);
}

module.exports = {
  businessError,
  changeBalance,
  createPurchaseOptions,
  getCharacterName,
  getCharacterUuid,
  getCanonicalAppearance,
  getCustomerPayload,
  getManagementPayload,
  getMarketplacePayload,
  fulfillDueSupplies,
  isNearBusiness,
  orderSupply,
  payTax,
  purchaseCustomerProduct,
  purchaseMarketplaceBusiness,
  removeEmployee,
  repository,
  restoreCustomerPreview,
  stageSale,
  sellBusinessToState,
  setSaleListing,
  syncAppearance,
  toggleOpen,
  updateProductPrice,
  upsertEmployee,
};
