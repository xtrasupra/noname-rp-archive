const mysql = require("mysql2/promise");
const config = require("./config");
const { autoSyncSchema, repairSqlError } = require("./smartSync");

const dbConfig = config.database || config.mysql || config;

const pool = mysql.createPool({
  host: dbConfig.host || "127.0.0.1",
  user: dbConfig.user || "root",
  password: dbConfig.password || "",
  database: dbConfig.database || dbConfig.db || "twinklerp",
  port: dbConfig.port || 3306,
  waitForConnections: true,
  connectionLimit: dbConfig.connectionLimit || 10,
  queueLimit: 0,
  charset: "utf8mb4",
});

let schemaReady = false;
let schemaPromise = null;

async function ensureSchema() {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = autoSyncSchema(pool)
    .then(() => {
      schemaReady = true;
    })
    .catch((error) => {
      schemaPromise = null;
      throw error;
    });

  return schemaPromise;
}

async function query(sql, params = []) {
  await ensureSchema();

  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (err) {
    const repaired = await repairSqlError(pool, err);

    if (repaired) {
      const [rows] = await pool.query(sql, params);
      return rows;
    }

    throw err;
  }
}

async function rawQuery(sql, params = []) {
  await ensureSchema();

  try {
    return await pool.query(sql, params);
  } catch (err) {
    const repaired = await repairSqlError(pool, err);

    if (repaired) {
      return await pool.query(sql, params);
    }

    throw err;
  }
}

async function withConn(callback) {
  await ensureSchema();

  const conn = await pool.getConnection();

  try {
    return await callback(conn);
  } finally {
    conn.release();
  }
}

async function initDatabase() {
  await ensureSchema();
  console.log("\x1b[32m[SMART DB]\x1b[0m Database schema ready");
}

module.exports = {
  pool,
  query,
  rawQuery,
  withConn,
  ensureSchema,
  initDatabase,
};
