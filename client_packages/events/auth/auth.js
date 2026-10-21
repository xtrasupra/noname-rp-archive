"use strict";

global.uiBrowser = global.uiBrowser || null;

let authCamera = null;
let authTick = null;

function getInterfaceLock() {
    return global.interfaceLock || null;
}

function getUiBrowser() {
    if (global.interfaceLock && typeof global.interfaceLock.getUiBrowser === "function") {
        return global.interfaceLock.getUiBrowser();
    }

    if (!global.uiBrowser) {
        global.uiBrowser = mp.browsers.new(global.__TWINKLE_CEF_URL__ || "package://cef/index.html");
    }

    return global.uiBrowser;
}

function suppressAuthPresentation() {
    try {
        getInterfaceLock()?.setGameplayOverlaySuppressed?.("auth", true);
    } catch {}
}

function openPage(page, props = null, payload = null, force = false) {
    const lock = getInterfaceLock();

    if (lock) {
        if (force && typeof lock.forceOpenPage === "function") {
            return lock.forceOpenPage(page, props, payload);
        }

        if (typeof lock.openPage === "function") {
            const ok = lock.openPage(page, props, payload);

            if (!ok && typeof lock.notify === "function") {
            }

            return ok;
        }
    }

    const browser = getUiBrowser();

    browser.execute(`
        (function waitTwinkle() {
            if (window.twinkleBrowser && window.twinkleBrowser.pages) {
                window.twinkleBrowser.pages.set(
                    ${JSON.stringify(page)},
                    ${JSON.stringify(props)},
                    ${JSON.stringify(payload)}
                );
                return;
            }

            setTimeout(waitTwinkle, 50);
        })();
    `);

    return true;
}

function closePage(page) {
    const lock = getInterfaceLock();

    if (lock && typeof lock.closePage === "function") {
        lock.closePage(page);
        return;
    }

    if (!global.uiBrowser) return;

    global.uiBrowser.execute(`
        if (window.twinkleBrowser && window.twinkleBrowser.pages) {
            window.twinkleBrowser.pages.close(${JSON.stringify(page)});
        }
    `);
}

function closeAllPages() {
    const lock = getInterfaceLock();

    if (lock && typeof lock.closeAllPages === "function") {
        lock.closeAllPages();
        return;
    }

    if (!global.uiBrowser) return;

    global.uiBrowser.execute(`
        if (window.twinkleBrowser && window.twinkleBrowser.pages) {
            window.twinkleBrowser.pages.closeAll();
        }
    `);
}

function notify(message, variant = "info", duration = 4500) {
    const lock = getInterfaceLock();

    if (lock && typeof lock.notify === "function") {
        lock.notify(message, variant, duration);
        return;
    }

    const browser = getUiBrowser();

    browser.execute(`
        (function waitNotify() {
            if (window.twinkleBrowser && window.twinkleBrowser.notifications) {
                window.twinkleBrowser.notifications.push({
                    message: ${JSON.stringify(message)},
                    variant: ${JSON.stringify(variant)},
                    duration: ${Number(duration)},
                    closable: true
                });
                return;
            }

            if (window.twinkleBrowser && window.twinkleBrowser.notify) {
                window.twinkleBrowser.notify(
                    ${JSON.stringify(message)},
                    ${JSON.stringify(variant)},
                    ${Number(duration)}
                );
                return;
            }

            setTimeout(waitNotify, 50);
        })();
    `);
}

function startAuthCamera() {
    const player = mp.players.local;
    const pos = player.position;

    if (authCamera) {
        authCamera.destroy();
        authCamera = null;
    }

    authCamera = mp.cameras.new(
        "default",
        new mp.Vector3(pos.x, pos.y, pos.z + 60.0),
        new mp.Vector3(0, 0, 0),
        50
    );

    authCamera.pointAtCoord(pos.x, pos.y + 200.0, pos.z + 60.0);
    authCamera.setActive(true);

    mp.game.cam.renderScriptCams(true, false, 0, true, false);
}

function stopAuthCamera() {
    if (authCamera) {
        authCamera.destroy();
        authCamera = null;
    }

    mp.game.cam.renderScriptCams(false, false, 0, true, false);
}

function lockAuthPlayer() {
    const player = mp.players.local;

    player.freezePosition(true);
    player.setInvincible(true);
    player.setCanRagdoll(false);
    player.clearTasks();

    mp.game.ui.displayRadar(false);

    if (authTick) return;

    authTick = setInterval(() => {
        mp.game.ui.displayRadar(false);

        mp.game.controls.disableAllControlActions(0);
        mp.game.controls.disableAllControlActions(1);
        mp.game.controls.disableAllControlActions(2);

        player.freezePosition(true);
    }, 50);
}

function stopAuthLock() {
    if (authTick) {
        clearInterval(authTick);
        authTick = null;
    }

    mp.game.ui.displayRadar(false);
}

mp.events.add("c:auth:init", () => {
    getUiBrowser();
    suppressAuthPresentation();

    mp.gui.cursor.show(true, true);

    lockAuthPlayer();
    startAuthCamera();

    closeAllPages();

    openPage("auth", null, {
        mode: "login",
    }, true);

    openPage("notifications");
});

mp.events.add("auth:tryLogin", (login, password, rememberMe) => {
    mp.events.callRemote("s:auth:tryLogin", login, password, rememberMe);
});

mp.events.add("auth:tryRegister", (login, email, password, promocode) => {
    mp.events.callRemote("s:auth:register", login, email, password, promocode);
});

mp.events.add("auth:tryRecover", (email) => {
    mp.events.callRemote("s:auth:recover", email);
});

mp.events.add("auth:confirmRecoverCode", (email, code) => {
    mp.events.callRemote("s:auth:confirmRecoverCode", email, code);
});

mp.events.add("auth:setRecoverPassword", (email, code, newPassword) => {
    mp.events.callRemote("s:auth:setRecoverPassword", email, code, newPassword);
});

mp.events.add("c:auth:error", (message) => {
    const text = Array.isArray(message) ? message[0] : message;

    notify(text || "Произошла ошибка.", "error");
});

mp.events.add("c:auth:whitelistDenied", (message) => {
    const text = Array.isArray(message) ? message[0] : message;

    mp.gui.cursor.show(true, true);
    suppressAuthPresentation();
    lockAuthPlayer();
    startAuthCamera();
    closeAllPages();

    openPage("auth", null, {
        mode: "login",
        error: text || "Нет вайтлиста. Доступ к серверу закрыт.",
    }, true);

    openPage("notifications");
    notify(text || "Нет вайтлиста. Доступ к серверу закрыт.", "error", 7000);
});

mp.events.add("c:auth:notify", (message, variant = "info", duration = 4500) => {
    notify(message, variant, duration);
});

mp.events.add("c:auth:success", () => {
    notify("Вы успешно вошли в аккаунт.", "success", 3000);

    closePage("auth");
    stopAuthCamera();
    stopAuthLock();

    setTimeout(() => {
        mp.gui.cursor.show(true, true);
        mp.game.ui.displayRadar(false);

        mp.events.callRemote("s:characters:request");
        openPage("notifications");
    }, 500);
});

mp.events.add("c:auth:recover:sent", (email) => {
    notify("Код восстановления отправлен на почту.", "success", 3500);

    openPage("auth", null, {
        mode: "recovery",
        recovery: {
            step: "code",
            email,
        },
    }, true);

    openPage("notifications");
});

mp.events.add("c:auth:recover:codeConfirmed", (email) => {
    notify("Код подтверждён.", "success", 3000);

    openPage("auth", null, {
        mode: "recovery",
        recovery: {
            step: "password",
            email,
        },
    }, true);

    openPage("notifications");
});

mp.events.add("c:auth:recover:success", () => {
    notify("Пароль успешно изменён. Войдите в аккаунт.", "success", 4000);

    openPage("auth", null, {
        mode: "login",
    }, true);

    openPage("notifications");
});

mp.events.add("c:auth:recover:error", (message, step = "email", email = "") => {
    notify(message || "Ошибка восстановления аккаунта.", "error");

    openPage("auth", null, {
        mode: "recovery",
        recovery: {
            step,
            email,
            error: message || "Ошибка восстановления аккаунта.",
        },
    }, true);

    openPage("notifications");
});
