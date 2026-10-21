"use strict";

const SAFE_TABLE_NAME = /^(?:`?[a-zA-Z0-9_]+`?\.)?`?[a-zA-Z0-9_]+`?$/;

function parseCreateTable(createSql) {
  const sql = String(createSql || "");
  const tableMatch = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([^\s(]+)/i);
  const open = sql.indexOf("(", tableMatch?.index || 0);
  const close = sql.lastIndexOf(")");
  const table = String(tableMatch?.[1] || "");
  if (!table || !SAFE_TABLE_NAME.test(table) || open < 0 || close <= open) {
    throw new Error("[DATABASE MIGRATION] Unsupported CREATE TABLE statement.");
  }

  const lines = sql.slice(open + 1, close).split(/\r?\n/)
    .map((line) => line.trim().replace(/,$/, "")).filter(Boolean);
  const primaryColumns = new Set();
  const columns = [];
  const indexes = [];

  for (const line of lines) {
    const primaryMatch = line.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (primaryMatch) {
      primaryMatch[1].split(",").forEach((name) => primaryColumns.add(name.replace(/`/g, "").trim()));
      continue;
    }
    const indexMatch = line.match(/^(UNIQUE\s+)?(?:INDEX|KEY)\s+`?([a-zA-Z0-9_]+)`?\s*\(([^)]+)\)/i);
    if (indexMatch) {
      indexes.push({
        columns: indexMatch[3].split(",").map((name) => name.replace(/`/g, "").trim().split(/\s+/)[0]),
        name: indexMatch[2],
        unique: Boolean(indexMatch[1]),
      });
      continue;
    }
    if (/^(?:CONSTRAINT|FOREIGN\s+KEY|CHECK)\b/i.test(line)) continue;
    const columnMatch = line.match(/^`?([a-zA-Z0-9_]+)`?\s+(.+)$/);
    if (columnMatch) columns.push({ definition: columnMatch[2], name: columnMatch[1] });
  }
  for (const column of columns) {
    if (primaryColumns.has(column.name) && !/\bPRIMARY\s+KEY\b/i.test(column.definition)) {
      column.definition += " PRIMARY KEY";
    }
  }
  return { columns, indexes, table };
}

async function ensureTableSchema(connection, createSql) {
  const contract = parseCreateTable(createSql);
  await connection.query(createSql);
  const [columnRows] = await connection.query(`SHOW COLUMNS FROM ${contract.table}`);
  const existingColumns = new Set((columnRows || []).map((row) => String(row.Field)));
  for (const column of contract.columns) {
    if (!existingColumns.has(column.name)) {
      await connection.query(`ALTER TABLE ${contract.table} ADD COLUMN \`${column.name}\` ${column.definition}`);
    }
  }

  const [indexRows] = await connection.query(`SHOW INDEX FROM ${contract.table}`);
  const existingIndexes = new Map();
  for (const row of indexRows || []) {
    const name = String(row.Key_name || "");
    if (!name || name === "PRIMARY") continue;
    if (!existingIndexes.has(name)) existingIndexes.set(name, []);
    existingIndexes.get(name).push({
      column: String(row.Column_name),
      sequence: Number(row.Seq_in_index || 0),
      unique: Number(row.Non_unique || 0) === 0,
    });
  }
  for (const index of contract.indexes) {
    const existingEntries = (existingIndexes.get(index.name) || []).sort((a, b) => a.sequence - b.sequence);
    const existing = existingEntries.map((entry) => entry.column);
    if (!existingEntries.length) {
      const uniqueness = index.unique ? "UNIQUE " : "";
      const columns = index.columns.map((name) => `\`${name}\``).join(", ");
      await connection.query(`ALTER TABLE ${contract.table} ADD ${uniqueness}INDEX \`${index.name}\` (${columns})`);
    } else if (
      existing.join(",") !== index.columns.join(",") ||
      existingEntries.some((entry) => entry.unique !== index.unique)
    ) {
      throw new Error(`[DATABASE MIGRATION] Index ${contract.table}.${index.name} has incompatible columns.`);
    }
  }
}

module.exports = { ensureTableSchema, parseCreateTable };
