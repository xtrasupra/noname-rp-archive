"use strict";

const KEY_E = 0x45;
const KEY_Y = 0x59;
const KEY_N = 0x4E;

let insideScrapyard = false;
let scrapyardData = null;
let currentOffer = null;
let offerExpiresAt = 0;
let lastActionAt = 0;

function parseJson(value, fallback = {}) {
    try {
        if (!value) {
            return fallback;
        }

        if (typeof value === "object") {
            return value;
        }

        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function canUseAction() {
    const now = Date.now();

    if (now - lastActionAt < 700) {
        return false;
    }

    lastActionAt = now;
    return true;
}

function isLocalPlayerDriver() {
    const player = mp.players.local;

    if (!player || !player.vehicle) {
        return false;
    }

    return player.vehicle.getPedInSeat(-1) === player.handle;
}

function drawText(text, x, y, options = {}) {
    mp.game.graphics.drawText(String(text), [x, y], {
        font: options.font ?? 4,
        color: options.color ?? [255, 255, 255, 255],
        scale: options.scale ?? [0.35, 0.35],
        outline: options.outline ?? true,
        centre: options.centre ?? true,
    });
}

function formatMoney(value) {
    return Math.max(0, Math.floor(Number(value) || 0))
        .toLocaleString("ru-RU");
}

function showNotification(message) {
    try {
        mp.game.graphics.notify(String(message));
    } catch {}
}

function closeOffer() {
    currentOffer = null;
    offerExpiresAt = 0;
}

mp.events.add("client:scrapyard:setInside", (state, rawData) => {
    insideScrapyard = Boolean(state);
    scrapyardData = insideScrapyard
        ? parseJson(rawData, {})
        : null;

    if (!insideScrapyard) {
        closeOffer();
    }
});

mp.events.add("client:scrapyard:showOffer", (rawPayload) => {
    const payload = parseJson(rawPayload, null);

    if (!payload?.token) {
        return;
    }

    currentOffer = payload;
    offerExpiresAt = Date.now() + Number(payload.expiresIn || 30000);

    showNotification(
        `Свалка предлагает $${formatMoney(payload.payout)}. ` +
        "Нажмите Y для подтверждения."
    );
});

mp.events.add("client:scrapyard:closeOffer", () => {
    closeOffer();
});

mp.events.add("client:scrapyard:notify", (message, type) => {
    showNotification(message);

    try {
        const colors = {
            success: [100, 220, 130],
            error: [255, 100, 100],
            info: [255, 210, 100],
        };

        const color = colors[type] || colors.info;

        mp.gui.chat.push(
            `!{rgb(${color[0]},${color[1]},${color[2]})}[Свалка] ` +
            `!{#ffffff}${message}`
        );
    } catch {}
});

mp.keys.bind(KEY_E, true, () => {
    if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__) return;
    if (!insideScrapyard || currentOffer || !canUseAction()) {
        return;
    }

    if (!isLocalPlayerDriver()) {
        showNotification("Вы должны находиться за рулём личного автомобиля.");
        return;
    }

    mp.events.callRemote("server:scrapyard:requestOffer");
});

mp.keys.bind(KEY_Y, true, () => {
    if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__) return;
    if (!currentOffer || !canUseAction()) {
        return;
    }

    if (Date.now() > offerExpiresAt) {
        closeOffer();
        showNotification("Предложение свалки истекло.");
        return;
    }

    mp.events.callRemote(
        "server:scrapyard:confirm",
        String(currentOffer.token)
    );
});

mp.keys.bind(KEY_N, true, () => {
    if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__) return;
    if (!currentOffer || !canUseAction()) {
        return;
    }

    mp.events.callRemote("server:scrapyard:cancel");
    closeOffer();
});

mp.events.add("render", () => {
    if (!insideScrapyard) {
        return;
    }

    if (!isLocalPlayerDriver()) {
        drawText(
            "Сядьте за руль личного автомобиля",
            0.5,
            0.88,
            {
                scale: [0.32, 0.32],
                color: [255, 200, 100, 230],
            }
        );

        return;
    }

    if (!currentOffer) {
        drawText(
            `~y~E~w~ — предложить автомобиль свалке`,
            0.5,
            0.88,
            {
                scale: [0.36, 0.36],
            }
        );

        if (scrapyardData?.name) {
            drawText(
                scrapyardData.name,
                0.5,
                0.915,
                {
                    scale: [0.28, 0.28],
                    color: [210, 210, 210, 220],
                }
            );
        }

        return;
    }

    const remainingSeconds = Math.max(
        0,
        Math.ceil((offerExpiresAt - Date.now()) / 1000)
    );

    if (remainingSeconds <= 0) {
        closeOffer();
        return;
    }

    drawText(
        `${currentOffer.displayName || currentOffer.model} | ` +
        `$${formatMoney(currentOffer.payout)}`,
        0.5,
        0.84,
        {
            scale: [0.4, 0.4],
            color: [255, 220, 120, 255],
        }
    );

    drawText(
        `Государственная цена: $${formatMoney(currentOffer.governmentPrice)} | ` +
        `Выплата: ${currentOffer.percent}%`,
        0.5,
        0.875,
        {
            scale: [0.29, 0.29],
            color: [225, 225, 225, 240],
        }
    );

    drawText(
        `~g~Y~w~ — продать     ~r~N~w~ — отменить     ${remainingSeconds} сек.`,
        0.5,
        0.91,
        {
            scale: [0.34, 0.34],
        }
    );
});
