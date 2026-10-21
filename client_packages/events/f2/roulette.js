"use strict";

function execCef(code) {
    try {
        if (global.uiBrowser?.execute) {
            global.uiBrowser.execute(code);
            return;
        }

        if (globalThis.twinkleBrowser?.browser?.execute) {
            globalThis.twinkleBrowser.browser.execute(code);
            return;
        }

        if (globalThis.twinkleBrowser?.cef?.execute) {
            globalThis.twinkleBrowser.cef.execute(code);
            return;
        }

        if (globalThis.browser?.execute) {
            globalThis.browser.execute(code);
        }
    } catch (e) {
        console.log("[ROULETTE CLIENT] execCef error:", e);
    }
}

const MULTIPLIERS = [2, 3, 5, 10];
const MAX_BET = 100000;
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,64}$/;
const SEGMENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const ACKNOWLEDGED_REQUEST_TTL_MS = 5 * 60 * 1000;
const MAX_ACKNOWLEDGED_REQUESTS = 128;
const rouletteState = {
    pending: null,
    result: null,
};
const acknowledgedRequests = new Map();

function pruneAcknowledgedRequests() {
    const expiryThreshold = Date.now() - ACKNOWLEDGED_REQUEST_TTL_MS;

    for (const [requestId, acknowledgedAt] of acknowledgedRequests) {
        if (acknowledgedAt < expiryThreshold) acknowledgedRequests.delete(requestId);
    }

    while (acknowledgedRequests.size > MAX_ACKNOWLEDGED_REQUESTS) {
        acknowledgedRequests.delete(acknowledgedRequests.keys().next().value);
    }
}

function rememberAcknowledgedRequest(requestId) {
    acknowledgedRequests.set(requestId, Date.now());
    pruneAcknowledgedRequests();
}

function isAcknowledgedRequest(requestId) {
    pruneAcknowledgedRequests();
    return acknowledgedRequests.has(requestId);
}

function normalizeRouletteResult(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

    const requestId = String(payload.requestId || "").trim();
    const donate = Number(payload.donate);
    if (!REQUEST_ID_PATTERN.test(requestId) || typeof payload.success !== "boolean") return null;
    if (!Number.isSafeInteger(donate) || donate < 0) return null;

    if (!payload.success) {
        return { ...payload, requestId, donate, success: false };
    }

    const bet = Number(payload.bet);
    const selectedMultiplier = Number(payload.selectedMultiplier);
    const resultMultiplier = Number(payload.resultMultiplier);
    const winAmount = Number(payload.winAmount);
    const segmentId = String(payload.segmentId || "");

    if (!Number.isSafeInteger(bet) || bet <= 0 || bet > MAX_BET) return null;
    if (!MULTIPLIERS.includes(selectedMultiplier) || !MULTIPLIERS.includes(resultMultiplier)) return null;
    if (!Number.isSafeInteger(winAmount) || winAmount < 0) return null;
    if (typeof payload.win !== "boolean" || !SEGMENT_ID_PATTERN.test(segmentId)) return null;

    return {
        ...payload,
        bet,
        donate,
        requestId,
        resultMultiplier,
        segmentId,
        selectedMultiplier,
        success: true,
        winAmount,
    };
}

function dispatchRouletteEvent(eventName, payload) {
    const payloadJson = JSON.stringify(payload || {});

    execCef(`
        try {
            const payload = JSON.parse(${JSON.stringify(payloadJson)});
            window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, {
                detail: payload
            }));
        } catch (e) {
            console.log("[ROULETTE CEF] dispatch error", e);
        }
    `);
}

function pushRouletteState() {
    dispatchRouletteEvent("twinkle:roulette:state", rouletteState);
}

mp.events.add("cef:roulette:bet", (amountRaw, multiplierRaw, requestIdRaw) => {
    const amount = Math.floor(Number(amountRaw));
    const multiplier = Math.floor(Number(multiplierRaw));
    const requestId = String(requestIdRaw || "").trim();

    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_BET) {
        return;
    }

    if (!MULTIPLIERS.includes(multiplier) || !REQUEST_ID_PATTERN.test(requestId)) {
        return;
    }

    if (isAcknowledgedRequest(requestId)) return;

    if (rouletteState.pending) {
        pushRouletteState();
        return;
    }

    rouletteState.pending = {
        amount,
        requestId,
        selectedMultiplier: multiplier,
    };
    rouletteState.result = null;

    mp.events.callRemote(
        "s:roulette:bet",
        amount,
        multiplier,
        requestId
    );
});

mp.events.add("cef:roulette:ready", () => {
    pushRouletteState();
});

mp.events.add("cef:roulette:retry", (requestIdRaw) => {
    const requestId = String(requestIdRaw || "").trim();
    const pending = rouletteState.pending;

    if (!pending || pending.requestId !== requestId || rouletteState.result) return;

    mp.events.callRemote(
        "s:roulette:bet",
        pending.amount,
        pending.selectedMultiplier,
        pending.requestId
    );
});

mp.events.add("cef:roulette:ack", (requestIdRaw) => {
    const requestId = String(requestIdRaw || "").trim();

    if (!REQUEST_ID_PATTERN.test(requestId)) return;

    mp.events.callRemote("s:roulette:ack", requestId);
    rememberAcknowledgedRequest(requestId);

    if (rouletteState.pending?.requestId === requestId) {
        rouletteState.pending = null;
        rouletteState.result = null;
    }
    execCef(`
        try {
            const payload = window.__F2_MENU_PAYLOAD__;
            if (payload?.shop?.roulette?.pendingResult?.requestId === ${JSON.stringify(requestId)}) {
                payload.shop.roulette.pendingResult = null;
                window.dispatchEvent(new CustomEvent("twinkle:f2:update", { detail: payload }));
            }
        } catch (e) {
            console.log("[ROULETTE CEF] acknowledgement error", e);
        }
    `);
});

mp.events.add("c:roulette:result", (payloadJson = "{}") => {
    let rawPayload;

    try {
        rawPayload = JSON.parse(String(payloadJson || "{}"));
    } catch {
        return;
    }

    const payload = normalizeRouletteResult(rawPayload);
    if (!payload || isAcknowledgedRequest(payload.requestId)) return;
    if (rouletteState.pending && rouletteState.pending.requestId !== payload.requestId) return;

    if (!rouletteState.pending) {
        if (!payload.success) return;

        rouletteState.pending = {
            amount: payload.bet,
            requestId: payload.requestId,
            selectedMultiplier: payload.selectedMultiplier,
        };
    }

    rouletteState.result = payload;

    dispatchRouletteEvent("twinkle:roulette:result", payload);
    execCef(`
        try {
            const payload = JSON.parse(${JSON.stringify(JSON.stringify(payload))});

            if (window.__F2_MENU_PAYLOAD__ && payload.donate !== undefined) {
                window.__F2_MENU_PAYLOAD__.donate = payload.donate;

                window.dispatchEvent(new CustomEvent("twinkle:f2:update", {
                    detail: window.__F2_MENU_PAYLOAD__
                }));
            }
        } catch (e) {
            console.log("[ROULETTE CEF] result error", e);
        }
    `);
});

console.log("[ROULETTE CLIENT] Loaded");
