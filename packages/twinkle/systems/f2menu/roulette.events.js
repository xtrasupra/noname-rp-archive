"use strict";

const crypto = require("crypto");
const authFlow = require("../../auth/authFlow.js");
const db = require("../../database/query.js");
const logsDb = require("../../database/logs.js");
const f2Cache = require("./f2menu.cache.js");
const rouletteRepository = require("./roulette.repository.js");
const {
  COOLDOWN_MS,
  MAX_BET,
  MIN_BET,
  MULTIPLIERS,
  ROULETTE_SEGMENTS,
  getTotalChance,
} = require("./roulette.config.js");

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,64}$/;
const activeBets = new Map();
const rouletteCooldown = new Map();

class RouletteError extends Error {
  constructor(code, message, donate = null) {
    super(message);
    this.name = "RouletteError";
    this.code = code;
    this.donate = donate;
  }
}

function getDonate(player) {
  return Math.max(0, Math.floor(Number(
    player?.donate
      ?? player?.donateCoins
      ?? player?.twinkleCoins
      ?? player?.account?.donate
      ?? player?.accountData?.donate
      ?? player?.getVariable?.("donate")
      ?? 0
  ) || 0));
}

function getPlayerIdentity(player) {
  const accountId = Number(player?.accountId || 0);
  const character = player?.character;
  const characterUuid = Number(character?.uuid || 0);
  const characterAccountId = Number(character?.account_id || 0);

  if (!player?.auth || !character) return null;
  if (!authFlow.isPhase(player, authFlow.PHASE.IN_GAME)) return null;
  if (!Number.isSafeInteger(accountId) || accountId <= 0) return null;
  if (!Number.isSafeInteger(characterUuid) || characterUuid <= 0) return null;
  if (characterAccountId !== accountId) return null;

  return {
    accountId,
    characterUuid,
    characterName: String(
      character.username
        ? `${character.username} ${character.lastname || ""}`.trim()
        : player.name || ""
    ).slice(0, 128),
  };
}

function syncDonate(player, amount) {
  const donate = Math.max(0, Math.floor(Number(amount) || 0));

  if (player.account) player.account.donate = donate;
  if (player.accountData) player.accountData.donate = donate;
  player.donate = donate;
  player.donateCoins = donate;
  player.twinkleCoins = donate;

  try {
    player.setVariable?.("donate", donate);
    player.call?.("client:donate:update", [donate]);
  } catch (error) {
    console.warn("[ROULETTE] Failed to synchronize donate balance:", error?.message || error);
  }

  return donate;
}

function patchF2Donate(player, donate) {
  try {
    const current = f2Cache.get(player);
    if (!current) return;

    f2Cache.patch(player, {
      donate,
      shop: {
        ...(current.shop || {}),
        balance: donate,
        donate,
      },
    });
  } catch (error) {
    console.warn("[ROULETTE] Failed to patch F2 cache:", error?.message || error);
  }
}

function normalizeRequestId(value) {
  const requestId = String(value || "").trim();
  return REQUEST_ID_PATTERN.test(requestId) ? requestId : null;
}

function validateBet(amount, multiplier) {
  if (!Number.isSafeInteger(amount) || amount < MIN_BET) {
    return "Некорректная ставка.";
  }

  if (amount > MAX_BET) {
    return `Максимальная ставка ${MAX_BET} Twinkle Coin.`;
  }

  if (!MULTIPLIERS.includes(multiplier)) {
    return "Некорректный множитель.";
  }

  return null;
}

function pickRouletteSegment(randomInt = crypto.randomInt) {
  const totalChance = getTotalChance();
  const target = randomInt(totalChance);
  let cursor = 0;

  for (const segment of ROULETTE_SEGMENTS) {
    cursor += segment.chance;
    if (target < cursor) return segment;
  }

  return ROULETTE_SEGMENTS[ROULETTE_SEGMENTS.length - 1];
}

function normalizeStoredSettlement(row, currentDonate) {
  return {
    donateBefore: Math.max(0, Number(row.balance_before || 0)),
    donateAfter: Math.max(0, Number(currentDonate || 0)),
    settlementBalanceAfter: Math.max(0, Number(row.balance_after || 0)),
    resultMultiplier: Number(row.result_multiplier),
    segmentId: String(row.segment_id || ""),
    win: Boolean(Number(row.win)),
    winAmount: Math.max(0, Number(row.win_amount || 0)),
    replayed: true,
  };
}

function isCooldown(accountId) {
  const lastSpinAt = rouletteCooldown.get(accountId) || 0;
  return Date.now() - lastSpinAt < COOLDOWN_MS;
}

function sendResult(player, payload) {
  if (!player || !mp.players.exists(player)) return;

  try {
    player.call("c:roulette:result", [JSON.stringify(payload)]);
  } catch (error) {
    console.warn("[ROULETTE] Failed to send result:", error?.message || error);
  }
}

async function settleRouletteBet(identity, requestId, amount, selectedMultiplier, randomInt = crypto.randomInt) {
  await rouletteRepository.ensureSchema();

  return db.withConn(async (conn) => {
    await conn.beginTransaction();

    try {
      const [accountRows] = await conn.query(
        "SELECT donate FROM accounts WHERE id = ? FOR UPDATE",
        [identity.accountId]
      );
      const account = accountRows?.[0];

      if (!account) {
        throw new RouletteError("account_not_found", "Аккаунт не найден.");
      }

      const donateBefore = Math.max(0, Math.floor(Number(account.donate) || 0));
      const [settlementRows] = await conn.query(
        `SELECT bet_amount, selected_multiplier, segment_id, result_multiplier,
                win, win_amount, balance_before, balance_after
           FROM f2_roulette_settlements
          WHERE account_id = ? AND request_id = ?
          LIMIT 1`,
        [identity.accountId, requestId]
      );
      const storedSettlement = settlementRows?.[0];

      if (storedSettlement) {
        if (
          Number(storedSettlement.bet_amount) !== amount
          || Number(storedSettlement.selected_multiplier) !== selectedMultiplier
        ) {
          throw new RouletteError(
            "request_conflict",
            "Идентификатор прокрута уже использован.",
            donateBefore
          );
        }

        await conn.commit();
        return normalizeStoredSettlement(storedSettlement, donateBefore);
      }

      if (donateBefore < amount) {
        throw new RouletteError(
          "insufficient_funds",
          "Недостаточно Twinkle Coin.",
          donateBefore
        );
      }

      const segment = pickRouletteSegment(randomInt);
      const win = segment.multiplier === selectedMultiplier;
      const winAmount = win ? amount * selectedMultiplier : 0;
      const donateAfter = donateBefore - amount + winAmount;

      await conn.query(
        "UPDATE accounts SET donate = ? WHERE id = ?",
        [donateAfter, identity.accountId]
      );
      await conn.query(
        `INSERT INTO f2_roulette_settlements
          (account_id, request_id, character_uuid, bet_amount, selected_multiplier,
           segment_id, result_multiplier, win, win_amount, balance_before, balance_after)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          identity.accountId,
          requestId,
          identity.characterUuid,
          amount,
          selectedMultiplier,
          segment.id,
          segment.multiplier,
          win ? 1 : 0,
          winAmount,
          donateBefore,
          donateAfter,
        ]
      );
      await conn.commit();

      return {
        donateBefore,
        donateAfter,
        resultMultiplier: segment.multiplier,
        segmentId: segment.id,
        win,
        winAmount,
        replayed: false,
      };
    } catch (error) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("[ROULETTE] Rollback error:", rollbackError);
      }

      throw error;
    }
  });
}

function writeSettlementLog(identity, requestId, amount, selectedMultiplier, settlement) {
  if (settlement.replayed) return Promise.resolve();

  return logsDb.writeDonateLog({
    source: "roulette",
    action: settlement.win ? "win" : "spend",
    amount: settlement.donateAfter - settlement.donateBefore,
    balanceBefore: settlement.donateBefore,
    balanceAfter: settlement.donateAfter,
    targetUuid: identity.characterUuid,
    targetName: identity.characterName,
    accountId: identity.accountId,
    comment: "Рулетка",
    metadata: {
      requestId,
      bet: amount,
      winAmount: settlement.winAmount,
      selectedMultiplier,
      resultMultiplier: settlement.resultMultiplier,
      segmentId: settlement.segmentId,
    },
  }).catch((error) => {
    console.error("[ROULETTE] Failed to mirror settlement to donate log:", error);
  });
}

function buildSuccessPayload(requestId, amount, selectedMultiplier, settlement) {
  return {
    requestId,
    success: true,
    win: settlement.win,
    selectedMultiplier,
    resultMultiplier: settlement.resultMultiplier,
    segmentId: settlement.segmentId,
    multiplier: settlement.resultMultiplier,
    bet: amount,
    winAmount: settlement.winAmount,
    donate: settlement.donateAfter,
    replayed: settlement.replayed,
    resultText: `x${settlement.resultMultiplier}`,
    message: settlement.win
      ? `Вы выиграли ${settlement.winAmount} Twinkle Coin.`
      : `Выпало x${settlement.resultMultiplier}. Вы проиграли ${amount} Twinkle Coin.`,
  };
}

function synchronizeSettlement(player, settlement) {
  if (!mp.players.exists(player)) return;

  syncDonate(player, settlement.donateAfter);
  patchF2Donate(player, settlement.donateAfter);
}

mp.events.add("s:roulette:bet", async (player, amountRaw, multiplierRaw, requestIdRaw) => {
  if (!player || !mp.players.exists(player)) return;

  const requestId = normalizeRequestId(requestIdRaw);
  const amount = Math.floor(Number(amountRaw));
  const selectedMultiplier = Math.floor(Number(multiplierRaw));
  const identity = getPlayerIdentity(player);

  if (!requestId) {
    sendResult(player, {
      requestId: String(requestIdRaw || ""),
      success: false,
      message: "Некорректный запрос рулетки.",
      donate: getDonate(player),
    });
    return;
  }

  if (!identity) {
    sendResult(player, {
      requestId,
      success: false,
      message: "Рулетка доступна только выбранному персонажу в игре.",
      donate: getDonate(player),
    });
    return;
  }

  const validationError = validateBet(amount, selectedMultiplier);

  if (validationError) {
    sendResult(player, {
      requestId,
      success: false,
      message: validationError,
      donate: getDonate(player),
    });
    return;
  }

  const activeBet = activeBets.get(identity.accountId);

  if (activeBet) {
    if (
      activeBet.requestId !== requestId
      || activeBet.amount !== amount
      || activeBet.selectedMultiplier !== selectedMultiplier
    ) {
      sendResult(player, {
        requestId,
        success: false,
        message: "Подождите завершения текущего прокрута.",
        donate: getDonate(player),
      });
      return;
    }

    try {
      const settlement = await activeBet.operation;
      synchronizeSettlement(player, settlement);
      sendResult(player, buildSuccessPayload(requestId, amount, selectedMultiplier, settlement));
    } catch (error) {
      const isKnownError = error instanceof RouletteError;
      sendResult(player, {
        requestId,
        success: false,
        message: isKnownError ? error.message : "Не удалось сохранить результат рулетки.",
        donate: isKnownError && error.donate !== null ? error.donate : getDonate(player),
      });
    }
    return;
  }

  if (isCooldown(identity.accountId)) {
    sendResult(player, {
      requestId,
      success: false,
      message: "Подождите завершения текущего прокрута.",
      donate: getDonate(player),
    });
    return;
  }

  rouletteCooldown.set(identity.accountId, Date.now());
  const operation = settleRouletteBet(identity, requestId, amount, selectedMultiplier);
  activeBets.set(identity.accountId, {
    amount,
    operation,
    requestId,
    selectedMultiplier,
  });

  try {
    const settlement = await operation;

    synchronizeSettlement(player, settlement);
    sendResult(player, buildSuccessPayload(requestId, amount, selectedMultiplier, settlement));
    void writeSettlementLog(identity, requestId, amount, selectedMultiplier, settlement);
  } catch (error) {
    const isKnownError = error instanceof RouletteError;

    if (!isKnownError) {
      console.error("[ROULETTE] Bet settlement error:", error);
    }

    sendResult(player, {
      requestId,
      success: false,
      message: isKnownError ? error.message : "Не удалось сохранить результат рулетки.",
      donate: isKnownError && error.donate !== null ? error.donate : getDonate(player),
    });
  } finally {
    if (activeBets.get(identity.accountId)?.operation === operation) {
      activeBets.delete(identity.accountId);
    }
  }
});

mp.events.add("s:roulette:ack", async (player, requestIdRaw) => {
  if (!player || !mp.players.exists(player)) return;

  const requestId = normalizeRequestId(requestIdRaw);
  const identity = getPlayerIdentity(player);
  if (!requestId || !identity) return;

  try {
    const acknowledged = await rouletteRepository.acknowledge(identity.accountId, requestId);
    if (acknowledged) f2Cache.invalidate(player);
  } catch (error) {
    console.error("[ROULETTE] Failed to acknowledge settlement:", error);
  }
});

mp.events.add("playerQuit", (player) => {
  const accountId = Number(player?.accountId || 0);
  if (accountId > 0) rouletteCooldown.delete(accountId);
});

module.exports = {
  RouletteError,
  ensureRouletteSchema: rouletteRepository.ensureSchema,
  getPlayerIdentity,
  normalizeRequestId,
  pickRouletteSegment,
  settleRouletteBet,
  validateBet,
};

console.log("[ROULETTE] Loaded");
