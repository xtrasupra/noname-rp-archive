"use strict";

const authFlow = require("../../auth/authFlow.js");
const { getAdminLevel } = require("../admin/admin.logs.js");
const hud = require("../hud/hud.service.js");
const { formatCustomerPurchaseNotification } = require("./business.notification.js");
const service = require("./business.service.js");
const {
  APPEARANCE_BUSINESS_TYPES,
  APPEARANCE_PREVIEW_DIMENSION_BASE,
  APPEARANCE_PREVIEW_SESSION_VERSION,
  APPEARANCE_PREVIEW_STAGE,
  BUSINESSES,
  BUSINESS_BY_ID,
  CUSTOMER_RANGE,
  PERMISSIONS,
} = require("./business.config.js");

const nearbyBusinessByPlayer = new Map();
const customerSessions = new Map();
const pendingOperations = new Set();
const customerPurchaseByPlayer = new Map();
const customerRestorations = new Map();
const lastTabletRequestByPlayer = new Map();
const tabletRefreshChains = new Map();
const worldEntities = [];
const MAX_PLAYER_CALL_BYTES = 7600;
const CUSTOMER_SESSION_TTL_MS = 10 * 60 * 1000;
const APPEARANCE_STAGE_RANGE = 7.5;
let supplyTimer = null;
let runtimeStopped = false;
let customerSessionSequence = 0;

function isPlayer(player) {
  return Boolean(player && mp.players.exists(player));
}

function notify(player, type, message) {
  if (!isPlayer(player)) return;
  try {
    player.call("client:notification", [String(type || "info"), String(message || ""), 4500]);
  } catch {}
}

function call(player, eventName, payload) {
  if (!isPlayer(player)) return;
  try {
    const serialized = payload === undefined ? null : JSON.stringify(payload);
    if (serialized !== null && Buffer.byteLength(serialized, "utf8") > MAX_PLAYER_CALL_BYTES) {
      throw new Error(`${eventName} payload exceeds ${MAX_PLAYER_CALL_BYTES} bytes`);
    }
    player.call(eventName, serialized === null ? [] : [serialized]);
  } catch (error) {
    console.error(`[BUSINESS] Failed to call ${eventName}:`, error);
  }
}

function restoreCustomerAppearance(player, expectedSessionId = "") {
  const playerId = Number(player?.id);
  const pendingPurchase = customerPurchaseByPlayer.get(playerId) || Promise.resolve();
  const previousRestore = customerRestorations.get(playerId) || Promise.resolve();
  let restoration = null;
  restoration = previousRestore
    .catch(() => {})
    .then(() => pendingPurchase)
    .catch(() => {})
    .then(() => {
      if (!isPlayer(player)) return;
      const activeSession = customerSessions.get(playerId);
      if (activeSession && String(activeSession.id) !== String(expectedSessionId || "")) return;
      return service.restoreCustomerPreview(player);
    })
    .catch((error) => {
      console.error(`[BUSINESS] Failed to restore customer preview for player ${playerId}:`, error);
    })
    .finally(() => {
      if (customerRestorations.get(playerId) === restoration) customerRestorations.delete(playerId);
    });
  customerRestorations.set(playerId, restoration);
  return restoration;
}

function normalizeHeading(value) {
  const heading = Number(value) % 360;
  return heading < 0 ? heading + 360 : heading;
}

function copyPosition(position) {
  return {
    x: Number(position?.x || 0),
    y: Number(position?.y || 0),
    z: Number(position?.z || 0),
  };
}

function distance(first, second) {
  const x = Number(first?.x || 0) - Number(second?.x || 0);
  const y = Number(first?.y || 0) - Number(second?.y || 0);
  const z = Number(first?.z || 0) - Number(second?.z || 0);
  return Math.sqrt(x * x + y * y + z * z);
}

function isAppearanceBusiness(config) {
  return Boolean(config && APPEARANCE_BUSINESS_TYPES.includes(String(config.type || "")));
}

function createCustomerSession(player, businessId) {
  const config = BUSINESS_BY_ID.get(String(businessId || ""));
  customerSessionSequence = (customerSessionSequence + 1) % 1000000;
  const id = `${Number(player.id)}:${Date.now()}:${customerSessionSequence}`;
  const session = {
    id,
    businessId: config.id,
    expiresAt: Date.now() + CUSTOMER_SESSION_TTL_MS,
    expiryTimer: null,
    preview: null,
    purchaseRequests: new Map(),
  };
  if (!isAppearanceBusiness(config)) return session;

  const stagePosition = copyPosition(config.preview?.position || APPEARANCE_PREVIEW_STAGE.position);
  const stageHeading = normalizeHeading(config.preview?.heading ?? APPEARANCE_PREVIEW_STAGE.heading);
  session.preview = {
    version: APPEARANCE_PREVIEW_SESSION_VERSION,
    dimension: APPEARANCE_PREVIEW_DIMENSION_BASE + Number(player.id),
    heading: stageHeading,
    initialFrame: config.type === "barber" ? "head" : "full",
    position: stagePosition,
    returnState: {
      dimension: Number(player.dimension || 0),
      heading: normalizeHeading(player.heading),
      position: copyPosition(player.position),
    },
  };
  return session;
}

function getPreviewPayload(session) {
  if (!session?.preview) return null;
  return {
    version: session.preview.version,
    sessionId: session.id,
    dimension: session.preview.dimension,
    heading: session.preview.heading,
    initialFrame: session.preview.initialFrame,
    position: { ...session.preview.position },
  };
}

function withSessionPayload(payload, session) {
  return {
    ...payload,
    sessionId: String(session?.id || ""),
    previewSession: getPreviewPayload(session),
  };
}

function movePlayerToPreview(player, session) {
  if (!session?.preview) return;
  const stage = session.preview;
  player.dimension = stage.dimension;
  player.position = new mp.Vector3(stage.position.x, stage.position.y, stage.position.z);
  player.heading = stage.heading;
}

function clearCustomerSessionTimer(session) {
  if (!session?.expiryTimer) return;
  clearTimeout(session.expiryTimer);
  session.expiryTimer = null;
}

function armCustomerSessionTimer(player, session) {
  clearCustomerSessionTimer(session);
  session.expiryTimer = setTimeout(() => {
    if (customerSessions.get(Number(player?.id)) !== session) return;
    endCustomerSession(player, session);
    call(player, "client:business:close");
  }, Math.max(1, session.expiresAt - Date.now()));
  session.expiryTimer.unref?.();
}

function restoreCustomerWorld(player, session) {
  if (!player || !session?.preview) return;
  const activeSession = customerSessions.get(Number(player.id));
  if (activeSession && String(activeSession.id) !== String(session.id)) return;
  const state = session.preview.returnState;
  try { player.dimension = Number(state.dimension || 0); } catch {}
  try { player.position = new mp.Vector3(state.position.x, state.position.y, state.position.z); } catch {}
  try { player.heading = normalizeHeading(state.heading); } catch {}
}

function endCustomerSession(player, session = customerSessions.get(Number(player?.id))) {
  const playerId = Number(player?.id);
  clearCustomerSessionTimer(session);
  if (session && customerSessions.get(playerId) === session) customerSessions.delete(playerId);
  restoreCustomerWorld(player, session);
  const restoration = restoreCustomerAppearance(player, session?.id);
  session?.purchaseRequests?.clear?.();
  return restoration;
}

function isCustomerSessionLocationValid(player, session) {
  if (!session?.preview) return service.isNearBusiness(player, session?.businessId);
  return (
    Number(player?.dimension || 0) === Number(session.preview.dimension) &&
    distance(player?.position, session.preview.position) <= APPEARANCE_STAGE_RANGE
  );
}

function findOnlineCharacter(characterUuid) {
  const expectedUuid = Number(characterUuid || 0);
  if (!expectedUuid) return null;
  let match = null;
  mp.players.forEach((candidate) => {
    if (
      !match && isPlayer(candidate) &&
      authFlow.isPhase(candidate, authFlow.PHASE.IN_GAME) &&
      service.getCharacterUuid(candidate) === expectedUuid
    ) match = candidate;
  });
  return match;
}

function parsePayload(rawPayload) {
  try {
    if (!rawPayload) return {};
    if (typeof rawPayload === "object") return rawPayload;
    const parsed = JSON.parse(String(rawPayload));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function createWorldBusiness(config) {
  if (config.external) return;
  const position = new mp.Vector3(config.position.x, config.position.y, config.position.z);
  const shape = mp.colshapes.newSphere(
    config.position.x,
    config.position.y,
    config.position.z,
    CUSTOMER_RANGE,
    Number(config.dimension || 0)
  );
  shape.twinkleBusinessId = config.id;
  worldEntities.push(shape);

  if (!config.noNpc) {
    const ped = mp.peds.new(mp.joaat(config.npcModel), position, {
      dynamic: false,
      frozen: true,
      invincible: true,
    });
    ped.dimension = Number(config.dimension || 0);
    ped.setVariable("businessHeading", Number(config.heading || 0));
    ped.setVariable("businessId", config.id);
    worldEntities.push(ped);
  }

  if (!config.noLabel) {
    worldEntities.push(mp.labels.new(
      `~p~${config.name}\n~w~Нажмите E, чтобы открыть`,
      new mp.Vector3(position.x, position.y, position.z + 1.1),
      { drawDistance: 15, dimension: Number(config.dimension || 0), font: 4, los: false }
    ));
  }
  worldEntities.push(mp.blips.new(
    Number(config.blip?.sprite || 52),
    position,
    {
      color: Number(config.blip?.color || 0),
      dimension: Number(config.dimension || 0),
      name: String(config.blip?.name || config.name),
      scale: Math.max(0.5, Math.min(1.2, Number(config.blip?.scale || 0.78))),
      shortRange: true,
    }
  ));
}

function stopBusinessRuntime() {
  if (runtimeStopped) return;
  runtimeStopped = true;
  if (supplyTimer) {
    clearInterval(supplyTimer);
    supplyTimer = null;
  }
  while (worldEntities.length) {
    const entity = worldEntities.pop();
    try {
      if (entity && typeof entity.destroy === "function") entity.destroy();
    } catch (error) {
      console.error("[BUSINESS] Failed to destroy a world entity:", error);
    }
  }
  mp.players.forEach((player) => {
    const session = customerSessions.get(Number(player?.id));
    if (session) {
      clearCustomerSessionTimer(session);
      restoreCustomerWorld(player, session);
      session.purchaseRequests?.clear?.();
    }
  });
  nearbyBusinessByPlayer.clear();
  customerSessions.clear();
  pendingOperations.clear();
  customerPurchaseByPlayer.clear();
  lastTabletRequestByPlayer.clear();
  tabletRefreshChains.clear();
}

function getSession(player) {
  const session = customerSessions.get(Number(player?.id));
  if (!session) {
    restoreCustomerAppearance(player);
    call(player, "client:business:close");
    return null;
  }
  if (session.expiresAt < Date.now() || !isCustomerSessionLocationValid(player, session)) {
    endCustomerSession(player, session);
    call(player, "client:business:close");
    return null;
  }
  return session;
}

async function refreshCustomer(player, businessId) {
  const session = customerSessions.get(Number(player?.id));
  if (!session || String(session.businessId) !== String(businessId || "")) return;
  const payload = await service.getCustomerPayload(player, businessId);
  call(player, "client:business:update", withSessionPayload(payload, session));
}

async function buildAndSendTablet(player) {
  const [management, marketplace] = await Promise.all([
    service.getManagementPayload(player),
    service.getMarketplacePayload(),
  ]);
  call(player, "client:business:tablet:update", {
    businessReset: true,
    businesses: [],
    contractVersion: management.contractVersion,
    marketplace: { listings: [] },
    marketplaceReset: true,
    character: {
      cash: Number(player?.character?.cash || 0),
      bank: Number(player?.character?.bank || 0),
    },
  });
  for (const business of management.businesses) {
    const { employees, ledger, supplies, ...baseBusiness } = business;
    call(player, "client:business:tablet:update", {
      businessMerge: true,
      businesses: [{ ...baseBusiness, employees: [], ledger: [], supplies: [], sales: [] }],
      contractVersion: management.contractVersion,
    });
    for (const [field, items] of Object.entries({ employees, ledger, supplies })) {
      for (let index = 0; index < items.length; index += 8) {
        call(player, "client:business:tablet:update", {
          businessAppendField: field,
          businessId: business.id,
          items: items.slice(index, index + 8),
        });
      }
    }
  }
  const listings = Array.isArray(marketplace?.listings) ? marketplace.listings : [];
  for (let index = 0; index < listings.length; index += 4) {
    call(player, "client:business:tablet:update", {
      marketplaceAppend: true,
      marketplace: { listings: listings.slice(index, index + 4) },
    });
  }
}

function refreshTablet(player) {
  const playerId = Number(player?.id);
  const previous = tabletRefreshChains.get(playerId) || Promise.resolve();
  let current = null;
  current = previous
    .catch(() => {})
    .then(() => {
      if (!isPlayer(player) || !authFlow.isPhase(player, authFlow.PHASE.IN_GAME)) return;
      return buildAndSendTablet(player);
    })
    .finally(() => {
      if (tabletRefreshChains.get(playerId) === current) tabletRefreshChains.delete(playerId);
    });
  tabletRefreshChains.set(playerId, current);
  return current;
}

async function refreshTabletAfterMutation(player, operation) {
  try {
    await refreshTablet(player);
    return true;
  } catch (error) {
    console.error(`[BUSINESS] ${operation} committed, but tablet refresh failed:`, error);
    notify(player, "info", "Операция сохранена. Переоткройте или обновите планшет, чтобы загрузить свежие данные.");
    return false;
  }
}

async function withPending(player, label, operation) {
  if (
    !isPlayer(player) || !player.auth || !service.getCharacterUuid(player) ||
    !authFlow.isPhase(player, authFlow.PHASE.IN_GAME)
  ) return { ok: false, reason: "state" };
  const key = `${Number(player?.id)}:${label}`;
  if (pendingOperations.has(key)) {
    notify(player, "info", "Предыдущая операция ещё обрабатывается.");
    return { ok: false, reason: "pending" };
  }
  pendingOperations.add(key);
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    const reason = String(error?.businessReason || "");
    const messages = {
      already_owned: "Этот товар или услуга уже принадлежат вам.",
      balance: "На балансе бизнеса недостаточно средств.",
      cash: "У вас недостаточно наличных.",
      character: "Сначала загрузите персонажа.",
      closed: "Бизнес закрыт.",
      fuel_full: "Топливный бак уже заполнен.",
      invalid: "Некорректный запрос к бизнесу.",
      limit: "Достигнут лимит сотрудников.",
      owned: "У этого бизнеса уже есть владелец.",
      listing: "Объявление на маркетплейсе больше не активно.",
      payment: "Выберите оплату наличными или картой.",
      price: "Выбранная цена выходит за разрешённый диапазон.",
      price_changed: "Цена товара изменилась. Проверьте каталог и повторите попытку.",
      permission: "У вас нет разрешения на это действие.",
      range: "Подойдите ближе к бизнесу.",
      slots: "В инвентаре нет свободного слота.",
      stock: "Товар закончился на складе бизнеса.",
      tax: "Бизнес закрыт из-за просроченного налога.",
      target: "Выбранный персонаж не найден.",
      vehicle: "Нужен подходящий автомобиль.",
      vehicle_fuel: "У автомобиля некорректно настроен объём топливного бака.",
      vehicle_engine: "Перед заправкой заглушите двигатель.",
      weight: "В инвентаре недостаточно свободного места.",
    };
    notify(player, "error", messages[reason] || "Не удалось выполнить операцию с бизнесом.");
    if (!reason) console.error(`[BUSINESS] ${label} failed:`, error);
    return { ok: false, reason: reason || "internal" };
  } finally {
    pendingOperations.delete(key);
  }
}

mp.events.add("playerEnterColshape", (player, shape) => {
  const businessId = String(shape?.twinkleBusinessId || "");
  if (!businessId || !BUSINESS_BY_ID.has(businessId) || !authFlow.isPhase(player, authFlow.PHASE.IN_GAME)) return;
  nearbyBusinessByPlayer.set(Number(player.id), businessId);
  const business = BUSINESS_BY_ID.get(businessId);
  call(player, "client:business:nearby", {
    active: true,
    businessId,
    label: business.name,
    type: business.type,
    interaction: "direct",
  });
});

mp.events.add("playerExitColshape", (player, shape) => {
  const businessId = String(shape?.twinkleBusinessId || "");
  if (!businessId || nearbyBusinessByPlayer.get(Number(player.id)) !== businessId) return;
  const session = customerSessions.get(Number(player.id));
  if (session?.businessId === businessId && session.preview) return;
  nearbyBusinessByPlayer.delete(Number(player.id));
  endCustomerSession(player, session);
  call(player, "client:business:nearby", { active: false, businessId });
  call(player, "client:business:close");
});

mp.events.add("server:business:interact", async (player, requestedBusinessId) => {
  await withPending(player, "interact", async () => {
    const businessId = nearbyBusinessByPlayer.get(Number(player.id));
    if (!businessId || businessId !== String(requestedBusinessId || "") || !service.isNearBusiness(player, businessId)) {
      throw service.businessError("range", "Move closer to the business.");
    }
    const payload = await service.getCustomerPayload(player, businessId);
    const previousSession = customerSessions.get(Number(player.id));
    if (previousSession) await endCustomerSession(player, previousSession);
    else await (customerRestorations.get(Number(player.id)) || Promise.resolve());
    if (!isPlayer(player) || !service.isNearBusiness(player, businessId)) {
      throw service.businessError("range", "Move closer to the business.");
    }
    const session = createCustomerSession(player, businessId);
    customerSessions.set(Number(player.id), session);
    armCustomerSessionTimer(player, session);
    movePlayerToPreview(player, session);
    call(player, "client:business:open", withSessionPayload(payload, session));
  });
});

mp.events.add("server:business:buy", async (player, rawPayload) => {
  const payload = parsePayload(rawPayload);
  const requestId = String(payload.requestId || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 64);
  const requestSessionId = String(payload.sessionId || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 64);
  const playerId = Number(player?.id);
  const session = getSession(player);
  let outcome;
  if (!requestId) {
    notify(player, "error", "Некорректный запрос на покупку.");
    outcome = { ok: false, reason: "invalid" };
  } else if (
    !session ||
    session.businessId !== String(payload.businessId || "") ||
    requestSessionId !== String(session.id)
  ) {
    notify(player, "error", "Сессия взаимодействия с бизнесом завершена. Откройте магазин заново.");
    outcome = { ok: false, reason: "range" };
  } else if (session.purchaseRequests.has(requestId)) {
    outcome = await session.purchaseRequests.get(requestId);
  } else if (customerPurchaseByPlayer.has(playerId)) {
    outcome = { ok: false, reason: "pending" };
  } else {
    const purchasePromise = withPending(player, "customer_buy", async () => {
      if (
        customerSessions.get(playerId) !== session ||
        !isCustomerSessionLocationValid(player, session)
      ) {
        throw service.businessError("range", "The business session has expired.");
      }
      const result = await service.purchaseCustomerProduct(
        player,
        session.businessId,
        payload.productId,
        payload.quantity,
        payload.paymentType,
        { customerAccessValidated: true }
      );
      hud.update(player, { player: { finance: { cash: result.cash, bank: result.bank } } });
      try {
        call(
          player,
          "client:business:update",
          withSessionPayload(await service.getCustomerPayload(player, session.businessId), session)
        );
      } catch (error) {
        console.error("[BUSINESS] Purchase committed but customer refresh failed:", error);
      }
      notify(player, "success", formatCustomerPurchaseNotification(result));
      return {
        appearance: service.getCanonicalAppearance(player),
        businessId: session.businessId,
        equipped: result.equipped,
        productId: result.productId,
        sessionId: session.id,
      };
    });
    session.purchaseRequests.set(requestId, purchasePromise);
    while (session.purchaseRequests.size > 32) {
      const oldestRequestId = session.purchaseRequests.keys().next().value;
      if (!oldestRequestId || oldestRequestId === requestId) break;
      session.purchaseRequests.delete(oldestRequestId);
    }
    customerPurchaseByPlayer.set(playerId, purchasePromise);
    outcome = await purchasePromise;
    if (customerPurchaseByPlayer.get(playerId) === purchasePromise) {
      customerPurchaseByPlayer.delete(playerId);
    }
  }
  if (requestId && isPlayer(player)) {
    call(player, "client:business:purchaseResult", {
      requestId,
      success: Boolean(outcome?.ok),
      reason: outcome?.ok ? "" : String(outcome?.reason || "failed"),
      appearance: outcome?.ok ? outcome.value?.appearance : null,
      businessId: outcome?.ok
        ? String(outcome.value?.businessId || "").slice(0, 64)
        : String(payload.businessId || "").slice(0, 64),
      equipped: outcome?.ok && typeof outcome.value?.equipped === "boolean" ? outcome.value.equipped : undefined,
      productId: outcome?.ok
        ? String(outcome.value?.productId || "").slice(0, 64)
        : String(payload.productId || "").slice(0, 64),
      sessionId: outcome?.ok ? String(outcome.value?.sessionId || "").slice(0, 64) : requestSessionId,
    });
  }
});

mp.events.add("server:business:close", (player, rawSessionId) => {
  const sessionId = String(rawSessionId || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 64);
  const session = customerSessions.get(Number(player?.id));
  if (!sessionId || !session || sessionId !== String(session.id)) return;
  endCustomerSession(player, session);
});

mp.events.add("server:business:tablet:request", async (player) => {
  const playerId = Number(player?.id);
  const now = Date.now();
  if (now - Number(lastTabletRequestByPlayer.get(playerId) || 0) < 1500) return;
  lastTabletRequestByPlayer.set(playerId, now);
  await withPending(player, "tablet_request", () => refreshTablet(player));
});

mp.events.add("server:business:tablet:balance", async (player, rawPayload) => {
  await withPending(player, "tablet_balance", async () => {
    const payload = parsePayload(rawPayload);
    const result = await service.changeBalance(player, payload.businessId, payload.action, payload.amount, payload.balanceType);
    hud.update(player, { player: { finance: { cash: result.cash, bank: result.bank } } });
    await refreshTabletAfterMutation(player, "tablet_balance");
    const destination = payload.balanceType === "card" ? "банковская карта" : "наличные";
    const action = payload.action === "deposit" ? "внесено на баланс бизнеса" : "выведено с баланса бизнеса";
    notify(player, "success", `$${Math.floor(Number(payload.amount || 0)).toLocaleString("ru-RU")} ${action} (${destination}).`);
  });
});

mp.events.add("server:business:tablet:toggle", async (player, rawPayload) => {
  await withPending(player, "tablet_toggle", async () => {
    const payload = parsePayload(rawPayload);
    if (typeof payload.open !== "boolean") throw service.businessError("invalid", "Invalid business state.");
    await service.toggleOpen(player, payload.businessId, payload.open);
    await refreshTabletAfterMutation(player, "tablet_toggle");
    notify(player, "success", payload.open === true ? "Бизнес открыт." : "Бизнес закрыт.");
  });
});

mp.events.add("server:business:tablet:supply", async (player, rawPayload) => {
  await withPending(player, "tablet_supply", async () => {
    const payload = parsePayload(rawPayload);
    await service.orderSupply(player, payload.businessId, payload.stockKey, payload.quantity, payload.balanceType);
    await refreshTabletAfterMutation(player, "tablet_supply");
    notify(player, "success", "Поставка оплачена и добавлена в очередь доставки.");
  });
});

mp.events.add("server:business:tablet:price", async (player, rawPayload) => {
  await withPending(player, "tablet_price", async () => {
    const payload = parsePayload(rawPayload);
    await service.updateProductPrice(player, payload.businessId, payload.productId, payload.price);
    await refreshTabletAfterMutation(player, "tablet_price");
    notify(player, "success", "Цена товара обновлена.");
  });
});

mp.events.add("server:business:tablet:tax", async (player, rawPayload) => {
  await withPending(player, "tablet_tax", async () => {
    const payload = parsePayload(rawPayload);
    await service.payTax(player, payload.businessId, payload.days, payload.balanceType);
    await refreshTabletAfterMutation(player, "tablet_tax");
    notify(player, "success", `Налог бизнеса оплачен на ${Math.floor(Number(payload.days || 0))} дн.`);
  });
});

mp.events.add("server:business:tablet:listSale", async (player, rawPayload) => {
  await withPending(player, "tablet_list_sale", async () => {
    const payload = parsePayload(rawPayload);
    await service.setSaleListing(player, payload.businessId, payload.price);
    await refreshTabletAfterMutation(player, "tablet_list_sale");
    notify(player, "success", Number(payload.price || 0) > 0 ? "Бизнес выставлен на продажу." : "Объявление о продаже бизнеса снято.");
  });
});

mp.events.add("server:business:tablet:sellState", async (player, rawPayload) => {
  await withPending(player, "tablet_sell_state", async () => {
    const payload = parsePayload(rawPayload);
    const result = await service.sellBusinessToState(player, payload.businessId);
    hud.update(player, { player: { finance: { cash: result.cash, bank: result.bank } } });
    notify(player, "success", `Бизнес продан государству за $${result.payout.toLocaleString("ru-RU")}.`);
    await refreshTabletAfterMutation(player, "tablet_sell_state");
  });
});

mp.events.add("server:business:marketplace:buy", async (player, rawPayload) => {
  await withPending(player, "marketplace_buy", async () => {
    const payload = parsePayload(rawPayload);
    const result = await service.purchaseMarketplaceBusiness(player, payload.listingId, payload.paymentType);
    hud.update(player, { player: { finance: { cash: result.cash, bank: result.bank } } });
    const seller = findOnlineCharacter(result.sellerUuid);
    if (seller) {
      if (seller.character) seller.character.bank = result.sellerBank;
      if (seller.characterData) seller.characterData.bank = result.sellerBank;
      try { seller.setVariable("bank", result.sellerBank); } catch {}
      hud.update(seller, { player: { finance: { cash: Number(seller?.character?.cash || 0), bank: result.sellerBank } } });
      notify(seller, "success", "Ваш бизнес продан. Оплата зачислена на банковский счёт.");
      await refreshTabletAfterMutation(seller, "marketplace_sale_seller");
    }
    notify(player, "success", "Бизнес куплен через маркетплейс.");
    await refreshTabletAfterMutation(player, "marketplace_purchase_buyer");
  });
});

mp.events.add("server:business:tablet:employeeUpsert", async (player, rawPayload) => {
  await withPending(player, "tablet_employee_upsert", async () => {
    const payload = parsePayload(rawPayload);
    await service.upsertEmployee(player, payload.businessId, payload.characterUuid, payload.permissions);
    await refreshTabletAfterMutation(player, "tablet_employee_upsert");
    notify(player, "success", "Разрешения сотрудника сохранены.");
  });
});

mp.events.add("server:business:tablet:employeeRemove", async (player, rawPayload) => {
  await withPending(player, "tablet_employee_remove", async () => {
    const payload = parsePayload(rawPayload);
    await service.removeEmployee(player, payload.businessId, payload.characterUuid);
    await refreshTabletAfterMutation(player, "tablet_employee_remove");
    notify(player, "success", "Сотрудник удалён из бизнеса.");
  });
});

mp.events.add("twinkle:character:loaded", (player) => {
  service.syncAppearance(player).catch((error) => console.error("[BUSINESS] Appearance sync failed:", error));
  if (authFlow.isPhase(player, authFlow.PHASE.IN_GAME)) {
    refreshTablet(player).catch((error) => console.error("[BUSINESS] Tablet bootstrap failed:", error));
  }
});

function cleanupPlayer(player) {
  const playerId = Number(player?.id);
  const session = customerSessions.get(playerId);
  nearbyBusinessByPlayer.delete(Number(player?.id));
  if (session) endCustomerSession(player, session);
  else restoreCustomerAppearance(player);
  lastTabletRequestByPlayer.delete(Number(player?.id));
  tabletRefreshChains.delete(Number(player?.id));
  for (const key of Array.from(pendingOperations)) {
    if (key.startsWith(`${Number(player?.id)}:`)) pendingOperations.delete(key);
  }
  customerPurchaseByPlayer.delete(Number(player?.id));
  call(player, "client:business:close");
}

mp.events.add("playerDeath", cleanupPlayer);
mp.events.add("playerQuit", cleanupPlayer);

mp.events.addCommand("setbusinessowner", async (player, _fullText, businessIdArg, uuidArg) => {
  if (getAdminLevel(player) < 7) return notify(player, "error", "Требуется 7-й уровень администратора.");
  const businessId = String(businessIdArg || "").trim();
  const targetUuid = Number(uuidArg);
  if (!BUSINESS_BY_ID.has(businessId) || !Number.isSafeInteger(targetUuid) || targetUuid < 0) {
    return notify(player, "info", "Использование: /setbusinessowner [ID бизнеса] [UUID персонажа или 0]");
  }
  await withPending(player, "admin_owner", async () => {
    await service.repository.ensureSchema();
    await require("../../database/query.js").withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        let ownerName = "";
        if (targetUuid > 0) {
          const [rows] = await connection.query("SELECT name FROM characters WHERE uuid = ? LIMIT 1", [targetUuid]);
          if (!rows?.[0]) throw service.businessError("target", "Character not found.");
          ownerName = String(rows[0].name || `Персонаж ${targetUuid}`).slice(0, 128);
        }
        await connection.query(
          "UPDATE twinkle_businesses SET owner_uuid = ?, owner_name = ?, tax_paid_until = ?, revision = revision + 1 WHERE id = ?",
          [
            targetUuid > 0 ? targetUuid : null,
            ownerName,
            targetUuid > 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
            businessId,
          ]
        );
        await connection.query("DELETE FROM twinkle_business_employees WHERE business_id = ?", [businessId]);
        await connection.commit();
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });
    notify(player, "success", targetUuid > 0 ? "Владелец бизнеса обновлён." : "Бизнес возвращён государству.");
  });
});

service.repository.ensureSchema()
  .then(() => {
    if (runtimeStopped) return;
    BUSINESSES.forEach(createWorldBusiness);
    console.log(`[BUSINESS] Loaded ${BUSINESSES.length} businesses.`);
    supplyTimer = setInterval(() => {
      service.fulfillDueSupplies().catch((error) => console.error("[BUSINESS] Supply fulfillment failed:", error));
    }, 60000);
    supplyTimer.unref?.();
  })
  .catch((error) => console.error("[BUSINESS] Schema initialization failed:", error));

try { mp.events.add("serverShutdown", stopBusinessRuntime); } catch {}

module.exports = {
  customerSessions,
  nearbyBusinessByPlayer,
  refreshTablet,
  stopBusinessRuntime,
  worldEntities,
  permissions: PERMISSIONS,
};
