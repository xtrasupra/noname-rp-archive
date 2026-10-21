"use strict";

const TABLET_KEY = 0x75; 
const TABLET_REFRESH_MS = 30000;

let latestTabletPayload = {
    organizations: [],
    houses: [],
    apartments: [],
    businesses: [],
    activeOrganizationId: null,
    meta: {
        reason: "client_boot",
    },
};

let lastRequestAt = 0;
let refreshTimer = null;
let tabletSubscribed = false;

function setTabletSubscription(active, heartbeat = false) {
    const next = Boolean(active);
    if (!heartbeat && tabletSubscribed === next) return;
    tabletSubscribed = next;
    mp.events.callRemote("server:fraction:tablet:subscription", next);
}

function tabletStateOptions() {
    return {
        eventName: "twinkle:tablet:update",
        globalName: "__TWINKLE_TABLET_PAYLOAD__",
        retryKey: "tablet:payload",
    };
}

function notify(message, variant = "info") {
    try {
        global.interfaceLock?.notify?.(message, variant);
    } catch {}
}

function requestTablet(reason = "manual", force = false) {

    const now = Date.now();

    if (!force && now - lastRequestAt < 1500)
        return;

    lastRequestAt = now;

    const payload = JSON.stringify({
        reason,
        force: Boolean(force),
    });

    // Фракции
    mp.events.callRemote(
        "server:fraction:tablet:request",
        payload
    );

    // Недвижимость
    mp.events.callRemote(
        "server:property:tablet:request",
        payload
    );

    mp.events.callRemote(
        "server:business:tablet:request"
    );

    // Профиль дальнобойщика и пул заказов (сервер сам вернёт null,
    // если смена не активна).
    mp.events.callRemote(
        "server:trucker:tablet:request"
    );
}

function stringifyPayload(payload = {}) {
    try {
        return JSON.stringify(payload || {});
    } catch {
        return "{}";
    }
}

function refreshTablet(reason = "action") {
    if (refreshTimer) clearTimeout(refreshTimer);
    const throttleRemaining = Math.max(0, 1500 - (Date.now() - lastRequestAt));
    refreshTimer = setTimeout(() => {
        refreshTimer = null;
        requestTablet(reason, false);
    }, Math.max(250, throttleRemaining + 25));
}

function remoteFractionAction(remoteEvent, ...args) {
    try {
        mp.events.callRemote(remoteEvent, ...args);
        refreshTablet(remoteEvent);
    } catch (error) {
        mp.console.logError(`[TABLET] ${remoteEvent}: ${error.message}`);
        notify("Не удалось выполнить действие планшета.", "error");
    }
}

function patchTablet(rawPayload) {

    let payload = {};

    try {

        payload =
            typeof rawPayload === "string"
                ? JSON.parse(rawPayload)
                : rawPayload || {};

    } catch(e) {

        mp.console.logError(
            "[TABLET JSON ERROR] " + e.message
        );

        return;
    }


    console.log(
        "[TABLET UPDATE]",
        JSON.stringify(payload)
    );


    latestTabletPayload = {
        ...latestTabletPayload,
        ...payload,

        houses:
            Array.isArray(payload.houses)
                ? payload.houses
                : latestTabletPayload.houses,

        apartments:
            Array.isArray(payload.apartments)
                ? payload.apartments
                : latestTabletPayload.apartments,

        businesses:
            Array.isArray(payload.businesses)
                ? payload.businesses
                : latestTabletPayload.businesses
    };

    if (global.uiState?.patch) {
        latestTabletPayload = global.uiState.patch(
            "tablet",
            latestTabletPayload,
            tabletStateOptions()
        );
    }

}

// Job applications must update the same local cache used by later faction,
// property and business merges; otherwise a stale field can reappear.
global.twinkleTabletPatch = patchTablet;

function openTablet() {

    const state =
        global.interfaceLock?.getInterfaceState?.();

    if (state?.activePage === "tablet") {
        global.interfaceLock?.closePage?.("tablet");
        return;
    }

    if (state?.activePage &&
        state.activePage !== "tablet")
        return;

    const cachedPayload = global.uiState?.get
        ? global.uiState.get("tablet", latestTabletPayload)
        : latestTabletPayload;

    latestTabletPayload = {
        ...latestTabletPayload,
        ...cachedPayload,
    };

    const opened = global.uiState?.open
        ? global.uiState.open("tablet", latestTabletPayload, {
            ...tabletStateOptions(),
            cursor: true,
            chat: false,
            exclusive: true,
            force: false,
        })
        : global.interfaceLock?.openPage?.(
            "tablet",
            latestTabletPayload,
            latestTabletPayload
        );

    if (!opened) return;

    setTabletSubscription(true);
    requestTablet("open", true);
}

(global.bindKey ||
    ((key, hold, cb) =>
        mp.keys.bind(key, hold, cb)))(
    TABLET_KEY,
    false,
    openTablet
);

// ======== Получение данных ========

mp.events.add(
    "client:fraction:tablet:update",
    patchTablet
);

mp.events.add(
    "client:property:tablet:update",
    patchTablet
);

mp.events.add(
    "client:tablet:business:update",
    patchTablet
);

mp.events.add(
    "client:property:tablet:updateLock",
    (propertyId, locked) => {
        const id = Number(propertyId);
        const nextLocked = Boolean(locked);

        patchTablet({
            houses: latestTabletPayload.houses.map((house) =>
                Number(house.id) === id
                    ? {
                        ...house,
                        locked: nextLocked,
                        doorStatus: nextLocked ? "closed" : "open",
                    }
                    : house
            ),
        });
    }
);

// ======== Действия фракционного планшета ========

mp.events.add("tablet:organizationMemberActionFromBrowser", (fractionId, targetUuid, action, confirmed, payload = {}) => {
    if (!confirmed) return;
    remoteFractionAction(
        "server:fraction:tablet:memberAction",
        Number(fractionId),
        Number(targetUuid),
        String(action || ""),
        stringifyPayload(payload)
    );
});

mp.events.add("tablet:organizationBalanceActionFromBrowser", (fractionId, action, confirmed, payload = {}) => {
    if (!confirmed) return;
    remoteFractionAction(
        "server:fraction:tablet:balanceAction",
        Number(fractionId),
        String(action || ""),
        stringifyPayload(payload)
    );
});

mp.events.add("tablet:organizationMassBonusActionFromBrowser", (fractionId, confirmed, payload = {}) => {
    if (!confirmed) return;
    remoteFractionAction(
        "server:fraction:tablet:massBonusAction",
        Number(fractionId),
        stringifyPayload(payload)
    );
});

mp.events.add("tablet:organizationBlacklistAddFromBrowser", (fractionId, confirmed, payload = {}) => {
    if (!confirmed) return;
    remoteFractionAction(
        "server:fraction:tablet:blacklistAdd",
        Number(fractionId),
        stringifyPayload(payload)
    );
});

mp.events.add("tablet:organizationBlacklistRemoveFromBrowser", (fractionId, confirmed, payload = {}) => {
    if (!confirmed) return;
    remoteFractionAction(
        "server:fraction:tablet:blacklistRemove",
        Number(fractionId),
        stringifyPayload(payload)
    );
});

mp.events.add("tablet:organizationPermissionActionFromBrowser", (fractionId, _tab, rankId, permissionId, enabled) => {
    remoteFractionAction(
        "server:fraction:tablet:permission",
        Number(fractionId),
        Number(rankId),
        String(permissionId || ""),
        Boolean(enabled)
    );
});

mp.events.add("tablet:organizationCreateDepartmentFromBrowser", (fractionId, payload = {}) => {
    remoteFractionAction(
        "server:fraction:tablet:createDepartment",
        Number(fractionId),
        stringifyPayload(payload)
    );
});

[
    "tablet:organizationMemberOpenFromBrowser",
    "tablet:organizationBlacklistTabFromBrowser",
    "tablet:organizationSettingsTabFromBrowser",
    "tablet:organizationStorageTabFromBrowser",
    "tablet:organizationBillPayFromBrowser",
    "tablet:organizationDirectionSelectFromBrowser",
    "tablet:organizationDeleteFromBrowser",
    "tablet:organizationSettingsVehicleActionFromBrowser",
    "tablet:organizationSettingsVehicleReturnFromBrowser",
    "tablet:organizationUpgradeSelectFromBrowser",
    "tablet:organizationUpgradeActionFromBrowser",
    "tablet:organizationActionFromBrowser",
].forEach((eventName) => {
    mp.events.add(eventName, () => refreshTablet(eventName));
});

// ======== Ошибки ========

mp.events.add(
    "client:fraction:tablet:error",
    (message) =>
        notify(
            String(message || "Ошибка"),
            "error"
        )
);

mp.events.add(
    "client:property:tablet:error",
    (message) =>
        notify(
            String(message || "Ошибка"),
            "error"
        )
);

// ======== Закрытие ========

mp.events.add(
    "tablet:closeFromBrowser",
    () => {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }
        setTabletSubscription(false);
        global.interfaceLock?.closePage?.(
            "tablet"
        );
    }
);

// ======== Загрузка ========

mp.events.add("playerReady", () => {

    setTimeout(() => {
        requestTablet("playerReady", true);
    }, 2500);

});

setInterval(() => {
    const state = global.interfaceLock?.getInterfaceState?.();
    if (state?.activePage === "tablet") {
        setTabletSubscription(true, true);
        requestTablet("background", false);
    }

}, TABLET_REFRESH_MS);

mp.events.add("interface:lock:closing", (page) => {
    if (page === "tablet" || page === "*") {
        setTabletSubscription(false);
    }
});

console.log("[TABLET] Loaded");
