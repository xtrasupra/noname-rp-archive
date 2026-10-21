"use strict";

const db = require("../../database/query.js");
const logsDb = require("../../database/logs.js");
const authFlow = require("../../auth/authFlow.js");
const documents = require("../documents/document.service.js");
const hud = require("../hud/hud.service.js");
const inventory = require("../inventory/inventory.service.js");
const repository = require("./quest.repository.js");
const { buildQuestHudPatch } = require("./quest.hud.js");
const vehicleCommands = require("../vehicle/vehicle.commands.js");
const {
  CONTRACT_VERSION,
  NEWCOMER_QUEST_ID,
  NEWCOMER_QUEST_VERSION,
  QUEST_EVENT_TYPES,
  QUESTS,
  STARTER_VEHICLE_DEALERSHIP,
} = require("./quest.config.js");

const EVENT_TYPES = new Set(QUEST_EVENT_TYPES);
const questQueues = new Map();
const questPreparedSessions = new WeakMap();
const questPrimeOperations = new WeakMap();
let schemaValidationPromise = null;

function getCharacterUuid(player) {
  return Number(
    player?.uuid ||
    player?.staticId ||
    player?.characterId ||
    player?.character?.uuid ||
    player?.characterData?.uuid ||
    player?.getVariable?.("uuid") ||
    0
  );
}

function isPlayerInGame(player) {
  return Boolean(
    player &&
    player.auth &&
    player.accountId &&
    player.character &&
    getCharacterUuid(player) &&
    authFlow.isPhase(player, authFlow.PHASE.IN_GAME)
  );
}

function setPlayerCash(player, value) {
  const cash = Math.max(0, Number(value || 0));
  if (player?.character) player.character.cash = cash;
  if (player?.characterData) player.characterData.cash = cash;
  try { player.setVariable("cash", cash); } catch {}
  try { player.call("client:money:update", [cash]); } catch {}
  try { player.call("c:hud:update", [JSON.stringify({ player: { cash } })]); } catch {}
}

function safeCall(player, eventName, args = []) {
  try {
    if (!player || !eventName) return false;
    player.call(eventName, args);
    return true;
  } catch {
    return false;
  }
}

function notify(player, type, message) {
  if (!message) return;
  if (safeCall(player, "client:notification", [type, String(message)])) return;
  try { player.outputChatBox(String(message)); } catch {}
}

function distance(first, second) {
  if (!first || !second) return Number.POSITIVE_INFINITY;
  const dx = Number(first.x || 0) - Number(second.x || 0);
  const dy = Number(first.y || 0) - Number(second.y || 0);
  const dz = Number(first.z || 0) - Number(second.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isNearPoint(player, point, range) {
  return Boolean(
    player &&
    point?.position &&
    Number(player.dimension || 0) === Number(point.dimension || 0) &&
    distance(player.position, point.position) <= Number(range || 5)
  );
}

function sanitizePosition(position) {
  return {
    x: Number(position?.x || 0),
    y: Number(position?.y || 0),
    z: Number(position?.z || 0),
  };
}

function toVector3(position) {
  return new mp.Vector3(
    Number(position?.x || 0),
    Number(position?.y || 0),
    Number(position?.z || 0)
  );
}

function getQuestDefinition(questId) {
  return QUESTS[String(questId || "")] || null;
}

function getStepDefinition(questDefinition, stepId) {
  return questDefinition?.steps?.find((step) => step.id === stepId) || null;
}

function getStepIndex(questDefinition, stepId) {
  return questDefinition?.steps?.findIndex((step) => step.id === stepId) ?? -1;
}

function getFirstIncompleteStepId(questDefinition, progress) {
  const completedSteps = new Set(Array.isArray(progress?.completedSteps)
    ? progress.completedSteps.map((stepId) => String(stepId))
    : []);
  return questDefinition?.steps?.find((step) => !completedSteps.has(String(step.id)))?.id || null;
}

function getStepTargetAmount(step) {
  return Math.max(1, Math.floor(Number(step?.condition?.target || 1)));
}

function normalizeProgressEvent(rawEvent) {
  const type = String(rawEvent?.type || "").trim();
  const subjectId = rawEvent?.subjectId == null ? "" : String(rawEvent.subjectId).trim();
  const idempotencyKey = String(rawEvent?.idempotencyKey || "").trim();
  const amount = Math.max(1, Math.floor(Number(rawEvent?.amount || 1)));
  const metadata = rawEvent?.metadata && typeof rawEvent.metadata === "object" ? rawEvent.metadata : {};

  if (!EVENT_TYPES.has(type)) {
    const error = new Error(`Unsupported quest progress event: ${type}`);
    error.questReason = "event_type";
    throw error;
  }

  if (!idempotencyKey || idempotencyKey.length > 160) {
    const error = new Error("Quest progress events require a bounded idempotency key.");
    error.questReason = "idempotency";
    throw error;
  }

  return {
    type,
    subjectId: subjectId.slice(0, 96),
    idempotencyKey,
    amount,
    metadata,
  };
}

async function ensureSchemaReady() {
  if (!schemaValidationPromise) {
    schemaValidationPromise = repository.validateSchema().then((status) => {
      if (!status.ok) {
        const error = new Error(
          `Quest schema is missing or incompatible; run db/twinkle_quests_migration.sql (tables: ${status.missingTables.join(", ") || "ok"}, vehicle columns: ${status.missingVehicleColumns.join(", ") || "ok"}, invalid quest columns: ${(status.invalidQuestColumns || []).join(", ") || "ok"}, invalid vehicle columns: ${(status.invalidVehicleColumns || []).join(", ") || "ok"}).`
        );
        error.questReason = "schema";
        throw error;
      }
      return status;
    }).catch((error) => {
      schemaValidationPromise = null;
      throw error;
    });
  }

  return schemaValidationPromise;
}

function runCharacterQueue(characterUuid, work) {
  const key = String(characterUuid || "");
  const previous = questQueues.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(work)
    .finally(() => {
      if (questQueues.get(key) === next) questQueues.delete(key);
    });

  questQueues.set(key, next);
  return next;
}

function serializeTarget(target) {
  if (!target) return null;
  return {
    kind: String(target.kind || "location"),
    label: String(target.label || "Цель задания"),
    position: sanitizePosition(target.position),
    dimension: Number(target.dimension || 0),
  };
}

function buildActiveState(questRow, stepRows) {
  const questDefinition = getQuestDefinition(questRow?.quest_id);
  const step = getStepDefinition(questDefinition, questRow?.current_step_id);
  if (!questDefinition || !step || questRow.state !== "active") return null;

  const stepRow = stepRows.find((row) => (
    Number(row.quest_instance_id) === Number(questRow.id) &&
    String(row.step_id) === String(step.id)
  ));
  const targetAmount = Math.max(1, Number(stepRow?.target_amount || getStepTargetAmount(step)));
  const currentAmount = Math.max(0, Math.min(targetAmount, Number(stepRow?.current_amount || 0)));

  return {
    questId: questDefinition.id,
    questVersion: questDefinition.version,
    title: questDefinition.title,
    stepId: step.id,
    objective: step.objective,
    progress: targetAmount > 1 || currentAmount > 0
      ? { current: currentAmount, target: targetAmount }
      : null,
    target: serializeTarget(step.target),
  };
}

async function buildSnapshot(characterUuid) {
  const { quests, steps } = await repository.getSnapshotRows(characterUuid);
  const activeQuest = quests.find((row) => row.state === "active") || null;
  const newcomerRow = quests.find((row) => (
    row.quest_id === NEWCOMER_QUEST_ID &&
    Number(row.quest_version) === NEWCOMER_QUEST_VERSION
  ));

  return {
    version: CONTRACT_VERSION,
    revision: Math.max(0, Number(activeQuest?.revision || newcomerRow?.revision || 0)),
    active: activeQuest ? buildActiveState(activeQuest, steps) : null,
    available: [
      {
        questId: NEWCOMER_QUEST_ID,
        title: QUESTS[NEWCOMER_QUEST_ID].title,
        status: activeQuest?.quest_id === NEWCOMER_QUEST_ID
          ? "active"
          : newcomerRow?.state === "completed"
            ? "completed"
            : "available",
      },
    ],
  };
}

function patchHudTask(player, snapshot) {
  try {
    hud.update(player, buildQuestHudPatch(snapshot));
  } catch (error) {
    console.error("[QUESTS] HUD task update failed:", error?.message || error);
  }
}

function patchF2Payload(player, snapshot) {
  try {
    require("../f2menu/f2menu.cache.js").patch(player, { quests: snapshot }, { push: true });
  } catch {}
}

function isSameQuestSession(player, characterUuid, sessionEpoch) {
  return Boolean(
    player &&
    mp.players.exists(player) &&
    getCharacterUuid(player) === characterUuid &&
    Math.max(0, Math.trunc(Number(player.twinkleCharacterSessionEpoch || 0))) === sessionEpoch
  );
}

function getPreparedSnapshot(player, characterUuid, sessionEpoch) {
  const prepared = questPreparedSessions.get(player);
  if (
    prepared?.characterUuid !== characterUuid ||
    prepared?.sessionEpoch !== sessionEpoch
  ) return null;

  const snapshot = player?.twinkleQuestState;
  return (
    Number(snapshot?.characterUuid) === characterUuid &&
    Number(snapshot?.sessionEpoch) === sessionEpoch
  ) ? snapshot : null;
}

function applyPreparedSnapshot(player, snapshot, characterUuid, sessionEpoch) {
  if (!isSameQuestSession(player, characterUuid, sessionEpoch)) return null;

  const preparedSnapshot = {
    ...snapshot,
    characterUuid,
    sessionEpoch,
  };
  player.twinkleQuestState = preparedSnapshot;
  questPreparedSessions.set(player, { characterUuid, sessionEpoch });
  try { player.setVariable("starterQuest", Boolean(preparedSnapshot.active)); } catch {}
  return preparedSnapshot;
}

async function primePlayer(player, options = {}) {
  const characterUuid = getCharacterUuid(player);
  if (!characterUuid) return null;
  const sessionEpoch = Math.max(0, Math.trunc(Number(player?.twinkleCharacterSessionEpoch || 0)));
  const requireAuthoritative = options.requireAuthoritative === true;

  if (options.reusePrepared === true) {
    const prepared = getPreparedSnapshot(player, characterUuid, sessionEpoch);
    if (prepared) return prepared;
  }

  let operation = questPrimeOperations.get(player);
  if (
    operation?.characterUuid !== characterUuid ||
    operation?.sessionEpoch !== sessionEpoch
  ) {
    const promise = (async () => {
      await ensureSchemaReady();
      const snapshot = await buildSnapshot(characterUuid);
      return applyPreparedSnapshot(player, snapshot, characterUuid, sessionEpoch);
    })();

    operation = { characterUuid, sessionEpoch, promise };
    questPrimeOperations.set(player, operation);
  }

  try {
    return await operation.promise;
  } catch (error) {
    if (requireAuthoritative) throw error;
    if (error?.questReason !== "schema") console.error("[QUESTS] sync failed:", error);
    if (!isSameQuestSession(player, characterUuid, sessionEpoch)) return null;

    questPreparedSessions.delete(player);
    const fallbackSnapshot = {
      version: CONTRACT_VERSION,
      revision: 0,
      active: null,
      available: [],
      characterUuid,
      sessionEpoch,
    };
    player.twinkleQuestState = fallbackSnapshot;
    try { player.setVariable("starterQuest", false); } catch {}
    return fallbackSnapshot;
  } finally {
    if (questPrimeOperations.get(player)?.promise === operation.promise) {
      questPrimeOperations.delete(player);
    }
  }
}

async function syncPlayer(player, options = {}) {
  const snapshot = await primePlayer(player, options);
  if (!snapshot || !isPlayerInGame(player)) return null;

  safeCall(player, "c:quests:state", [JSON.stringify(snapshot)]);
  patchHudTask(player, snapshot);
  patchF2Payload(player, snapshot);
  return snapshot;
}

async function insertRewardLedgerStandalone(characterUuid, reward) {
  await repository.withTransaction(async (connection) => {
    await repository.insertRewardLedger(
      connection,
      characterUuid,
      NEWCOMER_QUEST_ID,
      NEWCOMER_QUEST_VERSION,
      reward
    );
  });
}

async function grantStarterPhone(player) {
  const characterUuid = getCharacterUuid(player);
  let staged = null;

  await inventory.runExclusiveOrThrow(player, "quest_starter_phone", async () => {
    await repository.withTransaction(async (connection) => {
      staged = await inventory.stageBoundItemInstance(
        connection,
        player,
        "starter_phone",
        {
          documentKey: "starter_phone",
          issuedAt: new Date().toISOString(),
          ownerStaticId: characterUuid,
        }
      );

      await repository.insertRewardLedger(
        connection,
        characterUuid,
        NEWCOMER_QUEST_ID,
        NEWCOMER_QUEST_VERSION,
        {
          key: "starter_phone",
          type: "item",
          amount: 1,
          payload: { itemId: "starter_phone", repaired: staged.added !== true },
        }
      );
    });
  });

  if (staged?.inventory) await inventory.syncInventorySnapshot(player, staged.inventory);
}

async function grantStarterDocuments(player) {
  const characterUuid = getCharacterUuid(player);
  let hasIdentity = false;

  try {
    hasIdentity = await documents.hasDocumentItem(player, "identity_card");
  } catch {}

  if (!hasIdentity) {
    try {
      await documents.issueIdentityCardQuestReward(player, { issuerName: "Мэрия Лос-Сантоса" });
    } catch (error) {
      if (!String(error?.message || "").includes("уже получена")) throw error;
    }
  }

  await insertRewardLedgerStandalone(characterUuid, {
    key: "identity_card",
    type: "item",
    amount: 1,
    payload: { itemId: "identity_card", repaired: !hasIdentity },
  });
}

async function grantStarterPack(player) {
  await grantStarterDocuments(player);
  await grantStarterPhone(player);
}

async function applyRewards(connection, quest, step) {
  const rewards = Array.isArray(step?.rewards) ? step.rewards : [];
  const grantedCashRewards = [];

  for (const reward of rewards) {
    if (reward.type !== "cash") continue;
    const amount = Math.max(0, Math.floor(Number(reward.amount || 0)));
    if (!amount) continue;

    const inserted = await repository.insertRewardLedger(
      connection,
      Number(quest.character_uuid),
      String(quest.quest_id),
      Number(quest.quest_version),
      {
        key: reward.key,
        type: "cash",
        amount,
        payload: {
          description: reward.description || reward.key,
        },
      }
    );

    if (!inserted) continue;

    grantedCashRewards.push({
      amount,
      description: String(reward.description || reward.key).slice(0, 160),
      key: String(reward.key).slice(0, 96),
    });
  }

  if (!grantedCashRewards.length) {
    return { cashAfter: null, cashBefore: null, cashDelta: 0, cashRewards: [] };
  }

  const [characterRows] = await connection.query(
    "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
    [Number(quest.character_uuid)]
  );
  if (!characterRows?.[0]) {
    const error = new Error("Quest reward character was not found.");
    error.questReason = "character";
    throw error;
  }

  const cashBefore = Math.max(0, Number(characterRows[0].cash || 0));
  let runningBalance = cashBefore;
  const cashRewards = grantedCashRewards.map((reward) => {
    const balanceBefore = runningBalance;
    runningBalance += reward.amount;
    return { ...reward, balanceBefore, balanceAfter: runningBalance };
  });
  const cashAfter = runningBalance;
  const cashDelta = cashAfter - cashBefore;

  await connection.query(
    "UPDATE characters SET cash = ? WHERE uuid = ?",
    [cashAfter, Number(quest.character_uuid)]
  );

  return { cashAfter, cashBefore, cashDelta, cashRewards };
}

async function applyQuestOutcome(player, characterUuid, result) {
  if (!result?.changed) return;

  if (result.cashDelta > 0) {
    let cashAfter = Number(result.cashAfter);
    if (!Number.isFinite(cashAfter)) {
      const cashRows = await db.query("SELECT cash FROM characters WHERE uuid = ? LIMIT 1", [characterUuid]);
      cashAfter = Math.max(0, Number(cashRows?.[0]?.cash || 0));
    }
    setPlayerCash(player, cashAfter);

    for (const reward of result.cashRewards || []) {
      logsDb.writeMoneyLog({
        source: "quest",
        action: "chapter_reward",
        currency: "cash",
        amount: Number(reward.amount || 0),
        balanceBefore: reward.balanceBefore,
        balanceAfter: reward.balanceAfter,
        target: player,
        targetUuid: characterUuid,
        comment: String(reward.description || "Награда за главу задания").slice(0, 255),
        metadata: {
          questId: result.questId || NEWCOMER_QUEST_ID,
          questVersion: result.questVersion || NEWCOMER_QUEST_VERSION,
          stepId: result.completedStepId || null,
          rewardKey: reward.key,
        },
      }).catch((error) => console.error("[QUESTS] Money log failed:", error));
    }
  }

  if (result.completedStepTitle) {
    const rewardText = result.cashDelta > 0 ? ` Награда: $${Number(result.cashDelta).toLocaleString("ru-RU")}.` : "";
    notify(player, "success", `Глава «${result.completedStepTitle}» завершена.${rewardText}`);
  }
  if (result.completionHint) notify(player, "info", result.completionHint);
  if (result.completed) notify(player, "success", "Дорожная карта новичка полностью пройдена.");
}

function matchesStepCondition(step, event, questProgress) {
  const condition = step?.condition;
  if (!condition || condition.type !== event.type) return false;
  if (condition.subjectId && String(condition.subjectId) !== String(event.subjectId || "")) return false;

  if (condition.requirePurchasedVehicle) {
    const expectedVehicleId = Number(questProgress.purchasedVehicleId || 0);
    const actualVehicleId = Number(event.metadata?.vehicleId || 0);
    if (!expectedVehicleId || actualVehicleId !== expectedVehicleId) return false;
  }

  return true;
}

async function advanceQuestInTransaction(connection, quest, event) {
  const questDefinition = getQuestDefinition(quest.quest_id);
  const currentStep = getStepDefinition(questDefinition, quest.current_step_id);
  if (!questDefinition || !currentStep || quest.state !== "active") {
    return { changed: false, cashDelta: 0 };
  }

  const questProgress = repository.parseJson(quest.progress_json, {});
  if (!matchesStepCondition(currentStep, event, questProgress)) {
    return { changed: false, cashDelta: 0 };
  }

  const accepted = await repository.insertProgressEvent(connection, quest, {
    ...event,
    accepted: true,
  });
  if (!accepted) return { changed: false, cashDelta: 0, duplicate: true };

  const stepRow = await repository.getStepForUpdate(connection, Number(quest.id), currentStep.id);
  const targetAmount = Math.max(1, Number(stepRow?.target_amount || getStepTargetAmount(currentStep)));
  const increment = currentStep.condition?.useAmount
    ? Math.max(1, Number(event.amount || 1))
    : 1;
  const currentAmount = Math.min(targetAmount, Math.max(0, Number(stepRow?.current_amount || 0)) + increment);
  const completed = currentAmount >= targetAmount;
  const stepProgress = {
    ...repository.parseJson(stepRow?.progress_json, {}),
    current: currentAmount,
    target: targetAmount,
    lastEvent: {
      type: event.type,
      subjectId: event.subjectId || null,
      amount: event.amount,
      at: new Date().toISOString(),
    },
  };

  if (event.type === "vehicle.purchased") {
    questProgress.purchasedVehicleId = Number(event.metadata?.vehicleId || 0);
  }

  if (!completed) {
    await repository.upsertStep(
      connection,
      quest,
      currentStep.id,
      "active",
      currentAmount,
      targetAmount,
      stepProgress
    );
    await repository.updateQuestProgress(
      connection,
      Number(quest.id),
      currentStep.id,
      "active",
      {
        ...questProgress,
        lastProgressAt: new Date().toISOString(),
      }
    );
    return { changed: true, cashDelta: 0 };
  }

  await repository.upsertStep(
    connection,
    quest,
    currentStep.id,
    "completed",
    targetAmount,
    targetAmount,
    stepProgress
  );

  const rewardResult = await applyRewards(connection, quest, currentStep);
  const currentIndex = getStepIndex(questDefinition, currentStep.id);
  const nextStep = questDefinition.steps[currentIndex + 1] || null;

  if (nextStep) {
    await repository.upsertStep(
      connection,
      quest,
      nextStep.id,
      "active",
      0,
      getStepTargetAmount(nextStep),
      { current: 0, target: getStepTargetAmount(nextStep) }
    );
  }

  await repository.updateQuestProgress(
    connection,
    Number(quest.id),
    nextStep?.id || null,
    nextStep ? "active" : "completed",
    {
      ...questProgress,
      completedSteps: [
        ...new Set([...(Array.isArray(questProgress.completedSteps) ? questProgress.completedSteps : []), currentStep.id]),
      ],
      lastProgressAt: new Date().toISOString(),
    }
  );

  return {
    changed: true,
    cashAfter: rewardResult.cashAfter,
    cashBefore: rewardResult.cashBefore,
    cashDelta: rewardResult.cashDelta,
    cashRewards: rewardResult.cashRewards,
    completed: !nextStep,
    completedStepId: currentStep.id,
    completedStepTitle: currentStep.title,
    completionHint: currentStep.completionHint || "",
    nextStepId: nextStep?.id || null,
    questId: questDefinition.id,
    questVersion: questDefinition.version,
  };
}

async function recordProgress(player, rawEvent, options = {}) {
  const characterUuid = getCharacterUuid(player);
  if (!characterUuid || !isPlayerInGame(player)) return null;

  try {
    const event = normalizeProgressEvent(rawEvent);
    await ensureSchemaReady();

    const result = await runCharacterQueue(characterUuid, () => repository.withTransaction(async (connection) => {
      const quest = await repository.getActiveQuestForUpdate(connection, characterUuid);
      if (!quest) return { changed: false, cashDelta: 0 };
      return advanceQuestInTransaction(connection, quest, event);
    }));

    await applyQuestOutcome(player, characterUuid, result);
    if (result?.changed || options.sync !== false) await syncPlayer(player);
    return result;
  } catch (error) {
    if (options.throwOnError) throw error;
    console.error("[QUESTS] progress failed:", error?.message || error);
    return null;
  }
}

async function startNewcomerChain(player, context = {}) {
  const characterUuid = getCharacterUuid(player);
  if (!characterUuid || !isPlayerInGame(player)) {
    notify(player, "error", "Персонаж не загружен.");
    return false;
  }

  try {
    await ensureSchemaReady();

    const startResult = await runCharacterQueue(characterUuid, () => repository.withTransaction(async (connection) => {
      let quest = await repository.getQuestForUpdate(
        connection,
        characterUuid,
        NEWCOMER_QUEST_ID,
        NEWCOMER_QUEST_VERSION
      );

      if (quest?.state === "completed") {
        return { alreadyCompleted: true };
      }

      const starterProgress = {
        startedByNpc: context.npcId || null,
        completedSteps: ["spawn_selected", "helper_intro"],
        firstStartedAt: new Date().toISOString(),
      };

      let shouldInitializeSteps = false;
      let shouldGrantStarterPack = false;
      let resumed = false;

      if (!quest) {
        const questId = await repository.insertQuest(
          connection,
          characterUuid,
          NEWCOMER_QUEST_ID,
          NEWCOMER_QUEST_VERSION,
          "starter_documents",
          starterProgress
        );
        quest = {
          id: questId,
          character_uuid: characterUuid,
          quest_id: NEWCOMER_QUEST_ID,
          quest_version: NEWCOMER_QUEST_VERSION,
        };
        shouldInitializeSteps = true;
        shouldGrantStarterPack = true;
      } else if (quest.state !== "active") {
        const existingProgress = repository.parseJson(quest.progress_json, {});
        const resumeStepId = quest.current_step_id ||
          getFirstIncompleteStepId(QUESTS[NEWCOMER_QUEST_ID], existingProgress) ||
          "starter_documents";

        await repository.reactivateQuest(connection, characterUuid, Number(quest.id), resumeStepId, {
          ...existingProgress,
          lastStartedByNpc: context.npcId || null,
          resumedAt: new Date().toISOString(),
        });
        quest.current_step_id = resumeStepId;
        resumed = true;
        shouldInitializeSteps = resumeStepId === "starter_documents" &&
          !Array.isArray(existingProgress.completedSteps);
        shouldGrantStarterPack = resumeStepId === "starter_documents" &&
          !(Array.isArray(existingProgress.completedSteps) && existingProgress.completedSteps.includes("starter_documents"));
      }

      if (shouldInitializeSteps) {
        await repository.upsertStep(connection, quest, "spawn_selected", "completed", 1, 1, {
          source: context.spawnType || "unknown",
        });
        await repository.upsertStep(connection, quest, "helper_intro", "completed", 1, 1, {
          npcId: context.npcId || "guide_airport",
          actionId: context.actionId || "startQuest",
        });
        await repository.upsertStep(connection, quest, "starter_documents", "active", 0, 1, {
          current: 0,
          target: 1,
        });
      }

      return { alreadyCompleted: false, resumed, shouldGrantStarterPack };
    }));

    if (startResult?.alreadyCompleted) {
      await syncPlayer(player);
      notify(player, "info", "Дорожная карта новичка уже полностью пройдена.");
      return true;
    }

    if (startResult?.shouldGrantStarterPack) {
      await grantStarterPack(player);
      await recordProgress(player, {
        type: "inventory.item_received",
        subjectId: "starter_pack",
        idempotencyKey: `starter_pack:${characterUuid}:${NEWCOMER_QUEST_VERSION}`,
        amount: 1,
        metadata: {
          npcId: context.npcId || "guide_airport",
        },
      }, { throwOnError: true });
    } else {
      await syncPlayer(player);
    }

    notify(
      player,
      "success",
      startResult?.resumed
        ? "Дорожная карта новичка продолжена. Текущая цель показана в HUD, подробности — в F2 → Задания."
        : "Дорожная карта новичка начата. Текущая цель показана в HUD, подробности — в F2 → Задания."
    );
    return true;
  } catch (error) {
    console.error("[QUESTS] start newcomer failed:", error);
    notify(
      player,
      "error",
      error?.questReason === "schema"
        ? "Хранилище заданий ещё не подготовлено."
        : "Не удалось начать дорожную карту новичка."
    );
    return false;
  }
}

async function cancelNewcomerQuest(player) {
  const characterUuid = getCharacterUuid(player);
  if (!characterUuid || !isPlayerInGame(player)) return false;

  try {
    await ensureSchemaReady();
    await runCharacterQueue(characterUuid, () => repository.withTransaction(async (connection) => {
      const quest = await repository.getQuestForUpdate(
        connection,
        characterUuid,
        NEWCOMER_QUEST_ID,
        NEWCOMER_QUEST_VERSION
      );
      if (quest?.state === "active") await repository.cancelQuest(connection, Number(quest.id));
    }));
    await syncPlayer(player);
    notify(player, "success", "Дорожная карта новичка приостановлена. Продолжить её можно у Jung Lee.");
    return true;
  } catch (error) {
    console.error("[QUESTS] cancel failed:", error);
    notify(player, "error", "Не удалось приостановить дорожную карту.");
    return false;
  }
}

function hasActiveQuestCached(player) {
  return Boolean(player?.twinkleQuestState?.active);
}

async function markPlayerReady(player, context = {}) {
  const characterUuid = getCharacterUuid(player);
  if (!characterUuid || !isPlayerInGame(player)) return null;

  await syncPlayer(player, { reusePrepared: true });
  return recordProgress(player, {
    type: "location.entered",
    subjectId: "starter_spawn",
    idempotencyKey: `spawn:${characterUuid}:${String(context.spawnType || "unknown")}`,
    amount: 1,
    metadata: {
      spawnType: context.spawnType || null,
    },
  }, { sync: false });
}

async function purchaseStarterVehicle(player, vehicleIdRaw) {
  const characterUuid = getCharacterUuid(player);
  const selectedVehicle = STARTER_VEHICLE_DEALERSHIP.vehicles.find((entry) => entry.id === String(vehicleIdRaw || ""));
  if (!characterUuid || !isPlayerInGame(player) || !selectedVehicle) {
    notify(player, "error", "Стартовый автомобиль недоступен.");
    return false;
  }

  if (!isNearPoint(player, STARTER_VEHICLE_DEALERSHIP.spawn, STARTER_VEHICLE_DEALERSHIP.range) &&
      !isNearPoint(player, QUESTS[NEWCOMER_QUEST_ID].steps.find((step) => step.id === "buy_budget_vehicle")?.target, STARTER_VEHICLE_DEALERSHIP.range)) {
    notify(player, "error", "Подойдите ближе к стартовому автодилеру.");
    return false;
  }

  let vehicleRow = null;
  let remainingCash = 0;
  let progressResult = null;

  try {
    await ensureSchemaReady();
    await runCharacterQueue(characterUuid, () => repository.withTransaction(async (connection) => {
      const quest = await repository.getActiveQuestForUpdate(connection, characterUuid);
      if (!quest || quest.current_step_id !== "buy_budget_vehicle") {
        throw Object.assign(new Error("Quest step is not ready for starter vehicle purchase."), { questReason: "step" });
      }

      const [characters] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const character = characters?.[0];
      if (!character) throw Object.assign(new Error("Character was not found."), { questReason: "character" });

      const cash = Math.max(0, Number(character.cash || 0));
      const price = Math.max(1, Number(selectedVehicle.price || 0));
      if (cash < price) throw Object.assign(new Error("Not enough cash for starter vehicle."), { questReason: "cash" });

      remainingCash = cash - price;
      const plate = `TW${String(characterUuid).slice(-4)}${String(Date.now() % 100).padStart(2, "0")}`.slice(0, 8);
      const spawn = STARTER_VEHICLE_DEALERSHIP.spawn;

      const [insert] = await connection.query(
        `INSERT INTO vehicles
          (owner, model, pos_x, pos_y, pos_z, heading, dimension, fuel, mileage, locked, engine, health, plate, color1, color2, garage_status, garage_id, garage_slot, purchase_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, 60, 0, 0, 0, 1000, ?, ?, ?, 'outside', NULL, NULL, 'starter_dealership')`,
        [
          characterUuid,
          selectedVehicle.model,
          Number(spawn.position.x || 0),
          Number(spawn.position.y || 0),
          Number(spawn.position.z || 0),
          Number(spawn.heading || 0),
          Number(spawn.dimension || 0),
          plate,
          Number(selectedVehicle.color || 0),
          Number(selectedVehicle.color || 0),
        ]
      );

      const vehicleId = Number(insert?.insertId || 0);
      if (!vehicleId) throw Object.assign(new Error("Vehicle insert failed."), { questReason: "vehicle" });

      await connection.query("UPDATE characters SET cash = ? WHERE uuid = ?", [remainingCash, characterUuid]);
      vehicleRow = {
        id: vehicleId,
        owner: characterUuid,
        model: selectedVehicle.model,
        display_name: selectedVehicle.name,
        fuel: 60,
        mileage: 0,
        locked: 0,
        engine: 0,
        health: 1000,
        plate,
        color1: Number(selectedVehicle.color || 0),
        color2: Number(selectedVehicle.color || 0),
      };

      progressResult = await advanceQuestInTransaction(connection, quest, {
        type: "vehicle.purchased",
        subjectId: "starter_dealership",
        idempotencyKey: `vehicle_purchased:${vehicleId}`,
        amount: 1,
        metadata: {
          vehicleId,
          vehicleModel: selectedVehicle.model,
          price,
        },
      });
    }));

    if (vehicleRow) {
      try {
        vehicleCommands.createVehicleEntity(
          vehicleRow,
          toVector3(STARTER_VEHICLE_DEALERSHIP.spawn.position),
          STARTER_VEHICLE_DEALERSHIP.spawn.heading,
          STARTER_VEHICLE_DEALERSHIP.spawn.dimension
        );
      } catch (spawnError) {
        console.error("[QUESTS] starter vehicle spawn failed:", spawnError);
        notify(player, "error", "Автомобиль куплен и сохранён, но его не удалось создать в мире. Обратитесь к администратору.");
      }
    }

    if (progressResult?.cashDelta > 0) await applyQuestOutcome(player, characterUuid, progressResult);
    else setPlayerCash(player, remainingCash);
    await syncPlayer(player);
    notify(player, "success", `Автомобиль «${selectedVehicle.name}» куплен. Припаркуйте его в стартовом гараже.`);
    return Boolean(progressResult?.changed);
  } catch (error) {
    console.error("[QUESTS] starter vehicle purchase failed:", error);
    notify(player, "error", error?.questReason === "cash" ? "Недостаточно наличных." : "Не удалось купить стартовый автомобиль.");
    return false;
  }
}

function getRuntimeVehicleId(vehicle) {
  return Number(
    vehicle?.getVariable?.("vehicleDbId") ||
    vehicle?.getVariable?.("vehicleId") ||
    vehicle?.vehicleId ||
    vehicle?.vehicle_id ||
    vehicle?.sqlId ||
    vehicle?.dbId ||
    0
  );
}

async function storeStarterVehicle(player) {
  const characterUuid = getCharacterUuid(player);
  const vehicle = player?.vehicle;
  const vehicleId = getRuntimeVehicleId(vehicle);

  if (!characterUuid || !isPlayerInGame(player) || !vehicle || !vehicleId) {
    notify(player, "error", "Сначала сядьте в свой стартовый автомобиль.");
    return false;
  }

  try {
    if (!mp.vehicles.exists(vehicle)) {
      notify(player, "error", "Автомобиль больше недоступен.");
      return false;
    }
  } catch {}

  if (Number(player.seat) !== 0 && Number(player.seat) !== -1) {
    notify(player, "error", "Поставить автомобиль в гараж может только водитель.");
    return false;
  }

  const garageStep = QUESTS[NEWCOMER_QUEST_ID].steps.find((step) => step.id === "park_budget_vehicle");
  if (!isNearPoint(player, garageStep?.target, STARTER_VEHICLE_DEALERSHIP.range)) {
    notify(player, "error", "Подъедьте ближе к стартовому гаражу.");
    return false;
  }

  try {
    await ensureSchemaReady();
    let progressResult = null;
    await runCharacterQueue(characterUuid, () => repository.withTransaction(async (connection) => {
      const quest = await repository.getActiveQuestForUpdate(connection, characterUuid);
      if (!quest || quest.current_step_id !== "park_budget_vehicle") {
        throw Object.assign(new Error("Quest step is not ready for garage storage."), { questReason: "step" });
      }

      const questProgress = repository.parseJson(quest.progress_json, {});
      if (Number(questProgress.purchasedVehicleId || 0) !== vehicleId) {
        throw Object.assign(new Error("This is not the starter vehicle from the roadmap."), { questReason: "vehicle" });
      }

      await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );

      const [vehicles] = await connection.query(
        "SELECT id, owner, purchase_source FROM vehicles WHERE id = ? LIMIT 1 FOR UPDATE",
        [vehicleId]
      );
      const vehicleRow = vehicles?.[0];
      if (!vehicleRow || Number(vehicleRow.owner || 0) !== characterUuid) {
        throw Object.assign(new Error("Vehicle ownership changed."), { questReason: "vehicle" });
      }

      const [slots] = await connection.query(
        `SELECT id, vehicle_id
           FROM character_vehicle_garage_slots
          WHERE character_uuid = ?
            AND garage_id = ?
            AND slot_index = 1
          LIMIT 1
          FOR UPDATE`,
        [characterUuid, STARTER_VEHICLE_DEALERSHIP.garageId]
      );
      const occupiedSlot = slots?.[0] || null;
      if (occupiedSlot && Number(occupiedSlot.vehicle_id || 0) !== vehicleId) {
        throw Object.assign(new Error("Starter garage slot is already occupied."), { questReason: "garage" });
      }

      if (!occupiedSlot) {
        await connection.query(
          `INSERT INTO character_vehicle_garage_slots
            (character_uuid, garage_id, slot_index, vehicle_id, status)
           VALUES (?, ?, 1, ?, 'stored')`,
          [characterUuid, STARTER_VEHICLE_DEALERSHIP.garageId, vehicleId]
        );
      } else {
        await connection.query(
          "UPDATE character_vehicle_garage_slots SET status = 'stored', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [occupiedSlot.id]
        );
      }

      const target = garageStep.target.position;
      await connection.query(
        `UPDATE vehicles
            SET garage_status = 'stored',
                garage_id = ?,
                garage_slot = 1,
                pos_x = ?,
                pos_y = ?,
                pos_z = ?,
                heading = 0,
                dimension = 0,
                engine = 0
          WHERE id = ?`,
        [
          STARTER_VEHICLE_DEALERSHIP.garageId,
          Number(target.x || 0),
          Number(target.y || 0),
          Number(target.z || 0),
          vehicleId,
        ]
      );

      progressResult = await advanceQuestInTransaction(connection, quest, {
        type: "vehicle.parked",
        subjectId: STARTER_VEHICLE_DEALERSHIP.garageId,
        idempotencyKey: `vehicle_parked:${vehicleId}:${STARTER_VEHICLE_DEALERSHIP.garageId}`,
        amount: 1,
        metadata: { vehicleId },
      });
    }));

    vehicleCommands.destroySpawnedVehicle(vehicleId);
    await applyQuestOutcome(player, characterUuid, progressResult);
    await syncPlayer(player);
    notify(player, "success", "Автомобиль сохранён в гараже. Дорожная карта новичка завершена.");
    return true;
  } catch (error) {
    console.error("[QUESTS] starter vehicle storage failed:", error);
    const messages = {
      garage: "Слот стартового гаража уже занят.",
      step: "На текущем этапе дорожной карты парковка в гараже не требуется.",
      vehicle: "Этот автомобиль не подходит для завершения этапа с гаражом.",
    };
    notify(player, "error", messages[error?.questReason] || "Не удалось сохранить стартовый автомобиль в гараже.");
    return false;
  }
}

async function buildDiagnostics(player) {
  const characterUuid = getCharacterUuid(player);
  if (!characterUuid) return { ok: false, reason: "character" };
  const schema = await repository.validateSchema().catch((error) => ({
    ok: false,
    error: error?.message || String(error),
  }));
  const snapshot = schema.ok ? await buildSnapshot(characterUuid) : null;
  return {
    ok: Boolean(schema.ok),
    characterUuid,
    schema,
    snapshot,
  };
}

function clearPlayer(player) {
  const characterUuid = getCharacterUuid(player);
  if (characterUuid) questQueues.delete(String(characterUuid));
  if (player) {
    questPreparedSessions.delete(player);
    questPrimeOperations.delete(player);
    player.twinkleQuestState = null;
  }
}

module.exports = {
  EVENT_TYPES,
  advanceQuestInTransaction,
  buildDiagnostics,
  buildSnapshot,
  cancelNewcomerQuest,
  clearPlayer,
  getCharacterUuid,
  hasActiveQuestCached,
  isPlayerInGame,
  markPlayerReady,
  primePlayer,
  purchaseStarterVehicle,
  recordProgress,
  startNewcomerChain,
  storeStarterVehicle,
  syncPlayer,
};
