"use strict";

const AUTH_CONFIG = require("../auth/auth.config.js");
const authFlow = require("../auth/authFlow.js");

const {
  getAccountCharacterSlots,
  getCharactersByIds,
  getCharacterByUuid,
  getActiveCharacterBan,
  getActiveAccountHardban,
  createCharacterInSlot,
  getHouseByOwner,
  getApartmentByOwner,
  getAccountDonate,
  isAccountWhitelisted,
  query,
} = require("../database/query.js");

const { applyCharacterAppearance } = require("./appearance.js");
const { adminJoin } = require("../systems/discord/discordBridge.js");
const logsDb = require("../database/logs.js");
const spawnService = require("./spawn.service.js");
const adminClothes = require("../systems/admin/admin.clothes.js");
const inventory = require("../systems/inventory/inventory.service.js");
const hud = require("../systems/hud/hud.service.js");
const hudNeeds = require("../systems/hud/hudNeeds.service.js");
const onlineStats = require("../systems/hud/onlineStats.service.js");
const quests = require("../systems/quests/quest.service.js");
const f2Catalog = require("../systems/f2menu/f2menu.catalog.js");
const f2PayloadCache = require("../systems/f2menu/f2menu.cache.js");
const jobEmployment = require("../systems/jobs/jobEmployment.service.js");

const CREATOR_DIMENSION_BASE = 1000;
const SPAWN_SELECTOR_DIMENSION_BASE = 2000;
const CHARACTER_SELECTION_UI_STAGES = new Set([
  "client-event",
  "invalid-payload",
  "cef-page-set",
  "cef-mounted",
  "retry-1",
  "retry-2",
  "cef-reload",
  "reload-error",
  "mount-timeout",
]);
const CHARACTER_SELECTION_REQUEST_COOLDOWN_MS = 1500;
const CHARACTER_SELECTION_PAYLOAD_BUDGET_BYTES = 6000;
const SPAWN_PREVIEW_COOLDOWN_MS = 120;
const SPAWN_SELECTOR_UI_STAGES = new Set([
  "client-event",
  "invalid-payload",
  "cef-page-set",
  "cef-mounted",
  "retry-1",
  "retry-2",
  "cef-reload",
  "reload-error",
  "mount-timeout",
]);
const characterSelectionUiTrace = new WeakMap();
const characterSelectionRequests = new WeakMap();
const spawnSelectorUiTrace = new WeakMap();
const spawnPreviewSessions = new WeakMap();

const FIRST_SPAWN = {
  position: new mp.Vector3(-1037.75, -2737.62, 20.17),
  heading: 327.0,
  dimension: 0,
};

function getPrivateDimension(player, base) {
  return Number(base) + Number(player?.id || 0);
}

function safeJson(value, fallback = null) {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeParsePayload(payloadJson) {
  try {
    if (!payloadJson) return null;
    if (typeof payloadJson === "object") return payloadJson;
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

function safeCall(player, eventName, args = []) {
  try {
    if (player && mp.players.exists(player)) {
      player.call(eventName, args);
    }
  } catch (err) {
    console.error(`[SAFE CALL ERROR] ${eventName}:`, err.message);
  }
}

function emitQuestPlayerReady(player, spawn = null) {
  try {
    if (!player || !mp.players.exists(player)) return;
    mp.events.call("quests:playerReady", player, {
      spawnType: spawn?.type || "direct",
    });
  } catch (error) {
    console.error("[QUEST READY ERROR]", error?.message || error);
  }
}

async function syncInitialHud(player) {
  const characterUuid = Number(player?.character?.uuid || 0);
  const sessionEpoch = Number(player?.twinkleCharacterSessionEpoch || 0);
  if (!characterUuid || !sessionEpoch) return false;

  const [questSnapshot, rewardPatch] = await Promise.all([
    quests.primePlayer(player, {
      requireAuthoritative: true,
      reusePrepared: true,
    }),
    onlineStats.getHudBonusPayload(characterUuid),
  ]);

  if (!questSnapshot || !rewardPatch?.tasks) {
    throw new Error("Authoritative initial HUD tasks were unavailable.");
  }

  if (
    !player ||
    !mp.players.exists(player) ||
    Number(player.character?.uuid || 0) !== characterUuid ||
    Number(player.twinkleCharacterSessionEpoch || 0) !== sessionEpoch
  ) {
    return false;
  }

  hud.sync(player, rewardPatch);
  return true;
}

function setClientPlayerState(player, state) {
  safeCall(player, "setPlayerState", [Boolean(state)]);
}

function setHudEnabled(player, enabled) {
  const value = Boolean(enabled);
  player.hudEnabled = value;

  try {
    player.setVariable("hudEnabled", value);
  } catch {}
}

function restorePhaseIfCurrent(player, currentPhase, fallbackPhase) {
  if (player && authFlow.isPhase(player, currentPhase)) {
    authFlow.setPhase(player, fallbackPhase);
  }
}

function recoverSpawnCompletion(player, character, error, context) {
  console.error(`[${context}]`, error);

  if (!player || !mp.players.exists(player)) return;
  if (Number(player.character?.uuid || 0) !== Number(character?.uuid || 0)) return;

  setHudEnabled(player, false);
  safeCall(player, "c:hud:gameplayReady", [false]);
  safeCall(player, "c:spawn:error", [
    "Не удалось завершить загрузку персонажа. Выберите место появления повторно.",
  ]);

  restorePhaseIfCurrent(
    player,
    authFlow.PHASE.SPAWNING,
    authFlow.PHASE.SPAWN_SELECTION
  );

  if (authFlow.isPhase(player, authFlow.PHASE.SPAWN_SELECTION)) {
    openSpawnSelectorForPlayer(player, character);
  }
}

function nextCharacterSelectionUiRevision(player) {
  const current = Number(player?.__characterSelectionUiRevision || 0);
  const next = Number.isSafeInteger(current) && current < Number.MAX_SAFE_INTEGER
    ? current + 1
    : 1;

  player.__characterSelectionUiRevision = next;
  characterSelectionUiTrace.set(player, {
    revision: next,
    stages: new Set(),
  });

  return next;
}

function logCharacterSelectionUiStage(player, stage, revision) {
  if (!player || !mp.players.exists(player)) return;
  if (!player.auth || !player.accountId || player.character) return;
  if (!authFlow.isPhase(player, authFlow.PHASE.CHARACTER_SELECTION)) return;

  stage = String(stage || "").trim();
  revision = Number(revision);

  if (!CHARACTER_SELECTION_UI_STAGES.has(stage)) return;
  if (!Number.isSafeInteger(revision) || revision < 1) return;
  if (revision !== Number(player.__characterSelectionUiRevision || 0)) return;

  const trace = characterSelectionUiTrace.get(player);

  if (!trace || trace.revision !== revision || trace.stages.has(stage)) return;

  trace.stages.add(stage);
  console.log(
    `[CHARACTER SELECTION UI] player=#${player.id} account=${player.accountId} revision=${revision} stage=${stage}`
  );
}

function nextSpawnSelectorUiRevision(player) {
  const current = Number(player?.__spawnSelectorUiRevision || 0);
  const next = Number.isSafeInteger(current) && current < Number.MAX_SAFE_INTEGER
    ? current + 1
    : 1;

  player.__spawnSelectorUiRevision = next;
  spawnSelectorUiTrace.set(player, {
    revision: next,
    stages: new Set(),
  });

  return next;
}

function logSpawnSelectorUiStage(player, stage, revision) {
  if (!player || !mp.players.exists(player)) return;
  if (!player.auth || !player.accountId || !player.character) return;
  if (!authFlow.isPhase(player, authFlow.PHASE.SPAWN_SELECTION)) return;

  stage = String(stage || "").trim();
  revision = Number(revision);

  if (!SPAWN_SELECTOR_UI_STAGES.has(stage)) return;
  if (!Number.isSafeInteger(revision) || revision < 1) return;
  if (revision !== Number(player.__spawnSelectorUiRevision || 0)) return;

  const trace = spawnSelectorUiTrace.get(player);

  if (!trace || trace.revision !== revision || trace.stages.has(stage)) return;

  trace.stages.add(stage);
  console.log(
    `[SPAWN SELECTOR UI] player=#${player.id} character=${Number(player.character.uuid)} revision=${revision} stage=${stage}`
  );
}

function beginCharacterSelectionRequest(player) {
  const now = Date.now();
  const state = characterSelectionRequests.get(player) || {
    inFlight: false,
    lastCompletedAt: 0,
  };

  if (
    state.inFlight ||
    now - state.lastCompletedAt < CHARACTER_SELECTION_REQUEST_COOLDOWN_MS
  ) return null;

  state.inFlight = true;
  characterSelectionRequests.set(player, state);
  return state;
}

function completeCharacterSelectionRequest(state) {
  if (!state) return;

  state.inFlight = false;
  state.lastCompletedAt = Date.now();
}

function isCharacterSelectionRequestCurrent(player, accountId) {
  return Boolean(
    player &&
    mp.players.exists(player) &&
    player.auth &&
    Number(player.accountId || 0) === Number(accountId || 0) &&
    !player.character &&
    authFlow.isPhase(player, authFlow.PHASE.CHARACTER_SELECTION)
  );
}

function isSpawnSelectorRequestCurrent(player, characterUuid) {
  return Boolean(
    player &&
    mp.players.exists(player) &&
    player.auth &&
    player.character &&
    Number(player.character.uuid || 0) === Number(characterUuid || 0) &&
    authFlow.isPhase(player, authFlow.PHASE.SPAWN_SELECTION)
  );
}

function clearSpawnPreviewSession(player) {
  const session = spawnPreviewSessions.get(player);
  if (session?.timer) clearTimeout(session.timer);
  spawnPreviewSessions.delete(player);
}

function createSpawnPreviewSession(player, characterUuid, payload) {
  clearSpawnPreviewSession(player);

  const options = new Map();
  for (const option of Array.isArray(payload?.options) ? payload.options : []) {
    const type = String(option?.type || "").trim();
    if (!type || type.length > 64 || options.has(type)) continue;

    const position = spawnService.normalizePosition({
      ...option.position,
      heading: option.heading,
      dimension: option.dimension,
    });

    options.set(type, {
      type,
      title: String(option?.title || type).slice(0, 96),
      position,
      heading: position.heading,
      dimension: position.dimension,
    });
  }

  const session = {
    characterUuid: Number(characterUuid || 0),
    uiRevision: Number(payload?.uiRevision || 0),
    dimension: getPrivateDimension(player, SPAWN_SELECTOR_DIMENSION_BASE),
    options,
    lastRequestId: 0,
    lastAppliedAt: 0,
    pending: null,
    timer: null,
  };

  spawnPreviewSessions.set(player, session);
  return session;
}

function applySpawnPreview(player, session, request, notifyClient = true) {
  if (
    !session ||
    spawnPreviewSessions.get(player) !== session ||
    !isSpawnSelectorRequestCurrent(player, session.characterUuid) ||
    Number(player.__spawnSelectorUiRevision || 0) !== session.uiRevision
  ) {
    return false;
  }

  const option = session.options.get(String(request?.type || ""));
  if (!option) return false;

  try {
    // Keep the player isolated and invisible, but move the real server entity
    // to the selected area so map assets stream before the camera fades in.
    player.dimension = session.dimension;
    player.position = new mp.Vector3(
      option.position.x,
      option.position.y,
      option.position.z
    );
    player.heading = option.heading;
    setClientPlayerState(player, true);
  } catch (error) {
    console.error("[SPAWN PREVIEW] Teleport failed:", error);
    return false;
  }

  if (notifyClient) {
    safeCall(player, "c:spawn:previewReady", [JSON.stringify({
      contractVersion: spawnService.SPAWN_CONTRACT_VERSION,
      uiRevision: session.uiRevision,
      requestId: Number(request.requestId),
      type: option.type,
    })]);
  }

  return true;
}

function scheduleSpawnPreview(player, session, request) {
  session.pending = request;

  const runLatest = () => {
    session.timer = null;
    const latest = session.pending;
    session.pending = null;
    if (!latest) return;

    session.lastAppliedAt = Date.now();
    applySpawnPreview(player, session, latest, true);
  };

  const remaining = Math.max(
    0,
    SPAWN_PREVIEW_COOLDOWN_MS - (Date.now() - session.lastAppliedAt)
  );

  if (remaining === 0) {
    if (session.timer) clearTimeout(session.timer);
    runLatest();
    return;
  }

  if (!session.timer) {
    session.timer = setTimeout(runLatest, remaining);
  }
}

function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("ru-RU");
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString("ru-RU")}`;
}

function asRecord(value) {
  const parsed = safeJson(value, {});

  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : {};
}

function boundedText(value, fallback = "", maxLength = 32) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback)).slice(0, maxLength);
}

function boundedNumber(value, min, max, fallback = min, integer = false) {
  const parsed = Number(value);
  const finite = Number.isFinite(parsed) ? parsed : fallback;
  const bounded = Math.max(min, Math.min(max, finite));
  return integer ? Math.trunc(bounded) : bounded;
}

function buildPreviewCustomization(rawCustomization) {
  const customization = asRecord(rawCustomization);
  const blend = asRecord(
    customization.blend || customization.headBlend || customization.face
  );
  const face = asRecord(customization.faceFeatures || customization.face);

  return {
    face: {
      mother: boundedNumber(blend.mother ?? blend.shapeFirst, 0, 45, 0, true),
      father: boundedNumber(blend.father ?? blend.shapeSecond, 0, 45, 0, true),
      shapeThird: boundedNumber(blend.shapeThird, 0, 45, 0, true),
      skinMother: boundedNumber(blend.skinMother ?? blend.skinFirst, 0, 45, 0, true),
      skinFather: boundedNumber(blend.skinFather ?? blend.skinSecond, 0, 45, 0, true),
      skinThird: boundedNumber(blend.skinThird, 0, 45, 0, true),
      shapeMix: boundedNumber(blend.shapeMix, 0, 1, 0.5),
      skinMix: boundedNumber(blend.skinMix, 0, 1, 0.5),
      thirdMix: boundedNumber(blend.thirdMix, 0, 1, 0),
    },
    features: {
      10: boundedNumber(face.face_shape_x ?? face[10], -1, 1, 0),
      11: boundedNumber(face.eyes_open ?? face[11], -1, 1, 0),
      15: boundedNumber(face.face_shape_y ?? face[15], -1, 1, 0),
    },
  };
}

function buildPreviewAppearance(rawAppearance, rawCustomization) {
  const appearance = asRecord(rawAppearance);
  const customization = asRecord(rawCustomization);
  const hair = asRecord(customization.hair);
  const rawOverlays = Array.isArray(appearance.overlays)
    ? appearance.overlays
    : Array.isArray(appearance.headOverlays)
      ? appearance.headOverlays
      : [];
  const headOverlays = Array(13).fill(null);

  rawOverlays.slice(0, 13).forEach((rawOverlay, arrayIndex) => {
    if (!rawOverlay || typeof rawOverlay !== "object") return;

    const overlayIndex = boundedNumber(
      rawOverlay.index ?? rawOverlay.id ?? arrayIndex,
      0,
      12,
      arrayIndex,
      true
    );

    headOverlays[overlayIndex] = {
      value: boundedNumber(rawOverlay.value, 0, 255, 255, true),
      opacity: boundedNumber(rawOverlay.opacity, 0, 1, 1),
      colorType: boundedNumber(rawOverlay.colorType, 0, 2, 1, true),
      color: boundedNumber(rawOverlay.color1 ?? rawOverlay.color, 0, 63, 0, true),
      secondColor: boundedNumber(rawOverlay.color2 ?? rawOverlay.secondColor, 0, 63, 0, true),
    };
  });

  return {
    eyeColor: boundedNumber(appearance.eyeColor, 0, 31, 0, true),
    hairColor: boundedNumber(appearance.hairColor ?? hair.color1, 0, 63, 0, true),
    hairHighlightColor: boundedNumber(
      appearance.hairHighlightColor ?? hair.color2,
      0,
      63,
      0,
      true
    ),
    headOverlays,
  };
}

function buildPreviewClothes(rawClothes) {
  const clothes = asRecord(rawClothes);
  const rawComponents = asRecord(clothes.components || clothes);
  const rawProps = asRecord(clothes.props || clothes.accessories);
  const components = {};
  const props = {};

  for (let componentKey = 0; componentKey <= 11; componentKey += 1) {
    const rawItem = rawComponents[componentKey];
    if (!rawItem || typeof rawItem !== "object") continue;

    const componentId = boundedNumber(
      rawItem.component ?? rawItem.componentId ?? componentKey,
      0,
      11,
      0,
      true
    );

    components[componentId] = {
      drawable: boundedNumber(
        rawItem.drawable ?? rawItem.drawableId ?? rawItem.id,
        0,
        600,
        0,
        true
      ),
      texture: boundedNumber(rawItem.texture ?? rawItem.textureId, 0, 100, 0, true),
      palette: boundedNumber(rawItem.palette, 0, 3, 0, true),
    };
  }

  for (let propKey = 0; propKey <= 7; propKey += 1) {
    const rawItem = rawProps[propKey];
    if (!rawItem || typeof rawItem !== "object") continue;

    const propId = boundedNumber(
      rawItem.prop ?? rawItem.propId ?? propKey,
      0,
      7,
      0,
      true
    );

    props[propId] = {
      drawable: boundedNumber(
        rawItem.drawable ?? rawItem.drawableId ?? rawItem.id,
        -1,
        600,
        -1,
        true
      ),
      texture: boundedNumber(rawItem.texture ?? rawItem.textureId, 0, 100, 0, true),
    };
  }

  return { components, props };
}

function serializeCharacterSelectionPayload(payload) {
  let serialized = JSON.stringify(payload);
  let bytes = Buffer.byteLength(serialized, "utf8");

  if (bytes <= CHARACTER_SELECTION_PAYLOAD_BUDGET_BYTES) {
    return { serialized, bytes, compaction: "none" };
  }

  const compactPayload = {
    ...payload,
    slots: payload.slots.map((slot) => {
      if (!slot?.character) return slot;

      return {
        ...slot,
        character: {
          ...slot.character,
          customization: null,
          clothes: null,
          appearance: null,
        },
      };
    }),
  };

  serialized = JSON.stringify(compactPayload);
  bytes = Buffer.byteLength(serialized, "utf8");

  if (bytes <= CHARACTER_SELECTION_PAYLOAD_BUDGET_BYTES) {
    return { serialized, bytes, compaction: "cosmetics" };
  }

  const minimalPayload = {
    selectedSlotId: boundedNumber(payload.selectedSlotId, 1, 3, 1, true),
    uiRevision: boundedNumber(payload.uiRevision, 1, Number.MAX_SAFE_INTEGER, 1, true),
    slots: payload.slots.slice(0, 3).map((slot, index) => {
      const id = boundedNumber(slot?.id, 1, 3, index + 1, true);
      const state = ["empty", "locked", "notPurchased", "character"].includes(slot?.state)
        ? slot.state
        : "empty";

      if (state !== "character" || !slot.character) {
        return {
          id,
          state,
          ...(state === "locked"
            ? {
                lockedBy: "Администрация",
                lockReason: "Персонаж временно недоступен.",
                lockedFor: "-",
              }
            : {}),
        };
      }

      return {
        id,
        state,
        character: {
          id: boundedNumber(slot.character.id, 1, Number.MAX_SAFE_INTEGER, 1, true),
          firstName: boundedText(slot.character.firstName, "Unknown", 24),
          lastName: boundedText(slot.character.lastName, "Player", 24),
          cash: boundedNumber(
            slot.character.cash,
            -Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
            0,
            true
          ),
          bank: boundedNumber(
            slot.character.bank,
            -Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
            0,
            true
          ),
          role: boundedText(slot.character.role, "player", 24),
          level: boundedNumber(slot.character.level, 1, 10000, 1, true),
          organization: null,
          lastOnline: "-",
          totalOnlineTime: 0,
          gender: slot.character.gender === "female" ? "female" : "male",
          customization: null,
          clothes: null,
          appearance: null,
        },
      };
    }),
  };

  serialized = JSON.stringify(minimalPayload);
  bytes = Buffer.byteLength(serialized, "utf8");

  if (bytes <= CHARACTER_SELECTION_PAYLOAD_BUDGET_BYTES) {
    return { serialized, bytes, compaction: "minimal" };
  }

  const emergencyPayload = {
    selectedSlotId: minimalPayload.selectedSlotId,
    uiRevision: minimalPayload.uiRevision,
    slots: minimalPayload.slots.map((slot) => {
      if (slot.state !== "character" || !slot.character) {
        return { id: slot.id, state: slot.state };
      }

      return {
        id: slot.id,
        state: "character",
        character: {
          id: slot.character.id,
          firstName: "Character",
          lastName: String(slot.character.id),
          cash: 0,
          bank: 0,
          role: "player",
          gender: slot.character.gender,
        },
      };
    }),
  };

  serialized = JSON.stringify(emergencyPayload);
  bytes = Buffer.byteLength(serialized, "utf8");

  return { serialized, bytes, compaction: "emergency" };
}

function getPlayerDonate(player) {
  return Math.max(0, Number(
    player?.donate ??
    player?.donateCoins ??
    player?.twinkleCoins ??
    player?.getVariable?.("donate") ??
    0
  ) || 0);
}

async function setActiveCharacter(player, character) {
  const adminLevel = Number(character.admin_level || 0);
  const fractionId = Number(character.fraction_id || 0);
  const fractionRank = Number(character.fraction_rank || 0);
  const fractionType = String(
    character.fractionProfile?.fraction_type ||
      character.fractionProfile?.type ||
      character.fraction_type ||
      ""
  ).toLowerCase();
  const donate = await getAccountDonate(player.accountId);

  player.twinkleCharacterSessionEpoch = Math.max(
    0,
    Math.trunc(Number(player.twinkleCharacterSessionEpoch || 0))
  ) + 1;
  player.character = character;
  player.characterId = Number(character.uuid);
  player.uuid = Number(character.uuid);

  const name = [character.username, character.lastname]
    .filter(Boolean)
    .join(" ")
    .trim();

  player.name = name || `Player_${character.uuid}`;

  player.adminLevel = adminLevel;
  player.admin = adminLevel;
  player.admin_level = adminLevel;
  player.fraction = fractionId;
  player.fractionId = fractionId;
  player.fractionRank = fractionRank;
  player.fractionType = fractionType;
  player.fractionProfile = character.fractionProfile || null;
  player.adminProfile = character.adminProfile || null;
  player.hasFraction = Number(character.has_fraction || 0) === 1;
  player.hasAdminProfile = Number(character.has_admin_profile || 0) === 1;

  player.donate = donate;
  player.donateCoins = donate;
  player.twinkleCoins = donate;

  try {
    player.setVariable("uuid", Number(character.uuid));
    player.setVariable("adminLevel", adminLevel);
    player.setVariable("admin", adminLevel);
    player.setVariable("fraction", fractionId);
    player.setVariable("fractionId", fractionId);
    player.setVariable("fractionRank", fractionRank);
    player.setVariable("fractionType", fractionType);
    player.setVariable("hasFraction", player.hasFraction);
    player.setVariable("hasAdminProfile", player.hasAdminProfile);
    player.setVariable("donate", donate);
  } catch {}

  const wearableResult = await inventory.ensureCharacterWearables(player, character);
  if (!wearableResult?.ok) {
    console.error(
      `[CHARACTER INVENTORY] Failed to initialize wearable ownership for character ${Number(character.uuid)}.`
    );
  }

  try {
    await jobEmployment.restorePlayer(player);
  } catch (error) {
    player.__activeJob = null;
    player.isWorking = false;
    console.error(
      `[CHARACTER JOB] Failed to restore employment for character ${Number(character.uuid)}:`,
      error?.message || error
    );
  }

  try {
    mp.events.call("hunting:characterReady", player);
  } catch {}
  try {
    mp.events.call("fishing:characterReady", player);
  } catch {}
  try {
    mp.events.call("licenses:characterReady", player);
  } catch {}
  try {
    mp.events.call("twinkle:character:loaded", player, Number(character.uuid));
  } catch {}
}

function buildHudPayload(player, character) {
  return {
    visible: true,
    compact: false,

    player: {
      id: player.id,
      characterId: Number(character.uuid),
      cash: Number(character.cash || 0),
      bank: Number(character.bank || 0),
    },

    server: {
      name: "Twinkle RP - TEST",
      online: mp.players.length,
      maxOnline: Number(mp.config?.maxplayers || 1000),
    },

    chat: {
      enabled: true,
      messages: [
        {
          id: `spawn-${Date.now()}`,
          text: "Вы появились в штате San-Andreas.",
          color: "#ff4778",
        },
      ],
    },

    microphone: {
      enabled: true,
      active: false,
    },

    needs: {
      showWater: true,
      showFood: true,
      water: Number(character.water ?? 100),
      food: Number(character.food ?? 100),
    },

    location: {
      street: "San-Andreas",
      zone: "Начальная локация",
    },
  };
}

async function applySpawnVisualState(player, character, contextLabel) {
  try {
    await applyCharacterAppearance(player, character);
  } catch (error) {
    console.error(`[${contextLabel} APPEARANCE ERROR]`, error);
  }

  try {
    if (!player || !mp.players.exists(player)) return false;
    await adminClothes.applySavedClothes(player);
  } catch (error) {
    console.error(`[${contextLabel} CLOTHES ERROR]`, error);
  }

  try {
    if (!player || !mp.players.exists(player)) return false;
    await inventory.restoreEquipment(player);
  } catch (error) {
    console.error(`[${contextLabel} INVENTORY RESTORE ERROR]`, error);
    return false;
  }

  return true;
}

function spawnNewCharacterDirect(player, character) {
  try {
    if (!player || !mp.players.exists(player)) return;
    if (!character) return;

    safeCall(player, "c:spawn:blockOnce");
    safeCall(player, "c:spawn:forceClose");
    setHudEnabled(player, false);

    player.dimension = 0;
    player.position = FIRST_SPAWN.position;
    player.heading = FIRST_SPAWN.heading;

    setTimeout(async () => {
      if (!player || !mp.players.exists(player)) return;
      player.dimension = 0;
      player.position = FIRST_SPAWN.position;
      player.heading = FIRST_SPAWN.heading;
      await applySpawnVisualState(player, character, "NEW CHARACTER");

      try {
        if (!player || !mp.players.exists(player)) return;
        if (!authFlow.isPhase(player, authFlow.PHASE.SPAWNING)) return;
        if (Number(player.character?.uuid || 0) !== Number(character.uuid || 0)) return;

        setClientPlayerState(player, false);
        await hudNeeds.load(player);
        if (!await syncInitialHud(player)) return;
        setHudEnabled(player, true);
        f2PayloadCache.prime(player);
        safeCall(player, "c:hud:gameplayReady", [true, player.twinkleCharacterSessionEpoch]);
        authFlow.setPhase(player, authFlow.PHASE.IN_GAME);
        emitQuestPlayerReady(player, {
          type: "direct",
        });
      } catch (err) {
        recoverSpawnCompletion(
          player,
          character,
          err,
          "NEW CHARACTER HUD ERROR"
        );
      }
    }, 700);
  } catch (err) {
    console.error("[NEW CHARACTER DIRECT SPAWN ERROR]", err);
  }
}

function spawnCharacter(player, character, spawn = null, withHud = true) {
  const spawnData = spawn || FIRST_SPAWN;

  try {
    if (!player || !mp.players.exists(player)) return;
    if (!character) return;

    setHudEnabled(player, false);

    player.dimension = Number(spawnData.dimension ?? 0);
    player.position = spawnData.position;
    player.heading = Number(spawnData.heading || 0);

    setTimeout(async () => {
      if (!player || !mp.players.exists(player)) return;
      player.dimension = Number(spawnData.dimension ?? 0);
      player.position = spawnData.position;
      player.heading = Number(spawnData.heading || 0);
      await applySpawnVisualState(player, character, "SPAWN");

      try {
        if (!player || !mp.players.exists(player)) return;

        setClientPlayerState(player, false);

        if (withHud) {
          await hudNeeds.load(player);
          if (!await syncInitialHud(player)) return;
          setHudEnabled(player, true);
          f2PayloadCache.prime(player);
          safeCall(player, "c:hud:gameplayReady", [true, player.twinkleCharacterSessionEpoch]);
          emitQuestPlayerReady(player, spawnData);
        }
      } catch (err) {
        recoverSpawnCompletion(player, character, err, "SPAWN HUD ERROR");
      }
    }, 700);
  } catch (err) {
    console.error("[SPAWN CHARACTER ERROR]", err);
  }
}

function getRole(row) {
  if (Number(row.has_admin_profile || 0) === 1) return "administrator";
  if (Number(row.has_fraction || 0) === 1) return "fraction";

  return "player";
}

function getOrganization(row) {
  return Number(row.has_fraction || 0) === 1 ? "Фракция" : null;
}

function mapCharacter(row) {
  const customization = buildPreviewCustomization(row.customization);

  return {
    id: Number(row.uuid),
    firstName: boundedText(row.username, "Unknown"),
    lastName: boundedText(row.lastname, "Player"),
    cash: Number(row.cash || 0),
    bank: Number(row.bank || 0),
    role: getRole(row),
    level: boundedNumber(row.level, 1, 10000, 1, true),
    organization: getOrganization(row),
    lastOnline: formatDate(row.last_play) || "-",
    totalOnlineTime: 0,
    gender: String(row.gender || "").toLowerCase() === "female"
      ? "female"
      : "male",
    customization,
    clothes: buildPreviewClothes(row.clothes),
    appearance: buildPreviewAppearance(row.appearance, row.customization),
  };
}

function mapBanToLockedSlot(slotId, ban) {
  return {
    id: slotId,
    state: "locked",
    lockedBy: boundedText(ban.admin, "Администрация", 64),
    lockReason: boundedText(ban.reason, "Персонаж заблокирован", 240),
    lockedUntil: formatDate(ban.unban_date),
    lockedFor: ban.unban_date
      ? boundedText(`до ${formatDate(ban.unban_date)}`, "-", 32)
      : "навсегда",
  };
}

async function buildCharacterSelectionPayload(accountId) {
  const account = await getAccountCharacterSlots(accountId);

  if (!account) {
    return {
      selectedSlotId: 1,
      slots: [
        { id: 1, state: "empty" },
        { id: 2, state: "empty" },
        { id: 3, state: "notPurchased" },
      ],
    };
  }

  const rawSlots = [
    Number(account.character1 || 0),
    Number(account.character2 || 0),
    Number(account.character3 || 0),
  ];

  const characterIds = rawSlots.filter((id) => id > 0);

  const characters =
    characterIds.length > 0
      ? await getCharactersByIds(characterIds)
      : [];

  const characterById = new Map(
    characters.map((row) => [Number(row.uuid), row])
  );

  const slots = [];

  for (let index = 0; index < rawSlots.length; index++) {
    const slotId = index + 1;
    const slotValue = rawSlots[index];

    if (slotValue === -1) {
      slots.push({
        id: slotId,
        state: "notPurchased",
      });
      continue;
    }

    if (slotValue === 0) {
      slots.push({
        id: slotId,
        state: "empty",
      });
      continue;
    }

    const character = characterById.get(slotValue);

    if (!character) {
      slots.push({
        id: slotId,
        state: "empty",
      });
      continue;
    }

    const ban = await getActiveCharacterBan(character.uuid);

    if (ban) {
      slots.push(mapBanToLockedSlot(slotId, ban));
      continue;
    }

    slots.push({
      id: slotId,
      state: "character",
      character: mapCharacter(character),
    });
  }

  const firstCharacterSlot = slots.find((slot) => slot.state === "character");

  return {
    selectedSlotId: firstCharacterSlot?.id || 1,
    slots,
  };
}

function normalizeName(value, fallback) {
  const text = String(value || "").trim();

  if (!text) return fallback;

  return text.replace(/[^a-zA-Zа-яА-ЯёЁ-]/g, "").slice(0, 32) || fallback;
}

function buildAppearanceFromPayload(payload) {
  const appearance = payload.appearance || {};
  const rawOverlays = appearance.overlays || payload.overlays || {};
  const overlays = [];

  if (Array.isArray(rawOverlays)) {
    rawOverlays.forEach((overlay) => {
      if (!overlay) return;

      overlays.push({
        index: Number(overlay.index ?? overlay.id),
        value: Number(overlay.value ?? 255),
        opacity: Number(overlay.opacity ?? 1),
        colorType: Number(overlay.colorType ?? 1),
        color1: Number(overlay.color1 ?? overlay.color ?? 0),
        color2: Number(overlay.color2 ?? 0),
      });
    });
  } else {
    Object.values(rawOverlays).forEach((overlay) => {
      if (!overlay) return;

      overlays.push({
        index: Number(overlay.index ?? overlay.id),
        value: Number(overlay.value ?? 255),
        opacity: Number(overlay.opacity ?? 1),
        colorType: Number(overlay.colorType ?? 1),
        color1: Number(overlay.color1 ?? overlay.color ?? 0),
        color2: Number(overlay.color2 ?? 0),
      });
    });
  }

  return {
    eyeColor: Number(appearance.eyeColor ?? payload.eyeColor ?? 0),
    overlays: overlays.filter((item) => !Number.isNaN(item.index)),
  };
}

function openSpawnSelectorForPlayer(player, character) {
  const expectedCharacterUuid = Number(character?.uuid || 0);

  setTimeout(async () => {
    let uiRevision = 0;

    try {
      if (!isSpawnSelectorRequestCurrent(player, expectedCharacterUuid)) return;

      clearSpawnPreviewSession(player);

      uiRevision = nextSpawnSelectorUiRevision(player);

      player.dimension = getPrivateDimension(
        player,
        SPAWN_SELECTOR_DIMENSION_BASE
      );

      setClientPlayerState(player, true);

      await applySpawnVisualState(player, character, "CHARACTER SELECT");

      if (!isSpawnSelectorRequestCurrent(player, expectedCharacterUuid)) return;

      const spawnPayload = await spawnService.buildSpawnPayload(player);

      if (!isSpawnSelectorRequestCurrent(player, expectedCharacterUuid)) return;

      spawnPayload.uiRevision = uiRevision;

      const previewSession = createSpawnPreviewSession(
        player,
        expectedCharacterUuid,
        spawnPayload
      );
      const initialType = previewSession.options.has(spawnPayload.selected)
        ? spawnPayload.selected
        : previewSession.options.keys().next().value;

      if (!initialType || !applySpawnPreview(
        player,
        previewSession,
        { type: initialType, requestId: 0 },
        false
      )) {
        throw new Error("No valid initial spawn preview point.");
      }

      safeCall(player, "c:spawn:open", [
        JSON.stringify(spawnPayload),
      ]);
      console.log(
        `[SPAWN SELECTOR] Opened for character ${expectedCharacterUuid}; options=${spawnPayload.options?.length || 0}; revision=${uiRevision}.`
      );
    } catch (err) {
      console.error("[SPAWN OPEN ERROR]", err);

      if (!isSpawnSelectorRequestCurrent(player, expectedCharacterUuid)) return;

      const fallbackPayload = {
        contractVersion: spawnService.SPAWN_CONTRACT_VERSION,
        selected: "default",
        options: [spawnService.DEFAULT_SPAWN],
        uiRevision,
      };
      const fallbackSession = createSpawnPreviewSession(
        player,
        expectedCharacterUuid,
        fallbackPayload
      );
      applySpawnPreview(
        player,
        fallbackSession,
        { type: "default", requestId: 0 },
        false
      );

      safeCall(player, "c:spawn:open", [
        JSON.stringify(fallbackPayload),
      ]);
    }
  }, 500);
}

mp.events.add("s:characters:uiTrace", (player, stage, revision) => {
  logCharacterSelectionUiStage(player, stage, revision);
});

mp.events.add("s:spawn:uiTrace", (player, stage, revision) => {
  logSpawnSelectorUiStage(player, stage, revision);
});

mp.events.add("s:spawn:preview", (player, rawPayload) => {
  const payload = safeParsePayload(rawPayload);
  const session = spawnPreviewSessions.get(player);
  const type = typeof payload?.type === "string" ? payload.type.trim() : "";
  const requestId = payload?.requestId;

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    payload.contractVersion !== spawnService.SPAWN_CONTRACT_VERSION ||
    !session ||
    !isSpawnSelectorRequestCurrent(player, session.characterUuid) ||
    payload.uiRevision !== session.uiRevision ||
    !Number.isSafeInteger(requestId) ||
    requestId < 1 ||
    requestId <= session.lastRequestId ||
    !type ||
    type.length > 64 ||
    !session.options.has(type)
  ) {
    return;
  }

  session.lastRequestId = requestId;
  scheduleSpawnPreview(player, session, { type, requestId });
});

mp.events.add("playerQuit", (player) => {
  clearSpawnPreviewSession(player);
});

mp.events.add("s:characters:request", async (player) => {
  let requestState = null;
  let expectedAccountId = 0;

  try {
    if (
      !player.auth ||
      !player.accountId ||
      player.character ||
      !authFlow.isPhase(player, authFlow.PHASE.CHARACTER_SELECTION)
    ) {
      return safeCall(player, "c:auth:init");
    }

    expectedAccountId = Number(player.accountId);

    requestState = beginCharacterSelectionRequest(player);

    if (!requestState) return;

    const isWhitelisted = !AUTH_CONFIG.whitelistEnabled ||
      await isAccountWhitelisted(player.login, player.serial);

    if (!isCharacterSelectionRequestCurrent(player, expectedAccountId)) return;

    if (!isWhitelisted) {
      player.auth = false;
      player.accountId = null;
      player.login = null;
      authFlow.setPhase(player, authFlow.PHASE.DENIED);
      return safeCall(player, "c:auth:whitelistDenied", [
        "Нет вайтлиста. Выбор персонажа недоступен.",
      ]);
    }

    const hardban = await getActiveAccountHardban(player.accountId);

    if (!isCharacterSelectionRequestCurrent(player, expectedAccountId)) return;

    if (hardban) {
      logsDb.setPlayerQuitReason(player, "ban", `HardBan: ${hardban.reason || "Аккаунт заблокирован"}`);
      return player.kick(`HardBan: ${hardban.reason || "Аккаунт заблокирован"}`);
    }

    const payload = await buildCharacterSelectionPayload(player.accountId);

    if (!isCharacterSelectionRequestCurrent(player, expectedAccountId)) return;

    const uiRevision = nextCharacterSelectionUiRevision(player);

    payload.uiRevision = uiRevision;
    const selectionPayload = serializeCharacterSelectionPayload(payload);

    setHudEnabled(player, false);
    console.log(
      `[CHARACTER SELECTION] Opening for account ${player.accountId}; slots=${payload.slots.length}; revision=${uiRevision}; bytes=${selectionPayload.bytes}; compaction=${selectionPayload.compaction}.`
    );
    safeCall(player, "c:hud:gameplayReady", [false]);
    safeCall(player, "c:characterSelection:open", [
      selectionPayload.serialized,
    ]);
  } catch (err) {
    console.error("[CHARACTER SELECTION REQUEST ERROR]", err);

    if (isCharacterSelectionRequestCurrent(player, expectedAccountId)) {
      safeCall(player, "c:auth:error", [
        "Ошибка загрузки персонажей.",
      ]);
    }
  } finally {
    completeCharacterSelectionRequest(requestState);
  }
});

mp.events.add("s:characters:select", async (player, characterId) => {
  if (
    !player?.auth ||
    !player.accountId ||
    player.character ||
    !authFlow.transition(
      player,
      authFlow.PHASE.CHARACTER_SELECTION,
      authFlow.PHASE.CHARACTER_SELECTING
    )
  ) return;

  console.log(
    `[CHARACTER SELECTION] Selection requested by account ${player.accountId}; character=${Number(characterId) || 0}.`
  );

  try {
    const hardban = await getActiveAccountHardban(player.accountId);

    if (hardban) {
      logsDb.setPlayerQuitReason(player, "ban", `HardBan: ${hardban.reason || "Аккаунт заблокирован"}`);
      return player.kick(`HardBan: ${hardban.reason || "Аккаунт заблокирован"}`);
    }

    const character = await getCharacterByUuid(
      Number(characterId),
      player.accountId
    );

    if (!character) {
      authFlow.setPhase(player, authFlow.PHASE.CHARACTER_SELECTION);
      return safeCall(player, "c:auth:error", [
        "Персонаж не найден.",
      ]);
    }

    const ban = await getActiveCharacterBan(character.uuid);

    if (ban) {
      authFlow.setPhase(player, authFlow.PHASE.CHARACTER_SELECTION);
      return safeCall(player, "c:auth:error", [
        ban.reason || "Этот персонаж заблокирован.",
      ]);
    }

    await setActiveCharacter(player, character);
    authFlow.setPhase(player, authFlow.PHASE.SPAWN_SELECTION);
    f2PayloadCache.prime(player);
    setHudEnabled(player, false);
    console.log(
      `[CHARACTER SELECTION] Character ${Number(character.uuid)} selected by account ${player.accountId}.`
    );
    safeCall(player, "c:hud:gameplayReady", [false]);

    if (Number(character.admin_level || 0) >= 1) {
      if (typeof adminJoin === "function") {
        adminJoin(player);
      }
    }

    safeCall(player, "c:characterSelection:close");

    openSpawnSelectorForPlayer(player, character);
  } catch (err) {
    restorePhaseIfCurrent(
      player,
      authFlow.PHASE.CHARACTER_SELECTING,
      authFlow.PHASE.CHARACTER_SELECTION
    );
    console.error("[CHARACTER SELECT ERROR]", err);

    safeCall(player, "c:auth:error", [
      "Ошибка выбора персонажа.",
    ]);
  }
});

mp.events.add("s:characters:create", async (player, slotId) => {
  if (
    !player?.auth ||
    !player.accountId ||
    player.character ||
    !authFlow.transition(
      player,
      authFlow.PHASE.CHARACTER_SELECTION,
      authFlow.PHASE.CHARACTER_SELECTING
    )
  ) return;

  try {
    slotId = Number(slotId);

    const account = await getAccountCharacterSlots(player.accountId);

    if (!account) {
      authFlow.setPhase(player, authFlow.PHASE.CHARACTER_SELECTION);
      return safeCall(player, "c:auth:error", [
        "Аккаунт не найден.",
      ]);
    }

    const slotColumn = `character${slotId}`;

    if (!["character1", "character2", "character3"].includes(slotColumn)) {
      authFlow.setPhase(player, authFlow.PHASE.CHARACTER_SELECTION);
      return safeCall(player, "c:auth:error", [
        "Некорректный слот.",
      ]);
    }

    const slotValue = Number(account[slotColumn]);

    if (slotValue === -1) {
      authFlow.setPhase(player, authFlow.PHASE.CHARACTER_SELECTION);
      return safeCall(player, "c:auth:error", [
        "Этот слот не куплен.",
      ]);
    }

    if (slotValue > 0) {
      authFlow.setPhase(player, authFlow.PHASE.CHARACTER_SELECTION);
      return safeCall(player, "c:auth:error", [
        "В этом слоте уже есть персонаж.",
      ]);
    }

    safeCall(player, "c:characterSelection:close");
    authFlow.setPhase(player, authFlow.PHASE.CHARACTER_CREATOR);

    setTimeout(() => {
      try {
        if (!player || !mp.players.exists(player)) return;
        if (!authFlow.isPhase(player, authFlow.PHASE.CHARACTER_CREATOR)) return;

        player.dimension = getPrivateDimension(player, CREATOR_DIMENSION_BASE);

        setClientPlayerState(player, false);

        safeCall(player, "c:characterCreator:open", [slotId]);
      } catch (err) {
        console.error("[CHARACTER CREATOR OPEN ERROR]", err);
      }
    }, 300);
  } catch (err) {
    restorePhaseIfCurrent(
      player,
      authFlow.PHASE.CHARACTER_SELECTING,
      authFlow.PHASE.CHARACTER_SELECTION
    );
    console.error("[CHARACTER CREATE SLOT ERROR]", err);

    safeCall(player, "c:auth:error", [
      "Ошибка открытия создания персонажа.",
    ]);
  }
});

mp.events.add("s:characters:save", async (player, slotId, payloadJson) => {
  if (
    !player ||
    !mp.players.exists(player) ||
    !player.auth ||
    !player.accountId ||
    player.character ||
    !authFlow.transition(
      player,
      authFlow.PHASE.CHARACTER_CREATOR,
      authFlow.PHASE.CHARACTER_SAVING
    )
  ) return;

  try {
    slotId = Number(slotId);

    if (![1, 2, 3].includes(slotId)) {
      authFlow.setPhase(player, authFlow.PHASE.CHARACTER_CREATOR);
      return safeCall(player, "c:characterCreator:error", [
        "Некорректный слот.",
      ]);
    }

    const payload = safeParsePayload(payloadJson);

    if (!payload) {
      authFlow.setPhase(player, authFlow.PHASE.CHARACTER_CREATOR);
      return safeCall(player, "c:characterCreator:error", [
        "Ошибка данных персонажа.",
      ]);
    }

    const firstName = normalizeName(payload.name?.first, "New");

    const lastName = normalizeName(
      payload.name?.last,
      `Player${Math.floor(Math.random() * 9999)}`
    );

    const age = Math.max(18, Math.min(80, Number(payload.name?.age || 18)));
    const gender = payload.gender === "female" ? "female" : "male";

    const customization = {
      gender,
      blend: payload.blend || {},
      face: payload.face || {},
      hair: payload.hair || {},
    };

    const clothes = payload.clothes || {};
    const appearance = buildAppearanceFromPayload(payload);

    const characterId = await createCharacterInSlot(
      player.accountId,
      slotId,
      {
        firstName,
        lastName,
        age,
        gender,
        customization,
        clothes,
        appearance,
      }
    );

    const character = await getCharacterByUuid(
      characterId,
      player.accountId
    );

    if (!character) {
      authFlow.setPhase(player, authFlow.PHASE.CHARACTER_CREATOR);
      return safeCall(player, "c:characterCreator:error", [
        "Персонаж создан, но не найден.",
      ]);
    }

    await setActiveCharacter(player, character);
    authFlow.setPhase(player, authFlow.PHASE.SPAWNING);
    f2PayloadCache.prime(player);

    safeCall(player, "c:characterCreator:success");

    setTimeout(() => {
      spawnNewCharacterDirect(player, character);
    }, 700);
  } catch (err) {
    restorePhaseIfCurrent(
      player,
      authFlow.PHASE.CHARACTER_SAVING,
      authFlow.PHASE.CHARACTER_CREATOR
    );
    console.error("[CHARACTER SAVE ERROR]", {
      message: err.message,
      code: err.code,
      errno: err.errno,
      sqlMessage: err.sqlMessage,
      stack: err.stack,
    });

    const messageByError = {
      SLOT_NOT_PURCHASED: "Этот слот не куплен.",
      SLOT_BUSY: "В этом слоте уже есть персонаж.",
      INVALID_SLOT: "Некорректный слот.",
      ACCOUNT_NOT_FOUND: "Аккаунт не найден.",
      CHARACTER_INSERT_FAILED: "Не удалось создать персонажа.",
    };

    safeCall(player, "c:characterCreator:error", [
      messageByError[err.message] ||
        `Ошибка создания персонажа: ${err.message}`,
    ]);
  }
});

mp.events.add("s:characters:purchaseSlot", (player) => {
  safeCall(player, "c:auth:error", [
    "Покупка слота пока недоступна.",
  ]);
});

mp.events.add("s:characters:lockedSlot", (player) => {
  safeCall(player, "c:auth:error", [
    "Этот персонаж заблокирован.",
  ]);
});

mp.events.add("s:spawn:select", async (player, type = "default") => {
    const requestedType = typeof type === "string" ? type.trim() : "";
    const previewSession = spawnPreviewSessions.get(player);

    if (
      !player ||
      !mp.players.exists(player) ||
      !player.auth ||
      !player.character ||
      !requestedType ||
      requestedType.length > 64 ||
      !previewSession ||
      !isSpawnSelectorRequestCurrent(player, previewSession.characterUuid) ||
      !previewSession.options.has(requestedType) ||
      !authFlow.transition(
        player,
        authFlow.PHASE.SPAWN_SELECTION,
        authFlow.PHASE.SPAWNING
      )
    ) return;

    console.log(
      `[SPAWN SELECTOR] Selection requested for character ${Number(player.character.uuid)}; type=${requestedType.slice(0, 32)}.`
    );

    try {
        const sessionSpawn = previewSession.options.get(requestedType);
        const spawn = await spawnService.selectSpawn(
          player,
          requestedType,
          requestedType === spawnService.DEFAULT_SPAWN_TYPE
            ? { resolvedSpawn: sessionSpawn }
            : undefined
        );

        clearSpawnPreviewSession(player);

        safeCall(player, "c:spawn:complete");

        setTimeout(async () => {
          const character = player?.character;

          try {
            if (!player || !mp.players.exists(player)) return;
            if (!authFlow.isPhase(player, authFlow.PHASE.SPAWNING)) return;
            if (!character) return;

            await applySpawnVisualState(player, character, "SPAWN SELECTOR");

            if (!player || !mp.players.exists(player)) return;
            if (!authFlow.isPhase(player, authFlow.PHASE.SPAWNING)) return;
            if (Number(player.character?.uuid || 0) !== Number(character.uuid || 0)) return;

            setClientPlayerState(player, false);
            await hudNeeds.load(player);
            if (!await syncInitialHud(player)) return;
            setHudEnabled(player, true);
            f2PayloadCache.refresh(player, { push: true }).catch((error) => {
              console.error("[SPAWN F2 CACHE ERROR]", error?.message || error);
            });
            safeCall(player, "chat:client:restore");
            safeCall(player, "c:hud:gameplayReady", [true, player.twinkleCharacterSessionEpoch]);
            authFlow.setPhase(player, authFlow.PHASE.IN_GAME);
            emitQuestPlayerReady(player, spawn);
            console.log(
              `[CHARACTER SPAWN] Character ${Number(character.uuid)} entered gameplay at ${spawn.type}.`
            );
          } catch (error) {
            recoverSpawnCompletion(
              player,
              character,
              error,
              "SPAWN COMPLETE ERROR"
            );
          }
        }, 350);

    } catch (err) {

        restorePhaseIfCurrent(
          player,
          authFlow.PHASE.SPAWNING,
          authFlow.PHASE.SPAWN_SELECTION
        );

        console.error("[SPAWN SELECT ERROR]", err);

        safeCall(player, "c:spawn:error", [
            "Не удалось загрузить место появления."
        ]);
    }
});

module.exports = {
  setActiveCharacter,
  spawnCharacter,
  buildHudPayload,
};
