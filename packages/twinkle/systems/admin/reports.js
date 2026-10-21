"use strict";

const chat = require("../chat/chat.service.js");
const db = require("../../database/query.js");
const {
  getPlayerUuid,
  getPlayerName,
  getAdminLevel,
} = require("../../utils/player.js");
const { sanitizePayload } = require("../../utils/text.js");

const reports = new Map();
let schemaReady = false;
const REPORT_STATUS_OPEN = "Открыто";
const REPORT_STATUS_TAKEN = "Рассматривается";
const REPORT_STATUS_REVIEWED = "Рассмотрено";
const REPORT_STATUS_WAITING = "Ожидает ответа";
const REPORT_STATUS_CLOSED = "Закрыто";
const LEGACY_REPORT_STATUS_CLOSED = "Закрыто";
const REPORT_STATUS_ALIASES = new Map([
  ["Открыто", REPORT_STATUS_OPEN],
  ["Рассматривается", REPORT_STATUS_TAKEN],
  ["Рассмотрено", REPORT_STATUS_REVIEWED],
  ["Ожидает ответа", REPORT_STATUS_WAITING],
  [LEGACY_REPORT_STATUS_CLOSED, REPORT_STATUS_CLOSED],
]);

function normalizeReportStatus(status) {
  const text = String(status || REPORT_STATUS_OPEN).trim();
  return REPORT_STATUS_ALIASES.get(text) || text || REPORT_STATUS_OPEN;
}

function isClosedStatus(status) {
  const text = String(status || "").trim();
  return text === REPORT_STATUS_CLOSED || text === LEGACY_REPORT_STATUS_CLOSED;
}

function isReportClosed(report) {
  return isClosedStatus(report?.status);
}

async function sql(query, params = []) {
  try {
    if (typeof db.query === "function") return await db.query(query, params);

    if (typeof db.withConn === "function") {
      return await db.withConn(async (conn) => {
        const [rows] = await conn.query(query, params);
        return rows;
      });
    }

    throw new Error("Database adapter not found");
  } catch (err) {
    console.error("[REPORTS SQL ERROR]", err);
    return [];
  }
}

async function ensureReportsSchema() {
  if (schemaReady) return;

  try {
    const run = async (query) => {
      if (typeof db.query === "function") {
        await db.query(query);
        return;
      }

      if (typeof db.withConn === "function") {
        await db.withConn(async (conn) => {
          await conn.query(query);
        });
      }
    };

    await run("CREATE DATABASE IF NOT EXISTS twinkle_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    await run(`
      CREATE TABLE IF NOT EXISTS twinkle_admin.reports (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        player_id BIGINT NOT NULL DEFAULT 0,
        player_name VARCHAR(64) NOT NULL DEFAULT '',
        question TEXT NOT NULL,
        status VARCHAR(64) NULL,
        admin_id BIGINT NULL DEFAULT 0,
        admin_name VARCHAR(64) NULL DEFAULT '',
        answer_seconds VARCHAR(32) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        closed_at TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (id),
        INDEX idx_reports_player_status (player_id, status),
        INDEX idx_reports_status_updated (status, updated_at)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS twinkle_admin.report_messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        report_id BIGINT UNSIGNED NOT NULL,
        author_id BIGINT NULL DEFAULT 0,
        admin_id BIGINT NULL DEFAULT 0,
        author_name VARCHAR(64) NOT NULL DEFAULT '',
        role VARCHAR(16) NOT NULL DEFAULT 'player',
        action_type VARCHAR(32) NOT NULL DEFAULT 'message',
        text TEXT NOT NULL,
        answer_seconds VARCHAR(32) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_report_messages_report (report_id, id)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    schemaReady = true;
  } catch (err) {
    console.error("[REPORTS SCHEMA ERROR]", err);
  }
}

function isAdmin(player) {
  return getAdminLevel(player) > 0;
}

function notify(player, message, color = "#66ccff") {
  try {
    if (chat?.sendToPlayer) {
      chat.sendToPlayer(player, String(message), color);
      return;
    }
  } catch {}

  try {
    player.call("chat:client:add", [
      JSON.stringify({ message: String(message), color }),
    ]);
  } catch {
    try {
      player.outputChatBox(String(message));
    } catch {}
  }
}

function getPlayerByUuid(uuid) {
  let found = null;

  mp.players.forEach((player) => {
    if (Number(getPlayerUuid(player)) === Number(uuid)) {
      found = player;
    }
  });

  return found;
}

function hasAdmin(report) {
  return report?.adminId !== null && report?.adminId !== undefined && Number(report.adminId) !== 0;
}

function hasAdminAnswer(report) {
  return report.messages.some((message) => {
    return message.role === "admin" && message.actionType === "message";
  });
}

async function insertReportToDb(report) {
  await ensureReportsSchema();

  return sql(
    `
    INSERT INTO twinkle_admin.reports
    (
      player_id,
      player_name,
      question,
      status,
      admin_id,
      admin_name,
      answer_seconds,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [
      report.playerId,
      report.playerName,
      report.question,
      report.status,
      report.adminId ?? 0,
      report.adminName ?? "",
      report.answerSeconds ?? null,
    ]
  );
}

async function updateReportInDb(report) {
  await ensureReportsSchema();

  await sql(
    `
    UPDATE twinkle_admin.reports
    SET
      status = ?,
      admin_id = ?,
      admin_name = ?,
      answer_seconds = ?,
      updated_at = CURRENT_TIMESTAMP,
      closed_at = CASE WHEN ? = ? THEN CURRENT_TIMESTAMP ELSE closed_at END
    WHERE id = ?
    `,
    [
      report.status,
      report.adminId ?? 0,
      report.adminName ?? "",
      report.answerSeconds ?? null,
      report.status,
      REPORT_STATUS_CLOSED,
      report.id,
    ]
  );
}

async function setReportAnswerSeconds(report, answerSeconds) {
  if (!report) return;
  if (report.answerSeconds !== null && report.answerSeconds !== undefined) return;

  report.answerSeconds = Number(answerSeconds || 0);
  await ensureReportsSchema();

  await sql(
    `
    UPDATE twinkle_admin.reports
    SET answer_seconds = ?
    WHERE id = ?
    `,
    [String(report.answerSeconds), report.id]
  );
}

async function insertReportMessageToDb(reportId, message) {
  await ensureReportsSchema();

  await sql(
    `
    INSERT INTO twinkle_admin.report_messages
    (
      report_id,
      author_id,
      admin_id,
      author_name,
      role,
      action_type,
      text,
      answer_seconds,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      Number(reportId),
      message.authorId ?? 0,
      message.adminId ?? 0,
      String(message.author || "Unknown"),
      String(message.role || "system"),
      String(message.actionType || "message"),
      String(message.text || ""),
      message.answerSeconds ?? null,
    ]
  );
}

function normalizeReportRow(row, messages) {
  return {
    id: Number(row.id),
    question: String(row.question || ""),
    status: normalizeReportStatus(row.status),

    playerId: Number(row.player_id || 0),
    playerName: String(row.player_name || "Unknown"),

    adminId:
      row.admin_id === null ||
      row.admin_id === undefined ||
      row.admin_id === "" ||
      Number(row.admin_id) === 0
        ? null
        : Number(row.admin_id),

    adminName:
      row.admin_name && String(row.admin_name) !== "0"
        ? String(row.admin_name)
        : null,

    answerSeconds:
      row.answer_seconds === null ||
      row.answer_seconds === undefined ||
      row.answer_seconds === ""
        ? null
        : Number(row.answer_seconds),

    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),

    messages: messages.map((message) => ({
      id: String(message.id),

      authorId:
        message.author_id === null ||
        message.author_id === undefined ||
        message.author_id === "" ||
        Number(message.author_id) === 0
          ? null
          : Number(message.author_id),

      adminId:
        message.admin_id === null ||
        message.admin_id === undefined ||
        message.admin_id === "" ||
        Number(message.admin_id) === 0
          ? null
          : Number(message.admin_id),

      author: String(message.author_name || "Unknown"),
      role: message.role === "admin" ? "admin" : "player",

      actionType: String(message.action_type || "message"),
      text: String(message.text || ""),

      answerSeconds:
        message.answer_seconds === null ||
        message.answer_seconds === undefined ||
        message.answer_seconds === ""
          ? null
          : Number(message.answer_seconds),

      createdAt: message.created_at ? new Date(message.created_at).getTime() : Date.now(),
    })),
  };
}

function serializeReportForViewer(report, viewer) {
  const viewerRole = isAdmin(viewer) ? "admin" : "player";
  const viewerId = getPlayerUuid(viewer);

  return {
    id: report.id,
    question: report.question,
    status: report.status,

    playerId: report.playerId,
    playerName: report.playerName,

    adminId: report.adminId,
    adminName: report.adminName,

    answerSeconds: report.answerSeconds,

    createdAt: report.createdAt,
    updatedAt: report.updatedAt,

    viewer: {
      id: viewerId,
      role: viewerRole,
      name: getPlayerName(viewer),
      isAdmin: viewerRole === "admin",
    },

    messages: report.messages.map((message) => {
      const actionType = String(message.actionType || "message");

      const isSystem =
        actionType === "take" ||
        actionType === "close" ||
        actionType === "need_help" ||
        actionType === "disconnect" ||
        actionType === "admin_disconnect" ||
        actionType === "teleport_to_player" ||
        actionType === "teleport_player_to_me" ||
        String(message.author || "") === "Система";

      return {
        ...message,
        isOwn: !isSystem && Number(message.authorId) === Number(viewerId),
      };
    }),
  };
}

function formatSeconds(seconds) {
  const value = Number(seconds || 0);

  if (!value) return "0 сек.";
  if (value < 60) return `${Math.floor(value)} сек.`;

  return `${Math.floor(value / 60)} мин.`;
}

async function getReportsStatistics() {
  await ensureReportsSchema();

  const totalRows = await sql(`
    SELECT COUNT(*) AS count
    FROM twinkle_admin.reports
  `);

  const openedRows = await sql(`
    SELECT COUNT(*) AS count
    FROM twinkle_admin.reports
    WHERE status IS NULL OR status NOT IN (?, ?)
  `, [REPORT_STATUS_CLOSED, LEGACY_REPORT_STATUS_CLOSED]);

  const closedRows = await sql(`
    SELECT COUNT(*) AS count
    FROM twinkle_admin.reports
    WHERE status IN (?, ?)
  `, [REPORT_STATUS_CLOSED, LEGACY_REPORT_STATUS_CLOSED]);

  const avgRows = await sql(`
    SELECT AVG(CAST(answer_seconds AS UNSIGNED)) AS avg_seconds
    FROM twinkle_admin.reports
    WHERE answer_seconds IS NOT NULL
      AND answer_seconds != ''
      AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
  `);

  const total = Number(totalRows?.[0]?.count || 0);
  const opened = Number(openedRows?.[0]?.count || 0);
  const closed = Number(closedRows?.[0]?.count || 0);
  const avgSeconds = Number(avgRows?.[0]?.avg_seconds || 0);

  return {
    total,
    opened,
    closed,
    avgSeconds,
    avgText: formatSeconds(avgSeconds),
  };
}

function sendReportsPermissions(player) {
  const payload = {
    isAdmin: isAdmin(player),
    adminLevel: getAdminLevel(player),
  };

  try {
    player.call("c:reports:permissions", [JSON.stringify(sanitizePayload(payload))]);
  } catch {}
}

async function sendReportsStatisticsToAdmin(player) {
  if (!isAdmin(player)) return;

  const payload = await getReportsStatistics();

  try {
    player.call("c:reports:statistics", [JSON.stringify(sanitizePayload(payload))]);
  } catch {}
}

async function loadActiveReportsFromDb() {
  await ensureReportsSchema();

  const rows = await sql(
    `
    SELECT *
    FROM twinkle_admin.reports
    WHERE status IS NULL OR status NOT IN (?, ?)
    ORDER BY updated_at DESC, id DESC
    `,
    [REPORT_STATUS_CLOSED, LEGACY_REPORT_STATUS_CLOSED]
  );

  reports.clear();

  for (const row of rows) {
    const messages = await sql(
      `
      SELECT *
      FROM twinkle_admin.report_messages
      WHERE report_id = ?
      ORDER BY id ASC
      `,
      [row.id]
    );

    const report = normalizeReportRow(row, messages);
    reports.set(Number(report.id), report);
  }
}

async function loadPlayerReportsFromDb(player) {
  await ensureReportsSchema();

  const uuid = getPlayerUuid(player);

  if (!uuid) return [];

  const rows = await sql(
    `
      SELECT *
      FROM twinkle_admin.reports
      WHERE player_id = ?
        AND status NOT IN (?, ?)
      ORDER BY updated_at DESC, id DESC
      `,
    [uuid, REPORT_STATUS_CLOSED, LEGACY_REPORT_STATUS_CLOSED]
  );

  const result = [];

  for (const row of rows) {
    const messages = await sql(
      `
      SELECT *
      FROM twinkle_admin.report_messages
      WHERE report_id = ?
      ORDER BY id ASC
      `,
      [row.id]
    );

    result.push(normalizeReportRow(row, messages));
  }

  return result;
}

function sendReportsToAdmin(admin) {
  if (!isAdmin(admin)) return;

  const adminUuid = getPlayerUuid(admin);
  if (!adminUuid) return;

  const payload = [...reports.values()]
    .filter((report) => {
      if (isReportClosed(report)) return false;
      if (Number(report.playerId) === Number(adminUuid)) return false;
      if (!hasAdmin(report)) return true;

      return Number(report.adminId) === Number(adminUuid);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((report) => serializeReportForViewer(report, admin));

  try {
    admin.call("c:reports:set", [JSON.stringify(sanitizePayload(payload))]);
  } catch {}

  sendReportsHudToPlayer(admin);
}

function getReportsHudCounts(admin) {
  if (!isAdmin(admin)) {
    return {
      enabled: false,
      reports: 0,
    };
  }

  const adminUuid = getPlayerUuid(admin);
  let visibleReports = 0;

  for (const report of reports.values()) {
    if (isReportClosed(report)) continue;
    if (Number(report.playerId) === Number(adminUuid)) continue;

    if (!hasAdmin(report)) {
      visibleReports += 1;
      continue;
    }

    if (Number(report.adminId) === Number(adminUuid)) {
      visibleReports += 1;
    }
  }

  return {
    enabled: true,
    reports: visibleReports,
  };
}

function sendReportsHudToPlayer(player) {
  const admin = getReportsHudCounts(player);

  try {
    player.call("c:hud:update", [
      JSON.stringify({
        admin,
        hotkeys: {
          isVisible: false,
          items: [],
        },
      }),
    ]);
  } catch {}
}

async function sendReportsToPlayer(player) {
  if (!player) return;

  const playerReports = await loadPlayerReportsFromDb(player);

  const payload = playerReports
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((report) => serializeReportForViewer(report, player));

  try {
    player.call("c:reports:setPlayerReports", [JSON.stringify(sanitizePayload(payload))]);
  } catch {}
}

async function buildReportsPayload(player) {
  await ensureReportsSchema();

  const permissions = {
    isAdmin: isAdmin(player),
    adminLevel: getAdminLevel(player),
  };

  const playerReports = await loadPlayerReportsFromDb(player);
  let items = playerReports;

  if (permissions.isAdmin) {
    await loadActiveReportsFromDb();

    const adminUuid = getPlayerUuid(player);
    items = [...reports.values()].filter((report) => {
      if (isReportClosed(report)) return false;
      if (Number(report.playerId) === Number(adminUuid)) return false;
      if (!hasAdmin(report)) return true;

      return Number(report.adminId) === Number(adminUuid);
    });
  }

  const statistics = permissions.isAdmin ? await getReportsStatistics() : null;

  return {
    permissions,
    items: items
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((report) => serializeReportForViewer(report, player)),
    statistics,
  };
}

function broadcastReportsToAdmins() {
  mp.players.forEach((player) => {
    if (isAdmin(player)) {
      sendReportsToAdmin(player);
      sendReportsPermissions(player);
    }
  });
}

async function addReportMessage(report, message) {
  report.messages.push(message);
  report.updatedAt = Date.now();

  await insertReportMessageToDb(report.id, message);
  await updateReportInDb(report);
}

async function releaseUnansweredAdminReports(admin, exceptReportId = null) {
  const adminUuid = getPlayerUuid(admin);
  if (!adminUuid) return;

  for (const report of reports.values()) {
    if (exceptReportId !== null && Number(report.id) === Number(exceptReportId)) continue;
    if (isReportClosed(report)) continue;
    if (!hasAdmin(report) || Number(report.adminId) !== Number(adminUuid)) continue;
    if (hasAdminAnswer(report)) continue;

    report.adminId = null;
    report.adminName = null;
    report.status = REPORT_STATUS_OPEN;
    report.updatedAt = Date.now();

    await updateReportInDb(report);
  }
}

async function selectReportForAdmin(player, reportId) {
  if (!isAdmin(player)) return;

  const adminUuid = getPlayerUuid(player);
  if (!adminUuid) return;

  await loadActiveReportsFromDb();

  const report = reports.get(Number(reportId));
  if (!report) return;
  if (isReportClosed(report)) return;

  if (Number(report.playerId) === Number(adminUuid)) {
    return notify(player, "Нельзя брать собственное обращение.", "#ff6666");
  }

  await releaseUnansweredAdminReports(player, report.id);

  if (hasAdmin(report) && Number(report.adminId) !== Number(adminUuid)) {
    sendReportsToAdmin(player);
    return;
  }

  if (!hasAdmin(report)) {
    const now = Date.now();

    report.adminId = adminUuid;
    report.adminName = getPlayerName(player);
    report.status = REPORT_STATUS_TAKEN;
    report.updatedAt = now;

    await addReportMessage(report, {
      id: `${report.id}-take-${now}`,
      authorId: adminUuid,
      adminId: adminUuid,
      author: "Система",
      role: "admin",
      actionType: "take",
      text: `${getPlayerName(player)} взял обращение.`,
      answerSeconds: null,
      createdAt: now,
    });
  }

  broadcastReportsToAdmins();

  const target = getPlayerByUuid(report.playerId);
  if (target) await sendReportsToPlayer(target);
}

async function createReport(player, text) {
  const question = String(text || "").trim();

  if (!question) return notify(player, "Введите текст обращения.", "#ff6666");

  const uuid = getPlayerUuid(player);

  if (!uuid) {
    return notify(player, "Ошибка: персонаж не выбран.", "#ff6666");
  }

  await loadActiveReportsFromDb();

  const opened = [...reports.values()].find((report) => {
    return Number(report.playerId) === Number(uuid) && !isReportClosed(report);
  });

  if (opened) {
    return notify(player, `У вас уже есть открытое обращение №${opened.id}.`, "#ffcc66");
  }

  const now = Date.now();

  const report = {
    id: 0,
    question,
    status: REPORT_STATUS_OPEN,
    playerId: uuid,
    playerName: getPlayerName(player),
    adminId: null,
    adminName: null,
    answerSeconds: null,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };

  const result = await insertReportToDb(report);
  const id = Number(result?.insertId || 0);

  if (!id) {
    console.error("[REPORT CREATE ERROR] Не удалось получить insertId:", result);
    return notify(player, "Ошибка создания обращения.", "#ff6666");
  }

  report.id = id;
  reports.set(id, report);

  await addReportMessage(report, {
    id: `${id}-player-${now}`,
    authorId: uuid,
    adminId: null,
    author: getPlayerName(player),
    role: "player",
    actionType: "create",
    text: question,
    answerSeconds: null,
    createdAt: now,
  });

  notify(player, `Обращение №${id} создано. Ожидайте ответа администратора.`, "#66cc66");

  broadcastReportsToAdmins();
  await sendReportsToPlayer(player);
}

function canAdminWorkWithReport(player, report) {
  if (!isAdmin(player)) return false;
  if (!report) return false;
  if (isReportClosed(report)) return false;

  const adminUuid = getPlayerUuid(player);
  if (!adminUuid) return false;

  if (Number(report.playerId) === Number(adminUuid)) return false;
  if (!hasAdmin(report)) return true;

  return Number(report.adminId) === Number(adminUuid);
}

mp.registerCommand("report", async (player, fullText) => {
  try {
    await createReport(player, fullText);
  } catch (err) {
    console.error("[REPORT COMMAND ERROR]", err);
    notify(player, "Ошибка создания обращения.", "#ff6666");
  }
});

mp.registerCommand("rep", async (player, fullText) => {
  try {
    await createReport(player, fullText);
  } catch (err) {
    console.error("[REP COMMAND ERROR]", err);
    notify(player, "Ошибка создания обращения.", "#ff6666");
  }
});

mp.events.add("s:reports:create", async (player, text) => {
  try {
    await createReport(player, text);
  } catch (err) {
    console.error("[REPORT EVENT CREATE ERROR]", err);
    notify(player, "Ошибка создания обращения.", "#ff6666");
  }
});

mp.events.add("s:reports:request", async (player) => {
  try {
    sendReportsPermissions(player);

    if (isAdmin(player)) {
      await loadActiveReportsFromDb();

      sendReportsToAdmin(player);
      return;
    }

    await sendReportsToPlayer(player);
  } catch (err) {
    console.error("[REPORTS REQUEST ERROR]", err);
  }
});

mp.events.add("s:reports:hud:request", async (player) => {
  try {
    if (isAdmin(player)) {
      await loadActiveReportsFromDb();
    }

    sendReportsHudToPlayer(player);
  } catch (err) {
    console.error("[REPORTS HUD REQUEST ERROR]", err);
  }
});

mp.events.add("s:reports:permissions", async (player) => {
  try {
    sendReportsPermissions(player);
  } catch (err) {
    console.error("[REPORTS PERMISSIONS ERROR]", err);
  }
});

mp.events.add("s:reports:statistics", async (player) => {
  try {
    if (!isAdmin(player)) return;
    await sendReportsStatisticsToAdmin(player);
  } catch (err) {
    console.error("[REPORTS STATISTICS ERROR]", err);
  }
});

mp.events.add("s:reports:player:request", async (player) => {
  try {
    await sendReportsToPlayer(player);
  } catch (err) {
    console.error("[REPORTS PLAYER REQUEST ERROR]", err);
  }
});

mp.events.add("s:reports:select", async (player, reportId) => {
  try {
    await selectReportForAdmin(player, reportId);
  } catch (err) {
    console.error("[REPORT SELECT ERROR]", err);
  }
});

mp.events.add("s:reports:take", async (player, reportId) => {
  try {
    await selectReportForAdmin(player, reportId);
  } catch (err) {
    console.error("[REPORT TAKE ERROR]", err);
  }
});

mp.events.add("s:reports:sendMessage", async (player, reportId, text) => {
  try {
    await loadActiveReportsFromDb();

    const report = reports.get(Number(reportId));
    if (!report) return;
    if (isReportClosed(report)) return;

    const uuid = getPlayerUuid(player);
    if (!uuid) return;

    const isOwnReport = Number(report.playerId) === Number(uuid);
    const isReportPlayer = isOwnReport;
    const isReportAdmin = !isOwnReport && isAdmin(player) && canAdminWorkWithReport(player, report);

    if (!isReportPlayer && !isReportAdmin) return;

    const message = String(text || "").trim();
    if (!message) return;

    const now = Date.now();

    if (isReportAdmin && !hasAdmin(report)) {
      report.adminId = uuid;
      report.adminName = getPlayerName(player);
    }

    let answerSeconds = null;

    const firstPlayerMessage = report.messages.find((m) => m.role === "player");
    const firstAdminAnswer = report.messages.find((m) => {
      return m.role === "admin" && m.actionType === "message";
    });

    if (
      isReportAdmin &&
      !firstAdminAnswer &&
      firstPlayerMessage &&
      (report.answerSeconds === null || report.answerSeconds === undefined)
    ) {
      answerSeconds = Math.floor((now - Number(firstPlayerMessage.createdAt || now)) / 1000);
      await setReportAnswerSeconds(report, answerSeconds);
    }

    const role = isReportAdmin ? "admin" : "player";

    if (isReportAdmin) {
      report.status = REPORT_STATUS_REVIEWED;
    } else if (hasAdmin(report)) {
      report.status = REPORT_STATUS_WAITING;
    } else {
      report.status = REPORT_STATUS_OPEN;
    }

    report.updatedAt = now;

    await addReportMessage(report, {
      id: `${report.id}-${role}-${now}`,
      authorId: uuid,
      adminId: isReportAdmin ? uuid : null,
      author: getPlayerName(player),
      role,
      actionType: "message",
      text: message,
      answerSeconds,
      createdAt: now,
    });

    const target = getPlayerByUuid(report.playerId);

    if (isReportAdmin && target) {
      notify(target, `[Ответ администрации #${report.id}] ${message}`, "#66ccff");
      await sendReportsToPlayer(target);
    }

    if (isReportPlayer) {
      await sendReportsToPlayer(player);
      broadcastReportsToAdmins();
      return;
    }

    broadcastReportsToAdmins();
  } catch (err) {
    console.error("[REPORT MESSAGE ERROR]", err);
  }
});

mp.events.add("s:reports:close", async (player, reportId) => {
  try {
    await loadActiveReportsFromDb();

    const report = reports.get(Number(reportId));
    if (!report) return;
    if (isReportClosed(report)) return;

    const uuid = getPlayerUuid(player);
    if (!uuid) return;

    const isReportPlayer = Number(report.playerId) === Number(uuid);
    const isReportAdmin = isAdmin(player) && canAdminWorkWithReport(player, report);

    if (!isReportPlayer && !isReportAdmin) return;

    const now = Date.now();

    report.status = REPORT_STATUS_CLOSED;
    report.updatedAt = now;

    await addReportMessage(report, {
      id: `${report.id}-close-${now}`,
      authorId: uuid,
      adminId: isReportAdmin ? uuid : null,
      author: "Система",
      role: isReportAdmin ? "admin" : "player",
      actionType: "close",
      text: isReportAdmin
        ? `${getPlayerName(player)} закрыл обращение.`
        : `${getPlayerName(player)} закрыл своё обращение.`,
      answerSeconds: null,
      createdAt: now,
    });

    // Closed reports must never participate in live HUD counters. Removing
    // the entry immediately also prevents a stale moderation count while the
    // database-backed active list is being refreshed.
    reports.delete(Number(report.id));

    const target = getPlayerByUuid(report.playerId);

    if (target) {
      notify(target, `Обращение №${report.id} закрыто.`, "#ffcc66");
      await sendReportsToPlayer(target);
    }

    sendReportsHudToPlayer(player);
    broadcastReportsToAdmins();
  } catch (err) {
    console.error("[REPORT CLOSE ERROR]", err);
  }
});

mp.events.add("s:reports:needHelp", async (player, reportId) => {
  try {
    await loadActiveReportsFromDb();

    const report = reports.get(Number(reportId));
    if (!report) return;
    if (isReportClosed(report)) return;

    const uuid = getPlayerUuid(player);
    if (!uuid) return;

    const isReportPlayer = Number(report.playerId) === Number(uuid);
    const isReportAdmin = isAdmin(player) && canAdminWorkWithReport(player, report);

    if (!isReportPlayer && !isReportAdmin) return;

    const now = Date.now();

    report.status = REPORT_STATUS_OPEN;
    report.adminId = null;
    report.adminName = null;
    report.updatedAt = now;

    await addReportMessage(report, {
      id: `${report.id}-help-${now}`,
      authorId: uuid,
      adminId: isReportAdmin ? uuid : null,
      author: "Система",
      role: isReportAdmin ? "admin" : "player",
      actionType: "need_help",
      text: isReportAdmin
        ? `${getPlayerName(player)} запросил помощь другого администратора.`
        : `${getPlayerName(player)} потребовал помощь другого администратора.`,
      answerSeconds: null,
      createdAt: now,
    });

    const target = getPlayerByUuid(report.playerId);

    if (target) await sendReportsToPlayer(target);

    broadcastReportsToAdmins();
  } catch (err) {
    console.error("[REPORT NEED HELP ERROR]", err);
  }
});

mp.events.add("s:reports:teleportToPlayer", async (player, reportId) => {
  try {
    if (!isAdmin(player)) return;

    await loadActiveReportsFromDb();

    const report = reports.get(Number(reportId));
    if (!canAdminWorkWithReport(player, report)) return;

    const uuid = getPlayerUuid(player);
    if (!uuid) return;

    const target = getPlayerByUuid(report.playerId);

    if (!target) return notify(player, "Игрок не в сети.", "#ff6666");

    try {
      player.dimension = target.dimension;
      player.position = new mp.Vector3(
        target.position.x,
        target.position.y,
        target.position.z + 1
      );
    } catch {}

    const now = Date.now();

    await addReportMessage(report, {
      id: `${report.id}-tp-admin-${now}`,
      authorId: uuid,
      adminId: uuid,
      author: "Система",
      role: "admin",
      actionType: "teleport_to_player",
      text: `${getPlayerName(player)} телепортировался к игроку.`,
      answerSeconds: null,
      createdAt: now,
    });

    broadcastReportsToAdmins();
    await sendReportsToPlayer(target);
  } catch (err) {
    console.error("[REPORT TP TO PLAYER ERROR]", err);
  }
});

mp.events.add("s:reports:teleportPlayerToMe", async (player, reportId) => {
  try {
    if (!isAdmin(player)) return;

    await loadActiveReportsFromDb();

    const report = reports.get(Number(reportId));
    if (!canAdminWorkWithReport(player, report)) return;

    const uuid = getPlayerUuid(player);
    if (!uuid) return;

    const target = getPlayerByUuid(report.playerId);

    if (!target) return notify(player, "Игрок не в сети.", "#ff6666");

    try {
      target.dimension = player.dimension;
      target.position = new mp.Vector3(
        player.position.x,
        player.position.y,
        player.position.z + 1
      );
    } catch {}

    const now = Date.now();

    await addReportMessage(report, {
      id: `${report.id}-tp-player-${now}`,
      authorId: uuid,
      adminId: uuid,
      author: "Система",
      role: "admin",
      actionType: "teleport_player_to_me",
      text: `${getPlayerName(player)} телепортировал игрока к себе.`,
      answerSeconds: null,
      createdAt: now,
    });

    notify(target, "Администратор телепортировал вас к себе.", "#ffcc66");

    broadcastReportsToAdmins();
    await sendReportsToPlayer(target);
  } catch (err) {
    console.error("[REPORT TP PLAYER TO ME ERROR]", err);
  }
});

mp.events.add("playerQuit", async (player) => {
  const uuid = getPlayerUuid(player);
  const playerName = getPlayerName(player);

  try {
    await loadActiveReportsFromDb();

    for (const report of reports.values()) {
      if (uuid && Number(report.playerId) === Number(uuid) && !isReportClosed(report)) {
        const now = Date.now();

        await addReportMessage(report, {
          id: `${report.id}-quit-${now}`,
          authorId: uuid,
          adminId: null,
          author: "Система",
          role: "admin",
          actionType: "disconnect",
          text: `${playerName} вышел с сервера.`,
          answerSeconds: null,
          createdAt: now,
        });
      }

      if (
        uuid &&
        hasAdmin(report) &&
        Number(report.adminId) === Number(uuid) &&
        !isReportClosed(report)
      ) {
        if (hasAdminAnswer(report)) continue;

        const now = Date.now();

        report.status = REPORT_STATUS_OPEN;
        report.adminId = null;
        report.adminName = null;
        report.updatedAt = now;

        await addReportMessage(report, {
          id: `${report.id}-admin-quit-${now}`,
          authorId: uuid,
          adminId: uuid,
          author: "Система",
          role: "admin",
          actionType: "admin_disconnect",
          text: `${playerName} вышел с сервера. Обращение снова доступно администраторам.`,
          answerSeconds: null,
          createdAt: now,
        });
      }
    }

    broadcastReportsToAdmins();
  } catch (err) {
    console.error("[REPORT PLAYER QUIT ERROR]", err);
  }
});

module.exports = {
  createReport,
  sendReportsToAdmin,
  sendReportsHudToPlayer,
  sendReportsToPlayer,
  broadcastReportsToAdmins,
  loadActiveReportsFromDb,
  loadPlayerReportsFromDb,
  buildReportsPayload,
  sendReportsPermissions,
  sendReportsStatisticsToAdmin,
  getReportsStatistics,
};

console.log("[REPORTS] Server loaded");


