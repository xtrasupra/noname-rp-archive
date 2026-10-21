"use strict";

const db = require("../../database/query.js");
const logsDb = require("../../database/logs.js");
const levelConfig = require("./level.config.js");

const LEVEL_CONFIG = {
  paydaySeconds: Number(levelConfig.paydaySeconds || 60 * 60),
  paydayXp: Number(levelConfig.paydayXp || 1),
  donateRewardsByLevel: levelConfig.donateRewardsByLevel || {},
};

let schemaReady = false;

function unwrapRows(result) {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
}

function getUuid(player) {
  return Number(
    player?.character?.uuid ||
    player?.characterId ||
    player?.uuid ||
    player?.getVariable?.("uuid") ||
    0
  );
}

function getXpRequired(level) {
  if (typeof levelConfig.xpRequired === "function") {
    const configured = Number(levelConfig.xpRequired(level));
    if (Number.isFinite(configured) && configured > 0) {
      return Math.floor(configured);
    }
  }

  return Math.max(2, Math.floor(Number(level || 1)) * 2);
}

function syncPlayerLevel(player, data) {
  if (!player || !data) return;

  if (player.character) {
    player.character.xp = Number(data.xp || 0);
    player.character.level = Number(data.level || 1);
  }

  player.setVariable?.("level", Number(data.level || 1));
  player.setVariable?.("xp", Number(data.xp || 0));
}

function syncPlayerDonate(player, donate) {
  const value = Math.max(0, Math.floor(Number(donate || 0)));

  if (player.account) player.account.donate = value;
  if (player.accountData) player.accountData.donate = value;
  player.donate = value;
  player.donateCoins = value;
  player.twinkleCoins = value;

  player.setVariable?.("donate", value);

  try {
    player.call?.("client:donate:update", [value]);
  } catch {}
}

async function ensureSchema() {
  if (schemaReady) return;

  const columns = unwrapRows(await db.query("SHOW COLUMNS FROM characters")) || [];
  const names = new Set(columns.map((column) => column.Field));

  if (!names.has("xp")) {
    await db.query("ALTER TABLE characters ADD COLUMN xp INT NOT NULL DEFAULT 0");
  }

  if (!names.has("level")) {
    await db.query("ALTER TABLE characters ADD COLUMN level INT NOT NULL DEFAULT 1");
  }

  if (!names.has("last_xp_payday_total_seconds")) {
    await db.query("ALTER TABLE characters ADD COLUMN last_xp_payday_total_seconds INT NOT NULL DEFAULT 0");
  }

  if (!names.has("level_reward_claimed_level")) {
    await db.query("ALTER TABLE characters ADD COLUMN level_reward_claimed_level INT NOT NULL DEFAULT 0");
  }

  schemaReady = true;
}

async function getProgress(playerOrUuid) {
  await ensureSchema();

  const uuid = typeof playerOrUuid === "number" ? playerOrUuid : getUuid(playerOrUuid);
  if (!uuid) return null;

  const characterRows = unwrapRows(await db.query(
    `SELECT uuid, account_id, xp, level, last_xp_payday_total_seconds, level_reward_claimed_level
       FROM characters
      WHERE uuid = ?
      LIMIT 1`,
    [uuid]
  )) || [];

  const character = characterRows[0];
  if (!character) return null;

  const level = Math.max(1, Math.floor(Number(character.level || 1)));
  const xp = Math.max(0, Math.floor(Number(character.xp || 0)));

  return {
    uuid,
    accountId: Number(character.account_id || 0),
    level,
    xp,
    xpRequired: getXpRequired(level),
    lastPaydayTotalSeconds: Math.max(0, Number(character.last_xp_payday_total_seconds || 0)),
    rewardClaimedLevel: Math.max(0, Number(character.level_reward_claimed_level || 0)),
  };
}

function calculateProgress(level, xp) {
  let nextLevel = Math.max(1, Math.floor(Number(level || 1)));
  let nextXp = Math.max(0, Math.floor(Number(xp || 0)));

  while (nextXp >= getXpRequired(nextLevel)) {
    nextXp -= getXpRequired(nextLevel);
    nextLevel += 1;
  }

  return {
    level: nextLevel,
    xp: nextXp,
    xpRequired: getXpRequired(nextLevel),
  };
}

function getDonateRewardForLevels(fromLevel, toLevel) {
  const rewardClaimedLevel = Math.max(0, Math.floor(Number(fromLevel || 0)));
  const targetLevel = Math.max(1, Math.floor(Number(toLevel || 1)));
  const reachedRewardLevels = [];
  let donateReward = 0;

  for (let rewardLevel = rewardClaimedLevel + 1; rewardLevel <= targetLevel; rewardLevel += 1) {
    const rewardAmount = Math.max(0, Number(LEVEL_CONFIG.donateRewardsByLevel[String(rewardLevel)] || 0));
    if (rewardAmount > 0) {
      reachedRewardLevels.push(rewardLevel);
      donateReward += rewardAmount;
    }
  }

  return {
    donateReward,
    reachedRewardLevels,
  };
}

async function applyDonateReward(conn, player, character, donateReward, reachedRewardLevels) {
  if (donateReward <= 0 || Number(character.account_id || 0) <= 0) {
    return {
      donate: null,
      beforeDonate: null,
    };
  }

  const [accountRows] = await conn.query(
    "SELECT donate FROM accounts WHERE id = ? LIMIT 1 FOR UPDATE",
    [Number(character.account_id)]
  );

  const beforeDonate = Math.max(0, Number(accountRows[0]?.donate || 0));
  const donate = beforeDonate + donateReward;

  await conn.query(
    "UPDATE accounts SET donate = ? WHERE id = ?",
    [donate, Number(character.account_id)]
  );

  await logsDb.writeDonateLog({
    source: "level_reward",
    action: "reward",
    amount: donateReward,
    balanceBefore: beforeDonate,
    balanceAfter: donate,
    target: player,
    accountId: Number(character.account_id || 0),
    comment: `Level reward: ${reachedRewardLevels.join(", ")}`,
    metadata: { levels: reachedRewardLevels },
  }).catch(() => {});

  return {
    donate,
    beforeDonate,
  };
}

async function normalizeProgress(player) {
  await ensureSchema();

  const uuid = getUuid(player);
  if (!uuid) return null;

  return db.withConn(async (conn) => {
    await conn.beginTransaction();

    try {
      const [characterRows] = await conn.query(
        `SELECT uuid, account_id, xp, level, level_reward_claimed_level
           FROM characters
          WHERE uuid = ?
          LIMIT 1
          FOR UPDATE`,
        [uuid]
      );

      const character = characterRows[0];
      if (!character) {
        await conn.rollback();
        return null;
      }

      const oldLevel = Math.max(1, Math.floor(Number(character.level || 1)));
      const oldXp = Math.max(0, Math.floor(Number(character.xp || 0)));
      const calculated = calculateProgress(oldLevel, oldXp);
      const rewardClaimedLevel = Math.max(0, Math.floor(Number(character.level_reward_claimed_level || 0)));
      const { donateReward, reachedRewardLevels } = getDonateRewardForLevels(
        rewardClaimedLevel,
        calculated.level
      );
      const nextClaimedLevel = calculated.level > rewardClaimedLevel ? calculated.level : rewardClaimedLevel;

      const changed =
        calculated.level !== oldLevel ||
        calculated.xp !== oldXp ||
        nextClaimedLevel !== rewardClaimedLevel;

      if (!changed) {
        await conn.rollback();
        return {
          uuid,
          accountId: Number(character.account_id || 0),
          level: oldLevel,
          oldLevel,
          xp: oldXp,
          xpRequired: getXpRequired(oldLevel),
          donateReward: 0,
          reachedRewardLevels: [],
          donate: null,
          changed: false,
        };
      }

      await conn.query(
        `UPDATE characters
            SET xp = ?,
                level = ?,
                level_reward_claimed_level = ?
          WHERE uuid = ?`,
        [
          calculated.xp,
          calculated.level,
          nextClaimedLevel,
          uuid,
        ]
      );

      const donateResult = await applyDonateReward(
        conn,
        player,
        character,
        donateReward,
        reachedRewardLevels
      );

      await conn.commit();

      const progress = {
        uuid,
        accountId: Number(character.account_id || 0),
        level: calculated.level,
        oldLevel,
        xp: calculated.xp,
        xpRequired: calculated.xpRequired,
        donateReward,
        reachedRewardLevels,
        donate: donateResult.donate,
        changed: true,
      };

      syncPlayerLevel(player, progress);
      if (donateResult.donate != null) syncPlayerDonate(player, donateResult.donate);

      return progress;
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
}

async function grantPaydayExperience(player, totalOnlineSeconds) {
  await ensureSchema();

  const uuid = getUuid(player);
  const totalSeconds = Math.max(0, Math.floor(Number(totalOnlineSeconds || 0)));
  if (!uuid || totalSeconds < LEVEL_CONFIG.paydaySeconds) return null;

  return db.withConn(async (conn) => {
    await conn.beginTransaction();

    try {
      const [characterRows] = await conn.query(
        `SELECT uuid, account_id, xp, level, last_xp_payday_total_seconds, level_reward_claimed_level
           FROM characters
          WHERE uuid = ?
          LIMIT 1
          FOR UPDATE`,
        [uuid]
      );

      const character = characterRows[0];
      if (!character) {
        await conn.rollback();
        return null;
      }

      const lastPaydayTotalSeconds = Math.max(0, Number(character.last_xp_payday_total_seconds || 0));
      const oldPaydays = Math.floor(lastPaydayTotalSeconds / LEVEL_CONFIG.paydaySeconds);
      const newPaydays = Math.floor(totalSeconds / LEVEL_CONFIG.paydaySeconds);
      const paydaysToGrant = Math.max(0, newPaydays - oldPaydays);

      if (paydaysToGrant <= 0) {
        await conn.rollback();
        return null;
      }

      let level = Math.max(1, Math.floor(Number(character.level || 1)));
      let xp = Math.max(0, Math.floor(Number(character.xp || 0))) + paydaysToGrant * LEVEL_CONFIG.paydayXp;
      const oldLevel = level;

      const calculated = calculateProgress(level, xp);
      level = calculated.level;
      xp = calculated.xp;

      const rewardClaimedLevel = Math.max(0, Math.floor(Number(character.level_reward_claimed_level || 0)));
      const { donateReward, reachedRewardLevels } = getDonateRewardForLevels(rewardClaimedLevel, level);

      const nextClaimedLevel = level > rewardClaimedLevel ? level : rewardClaimedLevel;

      await conn.query(
        `UPDATE characters
            SET xp = ?,
                level = ?,
                last_xp_payday_total_seconds = ?,
                level_reward_claimed_level = ?
          WHERE uuid = ?`,
        [
          xp,
          level,
          newPaydays * LEVEL_CONFIG.paydaySeconds,
          nextClaimedLevel,
          uuid,
        ]
      );

      const donateResult = await applyDonateReward(conn, player, character, donateReward, reachedRewardLevels);

      await conn.commit();

      const progress = {
        uuid,
        accountId: Number(character.account_id || 0),
        level,
        oldLevel,
        xp,
        xpRequired: getXpRequired(level),
        paydaysGranted: paydaysToGrant,
        donateReward,
        reachedRewardLevels,
        donate: donateResult.donate,
      };

      syncPlayerLevel(player, progress);
      if (donateResult.donate != null) syncPlayerDonate(player, donateResult.donate);

      return progress;
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
}

module.exports = {
  LEVEL_CONFIG,
  ensureSchema,
  getProgress,
  getXpRequired,
  grantPaydayExperience,
  normalizeProgress,
};
