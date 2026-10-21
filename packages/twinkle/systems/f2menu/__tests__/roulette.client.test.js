"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("roulette client forwards only validated correlated bets", () => {
  const sourcePath = path.resolve(
    __dirname,
    "../../../../../client_packages/events/f2/roulette.js"
  );
  const handlers = new Map();
  const remoteCalls = [];
  const executedScripts = [];
  const context = {
    console,
    global: {
      uiBrowser: {
        execute(script) {
          executedScripts.push(script);
        },
      },
    },
    globalThis: {},
    mp: {
      events: {
        add(name, handler) {
          handlers.set(name, handler);
        },
        callRemote(...args) {
          remoteCalls.push(args);
        },
      },
    },
  };

  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, {
    filename: sourcePath,
  });

  const bet = handlers.get("cef:roulette:bet");
  assert.equal(typeof bet, "function");

  bet(25, 5, "roulette:test:client");
  assert.deepEqual(remoteCalls, [[
    "s:roulette:bet",
    25,
    5,
    "roulette:test:client",
  ]]);

  bet(0, 5, "roulette:test:invalid-amount");
  bet(25, 7, "roulette:test:invalid-multiplier");
  bet(25, 5, "../invalid-request");
  assert.equal(remoteCalls.length, 1);

  handlers.get("cef:roulette:ready")();
  assert.match(executedScripts.at(-1), /twinkle:roulette:state/);

  handlers.get("cef:roulette:retry")("roulette:test:client");
  assert.equal(remoteCalls.length, 2);
  assert.deepEqual(remoteCalls[1], remoteCalls[0]);

  handlers.get("c:roulette:result")(JSON.stringify({
    requestId: "roulette:test:client",
    success: true,
    donate: 200,
    bet: 25,
    win: true,
    winAmount: 125,
    selectedMultiplier: 5,
    resultMultiplier: 5,
    segmentId: "x5-small",
  }));
  assert.match(executedScripts.at(-2), /twinkle:roulette:result/);
  assert.match(executedScripts.at(-1), /twinkle:f2:update/);

  handlers.get("cef:roulette:ready")();
  const recoveredState = executedScripts.at(-1);
  assert.match(recoveredState, /roulette:test:client/);
  assert.match(recoveredState, /x5-small/);

  handlers.get("cef:roulette:ack")("roulette:test:client");
  assert.deepEqual(remoteCalls.at(-1), ["s:roulette:ack", "roulette:test:client"]);
  const scriptsAfterAck = executedScripts.length;
  handlers.get("c:roulette:result")(JSON.stringify({
    requestId: "roulette:test:client",
    success: true,
    donate: 200,
    bet: 25,
    win: true,
    winAmount: 125,
    selectedMultiplier: 5,
    resultMultiplier: 5,
    segmentId: "x5-small",
  }));
  assert.equal(executedScripts.length, scriptsAfterAck);

  handlers.get("cef:roulette:ready")();
  assert.match(executedScripts.at(-1), /pending\\\":null/);

  handlers.get("cef:roulette:ack")("roulette:test:payload-recovery");
  assert.deepEqual(remoteCalls.at(-1), [
    "s:roulette:ack",
    "roulette:test:payload-recovery",
  ]);

  handlers.get("c:roulette:result")(JSON.stringify({
    requestId: "roulette:test:malformed",
    success: true,
    donate: 200,
  }));
  bet(10, 3, "roulette:test:after-malformed");
  assert.deepEqual(remoteCalls.at(-1), [
    "s:roulette:bet",
    10,
    3,
    "roulette:test:after-malformed",
  ]);
});
