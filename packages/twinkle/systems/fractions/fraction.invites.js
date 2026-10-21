"use strict";

const chat = require("../chat/chat.service.js");
const radialMenuRegistry = require("../radialMenu/radialMenu.registry.js");
const fractionService = require("./fraction.service.js");
const logsDb = require("../../database/logs.js");
const { getPlayerName, getPlayerUuid } = require("../../utils/player.js");

const pendingFractionInvites = new Map();
const inviteCooldowns = new WeakMap();
const inviteOperations = new WeakSet();
const radialStateKey = Symbol("fractionRadialState");

const RADIAL_OWNER = "fraction-invites";
const INVITE_LIFETIME_MS = 60_000;
const INVITE_SEND_COOLDOWN_MS = 1_500;

function getPlayerById(id) {
  let found = null;
  mp.players.forEach((player) => {
    if (Number(player.id) === Number(id)) found = player;
  });
  return found;
}

function getActiveInviteForPlayer(playerId) {
  const id = Number(playerId);
  for (const invite of pendingFractionInvites.values()) {
    if (Number(invite.fromId) === id || Number(invite.targetId) === id) return invite;
  }
  return null;
}

function parseContractPayload(rawPayload) {
  let payload = rawPayload;
  try {
    if (typeof rawPayload === "string") payload = JSON.parse(rawPayload);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (payload.type !== "fractionInvite") return null;
  if (typeof payload.inviteId !== "string" || payload.inviteId.length > 160) return null;
  return payload;
}

function openHudContract(player, contract) {
  player.call("client:hud:setContract", [JSON.stringify(contract || {})]);
}

function closeHudContract(player) {
  player.call("client:hud:setContract", [JSON.stringify({ enabled: false })]);
}

function clearPendingInvite(inviteId) {
  const invite = pendingFractionInvites.get(inviteId);
  if (!invite) return null;
  pendingFractionInvites.delete(inviteId);
  if (invite.timeout) clearTimeout(invite.timeout);
  return invite;
}

async function getInviteActor(player) {
  const actor = await fractionService.getActor(player);
  return fractionService.hasPermission(actor, "invite") ? actor : null;
}

async function getRadialFactionState(player, context) {
  if (!context || typeof context !== "object") return null;
  if (context[radialStateKey]) return context[radialStateKey];

  context[radialStateKey] = (async () => {
    const target = context.target?.kind === "player" ? context.target.entity : null;
    const targetUuid = getPlayerUuid(target);
    if (!target || !targetUuid || target === player) return null;

    let actor = null;
    try {
      actor = await fractionService.getActor(player);
    } catch {}

    try {
      const targetMembership = await fractionService.getMembershipByUuid(targetUuid);
      return { actor, target, targetUuid, targetMembership };
    } catch (error) {
      console.error("[FRACTION INVITES] radial state error:", error);
      return null;
    }
  })();
  return context[radialStateKey];
}

function createInviteId(fromPlayer, targetPlayer, fractionId) {
  return `fraction:${fractionId}:${fromPlayer.id}:${targetPlayer.id}:${Date.now()}`;
}

async function createFractionInvite(player, target) {
  if (!target || target === player) throw new Error("Нельзя пригласить самого себя.");

  const now = Date.now();
  const lastSentAt = Number(inviteCooldowns.get(player) || 0);
  if (now - lastSentAt < INVITE_SEND_COOLDOWN_MS) {
    throw new Error("Подождите перед отправкой следующего приглашения.");
  }

  const actor = await getInviteActor(player);
  if (!actor) throw new Error("У вашего ранга нет права приглашать игроков.");

  const fractionId = Number(actor.fraction_id || 0);
  const targetUuid = getPlayerUuid(target);
  if (!fractionId) throw new Error("У вас не определена фракция.");
  if (!targetUuid) throw new Error("Персонаж выбранного игрока не загружен.");
  if (await fractionService.getMembershipByUuid(targetUuid)) {
    throw new Error("Игрок уже состоит во фракции.");
  }
  if (getActiveInviteForPlayer(player.id) || getActiveInviteForPlayer(target.id)) {
    throw new Error("У одного из игроков уже есть активное приглашение во фракцию.");
  }

  inviteCooldowns.set(player, now);
  const inviteId = createInviteId(player, target, fractionId);
  const invite = {
    id: inviteId,
    type: "fractionInvite",
    fractionId,
    fromId: Number(player.id),
    fromUuid: getPlayerUuid(player),
    targetId: Number(target.id),
    targetUuid,
    createdAt: now,
    processing: false,
    timeout: null,
  };

  pendingFractionInvites.set(inviteId, invite);
  invite.timeout = setTimeout(() => {
    const expired = clearPendingInvite(inviteId);
    if (!expired) return;
    const currentTarget = getPlayerById(expired.targetId);
    if (!currentTarget || getPlayerUuid(currentTarget) !== expired.targetUuid) return;
    closeHudContract(currentTarget);
    chat.sendInfo(currentTarget, "Приглашение во фракцию истекло.");
  }, INVITE_LIFETIME_MS);

  openHudContract(target, {
    id: inviteId,
    enabled: true,
    title: "Приглашение во фракцию",
    description: `${getPlayerName(player)} приглашает вас вступить во фракцию #${fractionId}.`,
    trueAction: {
      label: "Принять",
      event: "contract:accept",
      payload: { type: "fractionInvite", inviteId },
    },
    falseAction: {
      label: "Отказаться",
      event: "contract:decline",
      payload: { type: "fractionInvite", inviteId },
    },
  });

  chat.sendSuccess(player, `Приглашение отправлено игроку ${getPlayerName(target)}.`);
  chat.sendInfo(target, `Вам отправлено приглашение во фракцию от ${getPlayerName(player)}.`);
}

async function sendFractionInvite(player, target) {
  if (inviteOperations.has(player)) {
    throw new Error("Предыдущее приглашение ещё обрабатывается.");
  }

  inviteOperations.add(player);
  try {
    await createFractionInvite(player, target);
  } finally {
    inviteOperations.delete(player);
  }
}

radialMenuRegistry.unregisterOwner(RADIAL_OWNER);

radialMenuRegistry.registerAction({
  owner: RADIAL_OWNER,
  groupId: "player",
  id: "fraction:invite",
  targetKinds: ["player"],
  label: "Пригласить во фракцию",
  shortLabel: "Инвайт",
  icon: "users",
  description: "Отправить выбранному игроку приглашение во фракцию.",
  order: 100,
  resolve: async (player, context) => {
    const state = await getRadialFactionState(player, context);
    const canInvite = Boolean(state?.actor && fractionService.hasPermission(state.actor, "invite"));
    const hasActiveInvite = Boolean(
      state && (getActiveInviteForPlayer(player.id) || getActiveInviteForPlayer(state.target.id))
    );
    return {
      hidden: !canInvite || Boolean(state?.targetMembership),
      disabled: hasActiveInvite,
      disabledReason: hasActiveInvite ? "У одного из игроков уже есть активное приглашение." : "",
    };
  },
  handler: async (player, context) => {
    const target = context.target?.kind === "player" ? context.target.entity : null;
    await sendFractionInvite(player, target);
  },
});

radialMenuRegistry.registerAction({
  owner: RADIAL_OWNER,
  groupId: "player",
  id: "fraction:dismiss",
  targetKinds: ["player"],
  label: "Уволить из фракции",
  shortLabel: "Уволить",
  icon: "users",
  description: "Уволить выбранного игрока из вашей фракции.",
  order: 110,
  resolve: async (player, context) => {
    const state = await getRadialFactionState(player, context);
    const actor = state?.actor;
    const targetMembership = state?.targetMembership;
    const sameFaction = Boolean(
      actor && targetMembership && Number(actor.fraction_id) === Number(targetMembership.fraction_id)
    );
    const canDismiss = Boolean(actor && fractionService.hasPermission(actor, "dismiss"));
    const outranksTarget = Boolean(
      actor && targetMembership && (
        actor.adminLevel >= 7
        || Number(actor.is_leader) === 1
        || Number(targetMembership.rank_index) < Number(actor.rank_index)
      )
    );
    return {
      hidden: !sameFaction || !canDismiss,
      disabled: sameFaction && canDismiss && !outranksTarget,
      disabledReason: "Нельзя уволить участника равного или более высокого ранга.",
    };
  },
  handler: async (player, context) => {
    const target = context.target?.kind === "player" ? context.target.entity : null;
    const targetUuid = getPlayerUuid(target);
    if (!target || !targetUuid) throw new Error("Выбранный игрок больше недоступен.");

    const actor = await fractionService.getActor(player);
    await fractionService.memberAction(player, actor.fraction_id, targetUuid, "dismiss", {
      comment: "Уволен через радиальное меню",
    });
    chat.sendSuccess(player, `${getPlayerName(target)} уволен из фракции.`);
    chat.sendInfo(target, `${getPlayerName(player)} уволил вас из фракции.`);
  },
});

mp.registerCommand("finvite", async (player, text) => {
  const targetId = Number(String(text || "").trim());
  if (!Number.isSafeInteger(targetId) || targetId < 0) {
    return chat.sendError(player, "Использование: /finvite [ID игрока]");
  }
  const target = getPlayerById(targetId);
  if (!target) return chat.sendError(player, "Игрок не найден.");

  try {
    await sendFractionInvite(player, target);
  } catch (error) {
    console.error("[FRACTION INVITES] send error:", error);
    chat.sendError(player, error?.message || "Не удалось отправить приглашение во фракцию.");
  }
});

mp.events.add("server:contract:accept", async (player, rawPayload) => {
  const payload = parseContractPayload(rawPayload);
  if (!payload) return;

  const invite = pendingFractionInvites.get(payload.inviteId);
  if (!invite || invite.processing) return chat.sendError(player, "Приглашение уже недействительно.");
  if (Number(invite.targetId) !== Number(player.id) || invite.targetUuid !== getPlayerUuid(player)) {
    return chat.sendError(player, "Это приглашение не для вас.");
  }
  if (Date.now() - invite.createdAt > INVITE_LIFETIME_MS) {
    clearPendingInvite(payload.inviteId);
    closeHudContract(player);
    return chat.sendError(player, "Приглашение уже истекло.");
  }

  invite.processing = true;
  if (invite.timeout) clearTimeout(invite.timeout);
  const fromPlayer = getPlayerById(invite.fromId);

  try {
    if (!fromPlayer || getPlayerUuid(fromPlayer) !== invite.fromUuid) {
      throw new Error("Пригласивший игрок больше недоступен.");
    }
    const actor = await getInviteActor(fromPlayer);
    if (!actor || Number(actor.fraction_id) !== Number(invite.fractionId)) {
      throw new Error("Приглашение больше не подтверждено фракцией.");
    }
    await fractionService.setPlayerFraction(invite.targetUuid, invite.fractionId, 1, invite.fromUuid);
  } catch (error) {
    clearPendingInvite(payload.inviteId);
    closeHudContract(player);
    console.error("[FRACTION INVITES] accept error:", error);
    return chat.sendError(player, error?.message || "Не удалось вступить во фракцию.");
  }

  clearPendingInvite(payload.inviteId);
  closeHudContract(player);

  logsDb.logQuery(
    `INSERT INTO fraction_member_history
       (fraction_id, character_uuid, actor_uuid, actor_rank, action, comment)
     VALUES (?, ?, ?, NULL, 'Приглашен во фракцию', NULL)`,
    [invite.fractionId, invite.targetUuid, invite.fromUuid]
  ).catch((error) => console.error("[FRACTION INVITES] history log error:", error));

  chat.sendSuccess(player, `Вы вступили во фракцию #${invite.fractionId}.`);
  chat.sendSuccess(fromPlayer, `${getPlayerName(player)} принял приглашение во фракцию.`);
  fractionService.updateOnlineFraction(invite.fractionId).catch(() => null);
});

mp.events.add("server:contract:decline", (player, rawPayload) => {
  const payload = parseContractPayload(rawPayload);
  if (!payload) return;

  const invite = pendingFractionInvites.get(payload.inviteId);
  if (!invite || invite.processing) return chat.sendError(player, "Приглашение уже недействительно.");
  if (Number(invite.targetId) !== Number(player.id) || invite.targetUuid !== getPlayerUuid(player)) {
    return chat.sendError(player, "Это приглашение не для вас.");
  }

  clearPendingInvite(payload.inviteId);
  closeHudContract(player);
  chat.sendInfo(player, "Вы отказались от приглашения во фракцию.");

  const fromPlayer = getPlayerById(invite.fromId);
  if (fromPlayer && getPlayerUuid(fromPlayer) === invite.fromUuid) {
    chat.sendInfo(fromPlayer, `${getPlayerName(player)} отказался от приглашения во фракцию.`);
  }
});

mp.events.add("playerQuit", (player) => {
  inviteCooldowns.delete(player);
  for (const [inviteId, invite] of pendingFractionInvites.entries()) {
    if (Number(invite.targetId) !== Number(player.id) && Number(invite.fromId) !== Number(player.id)) continue;

    clearPendingInvite(inviteId);
    if (Number(invite.fromId) !== Number(player.id)) continue;

    const target = getPlayerById(invite.targetId);
    if (!target || getPlayerUuid(target) !== invite.targetUuid) continue;
    closeHudContract(target);
    chat.sendInfo(target, "Приглашение отменено: пригласивший игрок вышел.");
  }
});

console.log("[FRACTION INVITES] Loaded with radial actions");
