const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "bin",
  "runtime",
]);

const EXCLUDE_FILES = new Set([
  "smartSchema.js",
  "smartSync.js",
  "smartTypes.js",
]);

const BLACKLIST_COLUMNS = new Set([
  "conn",
  "connection",
  "sql",
  "query",
  "params",
  "rows",
  "result",
  "results",
  "run",
  "fn",
  "callback",
  "createcharacter",
  "slotcolumn",
  "account",
  "character",
  "promo",
  "column_name",
  "table_name",
  "null",
  "now",
  "current_timestamp",
  "database",
]);

const SYSTEM_TABLES = new Set([
  "information_schema",
  "mysql",
  "performance_schema",
  "sys",
]);

// Tables owned by the reviewed db/twinkledb.sql contract must never be
// inferred or repaired by Smart DB from runtime query text.
const MIGRATION_MANAGED_TABLES = new Set([
  "character_documents",
  "character_licenses",
  "character_quests",
  "character_quest_steps",
  "character_quest_rewards",
  "character_quest_events",
  "character_vehicle_garage_slots",
]);

const MIGRATION_MANAGED_COLUMNS = new Map([
  [
    "vehicles",
    new Set([
      "garage_status",
      "garage_id",
      "garage_slot",
      "purchase_source",
    ]),
  ],
]);

function scanFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const item of fs.readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(item)) continue;

    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanFiles(fullPath, files);
      continue;
    }

    if (EXCLUDE_FILES.has(item)) continue;
    if (![".js", ".ts"].includes(path.extname(item))) continue;

    files.push(fullPath);
  }

  return files;
}

function cleanColumnName(value) {
  if (!value) return null;

  let column = String(value)
    .replace(/[`"';]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!column) return null;
  if (column === "*") return null;
  if (column.includes("(")) return null;
  if (column.includes(" ")) return null;

  if (column.includes(".")) {
    column = column.split(".").pop();
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) return null;
  if (BLACKLIST_COLUMNS.has(column.toLowerCase())) return null;

  return column;
}

function cleanTableName(value) {
  if (!value) return null;

  const table = String(value)
    .replace(/[`"';]/g, "")
    .trim();

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) return null;

  return SYSTEM_TABLES.has(table.toLowerCase()) ? null : table;
}

function extractManagedTableNames(code) {
  const tables = new Set();
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi;
  let match;

  while ((match = regex.exec(code))) {
    const table = cleanTableName(match[1]);
    if (table) tables.add(table.toLowerCase());
  }

  return tables;
}

function getProjectManagedTableNames(files = scanFiles(ROOT_DIR)) {
  const managedTables = new Set(MIGRATION_MANAGED_TABLES);

  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    for (const table of extractManagedTableNames(code)) {
      managedTables.add(table);
    }
  }

  return managedTables;
}

function getProjectManagedColumnNames() {
  const managedColumns = new Map();

  for (const [table, columns] of MIGRATION_MANAGED_COLUMNS.entries()) {
    managedColumns.set(table, new Set(columns));
  }

  return managedColumns;
}

function isProjectManagedColumn(table, column) {
  const columns = MIGRATION_MANAGED_COLUMNS.get(String(table || "").toLowerCase());
  return Boolean(columns?.has(String(column || "").toLowerCase()));
}

function addColumn(schema, table, column) {
  table = cleanTableName(table);
  column = cleanColumnName(column);

  if (!table || !column) return;

  if (!schema[table]) schema[table] = new Set();

  schema[table].add(column);
}

function parseInsert(schema, sql) {
  const regex = /INSERT\s+INTO\s+`?([a-zA-Z0-9_]+)`?\s*\(([\s\S]*?)\)\s*VALUES/gi;
  let match;

  while ((match = regex.exec(sql))) {
    const table = match[1];
    const columns = match[2].split(",");

    for (const column of columns) {
      addColumn(schema, table, column);
    }
  }
}

function parseUpdate(schema, sql) {
  const regex = /UPDATE\s+`?([a-zA-Z0-9_]+)`?\s+SET\s+([\s\S]*?)(?:WHERE|LIMIT|$)/gi;
  let match;

  while ((match = regex.exec(sql))) {
    const table = match[1];
    const setPart = match[2];
    const parts = setPart.split(",");

    for (const part of parts) {
      const col = part.split("=")[0];
      addColumn(schema, table, col);
    }
  }
}

function parseSelect(schema, sql) {
  if (/\bJOIN\b/i.test(sql)) return;
  const regex = /SELECT\s+([\s\S]*?)\s+FROM\s+`?([a-zA-Z0-9_]+)`?/gi;
  let match;

  while ((match = regex.exec(sql))) {
    const columnsPart = match[1];
    const table = match[2];

    if (columnsPart.includes("*")) continue;

    const columns = columnsPart.split(",");

    for (const column of columns) {
      const clean = column
        .replace(/\s+AS\s+.+$/i, "")
        .trim();

      addColumn(schema, table, clean);
    }
  }
}

function parseWhere(schema, sql) {
  if (/\bJOIN\b/i.test(sql)) return;
  const tableMatch =
    sql.match(/FROM\s+`?([a-zA-Z0-9_]+)`?/i) ||
    sql.match(/UPDATE\s+`?([a-zA-Z0-9_]+)`?/i) ||
    sql.match(/DELETE\s+FROM\s+`?([a-zA-Z0-9_]+)`?/i);

  if (!tableMatch) return;

  const table = tableMatch[1];
  const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(?:ORDER\s+BY|GROUP\s+BY|LIMIT|FOR\s+UPDATE|$)/i);

  if (!whereMatch) return;

  const wherePart = whereMatch[1];
  const columnRegex = /`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s*(?:=|>|<|>=|<=|!=|<>|LIKE|IN)/gi;

  let match;

  while ((match = columnRegex.exec(wherePart))) {
    addColumn(schema, table, match[1]);
  }
}

function extractSqlChunks(code) {
  const chunks = [];

  const templateRegex = /`([\s\S]*?)`/g;
  // Only inspect a complete, single-line quoted literal. The former regex
  // could begin at an unrelated quote, cross JavaScript statements and stop
  // after a later SQL literal, causing local variable names to be inferred as
  // database columns.
  const quoteRegex = /(["'])((?:\\.|(?!\1)[^\r\n])*)\1/g;

  let match;

  while ((match = templateRegex.exec(code))) {
    const chunk = match[1];

    if (/(SELECT|INSERT|UPDATE|DELETE)/i.test(chunk)) {
      chunks.push(chunk);
    }
  }

  while ((match = quoteRegex.exec(code))) {
    const chunk = match[2];

    if (/(SELECT|INSERT|UPDATE|DELETE)/i.test(chunk)) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

function analyzeProjectQueries() {
  const files = scanFiles(ROOT_DIR);
  const managedTables = getProjectManagedTableNames(files);
  const managedColumns = getProjectManagedColumnNames();
  const schema = {};

  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    const chunks = extractSqlChunks(code);

    for (const sql of chunks) {
      parseInsert(schema, sql);
      parseUpdate(schema, sql);
      parseSelect(schema, sql);
      parseWhere(schema, sql);
    }
  }

  const result = {};

  for (const [table, columns] of Object.entries(schema)) {
    if (managedTables.has(table.toLowerCase())) continue;
    const tableManagedColumns = managedColumns.get(table.toLowerCase()) || new Set();
    const filteredColumns = Array.from(columns)
      .filter((column) => !tableManagedColumns.has(String(column).toLowerCase()));
    if (!filteredColumns.length) continue;
    result[table] = filteredColumns;
  }

  return result;
}

module.exports = {
  analyzeProjectQueries,
  getProjectManagedColumnNames,
  getProjectManagedTableNames,
  isProjectManagedColumn,
};
