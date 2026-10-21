"use strict";

const assert = require("node:assert/strict");
const {
  createRequiredDatabases,
  getRequiredDatabaseNames,
  normalizeDatabaseName,
} = require("../bootstrap.js");

async function run() {
  const queries = [];
  let ended = false;
  const databaseConfig = {
    bootstrapAdmin: {
      host: "database.internal",
      port: 3307,
      user: "root",
      password: "admin-secret",
    },
    database: {
      host: "database.internal",
      port: 3307,
      user: "twinkle",
      password: "secret",
      database: "twinklerp_test",
    },
    logsDatabase: {
      database: "twinklelogs_test",
    },
  };

  const names = await createRequiredDatabases(databaseConfig, async (connectionOptions) => {
    assert.equal(connectionOptions.database, undefined);
    assert.equal(connectionOptions.host, "database.internal");
    assert.equal(connectionOptions.port, 3307);
    return {
      query: async (sql) => { queries.push(sql); },
      end: async () => { ended = true; },
    };
  });

  assert.deepEqual(names, ["twinklerp_test", "twinklelogs_test", "twinkle_admin"]);
  assert.equal(queries.length, 7);
  assert.ok(queries[0].includes("`twinklerp_test`"));
  assert.ok(queries[1].includes("`twinklelogs_test`"));
  assert.ok(queries[2].includes("`twinkle_admin`"));
  assert.ok(queries[3].includes("CREATE USER IF NOT EXISTS 'twinkle'@'%'"));
  assert.ok(queries[4].includes("TO 'twinkle'@'%'"));
  assert.equal(ended, true);
  assert.deepEqual(getRequiredDatabaseNames({
    database: { database: "same" },
    logsDatabase: { database: "same" },
  }), ["same", "twinkle_admin"]);
  assert.equal(normalizeDatabaseName("valid_name_2", "test"), "valid_name_2");
  assert.throws(() => normalizeDatabaseName("invalid-name", "test"), /only letters/);

  console.log("[DATABASE BOOTSTRAP TEST] Database creation contract passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
