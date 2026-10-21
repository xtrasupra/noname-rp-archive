"use strict";

const crypto = require("crypto");
const db = require("../../database/index.js");
const logsDb = require("../../database/logs.js");
const chat = require("../chat/chat.service.js");
const { parseJson, playerUuid, playerFractionId, playerAdminLevel, playerName } = require("../../utils/player.js");
const config = require("./governmentComputer.config.js");
const storage = require("./document.storage.js");

const pending = new Set();
const pointPosition = new mp.Vector3(config.point.position.x, config.point.position.y, config.point.position.z);
const shape = mp.colshapes.newSphere(pointPosition.x, pointPosition.y, pointPosition.z, config.point.radius, config.point.dimension);
shape.governmentComputer = true;
const marker = config.point.marker;
mp.markers.new(marker.type, new mp.Vector3(pointPosition.x, pointPosition.y, pointPosition.z + marker.zOffset), marker.scale, {
  color: marker.color,
  visible: true,
  dimension: config.point.dimension,
});

function validPlayer(player) {
  return Boolean(player && mp.players.exists(player));
}

function notify(player, variant, message) {
  if (validPlayer(player)) player.call("client:notification", [String(variant), String(message), 4500]);
}

function sanitize(value, maxLength) {
  return String(value || "").replace(/\0/g, "").trim().slice(0, maxLength);
}

function isoDate(value = new Date()) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

async function ensureSchema() {
  await db.query(`CREATE TABLE IF NOT EXISTS government_material_orders (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    request_id VARCHAR(96) NOT NULL,
    target_fraction_id INT NOT NULL,
    amount INT NOT NULL,
    unit_price INT NOT NULL,
    total_price BIGINT NOT NULL,
    actor_uuid BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'fulfilled',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_government_order_request (request_id),
    INDEX idx_government_orders_created (created_at),
    INDEX idx_government_orders_target (target_fraction_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const orderColumns = await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'government_material_orders' AND COLUMN_NAME = 'request_id'");
  if (!orderColumns?.length) await db.query("ALTER TABLE government_material_orders ADD COLUMN request_id VARCHAR(96) NULL AFTER id, ADD UNIQUE KEY uq_government_order_request (request_id)");
  await db.query("ALTER TABLE government_material_orders ALTER COLUMN status SET DEFAULT 'fulfilled'");
  await db.query(`CREATE TABLE IF NOT EXISTS government_decrees (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    document_number VARCHAR(64) NOT NULL,
    title VARCHAR(180) NOT NULL,
    summary VARCHAR(500) NULL,
    body MEDIUMTEXT NOT NULL,
    effective_at DATE NULL,
    author_uuid BIGINT NOT NULL,
    author_name VARCHAR(128) NOT NULL,
    author_position VARCHAR(128) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'draft',
    current_version INT NOT NULL DEFAULT 1,
    pdf_object_key VARCHAR(512) NULL,
    pdf_url VARCHAR(1024) NULL,
    pdf_checksum CHAR(64) NULL,
    pdf_size INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    UNIQUE KEY uq_government_decree_number (document_number),
    INDEX idx_government_decrees_status (status, deleted_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS government_decree_versions (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    decree_id BIGINT NOT NULL,
    version INT NOT NULL,
    title VARCHAR(180) NOT NULL,
    summary VARCHAR(500) NULL,
    body MEDIUMTEXT NOT NULL,
    effective_at DATE NULL,
    editor_uuid BIGINT NOT NULL,
    pdf_object_key VARCHAR(512) NULL,
    pdf_url VARCHAR(1024) NULL,
    pdf_checksum CHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_government_decree_version (decree_id, version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS government_decree_logs (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    decree_id BIGINT NOT NULL,
    actor_uuid BIGINT NOT NULL,
    action VARCHAR(32) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_government_decree_logs (decree_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function getActor(player) {
  const uuid = playerUuid(player);
  if (!uuid) return null;
  const rows = await db.query(`SELECT fm.fraction_id, fm.rank_index, fr.permissions, fr.is_leader,
      f.type AS fraction_type, f.name AS fraction_name, c.username, c.lastname
    FROM fraction_members fm
    JOIN fractions f ON f.fraction_id = fm.fraction_id
    LEFT JOIN fraction_ranks fr ON fr.fraction_id = fm.fraction_id AND fr.rank_index = fm.rank_index
    JOIN characters c ON c.uuid = fm.character_uuid
    WHERE fm.character_uuid = ? LIMIT 1`, [uuid]);
  const row = rows?.[0];
  if (!row) return null;
  const permissions = parseJson(row.permissions, {});
  const government = Number(row.fraction_id) === Number(config.governmentFractionId);
  const elevated = Number(row.is_leader) === 1 || playerAdminLevel(player) >= 7;
  return {
    ...row,
    uuid,
    name: `${row.username || ""} ${row.lastname || ""}`.trim() || playerName(player),
    isState: String(row.fraction_type) === "state",
    isGovernment: government,
    canOrderMaterials: government && (elevated || permissions.orderMaterials === true),
    canManageDecrees: government && (elevated || permissions.manageDecrees === true),
  };
}

async function buildPayload(actor) {
  const documentStorage = storage.getStorageReadiness();
  const [fractions, treasuryRows, decrees, orders] = await Promise.all([
    db.query("SELECT fraction_id AS id, name, short_name AS shortName FROM fractions WHERE type = 'state' AND is_active = 1 ORDER BY name"),
    db.query("SELECT balance FROM fractions WHERE fraction_id = ? LIMIT 1", [config.governmentFractionId]),
    db.query(`SELECT id, document_number AS documentNumber, title, summary, body,
      effective_at AS effectiveAt, author_name AS authorName, author_position AS authorPosition,
      current_version AS version, pdf_url AS pdfUrl, created_at AS createdAt, updated_at AS updatedAt
      FROM government_decrees WHERE status = 'published' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`),
    actor.canOrderMaterials ? db.query(`SELECT o.id, o.amount, o.unit_price AS unitPrice, o.total_price AS totalPrice,
      o.status, o.created_at AS createdAt, f.name AS targetName
      FROM government_material_orders o LEFT JOIN fractions f ON f.fraction_id = o.target_fraction_id
      ORDER BY o.id DESC LIMIT 20`) : Promise.resolve([]),
  ]);
  return {
    permissions: {
      canOrderMaterials: actor.canOrderMaterials,
      canManageDecrees: actor.canManageDecrees && documentStorage.ready,
    },
    documentStorage,
    actor: { name: actor.name, fractionName: actor.fraction_name },
    material: {
      treasury: Number(treasuryRows?.[0]?.balance || 0),
      unitPrice: config.materialUnitPrice,
      minAmount: config.minMaterialAmount,
      maxAmount: config.maxMaterialAmount,
      fractions,
      orders,
    },
    decrees: decrees.map((item) => ({ ...item, effectiveAt: isoDate(item.effectiveAt), createdAt: new Date(item.createdAt).toISOString() })),
  };
}

async function pushPayload(player, eventName = "client:governmentComputer:open") {
  const actor = await getActor(player);
  if (!actor?.isState) throw new Error("Компьютер доступен только сотрудникам государственных организаций.");
  player.call(eventName, [JSON.stringify(await buildPayload(actor))]);
}

async function run(player, callback, operation = "generic") {
  if (!validPlayer(player) || pending.has(player.id)) return;
  pending.add(player.id);
  try {
    await ensureSchema();
    await callback();
  } catch (error) {
    console.error("[GOVERNMENT COMPUTER]", error);
    const message = error?.message === "CDN_NOT_CONFIGURED"
      ? "Хранилище документов не настроено. Обратитесь к администратору сервера."
      : error?.message === "DOCUMENT_STORAGE_UNAVAILABLE"
        ? "Публикация PDF временно отключена: хранилище документов не готово."
      : String(error?.message || "").startsWith("DOCUMENT_STORAGE_DEPENDENCY_MISSING:")
        ? "Компонент публикации PDF не установлен. Обратитесь к администратору сервера."
      : error?.code === "ER_DUP_ENTRY"
        ? "Указ с таким номером уже существует. Укажите другой номер."
        : error?.message || "Не удалось выполнить операцию.";
    if (operation !== "saveDecree") notify(player, "error", message);
    if (validPlayer(player)) player.call("client:governmentComputer:operationResult", [JSON.stringify({ operation, success: false, message })]);
  } finally {
    pending.delete(player.id);
  }
}

function isAtPoint(player) {
  if (!validPlayer(player) || Number(player.dimension) !== Number(config.point.dimension)) return false;
  try { return shape.isPointWithin(player.position); } catch { return false; }
}

function requireAtPoint(player) {
  if (!player.governmentComputerAvailable || !isAtPoint(player)) throw new Error("Подойдите к государственному компьютеру.");
}

async function broadcastDecree(name, actorName) {
  const message = `Был издан новый указ «${name}» членом правительства ${actorName}`;
  const stateRows = await db.query("SELECT fraction_id FROM fractions WHERE type = 'state' AND is_active = 1");
  const stateIds = new Set((stateRows || []).map((row) => Number(row.fraction_id)));
  mp.players.forEach((target) => {
    if (stateIds.has(playerFractionId(target))) {
      chat.sendToPlayer(target, message, "#27D7DF", { channelType: "government", author: "Правительство" });
    }
  });
}

mp.events.add("playerEnterColshape", (player, entered) => {
  if (entered !== shape) return;
  player.governmentComputerAvailable = true;
  player.call("client:governmentComputer:setAvailable", [true]);
});

mp.events.add("playerExitColshape", (player, exited) => {
  if (exited !== shape) return;
  player.governmentComputerAvailable = false;
  player.call("client:governmentComputer:setAvailable", [false]);
  player.call("client:governmentComputer:close");
});

mp.events.add("server:governmentComputer:requestOpen", (player) => run(player, async () => {
  if (!player.governmentComputerAvailable || !isAtPoint(player)) throw new Error("Подойдите к государственному компьютеру.");
  await pushPayload(player);
}));

mp.events.add("server:governmentComputer:orderMaterials", (player, targetRaw, amountRaw, requestRaw) => run(player, async () => {
  requireAtPoint(player);
  const actor = await getActor(player);
  if (!actor?.canOrderMaterials) throw new Error("У вас нет права закупать материалы.");
  const requestId = sanitize(requestRaw, 96).replace(/[^a-zA-Z0-9:_-]/g, "");
  if (requestId.length < 12) throw new Error("Некорректный идентификатор заказа.");
  const existingOrder = await db.query("SELECT id FROM government_material_orders WHERE request_id = ? LIMIT 1", [requestId]);
  if (existingOrder?.[0]) {
    notify(player, "success", `Заказ #${existingOrder[0].id} уже был создан.`);
    return pushPayload(player, "client:governmentComputer:update");
  }
  const targetId = Number(targetRaw);
  const amount = Math.floor(Number(amountRaw));
  if (!Number.isInteger(amount) || amount < config.minMaterialAmount || amount > config.maxMaterialAmount) throw new Error("Некорректное количество материалов.");
  const target = await db.query("SELECT fraction_id, name FROM fractions WHERE fraction_id = ? AND type = 'state' AND is_active = 1 LIMIT 1", [targetId]);
  if (!target?.[0]) throw new Error("Государственная организация не найдена.");
  const total = amount * config.materialUnitPrice;
  let orderId = 0;
  let treasuryBefore = 0;
  await db.withConn(async (conn) => {
    await conn.beginTransaction();
    try {
      const [funds] = await conn.query("SELECT balance FROM fractions WHERE fraction_id = ? FOR UPDATE", [config.governmentFractionId]);
      treasuryBefore = Number(funds?.[0]?.balance || 0);
      if (treasuryBefore < total) throw new Error("В казне Government недостаточно средств.");
      await conn.query("UPDATE fractions SET balance = balance - ? WHERE fraction_id = ?", [total, config.governmentFractionId]);
      const [result] = await conn.query(`INSERT INTO government_material_orders
        (request_id, target_fraction_id, amount, unit_price, total_price, actor_uuid, status) VALUES (?, ?, ?, ?, ?, ?, 'fulfilled')`,
        [requestId, targetId, amount, config.materialUnitPrice, total, actor.uuid]);
      orderId = Number(result.insertId);
      await conn.query(`INSERT INTO fraction_storage_items
        (fraction_id, item_key, item_name, category, amount)
        VALUES (?, 'materials', 'Материалы', 'materials', ?)
        ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount), item_name = VALUES(item_name), category = VALUES(category)`,
        [targetId, amount]);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
  await logsDb.writeMoneyLog({ source: "government_computer", action: "materials_order", currency: "fraction_balance", amount: -total, balanceBefore: treasuryBefore, balanceAfter: treasuryBefore - total, actor: player, fractionId: config.governmentFractionId, comment: `Заказ материалов #${orderId} для ${target[0].name}`, metadata: { orderId, targetFractionId: targetId, amount } }).catch((error) => console.warn("[GOVERNMENT COMPUTER] Money log:", error.message));
  await logsDb.logQuery(`INSERT INTO fraction_storage_logs
    (fraction_id, actor_uuid, actor_rank, action, item_key, item_name, amount, comment)
    VALUES (?, ?, ?, 'government_order', 'materials', 'Материалы', ?, ?)`,
    [targetId, actor.uuid, Number(actor.rank_index || 0), amount, `Госзаказ #${orderId}`]
  ).catch((error) => console.warn("[GOVERNMENT COMPUTER] Storage log:", error.message));
  mp.events.call("server:governmentComputer:materialsOrdered", JSON.stringify({ orderId, targetFractionId: targetId, amount, unitPrice: config.materialUnitPrice, totalPrice: total, actorUuid: actor.uuid, createdAt: new Date().toISOString() }));
  notify(player, "success", `Материалы для ${target[0].name} оплачены. Заказ #${orderId} создан.`);
  await pushPayload(player, "client:governmentComputer:update");
}));

mp.events.add("server:governmentComputer:saveDecree", (player, rawPayload) => run(player, async () => {
  requireAtPoint(player);
  if (!storage.getStorageReadiness().ready) throw new Error("DOCUMENT_STORAGE_UNAVAILABLE");
  const actor = await getActor(player);
  if (!actor?.canManageDecrees) throw new Error("Только уполномоченные сотрудники Government могут издавать указы.");
  const payload = typeof rawPayload === "object" ? rawPayload : parseJson(rawPayload, {});
  const id = Number(payload.id || 0);
  const title = sanitize(payload.title, 180);
  const summary = sanitize(payload.summary, 500);
  const body = sanitize(payload.body, 30000);
  const authorPosition = sanitize(payload.authorPosition || "Член Правительства", 128);
  const effectiveAt = isoDate(payload.effectiveAt || new Date());
  if (title.length < 3) throw new Error(`Название указа должно содержать минимум 3 символа. Сейчас: ${title.length}.`);
  if (body.length < 20) throw new Error(`Текст указа должен содержать минимум 20 символов. Сейчас: ${body.length}.`);
  if (!effectiveAt) throw new Error("Укажите корректную дату вступления указа в силу.");
  let decreeId = id;
  let version = 1;
  let createdDraft = false;
  let documentNumber = sanitize(payload.documentNumber, 64);
  if (documentNumber) {
    const duplicate = await db.query("SELECT id FROM government_decrees WHERE document_number = ? AND deleted_at IS NULL AND id <> ? LIMIT 1", [documentNumber, id]);
    if (duplicate?.[0]) throw new Error(`Указ с номером «${documentNumber}» уже существует. Укажите другой номер.`);
  }
  if (id) {
    const rows = await db.query("SELECT * FROM government_decrees WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]);
    if (!rows?.[0]) throw new Error("Указ не найден.");
    version = Number(rows[0].current_version || 1) + 1;
    documentNumber = documentNumber || rows[0].document_number;
  } else {
    documentNumber = documentNumber || `${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const result = await db.query(`INSERT INTO government_decrees
      (document_number, title, summary, body, effective_at, author_uuid, author_name, author_position, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`, [documentNumber, title, summary || null, body, effectiveAt, actor.uuid, actor.name, authorPosition]);
    decreeId = Number(result.insertId);
    createdDraft = true;
  }
  let pdf;
  try {
    pdf = await storage.uploadDecreePdf({ decreeId, version, documentNumber, title, summary, body, effectiveAt, publishedAt: isoDate(), authorName: actor.name, authorPosition });
  } catch (error) {
    if (createdDraft) {
      await db.query(
        "DELETE FROM government_decrees WHERE id = ? AND status = 'draft' AND current_version = 1",
        [decreeId]
      ).catch((cleanupError) => console.error("[GOVERNMENT COMPUTER] Draft cleanup failed:", cleanupError));
    }
    throw error;
  }
  try {
    await db.withConn(async (conn) => {
      await conn.beginTransaction();
      try {
        await conn.query(`UPDATE government_decrees SET document_number=?, title=?, summary=?, body=?, effective_at=?,
          author_uuid=?, author_name=?, author_position=?, status='published', current_version=?, pdf_object_key=?, pdf_url=?, pdf_checksum=?, pdf_size=? WHERE id=?`,
          [documentNumber, title, summary || null, body, effectiveAt, actor.uuid, actor.name, authorPosition, version, pdf.key, pdf.url, pdf.checksum, pdf.size, decreeId]);
        await conn.query(`INSERT INTO government_decree_versions
          (decree_id, version, title, summary, body, effective_at, editor_uuid, pdf_object_key, pdf_url, pdf_checksum)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [decreeId, version, title, summary || null, body, effectiveAt, actor.uuid, pdf.key, pdf.url, pdf.checksum]);
        await conn.query("INSERT INTO government_decree_logs (decree_id, actor_uuid, action) VALUES (?, ?, ?)", [decreeId, actor.uuid, id ? "update" : "publish"]);
        await conn.commit();
      } catch (error) {
        try { await conn.rollback(); } catch {}
        throw error;
      }
    });
  } catch (error) {
    await storage.deleteDecreePdf(pdf.key)
      .catch((cleanupError) => console.error("[GOVERNMENT COMPUTER] Uploaded PDF cleanup failed:", cleanupError));
    if (createdDraft) {
      await db.query(
        "DELETE FROM government_decrees WHERE id = ? AND status = 'draft' AND current_version = 1",
        [decreeId]
      ).catch((cleanupError) => console.error("[GOVERNMENT COMPUTER] Draft cleanup failed:", cleanupError));
    }
    throw error;
  }
  if (!id) await broadcastDecree(title, actor.name);
  const successMessage = id ? "Указ обновлён и опубликован." : "Новый указ опубликован.";
  await pushPayload(player, "client:governmentComputer:update");
  if (validPlayer(player)) player.call("client:governmentComputer:operationResult", [JSON.stringify({ operation: "saveDecree", success: true, message: successMessage, decreeId, title })]);
}, "saveDecree"));

mp.events.add("server:governmentComputer:deleteDecree", (player, decreeRaw) => run(player, async () => {
  requireAtPoint(player);
  const actor = await getActor(player);
  if (!actor?.canManageDecrees) throw new Error("У вас нет права удалять указы.");
  const decreeId = Number(decreeRaw);
  await db.withConn(async (conn) => {
    await conn.beginTransaction();
    try {
      const [result] = await conn.query("UPDATE government_decrees SET deleted_at = NOW(), status = 'deleted' WHERE id = ? AND deleted_at IS NULL", [decreeId]);
      if (!Number(result?.affectedRows || 0)) throw new Error("Указ не найден.");
      await conn.query("INSERT INTO government_decree_logs (decree_id, actor_uuid, action) VALUES (?, ?, 'delete')", [decreeId, actor.uuid]);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
  notify(player, "success", "Указ удалён.");
  await pushPayload(player, "client:governmentComputer:update");
}));

mp.events.add("server:governmentComputer:close", (player) => {
  if (validPlayer(player)) player.call("client:governmentComputer:close");
});

ensureSchema().then(() => {
  const readiness = storage.getStorageReadiness();
  if (readiness.ready) {
    console.log("[GOVERNMENT COMPUTER] Ready; decree PDF publishing enabled");
  } else {
    console.warn(`[GOVERNMENT COMPUTER] Ready; decree PDF publishing disabled: ${readiness.reasons.join(", ")}`);
  }
}).catch((error) => console.error("[GOVERNMENT COMPUTER] Schema error:", error));
console.log("[GOVERNMENT COMPUTER] Point created near default spawn");
