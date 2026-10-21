"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../../../../../");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const config = require("../drivingSchool.config.js");

test("every driving-school question has one valid answer and a study explanation", () => {
  assert.equal(config.questions.length, 10);
  assert.equal(config.studyTimeoutMs, 30 * 60 * 1000);
  for (const question of config.questions) {
    assert.ok(question.text.length > 10);
    assert.ok(question.answers.length >= 3);
    assert.ok(Number.isInteger(question.correct));
    assert.ok(question.correct >= 0 && question.correct < question.answers.length);
    assert.ok(question.explanation.length > 20);
  }
});

test("free study is separate from the paid server-authoritative exam", () => {
  const server = read("packages/twinkle/systems/drivingSchool/drivingSchool.server.js");
  const npcConfig = read("packages/twinkle/systems/npcDialog/npcDialog.config.js");
  const npcServer = read("packages/twinkle/systems/npcDialog/npcDialog.server.js");
  const ui = read("TwinkleFront-main/src/apps/driving-school/DrivingSchoolApp.vue");
  const contracts = read("TwinkleFront-main/src/shared/contracts/ui.ts");
  const studySource = server.slice(server.indexOf("function openTheoryStudy"), server.indexOf("async function openSchool"));

  assert.match(studySource, /mode: "study"/);
  assert.match(studySource, /phase: "study"/);
  assert.doesNotMatch(studySource, /chargeAttempt|syncCash|db\./);
  assert.match(server, /session\.phase === "questions" \? sanitizeQuestion\(session\) : null/);
  assert.match(server, /session\.mode === "study"[\s\S]*correct: question\.correct/);
  assert.match(npcConfig, /action: "drivingSchoolStudy"/);
  assert.match(npcServer, /drivingSchool\.openTheoryStudy\(player, npc\)/);
  assert.match(ui, /studyQuestion\.explanation/);
  assert.match(ui, /answer--correct/);
  assert.match(contracts, /phase: 'study' \|/);
});
