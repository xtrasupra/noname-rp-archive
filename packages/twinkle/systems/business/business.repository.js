"use strict";

const db = require("../../database/query.js");
const { BUSINESSES } = require("./business.config.js");

let schemaPromise = null;

function parseJson(value, fallback) {
  try {
    if (value && typeof value === "object") return value;
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function createSchema(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS twinkle_businesses (
      id VARCHAR(64) NOT NULL,
      type VARCHAR(32) NOT NULL,
      name VARCHAR(96) NOT NULL,
      owner_uuid BIGINT NULL,
      owner_name VARCHAR(128) NOT NULL DEFAULT '',
      cash_balance BIGINT NOT NULL DEFAULT 0,
      bank_balance BIGINT NOT NULL DEFAULT 0,
      stock_json LONGTEXT NOT NULL,
      catalog_json LONGTEXT NOT NULL,
      is_open TINYINT(1) NOT NULL DEFAULT 1,
      position_x DOUBLE NOT NULL,
      position_y DOUBLE NOT NULL,
      position_z DOUBLE NOT NULL,
      dimension INT NOT NULL DEFAULT 0,
      purchase_price BIGINT NOT NULL DEFAULT 0,
      sale_price BIGINT NULL,
      tax_paid_until DATETIME NULL,
      revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_twinkle_businesses_owner (owner_uuid),
      KEY idx_twinkle_businesses_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS twinkle_business_employees (
      business_id VARCHAR(64) NOT NULL,
      character_uuid BIGINT NOT NULL,
      character_name VARCHAR(128) NOT NULL DEFAULT '',
      permissions_json LONGTEXT NOT NULL,
      hired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (business_id, character_uuid),
      KEY idx_twinkle_business_employees_character (character_uuid),
      CONSTRAINT fk_twinkle_business_employee_business
        FOREIGN KEY (business_id) REFERENCES twinkle_businesses(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS twinkle_business_sales (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      business_id VARCHAR(64) NOT NULL,
      buyer_uuid BIGINT NULL,
      actor_uuid BIGINT NULL,
      sale_kind VARCHAR(32) NOT NULL,
      items_json LONGTEXT NOT NULL,
      total_price BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_twinkle_business_sales_business_created (business_id, created_at),
      KEY idx_twinkle_business_sales_buyer (buyer_uuid),
      CONSTRAINT fk_twinkle_business_sale_business
        FOREIGN KEY (business_id) REFERENCES twinkle_businesses(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS twinkle_business_supplies (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      business_id VARCHAR(64) NOT NULL,
      actor_uuid BIGINT NOT NULL,
      stock_key VARCHAR(64) NOT NULL,
      quantity INT NOT NULL,
      unit_price INT NOT NULL,
      total_price BIGINT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'fulfilled',
      available_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_twinkle_business_supplies_business_created (business_id, created_at),
      KEY idx_twinkle_business_supplies_due (status, available_at, id),
      CONSTRAINT fk_twinkle_business_supply_business
        FOREIGN KEY (business_id) REFERENCES twinkle_businesses(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const requiredColumns = [
    ["twinkle_businesses", "cash_balance", "BIGINT NOT NULL DEFAULT 0"],
    ["twinkle_businesses", "bank_balance", "BIGINT NOT NULL DEFAULT 0"],
    ["twinkle_businesses", "catalog_json", "LONGTEXT NULL"],
    ["twinkle_businesses", "sale_price", "BIGINT NULL"],
    ["twinkle_businesses", "tax_paid_until", "DATETIME NULL"],
    ["twinkle_business_supplies", "available_at", "DATETIME NULL"],
  ];
  for (const [table, column, definition] of requiredColumns) {
    const [columns] = await connection.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
    if (!columns?.length) await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  const [dueIndexes] = await connection.query(
    "SHOW INDEX FROM twinkle_business_supplies WHERE Key_name = 'idx_twinkle_business_supplies_due'"
  );
  if (!dueIndexes?.length) {
    await connection.query(
      "ALTER TABLE twinkle_business_supplies ADD KEY idx_twinkle_business_supplies_due (status, available_at, id)"
    );
  }
  await connection.query(`
    CREATE TABLE IF NOT EXISTS twinkle_business_ledger (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      business_id VARCHAR(64) NOT NULL,
      actor_uuid BIGINT NULL,
      action VARCHAR(32) NOT NULL,
      amount BIGINT NOT NULL DEFAULT 0,
      balance_after BIGINT NOT NULL DEFAULT 0,
      details_json LONGTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_twinkle_business_ledger_business_created (business_id, created_at),
      CONSTRAINT fk_twinkle_business_ledger_business
        FOREIGN KEY (business_id) REFERENCES twinkle_businesses(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  for (const business of BUSINESSES) {
    const defaultStock = business.initialStock || {};
    const defaultCatalog = Object.fromEntries((business.products || []).map((entry) => [entry.id, entry.price]));
    await connection.query(
      `INSERT IGNORE INTO twinkle_businesses
        (id, type, name, stock_json, catalog_json, position_x, position_y, position_z, dimension, purchase_price, tax_paid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      [
        business.id,
        business.type,
        business.name,
        JSON.stringify(defaultStock),
        JSON.stringify(defaultCatalog),
        business.position.x,
        business.position.y,
        business.position.z,
        Number(business.dimension || 0),
        Number(business.purchasePrice || 0),
      ]
    );
    await connection.query(
      "UPDATE twinkle_businesses SET name = ? WHERE id = ? AND name <> ?",
      [business.name, business.id, business.name]
    );
    const [rows] = await connection.query(
      "SELECT stock_json, catalog_json FROM twinkle_businesses WHERE id = ? LIMIT 1",
      [business.id]
    );
    const storedStock = parseJson(rows?.[0]?.stock_json, {});
    const storedCatalog = parseJson(rows?.[0]?.catalog_json, {});
    const missingStock = Object.keys(defaultStock).some((key) => !Object.prototype.hasOwnProperty.call(storedStock, key));
    const missingCatalog = Object.keys(defaultCatalog).some((key) => !Object.prototype.hasOwnProperty.call(storedCatalog, key));
    if (missingStock || missingCatalog) {
      await connection.query(
        "UPDATE twinkle_businesses SET stock_json = ?, catalog_json = ? WHERE id = ?",
        [
          JSON.stringify({ ...defaultStock, ...storedStock }),
          JSON.stringify({ ...defaultCatalog, ...storedCatalog }),
          business.id,
        ]
      );
    }
  }
}

async function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = db.withConn(createSchema).catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function normalizeBusiness(row) {
  if (!row) return null;
  return {
    ...row,
    cashBalance: Math.max(0, Number(row.cash_balance ?? row.balance ?? 0)),
    bankBalance: Math.max(0, Number(row.bank_balance || 0)),
    catalog: parseJson(row.catalog_json, {}),
    dimension: Number(row.dimension || 0),
    isOpen: Boolean(row.is_open),
    ownerUuid: row.owner_uuid === null ? null : Number(row.owner_uuid),
    ownerName: String(row.owner_name || ""),
    purchasePrice: Math.max(0, Number(row.purchase_price || 0)),
    salePrice: row.sale_price === null ? null : Math.max(1, Number(row.sale_price || 0)),
    taxPaidUntil: row.tax_paid_until || null,
    revision: Math.max(1, Number(row.revision || 1)),
    stock: parseJson(row.stock_json, {}),
  };
}

async function getBusiness(id, connection = null, forUpdate = false) {
  await ensureSchema();
  const executor = connection || { query: async (sql, params) => [await db.query(sql, params)] };
  const [rows] = await executor.query(
    `SELECT * FROM twinkle_businesses WHERE id = ? LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [String(id || "")]
  );
  return normalizeBusiness(rows?.[0]);
}

async function getCharacterBusinesses(characterUuid) {
  await ensureSchema();
  const rows = await db.query(
    `SELECT b.*, e.permissions_json, e.character_name AS employee_name
       FROM twinkle_businesses b
       LEFT JOIN twinkle_business_employees e
         ON e.business_id = b.id AND e.character_uuid = ?
      WHERE b.owner_uuid = ? OR e.character_uuid = ?
      ORDER BY b.name ASC`,
    [characterUuid, characterUuid, characterUuid]
  );
  return rows.map((row) => ({
    ...normalizeBusiness(row),
    employeePermissions: parseJson(row.permissions_json, []),
  }));
}

async function getEmployees(businessId, connection = null) {
  await ensureSchema();
  if (connection) {
    const [rows] = await connection.query(
      "SELECT * FROM twinkle_business_employees WHERE business_id = ? ORDER BY hired_at ASC",
      [businessId]
    );
    return rows.map((row) => ({
      characterUuid: Number(row.character_uuid),
      characterName: String(row.character_name || ""),
      permissions: parseJson(row.permissions_json, []),
      hiredAt: row.hired_at,
    }));
  }
  const rows = await db.query(
    "SELECT * FROM twinkle_business_employees WHERE business_id = ? ORDER BY hired_at ASC",
    [businessId]
  );
  return rows.map((row) => ({
    characterUuid: Number(row.character_uuid),
    characterName: String(row.character_name || ""),
    permissions: parseJson(row.permissions_json, []),
    hiredAt: row.hired_at,
  }));
}

async function getRecentActivity(businessId) {
  await ensureSchema();
  const [supplies, ledger] = await Promise.all([
    db.query(
      "SELECT id, stock_key, quantity, total_price, status, available_at, created_at FROM twinkle_business_supplies WHERE business_id = ? ORDER BY id DESC LIMIT 8",
      [businessId]
    ),
    db.query(
      "SELECT id, action, amount, created_at FROM twinkle_business_ledger WHERE business_id = ? ORDER BY id DESC LIMIT 8",
      [businessId]
    ),
  ]);
  return {
    supplies,
    ledger,
  };
}

async function getMarketplaceBusinesses() {
  await ensureSchema();
  const rows = await db.query(
    `SELECT * FROM twinkle_businesses
      WHERE owner_uuid IS NULL OR sale_price IS NOT NULL
      ORDER BY name ASC`
  );
  return rows.map(normalizeBusiness);
}

async function getAnalytics(businessId) {
  await ensureSchema();
  const [summaryRows, itemRows] = await Promise.all([
    db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN total_price ELSE 0 END), 0) AS revenue_day,
         COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN total_price ELSE 0 END), 0) AS revenue_week,
         COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN total_price ELSE 0 END), 0) AS revenue_month,
         COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) AS sales_month,
         COUNT(DISTINCT CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN buyer_uuid END) AS buyers_month
       FROM twinkle_business_sales WHERE business_id = ?`,
      [businessId]
    ),
    db.query(
      "SELECT items_json FROM twinkle_business_sales WHERE business_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) ORDER BY id DESC LIMIT 500",
      [businessId]
    ),
  ]);
  const products = new Map();
  for (const row of itemRows) {
    for (const item of parseJson(row.items_json, [])) {
      const id = String(item?.id || item?.stockKey || "unknown");
      const current = products.get(id) || { id, name: String(item?.name || id), quantity: 0, revenue: 0 };
      current.quantity += Math.max(0, Number(item?.quantity || 0));
      current.revenue += Math.max(0, Number(item?.unitPrice || 0)) * Math.max(0, Number(item?.quantity || 0));
      products.set(id, current);
    }
  }
  const summary = summaryRows?.[0] || {};
  return {
    buyersMonth: Number(summary.buyers_month || 0),
    revenueDay: Number(summary.revenue_day || 0),
    revenueWeek: Number(summary.revenue_week || 0),
    revenueMonth: Number(summary.revenue_month || 0),
    salesMonth: Number(summary.sales_month || 0),
    topProducts: Array.from(products.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
  };
}

module.exports = {
  ensureSchema,
  getBusiness,
  getCharacterBusinesses,
  getEmployees,
  getRecentActivity,
  getMarketplaceBusinesses,
  getAnalytics,
  normalizeBusiness,
  parseJson,
};
