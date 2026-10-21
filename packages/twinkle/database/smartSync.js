const {
  analyzeProjectQueries,
  getProjectManagedTableNames,
  isProjectManagedColumn,
} = require("./smartSchema");
const { resolveColumnType } = require("./smartTypes");

let isSyncing = false;

function getUnknownColumn(error) {
  const message = error?.sqlMessage || error?.message || "";
  const match = message.match(/Unknown column '([^']+)'/i);

  if (!match) return null;

  let column = match[1];

  if (column.includes(".")) {
    column = column.split(".").pop();
  }

  return column;
}

function getTableFromSql(sql) {
  if (!sql) return null;

  const patterns = [
    /INSERT\s+INTO\s+`?([a-zA-Z0-9_]+)`?/i,
    /UPDATE\s+`?([a-zA-Z0-9_]+)`?/i,
    /FROM\s+`?([a-zA-Z0-9_]+)`?/i,
    /DELETE\s+FROM\s+`?([a-zA-Z0-9_]+)`?/i,
  ];

  for (const pattern of patterns) {
    const match = String(sql).match(pattern);

    if (match) return match[1];
  }

  return null;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `
    SELECT TABLE_NAME
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    `,
    [table]
  );

  return rows.length > 0;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [table, column]
  );

  return rows.length > 0;
}

async function createBasicTable(conn, table) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS \`${table}\` (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `
  );

  console.log(`\x1b[32m[SMART DB]\x1b[0m Table checked/created: ${table}`);
}

async function addColumn(conn, table, column) {
  if (column === "id") return;

  const exists = await columnExists(conn, table, column);

  if (exists) return;

  let type = resolveColumnType(column);

  if (type.includes("AUTO_INCREMENT") || type.includes("PRIMARY KEY")) {
    type = "INT NOT NULL DEFAULT 0";
  }

  console.log(`\x1b[32m[SMART DB]\x1b[0m ADD ${table}.${column} ${type}`);

  try {
    await conn.query(
      `
      ALTER TABLE \`${table}\`
      ADD COLUMN \`${column}\` ${type}
      `
    );
  } catch (error) {
    if (
      error?.code === "ER_DUP_FIELDNAME" ||
      /Duplicate column name/i.test(error?.sqlMessage || error?.message || "")
    ) {
      return;
    }

    throw error;
  }
}

async function autoSyncSchema(pool) {
  if (isSyncing) return;

  isSyncing = true;

  const schema = analyzeProjectQueries();
  const conn = await pool.getConnection();

  try {
    for (const [table, columns] of Object.entries(schema)) {
      const exists = await tableExists(conn, table);

      if (!exists) {
        await createBasicTable(conn, table);
      }

      for (const column of columns) {
        await addColumn(conn, table, column);
      }
    }
  } finally {
    conn.release();
    isSyncing = false;
  }
}

async function repairSqlError(pool, error) {
  const code = error?.code;

  if (code !== "ER_BAD_FIELD_ERROR" && code !== "ER_NO_SUCH_TABLE") {
    return false;
  }

  const conn = await pool.getConnection();

  try {
    const sql = error.sql || "";
    const table = getTableFromSql(sql);

    if (!table) {
      await autoSyncSchema(pool);
      return true;
    }

    if (getProjectManagedTableNames().has(String(table).toLowerCase())) {
      // A module that declares CREATE TABLE owns the complete schema. Allowing
      // the generic repairer to infer that table would hide migration defects
      // and can create incompatible keys or column types.
      return false;
    }

    const exists = await tableExists(conn, table);

    if (!exists) {
      await createBasicTable(conn, table);
      return true;
    }

    const column = getUnknownColumn(error);

    if (column) {
      if (isProjectManagedColumn(table, column)) return false;
      await addColumn(conn, table, column);
      return true;
    }

    await autoSyncSchema(pool);
    return true;
  } finally {
    conn.release();
  }
}

module.exports = {
  autoSyncSchema,
  repairSqlError,
};
