"use strict";

const db = require("../../database/query.js");
const logsDb = require("../../database/logs.js");
const {
  rows,
  parseJson,
  parsePositiveAmount,
  playerUuid,
  playerAdminLevel,
  playerFractionId,
  displayName,
  loadCharacterNames,
} = require("../../utils/player.js");
const { sanitizePayload } = require("../../utils/text.js");

const PERMISSIONS = [
  ["invite", "Принимать в организацию"],
  ["dismiss", "Увольнять из организации"],
  ["warn", "Выдавать предупреждения"],
  ["storage", "Использовать склад"],
  ["depositBalance", "Пополнять казну"],
  ["withdrawBalance", "Снимать из казны"],
  ["bonus", "Выдавать премии"],
  ["changeRank", "Изменять ранги"],
  ["manageDepartments", "Управлять отделами"],
  ["respawnTransport", "Возвращать транспорт"],
  ["territoryWar", "Начинать захват территории"],
  ["orderMaterials", "Заказывать материалы для госорганизаций"],
  ["manageDecrees", "Создавать и редактировать указы"],
  ["blacklist", "Управлять чёрным списком"],
];

const STATE_FACTION_TYPES = new Set(["state", "adm", "government", "governmental"]);
const CRIME_FACTION_TYPES = new Set(["ghetto", "gang", "crime", "mafia", "банда"]);

let schemaPromise = null;
const TABLET_CACHE_TTL_MS = 15000;
const TABLET_SUBSCRIPTION_TTL_MS = 45000;
const FRACTION_REFRESH_DEBOUNCE_MS = 100;
const tabletCache = new Map();
const tabletSubscriptions = new Map();
const fractionRefreshes = new Map();
const tabletFractionRevisions = new Map();
let tabletGlobalRevision = 0;
let tabletPayloadVersion = 1;

function logActorName(entry, names) {
  return displayName(names.get(Number(entry.actor_uuid || 0)) || entry);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function ensureSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS fraction_blacklist (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        fraction_id INT NOT NULL,
        character_uuid BIGINT NOT NULL,
        issuer_uuid BIGINT NOT NULL,
        comment VARCHAR(255) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        removed_at DATETIME NULL,
        UNIQUE KEY uq_fraction_blacklist (fraction_id, character_uuid),
        INDEX idx_fraction_blacklist_active (fraction_id, is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS fraction_departments (
        department_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        fraction_id INT NOT NULL,
        code VARCHAR(32) NOT NULL,
        name VARCHAR(96) NOT NULL,
        description VARCHAR(255) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_fraction_department_code (fraction_id, code),
        INDEX idx_fraction_departments (fraction_id, is_active, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS fraction_storage_items (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        fraction_id INT NOT NULL,
        item_key VARCHAR(64) NOT NULL,
        item_name VARCHAR(128) NOT NULL,
        category VARCHAR(32) NOT NULL DEFAULT 'materials',
        amount INT NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_fraction_storage_item (fraction_id, item_key),
        INDEX idx_fraction_storage_category (fraction_id, category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const departmentCodeCollation = await db.query("SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fraction_departments' AND COLUMN_NAME = 'code' LIMIT 1");
    if (rows(departmentCodeCollation)?.[0]?.COLLATION_NAME !== "utf8mb4_unicode_ci") {
      await db.query("ALTER TABLE fraction_departments MODIFY code VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL");
    }
    await logsDb.ensureLogsSchema();

    const fractionColumns = await db.query("SHOW COLUMNS FROM fractions");
    const fractionColumnNames = new Set(rows(fractionColumns).map((column) => column.Field));
    if (!fractionColumnNames.has("color_hex")) {
      await db.query("ALTER TABLE fractions ADD COLUMN color_hex VARCHAR(7) NULL");
    }
    if (!fractionColumnNames.has("rage_color")) {
      await db.query("ALTER TABLE fractions ADD COLUMN rage_color INT NULL DEFAULT NULL");
    }

    const characterColumns = await db.query("SHOW COLUMNS FROM characters");
    const characterColumnNames = new Set(rows(characterColumns).map((column) => column.Field));
    const requiredCharacterColumns = {
      online_today_seconds: "INT NOT NULL DEFAULT 0",
      online_month_seconds: "INT NOT NULL DEFAULT 0",
      online_total_seconds: "INT NOT NULL DEFAULT 0",
      online_stat_date: "DATE NULL",
      online_stat_month: "CHAR(7) NULL",
      online_reward_claimed_date: "DATE NULL",
    };
    for (const [column, definition] of Object.entries(requiredCharacterColumns)) {
      if (!characterColumnNames.has(column)) {
        await db.query(`ALTER TABLE characters ADD COLUMN ${column} ${definition}`);
      }
    }

    const requiredColumns = {
      fraction_members: {
        warn_count: "INT NOT NULL DEFAULT 0",
        last_seen_at: "DATETIME NULL",
      },
      fraction_blacklist: {
        issuer_uuid: "BIGINT NOT NULL DEFAULT 0",
        comment: "VARCHAR(255) NULL",
        is_active: "TINYINT(1) NOT NULL DEFAULT 1",
        created_at: "DATETIME NULL DEFAULT CURRENT_TIMESTAMP",
        removed_at: "DATETIME NULL",
      },
    };

    for (const [table, columns] of Object.entries(requiredColumns)) {
      const existing = await db.query(`SHOW COLUMNS FROM \`${table}\``);
      const names = new Set(rows(existing).map((column) => column.Field));
      for (const [column, definition] of Object.entries(columns)) {
        if (!names.has(column)) {
          await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
        }
      }
    }

    const defaultColors = {
      8: ["#e53935", 1],
      9: ["#ae00ff", 7],
      10: ["#f4c430", 5],
      11: ["#2388ff", 3],
      12: ["#34c759", 2],
    };
    for (const [fractionId, [hex, rageColor]] of Object.entries(defaultColors)) {
      await db.query(
        `UPDATE fractions
            SET color_hex = COALESCE(NULLIF(color_hex, ''), ?),
                rage_color = COALESCE(rage_color, ?)
          WHERE fraction_id = ?`,
        [hex, rageColor, Number(fractionId)]
      );
    }

    const stateTableExists = (rows(await db.query("SHOW TABLES LIKE 'fraction_member_state'")) || []).length > 0;
    if (stateTableExists) {
      await db.query(`
        UPDATE fraction_members fm
        JOIN fraction_member_state fs ON fs.character_uuid = fm.character_uuid
           SET fm.warn_count = GREATEST(COALESCE(fm.warn_count, 0), COALESCE(fs.warn_count, 0)),
               fm.last_seen_at = COALESCE(fm.last_seen_at, fs.last_seen_at)
      `);
    }

    const fractionsResult = await db.query("SELECT fraction_id FROM fractions WHERE is_active = 1");
    for (const fraction of rows(fractionsResult) || []) {
      const fractionId = Number(fraction.fraction_id || 0);
      if (!fractionId) continue;
      const defaults = [
        ["materials", "Материалы", "materials"],
        ["money", "Деньги склада", "money"],
        ["weapons", "Оружие и боеприпасы", "weapons"],
      ];
      for (const [itemKey, itemName, category] of defaults) {
        await db.query(
          `INSERT INTO fraction_storage_items
             (fraction_id, item_key, item_name, category, amount)
           VALUES (?, ?, ?, ?, 0)
           ON DUPLICATE KEY UPDATE item_name = VALUES(item_name), category = VALUES(category)`,
          [fractionId, itemKey, itemName, category]
        );
      }
    }
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

async function getMembershipByUuid(uuid) {
  await ensureSchema();
  const result = await db.query(
    `SELECT fm.fraction_id, fm.character_uuid, fm.rank_index, fm.division,
            fr.rank_name, fr.permissions, fr.is_leader,
            f.name AS fraction_name, f.short_name, f.type, f.balance,
            f.color_hex, f.rage_color,
            f.settings, f.leader_uuid
       FROM fraction_members fm
       JOIN fractions f ON f.fraction_id = fm.fraction_id
       LEFT JOIN fraction_ranks fr
         ON fr.fraction_id = fm.fraction_id AND fr.rank_index = fm.rank_index
      WHERE fm.character_uuid = ? AND f.is_active = 1
      LIMIT 1`,
    [Number(uuid)]
  );
  return rows(result)?.[0] || null;
}

async function getActor(player, requestedFractionId = 0) {
  const uuid = playerUuid(player);
  if (!uuid) throw new Error("Персонаж не загружен.");
  const membership = await getMembershipByUuid(uuid);
  if (!membership) throw new Error("Вы не состоите во фракции.");
  if (requestedFractionId && Number(membership.fraction_id) !== Number(requestedFractionId)) {
    throw new Error("Нет доступа к этой фракции.");
  }
  return {
    ...membership,
    uuid,
    adminLevel: playerAdminLevel(player),
    permissionMap: parseJson(membership.permissions, {}),
  };
}

function hasPermission(actor, permission) {
  if (actor.adminLevel >= 7 || Number(actor.is_leader) === 1) return true;
  return actor.permissionMap?.[permission] === true;
}

function factionKind(type) {
  const normalizedType = String(type || "").trim().toLowerCase();
  if (STATE_FACTION_TYPES.has(normalizedType)) return "state";
  if (CRIME_FACTION_TYPES.has(normalizedType)) return "crime";
  return "organization";
}

async function isPlayerFactionKind(player, expectedKind) {
  const uuid = playerUuid(player);
  if (!uuid) return false;
  const membership = await getMembershipByUuid(uuid);
  return Boolean(membership && factionKind(membership.type) === String(expectedKind || ""));
}

function requirePermission(actor, permission) {
  if (!hasPermission(actor, permission)) {
    throw new Error("У вашего ранга нет такого права.");
  }
}

async function rankBounds(fractionId) {
  const result = await db.query(
    `SELECT MIN(rank_index) AS min_rank, MAX(rank_index) AS max_rank
       FROM fraction_ranks WHERE fraction_id = ?`,
    [fractionId]
  );
  const row = rows(result)?.[0] || {};
  return { min: Number(row.min_rank || 1), max: Number(row.max_rank || 1) };
}

async function logMember(fractionId, characterUuid, actor, action, comment = "") {
  await logsDb.logQuery(
    `INSERT INTO fraction_member_history
       (fraction_id, character_uuid, actor_uuid, actor_rank, action, comment)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      fractionId,
      characterUuid,
      actor?.uuid || null,
      actor?.rank_index || null,
      action,
      String(comment || "").slice(0, 255) || null,
    ]
  );
}

function syncOnlinePlayerMembership(characterUuid, fractionId, fractionRank) {
  const targetUuid = Number(characterUuid || 0);
  const normalizedFractionId = Math.max(0, Number(fractionId || 0));
  const normalizedRank = Math.max(0, Number(fractionRank || 0));
  if (!targetUuid) return false;

  let synchronized = false;
  try {
    mp.players.forEach((player) => {
      if (synchronized || playerUuid(player) !== targetUuid) return;

      player.fraction = normalizedFractionId;
      player.fractionId = normalizedFractionId;
      player.fractionRank = normalizedRank;
      if (player.character) {
        player.character.has_fraction = normalizedFractionId ? 1 : 0;
        player.character.fraction_id = normalizedFractionId;
        player.character.fraction_rank = normalizedRank;
      }
      if (player.characterData) {
        player.characterData.has_fraction = normalizedFractionId ? 1 : 0;
        player.characterData.fraction_id = normalizedFractionId;
        player.characterData.fraction_rank = normalizedRank;
      }

      try {
        player.setVariable("fractionId", normalizedFractionId);
        player.setVariable("fractionRank", normalizedRank);
      } catch (error) {
        console.error("[FRACTION] runtime membership variable sync error:", error);
      }
      synchronized = true;
    });
  } catch (error) {
    console.error("[FRACTION] online membership sync error:", error);
  }

  return synchronized;
}

async function setPlayerFraction(characterUuid, fractionId, rankIndex = 1, invitedByUuid = null) {
  await ensureSchema();
  const uuid = Number(characterUuid);
  const faction = Number(fractionId);
  const rank = Number(rankIndex);
  if (!uuid || !faction || !rank) throw new Error("Некорректные данные фракции.");

  await db.withConn(async (conn) => {
    await conn.beginTransaction();
    try {
      const [characterRows] = await conn.query(
        "SELECT uuid FROM characters WHERE uuid = ? FOR UPDATE",
        [uuid]
      );
      if (!characterRows?.length) throw new Error("Персонаж не найден.");

      const [membershipRows] = await conn.query(
        "SELECT fraction_id FROM fraction_members WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
        [uuid]
      );
      if (membershipRows?.length) throw new Error("Игрок уже состоит во фракции.");

      const [fractionRows] = await conn.query(
        "SELECT fraction_id FROM fractions WHERE fraction_id = ? AND is_active = 1 LIMIT 1",
        [faction]
      );
      if (!fractionRows?.length) throw new Error("Фракция недоступна.");

      const [rankRows] = await conn.query(
        "SELECT rank_index FROM fraction_ranks WHERE fraction_id = ? AND rank_index = ? LIMIT 1",
        [faction, rank]
      );
      if (!rankRows?.length) throw new Error("Начальный ранг фракции не найден.");

      const [blacklistRows] = await conn.query(
        `SELECT id FROM fraction_blacklist
          WHERE fraction_id = ? AND character_uuid = ? AND is_active = 1
          LIMIT 1`,
        [faction, uuid]
      );
      if (blacklistRows?.length) throw new Error("Игрок находится в чёрном списке этой фракции.");

      await conn.query(
        `INSERT INTO fraction_members
           (fraction_id, character_uuid, rank_index, invited_by_uuid, joined_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [faction, uuid, rank, invitedByUuid || null]
      );
      await conn.query(
        `UPDATE characters
            SET has_fraction = 1, fraction_id = ?, fraction_rank = ?
          WHERE uuid = ?`,
        [faction, rank, uuid]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });

  syncOnlinePlayerMembership(uuid, faction, rank);
}

function onlineUuids() {
  const map = new Set();
  try {
    mp.players.forEach((player) => {
      const uuid = playerUuid(player);
      if (uuid) map.add(uuid);
    });
  } catch {}
  return map;
}

async function buildOrganization(player) {
  const actor = await getActor(player);
  const fractionId = Number(actor.fraction_id);
  const online = onlineUuids();

  const [
    memberResult,
    rankResult,
    departmentResult,
    historyResult,
    balanceResult,
    blacklistResult,
    storageItemsResult,
    storageLogsResult,
  ] = await Promise.all([
    db.query(
      `SELECT fm.character_uuid, fm.rank_index, fm.division, fm.invited_by_uuid, fm.joined_at,
              c.username, c.lastname,
              COALESCE(c.online_today_seconds, 0) AS online_today_seconds,
              COALESCE(c.online_month_seconds, 0) AS online_month_seconds,
              fr.rank_name,
              COALESCE(fm.warn_count, 0) AS warn_count,
              fm.last_seen_at,
              inviter.username AS inviter_username, inviter.lastname AS inviter_lastname
         FROM fraction_members fm
         JOIN characters c ON c.uuid = fm.character_uuid
         LEFT JOIN fraction_ranks fr
           ON fr.fraction_id = fm.fraction_id AND fr.rank_index = fm.rank_index
         LEFT JOIN characters inviter ON inviter.uuid = fm.invited_by_uuid
        WHERE fm.fraction_id = ?
        ORDER BY fm.rank_index DESC, c.username ASC`,
      [fractionId]
    ),
    db.query(
      `SELECT rank_id, rank_index, rank_name, salary, permissions, is_leader
         FROM fraction_ranks WHERE fraction_id = ? ORDER BY rank_index DESC`,
      [fractionId]
    ),
    db.query(
      `SELECT d.department_id, d.code, d.name, d.description,
              d.sort_order, d.is_active,
              COUNT(fm.character_uuid) AS member_count
         FROM fraction_departments d
         LEFT JOIN fraction_members fm
           ON fm.fraction_id = d.fraction_id
          AND fm.division COLLATE utf8mb4_unicode_ci = d.code COLLATE utf8mb4_unicode_ci
        WHERE d.fraction_id = ?
        GROUP BY d.department_id
        ORDER BY d.is_active DESC, d.sort_order ASC, d.name ASC`,
      [fractionId]
    ),
    logsDb.logQuery(
      `SELECT h.*
         FROM fraction_member_history h
        WHERE h.fraction_id = ?
        ORDER BY h.id DESC LIMIT 250`,
      [fractionId]
    ),
    logsDb.logQuery(
      `SELECT l.*
         FROM fraction_balance_logs l
        WHERE l.fraction_id = ?
        ORDER BY l.id DESC LIMIT 250`,
      [fractionId]
    ),
    db.query(
      `SELECT b.*, target.username, target.lastname,
              issuer.username AS issuer_username, issuer.lastname AS issuer_lastname
         FROM fraction_blacklist b
         JOIN characters target ON target.uuid = b.character_uuid
         LEFT JOIN characters issuer ON issuer.uuid = b.issuer_uuid
        WHERE b.fraction_id = ?
        ORDER BY b.id DESC LIMIT 250`,
      [fractionId]
    ),
    db.query(
      `SELECT item_key, item_name, category, amount
         FROM fraction_storage_items
        WHERE fraction_id = ?
        ORDER BY category ASC, item_name ASC`,
      [fractionId]
    ),
    logsDb.logQuery(
      `SELECT l.*
         FROM fraction_storage_logs l
        WHERE l.fraction_id = ?
        ORDER BY l.id DESC LIMIT 250`,
      [fractionId]
    ),
  ]);

  const members = rows(memberResult) || [];
  const ranks = rows(rankResult) || [];
  const departments = rows(departmentResult) || [];
  const histories = rows(historyResult) || [];
  const balanceLogs = rows(balanceResult) || [];
  const blacklistRows = rows(blacklistResult) || [];
  const storageItems = rows(storageItemsResult) || [];
  const storageLogs = rows(storageLogsResult) || [];
  const logNames = await loadCharacterNames([
    ...histories.map((entry) => entry.actor_uuid),
    ...balanceLogs.map((entry) => entry.actor_uuid),
    ...storageLogs.map((entry) => entry.actor_uuid),
  ]);
  const historyByMember = new Map();

  for (const entry of histories) {
    const key = Number(entry.character_uuid);
    if (!historyByMember.has(key)) historyByMember.set(key, []);
    historyByMember.get(key).push({
      id: entry.id,
      leader: logActorName(entry, logNames),
      uid: Number(entry.actor_uuid || 0),
      rank: Number(entry.actor_rank || 0),
      action: entry.action,
      comment: entry.comment || undefined,
      dateTime: formatDate(entry.created_at),
    });
  }

  const mappedMembers = members.map((member, index) => {
    const uuid = Number(member.character_uuid);
    const isOnline = online.has(uuid);
    const inviter = `${member.inviter_username || ""} ${member.inviter_lastname || ""}`.trim();
    return {
      id: index + 1,
      name: displayName(member),
      uid: uuid,
      role: member.rank_name || `Ранг ${member.rank_index}`,
      rank: Number(member.rank_index),
      departmentCode: member.division || "",
      departmentName: departments.find((department) => department.code === member.division)?.name || member.division || "",
      todayOnline: `${Math.floor(Number(member.online_today_seconds) / 3600)}ч. ${Math.floor((Number(member.online_today_seconds) % 3600) / 60)}мин.`,
      monthOnline: `${Math.floor(Number(member.online_month_seconds) / 3600)}ч. ${Math.floor((Number(member.online_month_seconds) % 3600) / 60)}мин.`,
      lastSeen: isOnline ? "Сейчас в игре" : formatDate(member.last_seen_at || member.joined_at),
      online: isOnline,
      invitedBy: inviter || undefined,
      warnCount: Number(member.warn_count || 0),
      history: historyByMember.get(uuid) || [],
    };
  });

  const permissionGroups = PERMISSIONS.map(([id, label]) => ({
    id,
    label,
    enabledRanks: ranks
      .filter((rank) => Number(rank.is_leader) === 1 || parseJson(rank.permissions, {})[id] === true)
      .map((rank) => Number(rank.rank_index)),
  }));

  const settings = parseJson(actor.settings, {});
  const kind = factionKind(actor.type);
  const actorName = mappedMembers.find((member) => member.uid === actor.uuid)?.name || `#${actor.uuid}`;
  const actorRankName = actor.rank_name || `Ранг ${actor.rank_index}`;
  const activeBlacklist = blacklistRows.filter((entry) => Number(entry.is_active) === 1);
  const historyBlacklist = blacklistRows.filter((entry) => Number(entry.is_active) !== 1);
  const mapBlacklist = (entry) => ({
    id: entry.id,
    playerName: displayName(entry),
    playerUid: Number(entry.character_uuid),
    issuerName: displayName({
      username: entry.issuer_username,
      lastname: entry.issuer_lastname,
      character_uuid: entry.issuer_uuid,
    }),
    issuerUid: Number(entry.issuer_uuid),
    comment: entry.comment || "",
    dateTime: formatDate(entry.created_at),
  });
  const storageTotals = storageItems.reduce(
    (total, item) => {
      const amount = Number(item.amount || 0);
      if (item.category === "money") total.money += amount;
      else if (item.category === "weapons") total.weapons += amount;
      else total.materials += amount;
      return total;
    },
    { materials: 0, money: 0, weapons: 0 }
  );
  const capabilities = Object.fromEntries(PERMISSIONS.map(([id]) => [id, hasPermission(actor, id)]));
  capabilities.settings = Boolean(hasPermission(actor, "manageDepartments") || actor.adminLevel >= 7 || Number(actor.is_leader) === 1);
  capabilities.roleMatrix = Boolean(actor.adminLevel >= 7 || Number(actor.is_leader) === 1);

  return {
    id: String(fractionId),
    name: actor.fraction_name,
    type: kind === "crime"
      ? "gang"
      : kind === "state"
        ? "state"
        : String(actor.type || "organization"),
    members: mappedMembers,
    departments: departments.map((department) => ({
      id: Number(department.department_id),
      code: department.code,
      name: department.name,
      description: department.description || "",
      memberCount: Number(department.member_count || 0),
      sortOrder: Number(department.sort_order || 0),
      enabled: Number(department.is_active) === 1,
    })),
    storage: {
      totals: storageTotals,
      items: storageItems.map((item) => ({
        key: item.item_key,
        name: item.item_name,
        category: item.category,
        amount: Number(item.amount || 0),
      })),
    },
    storageLogs: storageLogs.map((entry) => ({
      id: entry.id,
      name: entry.actor_uuid ? logActorName(entry, logNames) : "Система",
      uid: entry.actor_uuid ? Number(entry.actor_uuid) : 0,
      rank: entry.actor_rank == null ? "" : Number(entry.actor_rank),
      action: entry.action,
      amount: Number(entry.amount || 0),
      itemName: entry.item_name,
      dateTime: formatDate(entry.created_at),
    })),
    balance: Number(actor.balance || 0),
    balanceLogs: balanceLogs.map((entry) => ({
      id: entry.id,
      name: entry.actor_uuid ? logActorName(entry, logNames) : undefined,
      uid: entry.actor_uuid ? Number(entry.actor_uuid) : undefined,
      rank: entry.actor_rank == null ? undefined : Number(entry.actor_rank),
      transactionType: entry.transaction_type,
      comment: entry.comment || undefined,
      amount: Number(entry.amount),
      dateTime: formatDate(entry.created_at),
    })),
    bonusLogs: balanceLogs
      .filter((entry) => entry.transaction_type === "bonus" || entry.transaction_type === "massBonus")
      .map((entry) => ({
        id: entry.id,
        issuerName: logActorName(entry, logNames),
        issuerUid: Number(entry.actor_uuid || 0),
        issuerRank: Number(entry.actor_rank || 0),
        recipientName: entry.comment || "Участник",
        recipientUid: 0,
        recipientRank: 0,
        comment: entry.comment || "",
        amount: Math.abs(Number(entry.amount)),
        dateTime: formatDate(entry.created_at),
      })),
    blacklist: {
      entries: activeBlacklist.map(mapBlacklist),
      history: historyBlacklist.map(mapBlacklist),
      candidates: [],
    },
    info: {
      isCreator: Number(actor.is_leader) === 1,
      rank: Number(actor.rank_index),
      playerName: actorName,
      rankName: actorRankName,
      label: actor.short_name || actor.fraction_name,
      subtitle: String(actor.type || "Организация"),
      level: Number(settings.level || 1),
      levelProgress: Number(settings.levelProgress || 0),
      levelTarget: Number(settings.levelTarget || 100),
      reputation: Number(settings.reputation || 0),
      balance: Number(actor.balance || 0),
      donations: Number(settings.donations || 0),
      memberSlotsUsed: mappedMembers.length,
      memberSlotsTotal: Number(settings.memberSlots || 50),
      garageSlotsUsed: 0,
      garageSlotsTotal: Number(settings.garageSlots || 10),
      bills: [],
    },
    settings: {
      ranks: ranks.map((rank) => ({
        id: Number(rank.rank_index),
        rank: Number(rank.rank_index),
        name: rank.rank_name || `Ранг ${rank.rank_index}`,
      })),
      rolePermissions: permissionGroups,
      itemAccess: [],
      vehicleAccess: [],
      realEstate: [],
      vehicles: [],
    },
    capabilities,
  };
}

function emptyTabletPayload(reason = "no_fraction") {
  return {
    organizations: [],
    activeOrganizationId: null,
    meta: {
      reason,
      version: tabletPayloadVersion++,
      updatedAt: new Date().toISOString(),
      ttlMs: TABLET_CACHE_TTL_MS,
    },
  };
}

function organizationTabletPayload(organization, reason = "refresh") {
  return {
    organizations: [organization],
    organization,
    // Membership data must not control CEF navigation. The organization is
    // opened only after the player selects its icon in the tablet.
    activeOrganizationId: null,
    meta: {
      reason,
      version: tabletPayloadVersion++,
      updatedAt: new Date().toISOString(),
      ttlMs: TABLET_CACHE_TTL_MS,
    },
  };
}

function cacheKey(player) {
  const uuid = playerUuid(player);
  return uuid ? String(uuid) : "";
}

function setTabletSubscription(player, active) {
  const key = cacheKey(player);
  if (!key) return;

  if (!active) {
    tabletSubscriptions.delete(key);
    return;
  }

  tabletSubscriptions.set(key, {
    playerId: Number(player?.id),
    expiresAt: Date.now() + TABLET_SUBSCRIPTION_TTL_MS,
  });
}

function isTabletSubscribed(player) {
  const key = cacheKey(player);
  const subscription = key ? tabletSubscriptions.get(key) : null;
  if (!subscription) return false;

  if (
    subscription.expiresAt <= Date.now()
    || subscription.playerId !== Number(player?.id)
  ) {
    tabletSubscriptions.delete(key);
    return false;
  }

  return true;
}

function invalidateTabletCache(fractionId = 0) {
  const targetFractionId = Number(fractionId || 0);
  if (targetFractionId) {
    tabletFractionRevisions.set(
      targetFractionId,
      Number(tabletFractionRevisions.get(targetFractionId) || 0) + 1
    );
  } else {
    tabletGlobalRevision += 1;
  }

  for (const [key, entry] of tabletCache.entries()) {
    if (!targetFractionId || Number(entry.fractionId || 0) === targetFractionId) {
      tabletCache.delete(key);
    }
  }
}

function tabletRevision(fractionId) {
  return {
    global: tabletGlobalRevision,
    fraction: Number(tabletFractionRevisions.get(Number(fractionId || 0)) || 0),
  };
}

function isTabletRevisionCurrent(fractionId, revision) {
  const current = tabletRevision(fractionId);
  return current.global === revision.global && current.fraction === revision.fraction;
}

async function getTabletPayload(player, options = {}) {
  const key = cacheKey(player);
  if (!key) return emptyTabletPayload("character_not_loaded");

  const now = Date.now();
  const cached = tabletCache.get(key);
  // A forced trusted refresh may bypass a completed cache entry, but it must
  // never create a second concurrent organization build for the same player.
  if (cached?.promise) {
    return cached.promise;
  }
  if (!options.force && cached?.payload && cached.expiresAt > now) {
    return cached.payload;
  }

  const buildFractionId = playerFractionId(player);
  const buildRevision = tabletRevision(buildFractionId);

  const promise = (async () => {
    try {
      const organization = await buildOrganization(player);
      if (!isTabletRevisionCurrent(buildFractionId, buildRevision)) {
        const current = tabletCache.get(key);
        if (current?.promise === promise) tabletCache.delete(key);
        return getTabletPayload(player, {
          ...options,
          force: false,
          reason: "mutation_retry",
        });
      }

      const payload = organizationTabletPayload(organization, options.reason || "refresh");
      tabletCache.set(key, {
        payload,
        fractionId: Number(organization.id || playerFractionId(player) || 0),
        expiresAt: Date.now() + TABLET_CACHE_TTL_MS,
      });
      return payload;
    } catch (error) {
      if (!isTabletRevisionCurrent(buildFractionId, buildRevision)) {
        const current = tabletCache.get(key);
        if (current?.promise === promise) tabletCache.delete(key);
        return getTabletPayload(player, {
          ...options,
          force: false,
          reason: "mutation_retry",
        });
      }

      const message = String(error?.message || "");
      if (message.includes("не состоите") || message.includes("Персонаж не загружен")) {
        const payload = emptyTabletPayload(message.includes("Персонаж") ? "character_not_loaded" : "no_fraction");
        tabletCache.set(key, {
          payload,
          fractionId: 0,
          expiresAt: Date.now() + TABLET_CACHE_TTL_MS,
        });
        return payload;
      }
      throw error;
    }
  })();

  tabletCache.set(key, {
    ...(cached || {}),
    promise,
    fractionId: buildFractionId,
    expiresAt: now + 2500,
  });

  // A transient database failure must not retain a rejected in-flight promise.
  // Restore the prior completed snapshot when one exists so the next request
  // can retry normally without losing a still-usable payload.
  promise.catch(() => {
    const current = tabletCache.get(key);
    if (current?.promise !== promise) return;
    if (cached?.payload) tabletCache.set(key, cached);
    else tabletCache.delete(key);
  });

  return promise;
}

async function pushOrganization(player, options = {}) {
  const cached = tabletCache.get(cacheKey(player));
  if (options.force && cached?.payload && !options.skipCachedPush) {
    try {
      player.call("client:fraction:tablet:update", [JSON.stringify(sanitizePayload(cached.payload))]);
    } catch {}
  }

  const payload = await getTabletPayload(player, options);
  player.call("client:fraction:tablet:update", [JSON.stringify(sanitizePayload(payload))]);
  return payload.organization || null;
}

function preloadOrganization(player) {
  return pushOrganization(player, {
    force: true,
    reason: "preload",
  }).catch(() => null);
}

async function updateOnlineFraction(fractionId) {
  const targetFractionId = Number(fractionId || 0);
  if (!targetFractionId) return;

  invalidateTabletCache(targetFractionId);

  const pending = fractionRefreshes.get(targetFractionId);
  if (pending) return pending.promise;

  let resolveRefresh;
  const promise = new Promise((resolve) => {
    resolveRefresh = resolve;
  });
  const timer = setTimeout(async () => {
    // Stop coalescing before the build starts. A mutation that lands while a
    // snapshot is being built must schedule a follow-up refresh instead of
    // being hidden by the older in-flight build.
    fractionRefreshes.delete(targetFractionId);
    const jobs = [];
    try {
      mp.players.forEach((player) => {
        if (
          playerFractionId(player) === targetFractionId
          && isTabletSubscribed(player)
        ) {
          jobs.push(pushOrganization(player).catch(() => null));
        }
      });
      await Promise.all(jobs);
    } catch {}
    finally {
      resolveRefresh();
    }
  }, FRACTION_REFRESH_DEBOUNCE_MS);

  fractionRefreshes.set(targetFractionId, { promise, timer });
  return promise;
}

async function memberAction(player, fractionId, targetUuid, action, payload = {}) {
  const actor = await getActor(player, fractionId);
  const targetResult = await db.query(
    `SELECT fm.*, c.username, c.lastname,
            COALESCE(fm.warn_count, 0) AS warn_count
       FROM fraction_members fm
       JOIN characters c ON c.uuid = fm.character_uuid
      WHERE fm.fraction_id = ? AND fm.character_uuid = ? LIMIT 1`,
    [actor.fraction_id, Number(targetUuid)]
  );
  const target = rows(targetResult)?.[0];
  if (!target) throw new Error("Участник не найден.");
  if (Number(target.character_uuid) === actor.uuid) {
    throw new Error("Нельзя применить это действие к себе.");
  }
  if (
    Number(target.rank_index) >= Number(actor.rank_index)
    && actor.adminLevel < 7
    && Number(actor.is_leader) !== 1
  ) {
    throw new Error("Нельзя управлять участником равного или более высокого ранга.");
  }

  let runtimeMembership = null;

  if (action === "promote" || action === "demote") {
    requirePermission(actor, "changeRank");
    const bounds = await rankBounds(actor.fraction_id);
    const requestedRank = Math.floor(Number(payload.rank || payload.rankId || 0));
    const nextRank = requestedRank > 0
      ? requestedRank
      : action === "promote"
        ? Math.min(bounds.max, Number(target.rank_index) + 1)
        : Math.max(bounds.min, Number(target.rank_index) - 1);
    if (nextRank < bounds.min || nextRank > bounds.max) throw new Error("Такого ранга нет во фракции.");
    if (action === "promote" && nextRank <= Number(target.rank_index)) {
      throw new Error("Для повышения выберите ранг выше текущего.");
    }
    if (action === "demote" && nextRank >= Number(target.rank_index)) {
      throw new Error("Для понижения выберите ранг ниже текущего.");
    }
    if (nextRank === Number(target.rank_index)) throw new Error("Ранг уже предельный.");
    if (
      nextRank >= Number(actor.rank_index)
      && actor.adminLevel < 7
      && Number(actor.is_leader) !== 1
    ) {
      throw new Error("Нельзя назначить ранг не ниже собственного.");
    }
    await db.query(
      "UPDATE fraction_members SET rank_index = ? WHERE fraction_id = ? AND character_uuid = ?",
      [nextRank, actor.fraction_id, Number(targetUuid)]
    );
    await logMember(
      actor.fraction_id,
      Number(targetUuid),
      actor,
      action === "promote" ? `Повышение до ${nextRank} ранга` : `Понижение до ${nextRank} ранга`,
      payload.reason || payload.comment
    );
    runtimeMembership = { fractionId: actor.fraction_id, fractionRank: nextRank };
  } else if (action === "giveWarn" || action === "removeWarn") {
    requirePermission(actor, "warn");
    const currentWarnCount = Number(target.warn_count || 0);
    if (action === "removeWarn" && currentWarnCount <= 0) {
      throw new Error("У участника нет предупреждений.");
    }
    const delta = action === "giveWarn" ? 1 : -1;
    await db.query(
      "UPDATE fraction_members SET warn_count = GREATEST(COALESCE(warn_count, 0) + ?, 0) WHERE fraction_id = ? AND character_uuid = ?",
      [delta, actor.fraction_id, Number(targetUuid)]
    );
    await logMember(actor.fraction_id, Number(targetUuid), actor, action === "giveWarn" ? "Предупреждение" : "Снято предупреждение", payload.comment);
  } else if (action === "dismiss") {
    requirePermission(actor, "dismiss");
    await db.withConn(async (conn) => {
      await conn.beginTransaction();
      try {
        const [characterRows] = await conn.query(
          "SELECT uuid FROM characters WHERE uuid = ? FOR UPDATE",
          [Number(targetUuid)]
        );
        if (!characterRows?.length) throw new Error("Персонаж не найден.");

        const [lockedMembershipRows] = await conn.query(
          `SELECT rank_index FROM fraction_members
            WHERE fraction_id = ? AND character_uuid = ?
            LIMIT 1 FOR UPDATE`,
          [actor.fraction_id, Number(targetUuid)]
        );
        const lockedMembership = lockedMembershipRows?.[0];
        if (!lockedMembership) throw new Error("Участник больше не состоит в вашей фракции.");
        if (
          Number(lockedMembership.rank_index) >= Number(actor.rank_index)
          && actor.adminLevel < 7
          && Number(actor.is_leader) !== 1
        ) {
          throw new Error("Нельзя управлять участником равного или более высокого ранга.");
        }

        await conn.query("DELETE FROM fraction_members WHERE fraction_id = ? AND character_uuid = ?", [
          actor.fraction_id,
          Number(targetUuid),
        ]);
        await conn.query(
          "UPDATE characters SET has_fraction = 0, fraction_id = 0, fraction_rank = 0 WHERE uuid = ?",
          [Number(targetUuid)]
        );
        if (payload.addToBlacklist) {
          await conn.query(
            `INSERT INTO fraction_blacklist
               (fraction_id, character_uuid, issuer_uuid, comment, is_active, created_at, removed_at)
             VALUES (?, ?, ?, ?, 1, NOW(), NULL)
             ON DUPLICATE KEY UPDATE
               issuer_uuid = VALUES(issuer_uuid),
               comment = VALUES(comment),
               is_active = 1,
               removed_at = NULL`,
            [
              actor.fraction_id,
              Number(targetUuid),
              actor.uuid,
              String(payload.reason || payload.comment || "").slice(0, 255) || null,
            ]
          );
        }
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    });
    await logMember(
      actor.fraction_id,
      Number(targetUuid),
      actor,
      "Уволен из фракции",
      payload.comment
    ).catch((error) => console.error("[FRACTION] dismissal history log error:", error));
    runtimeMembership = { fractionId: 0, fractionRank: 0 };
  } else if (action === "bonus") {
    requirePermission(actor, "bonus");
    const amount = parsePositiveAmount(payload.amount);
    if (!amount) throw new Error("Укажите корректную сумму.");
    await db.withConn(async (conn) => {
      await conn.beginTransaction();
      try {
        const [fractionRows] = await conn.query(
          "SELECT balance FROM fractions WHERE fraction_id = ? FOR UPDATE",
          [actor.fraction_id]
        );
        if (Number(fractionRows?.[0]?.balance || 0) < amount) throw new Error("В казне недостаточно средств.");
        await conn.query("UPDATE fractions SET balance = balance - ? WHERE fraction_id = ?", [
          amount,
          actor.fraction_id,
        ]);
        await conn.query("UPDATE characters SET bank = bank + ? WHERE uuid = ?", [amount, Number(targetUuid)]);
        await logsDb.logQuery(
          `INSERT INTO fraction_balance_logs
             (fraction_id, actor_uuid, actor_rank, transaction_type, comment, amount)
           VALUES (?, ?, ?, 'bonus', ?, ?)`,
          [actor.fraction_id, actor.uuid, actor.rank_index, `${displayName(target)}: ${payload.comment || ""}`, -amount]
        );
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    });
    await logMember(actor.fraction_id, Number(targetUuid), actor, `Премия $${amount}`, payload.comment);
  } else if (action === "setDepartment") {
    requirePermission(actor, "manageDepartments");
    const code = String(payload.departmentCode || "").trim().toUpperCase();
    if (code) {
      const departmentResult = await db.query(
        "SELECT code FROM fraction_departments WHERE fraction_id = ? AND code = ? AND is_active = 1 LIMIT 1",
        [actor.fraction_id, code]
      );
      if (!rows(departmentResult)?.length) throw new Error("Отдел не найден или отключён.");
    }
    await db.query(
      "UPDATE fraction_members SET division = ? WHERE fraction_id = ? AND character_uuid = ?",
      [code || null, actor.fraction_id, Number(targetUuid)]
    );
    await logMember(actor.fraction_id, Number(targetUuid), actor, code ? `Перевод в отдел ${code}` : "Выведен из отдела", payload.comment);
  } else {
    throw new Error("Неизвестное действие.");
  }

  if (runtimeMembership) {
    syncOnlinePlayerMembership(
      Number(targetUuid),
      runtimeMembership.fractionId,
      runtimeMembership.fractionRank
    );
  }
  await updateOnlineFraction(actor.fraction_id);
}

async function balanceAction(player, fractionId, action, payload = {}) {
  const actor = await getActor(player, fractionId);
  if (action !== "deposit" && action !== "withdraw") {
    throw new Error("Неизвестная операция с балансом.");
  }
  const amount = parsePositiveAmount(payload.amount);
  if (!amount) throw new Error("Укажите корректную сумму.");
  requirePermission(actor, action === "deposit" ? "depositBalance" : "withdrawBalance");

  await db.withConn(async (conn) => {
    await conn.beginTransaction();
    try {
      const [characterRows] = await conn.query("SELECT cash FROM characters WHERE uuid = ? FOR UPDATE", [actor.uuid]);
      const [fractionRows] = await conn.query("SELECT balance FROM fractions WHERE fraction_id = ? FOR UPDATE", [
        actor.fraction_id,
      ]);
      const cash = Number(characterRows?.[0]?.cash || 0);
      const balance = Number(fractionRows?.[0]?.balance || 0);
      if (action === "deposit" && cash < amount) throw new Error("Недостаточно наличных.");
      if (action === "withdraw" && balance < amount) throw new Error("В казне недостаточно средств.");
      const characterDelta = action === "deposit" ? -amount : amount;
      const fractionDelta = -characterDelta;
      await conn.query("UPDATE characters SET cash = cash + ? WHERE uuid = ?", [characterDelta, actor.uuid]);
      await conn.query("UPDATE fractions SET balance = balance + ? WHERE fraction_id = ?", [
        fractionDelta,
        actor.fraction_id,
      ]);
      await logsDb.logQuery(
        `INSERT INTO fraction_balance_logs
           (fraction_id, actor_uuid, actor_rank, transaction_type, comment, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [actor.fraction_id, actor.uuid, actor.rank_index, action, String(payload.comment || "").slice(0, 255), fractionDelta]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
  await updateOnlineFraction(actor.fraction_id);
}

async function massBonusAction(player, fractionId, payload = {}) {
  const actor = await getActor(player, fractionId);
  requirePermission(actor, "bonus");
  const amount = parsePositiveAmount(payload.amount);
  if (!amount) throw new Error("Укажите корректную сумму.");

  const memberResult = await db.query(
    "SELECT character_uuid FROM fraction_members WHERE fraction_id = ?",
    [actor.fraction_id]
  );
  const memberUuids = (rows(memberResult) || [])
    .map((member) => Number(member.character_uuid || 0))
    .filter((uuid) => uuid > 0);
  if (!memberUuids.length) throw new Error("Во фракции нет участников для выплаты.");

  const total = amount * memberUuids.length;
  await db.withConn(async (conn) => {
    await conn.beginTransaction();
    try {
      const [fractionRows] = await conn.query(
        "SELECT balance FROM fractions WHERE fraction_id = ? FOR UPDATE",
        [actor.fraction_id]
      );
      if (Number(fractionRows?.[0]?.balance || 0) < total) {
        throw new Error("В казне недостаточно средств.");
      }
      const placeholders = memberUuids.map(() => "?").join(",");
      await conn.query("UPDATE fractions SET balance = balance - ? WHERE fraction_id = ?", [
        total,
        actor.fraction_id,
      ]);
      await conn.query(
        `UPDATE characters SET bank = bank + ? WHERE uuid IN (${placeholders})`,
        [amount, ...memberUuids]
      );
      await logsDb.logQuery(
        `INSERT INTO fraction_balance_logs
           (fraction_id, actor_uuid, actor_rank, transaction_type, comment, amount)
         VALUES (?, ?, ?, 'massBonus', ?, ?)`,
        [
          actor.fraction_id,
          actor.uuid,
          actor.rank_index,
          String(payload.comment || "Массовая выплата").slice(0, 255),
          -total,
        ]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
  await updateOnlineFraction(actor.fraction_id);
}

async function blacklistAdd(player, fractionId, payload = {}) {
  const actor = await getActor(player, fractionId);
  requirePermission(actor, "blacklist");
  const characterUuid = Math.floor(Number(payload.playerUid || payload.playerStatic || payload.playerId || 0));
  if (!Number.isSafeInteger(characterUuid) || characterUuid <= 0) {
    throw new Error("Укажите корректный статик игрока.");
  }

  const targetResult = await db.query(
    "SELECT uuid FROM characters WHERE uuid = ? LIMIT 1",
    [characterUuid]
  );
  if (!rows(targetResult)?.length) throw new Error("Персонаж не найден.");

  await db.query(
    `INSERT INTO fraction_blacklist
       (fraction_id, character_uuid, issuer_uuid, comment, is_active, created_at, removed_at)
     VALUES (?, ?, ?, ?, 1, NOW(), NULL)
     ON DUPLICATE KEY UPDATE
       issuer_uuid = VALUES(issuer_uuid),
       comment = VALUES(comment),
       is_active = 1,
       removed_at = NULL`,
    [
      actor.fraction_id,
      characterUuid,
      actor.uuid,
      String(payload.reason || payload.comment || "").slice(0, 255) || null,
    ]
  );
  await updateOnlineFraction(actor.fraction_id);
}

async function blacklistRemove(player, fractionId, payload = {}) {
  const actor = await getActor(player, fractionId);
  requirePermission(actor, "blacklist");
  const entryId = Math.floor(Number(payload.entryId || 0));
  const characterUuid = Math.floor(Number(payload.playerUid || 0));
  if ((!Number.isSafeInteger(entryId) || entryId <= 0) && (!Number.isSafeInteger(characterUuid) || characterUuid <= 0)) {
    throw new Error("Запись чёрного списка не найдена.");
  }

  const params = entryId > 0
    ? [actor.fraction_id, entryId]
    : [actor.fraction_id, characterUuid];
  const condition = entryId > 0 ? "id = ?" : "character_uuid = ?";
  await db.query(
    `UPDATE fraction_blacklist
        SET is_active = 0, removed_at = NOW()
      WHERE fraction_id = ? AND ${condition} AND is_active = 1`,
    params
  );
  await updateOnlineFraction(actor.fraction_id);
}

async function togglePermission(player, fractionId, rankIndex, permissionId, enabled) {
  const actor = await getActor(player, fractionId);
  if (!actor.is_leader && actor.adminLevel < 7) throw new Error("Настраивать права может только лидер.");
  if (!PERMISSIONS.some(([id]) => id === permissionId)) throw new Error("Неизвестное право.");
  const rankResult = await db.query(
    "SELECT permissions, is_leader FROM fraction_ranks WHERE fraction_id = ? AND rank_index = ? LIMIT 1",
    [actor.fraction_id, Number(rankIndex)]
  );
  const rank = rows(rankResult)?.[0];
  if (!rank) throw new Error("Ранг не найден.");
  if (Number(rank.is_leader) === 1) throw new Error("Права лидерского ранга отключать нельзя.");
  const permissions = parseJson(rank.permissions, {});
  permissions[permissionId] = Boolean(enabled);
  await db.query(
    "UPDATE fraction_ranks SET permissions = ? WHERE fraction_id = ? AND rank_index = ?",
    [JSON.stringify(permissions), actor.fraction_id, Number(rankIndex)]
  );
  await updateOnlineFraction(actor.fraction_id);
}

async function createDepartment(player, fractionId, payload = {}) {
  const actor = await getActor(player, fractionId);
  if (!actor.is_leader && actor.adminLevel < 7 && !hasPermission(actor, "manageDepartments")) {
    throw new Error("Нет права управлять отделами.");
  }
  const code = String(payload.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
  const name = String(payload.name || "").trim().slice(0, 96);
  const description = String(payload.description || "").trim().slice(0, 255);
  if (!code || !name) throw new Error("Укажите код и название отдела.");
  await db.query(
    `INSERT INTO fraction_departments
      (fraction_id, code, name, description, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [actor.fraction_id, code, name, description || null, Number(payload.sortOrder || 0)]
  );
  await updateOnlineFraction(actor.fraction_id);
}

module.exports = {
  PERMISSIONS,
  ensureSchema,
  factionKind,
  getActor,
  getMembershipByUuid,
  hasPermission,
  isPlayerFactionKind,
  setPlayerFraction,
  buildOrganization,
  pushOrganization,
  preloadOrganization,
  updateOnlineFraction,
  invalidateTabletCache,
  setTabletSubscription,
  memberAction,
  balanceAction,
  massBonusAction,
  blacklistAdd,
  blacklistRemove,
  togglePermission,
  createDepartment,
  playerUuid,
};

