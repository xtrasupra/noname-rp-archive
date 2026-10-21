"use strict";

if (!global.twinkleHudSnapshot) {
    let payload = {};

    function isPayload(value) {
        return Boolean(value && typeof value === "object" && !Array.isArray(value));
    }

    function remember(nextPayload) {
        if (isPayload(nextPayload)) payload = nextPayload;
        return payload;
    }

    function get() {
        return payload;
    }

    function reset() {
        payload = {};
    }

    global.twinkleHudSnapshot = Object.freeze({
        get,
        remember,
        reset,
    });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = global.twinkleHudSnapshot;
}
