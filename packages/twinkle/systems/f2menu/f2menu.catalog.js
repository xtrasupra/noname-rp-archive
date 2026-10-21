"use strict";

const db = require("../../database/query.js");
const logsDb = require("../../database/logs.js");
const {
  rows,
  getUuid,
} = require("../../utils/player.js");

const CASE_IMAGE = "/f2/cases/default.png";
const REWARD_IMAGE = "/f2/items/reward.png";

const F2_CASES = [
  {
    id: "twinkle-basic",
    title: "NoName Case",
    description: "Базовый кейс с валютой, предметами и стартовыми бонусами.",
    price: 150,
    tone: "default",
    category: "items",
    rarity: "common",
    dailyOpens: 0,
    image: CASE_IMAGE,
    rewards: [
      { id: "money_75000", type: "money", amount: 75000, name: "$75 000", rarity: "common", chance: 58, value: "$75 000", image: "/f2/items/money.png" },
      { id: "donate_500", type: "donate", amount: 500, name: "500 доната", rarity: "rare", chance: 27, value: "500", image: "/f2/items/donate.png" },
      { id: "vip_3d", type: "item", amount: 1, name: "VIP 3 дня", rarity: "epic", chance: 12, value: "VIP", image: "/f2/items/vip.png" },
      { id: "street_clothes", type: "item", amount: 1, name: "Street одежда", rarity: "legendary", chance: 3, image: "/f2/items/clothes.png" },
    ],
  },
  {
    id: "twinkle-premium",
    title: "Premium Drop",
    description: "Премиальный кейс с более дорогими наградами и редкими предметами.",
    price: 450,
    tone: "premium",
    category: "money",
    rarity: "epic",
    dailyOpens: 0,
    image: "/f2/cases/premium.png",
    rewards: [
      { id: "money_250000", type: "money", amount: 250000, name: "$250 000", rarity: "rare", chance: 52, value: "$250 000", image: "/f2/items/money.png" },
      { id: "donate_1500", type: "donate", amount: 1500, name: "1500 доната", rarity: "epic", chance: 28, value: "1500", image: "/f2/items/donate.png" },
      { id: "vip_7d", type: "item", amount: 1, name: "Premium Club 7 дней", rarity: "legendary", chance: 15, value: "Premium", image: "/f2/items/vip.png" },
      { id: "premium_ticket", type: "item", amount: 1, name: "Премиум купон", rarity: "legendary", chance: 5, image: "/f2/items/ticket.png" },
    ],
  },
  {
    id: "street-style",
    title: "Street Style",
    description: "Одежда, аксессуары и городские предметы для персонажа.",
    price: 300,
    tone: "spring",
    category: "clothes",
    rarity: "rare",
    dailyOpens: 0,
    image: "/f2/cases/street.png",
    rewards: [
      { id: "discount_25", type: "item", amount: 1, name: "Скидка 25%", rarity: "common", chance: 45, value: "25%", image: "/f2/items/ticket.png" },
      { id: "street_clothes", type: "item", amount: 1, name: "Худи Street", rarity: "rare", chance: 35, image: "/f2/items/clothes.png" },
      { id: "street_mask", type: "item", amount: 1, name: "Маска Street", rarity: "epic", chance: 15, image: "/f2/items/clothes.png" },
      { id: "donate_500", type: "donate", amount: 500, name: "500 доната", rarity: "legendary", chance: 5, value: "500", image: "/f2/items/donate.png" },
    ],
  },
];

const F2_ITEMS = [
  {
    id: "donate_500",
    name: "500 доната",
    description: "Валюта магазина F2.",
    category: "currency",
    currency: "coin",
    image: "/f2/items/donate.png",
    shape: "card",
    tone: "purple",
    price: "500",
  },
  {
    id: "money_75000",
    name: "$75 000",
    description: "Игровая валюта для персонажа.",
    category: "currency",
    image: "/f2/items/money.png",
    shape: "card",
    tone: "gray",
    price: "75 000",
  },
  {
    id: "vip_3d",
    name: "VIP 3 дня",
    description: "Временное улучшение аккаунта.",
    category: "upgrades",
    image: "/f2/items/vip.png",
    shape: "ticket",
    tone: "purple",
    price: "300",
  },
  {
    id: "discount_25",
    name: "Скидка 25%",
    description: "Купон для магазина F2.",
    category: "discounts",
    image: "/f2/items/ticket.png",
    shape: "ticket",
    tone: "pink",
    price: "25",
  },
  {
    id: "street_clothes",
    name: "Street одежда",
    description: "Набор одежды для персонажа.",
    category: "clothes",
    image: "/f2/items/clothes.png",
    shape: "jacket",
    tone: "pink",
    price: "450",
  },
  {
    id: "vip_7d",
    name: "Premium Club 7 дней",
    description: "Премиальная подписка из кейса.",
    category: "upgrades",
    image: "/f2/items/vip.png",
    shape: "ticket",
    tone: "purple",
    price: "900",
  },
  {
    id: "premium_ticket",
    name: "Премиум купон",
    description: "Редкий купон для магазина F2.",
    category: "discounts",
    image: "/f2/items/ticket.png",
    shape: "ticket",
    tone: "purple",
    price: "700",
  },
  {
    id: "street_mask",
    name: "Маска Street",
    description: "Аксессуар из street-кейса.",
    category: "clothes",
    image: "/f2/items/clothes.png",
    shape: "jacket",
    tone: "pink",
    price: "650",
  },
];

const F2_EXCHANGE = {
  coinToCash: 120,
};

const F2_CHARACTER_PRODUCTS = [];

function buildAnimationShopPayload(player) {
  return {
    items: [],
    featured: null,
    purchasedIds: [],
    count: 0,
    purchasedCount: 0,
  };
}

let schemaReady = false;

function getCharacterUuid(player) {
  return getUuid(player);
}

function getCaseById(id) {
  return F2_CASES.find((item) => item.id === id) || null;
}

function getItemById(id) {
  return F2_ITEMS.find((item) => item.id === id) || null;
}

async function ensureF2ShopSchema() {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS character_f2_cases (
      character_uuid BIGINT NOT NULL,
      case_id VARCHAR(64) NOT NULL,
      amount INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (character_uuid, case_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS character_f2_items (
      id BIGINT NOT NULL AUTO_INCREMENT,
      character_uuid BIGINT NOT NULL,
      item_id VARCHAR(64) NOT NULL,
      amount INT NOT NULL DEFAULT 1,
      source VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_character_f2_items_character (character_uuid),
      INDEX idx_character_f2_items_item (item_id)
    )
  `);

  await logsDb.ensureLogsSchema();

  schemaReady = true;
}

function normalizeAmount(value) {
  return Math.max(0, Number(value || 0));
}

async function getOwnedCases(player) {
  const uuid = getCharacterUuid(player);
  if (!uuid) return {};

  await ensureF2ShopSchema();

  const result = rows(await db.query(
    "SELECT case_id, amount FROM character_f2_cases WHERE character_uuid = ? AND amount > 0",
    [uuid]
  )) || [];

  return result.reduce((acc, row) => {
    const id = String(row.case_id || "").trim();
    if (id) acc[id] = normalizeAmount(row.amount);
    return acc;
  }, {});
}

async function getCollectedItems(player) {
  const uuid = getCharacterUuid(player);
  if (!uuid) return [];

  await ensureF2ShopSchema();

  const result = rows(await db.query(
    `SELECT item_id, SUM(amount) AS amount
       FROM character_f2_items
      WHERE character_uuid = ?
      GROUP BY item_id
      ORDER BY MAX(id) DESC`,
    [uuid]
  )) || [];

  return result
    .map((row) => {
      const item = getItemById(String(row.item_id || ""));
      if (!item) return null;

      const amount = normalizeAmount(row.amount);
      return {
        ...item,
        amount: amount > 1 ? `${amount} шт.` : undefined,
      };
    })
    .filter(Boolean);
}

async function buildF2InventoryPayload(player) {
  const items = await getCollectedItems(player);

  return {
    items,
    count: items.length,
  };
}

async function buildF2ShopPayload(player) {
  const [ownedCases, inventory] = await Promise.all([
    getOwnedCases(player),
    buildF2InventoryPayload(player),
  ]);

  return {
    exchange: F2_EXCHANGE,
    cases: F2_CASES.map((item) => ({
      ...item,
      dailyOpens: Number(item.dailyOpens || 0),
    })),
    items: F2_ITEMS.map((item) => ({ ...item })),
    products: F2_CHARACTER_PRODUCTS.map((item) => ({ ...item })),
    character: {
      items: F2_CHARACTER_PRODUCTS.map((item) => ({ ...item })),
      featured: F2_CHARACTER_PRODUCTS[0] || null,
    },
    animations: buildAnimationShopPayload(player),
    inventory,
    ownedCases,
    casesCount: Object.values(ownedCases).reduce((sum, value) => sum + normalizeAmount(value), 0),
    inventoryCount: inventory.count,
    tickerItems: [
      { name: "500 доната", type: "coin", image: "/f2/items/donate.png" },
      { name: "$75 000", type: "card", image: "/f2/items/money.png" },
      { name: "VIP 3 дня", type: "ticket", image: "/f2/items/vip.png" },
      { name: "Скидка 25%", type: "ticket", image: "/f2/items/ticket.png" },
      { name: "Street одежда", type: "shirt", image: "/f2/items/clothes.png" },
    ],
  };
}

function getAccountId(player) {
  return Number(
    player?.accountId
      || player?.sqlId
      || player?.dbid
      || player?.character?.account_id
      || player?.characterData?.account_id
      || player?.account?.id
      || player?.accountData?.id
      || player?.getVariable?.("accountId")
      || player?.getVariable?.("sqlId")
      || 0
  );
}

function getDonate(player) {
  return Math.max(0, Math.floor(Number(
    player?.donate
      ?? player?.donateCoins
      ?? player?.twinkleCoins
      ?? player?.account?.donate
      ?? player?.accountData?.donate
      ?? player?.getVariable?.("donate")
      ?? 0
  ) || 0));
}

function syncDonate(player, donate) {
  const value = Math.max(0, Math.floor(Number(donate || 0)));

  if (player.account) player.account.donate = value;
  if (player.accountData) player.accountData.donate = value;
  player.donate = value;
  player.donateCoins = value;
  player.twinkleCoins = value;

  try {
    player.setVariable?.("donate", value);
    player.call?.("client:donate:update", [value]);
  } catch {}

  return value;
}

function syncCash(player, cash) {
  const value = Math.max(0, Math.floor(Number(cash || 0)));

  if (player.character) player.character.cash = value;
  if (player.characterData) player.characterData.cash = value;
  player.cash = value;

  try {
    player.setVariable?.("cash", value);
    player.call?.("client:money:update", [{ cash: value }]);
    player.call?.("c:hud:update", [JSON.stringify({ player: { finance: { cash: value } } })]);
  } catch {}

  return value;
}

function normalizeCaseAmount(value) {
  return Math.min(5, Math.max(1, Math.floor(Number(value || 1))));
}

function cloneReward(reward) {
  return {
    id: String(reward.id || reward.name || ""),
    type: String(reward.type || "item"),
    amount: Math.max(1, Math.floor(Number(reward.amount || 1))),
    name: String(reward.name || reward.id || "Награда"),
    rarity: String(reward.rarity || "common"),
    chance: Math.max(0, Number(reward.chance || 0)),
    value: reward.value == null ? undefined : String(reward.value),
    image: reward.image == null ? REWARD_IMAGE : String(reward.image),
  };
}

function pickCaseReward(caseItem) {
  const rewards = Array.isArray(caseItem?.rewards)
    ? caseItem.rewards.map(cloneReward).filter((item) => item.chance > 0)
    : [];

  if (!rewards.length) {
    return {
      id: "fallback_reward",
      type: "item",
      amount: 1,
      name: "Награда",
      rarity: "common",
      chance: 100,
      image: REWARD_IMAGE,
    };
  }

  const totalChance = rewards.reduce((sum, item) => sum + item.chance, 0);
  const target = Math.random() * totalChance;
  let cursor = 0;

  for (const reward of rewards) {
    cursor += reward.chance;
    if (target <= cursor) return reward;
  }

  return rewards[rewards.length - 1];
}

async function buyCase(player, caseId, amountRaw) {
  await ensureF2ShopSchema();

  const uuid = getCharacterUuid(player);
  const accountId = getAccountId(player);
  const caseItem = getCaseById(caseId);
  const amount = normalizeCaseAmount(amountRaw);

  if (!uuid) throw new Error("Персонаж не найден.");
  if (!accountId) throw new Error("Аккаунт не найден.");
  if (!caseItem) throw new Error("Кейс не найден.");

  const totalPrice = Math.max(0, Number(caseItem.price || 0)) * amount;

  return db.withConn(async (conn) => {
    await conn.beginTransaction();

    try {
      const [accountRows] = await conn.query(
        "SELECT donate FROM accounts WHERE id = ? FOR UPDATE",
        [accountId]
      );

      const donate = Math.max(0, Number(accountRows?.[0]?.donate || getDonate(player)));

      if (donate < totalPrice) {
        throw new Error(`Недостаточно доната. Нужно: ${totalPrice}.`);
      }

      const nextDonate = donate - totalPrice;

      await conn.query("UPDATE accounts SET donate = ? WHERE id = ?", [nextDonate, accountId]);
      await logsDb.writeDonateLog({
        source: "f2",
        action: "spend",
        amount: -totalPrice,
        balanceBefore: donate,
        balanceAfter: nextDonate,
        target: player,
        targetUuid: uuid,
        accountId,
        comment: "Покупка кейса",
        metadata: { caseId: caseItem.id, amount },
      });
      await conn.query(
        `INSERT INTO character_f2_cases (character_uuid, case_id, amount)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)`,
        [uuid, caseItem.id, amount]
      );

      await conn.commit();
      syncDonate(player, nextDonate);

      return {
        success: true,
        case: caseItem,
        amount,
        donate: nextDonate,
        message: `Куплено кейсов: ${amount}.`,
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
}

async function grantReward(conn, player, uuid, accountId, caseItem, reward) {
  const safeReward = cloneReward(reward);
  let cash;
  let donate;

  if (safeReward.type === "money") {
    const currentCash = Number(player?.character?.cash ?? player?.characterData?.cash ?? player?.cash ?? 0);
    const [characterRows] = await conn.query(
      "SELECT cash FROM characters WHERE uuid = ? FOR UPDATE",
      [uuid]
    );
    const beforeCash = Math.max(0, Number(characterRows?.[0]?.cash || currentCash));
    cash = beforeCash + safeReward.amount;
    await conn.query("UPDATE characters SET cash = ? WHERE uuid = ?", [cash, uuid]);
    await logsDb.writeMoneyLog({
      source: "f2",
      action: "reward",
      currency: "cash",
      amount: safeReward.amount,
      balanceBefore: beforeCash,
      balanceAfter: cash,
      target: player,
      targetUuid: uuid,
      accountId,
      comment: "Награда кейса",
      metadata: { caseId: caseItem.id, reward: safeReward },
    });
  } else if (safeReward.type === "donate") {
    const currentDonate = getDonate(player);
    const [accountRows] = await conn.query(
      "SELECT donate FROM accounts WHERE id = ? FOR UPDATE",
      [accountId]
    );
    const beforeDonate = Math.max(0, Number(accountRows?.[0]?.donate || currentDonate));
    donate = beforeDonate + safeReward.amount;
    await conn.query("UPDATE accounts SET donate = ? WHERE id = ?", [donate, accountId]);
    await logsDb.writeDonateLog({
      source: "f2",
      action: "reward",
      amount: safeReward.amount,
      balanceBefore: beforeDonate,
      balanceAfter: donate,
      target: player,
      targetUuid: uuid,
      accountId,
      comment: "Награда кейса",
      metadata: { caseId: caseItem.id, reward: safeReward },
    });
  } else {
    const itemId = getItemById(safeReward.id)?.id || safeReward.id;
    await conn.query(
      `INSERT INTO character_f2_items (character_uuid, item_id, amount, source)
       VALUES (?, ?, ?, ?)`,
      [uuid, itemId, safeReward.amount, `case:${caseItem.id}`]
    );
  }

  await logsDb.logQuery(
    `INSERT INTO character_f2_case_logs
      (character_uuid, case_id, reward_id, reward_type, reward_name, reward_rarity, reward_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid, caseItem.id, safeReward.id, safeReward.type, safeReward.name, safeReward.rarity, safeReward.amount]
  );

  return {
    ...safeReward,
    cash,
    donate,
  };
}

async function openCase(player, caseId, amountRaw) {
  await ensureF2ShopSchema();

  const uuid = getCharacterUuid(player);
  const accountId = getAccountId(player);
  const caseItem = getCaseById(caseId);
  const amount = normalizeCaseAmount(amountRaw);

  if (!uuid) throw new Error("Персонаж не найден.");
  if (!accountId) throw new Error("Аккаунт не найден.");
  if (!caseItem) throw new Error("Кейс не найден.");

  return db.withConn(async (conn) => {
    await conn.beginTransaction();

    try {
      const [caseRows] = await conn.query(
        "SELECT amount FROM character_f2_cases WHERE character_uuid = ? AND case_id = ? FOR UPDATE",
        [uuid, caseItem.id]
      );

      const owned = Math.max(0, Number(caseRows?.[0]?.amount || 0));

      if (owned < amount) {
        throw new Error("У вас нет такого количества кейсов.");
      }

      await conn.query(
        `UPDATE character_f2_cases
            SET amount = GREATEST(amount - ?, 0)
          WHERE character_uuid = ? AND case_id = ?`,
        [amount, uuid, caseItem.id]
      );

      const rewards = [];

      for (let index = 0; index < amount; index += 1) {
        const reward = pickCaseReward(caseItem);
        rewards.push(await grantReward(conn, player, uuid, accountId, caseItem, reward));
      }

      await conn.commit();

      const lastReward = rewards[rewards.length - 1] || null;
      const lastCashReward = [...rewards].reverse().find((reward) => reward.cash != null);
      const lastDonateReward = [...rewards].reverse().find((reward) => reward.donate != null);

      if (lastCashReward?.cash != null) syncCash(player, lastCashReward.cash);
      if (lastDonateReward?.donate != null) syncDonate(player, lastDonateReward.donate);

      return {
        success: true,
        case: caseItem,
        amount,
        rewards,
        reward: lastReward,
        message: rewards.length === 1
          ? `Вы выиграли: ${lastReward?.name || "Награда"}`
          : `Открыто кейсов: ${rewards.length}.`,
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
}

module.exports = {
  F2_CASES,
  F2_ITEMS,
  buildF2InventoryPayload,
  buildF2ShopPayload,
  buyCase,
  ensureF2ShopSchema,
  getCaseById,
  getItemById,
  getDonate,
  openCase,
};
