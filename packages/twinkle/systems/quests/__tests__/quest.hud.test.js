"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { buildQuestHudPatch } = require("../quest.hud.js");

function makeActiveSnapshot() {
  return {
    active: {
      title: "Дорожная карта новичка",
      objective: "Получите стартовые документы",
      progress: { current: 1, target: 3 },
    },
  };
}

test("newcomer quest maps to a visible HUD task", () => {
  assert.deepEqual(buildQuestHudPatch(makeActiveSnapshot()), {
    tasks: {
      isVisible: true,
      merge: true,
      items: [{
        id: "quest:current",
        type: "yellow",
        title: "Дорожная карта новичка",
        description: "Получите стартовые документы",
        progress: { activeStep: 1, steps: 3 },
      }],
    },
  });
});

test("inactive newcomer quest removes only its own HUD task", () => {
  const patch = buildQuestHudPatch({ active: null });
  assert.equal(Object.hasOwn(patch.tasks, "isVisible"), false);
  assert.equal(patch.tasks.merge, true);
  assert.deepEqual(patch.tasks.items, [{
    id: "quest:current",
    type: "yellow",
    title: "Задание",
    description: "",
    hidden: true,
  }]);
});

test("inactive newcomer quest preserves another task owner's hidden container", () => {
  const hudPath = path.resolve(__dirname, "../../hud/hud.service.js");
  const calls = [];
  const player = {
    id: 78,
    character: { uuid: 1002, cash: 500, bank: 250, water: 80, food: 70 },
    call(name, args = []) { calls.push({ name, args }); },
  };
  const previousMp = global.mp;

  global.mp = {
    config: { maxplayers: 100 },
    events: { add() {} },
    players: { exists(candidate) { return candidate === player; }, length: 1 },
  };
  delete require.cache[hudPath];

  try {
    const hud = require(hudPath);
    hud.sync(player);
    hud.update(player, buildQuestHudPatch(makeActiveSnapshot()));
    hud.update(player, {
      tasks: {
        isVisible: false,
        merge: true,
        items: [{ id: "event:pending", type: "red", title: "Event", description: "Pending" }],
      },
    });
    hud.update(player, buildQuestHudPatch({ active: null }));
    hud.show(player);

    const payload = JSON.parse(calls.at(-1).args[0]);
    assert.equal(payload.tasks.isVisible, false);
    assert.deepEqual(payload.tasks.items.map((item) => item.id), ["event:pending"]);
    hud.destroy(player);
  } finally {
    delete require.cache[hudPath];
    global.mp = previousMp;
  }
});

test("HUD cache retains the newcomer task across a later show refresh", () => {
  const hudPath = path.resolve(__dirname, "../../hud/hud.service.js");
  const calls = [];
  const player = {
    id: 77,
    character: { uuid: 1001, cash: 500, bank: 250, water: 80, food: 70 },
    call(name, args = []) { calls.push({ name, args }); },
  };
  const previousMp = global.mp;

  global.mp = {
    config: { maxplayers: 100 },
    events: { add() {} },
    players: { exists(candidate) { return candidate === player; }, length: 1 },
  };
  delete require.cache[hudPath];

  try {
    const hud = require(hudPath);
    hud.sync(player);
    hud.update(player, buildQuestHudPatch(makeActiveSnapshot()));
    hud.show(player);

    const lastShow = calls.at(-1);
    assert.equal(lastShow.name, "c:hud:show");
    const payload = JSON.parse(lastShow.args[0]);
    assert.equal(payload.tasks.isVisible, true);
    assert.equal(payload.tasks.items.length, 1);
    assert.equal(payload.tasks.items[0].id, "quest:current");
    assert.equal(payload.tasks.items[0].description, "Получите стартовые документы");
    hud.destroy(player);
  } finally {
    delete require.cache[hudPath];
    global.mp = previousMp;
  }
});

test("a full HUD rebuild rehydrates the current quest from authoritative player state", () => {
  const hudPath = path.resolve(__dirname, "../../hud/hud.service.js");
  const calls = [];
  const player = {
    id: 79,
    character: { uuid: 1003, cash: 500, bank: 250, water: 80, food: 70 },
    twinkleCharacterSessionEpoch: 7,
    twinkleQuestState: {
      ...makeActiveSnapshot(),
      characterUuid: 1003,
      sessionEpoch: 7,
    },
    call(name, args = []) { calls.push({ name, args }); },
  };
  const previousMp = global.mp;

  global.mp = {
    config: { maxplayers: 100 },
    events: { add() {} },
    players: { exists(candidate) { return candidate === player; }, length: 1 },
  };
  delete require.cache[hudPath];

  try {
    const hud = require(hudPath);
    hud.sync(player);
    hud.update(player, {
      tasks: {
        isVisible: true,
        merge: true,
        items: [{
          id: "daily-online-reward",
          type: "red",
          title: "Daily reward",
          description: "Online reward",
        }],
      },
    });
    hud.sync(player);

    const payload = JSON.parse(calls.at(-1).args[0]);
    assert.equal(payload.tasks.isVisible, true);
    assert.deepEqual(payload.tasks.items.map((item) => item.id), [
      "daily-online-reward",
      "quest:current",
    ]);
    assert.equal(payload.tasks.items[0].description, "Online reward");
    assert.equal(payload.tasks.items[1].description, "Получите стартовые документы");

    player.twinkleQuestState = {
      ...player.twinkleQuestState,
      active: null,
    };
    hud.sync(player);
    const completedQuestPayload = JSON.parse(calls.at(-1).args[0]);
    assert.equal(completedQuestPayload.tasks.isVisible, true);
    assert.deepEqual(
      completedQuestPayload.tasks.items.map((item) => item.id),
      ["daily-online-reward"]
    );

    player.character = { ...player.character, uuid: 2003 };
    player.twinkleCharacterSessionEpoch = 8;
    hud.sync(player);
    const nextCharacterPayload = JSON.parse(calls.at(-1).args[0]);
    assert.equal(nextCharacterPayload.tasks.isVisible, false);
    assert.deepEqual(nextCharacterPayload.tasks.items, []);
    hud.destroy(player);
  } finally {
    delete require.cache[hudPath];
    global.mp = previousMp;
  }
});

test("initial HUD show contains loaded reward and quest tasks before later updates", () => {
  const hudPath = path.resolve(__dirname, "../../hud/hud.service.js");
  const calls = [];
  const player = {
    id: 80,
    character: { uuid: 1004, cash: 500, bank: 250, water: 80, food: 70 },
    twinkleCharacterSessionEpoch: 9,
    twinkleQuestState: {
      ...makeActiveSnapshot(),
      characterUuid: 1004,
      sessionEpoch: 9,
    },
    call(name, args = []) { calls.push({ name, args }); },
  };
  const previousMp = global.mp;

  global.mp = {
    config: { maxplayers: 100 },
    events: { add() {} },
    players: { exists(candidate) { return candidate === player; }, length: 1 },
  };
  delete require.cache[hudPath];

  try {
    const hud = require(hudPath);
    hud.sync(player, {
      tasks: {
        isVisible: true,
        merge: true,
        items: [{
          id: "daily-online-reward",
          type: "red",
          title: "Daily reward",
          description: "Online reward",
        }],
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "c:hud:show");
    const payload = JSON.parse(calls[0].args[0]);
    assert.equal(payload.tasks.isVisible, true);
    assert.deepEqual(payload.tasks.items.map((item) => item.id), [
      "daily-online-reward",
      "quest:current",
    ]);
    assert.equal(payload.tasks.items[1].description, "Получите стартовые документы");

    hud.update(player, {
      tasks: {
        isVisible: true,
        merge: true,
        items: [{
          id: "daily-online-reward",
          type: "red",
          title: "Daily reward",
          description: "Updated online reward",
        }],
      },
    });
    hud.update(player, buildQuestHudPatch({
      active: {
        ...makeActiveSnapshot().active,
        objective: "Посетите следующую точку",
      },
    }));
    hud.show(player);

    assert.equal(calls[1].name, "c:hud:update");
    assert.equal(calls[2].name, "c:hud:update");
    const updatedPayload = JSON.parse(calls[3].args[0]);
    assert.deepEqual(updatedPayload.tasks.items.map((item) => item.id), [
      "daily-online-reward",
      "quest:current",
    ]);
    assert.equal(updatedPayload.tasks.items[0].description, "Updated online reward");
    assert.equal(updatedPayload.tasks.items[1].description, "Посетите следующую точку");
    hud.destroy(player);
  } finally {
    delete require.cache[hudPath];
    global.mp = previousMp;
  }
});
