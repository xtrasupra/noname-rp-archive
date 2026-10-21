"use strict";

const assert = require("node:assert/strict");
const { ensureTableSchema, parseCreateTable } = require("../schemaMigration.js");

const createSql = `
  CREATE TABLE IF NOT EXISTS twinkle_admin.example (
    id BIGINT NOT NULL AUTO_INCREMENT,
    value VARCHAR(64) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_example_value (value),
    INDEX idx_example_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

async function run() {
  const parsed = parseCreateTable(createSql);
  assert.equal(parsed.table, "twinkle_admin.example");
  assert.ok(parsed.columns.find((column) => column.name === "id").definition.includes("PRIMARY KEY"));
  assert.deepEqual(parsed.indexes.map((index) => index.name), ["uq_example_value", "idx_example_created"]);

  const queries = [];
  const connection = {
    query: async (sql) => {
      queries.push(sql);
      if (sql.startsWith("SHOW COLUMNS")) return [[{ Field: "id" }]];
      if (sql.startsWith("SHOW INDEX")) return [[{
        Key_name: "uq_example_value",
        Column_name: "value",
        Seq_in_index: 1,
        Non_unique: 0,
      }]];
      return [[], []];
    },
  };
  await ensureTableSchema(connection, createSql);
  assert.ok(queries.some((sql) => sql.includes("ADD COLUMN `value`")));
  assert.ok(queries.some((sql) => sql.includes("ADD COLUMN `created_at`")));
  assert.ok(queries.some((sql) => sql.includes("ADD INDEX `idx_example_created`")));
  assert.equal(queries.some((sql) => sql.includes("ADD UNIQUE INDEX `uq_example_value`")), false);
  console.log("[DATABASE SCHEMA MIGRATION TEST] Legacy reconciliation contract passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
