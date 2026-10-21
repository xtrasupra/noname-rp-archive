"use strict";

const db = require("../../database/query.js");
const logsDb = require("../../database/logs.js");
const onlineStats = require("../hud/onlineStats.service.js");
const f2Catalog = require("./f2menu.catalog.js");
const { getPublicRouletteConfig } = require("./roulette.config.js");
const rouletteRepository = require("./roulette.repository.js");
const animationsCatalog = require("../animations/animations.catalog.js");
const levelService = require("../level/level.service.js");
const reportsSystem = require("../admin/reports.js");
const jobEmployment = require("../jobs/jobEmployment.service.js");
const {
  rows,
  playerName,
  playerAdminLevel,
} = require("../../utils/player.js");

function money(value) {
  return `$${Number(value || 0).toLocaleString("ru-RU")}`;
}

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return null;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ru-RU");
}

function formatOnline(secondsRaw) {
  const seconds = Math.max(0, Math.floor(Number(secondsRaw || 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}ч. ${minutes}мин.`;
}

function safeString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function getCharacterName(character, player) {
  const fullName = [
    character?.username || character?.firstname || character?.firstName,
    character?.lastname || character?.lastName,
  ].filter(Boolean).join(" ").trim();

  return fullName || character?.name || playerName(player);
}

function getF2PlayerTitle(player, character, fractionName, jobName) {
  if (playerAdminLevel(player) > 0) return "Администратор";
  if (fractionName && fractionName !== "Нет") return fractionName;
  return jobName || character?.jobName || character?.job_name || "Игрок Twinkle";
}

async function queryRows(sql, params = []) {
  try {
    return rows(await db.query(sql, params)) || [];
  } catch (error) {
    console.error("[F2 PAYLOAD] query error:", error?.message || error);
    return [];
  }
}

async function queryLogRows(sql, params = []) {
  try {
    return await logsDb.logQuery(sql, params) || [];
  } catch (error) {
    console.error("[F2 PAYLOAD] logs query error:", error?.message || error);
    return [];
  }
}

async function queryFirstAvailable(queries) {
  for (const query of queries) {
    const result = await queryRows(query.sql, query.params);
    if (result.length > 0) return result;
  }

  return [];
}

async function getCharacterFractionInfo(characterUuid) {
  const uuid = Number(characterUuid || 0);
  if (!uuid) return null;

  const membershipRows = await queryRows(
    `SELECT fm.fraction_id,
            fm.rank_index,
            f.name AS fraction_name,
            f.short_name AS fraction_short_name,
            fr.rank_name
       FROM fraction_members fm
       JOIN fractions f
         ON f.fraction_id = fm.fraction_id AND f.is_active = 1
       LEFT JOIN fraction_ranks fr
         ON fr.fraction_id = fm.fraction_id AND fr.rank_index = fm.rank_index
      WHERE fm.character_uuid = ?
      LIMIT 1`,
    [uuid]
  );
  const membership = membershipRows[0] || null;
  if (!membership) return null;

  const fractionId = Number(membership.fraction_id || 0);
  const rankIndex = Number(membership.rank_index || 0);

  return {
    fraction_id: fractionId,
    fraction_name: safeString(
      membership.fraction_name || membership.fraction_short_name,
      fractionId ? `Фракция #${fractionId}` : "Нет"
    ),
    rank_name: safeString(
      membership.rank_name,
      rankIndex ? `Ранг ${rankIndex}` : "Нет"
    ),
  };
}

async function getMoneyLogTotals(uuid) {
  if (!uuid) return { earned: 0, spent: 0 };

  const result = await queryLogRows(
    `SELECT
        COALESCE(SUM(CASE
          WHEN balance_after IS NOT NULL AND balance_before IS NOT NULL AND balance_after > balance_before
          THEN balance_after - balance_before
          WHEN amount > 0 AND action IN ('reward','add','give','income','payout')
          THEN amount
          ELSE 0
        END), 0) AS earned,
        COALESCE(SUM(CASE
          WHEN balance_after IS NOT NULL AND balance_before IS NOT NULL AND balance_after < balance_before
          THEN balance_before - balance_after
          WHEN amount < 0
          THEN ABS(amount)
          ELSE 0
        END), 0) AS spent
       FROM money_logs
      WHERE target_uuid = ?`,
    [uuid]
  );

  return {
    earned: number(result[0]?.earned),
    spent: number(result[0]?.spent),
  };
}

async function getBlockCount(uuid, accountId) {
  const byCharacter = uuid
    ? await queryRows("SELECT COUNT(*) AS count FROM twinkle_admin.bans WHERE character_uuid = ?", [uuid])
    : [];
  const byAccount = accountId
    ? await queryRows("SELECT COUNT(*) AS count FROM twinkle_admin.bans WHERE account_id = ?", [accountId])
    : [];

  return Math.max(number(byCharacter[0]?.count), number(byAccount[0]?.count));
}

function buildOverviewPayload(player, character, account, house, fraction, employment) {
  const cash = Number(character.cash || player.cash || 0);
  const bank = Number(character.bank || 0);

  return {
    cards: [
      {
        title: "Денежные средства",
        value: money(cash + bank),
        icon: "money",
        money: [
          { icon: "cash", label: money(cash) },
          { icon: "card", label: money(bank) },
        ],
      },
      {
        title: "Возраст",
        value: `${Number(character.age || 18)} лет`,
        caption: `Национальность: ${safeString(character.nationality, "USA")}`,
        icon: "age",
      },
      {
        title: "Место жительства",
        value: house ? `Дом №${house.number || house.id}` : "Нет прописки",
        caption: house
          ? safeString(house.street || house.address, "Адрес не указан")
          : "Дом: Нет    Квартира: Нет",
        icon: "home",
      },
      {
        title: "Работа",
        value: employment?.name || character.jobName || character.job_name || "Безработный",
        icon: "job",
      },
      {
        title: "Семейное положение",
        value: character.married ? "В браке" : "Не в браке",
        icon: "marriage",
      },
      {
        title: "Организация",
        value: fraction?.fraction_name || "Нет",
        caption: `Должность: ${fraction?.rank_name || "Нет"}`,
        icon: "organization",
      },
      {
        title: "Семья",
        value: character.familyName || character.family_name || "Нет",
        icon: "family",
      },
      {
        title: "Статус подписки",
        value: character.vip_type || account.vip_type || "Отсутствует",
        caption: character.vip_until ? `До ${formatDate(character.vip_until)}` : "",
        icon: "subscription",
      },
    ],
  };
}

async function buildStatisticsPayload(player, character, account) {
  const uuid = Number(character.uuid || player.character?.uuid || player.getVariable?.("uuid") || 0);
  const accountId = Number(character.account_id || account.id || player.accountId || 0);
  const online = await onlineStats.getState(player).catch(() => ({
    todaySeconds: 0,
    monthSeconds: 0,
    totalSeconds: 0,
  }));
  const moneyTotals = await getMoneyLogTotals(uuid);
  const blockCount = await getBlockCount(uuid, accountId);

  const earned = firstDefined(character.earned, character.total_earned, moneyTotals.earned);
  const spent = firstDefined(character.spent, character.total_spent, moneyTotals.spent);
  const arrests = firstDefined(character.arrests, character.arrest_count, character.jail_count, 0);
  const convictions = firstDefined(character.convictions, character.conviction_count, character.crimes, 0);
  const kills = firstDefined(character.kills, character.kill_count, 0);
  const deaths = firstDefined(character.deaths, character.death_count, 0);
  const casino = firstDefined(character.casino, character.casino_win, character.casino_wins, 0);
  const contracts = firstDefined(character.contracts, character.contract_count, 0);
  const worldTasks = firstDefined(character.worldTasks, character.world_tasks, character.world_task_count, 0);
  const achievements = firstDefined(character.achievements, character.achievement_count, 0);
  const createdAt = firstDefined(character.create_date, character.created_at, character.reg_date, account.created_at);
  const levelProgress = await levelService.getProgress(uuid).catch(() => null);
  const level = number(levelProgress?.level ?? character.level, 1);
  const xp = number(levelProgress?.xp ?? character.xp ?? character.exp, 0);
  const xpRequired = number(levelProgress?.xpRequired ?? levelService.getXpRequired(level), 3);

  return {
    cards: [
      {
        title: "Дата регистрации",
        value: formatDate(createdAt),
        caption: `Дата регистрации: ${formatDate(createdAt)}`,
        icon: "registration",
      },
      {
        title: "Уровень",
        value: String(level),
        caption: `Опыт: ${xp} / ${xpRequired}`,
        icon: "level",
      },
      {
        title: "Время в игре",
        value: formatOnline(online.todaySeconds),
        icon: "time",
        tabs: ["День", "Месяц", "Всего"],
        tabsLabel: "Период",
        activeTab: "День",
        valuesByTab: {
          "День": { value: formatOnline(online.todaySeconds), caption: "За сегодня" },
          "Месяц": { value: formatOnline(online.monthSeconds), caption: "За месяц" },
          "Всего": { value: formatOnline(online.totalSeconds), caption: "За всё время" },
        },
      },
      {
        title: "Аресты",
        value: formatOnline(number(character.jail_time ?? character.arrest_time, 0) * 60),
        caption: `Количество: ${number(arrests)}`,
        icon: "arrests",
      },
      {
        title: "Судимости",
        value: String(number(convictions)),
        caption: "Активные судимости",
        icon: "convictions",
      },
      {
        title: "Убийства",
        value: String(number(kills)),
        caption: `Смерти: ${number(deaths)}`,
        icon: "kills",
      },
      {
        title: "Блокировки",
        value: String(blockCount),
        caption: "",
        icon: "blocks",
        action: "История блокировок",
      },
      {
        title: "Заработано",
        value: money(earned),
        caption: "",
        icon: "money",
        tabs: ["День", "Месяц", "Всего"],
        tabsLabel: "Доход",
        activeTab: "Всего",
        valuesByTab: {
          "Всего": { value: money(earned), caption: "" },
        },
      },
      {
        title: "Потрачено",
        value: money(spent),
        caption: "",
        icon: "spent",
        tabs: ["День", "Месяц", "Всего"],
        tabsLabel: "Расход",
        activeTab: "Всего",
        valuesByTab: {
          "Всего": { value: money(spent), caption: "" },
        },
      },
      {
        title: "Выигрыш в казино",
        value: money(casino),
        caption: "",
        icon: "casino",
      },
      {
        title: "Контракты",
        value: String(number(contracts)),
        caption: "",
        icon: "contracts",
      },
      {
        title: "Мировых заданий",
        value: String(number(worldTasks)),
        caption: `Получено: ${number(worldTasks)}`,
        icon: "world",
      },
      {
        title: "Достижений",
        value: String(number(achievements)),
        caption: "",
        icon: "achievements",
      },
    ],
  };
}

function mapHouseProperty(house) {
  if (!house) return null;

  return {
    id: `house-${house.id}`,
    kind: "house",
    title: "Дом",
    number: String(house.number || house.id),
    price: Number(house.price || 0),
    street: house.street || "",
    address: house.address || "",
    x: Number(house.x || 0),
    y: Number(house.y || 0),
    z: Number(house.z || 0),
    locked: Boolean(house.is_lock || house.locked),
    image: "/property/house.png",
    imageSize: "house",
  };
}

function mapApartmentProperty(apartment) {
  if (!apartment) return null;

  return {
    id: `apartment-${apartment.id}`,
    kind: "apartment",
    title: "Квартира",
    number: String(apartment.number || apartment.id),
    price: Number(apartment.price || 0),
    street: apartment.street || "",
    address: apartment.address || "",
    x: Number(apartment.x || 0),
    y: Number(apartment.y || 0),
    z: Number(apartment.z || 0),
    locked: Boolean(apartment.is_lock || apartment.locked),
    image: "/property/apartment.png",
    imageSize: "apartment",
  };
}

function mapVehicleProperty(vehicle) {
  if (!vehicle) return null;

  return {
    id: `vehicle-${vehicle.id}`,
    kind: "vehicle",
    title: vehicle.display_name || vehicle.name || vehicle.model || "Транспорт",
    number: vehicle.plate || vehicle.number || "",
    price: Number(vehicle.price || vehicle.gos_price || 0),
    image: "/property/mercedes-g63.png",
    imageSize: "vehicle",
  };
}

function buildPropertyPayload(houses = [], apartments = [], vehicles = [], businesses = []) {
  const estate = [
    ...houses.map(mapHouseProperty),
    ...apartments.map(mapApartmentProperty),
  ].filter(Boolean);
  const mappedVehicles = vehicles.map(mapVehicleProperty).filter(Boolean);

  return {
    estate,
    businesses: businesses.filter(Boolean),
    business: businesses[0] || null,
    vehicles: mappedVehicles,
    vehicle: mappedVehicles[0] || null,
  };
}

async function getOwnedHouses(uuid) {
  if (!uuid) return [];

  return queryRows(
    "SELECT * FROM houses WHERE user_id = ? OR owner = ?",
    [uuid, String(uuid)]
  );
}

async function getOwnedApartments(uuid) {
  if (!uuid) return [];

  return queryRows("SELECT * FROM condos WHERE user_id = ?", [Number(uuid)]);
}

async function getOwnedVehicles(uuid) {
  if (!uuid) return [];

  return queryFirstAvailable([
    {
      sql: "SELECT * FROM vehicles WHERE owner = ? OR owner = ?",
      params: [uuid, String(uuid)],
    },
    {
      sql: "SELECT * FROM vehicles WHERE owner_uuid = ? OR owner_uuid = ?",
      params: [uuid, String(uuid)],
    },
    {
      sql: "SELECT * FROM vehicles WHERE user_id = ?",
      params: [uuid],
    },
    {
      sql: "SELECT * FROM vehicles WHERE character_uuid = ?",
      params: [uuid],
    },
  ]);
}

async function buildShopPayload(player, account) {
  const shop = await f2Catalog.buildF2ShopPayload(player);
  const donate = Number(account.donate ?? f2Catalog.getDonate(player) ?? 0);
  const accountId = Number(account.id || player.accountId || 0);
  let pendingRouletteResult = null;

  if (Number.isSafeInteger(accountId) && accountId > 0) {
    try {
      pendingRouletteResult = await rouletteRepository.getLatestUnacknowledged(accountId);
    } catch (error) {
      console.error("[F2 PAYLOAD] roulette recovery query error:", error?.message || error);
    }
  }

  return {
    ...shop,
    balance: donate,
    donate,
    categories: shop.categories || [],
    cases: shop.cases || [],
    inventory: shop.inventory || { items: [], count: 0 },
    products: shop.products || [],
    offers: shop.offers || [],
    packs: shop.packs || [],
    roulette: {
      ...getPublicRouletteConfig(),
      pendingResult: pendingRouletteResult,
    },
    ownedCases: shop.ownedCases || {},
    casesCount: Number(shop.casesCount || 0),
    inventoryCount: Number(shop.inventoryCount || shop.inventory?.count || 0),
  };
}

function buildPlayerPayload(player, character, account) {
  return {
    id: player.id,
    uuid: Number(character.uuid || 0),
    name: getCharacterName(character, player),
    level: Number(character.level || 1),
    adminLevel: playerAdminLevel(player),
    cash: Number(character.cash || player.cash || 0),
    bank: Number(character.bank || 0),
    donate: Number(account.donate || f2Catalog.getDonate(player) || 0),
    avatar: character.avatar || null,
    vip: character.vip_type || account.vip_type || "none",
  };
}

async function buildF2Payload(player) {
  const uuid = Number(player.character?.uuid || player.getVariable?.("uuid") || 0);
  const accountId = Number(
    player.accountId ||
    player.character?.account_id ||
    player.getVariable?.("accountId") ||
    0
  );

  const characterRows = uuid
    ? await queryRows("SELECT * FROM characters WHERE uuid = ? LIMIT 1", [uuid])
    : [];
  const accountRows = accountId
    ? await queryRows("SELECT * FROM accounts WHERE id = ? LIMIT 1", [accountId])
    : [];
  const houseRows = await getOwnedHouses(uuid);
  const apartmentRows = await getOwnedApartments(uuid);
  const vehicleRows = await getOwnedVehicles(uuid);
  const businessRows = [];

  const character = {
    ...(player.character || {}),
    ...(characterRows[0] || {}),
  };
  const account = {
    ...(player.account || player.accountData || {}),
    ...(accountRows[0] || {}),
  };
  const house = houseRows[0] || null;
  const fraction = await getCharacterFractionInfo(uuid);
  const fractionName = fraction?.fraction_name || "Нет";
  let employment = null;
  try {
    employment = await jobEmployment.getEmploymentByUuid(uuid);
  } catch (error) {
    console.error("[F2 PAYLOAD] employment query error:", error?.message || error);
  }
  const jobName = employment?.name || character.jobName || character.job_name || null;
  const shop = await buildShopPayload(player, account);
  const playerInfo = buildPlayerPayload(player, character, account);
  let appeals = { permissions: { isAdmin: false, adminLevel: 0 }, items: [], statistics: null };

  try {
    appeals = await reportsSystem.buildReportsPayload(player);
  } catch (error) {
    console.error("[F2 PAYLOAD] reports payload error:", error?.message || error);
  }

  return {
    playerName: getCharacterName(character, player),
    playerTitle: getF2PlayerTitle(player, character, fractionName, jobName),
    adminLevel: playerAdminLevel(player),
    player: playerInfo,
    character,
    overview: buildOverviewPayload(player, character, account, house, fraction, employment),
    statistics: await buildStatisticsPayload(player, character, account),
    property: buildPropertyPayload(houseRows, apartmentRows, vehicleRows, businessRows),
    animations: animationsCatalog.buildAnimationsPayload(player),
    appeals,
    inventory: shop.inventory,
    shop,
    donate: shop.balance,
    casesCount: shop.casesCount,
    inventoryCount: shop.inventoryCount,
    ownedCases: shop.ownedCases,
  };
}

async function buildF2InventoryPayload(player) {
  const shop = await f2Catalog.buildF2ShopPayload(player);
  return shop.inventory || { items: [], count: 0 };
}

module.exports = {
  buildF2Payload,
  buildF2InventoryPayload,
};
