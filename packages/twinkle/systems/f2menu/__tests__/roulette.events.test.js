"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const roulettePath = path.resolve(__dirname, "../roulette.events.js");
const f2CachePath = path.resolve(__dirname, "../f2menu.cache.js");
const db = require("../../../database/query.js");
const logsDb = require("../../../database/logs.js");
const {
  getExpectedReturns,
  getTotalChance,
} = require("../roulette.config.js");

function createPlayer(id, donate = 100) {
  const accountId = id + 1000;
  const calls = [];
  const variables = new Map();

  return {
    id,
    accountId,
    auth: true,
    __twinkleAuthPhase: "in_game",
    character: {
      uuid: id + 2000,
      account_id: accountId,
      username: "Test",
      lastname: String(id),
    },
    donate,
    account: { donate },
    calls,
    variables,
    call(eventName, args = []) {
      calls.push({ eventName, args });
    },
    setVariable(name, value) {
      variables.set(name, value);
    },
  };
}

function createConnection(initialDonate, options = {}) {
  let donate = initialDonate;
  const settlements = new Map();
  const schemaColumns = new Set([
    "account_id",
    "request_id",
    "character_uuid",
    "bet_amount",
    "selected_multiplier",
    "segment_id",
    "result_multiplier",
    "win",
    "win_amount",
    "balance_before",
    "balance_after",
    "created_at",
  ]);
  const schemaIndexes = new Map([
    ["idx_f2_roulette_character_created", ["character_uuid", "created_at"]],
  ]);
  const state = {
    began: 0,
    committed: 0,
    rolledBack: 0,
    updates: [],
    inserts: 0,
    schemaAlters: [],
  };

  return {
    state,
    settlements,
    get donate() {
      return donate;
    },
    setDonate(value) {
      donate = Number(value);
    },
    async beginTransaction() {
      state.began += 1;
    },
    async commit() {
      state.committed += 1;
    },
    async rollback() {
      state.rolledBack += 1;
    },
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();

      if (normalizedSql.startsWith("CREATE TABLE IF NOT EXISTS f2_roulette_settlements")) {
        return [{ warningStatus: 0 }];
      }

      if (normalizedSql === "SHOW COLUMNS FROM f2_roulette_settlements") {
        return [[...schemaColumns].map((Field) => ({ Field }))];
      }

      if (normalizedSql === "SHOW INDEX FROM f2_roulette_settlements") {
        const indexRows = [];
        for (const [Key_name, columns] of schemaIndexes) {
          columns.forEach((Column_name, index) => {
            indexRows.push({
              Column_name,
              Key_name,
              Non_unique: 1,
              Seq_in_index: index + 1,
            });
          });
        }
        return [indexRows];
      }

      if (normalizedSql.startsWith("ALTER TABLE f2_roulette_settlements ADD COLUMN")) {
        const columnName = normalizedSql.match(/ADD COLUMN `([^`]+)`/)?.[1];
        if (columnName) schemaColumns.add(columnName);
        state.schemaAlters.push(normalizedSql);
        return [{ warningStatus: 0 }];
      }

      if (normalizedSql.startsWith("ALTER TABLE f2_roulette_settlements ADD INDEX")) {
        const indexName = normalizedSql.match(/ADD INDEX `([^`]+)`/)?.[1];
        const columns = [...normalizedSql.matchAll(/`([^`]+)`/g)].slice(1).map((match) => match[1]);
        if (indexName) schemaIndexes.set(indexName, columns);
        state.schemaAlters.push(normalizedSql);
        return [{ warningStatus: 0 }];
      }

      if (normalizedSql.startsWith("SELECT donate FROM accounts")) {
        if (options.selectGate) await options.selectGate;
        return [[{ donate }]];
      }

      if (normalizedSql.startsWith("SELECT bet_amount")) {
        return [[settlements.get(`${params[0]}:${params[1]}`)].filter(Boolean)];
      }

      if (normalizedSql.startsWith("UPDATE accounts SET donate")) {
        if (options.failUpdate) throw new Error("forced update failure");
        donate = Number(params[0]);
        state.updates.push({ donate, accountId: params[1] });
        return [{ affectedRows: 1 }];
      }

      if (normalizedSql.startsWith("INSERT INTO f2_roulette_settlements")) {
        const [
          accountId,
          requestId,
          characterUuid,
          betAmount,
          selectedMultiplier,
          segmentId,
          resultMultiplier,
          win,
          winAmount,
          balanceBefore,
          balanceAfter,
        ] = params;
        settlements.set(`${accountId}:${requestId}`, {
          account_id: accountId,
          request_id: requestId,
          character_uuid: characterUuid,
          bet_amount: betAmount,
          selected_multiplier: selectedMultiplier,
          segment_id: segmentId,
          result_multiplier: resultMultiplier,
          win,
          win_amount: winAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
        });
        state.inserts += 1;
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function getResult(player, requestId) {
  const call = player.calls.find(({ eventName, args }) => (
    eventName === "c:roulette:result"
    && JSON.parse(args[0]).requestId === requestId
  ));
  return call ? JSON.parse(call.args[0]) : null;
}

test("roulette configuration preserves a house edge for every selection", () => {
  assert.equal(getTotalChance(), 100);
  for (const expectedReturn of Object.values(getExpectedReturns())) {
    assert.ok(expectedReturn > 0);
    assert.ok(expectedReturn < 1);
  }
});

test("roulette authorizes, persists, replays, and rolls back account settlements", async () => {
  const handlers = new Map();
  const originalMp = global.mp;
  const originalWithConn = db.withConn;
  const originalQuery = db.query;
  const originalWriteDonateLog = logsDb.writeDonateLog;
  const originalConsoleError = console.error;
  const originalF2CacheModule = require.cache[f2CachePath];
  const logs = [];
  const errors = [];
  let cacheInvalidations = 0;
  let logGate = null;
  let connection;

  global.mp = {
    events: {
      add(name, handler) {
        handlers.set(name, handler);
      },
    },
    players: {
      exists(player) {
        return Boolean(player?.connected !== false);
      },
    },
  };
  db.withConn = async (callback) => callback(connection);
  logsDb.writeDonateLog = async (entry) => {
    logs.push(entry);
    if (logGate) await logGate;
  };
  console.error = (...args) => {
    errors.push(args);
  };
  require.cache[f2CachePath] = {
    id: f2CachePath,
    filename: f2CachePath,
    loaded: true,
    exports: {
      get() { return null; },
      patch() {},
      invalidate() { cacheInvalidations += 1; },
    },
  };
  delete require.cache[roulettePath];

  try {
    const roulette = require(roulettePath);
    const bet = handlers.get("s:roulette:bet");
    const acknowledge = handlers.get("s:roulette:ack");

    assert.equal(typeof bet, "function");
    assert.equal(typeof acknowledge, "function");
    assert.equal(roulette.validateBet(10, 5), null);
    assert.equal(roulette.validateBet(0, 5), "Некорректная ставка.");
    assert.equal(roulette.normalizeRequestId("../invalid"), null);
    assert.equal(roulette.pickRouletteSegment(() => 0).id, "x5-small");

    const unauthorizedPlayers = [
      createPlayer(10),
      createPlayer(11),
      createPlayer(12),
      createPlayer(13),
    ];
    unauthorizedPlayers[0].auth = false;
    unauthorizedPlayers[1].character = null;
    unauthorizedPlayers[2].__twinkleAuthPhase = "character_selection";
    unauthorizedPlayers[3].character.account_id += 1;
    connection = createConnection(100);

    for (const unauthorized of unauthorizedPlayers) {
      const requestId = `roulette:test:unauthorized:${unauthorized.id}`;
      await bet(unauthorized, 10, 5, requestId);
      assert.equal(getResult(unauthorized, requestId).success, false);
    }
    assert.equal(connection.state.began, 0);

    const winner = createPlayer(1, 999);
    connection = createConnection(100);
    const identity = roulette.getPlayerIdentity(winner);
    const first = await roulette.settleRouletteBet(
      identity,
      "roulette:test:durable",
      10,
      5,
      () => 0
    );
    connection.setDonate(250);
    const replay = await roulette.settleRouletteBet(
      identity,
      "roulette:test:durable",
      10,
      5,
      () => 99
    );

    assert.equal(first.replayed, false);
    assert.equal(connection.state.schemaAlters.some((sql) => sql.includes("`acknowledged_at`")), true);
    assert.equal(connection.state.schemaAlters.some((sql) => sql.includes("`idx_f2_roulette_account_ack_created`")), true);
    assert.equal(first.segmentId, "x5-small");
    assert.equal(first.donateAfter, 140);
    assert.equal(replay.replayed, true);
    assert.equal(replay.segmentId, first.segmentId);
    assert.equal(replay.settlementBalanceAfter, first.donateAfter);
    assert.equal(replay.donateAfter, 250);
    assert.equal(connection.state.updates.length, 1);
    assert.equal(connection.state.inserts, 1);

    const acknowledgementQueries = [];
    db.query = async (sql, params) => {
      acknowledgementQueries.push({ sql: String(sql), params });
      return { affectedRows: 1 };
    };
    await acknowledge(winner, "roulette:test:durable");
    assert.equal(acknowledgementQueries.length, 1);
    assert.deepEqual(acknowledgementQueries[0].params, [winner.accountId, "roulette:test:durable"]);
    assert.equal(cacheInvalidations, 1);
    db.query = originalQuery;

    await assert.rejects(
      roulette.settleRouletteBet(identity, "roulette:test:durable", 11, 5, () => 0),
      (error) => error?.code === "request_conflict"
    );

    const failed = createPlayer(2);
    connection = createConnection(100, { failUpdate: true });
    await bet(failed, 10, 5, "roulette:test:failure");

    assert.equal(connection.state.committed, 0);
    assert.equal(connection.state.rolledBack, 1);
    assert.equal(failed.donate, 100);
    assert.equal(getResult(failed, "roulette:test:failure").success, false);
    assert.equal(errors.some((entry) => String(entry[0]).includes("Bet settlement error")), true);

    let releaseLog;
    logGate = new Promise((resolve) => {
      releaseLog = resolve;
    });
    const slowAudit = createPlayer(4);
    connection = createConnection(100);
    await bet(slowAudit, 10, 5, "roulette:test:slow-audit");
    assert.equal(getResult(slowAudit, "roulette:test:slow-audit").success, true);
    releaseLog();
    logGate = null;

    let releaseSelect;
    const selectGate = new Promise((resolve) => {
      releaseSelect = resolve;
    });
    const duplicate = createPlayer(3);
    connection = createConnection(100, { selectGate });
    const firstBet = bet(duplicate, 10, 5, "roulette:test:duplicate");
    await Promise.resolve();
    const attachedRetry = bet(duplicate, 10, 5, "roulette:test:duplicate");
    const competingBet = bet(duplicate, 10, 3, "roulette:test:competing");
    await competingBet;
    assert.equal(getResult(duplicate, "roulette:test:competing").success, false);
    releaseSelect();
    await Promise.all([firstBet, attachedRetry]);
    assert.equal(connection.state.updates.length, 1);
    assert.equal(connection.state.inserts, 1);
    assert.equal(
      duplicate.calls.filter(({ eventName, args }) => (
        eventName === "c:roulette:result"
        && JSON.parse(args[0]).requestId === "roulette:test:duplicate"
      )).length,
      2
    );
    await Promise.resolve();
    assert.equal(logs.length, 2);
  } finally {
    delete require.cache[roulettePath];
    db.withConn = originalWithConn;
    db.query = originalQuery;
    logsDb.writeDonateLog = originalWriteDonateLog;
    console.error = originalConsoleError;
    if (originalF2CacheModule) require.cache[f2CachePath] = originalF2CacheModule;
    else delete require.cache[f2CachePath];
    global.mp = originalMp;
  }
});
