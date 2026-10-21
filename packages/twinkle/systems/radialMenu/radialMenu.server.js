"use strict";

const authFlow = require("../../auth/authFlow.js");
const db = require("../../database");
const chat = require("../chat/chat.service.js");
const documents = require("../documents/document.service.js");
const inventory = require("../inventory/inventory.service.js");
const licenses = require("../licenses/license.service.js");
const { getLicenseDocumentItemId } = require("../documents/document.items.js");
const radialMenuRegistry = require("./radialMenu.registry.js");
const vehicleEngine = require("../vehicle/vehicle.engine.js");
const vehicleOwner = require("../vehicle/vehicle.owner.js");

const PLAYER_RANGE = 3.2;
const VEHICLE_RANGE = 5;
const TRANSFER_AMOUNT = 1000;
const RADIAL_REQUEST_COOLDOWN_MS = 600;
const RADIAL_SELECT_COOLDOWN_MS = 300;
const RADIAL_CALL_PAYLOAD_BUDGET_BYTES = 7000;
const RADIAL_TARGET_CONTRACT_VERSION = 1;
const RADIAL_TARGET_SESSION_TTL_MS = 20000;
const VEHICLE_DOOR_STATE_KEY = "twinkleRadialDoorStates";
const VEHICLE_DOOR_MIN_INDEX = 0;
const VEHICLE_DOOR_MAX_INDEX = 5;
const radialOperations = new WeakMap();
const radialTargetSessions = new WeakMap();
const vehicleDoorStates = new WeakMap();
let lastLicenseUnavailableLogAt = 0;
const RADIAL_LICENSE_ACTIONS = {
  "docs:transport:a": "vehicle_a",
  "docs:transport:b": "vehicle_b",
  "docs:transport:c": "vehicle_c",
  "docs:permits:fishing": "fishing",
  "docs:permits:hunting": "hunting",
};

function getCharacter(player) {
  return player?.character || player?.characterData || {};
}

function getCharacterName(player) {
  const character = getCharacter(player);
  const firstName = character.username || character.firstname || character.firstName || "";
  const lastName = character.lastname || character.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || String(player?.name || `Player #${player?.id ?? "?"}`).replace("_", " ");
}

function getCharacterUuid(player) {
  const character = getCharacter(player);

  return Number(
    player?.uuid ||
    player?.characterId ||
    player?.characterUuid ||
    character.uuid ||
    player?.getVariable?.("uuid") ||
    0
  );
}

function getCash(player) {
  const character = getCharacter(player);

  return Number(character.cash || player?.cash || player?.money || 0);
}

function setCash(player, value) {
  const cash = Math.max(0, Number(value || 0));

  if (player.character) {
    player.character.cash = cash;
  }

  if (player.characterData) {
    player.characterData.cash = cash;
  }

  player.cash = cash;
  player.money = cash;

  try {
    player.setVariable("cash", cash);
  } catch {}
}

function isCharacterReady(player) {
  return Boolean(
    player &&
    mp.players.exists(player) &&
    player.auth &&
    getCharacterUuid(player) > 0 &&
    authFlow.isPhase(player, authFlow.PHASE.IN_GAME)
  );
}

function beginRadialOperation(player, operation, cooldownMs) {
  if (!isCharacterReady(player)) return null;

  const now = Date.now();
  const state = radialOperations.get(player) || {
    requestAt: 0,
    requestPending: false,
    selectAt: 0,
    selectPending: false,
  };
  const pendingKey = `${operation}Pending`;
  const timeKey = `${operation}At`;

  if (state[pendingKey] || now - state[timeKey] < cooldownMs) return null;

  state[pendingKey] = true;
  state[timeKey] = now;
  radialOperations.set(player, state);

  return () => {
    state[pendingKey] = false;
  };
}

function callLivePlayer(player, eventName, args = []) {
  if (!player || !mp.players.exists(player)) return false;

  try {
    player.call(eventName, args);
    return true;
  } catch {
    return false;
  }
}

function getDistance(a, b) {
  if (!a || !b) return 999999;

  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dy = Number(a.y || 0) - Number(b.y || 0);
  const dz = Number(a.z || 0) - Number(b.z || 0);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function createSelfTarget(player) {
  return { kind: "self", id: Number(player?.id ?? -1), entity: player };
}

function normalizeTargetDescriptor(rawPayload) {
  const payload = parsePayload(rawPayload);
  const target = payload?.target;

  if (Number(payload?.contractVersion) !== RADIAL_TARGET_CONTRACT_VERSION || !target) return null;

  const kind = String(target.kind || "").toLowerCase();
  const id = Number(target.remoteId);
  if (!Number.isSafeInteger(id) || id < 0 || id > 1000000000) return null;
  if (kind !== "player" && kind !== "vehicle") return null;

  return { kind, id };
}

function resolveTargetDescriptor(player, descriptor) {
  if (!player || !mp.players.exists(player)) return null;
  if (!descriptor || descriptor.kind === "self") return createSelfTarget(player);

  const pool = descriptor.kind === "player" ? mp.players : mp.vehicles;
  const entity = pool.at(Number(descriptor.id));
  if (!entity || !pool.exists(entity)) return null;
  if (descriptor.kind === "player" && (entity === player || !isCharacterReady(entity))) return null;
  if (Number(entity.dimension || 0) !== Number(player.dimension || 0)) return null;

  const range = descriptor.kind === "player" ? PLAYER_RANGE : VEHICLE_RANGE;
  if (getDistance(player.position, entity.position) > range) return null;

  return { kind: descriptor.kind, id: Number(entity.id), entity };
}

function resolveRequestedTarget(player, rawPayload) {
  return resolveTargetDescriptor(player, normalizeTargetDescriptor(rawPayload)) || createSelfTarget(player);
}

function rememberRadialTarget(player, target) {
  radialTargetSessions.set(player, {
    expiresAt: Date.now() + RADIAL_TARGET_SESSION_TTL_MS,
    target: { kind: target.kind, id: target.kind === "self" ? null : Number(target.id) },
  });
}

function getRememberedRadialTarget(player) {
  const session = radialTargetSessions.get(player);
  if (!session || session.expiresAt < Date.now()) {
    radialTargetSessions.delete(player);
    throw new Error("Радиальное меню устарело. Откройте его заново.");
  }

  const target = resolveTargetDescriptor(player, session.target);
  if (!target) {
    radialTargetSessions.delete(player);
    throw new Error("Выбранная цель больше недоступна.");
  }

  return { session, target };
}

function getVehicleContext(player, targetVehicle = null) {
  const vehicle = targetVehicle && mp.vehicles.exists(targetVehicle) ? targetVehicle : null;

  const inVehicle = Boolean(vehicle && player?.vehicle === vehicle && mp.vehicles.exists(player.vehicle));
  const isDriver = inVehicle && Number(player.seat) === 0;
  const canControl = Boolean(vehicle && vehicleOwner.canControlVehicle(player, vehicle));
  const vehicleLocked = vehicle ? vehicleEngine.getVehicleLocked(vehicle) : false;
  const engineOn = vehicle ? vehicleEngine.getVehicleEngine(vehicle) : false;
  const engineHealth = Number(vehicle?.engineHealth || 1000);

  return {
    canControl,
    engineHealth,
    engineOn,
    inVehicle,
    isDriver,
    vehicle,
    vehicleLocked,
  };
}

function requireVehicle(player, target) {
  const vehicle = target?.kind === "vehicle" ? target.entity : null;
  const context = getVehicleContext(player, vehicle);

  if (!context.vehicle || !mp.vehicles.exists(context.vehicle)) {
    throw new Error("Рядом нет транспорта.");
  }

  return context;
}

function hasCrimeAccess(player) {
  const character = getCharacter(player);

  return Boolean(
    player?.adminLevel >= 1 ||
    player?.fractionId ||
    character.fraction_id ||
    character.organizationId ||
    player?.getVariable?.("fractionId")
  );
}

function hasProperty(player, keys) {
  const character = getCharacter(player);

  return keys.some((key) => Boolean(character[key] || player?.[key] || player?.getVariable?.(key)));
}

function action(id, label, icon, options = {}) {
  const item = { id, label, icon };

  if (options.shortLabel) item.shortLabel = options.shortLabel;
  if (options.closeOnSelect === false) item.closeOnSelect = false;
  if (options.description) item.description = options.description;
  if (options.disabled) item.disabled = true;
  if (options.disabledReason) item.disabledReason = options.disabledReason;
  if (Array.isArray(options.children)) item.children = options.children;
  if (options.payload !== undefined) item.payload = options.payload;

  return item;
}

function disabledReason(condition, reason) {
  return condition ? "" : reason;
}

function buildVehicleGroup(context) {
  const { canControl, engineOn, inVehicle, isDriver, vehicle, vehicleLocked } = context;
  const hasVehicle = Boolean(vehicle);
  const items = [];

  if (hasVehicle && (!vehicleLocked || canControl)) {
    items.push(
      action("vehicle:door:toggle", "Дверь", "door-open", {
        description: "Открыть или закрыть выбранную дверь.",
      }),
      action("vehicle:trunk:toggle", "Багажник", "package-open", {
        description: "Открыть или закрыть багажник.",
      })
    );
  }
  if (hasVehicle && canControl) {
    items.push(action(
      "vehicle:lock:toggle",
      vehicleLocked ? "Открыть" : "Закрыть",
      vehicleLocked ? "lock-open" : "key",
      { description: "Открыть или закрыть выбранный транспорт." }
    ));
  }
  if (inVehicle && isDriver && canControl) {
    items.push(action(
      "vehicle:engine:toggle",
      engineOn ? "Заглушить" : "Завести",
      "circle-power",
      { description: "Запустить или заглушить двигатель." }
    ));
  }
  if (inVehicle && (!vehicleLocked || canControl)) {
    items.push(
      action("vehicle:seat:0", "Место 1", "armchair", {
        description: "Пересесть на водительское место.",
        payload: { seat: 0 },
      }),
      action("vehicle:seat:1", "Место 2", "armchair", {
        description: "Пересесть на переднее пассажирское место.",
        payload: { seat: 1 },
      })
    );
  }

  return {
    id: "vehicle",
    label: "Авто",
    icon: "car",
    items,
  };
}

function buildInspectionGroup(context) {
  const hasVehicle = Boolean(context.vehicle);
  const noVehicleReason = "Рядом нет транспорта.";

  return {
    id: "inspection",
    label: "Осмотр",
    icon: "scan-search",
    disabled: !hasVehicle,
    disabledReason: disabledReason(hasVehicle, noVehicleReason),
    items: [
      action("vehicle:hood:inspect", "Капот", "scan-search", {
        description: "Осмотреть капот.",
        disabled: !hasVehicle,
        disabledReason: noVehicleReason,
      }),
      action("vehicle:docs", "Документы", "file-text", {
        description: "Открыть документы транспорта.",
        disabled: !hasVehicle,
        disabledReason: noVehicleReason,
      }),
    ],
  };
}

function buildPlayerGroup(player, targetPlayer) {
  const hasTarget = Boolean(targetPlayer);
  const cash = getCash(player);
  const items = [];

  if (hasTarget && cash >= TRANSFER_AMOUNT) {
    items.push(action("player:cash:1000", "$ 1000", "hand-coins", {
      description: "Передать выбранному игроку 1000 наличными.",
    }));
  }
  if (hasTarget) {
    items.push(
      action("player:greet", "Привет", "handshake", {
        description: "Предложить выбранному игроку поздороваться.",
      }),
      action("player:search", "Обыскать", "scan-search", {
        description: "Начать осмотр выбранного игрока.",
      }),
      action("player:escort", "Конвой", "footprints", {
        description: "Взять выбранного игрока в конвой.",
      })
    );
  }

  return {
    id: "player",
    label: "Игрок",
    icon: "user",
    items,
  };
}

async function buildDocumentsGroup(player) {
  let licenseServiceAvailable = true;
  let ownedDocumentItemIds = new Set();
  const licenseIds = ["vehicle_a", "vehicle_b", "vehicle_c", "fishing", "hunting"];

  try {
    await licenses.loadPlayerLicenses(player);
    const inventoryItems = await inventory.getItemsById(
      player,
      licenseIds.map(getLicenseDocumentItemId)
    );
    ownedDocumentItemIds = new Set(
      inventoryItems
        .filter((item) => item?.bound === true && Number(item.ownerStaticId || 0) === getCharacterUuid(player))
        .map((item) => String(item.itemId || item.id || ""))
    );
  } catch (error) {
    licenseServiceAvailable = false;
    if (Date.now() - lastLicenseUnavailableLogAt > 30000) {
      lastLicenseUnavailableLogAt = Date.now();
      console.error("[RADIAL MENU] Licence data unavailable; licence actions are disabled:", error);
    }
  }

  const getLicenseState = (licenseId) => {
    if (!licenseServiceAvailable) {
      return { available: false, disabledReason: "Сервис лицензий временно недоступен." };
    }
    const state = licenses.getLicenseRadialState(player, licenseId);
    return {
      ...state,
      available: state.available && ownedDocumentItemIds.has(getLicenseDocumentItemId(licenseId)),
    };
  };
  const vehicleALicense = getLicenseState("vehicle_a");
  const vehicleBLicense = getLicenseState("vehicle_b");
  const vehicleCLicense = getLicenseState("vehicle_c");
  const fishingLicense = getLicenseState("fishing");
  const huntingLicense = getLicenseState("hunting");
  const transportLicenses = [
    ["docs:transport:a", "Лицензия категории А", "bike", "Кат. A", vehicleALicense],
    ["docs:transport:b", "Лицензия категории B", "car-front", "Кат. B", vehicleBLicense],
    ["docs:transport:c", "Лицензия категории C", "truck", "Кат. C", vehicleCLicense],
  ].filter((entry) => entry[4].available).map(([id, label, icon, shortLabel]) => (
    action(id, label, icon, { shortLabel })
  ));
  const permitLicenses = [
    ["docs:permits:fishing", "Рыболовство", "fish", "Рыболовство", fishingLicense],
    ["docs:permits:hunting", "Охота", "crosshair", "Охота", huntingLicense],
  ].filter((entry) => entry[4].available).map(([id, label, icon, shortLabel]) => (
    action(id, label, icon, { shortLabel })
  ));
  const items = [];

  if (transportLicenses.length) {
    items.push(action("docs:transport", "Транспорт", "car-front", {
      closeOnSelect: false,
      children: transportLicenses,
    }));
  }
  if (permitLicenses.length) {
    items.push(action("docs:permits", "Разрешения", "shield-check", {
      closeOnSelect: false,
      children: permitLicenses,
    }));
  }

  return {
    id: "documents",
    label: "Документы",
    icon: "id-card",
    items,
  };
}

function buildPropertyGroup(player, nearestPlayer) {
  const hasTarget = Boolean(nearestPlayer);
  const hasHouse = hasProperty(player, ["house", "houseId", "activeHouseId"]);
  const hasApartment = hasProperty(player, ["apartment", "apartmentId", "activeApartmentId"]);
  const hasBusiness = hasProperty(player, ["business", "businessId"]);
  const items = [];

  if (hasTarget && hasHouse) {
    items.push(
      action("property:house:register", "Дом", "house", {
        description: "Предложить прописку в доме выбранному игроку.",
      }),
      action("property:house:sell", "Продать дом", "house", {
        description: "Предложить выбранному игроку купить дом.",
      })
    );
  }
  if (hasTarget && hasApartment) {
    items.push(
      action("property:apartment:register", "Квартира", "building", {
        description: "Предложить прописку в квартире выбранному игроку.",
      }),
      action("property:apartment:sell", "Продать кв.", "building", {
        description: "Предложить выбранному игроку купить квартиру.",
      })
    );
  }
  if (hasTarget && hasBusiness) {
    items.push(action("property:business:sell", "Бизнес", "briefcase", {
      description: "Предложить выбранному игроку купить бизнес.",
    }));
  }

  return {
    id: "property",
    label: "Имущество",
    icon: "house",
    items,
  };
}

function buildCrimeGroup(player, targetPlayer) {
  const hasTarget = Boolean(targetPlayer);
  const crimeAccess = hasCrimeAccess(player);
  const items = [];

  if (crimeAccess && hasTarget) {
    items.push(
      action("crime:invite", "Группировка", "shield", { description: "Пригласить выбранного игрока в группировку." }),
      action("crime:rob", "Ограбить", "wallet", { description: "Начать ограбление выбранного игрока." }),
      action("crime:ties", "Стяжки", "badge", { description: "Надеть стяжки на выбранного игрока." }),
      action("crime:escort", "Конвой", "footprints", { description: "Взять выбранного игрока в конвой." }),
      action("crime:hostage", "Заложник", "user", { description: "Сделать выбранного игрока заложником." }),
      action("crime:bag", "Мешок", "package-open", { description: "Надеть или снять мешок." })
    );
  }

  return {
    id: "crime",
    label: "Крайм",
    icon: "venetian-mask",
    items,
  };
}

function buildAnimationsGroup(player) {
  const canAnimate = !player.vehicle;

  return {
    id: "animations",
    label: "Анимации",
    icon: "drama",
    items: [
      action("animation:greet", "Привет", "handshake", {
        description: "Поздороваться с окружающими.",
        disabled: !canAnimate,
        disabledReason: "В транспорте анимации недоступны.",
      }),
      action("animation:stop", "Стоп", "hand", {
        description: "Остановить текущую анимацию.",
        disabled: !canAnimate,
        disabledReason: "В транспорте анимации недоступны.",
      }),
    ],
  };
}

async function buildRadialMenuPayload(player, target = createSelfTarget(player)) {
  const targetPlayer = target.kind === "player" ? target.entity : null;
  const targetVehicle = target.kind === "vehicle" ? target.entity : null;
  const vehicleContext = getVehicleContext(player, targetVehicle);
  let baseGroups;

  if (target.kind === "vehicle") {
    baseGroups = [buildVehicleGroup(vehicleContext), buildInspectionGroup(vehicleContext)];
  } else if (target.kind === "player") {
    baseGroups = [
      buildPlayerGroup(player, targetPlayer),
      await buildDocumentsGroup(player),
      buildPropertyGroup(player, targetPlayer),
      buildCrimeGroup(player, targetPlayer),
    ];
  } else {
    baseGroups = [await buildDocumentsGroup(player), buildAnimationsGroup(player)];
  }

  const extension = await radialMenuRegistry.extendGroups(player, baseGroups, {
    nearestPlayer: targetPlayer,
    target,
    vehicleContext,
  });
  const groups = extension.groups;
  const activeGroup = groups.find((group) => !group.disabled) || groups[0];
  const targetLabel = target.kind === "player"
    ? getCharacterName(target.entity).slice(0, 64)
    : (target.kind === "vehicle" ? `Транспорт #${target.id}` : "Личные действия");

  return {
    contractVersion: extension.contractVersion,
    activeGroupId: activeGroup?.id,
    groups,
    hint: "Нажмите, чтобы закрыть",
    revision: extension.revision,
    target: {
      id: target.kind === "self" ? null : target.id,
      kind: target.kind,
      label: targetLabel,
    },
    title: target.kind === "player"
      ? `Игрок: ${targetLabel}`
      : (target.kind === "vehicle" ? "Взаимодействие с транспортом" : "Личные действия"),
  };
}

function serializeRadialMenuPayload(payload) {
  let serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") <= RADIAL_CALL_PAYLOAD_BUDGET_BYTES) return serialized;

  serialized = JSON.stringify(payload, (key, value) => key === "description" ? undefined : value);
  if (Buffer.byteLength(serialized, "utf8") <= RADIAL_CALL_PAYLOAD_BUDGET_BYTES) return serialized;

  serialized = JSON.stringify(payload, (key, value) => (
    key === "description" || key === "shortLabel" ? undefined : value
  ));
  if (Buffer.byteLength(serialized, "utf8") <= RADIAL_CALL_PAYLOAD_BUDGET_BYTES) return serialized;

  serialized = JSON.stringify(payload, (key, value) => {
    if (key === "description" || key === "shortLabel" || key === "payload") return undefined;
    if (key === "disabledReason" && value) return "Недоступно.";
    return value;
  });
  if (Buffer.byteLength(serialized, "utf8") <= RADIAL_CALL_PAYLOAD_BUDGET_BYTES) return serialized;

  throw new Error("Конфигурация радиального меню превышает допустимый размер.");
}

async function openRadialMenu(player, rawTargetPayload = "{}") {
  if (!isCharacterReady(player)) {
    throw new Error("Персонаж не авторизован.");
  }

  let target = resolveRequestedTarget(player, rawTargetPayload);
  let payload = await buildRadialMenuPayload(player, target);
  const confirmedTarget = resolveTargetDescriptor(player, {
    kind: target.kind,
    id: target.kind === "self" ? null : target.id,
  });

  if (!confirmedTarget && target.kind !== "self") {
    target = createSelfTarget(player);
    payload = await buildRadialMenuPayload(player, target);
  } else if (confirmedTarget) {
    target = confirmedTarget;
  }

  const serializedPayload = serializeRadialMenuPayload(payload);

  rememberRadialTarget(player, target);
  const delivered = callLivePlayer(player, "c:radialMenu:open", [
    serializedPayload,
  ]);
  if (!delivered) radialTargetSessions.delete(player);
}

function getActionId(rawPayload) {
  const payload = parsePayload(rawPayload);

  return String(payload.actionId || payload.action?.id || "");
}

function parsePayload(rawPayload) {
  try {
    if (!rawPayload) return {};
    if (typeof rawPayload === "object") return rawPayload;
    return JSON.parse(rawPayload);
  } catch {
    return {};
  }
}

function findActionById(items, actionId) {
  for (const item of items || []) {
    if (item.id === actionId) {
      return item;
    }

    const child = findActionById(item.children, actionId);

    if (child) {
      return child;
    }
  }

  return null;
}

async function ensureActionEnabled(player, actionId, target) {
  const payload = await buildRadialMenuPayload(player, target);

  for (const group of payload.groups) {
    const actionItem = findActionById(group.items, actionId);

    if (!actionItem) continue;

    if (group.hidden) {
      throw new Error("Раздел недоступен.");
    }

    if (group.disabled) {
      throw new Error(group.disabledReason || "Раздел недоступен.");
    }

    if (actionItem.hidden) {
      throw new Error("Действие недоступно.");
    }

    if (actionItem.disabled) {
      throw new Error(actionItem.disabledReason || "Действие недоступно.");
    }

    return actionItem;
  }

  throw new Error("Действие не найдено.");
}

function getSeatFromAction(actionId) {
  const match = String(actionId).match(/^vehicle:seat:(\d+)$/);

  return match ? Number(match[1]) : null;
}

function getVehicleSeatOccupant(vehicle, seat) {
  try {
    if (typeof vehicle.getOccupant === "function") {
      return vehicle.getOccupant(seat);
    }
  } catch {}

  return null;
}

function putPlayerIntoSeat(player, seat, target) {
  const context = requireVehicle(player, target);
  const vehicle = context.vehicle;

  if (!context.inVehicle || !vehicle || !mp.vehicles.exists(vehicle)) {
    throw new Error("Сначала сядьте в транспорт.");
  }

  if (context.vehicleLocked && !context.canControl) {
    throw new Error("Транспорт закрыт.");
  }

  const occupant = getVehicleSeatOccupant(vehicle, seat);

  if (occupant && occupant !== player) {
    throw new Error("Место занято.");
  }

  try {
    player.putIntoVehicle(vehicle, seat);
  } catch (err) {
    throw new Error("Не удалось посадить игрока в транспорт.");
  }
}

async function transferCash(player, radialTarget) {
  const target = radialTarget?.kind === "player" ? radialTarget.entity : null;
  if (!target || !mp.players.exists(target)) throw new Error("Выбранный игрок больше недоступен.");

  const fromUuid = getCharacterUuid(player);
  const targetUuid = getCharacterUuid(target);
  if (!fromUuid || !targetUuid) {
    throw new Error("Не найден UUID персонажа.");
  }
  if (fromUuid === targetUuid) throw new Error("Нельзя передать деньги самому себе.");

  let payerBalance = 0;
  let targetBalance = 0;
  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const orderedIds = [fromUuid, targetUuid].sort((left, right) => left - right);
      const [rows] = await connection.query(
        "SELECT uuid, cash FROM characters WHERE uuid IN (?, ?) ORDER BY uuid FOR UPDATE",
        orderedIds
      );
      const balances = new Map((rows || []).map((row) => [Number(row.uuid), Number(row.cash || 0)]));
      if (!balances.has(fromUuid) || !balances.has(targetUuid)) {
        throw new Error("Персонаж не найден.");
      }
      if (Number(balances.get(fromUuid)) < TRANSFER_AMOUNT) {
        throw new Error("Недостаточно наличных.");
      }

      const [debit] = await connection.query(
        "UPDATE characters SET cash = cash - ? WHERE uuid = ? AND cash >= ?",
        [TRANSFER_AMOUNT, fromUuid, TRANSFER_AMOUNT]
      );
      if (Number(debit?.affectedRows || 0) !== 1) {
        throw new Error("Недостаточно наличных.");
      }
      await connection.query(
        "UPDATE characters SET cash = cash + ? WHERE uuid = ?",
        [TRANSFER_AMOUNT, targetUuid]
      );
      payerBalance = Number(balances.get(fromUuid)) - TRANSFER_AMOUNT;
      targetBalance = Number(balances.get(targetUuid)) + TRANSFER_AMOUNT;
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });

  setCash(player, payerBalance);
  setCash(target, targetBalance);

  chat.sendSuccess(player, `Вы передали ${getCharacterName(target)} $${TRANSFER_AMOUNT}.`);
  chat.sendInfo(target, `${getCharacterName(player)} передал вам $${TRANSFER_AMOUNT}.`);
}

function toggleVehicleDoor(player, target, doorIndex = 0) {
  const context = requireVehicle(player, target);
  const vehicle = context.vehicle;

  if (!vehicle || !mp.vehicles.exists(vehicle)) {
    throw new Error("Рядом нет транспорта.");
  }
  if (context.vehicleLocked && !context.canControl) throw new Error("Транспорт закрыт.");

  const normalizedDoorIndex = Number(doorIndex);
  if (!Number.isInteger(normalizedDoorIndex)
    || normalizedDoorIndex < VEHICLE_DOOR_MIN_INDEX
    || normalizedDoorIndex > VEHICLE_DOOR_MAX_INDEX) {
    throw new Error("Некорректная дверь транспорта.");
  }

  const previousStates = vehicleDoorStates.get(vehicle) || new Map();
  const nextStates = new Map(previousStates);
  const opened = !Boolean(nextStates.get(normalizedDoorIndex));
  nextStates.set(normalizedDoorIndex, opened);

  const serializedState = JSON.stringify({
    version: 1,
    states: Object.fromEntries(nextStates),
  });
  vehicle.setVariable(VEHICLE_DOOR_STATE_KEY, serializedState);
  vehicleDoorStates.set(vehicle, nextStates);

  chat.sendInfo(player, opened ? "Дверь транспорта открыта." : "Дверь транспорта закрыта.");
}

function toggleVehicleTrunk(player, target) {
  toggleVehicleDoor(player, target, 5);
}

function showVehicleInfo(player, target) {
  const context = requireVehicle(player, target);
  const vehicle = context.vehicle;
  const engine = context.engineOn ? "заведен" : "заглушен";
  const locked = context.vehicleLocked ? "закрыт" : "открыт";
  const health = Math.round(Number(vehicle.engineHealth || 1000));

  chat.sendInfo(player, `Транспорт: двигатель ${engine}, замок ${locked}, состояние ${health}/1000.`);
}

function sendTargetNotice(player, radialTarget, actionItem, targetMessage, selfMessage) {
  const target = radialTarget?.kind === "player" ? radialTarget.entity : null;
  if (!target || !mp.players.exists(target)) throw new Error("Выбранный игрок больше недоступен.");
  const label = actionItem?.label || "Действие";

  chat.sendSuccess(player, selfMessage || `Вы выполнили действие: ${label}.`);
  chat.sendInfo(target, targetMessage || `${getCharacterName(player)} выполнил действие: ${label}.`);
}

function sendLocalAction(player, message) {
  chat.sendLocal(player, message, "#d98cff", PLAYER_RANGE);
}

function toggleVehicleLock(player, target) {
  const context = requireVehicle(player, target);
  if (!context.canControl) throw new Error("Нет доступа к транспорту.");
  if (context.inVehicle && !context.isDriver) throw new Error("Закрывать транспорт может только водитель.");

  const locked = vehicleEngine.setVehicleLocked(context.vehicle, !context.vehicleLocked);
  vehicleEngine.syncVehicleLockForAll(context.vehicle);
  chat.sendInfo(player, locked ? "Транспорт закрыт." : "Транспорт открыт.");
}

function toggleVehicleEngine(player, target) {
  const context = requireVehicle(player, target);
  if (!context.inVehicle || !context.isDriver) throw new Error("Нужно находиться на водительском месте.");
  if (!context.canControl) throw new Error("Нет доступа к транспорту.");
  if (!context.engineOn && vehicleEngine.getVehicleFuel(context.vehicle) <= 0) {
    throw new Error("В транспорте нет топлива.");
  }

  const engineOn = vehicleEngine.setVehicleEngine(context.vehicle, !context.engineOn);
  vehicleEngine.syncVehicleForOccupants(context.vehicle);
  chat.sendInfo(player, engineOn ? "Двигатель запущен." : "Двигатель заглушен.");
}

async function performAction(player, actionId, actionItem = null, target = createSelfTarget(player)) {
  target = resolveTargetDescriptor(player, {
    kind: target.kind,
    id: target.kind === "self" ? null : target.id,
  });
  if (!target) throw new Error("Выбранная цель больше недоступна.");

  const seat = getSeatFromAction(actionId);

  if (seat !== null) {
    putPlayerIntoSeat(player, seat, target);
    return;
  }

  if (await radialMenuRegistry.execute(player, actionId, { action: actionItem, target })) {
    return;
  }

  const licenseId = RADIAL_LICENSE_ACTIONS[actionId];
  if (licenseId) {
    const viewer = target.kind === "player" ? target.entity : player;
    await licenses.showLicenseToViewer(player, licenseId, viewer, PLAYER_RANGE);
    return;
  }

  if (String(actionId).startsWith("docs:")) {
    throw new Error("Этот документ пока недоступен.");
  }

  switch (actionId) {
    case "vehicle:hood:inspect": {
      showVehicleInfo(player, target);
      return;
    }
    case "vehicle:docs": {
      showVehicleInfo(player, target);
      return;
    }
    case "vehicle:door:toggle": {
      toggleVehicleDoor(player, target, 0);
      return;
    }
    case "vehicle:trunk:toggle": {
      toggleVehicleTrunk(player, target);
      return;
    }
    case "vehicle:lock:toggle": {
      toggleVehicleLock(player, target);
      return;
    }
    case "vehicle:engine:toggle": {
      toggleVehicleEngine(player, target);
      return;
    }
    case "player:cash:1000": {
      await transferCash(player, target);
      return;
    }
    case "player:greet": {
      sendTargetNotice(
        player,
        target,
        actionItem,
        `${getCharacterName(player)} протянул вам руку для приветствия.`,
        "Вы предложили поздороваться."
      );
      return;
    }
    case "player:search": {
      sendTargetNotice(
        player,
        target,
        actionItem,
        `${getCharacterName(player)} начал осмотр.`,
        "Вы начали осмотр ближайшего игрока."
      );
      return;
    }
    case "player:escort": {
      sendTargetNotice(
        player,
        target,
        actionItem,
        `${getCharacterName(player)} пытается взять вас в конвой.`,
        "Вы начали действие конвоя."
      );
      return;
    }
    case "property:house:register":
    case "property:apartment:register":
    case "property:business:sell":
    case "property:apartment:sell":
    case "property:house:sell": {
      sendTargetNotice(
        player,
        target,
        actionItem,
        `${getCharacterName(player)} отправил вам предложение: ${actionItem?.label || actionId}.`,
        `Предложение "${actionItem?.label || actionId}" отправлено ближайшему игроку.`
      );
      return;
    }
    case "crime:invite":
    case "crime:rob":
    case "crime:ties":
    case "crime:escort":
    case "crime:hostage":
    case "crime:bag": {
      sendTargetNotice(
        player,
        target,
        actionItem,
        `${getCharacterName(player)} начал криминальное действие: ${actionItem?.label || actionId}.`,
        `Криминальное действие "${actionItem?.label || actionId}" начато.`
      );
      return;
    }
    case "animation:greet": {
      sendLocalAction(player, `${getCharacterName(player)} приветствует окружающих.`);
      return;
    }
    case "animation:stop": {
      try {
        if (typeof player.stopAnimation === "function") {
          player.stopAnimation();
        }
      } catch {}

      chat.sendInfo(player, "Анимация остановлена.");
      return;
    }
    case "inventory:open": {
      await inventory.openInventory(player);
      return;
    }
    default: {
      chat.sendInfo(player, "Этот пункт радиального меню уже отображается, но его действие еще не подключено.");
    }
  }
}

mp.events.add("s:radialMenu:request", (player, rawTargetPayload = "{}") => {
  const release = beginRadialOperation(player, "request", RADIAL_REQUEST_COOLDOWN_MS);
  if (!release) return;

  Promise.resolve()
    .then(() => openRadialMenu(player, rawTargetPayload))
    .catch((err) => {
      callLivePlayer(player, "c:radialMenu:error", [
        err.message || "Не удалось открыть радиальное меню.",
      ]);
    })
    .finally(release);
});

mp.events.add("s:radialMenu:select", (player, rawPayload = "{}") => {
  const release = beginRadialOperation(player, "select", RADIAL_SELECT_COOLDOWN_MS);
  if (!release) return;
  let selectedSession = null;

  Promise.resolve()
    .then(async () => {
      const remembered = getRememberedRadialTarget(player);
      selectedSession = remembered.session;
      const target = remembered.target;
      const actionId = getActionId(rawPayload);
      const actionItem = await ensureActionEnabled(player, actionId, target);

      await performAction(player, actionId, actionItem, target);
    })
    .catch((err) => {
      chat.sendError(player, err.message || "Не удалось выполнить действие радиального меню.");
    })
    .finally(() => {
      if (radialTargetSessions.get(player) === selectedSession) radialTargetSessions.delete(player);
      release();
    });
});

mp.events.add("playerQuit", (player) => {
  radialTargetSessions.delete(player);
  radialOperations.delete(player);
});

mp.registerCommand("radialmenu", (player) => {
  const release = beginRadialOperation(player, "request", RADIAL_REQUEST_COOLDOWN_MS);
  if (!release) return;

  Promise.resolve()
    .then(() => openRadialMenu(player))
    .catch((err) => {
      chat.sendError(player, err.message || "Не удалось открыть радиальное меню.");
    })
    .finally(release);
});

mp.registerCommand("rmenu", (player) => {
  const release = beginRadialOperation(player, "request", RADIAL_REQUEST_COOLDOWN_MS);
  if (!release) return;

  Promise.resolve()
    .then(() => openRadialMenu(player))
    .catch((err) => {
      chat.sendError(player, err.message || "Не удалось открыть радиальное меню.");
    })
    .finally(release);
});

console.log("[RADIAL MENU] Server events registered");
