"use strict";

const crypto = require("crypto");
const config = require("./drivingSchool.config.js");
const db = require("../../database/query.js");
const licenses = require("../licenses/license.service.js");
const quests = require("../quests/quest.service.js");

try {
  global.__twinkleDrivingSchoolRuntime?.shutdown?.();
} catch (error) {
  console.error("[DRIVING_SCHOOL] Previous runtime shutdown failed:", error);
}

const sessions = new Map();
const paymentLocks = new Map();
const runtime = {
  active: true,
  events: [],
  monitor: null,
  shutdown: null,
};
global.__twinkleDrivingSchoolRuntime = runtime;

function registerEvent(name, handler) {
  const guarded = (...args) => {
    if (!runtime.active) return undefined;
    return handler(...args);
  };
  mp.events.add(name, guarded);
  runtime.events.push({ name, handler: guarded });
}

function existsPlayer(player) {
  try {
    return Boolean(player && mp.players.exists(player));
  } catch {
    return Boolean(player);
  }
}

function existsVehicle(vehicle) {
  try {
    return Boolean(vehicle && mp.vehicles.exists(vehicle));
  } catch {
    return Boolean(vehicle);
  }
}

function getUuid(player) {
  return Number(
    player?.uuid ||
    player?.characterId ||
    player?.character?.uuid ||
    player?.characterData?.uuid ||
    player?.getVariable?.("uuid") ||
    0
  );
}

function distance(a, b) {
  if (!a || !b) return Number.MAX_SAFE_INTEGER;
  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dy = Number(a.y || 0) - Number(b.y || 0);
  const dz = Number(a.z || 0) - Number(b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isDriverSeat(seat) {
  const normalized = Number(seat);
  return normalized === 0 || normalized === -1;
}

function isPlayerDriving(session) {
  if (!session || !existsPlayer(session.player) || !existsVehicle(session.vehicle)) return false;
  if (session.player.vehicle !== session.vehicle) return false;

  try {
    if (typeof session.vehicle.getOccupant === "function") {
      const driver = session.vehicle.getOccupant(0) || session.vehicle.getOccupant(-1);
      if (driver) return driver === session.player;
    }
  } catch {}

  try {
    if (session.player.seat !== undefined && session.player.seat !== null) {
      return isDriverSeat(session.player.seat);
    }
  } catch {}

  return isDriverSeat(session.currentSeat);
}

function parsePayload(raw) {
  try {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function notify(player, message, variant = "info") {
  if (!existsPlayer(player)) return;
  try {
    player.call("client:drivingSchool:notify", [String(message), String(variant)]);
  } catch {}
}

function syncCash(player, cash) {
  const nextCash = Math.max(0, Number(cash || 0));
  if (player.character) player.character.cash = nextCash;
  if (player.characterData) player.characterData.cash = nextCash;
  try { player.setVariable("cash", nextCash); } catch {}
  try {
    player.call("c:hud:update", [JSON.stringify({ player: { cash: nextCash } })]);
  } catch {}
}

function sanitizeQuestion(session) {
  const question = session.questions[session.questionIndex];
  if (!question) return null;
  return {
    index: session.questionIndex,
    total: session.questions.length,
    text: question.text,
    answers: question.answers.slice(),
  };
}

function getTheoryPayload(session, extra = {}) {
  const payload = {
    token: session.token,
    mode: session.mode || "exam",
    price: config.price,
    phase: session.phase,
    theory: config.theory.slice(),
    question: session.phase === "questions" ? sanitizeQuestion(session) : null,
    studyQuestions: session.mode === "study"
      ? session.questions.map((question, index) => ({
        index,
        text: question.text,
        answers: question.answers.slice(),
        correct: question.correct,
        explanation: question.explanation,
      }))
      : undefined,
    score: session.score,
    total: session.questions.length,
    ...extra,
  };
  return payload;
}

function callUi(player, eventName, payload) {
  if (!existsPlayer(player)) return;
  try { player.call(eventName, [JSON.stringify(payload || {})]); } catch {}
}

function openTheoryUi(session) {
  callUi(session.player, "client:drivingSchool:open", getTheoryPayload(session));
}

function updateTheoryUi(session, extra = {}) {
  callUi(session.player, "client:drivingSchool:update", getTheoryPayload(session, extra));
}

function clearClient(session) {
  if (!existsPlayer(session.player)) return;
  try { session.player.call("client:drivingSchool:clearRoute", []); } catch {}
  try { session.player.call("client:drivingSchool:close", []); } catch {}
}

function schedule(session, delay, callback) {
  const timer = setTimeout(() => {
    session.timers.delete(timer);
    if (!runtime.active || sessions.get(session.player.id) !== session || session.ending) return;
    try {
      const result = callback();
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          console.error("[DRIVING_SCHOOL] Scheduled action failed:", error);
          finishExam(session, false, "Экзамен завершён из-за внутренней ошибки.");
        });
      }
    } catch (error) {
      console.error("[DRIVING_SCHOOL] Scheduled action failed:", error);
      finishExam(session, false, "Экзамен завершён из-за внутренней ошибки.");
    }
  }, delay);
  session.timers.add(timer);
}

function readVehicleHealth(vehicle) {
  let body = 1000;
  let engine = 1000;
  try { body = Number(vehicle.bodyHealth ?? vehicle.getBodyHealth?.() ?? 1000); } catch {}
  try { engine = Number(vehicle.engineHealth ?? vehicle.getEngineHealth?.() ?? 1000); } catch {}
  return {
    body: Number.isFinite(body) ? body : 1000,
    engine: Number.isFinite(engine) ? engine : 1000,
  };
}

function isVehicleDamaged(session) {
  if (!existsVehicle(session.vehicle) || !session.baselineHealth) return true;
  const current = readVehicleHealth(session.vehicle);
  return (
    current.body < session.baselineHealth.body - config.damageTolerance ||
    current.engine < session.baselineHealth.engine - config.damageTolerance ||
    current.body <= 0 ||
    current.engine <= 0
  );
}

function restorePlayer(session) {
  const player = session.player;
  if (!existsPlayer(player) || session.quitting) return;

  try { player.removeFromVehicle?.(); } catch {}
  try { player.dimension = Number(session.returnState.dimension || 0); } catch {}
  try {
    player.position = new mp.Vector3(
      session.returnState.position.x,
      session.returnState.position.y,
      session.returnState.position.z
    );
  } catch {}
  try { player.heading = Number(session.returnState.heading || 0); } catch {}
}

function finishExam(session, passed, message, options = {}) {
  if (!session || session.ending) return;
  session.ending = true;
  session.quitting = Boolean(options.quitting);
  sessions.delete(session.player.id);

  for (const timer of session.timers) clearTimeout(timer);
  session.timers.clear();
  clearClient(session);

  const vehicle = session.vehicle;
  session.vehicle = null;
  restorePlayer(session);
  if (existsVehicle(vehicle)) {
    try { vehicle.destroy(); } catch {}
  }
  if (!session.quitting && message) {
    notify(session.player, message, passed ? "success" : "error");
  }

  console.log(
    `[DRIVING_SCHOOL] ${passed ? "PASS" : "FAIL"} player=${session.player.id} uuid=${session.uuid} phase=${session.phase}`
  );
}

function finishStudy(session, options = {}) {
  if (!session || session.ending) return;
  session.ending = true;
  session.quitting = Boolean(options.quitting);
  sessions.delete(session.player.id);

  for (const timer of session.timers) clearTimeout(timer);
  session.timers.clear();
  clearClient(session);
  console.log(`[DRIVING_SCHOOL] STUDY_END player=${session.player.id} uuid=${session.uuid}`);
}

async function chargeAttempt(player) {
  const uuid = getUuid(player);
  if (!uuid) return { ok: false, reason: "Сначала выберите персонажа." };

  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [rows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [uuid]
      );
      const cash = Number(rows?.[0]?.cash || 0);
      if (!rows?.[0] || cash < config.price) {
        await connection.rollback();
        return { ok: false, reason: `Недостаточно наличных. Нужно $${config.price}.` };
      }

      const [result] = await connection.query(
        "UPDATE characters SET cash = cash - ? WHERE uuid = ? AND cash >= ?",
        [config.price, uuid, config.price]
      );
      if (Number(result?.affectedRows || 0) !== 1) {
        await connection.rollback();
        return { ok: false, reason: "Не удалось оплатить экзамен." };
      }

      await connection.commit();
      return { ok: true, cash: cash - config.price };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function refundAttempt(uuid) {
  if (!uuid) return;
  await db.query("UPDATE characters SET cash = cash + ? WHERE uuid = ?", [
    config.price,
    uuid,
  ]);
}

function isNearInstructor(player, npc) {
  if (!player || !npc?.position || !player.position) return false;
  if (Number(player.dimension || 0) !== 0) return false;
  if (player.currentNpcDialogId !== npc.id) return false;
  return distance(player.position, npc.position) <= Number(npc.colshapeRadius || 4) + 1.5;
}

function openTheoryStudy(player, npc) {
  if (!existsPlayer(player) || !player.auth || !getUuid(player)) {
    notify(player, "Сначала авторизуйтесь и выберите персонажа.", "error");
    return false;
  }
  if (npc?.id !== "driving_school_instructor" || !isNearInstructor(player, npc)) {
    notify(player, "Подойдите к инструктору автошколы.", "error");
    return false;
  }
  if (player.vehicle) {
    notify(player, "Выйдите из транспорта, чтобы изучать теорию.", "error");
    return false;
  }
  if (sessions.has(player.id) || paymentLocks.has(player.id)) {
    notify(player, "Занятие или экзамен уже запущены.", "error");
    return false;
  }

  const session = {
    player,
    uuid: getUuid(player),
    mode: "study",
    token: crypto.randomBytes(18).toString("hex"),
    phase: "study",
    questions: config.questions.map((question) => ({
      text: question.text,
      answers: question.answers.slice(),
      correct: question.correct,
      explanation: question.explanation,
    })),
    questionIndex: 0,
    score: 0,
    expiresAt: Date.now() + config.studyTimeoutMs,
    vehicle: null,
    timers: new Set(),
    ending: false,
    quitting: false,
  };
  sessions.set(player.id, session);
  openTheoryUi(session);
  notify(player, "Режим изучения открыт бесплатно. Ответьте на вопрос, чтобы увидеть разбор.", "info");
  return true;
}

async function openSchool(player, npc) {
  if (!existsPlayer(player) || !player.auth || !getUuid(player)) {
    notify(player, "Сначала авторизуйтесь и выберите персонажа.", "error");
    return false;
  }
  if (npc?.id !== "driving_school_instructor" || !isNearInstructor(player, npc)) {
    notify(player, "Подойдите к инструктору автошколы.", "error");
    return false;
  }
  if (player.vehicle) {
    notify(player, "Выйдите из транспорта перед началом экзамена.", "error");
    return false;
  }
  if (sessions.has(player.id) || paymentLocks.has(player.id)) {
    notify(player, "Экзамен уже запускается.", "error");
    return false;
  }

  const lock = { player, uuid: getUuid(player) };
  paymentLocks.set(player.id, lock);
  try {
    const payment = await chargeAttempt(player);
    if (!payment.ok) {
      notify(player, payment.reason, "error");
      return false;
    }

    const stillValid = (
      paymentLocks.get(player.id) === lock &&
      existsPlayer(player) &&
      getUuid(player) === lock.uuid &&
      isNearInstructor(player, npc) &&
      !sessions.has(player.id)
    );
    if (!stillValid) {
      try {
        await refundAttempt(lock.uuid);
      } catch (refundError) {
        console.error("[DRIVING_SCHOOL] Failed to refund interrupted attempt:", refundError);
      }
      return false;
    }

    syncCash(player, payment.cash);
    const position = player.position;
    const session = {
      player,
      uuid: getUuid(player),
      mode: "exam",
      token: crypto.randomBytes(18).toString("hex"),
      phase: "theoryIntro",
      questions: config.questions.map((question) => ({
        text: question.text,
        answers: question.answers.slice(),
        correct: question.correct,
        explanation: question.explanation,
      })),
      questionIndex: 0,
      score: 0,
      expiresAt: Date.now() + config.theoryTimeoutMs,
      returnState: {
        position: { x: position.x, y: position.y, z: position.z },
        heading: Number(player.heading || 0),
        dimension: Number(player.dimension || 0),
      },
      dimension: config.dimensionBase + Number(player.id),
      vehicle: null,
      baselineHealth: null,
      checkpointIndex: 0,
      currentSeat: 0,
      leftStart: false,
      lastCheckpointAt: 0,
      graceUntil: 0,
      timers: new Set(),
      ending: false,
      quitting: false,
    };

    sessions.set(player.id, session);
    openTheoryUi(session);
    notify(player, `Экзамен оплачен: $${config.price}.`, "success");
    return true;
  } catch (error) {
    console.error("[DRIVING_SCHOOL] Failed to open school:", error);
    notify(player, "Не удалось запустить экзамен. Попробуйте позже.", "error");
    return false;
  } finally {
    if (paymentLocks.get(player.id) === lock) paymentLocks.delete(player.id);
  }
}

function showUnavailable(player, category) {
  const normalized = ["A", "C"].includes(String(category).toUpperCase())
    ? String(category).toUpperCase()
    : "A/C";
  notify(
    player,
    `Категория ${normalized} пока недоступна. Система лицензий оставлена заглушкой.`,
    "info"
  );
}

function getSession(player, rawPayload, allowedPhases) {
  const payload = parsePayload(rawPayload);
  const session = sessions.get(player.id);
  if (!session || session.ending) return null;
  if (session.player !== player || session.uuid !== getUuid(player)) return null;
  if (payload.token !== session.token) return null;
  if (allowedPhases && !allowedPhases.includes(session.phase)) return null;
  return { session, payload };
}

function sendCheckpoint(session) {
  const point = config.route[session.checkpointIndex];
  if (!point || !existsPlayer(session.player)) return;
  try {
    session.player.call("client:drivingSchool:setCheckpoint", [JSON.stringify({
      token: session.token,
      index: session.checkpointIndex,
      total: config.route.length,
      point,
      vehicleId: Number(session.vehicle?.id ?? -1),
      dimension: session.dimension,
    })]);
  } catch {}
}

async function awardCategoryB(session) {
  if (!session || session.ending || sessions.get(session.player.id) !== session) return;
  session.phase = "awardingLicense";

  let alreadyOwned = false;
  let hasPhysicalDocument = false;
  let licenseRecord = null;

  try {
    alreadyOwned = await licenses.hasLicense(session.player, "vehicle_b");
    hasPhysicalDocument = alreadyOwned
      ? await licenses.hasLicenseDocumentItem(session.player, "vehicle_b")
      : false;

    if (!alreadyOwned || !hasPhysicalDocument) {
      licenseRecord = await licenses.issueDrivingExamLicense(session.player, "vehicle_b");
    }
  } catch (error) {
    console.error("[DRIVING_SCHOOL] Category B licence award failed:", error);
    finishExam(session, false, "Экзамен завершён, но лицензию выдать не удалось. Обратитесь к администрации.");
    return;
  }

  try {
    await quests.recordProgress(session.player, {
      type: "license.issued",
      subjectId: "vehicle_b",
      amount: 1,
      idempotencyKey: `license:${session.uuid}:vehicle_b:${licenseRecord?.documentNumber || licenseRecord?.document_number || licenseRecord?.number || "existing"}`,
      metadata: {
        licenseId: "vehicle_b",
        acquisitionChannel: "driving_exam",
        repairedDocument: alreadyOwned && !hasPhysicalDocument,
      },
    }, { sync: true });
  } catch (error) {
    console.error("[DRIVING_SCHOOL] Category B quest progress failed after licence commit:", error);
  }

  finishExam(
    session,
    true,
    alreadyOwned && hasPhysicalDocument
      ? "Экзамен категории B сдан. Ваша действующая лицензия сохранена."
      : (alreadyOwned
        ? "Экзамен категории B сдан. Физический документ лицензии восстановлен в инвентаре."
        : "Экзамен категории B сдан. Лицензия выдана и добавлена в инвентарь.")
  );
}

async function startPractical(session) {
  if (sessions.get(session.player.id) !== session || session.ending) return;
  const player = session.player;
  if (!existsPlayer(player)) return finishExam(session, false, null, { quitting: true });

  session.phase = "practicalStarting";
  session.checkpointIndex = 0;
  session.leftStart = false;
  session.currentSeat = 0;
  session.graceUntil = Date.now() + 5000;
  session.expiresAt = Date.now() + config.practicalTimeoutMs;

  clearClient(session);
  try {
    player.dimension = session.dimension;
    player.position = new mp.Vector3(config.start.x, config.start.y, config.start.z + 0.8);
    player.heading = config.start.heading;

    const vehicle = mp.vehicles.new(
      mp.joaat(config.vehicleModel),
      new mp.Vector3(config.start.x, config.start.y, config.start.z),
      {
        heading: config.start.heading,
        numberPlate: "SCHOOL",
        locked: false,
        engine: true,
        dimension: session.dimension,
      }
    );
    session.vehicle = vehicle;
    session.baselineHealth = readVehicleHealth(vehicle);
    vehicle.drivingSchoolExam = true;
    vehicle.drivingSchoolPlayerId = player.id;
    vehicle.drivingSchoolToken = session.token;
    try {
      vehicle.engine = true;
      vehicle.locked = false;
      vehicle.setVariable("drivingSchoolExam", true);
      vehicle.setVariable("drivingSchoolPlayerId", player.id);
      vehicle.setVariable("ownerType", "player");
      vehicle.setVariable("ownerId", session.uuid);
      vehicle.setVariable("engine", true);
      vehicle.setVariable("locked", false);
      vehicle.setVariable("fuel", 100);
      vehicle.setVariable("fuelMax", 100);
    } catch {}

    schedule(session, 250, () => {
      if (!existsVehicle(vehicle) || !existsPlayer(player)) return;
      try {
        player.putIntoVehicle(vehicle, 0);
        player.call("c:vehicle:engine:set", [true]);
        player.call("c:vehicle:lock:set", [vehicle.id, false]);
      } catch (error) {
        console.error("[DRIVING_SCHOOL] putIntoVehicle failed:", error);
      }
    });

    schedule(session, 1400, () => {
      if (!existsVehicle(vehicle)) {
        finishExam(session, false, "Учебная машина не была создана.");
        return;
      }
      session.phase = "practical";
      sendCheckpoint(session);
      notify(player, "Практика началась. Следуйте к точке 002, не повреждая машину.", "info");
    });
  } catch (error) {
    console.error("[DRIVING_SCHOOL] Practical start failed:", error);
    finishExam(session, false, "Не удалось создать учебную машину.");
  }
}

registerEvent("server:drivingSchool:beginTheory", (player, rawPayload) => {
  const state = getSession(player, rawPayload, ["theoryIntro"]);
  if (!state) return;
  const { session } = state;
  session.phase = "questions";
  session.questionIndex = 0;
  session.score = 0;
  session.expiresAt = Date.now() + config.theoryTimeoutMs;
  updateTheoryUi(session);
});

registerEvent("server:drivingSchool:answer", (player, rawPayload) => {
  const state = getSession(player, rawPayload, ["questions"]);
  if (!state) return;
  const { session, payload } = state;
  const answer = Number(payload.answer);
  if (Number(payload.index) !== session.questionIndex || !Number.isInteger(answer)) return;

  const question = session.questions[session.questionIndex];
  if (!question || answer < 0 || answer >= question.answers.length) return;
  const correct = answer === question.correct;
  if (correct) session.score += 1;
  session.phase = "theoryFeedback";
  updateTheoryUi(session, {
    feedback: correct ? "Верно" : "Неверно",
    feedbackCorrect: correct,
  });

  schedule(session, 850, () => {
    const lastQuestion = session.questionIndex >= session.questions.length - 1;
    if (!lastQuestion) {
      session.questionIndex += 1;
      session.phase = "questions";
      updateTheoryUi(session);
      return;
    }

    const passed = session.score === session.questions.length;
    session.phase = "theoryResult";
    updateTheoryUi(session, {
      passed,
      resultMessage: passed
        ? "Теория сдана. Готовим учебную машину."
        : `Теория не сдана: ${session.score} из ${session.questions.length}. Нужно ответить правильно на все вопросы.`,
    });
    if (passed) {
      schedule(session, 1500, () => startPractical(session));
    } else {
      schedule(session, 2600, () => finishExam(
        session,
        false,
        `Теория не сдана: ${session.score}/${session.questions.length}.`
      ));
    }
  });
});

registerEvent("server:drivingSchool:checkpoint", (player, rawPayload) => {
  const state = getSession(player, rawPayload, ["practical"]);
  if (!state) return;
  const { session, payload } = state;
  const index = Number(payload.index);
  const now = Date.now();
  if (!Number.isInteger(index) || index !== session.checkpointIndex) return;
  if (now - session.lastCheckpointAt < 250 || now < Number(session.checkpointAvailableAt || 0)) return;
  if (!existsVehicle(session.vehicle) || player.vehicle !== session.vehicle) return;
  if (Number(player.dimension || 0) !== session.dimension) return;
  if (Number(session.vehicle.dimension || 0) !== session.dimension) return;
  if (!isPlayerDriving(session)) return;
  if (isVehicleDamaged(session)) {
    finishExam(session, false, "Учебная машина повреждена. Экзамен не сдан.");
    return;
  }

  const point = config.route[index];
  if (!point || distance(session.vehicle.position, point) > Math.max(12, config.checkpointRadius)) return;
  session.lastCheckpointAt = now;

  if (index === config.route.length - 1) {
    void awardCategoryB(session);
    return;
  }

  session.checkpointIndex += 1;
  const previousPoint = config.route[index];
  const nextPoint = config.route[session.checkpointIndex];
  const segmentDistance = distance(previousPoint, nextPoint);
  session.checkpointAvailableAt = now + Math.max(
    600,
    Math.min(2500, Math.round(segmentDistance / 120 * 1000))
  );
  sendCheckpoint(session);
});

registerEvent("server:drivingSchool:damageHint", (player, rawPayload) => {
  const state = getSession(player, rawPayload, ["practical"]);
  if (!state) return;
  // Клиент может только провалить собственную валидную сессию. Это покрывает
  // шины, окна и двери, которые не всегда уменьшают body/engine health на сервере.
  finishExam(state.session, false, "Учебная машина повреждена. Экзамен не сдан.");
});

registerEvent("server:drivingSchool:cancel", (player, rawPayload) => {
  const state = getSession(player, rawPayload, null);
  if (!state) return;
  if (state.session.mode === "study") {
    finishStudy(state.session);
    return;
  }
  finishExam(state.session, false, "Экзамен отменён. Оплата не возвращается.");
});

registerEvent("playerEnterVehicle", (player, vehicle, seat) => {
  const session = sessions.get(player.id);
  if (!session || session.vehicle !== vehicle || session.ending) return;
  session.currentSeat = Number(seat);
});

registerEvent("playerExitVehicle", (player, vehicle) => {
  const session = sessions.get(player.id);
  if (!session || (vehicle && session.vehicle !== vehicle) || session.ending) return;
  if (session.phase === "practical" && Date.now() >= session.graceUntil) {
    finishExam(session, false, "Вы покинули учебную машину. Экзамен не сдан.");
  }
});

registerEvent("playerDeath", (player) => {
  const session = sessions.get(player.id);
  if (session) finishExam(session, false, "Экзамен не сдан: персонаж погиб.");
});

registerEvent("playerQuit", (player) => {
  const session = sessions.get(player.id);
  const lock = paymentLocks.get(player.id);
  if (lock?.player === player) paymentLocks.delete(player.id);
  if (session?.mode === "study") finishStudy(session, { quitting: true });
  else if (session) finishExam(session, false, null, { quitting: true });
});

registerEvent("vehicleDeath", (vehicle) => {
  for (const session of sessions.values()) {
    if (session.vehicle === vehicle) {
      finishExam(session, false, "Учебная машина уничтожена. Экзамен не сдан.");
      break;
    }
  }
});

registerEvent("vehicleDamage", (vehicle, bodyHealthLoss, engineHealthLoss) => {
  const bodyLoss = Number(bodyHealthLoss || 0);
  const engineLoss = Number(engineHealthLoss || 0);
  if (bodyLoss <= 0 && engineLoss <= 0) return;

  for (const session of sessions.values()) {
    if (session.vehicle === vehicle && !session.ending) {
      finishExam(session, false, "Учебная машина повреждена. Экзамен не сдан.");
      break;
    }
  }
});

runtime.monitor = setInterval(() => {
  const now = Date.now();
  for (const session of Array.from(sessions.values())) {
    if (session.ending) continue;
    if (!existsPlayer(session.player)) {
      if (session.mode === "study") finishStudy(session, { quitting: true });
      else finishExam(session, false, null, { quitting: true });
      continue;
    }
    if (now > session.expiresAt) {
      if (session.mode === "study") {
        notify(session.player, "Время занятия истекло. При необходимости откройте теорию снова.", "info");
        finishStudy(session);
      } else finishExam(session, false, "Время экзамена истекло.");
      continue;
    }
    if (session.mode === "study") continue;
    if (session.phase !== "practical" && session.phase !== "practicalStarting") continue;
    if (!existsVehicle(session.vehicle)) {
      finishExam(session, false, "Учебная машина потеряна. Экзамен не сдан.");
      continue;
    }
    if (
      Number(session.player.dimension || 0) !== session.dimension ||
      Number(session.vehicle.dimension || 0) !== session.dimension
    ) {
      finishExam(session, false, "Нарушено пространство экзамена. Экзамен не сдан.");
      continue;
    }
    if (isVehicleDamaged(session)) {
      finishExam(session, false, "Учебная машина повреждена. Экзамен не сдан.");
      continue;
    }
    if (session.phase === "practicalStarting") continue;
    if (
      now >= session.graceUntil &&
      !isPlayerDriving(session)
    ) {
      finishExam(session, false, "Вы должны оставаться за рулём учебной машины.");
      continue;
    }

    const fromStart = distance(session.vehicle.position, config.start);
    if (!session.leftStart && fromStart > 15) session.leftStart = true;
    const finalIndex = config.route.length - 1;
    const finishPoint = config.route[finalIndex];
    const fromFinish = distance(session.vehicle.position, finishPoint);
    if (session.leftStart && fromFinish <= 7 && session.checkpointIndex < finalIndex) {
      finishExam(session, false, "Вы приехали к финишу, пропустив контрольные точки.");
    }
  }
}, 250);

runtime.shutdown = () => {
  if (!runtime.active) return;
  runtime.active = false;
  if (runtime.monitor) clearInterval(runtime.monitor);
  for (const session of Array.from(sessions.values())) {
    if (session.mode === "study") finishStudy(session);
    else finishExam(session, false, "Экзамен остановлен из-за перезапуска ресурса.");
  }
  sessions.clear();
  paymentLocks.clear();
};

module.exports = {
  openSchool,
  openTheoryStudy,
  showUnavailable,
  finishExam,
};

console.log("[DRIVING_SCHOOL] Server loaded");
