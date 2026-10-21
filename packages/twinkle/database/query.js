const db = require("./index");
const logsDb = require("./logs.js");
const { ensureTableSchema } = require("./schemaMigration.js");

const query = db.query;
const withConn = db.withConn;
let whitelistSchemaReady = false;
let bansSchemaReady = false;

async function ensureBansSchema(conn = null) {
  if (bansSchemaReady) return;
  const run = async (c) => {
    await c.query("CREATE DATABASE IF NOT EXISTS twinkle_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    await ensureTableSchema(c, `
      CREATE TABLE IF NOT EXISTS twinkle_admin.bans (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        account_id BIGINT UNSIGNED NULL,
        character_uuid BIGINT UNSIGNED NULL,
        social_club VARCHAR(128) NULL,
        social_club_id VARCHAR(128) NULL,
        hwid VARCHAR(255) NULL,
        ip VARCHAR(100) NULL,
        ban_type VARCHAR(32) NOT NULL DEFAULT 'character',
        reason VARCHAR(255) NULL,
        admin VARCHAR(128) NULL,
        date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        unban_date DATETIME NULL,
        PRIMARY KEY (id),
        INDEX idx_bans_account (account_id),
        INDEX idx_bans_character (character_uuid),
        INDEX idx_bans_hwid (hwid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  };
  if (conn) await run(conn);
  else await withConn(run);
  bansSchemaReady = true;
}

async function getAccountByLogin(login, conn = null) {
  const run = async (c) => {
    const [rows] = await c.query(
      "SELECT * FROM accounts WHERE login = ? LIMIT 1",
      [login]
    );

    return rows[0] || null;
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function getAccountBySocialClub(scid, conn = null) {
  const run = async (c) => {
    const [rows] = await c.query(
      "SELECT * FROM accounts WHERE social_club = ? LIMIT 1",
      [scid]
    );

    return rows[0] || null;
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function updateAuthSession(accountId, rememberMe, hwid, ip, conn = null) {
  const run = async (c) => {
    await c.query(
      "UPDATE accounts SET remember_me = ?, LastHwid = ?, LastIp = ? WHERE id = ?",
      [rememberMe, hwid, ip, accountId]
    );
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function checkLogin(login, password) {
  try {
    const account = await getAccountByLogin(login);

    if (!account) return null;

    const bcrypt = require("bcrypt");
    const savedPassword = String(account.password || "");

    let valid = false;

    if (
      savedPassword.startsWith("$2a$") ||
      savedPassword.startsWith("$2b$") ||
      savedPassword.startsWith("$2y$")
    ) {
      valid = await bcrypt.compare(password, savedPassword);
    } else {
      valid = savedPassword === password;
    }

    if (!valid) return null;

    return account;
  } catch (err) {
    console.log("[DB ERROR] checkLogin:", err.message);
    return null;
  }
}

async function getLastHwidByAccountId(accountId, conn) {
  const [rows] = await conn.query(
    "SELECT LastHwid FROM accounts WHERE id = ? LIMIT 1",
    [accountId]
  );

  return rows[0]?.LastHwid ?? null;
}

async function getAdminCharacterUuidByAccountId(accountId, conn) {
  const [rows] = await conn.query(
    `
    SELECT character_uuid AS uuid
    FROM twinkle_admin.admin_profiles
    WHERE account_id = ? AND is_active = 1 AND admin_level > 0
    LIMIT 1
    `,
    [accountId]
  );

  return rows[0]?.uuid ?? null;
}

async function updateAccountHwid(accountId, hwid, ip, conn) {
  await conn.query(
    "UPDATE accounts SET LastHwid = ?, LastIp = ?, LastLogin = NOW() WHERE id = ?",
    [hwid, ip, accountId]
  );
}

async function logHwidChange(accountId, oldHwid, newHwid, ip, conn) {
  await logsDb.logQuery(
    `
    INSERT INTO hwid_logs (account_id, old_hwid, new_hwid, ip, date)
    VALUES (?, ?, ?, ?, NOW())
    `,
    [accountId, oldHwid, newHwid, ip]
  );
}

async function insertBan(
  { accountId, characterUuid, socialClubId, hwid, reason, admin, unbanDate },
  conn
) {
  await ensureBansSchema(conn);
  await conn.query(
    `
    INSERT INTO twinkle_admin.bans (account_id, character_uuid, social_club, hwid, reason, admin, date, unban_date)
    VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
    `,
    [accountId, characterUuid, socialClubId, hwid, reason, admin, unbanDate]
  );
}

async function loginExists(login, conn) {
  const [rows] = await conn.query(
    "SELECT id FROM accounts WHERE login = ? LIMIT 1",
    [login]
  );

  return rows.length > 0;
}

async function scidExists(scid, conn) {
  const [rows] = await conn.query(
    "SELECT id FROM accounts WHERE social_club = ? LIMIT 1",
    [scid]
  );

  return rows.length > 0;
}

async function hwidExists(hwid, conn) {
  const [rows] = await conn.query(
    "SELECT id FROM accounts WHERE RegHwid = ? LIMIT 1",
    [hwid]
  );

  return rows.length > 0;
}

async function createAccount({ login, email, password, scid, hwid, ip, promocode }, conn) {
  const [result] = await conn.query(
    `
    INSERT INTO accounts
      (login, email, password, social_club, RegHwid, RegIP, promocode)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
    `,
    [login, email, password, scid, hwid, ip, promocode || null]
  );

  return result.insertId;
}

async function ensureWhitelistSchema(conn = null) {
  if (whitelistSchemaReady) return;

  const run = async (c) => {
    await c.query("CREATE DATABASE IF NOT EXISTS twinkle_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    await ensureTableSchema(c, `
      CREATE TABLE IF NOT EXISTS twinkle_admin.admin_whitelist_settings (
        id TINYINT NOT NULL PRIMARY KEY,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await ensureTableSchema(c, `
      CREATE TABLE IF NOT EXISTS twinkle_admin.admin_whitelist_entries (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        login VARCHAR(64) NULL,
        hwid VARCHAR(128) NULL,
        type VARCHAR(16) NOT NULL DEFAULT 'login',
        added_by VARCHAR(96) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        INDEX idx_admin_wl_login (login),
        INDEX idx_admin_wl_hwid (hwid),
        INDEX idx_admin_wl_type (type),
        INDEX idx_admin_wl_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [settingRows] = await c.query(
      "SELECT id FROM twinkle_admin.admin_whitelist_settings WHERE id = 1 LIMIT 1"
    );
    if (!settingRows.length) {
      await c.query(
        "INSERT INTO twinkle_admin.admin_whitelist_settings (id, enabled) VALUES (1, 0)"
      );
    }

    const [columns] = await c.query("SHOW COLUMNS FROM twinkle_admin.admin_whitelist_entries");
    const columnNames = new Set(columns.map((column) => column.Field));
    if (!columnNames.has("type")) {
      await c.query("ALTER TABLE twinkle_admin.admin_whitelist_entries ADD COLUMN type VARCHAR(16) NOT NULL DEFAULT 'login'");
    }
    if (!columnNames.has("added_by")) {
      await c.query("ALTER TABLE twinkle_admin.admin_whitelist_entries ADD COLUMN added_by VARCHAR(96) NULL");
    }
    if (!columnNames.has("created_at")) {
      await c.query("ALTER TABLE twinkle_admin.admin_whitelist_entries ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
    }
    if (!columnNames.has("is_active")) {
      await c.query("ALTER TABLE twinkle_admin.admin_whitelist_entries ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1");
    }

    await c.query(`
      UPDATE twinkle_admin.admin_whitelist_entries
         SET type = CASE
           WHEN COALESCE(NULLIF(TRIM(login), ''), '') <> '' AND COALESCE(NULLIF(TRIM(hwid), ''), '') <> '' THEN 'both'
           WHEN COALESCE(NULLIF(TRIM(hwid), ''), '') <> '' THEN 'hwid'
           ELSE 'login'
         END
       WHERE type IS NULL
          OR TRIM(type) = ''
          OR type NOT IN ('login', 'hwid', 'both')
          OR (type = 'both' AND (COALESCE(NULLIF(TRIM(login), ''), '') = '' OR COALESCE(NULLIF(TRIM(hwid), ''), '') = ''))
          OR (type = 'login' AND COALESCE(NULLIF(TRIM(login), ''), '') = '' AND COALESCE(NULLIF(TRIM(hwid), ''), '') <> '')
          OR (type = 'hwid' AND COALESCE(NULLIF(TRIM(hwid), ''), '') = '' AND COALESCE(NULLIF(TRIM(login), ''), '') <> '')
    `);
  };

  if (conn) {
    await run(conn);
  } else {
    await withConn(run);
  }

  whitelistSchemaReady = true;
}

async function isAccountWhitelisted(login, hwid, conn = null) {
  const cleanLogin = String(login || "").trim();
  const cleanHwid = String(hwid || "").trim().toUpperCase();

  const run = async (c) => {
    await ensureWhitelistSchema(c);

    const [settings] = await c.query(
      `SELECT enabled
         FROM twinkle_admin.admin_whitelist_settings
        WHERE id = 1
        LIMIT 1`
    );

    if (Number(settings?.[0]?.enabled ?? 1) !== 1) {
      return true;
    }

    const [rows] = await c.query(
      `SELECT id
         FROM twinkle_admin.admin_whitelist_entries
        WHERE is_active = 1
          AND (
            (
              COALESCE(type, 'login') = 'login'
              AND ? <> ''
              AND LOWER(TRIM(login)) = LOWER(?)
            ) OR (
              COALESCE(type, 'login') = 'hwid'
              AND ? <> ''
              AND UPPER(TRIM(hwid)) = UPPER(?)
            ) OR (
              COALESCE(type, 'login') = 'both'
              AND ? <> ''
              AND ? <> ''
              AND LOWER(TRIM(login)) = LOWER(?)
              AND UPPER(TRIM(hwid)) = UPPER(?)
            ) OR (
              COALESCE(type, 'login') = 'both'
              AND ? <> ''
              AND LOWER(TRIM(login)) = LOWER(?)
              AND COALESCE(NULLIF(TRIM(hwid), ''), '') = ''
            ) OR (
              COALESCE(type, 'login') = 'both'
              AND ? <> ''
              AND UPPER(TRIM(hwid)) = UPPER(?)
              AND COALESCE(NULLIF(TRIM(login), ''), '') = ''
            )
          )
        LIMIT 1`,
      [
        cleanLogin,
        cleanLogin,
        cleanHwid,
        cleanHwid,
        cleanLogin,
        cleanHwid,
        cleanLogin,
        cleanHwid,
        cleanLogin,
        cleanLogin,
        cleanHwid,
        cleanHwid,
      ]
    );

    return rows.length > 0;
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function getPromoByCode(code, conn) {
  const [rows] = await conn.query(
    "SELECT * FROM promo_codes WHERE code = ? AND is_active = 1 LIMIT 1",
    [String(code || "").toLowerCase()]
  );

  return rows[0] || null;
}

async function createPromoCode({ code, type, ownerCharacterUuid }, conn) {
  await conn.query(
    `
    INSERT INTO promo_codes (code, type, owner_character_uuid)
    VALUES (?, ?, ?)
    `,
    [String(code || "").toLowerCase(), type, ownerCharacterUuid]
  );
}

async function getCharacterPromoInfo(uuid, conn) {
  const [rows] = await conn.query(
    "SELECT uuid, level, promo_code, promo_rewarded FROM characters WHERE uuid = ? LIMIT 1",
    [uuid]
  );

  return rows[0] || null;
}

async function applyPromoToCharacter(uuid, code, conn) {
  const promo = await getPromoByCode(code, conn);

  if (!promo) {
    return {
      success: false,
      message: "Промокод не найден.",
    };
  }

  const character = await getCharacterPromoInfo(uuid, conn);

  if (!character) {
    return {
      success: false,
      message: "Персонаж не найден.",
    };
  }

  if (character.promo_code) {
    return {
      success: false,
      message: "Уже вводили промокод.",
    };
  }

  if (Number(promo.owner_character_uuid) === Number(uuid)) {
    return {
      success: false,
      message: "Нельзя свой промокод.",
    };
  }

  await conn.query(
    "UPDATE characters SET promo_code = ? WHERE uuid = ?",
    [String(code || "").toLowerCase(), uuid]
  );

  await conn.query(
    "UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?",
    [promo.id]
  );

  return {
    success: true,
    message: "Промокод активирован.",
  };
}

async function giveCharacterReward(uuid, reward, conn) {
  const [beforeRows] = await conn.query(
    `SELECT c.cash, c.bank, c.account_id, a.donate
       FROM characters c
       LEFT JOIN accounts a ON a.id = c.account_id
      WHERE c.uuid = ?
      LIMIT 1`,
    [uuid]
  );
  const before = beforeRows?.[0] || {};

  await conn.query(
    `
    UPDATE characters
    SET cash = cash + ?, bank = bank + ?
    WHERE uuid = ?
    `,
    [reward.cash || 0, reward.bank || 0, uuid]
  );

  if (Number(reward.cash || 0) !== 0) {
    await logsDb.writeMoneyLog({
      source: "promo",
      action: "reward",
      currency: "cash",
      amount: Number(reward.cash || 0),
      balanceBefore: Number(before.cash || 0),
      balanceAfter: Number(before.cash || 0) + Number(reward.cash || 0),
      targetUuid: uuid,
      accountId: before.account_id || null,
      comment: "Промокод",
      metadata: { reward },
    });
  }

  if (Number(reward.bank || 0) !== 0) {
    await logsDb.writeMoneyLog({
      source: "promo",
      action: "reward",
      currency: "bank",
      amount: Number(reward.bank || 0),
      balanceBefore: Number(before.bank || 0),
      balanceAfter: Number(before.bank || 0) + Number(reward.bank || 0),
      targetUuid: uuid,
      accountId: before.account_id || null,
      comment: "Промокод",
      metadata: { reward },
    });
  }

  if (Number(reward.tcoin || 0) !== 0) {
    await conn.query(
      `UPDATE accounts a
       JOIN characters c ON c.account_id = a.id
          SET a.donate = GREATEST(COALESCE(a.donate, 0) + ?, 0)
        WHERE c.uuid = ?`,
      [Number(reward.tcoin || 0), uuid]
    );
    await logsDb.writeDonateLog({
      source: "promo",
      action: "reward",
      amount: Number(reward.tcoin || 0),
      balanceBefore: Number(before.donate || 0),
      balanceAfter: Math.max(Number(before.donate || 0) + Number(reward.tcoin || 0), 0),
      targetUuid: uuid,
      accountId: before.account_id || null,
      comment: "Промокод",
      metadata: { reward },
    });
  }
}

async function setPromoRewarded(uuid, conn) {
  await conn.query(
    "UPDATE characters SET promo_rewarded = 1 WHERE uuid = ?",
    [uuid]
  );
}

async function addPromoRewardedCount(id, conn) {
  await conn.query(
    "UPDATE promo_codes SET rewarded_count = rewarded_count + 1 WHERE id = ?",
    [id]
  );
}

async function getPromoStatsByOwner(uuid, conn) {
  const [rows] = await conn.query(
    "SELECT * FROM promo_codes WHERE owner_character_uuid = ?",
    [uuid]
  );

  return rows;
}

async function getAllPromoStats(conn) {
  const [rows] = await conn.query("SELECT * FROM promo_codes");

  return rows;
}

async function getAccountByEmail(email, conn = null) {
  const sql = "SELECT * FROM accounts WHERE email = ? LIMIT 1";
  const params = [email];

  const run = async (c) => {
    const [rows] = await c.query(sql, params);
    return rows[0] || null;
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function createRecoveryCode(accountId, email, code, conn = null) {
  const sql = `
    INSERT INTO account_recovery_codes
      (account_id, email, code, used, expires_at)
    VALUES
      (?, ?, ?, 0, DATE_ADD(NOW(), INTERVAL 10 MINUTE))
  `;

  const params = [accountId, email, code];

  const run = async (c) => {
    await c.query(sql, params);
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function getValidRecoveryCode(email, code, conn = null) {
  const sql = `
    SELECT *
    FROM account_recovery_codes
    WHERE email = ?
      AND code = ?
      AND used = 0
      AND expires_at > NOW()
    ORDER BY id DESC
    LIMIT 1
  `;

  const params = [email, code];

  const run = async (c) => {
    const [rows] = await c.query(sql, params);
    return rows[0] || null;
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function consumeRecoveryCodeAndUpdatePassword(email, code, passwordHash, conn = null) {
  const run = async (c) => {
    await c.beginTransaction();

    try {
      const [recoveryRows] = await c.query(
        `SELECT id, account_id
           FROM account_recovery_codes
          WHERE email = ?
            AND code = ?
            AND used = 0
            AND expires_at > NOW()
          ORDER BY id DESC
          LIMIT 1
          FOR UPDATE`,
        [email, code]
      );
      const recovery = recoveryRows[0] || null;

      if (!recovery) {
        await c.rollback();
        return null;
      }

      const [consumeResult] = await c.query(
        `UPDATE account_recovery_codes
            SET used = 1
          WHERE id = ? AND used = 0`,
        [recovery.id]
      );

      if (Number(consumeResult.affectedRows || 0) !== 1) {
        await c.rollback();
        return null;
      }

      const [passwordResult] = await c.query(
        `UPDATE accounts
            SET password = ?, remember_me = 0
          WHERE id = ?`,
        [passwordHash, recovery.account_id]
      );

      if (Number(passwordResult.affectedRows || 0) !== 1) {
        throw new Error("RECOVERY_ACCOUNT_NOT_FOUND");
      }

      await c.commit();
      return recovery;
    } catch (error) {
      try {
        await c.rollback();
      } catch {}
      throw error;
    }
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function markRecoveryCodeUsed(id, conn = null) {
  const sql = "UPDATE account_recovery_codes SET used = 1 WHERE id = ?";
  const params = [id];

  const run = async (c) => {
    await c.query(sql, params);
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function updateAccountPassword(accountId, passwordHash, conn = null) {
  const sql = "UPDATE accounts SET password = ? WHERE id = ?";
  const params = [passwordHash, accountId];

  const run = async (c) => {
    await c.query(sql, params);
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function deleteExpiredRecoveryCodes(conn = null) {
  const sql = `
    DELETE FROM account_recovery_codes
    WHERE expires_at <= NOW() OR used = 1
  `;

  const run = async (c) => {
    await c.query(sql);
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function deleteActiveRecoveryCodes(email, conn = null) {
  const sql = `
    DELETE FROM account_recovery_codes
    WHERE email = ? AND used = 0
  `;

  const params = [email];

  const run = async (c) => {
    await c.query(sql, params);
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function getLastRecoveryCode(email, conn = null) {
  const sql = `
    SELECT *
    FROM account_recovery_codes
    WHERE email = ?
    ORDER BY id DESC
    LIMIT 1
  `;

  const params = [email];

  const run = async (c) => {
    const [rows] = await c.query(sql, params);
    return rows[0] || null;
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function getAccountCharacterSlots(accountId, conn = null) {
  const sql = `
    SELECT id, character1, character2, character3
    FROM accounts
    WHERE id = ?
    LIMIT 1
  `;

  const run = async (c) => {
    const [rows] = await c.query(sql, [accountId]);
    return rows[0] || null;
  };

  if (conn) return run(conn);
  return withConn(run);
}

const CHARACTER_COLUMNS = `
  uuid, account_id, username, lastname, gender, age,
  has_admin_profile,
  vip_type, vip_until,
  cash, bank, position, health, armor, xp, level,
  promo_code, promo_rewarded,
  has_fraction,
  create_date, last_play,
  customization, clothes, appearance,
  avatar
`;

async function loadFractionProfile(character, conn) {
  if (Number(character?.has_fraction || 0) !== 1) return null;

  const [rows] = await conn.query(
    `SELECT
       fm.id AS member_id,
       fm.fraction_id,
       fm.rank_index,
       fm.division,
       fm.invited_by_uuid,
       fm.joined_at,
       fm.leader_uuid,
       f.name AS fraction_name,
       f.short_name AS fraction_short_name,
       f.type AS fraction_type,
       f.color_hex AS fraction_color_hex,
       f.rage_color AS fraction_rage_color,
       fr.rank_name,
       fr.permissions AS rank_permissions,
       fr.is_leader
     FROM fraction_members fm
     JOIN fractions f
       ON f.fraction_id = fm.fraction_id AND f.is_active = 1
     LEFT JOIN fraction_ranks fr
       ON fr.fraction_id = fm.fraction_id
      AND fr.rank_index = fm.rank_index
     WHERE fm.character_uuid = ?
     LIMIT 1`,
    [Number(character.uuid)]
  );

  const profile = rows[0] || null;
  if (!profile) {
    character.has_fraction = 0;
    character.fraction_id = 0;
    character.fraction_rank = 0;
    await conn.query(
      "UPDATE characters SET has_fraction = 0 WHERE uuid = ?",
      [Number(character.uuid)]
    );
    return null;
  }

  character.fraction_id = Number(profile.fraction_id || 0);
  character.fraction_rank = Number(profile.rank_index || 0);
  return profile;
}

async function loadAdminProfile(character, conn) {
  if (Number(character?.has_admin_profile || 0) !== 1) return null;

  try {
    const [rows] = await conn.query(
      `SELECT
         id,
         account_id,
         character_uuid,
         admin_level,
         admsite_access,
         role_code,
         department_code,
         display_name,
         is_active,
         discord_id,
         avatar,
         last_login
       FROM twinkle_admin.admin_profiles
       WHERE is_active = 1
         AND (
           character_uuid = ?
           OR account_id = ?
         )
       ORDER BY (character_uuid = ?) DESC
       LIMIT 1`,
      [
        Number(character.uuid),
        Number(character.account_id),
        Number(character.uuid),
      ]
    );

    const profile = rows[0] || null;
    if (profile) {
      character.admin_level = Number(profile.admin_level || 0);
      return profile;
    }
  } catch (error) {
    console.warn(
      `[CHARACTER PROFILE] Admin profile load skipped for #${character.uuid}: ${error.code || error.message}`
    );
  }

  // Keep legacy game admins working even if their website profile has not
  // been created yet. Only clear a stale flag for non-admin characters.
  character.admin_level = 0;
  character.has_admin_profile = 0;
  await conn.query(
    "UPDATE characters SET has_admin_profile = 0 WHERE uuid = ?",
    [Number(character.uuid)]
  );
  return null;
}

async function hydrateCharacterProfiles(character, conn) {
  if (!character) return null;

  const fractionProfile = await loadFractionProfile(character, conn);
  const adminProfile = await loadAdminProfile(character, conn);

  character.fractionProfile = fractionProfile;
  character.adminProfile = adminProfile;
  return character;
}

async function getCharactersByIds(ids, conn = null) {
  const cleanIds = ids.filter((id) => Number(id) > 0);

  if (!cleanIds.length) return [];

  const placeholders = cleanIds.map(() => "?").join(",");

  const sql = `
    SELECT ${CHARACTER_COLUMNS}
    FROM characters
    WHERE uuid IN (${placeholders})
  `;

  const run = async (c) => {
    const [rows] = await c.query(sql, cleanIds);
    return rows;
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function getCharacterByUuid(uuid, accountId, conn = null) {
  const sql = `
    SELECT ${CHARACTER_COLUMNS}
    FROM characters
    WHERE uuid = ? AND account_id = ?
    LIMIT 1
  `;

  const run = async (c) => {
    const [rows] = await c.query(sql, [uuid, accountId]);
    return hydrateCharacterProfiles(rows[0] || null, c);
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function getActiveCharacterBan(characterUuid, conn = null) {
  const sql = `
    SELECT *
    FROM twinkle_admin.bans
    WHERE character_uuid = ?
      AND ban_type = 'ban'
      AND (unban_date IS NULL OR unban_date > NOW())
    ORDER BY id DESC
    LIMIT 1
  `;

  const run = async (c) => {
    await ensureBansSchema(c);
    const [rows] = await c.query(sql, [characterUuid]);
    return rows[0] || null;
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function getActiveAccountHardban(accountId, conn = null) {
  const sql = `
    SELECT *
    FROM twinkle_admin.bans
    WHERE account_id = ?
      AND ban_type = 'hardban'
      AND (unban_date IS NULL OR unban_date > NOW())
    ORDER BY id DESC
    LIMIT 1
  `;

  const run = async (c) => {
    await ensureBansSchema(c);
    const [rows] = await c.query(sql, [accountId]);
    return rows[0] || null;
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function updateCharacterAvatar(uuid, avatar, conn = null) {
  const sql = `
    UPDATE characters
    SET avatar = ?
    WHERE uuid = ?
  `;

  const run = async (c) => {
    await c.query(sql, [avatar, uuid]);
  };

  if (conn) return run(conn);
  return withConn(run);
}

async function markCharacterAvatarDirty(uuid, conn = null) {
  return Boolean(uuid || conn);
}

async function createCharacterInSlot(accountId, slotId, data) {
  return withConn(async (conn) => {
    const cleanAccountId = Number(accountId);
    const cleanSlotId = Number(slotId);
    const slotColumn = `character${cleanSlotId}`;

    if (!cleanAccountId) {
      throw new Error("ACCOUNT_NOT_FOUND");
    }

    if (!["character1", "character2", "character3"].includes(slotColumn)) {
      throw new Error("INVALID_SLOT");
    }

    await conn.beginTransaction();

    try {
      const [accounts] = await conn.query(
        `
        SELECT id, character1, character2, character3
        FROM accounts
        WHERE id = ?
        FOR UPDATE
        `,
        [cleanAccountId]
      );

      const account = accounts[0];

      if (!account) {
        throw new Error("ACCOUNT_NOT_FOUND");
      }

      const slotValue = Number(account[slotColumn] || 0);

      if (slotValue === -1) {
        throw new Error("SLOT_NOT_PURCHASED");
      }

      if (slotValue > 0) {
        throw new Error("SLOT_BUSY");
      }

      const firstName = String(data.firstName || "New").trim().slice(0, 32);
      const lastName = String(data.lastName || "Player").trim().slice(0, 32);
      const age = Math.max(18, Math.min(80, Number(data.age || 18)));
      const gender = data.gender === "female" ? "female" : "male";

      const customizationJson = JSON.stringify(data.customization || {});
      const clothesJson = JSON.stringify(data.clothes || {});
      const appearanceJson = JSON.stringify(data.appearance || {});

      const [result] = await conn.query(
        `
        INSERT INTO characters
          (
            account_id,
            username,
            lastname,
            age,
            gender,
            cash,
            bank,
            customization,
            clothes,
            appearance,
            health,
            armor,
            xp,
            level,
            has_admin_profile,
            has_fraction
          )
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          cleanAccountId,
          firstName,
          lastName,
          age,
          gender,
          0,
          0,
          customizationJson,
          clothesJson,
          appearanceJson,
          100,
          0,
          0,
          1,
          0,
          0,
        ]
      );

      const characterUuid = Number(result.insertId);

      if (!characterUuid) {
        throw new Error("CHARACTER_INSERT_FAILED");
      }

      await conn.query(
        `UPDATE accounts SET \`${slotColumn}\` = ? WHERE id = ?`,
        [characterUuid, cleanAccountId]
      );

      await conn.commit();

      console.log("[CREATE CHARACTER OK]", {
        accountId: cleanAccountId,
        slotId: cleanSlotId,
        slotColumn,
        characterUuid,
        firstName,
        lastName,
        gender,
      });

      return characterUuid;
    } catch (err) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("[CREATE CHARACTER ROLLBACK ERROR]", rollbackErr);
      }

      console.error("[CREATE CHARACTER DB ERROR]", {
        message: err.message,
        code: err.code,
        errno: err.errno,
        sqlMessage: err.sqlMessage,
      });

      throw err;
    }
  });
}

async function getHouseByOwner(ownerKey) {
  const rows = await query(
    `
    SELECT id
    FROM houses
    WHERE owner = ?
    LIMIT 1
    `,
    [String(ownerKey)]
  );

  return rows?.[0] || null;
}

async function getApartmentByOwner(characterUuid, ownerName) {
  const rows = await query(
    `
    SELECT id
    FROM condos
    WHERE user_id = ?
    LIMIT 1
    `,
    [Number(characterUuid || 0)]
  );

  return rows?.[0] || null;
}

async function getAccountDonate(accountId) {
  try {
    const rows = await db.query(
      "SELECT donate FROM accounts WHERE id = ? LIMIT 1",
      [Number(accountId)]
    );

    const row = Array.isArray(rows) ? rows[0] : null;

    return Math.max(0, Number(row?.donate || 0));
  } catch (err) {
    console.error("[DONATE] getAccountDonate error:", err);
    return 0;
  }
}

module.exports = {
  withConn,
  query,

  ensureWhitelistSchema,
  ensureBansSchema,
  isAccountWhitelisted,
  getAccountByLogin,
  getAccountBySocialClub,
  updateAuthSession,
  checkLogin,
  getLastHwidByAccountId,
  getAdminCharacterUuidByAccountId,
  updateAccountHwid,
  logHwidChange,
  insertBan,
  loginExists,
  scidExists,
  hwidExists,
  createAccount,

  getPromoByCode,
  createPromoCode,
  getCharacterPromoInfo,
  applyPromoToCharacter,
  giveCharacterReward,
  setPromoRewarded,
  addPromoRewardedCount,
  getPromoStatsByOwner,
  getAllPromoStats,

  getAccountByEmail,
  createRecoveryCode,
  getValidRecoveryCode,
  consumeRecoveryCodeAndUpdatePassword,
  markRecoveryCodeUsed,
  updateAccountPassword,
  deleteExpiredRecoveryCodes,
  deleteActiveRecoveryCodes,
  getLastRecoveryCode,

  getAccountCharacterSlots,
  getCharactersByIds,
  getCharacterByUuid,
  hydrateCharacterProfiles,
  getActiveCharacterBan,
  getActiveAccountHardban,

  updateCharacterAvatar,
  markCharacterAvatarDirty,
  createCharacterInSlot,
  getHouseByOwner,
  getApartmentByOwner,
  getAccountDonate,
};

