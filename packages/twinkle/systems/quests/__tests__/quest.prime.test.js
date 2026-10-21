"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.resolve(__dirname, "../quest.service.js");
const dependencyStubs = new Map([
  ["../../../database/query.js", {}],
  ["../../../database/logs.js", {}],
  ["../../../auth/authFlow.js", { isPhase() { return false; }, PHASE: { IN_GAME: "IN_GAME" } }],
  ["../../documents/document.service.js", {}],
  ["../../hud/hud.service.js", { update() {} }],
  ["../../inventory/inventory.service.js", {}],
  ["../../vehicle/vehicle.commands.js", {}],
]);

function loadQuestService(repository) {
  const originalModules = new Map();

  for (const [relativePath, exports] of dependencyStubs) {
    const resolvedPath = path.resolve(__dirname, relativePath);
    originalModules.set(resolvedPath, require.cache[resolvedPath]);
    require.cache[resolvedPath] = { exports };
  }

  const repositoryPath = path.resolve(__dirname, "../quest.repository.js");
  originalModules.set(repositoryPath, require.cache[repositoryPath]);
  require.cache[repositoryPath] = { exports: repository };
  originalModules.set(servicePath, require.cache[servicePath]);
  delete require.cache[servicePath];

  const previousMp = global.mp;
  global.mp = {
    players: {
      exists(player) { return Boolean(player?.connected); },
    },
  };

  return {
    service: require(servicePath),
    restore() {
      global.mp = previousMp;
      delete require.cache[servicePath];

      for (const [resolvedPath, originalModule] of originalModules) {
        if (originalModule) require.cache[resolvedPath] = originalModule;
        else delete require.cache[resolvedPath];
      }
    },
  };
}

function makePlayer(uuid, sessionEpoch) {
  return {
    connected: true,
    character: { uuid },
    characterId: uuid,
    twinkleCharacterSessionEpoch: sessionEpoch,
    setVariable() {},
  };
}

test("quest preparation is single-flight for one character session", async () => {
  let releaseSnapshot;
  let snapshotReads = 0;
  const snapshotGate = new Promise((resolve) => { releaseSnapshot = resolve; });
  const harness = loadQuestService({
    async validateSchema() { return { ok: true }; },
    async getSnapshotRows() {
      snapshotReads += 1;
      await snapshotGate;
      return { quests: [], steps: [] };
    },
  });
  const player = makePlayer(4001, 11);

  try {
    const backgroundPrime = harness.service.primePlayer(player);
    const requiredPrime = harness.service.primePlayer(player, {
      requireAuthoritative: true,
      reusePrepared: true,
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(snapshotReads, 1);
    releaseSnapshot();

    const [backgroundSnapshot, requiredSnapshot] = await Promise.all([
      backgroundPrime,
      requiredPrime,
    ]);
    assert.equal(snapshotReads, 1);
    assert.equal(backgroundSnapshot, requiredSnapshot);
    assert.equal(requiredSnapshot.characterUuid, 4001);
    assert.equal(requiredSnapshot.sessionEpoch, 11);
  } finally {
    harness.restore();
  }
});

test("authoritative quest preparation rejects instead of fabricating an inactive state", async () => {
  let snapshotReads = 0;
  const databaseError = new Error("quest database unavailable");
  databaseError.questReason = "schema";
  const harness = loadQuestService({
    async validateSchema() { return { ok: true }; },
    async getSnapshotRows() {
      snapshotReads += 1;
      throw databaseError;
    },
  });
  const player = makePlayer(4002, 12);

  try {
    const fallback = await harness.service.primePlayer(player);
    assert.equal(fallback.active, null);

    await assert.rejects(
      harness.service.primePlayer(player, {
        requireAuthoritative: true,
        reusePrepared: true,
      }),
      databaseError
    );
    assert.equal(snapshotReads, 2);
  } finally {
    harness.restore();
  }
});
