const db = require("../database/query.js");
const logsDb = require("../database/logs.js");
const AUTH_CONFIG = require("./auth.config.js");
const crypto = require("crypto");
const authFlow = require("./authFlow.js");
console.log("[AUTH DB EXPORTS]", Object.keys(db));

const {
  withConn,
  checkLogin,
  getLastHwidByAccountId,
  getAdminCharacterUuidByAccountId,
  updateAccountHwid,
  insertBan,
  isAccountWhitelisted,
  loginExists,
  scidExists,
  hwidExists,
  createAccount,
  getAccountBySocialClub,
  updateAuthSession,
  getPromoByCode,
  getAccountByEmail,
  createRecoveryCode,
  getValidRecoveryCode,
  consumeRecoveryCodeAndUpdatePassword,
  deleteExpiredRecoveryCodes,
  deleteActiveRecoveryCodes,
  getLastRecoveryCode,
} = db;

const {
  sendRecoveryCode,
  sendPasswordChanged,
  sendRegisterSuccess,
} = require("../systems/services/mail.service.js");

const bcrypt = require("bcrypt");

const RECOVERY_CODE_LENGTH = 10;
const RECOVERY_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_ATTEMPT_LIMIT = 5;
const MAX_RECOVERY_LIMIT_KEYS = 4096;
const recoveryAttempts = new Map();

function isLivePlayer(player) {
  return Boolean(player && mp.players.exists(player));
}

function beginPreAuthOperation(player) {
  if (!isLivePlayer(player) || player.auth || player.character) return false;
  return authFlow.transition(
    player,
    authFlow.PHASE.PRE_AUTH,
    authFlow.PHASE.AUTHENTICATING
  );
}

function finishPreAuthOperation(player) {
  if (!isLivePlayer(player) || !authFlow.isPhase(player, authFlow.PHASE.AUTHENTICATING)) return;
  authFlow.setPhase(
    player,
    player.auth ? authFlow.PHASE.CHARACTER_SELECTION : authFlow.PHASE.PRE_AUTH
  );
}

function useRecoveryAttempt(player, email, action) {
  const now = Date.now();
  const emailKey = crypto
    .createHash("sha256")
    .update(String(email || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
  const key = `${action}:${String(player?.ip || "unknown")}:${emailKey}`;
  let entry = recoveryAttempts.get(key);

  if (!entry || entry.expiresAt <= now) {
    entry = { attempts: 0, expiresAt: now + RECOVERY_ATTEMPT_WINDOW_MS };
  }

  entry.attempts += 1;
  recoveryAttempts.set(key, entry);

  if (recoveryAttempts.size > MAX_RECOVERY_LIMIT_KEYS) {
    for (const [storedKey, storedEntry] of recoveryAttempts) {
      if (storedEntry.expiresAt <= now) recoveryAttempts.delete(storedKey);
    }

    while (recoveryAttempts.size > MAX_RECOVERY_LIMIT_KEYS) {
      recoveryAttempts.delete(recoveryAttempts.keys().next().value);
    }
  }

  return {
    allowed: entry.attempts <= RECOVERY_ATTEMPT_LIMIT,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
  };
}

async function canPassWhitelist(login, hwid, conn = null) {
  if (!AUTH_CONFIG.whitelistEnabled) {
    return true;
  }

  if (conn) {
    return isAccountWhitelisted(login, hwid, conn);
  }

  return withConn(async (innerConn) => {
    return isAccountWhitelisted(login, hwid, innerConn);
  });
}

function denyWhitelist(player, message = "Нет вайтлиста. Доступ к серверу закрыт.") {
  player.auth = false;
  player.accountId = null;
  player.login = null;
  authFlow.setPhase(player, authFlow.PHASE.DENIED);
  player.call("c:auth:whitelistDenied", [message]);
}

function getPlayerDimension(player, offset = 1) {
    return Number(offset) + Number(player.id);
}

const spawnData = {
  position: new mp.Vector3(-1037.75, -2737.62, 20.17),
  heading: 327.0,
  dimension: 0,
};

function preparePlayerForAuthentication(player) {
    player.auth = false;
    player.accountId = null;
    player.login = null;
    player.character = null;
    player.characterData = null;
    player.hudEnabled = false;
    player.__authFlowStarted = false;
    player.__clientResourcesReady = false;
    player.__cefReady = false;
    authFlow.setPhase(player, authFlow.PHASE.PRE_AUTH);

    player.dimension = getPlayerDimension(player);
    player.position = spawnData.position;
}

async function startAuthenticationFlow(player) {
    if (!player || !mp.players.exists(player) || player.__authFlowStarted) return;

    if (!authFlow.transition(player, authFlow.PHASE.PRE_AUTH, authFlow.PHASE.AUTHENTICATING)) return;

    player.__authFlowStarted = true;
    console.log(`[AUTH] Client resources ready for player #${player.id}. Starting authentication flow.`);

    const hwid = player.serial;
    const ip = player.ip;
    const scid = player.socialClub;
    player.call("c:hud:gameplayReady", [false]);
    player.call("setPlayerState", [true]);
    
    try {
      const account = await getAccountBySocialClub(scid);

    if (
      account &&
      account.remember_me === 1 &&
      account.LastHwid === hwid &&
      account.LastIp === ip
    ) {
      const wl = await canPassWhitelist(account.login, hwid);

      if (!wl) {
        await updateAuthSession(account.id, 0, account.LastHwid, account.LastIp);
        return denyWhitelist(player);
      }

      player.auth = true;
      player.accountId = account.id;
      player.login = account.login;
      authFlow.setPhase(player, authFlow.PHASE.CHARACTER_SELECTION);

      console.log(`[AUTOLOGIN] Аккаунт ${account.login} вошел автоматически.`);

      return player.call("c:auth:success");
    }

    if (account && account.remember_me === 1) {
      await updateAuthSession(account.id, 0, account.LastHwid, account.LastIp);
    }

    authFlow.setPhase(player, authFlow.PHASE.PRE_AUTH);
    player.call("c:auth:init");
  } catch (e) {
    console.error("[AUTOLOGIN ERROR]", e);
    authFlow.setPhase(player, authFlow.PHASE.PRE_AUTH);
    player.call("c:auth:init");
  }
}

function tryStartAuthenticationFlow(player) {
  if (
    !isLivePlayer(player) ||
    !player.__clientResourcesReady ||
    !player.__cefReady ||
    player.__authFlowStarted
  ) return;

  startAuthenticationFlow(player).catch((error) => {
    console.error("[AUTH READY ERROR]", error);
    if (isLivePlayer(player)) {
      authFlow.setPhase(player, authFlow.PHASE.PRE_AUTH);
      player.call("c:auth:init");
    }
  });
}

mp.events.add("playerJoin", (player) => {
  preparePlayerForAuthentication(player);
});

// RAGE:MP emits playerReady only after all client resource packages are loaded.
// Authentication UI events sent from playerJoin can race client registration and be lost.
mp.events.add("playerReady", (player) => {
  player.__clientResourcesReady = true;
  player.call("c:twinkle:resourcesReady");
  console.log(`[AUTH] Client resources ready for player #${player.id}; waiting for CEF readiness.`);
  tryStartAuthenticationFlow(player);
});

mp.events.add("s:ui:cefReady", (player) => {
  if (!isLivePlayer(player) || player.__cefReady) return;

  player.__cefReady = true;
  console.log(`[AUTH] CEF ready for player #${player.id}.`);
  tryStartAuthenticationFlow(player);
});

mp.events.add("s:auth:tryLogin", async (player, login, password, rememberMe = false) => {
  if (!beginPreAuthOperation(player)) return;

  try {
    if (!login || !password) {
      return player.call("c:auth:error", ["Введите логин и пароль."]);
    }

    const account = await checkLogin(login, password);

    if (!account) {
      return player.call("c:auth:error", ["Неверный логин или пароль."]);
    }

    const scid = player.socialClub;
    const ip = player.ip;
    const hwid = player.serial;

    let canLogin = true;
    let errorMessage = null;

    await withConn(async (conn) => {
      const lastHWID = await getLastHwidByAccountId(account.id, conn);
      const hwidChanged = lastHWID && lastHWID !== hwid;

      if (!lastHWID) {
        await updateAccountHwid(account.id, hwid, ip, conn);
      } else if (hwidChanged) {
        const adminUuid = await getAdminCharacterUuidByAccountId(account.id, conn);

        if (adminUuid) {
          const reason = "Система: Смена HWID на админ-аккаунте";
          const unbanDate = new Date(Date.now() + 9999 * 24 * 60 * 60 * 1000);

          await insertBan({
            accountId: account.id,
            characterUuid: adminUuid,
            socialClubId: scid,
            hwid,
            reason,
            admin: "Система",
            unbanDate
          }, conn);

          setTimeout(() => {
            if (mp.players.exists(player)) {
              logsDb.setPlayerQuitReason(player, "ban", reason);
              player.kick(reason);
            }
          }, 500);

          canLogin = false;
          return;
        }

        await updateAccountHwid(account.id, hwid, ip, conn);
      }

      const wl = await canPassWhitelist(account.login, hwid, conn);

      if (!wl) {
        canLogin = false;
        errorMessage = "Нет вайтлиста. Доступ к серверу закрыт.";
        return;
      }

      await updateAuthSession(account.id, rememberMe ? 1 : 0, hwid, ip, conn);
    });

    if (!canLogin) {
      if (errorMessage) {
        denyWhitelist(player, errorMessage);
      }

      return;
    }

    player.auth = true;
    player.accountId = account.id;
    player.login = account.login;

    player.call("c:auth:success");
  } catch (err) {
    console.error("[LOGIN ERROR]", err);
    player.call("c:auth:error", ["Ошибка при входе в аккаунт."]);
  } finally {
    finishPreAuthOperation(player);
  }
});

mp.events.add("s:auth:register", async (player, login, email, password, promocode) => {
  if (!beginPreAuthOperation(player)) return;

  const scid = player.socialClub;
  const hwid = player.serial;
  const ip = player.ip;

  try {
    if (!login || !email || !password) {
      return player.call("c:auth:error", ["Заполните все обязательные поля."]);
    }

    await withConn(async (conn) => {
      if (await loginExists(login, conn)) {
        return player.call("c:auth:error", ["Такой логин уже занят."]);
      }

      if (await scidExists(scid, conn)) {
        return player.call("c:auth:error", ["На этот Social Club уже зарегистрирован аккаунт."]);
      }

      if (await hwidExists(hwid, conn)) {
        return player.call("c:auth:error", ["На этот HWID уже зарегистрирован аккаунт."]);
      }

      let finalPromocode = null;

      if (promocode && String(promocode).trim().length > 0) {
        const promo = await getPromoByCode(String(promocode).trim(), conn);

        if (!promo) {
          return player.call("c:auth:error", ["Такой промокод не существует или он неактивен."]);
        }

        finalPromocode = promo.code;
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const accountId = await createAccount({
        login,
        email,
        password: passwordHash,
        scid,
        hwid,
        ip,
        promocode: finalPromocode
      }, conn);

      const wl = await canPassWhitelist(login, hwid, conn);

      if (!wl) {
        await updateAuthSession(accountId, 0, hwid, ip, conn);

        sendRegisterSuccess(email, login).catch((err) => {
          console.error("[MAIL REGISTER ERROR]", err);
        });

        return denyWhitelist(
          player,
          "Аккаунт создан, но вайтлист не выдан. Войдите после получения доступа."
        );
      }

      await updateAuthSession(accountId, 0, hwid, ip, conn);

      player.auth = true;
      player.accountId = accountId;
      player.login = login;

      sendRegisterSuccess(email, login).catch((err) => {
        console.error("[MAIL REGISTER ERROR]", err);
      });

      player.call("c:auth:success");
    });
  } catch (err) {
    console.error("[REGISTER ERROR]", err);
    player.call("c:auth:error", ["Ошибка при создании аккаунта."]);
  } finally {
    finishPreAuthOperation(player);
  }
});

function generateRecoveryCode() {
  const upperBound = 10 ** RECOVERY_CODE_LENGTH;
  return String(crypto.randomInt(0, upperBound)).padStart(RECOVERY_CODE_LENGTH, "0");
}

mp.events.add("s:auth:recover", async (player, email) => {
  if (!beginPreAuthOperation(player)) return;

  try {
    email = String(email || "").trim().toLowerCase();

    if (!email) {
      return player.call("c:auth:recover:error", ["Введите почту.", "email", email]);
    }

    const attempt = useRecoveryAttempt(player, email, "request");
    if (!attempt.allowed) {
      return player.call("c:auth:recover:error", [
        `Слишком много запросов. Повторите через ${attempt.retryAfterSeconds} сек.`,
        "email",
        email,
      ]);
    }

    await withConn(async (conn) => {
      await deleteExpiredRecoveryCodes(conn);

      const account = await getAccountByEmail(email, conn);

      if (!account) {
        return player.call("c:auth:recover:error", ["Аккаунт с такой почтой не найден.", "email", email]);
      }

      const lastCode = await getLastRecoveryCode(email, conn);

      if (lastCode) {
        const createdAt = new Date(lastCode.created_at).getTime();
        const now = Date.now();
        const diffMs = now - createdAt;
        const cooldownMs = 60 * 1000;

        if (diffMs < cooldownMs) {
          const leftSeconds = Math.ceil((cooldownMs - diffMs) / 1000);

          return player.call("c:auth:recover:error", [
            `Повторно запросить код можно через ${leftSeconds} сек.`,
            "email",
            email
          ]);
        }
      }

      await deleteActiveRecoveryCodes(email, conn);

      const code = generateRecoveryCode();

      await createRecoveryCode(account.id, email, code, conn);
      await sendRecoveryCode(email, code);

      player.call("c:auth:recover:sent", [email]);
    });
  } catch (err) {
    console.error("[RECOVERY SEND ERROR]", err);
    player.call("c:auth:recover:error", ["Не удалось отправить код восстановления.", "email", email || ""]);
  } finally {
    finishPreAuthOperation(player);
  }
});

mp.events.add("s:auth:confirmRecoverCode", async (player, email, code) => {
  if (!beginPreAuthOperation(player)) return;

  try {
    email = String(email || "").trim().toLowerCase();
    code = String(code || "").trim();

    if (!email || !code) {
      return player.call("c:auth:recover:error", ["Введите код восстановления.", "code", email]);
    }

    const attempt = useRecoveryAttempt(player, email, "verify");
    if (!attempt.allowed) {
      return player.call("c:auth:recover:error", [
        `Слишком много попыток. Повторите через ${attempt.retryAfterSeconds} сек.`,
        "code",
        email,
      ]);
    }

    const recoveryCode = await getValidRecoveryCode(email, code);

    if (!recoveryCode) {
      return player.call("c:auth:recover:error", ["Неверный или просроченный код.", "code", email]);
    }

    player.call("c:auth:recover:codeConfirmed", [email]);
  } catch (err) {
    console.error("[RECOVERY CODE ERROR]", err);
    player.call("c:auth:recover:error", ["Ошибка проверки кода.", "code", email || ""]);
  } finally {
    finishPreAuthOperation(player);
  }
});

mp.events.add("s:auth:setRecoverPassword", async (player, email, code, newPassword) => {
  if (!beginPreAuthOperation(player)) return;

  try {
    email = String(email || "").trim().toLowerCase();
    code = String(code || "").trim();
    newPassword = String(newPassword || "");

    if (!email || !code || !newPassword) {
      return player.call("c:auth:recover:error", ["Заполните все поля.", "password", email]);
    }

    if (newPassword.length < 6 || newPassword.length > 64) {
      return player.call("c:auth:recover:error", ["Пароль должен быть от 6 до 64 символов.", "password", email]);
    }

    const attempt = useRecoveryAttempt(player, email, "password");
    if (!attempt.allowed) {
      return player.call("c:auth:recover:error", [
        `Слишком много попыток. Повторите через ${attempt.retryAfterSeconds} сек.`,
        "password",
        email,
      ]);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const recovery = await consumeRecoveryCodeAndUpdatePassword(email, code, passwordHash);

    if (!recovery) {
      return player.call("c:auth:recover:error", ["Неверный или просроченный код.", "password", email]);
    }
    sendPasswordChanged(email, {
    ip: player.ip,
    device: player.socialClub || "RAGE Multiplayer",
    geo: "Не определено"
  }).catch((err) => {
    console.error("[MAIL PASSWORD CHANGED ERROR]", err);
  });

    player.call("c:auth:recover:success");
  } catch (err) {
    console.error("[RECOVERY PASSWORD ERROR]", err);
    player.call("c:auth:recover:error", ["Ошибка смены пароля.", "password", email || ""]);
  } finally {
    finishPreAuthOperation(player);
  }
});
