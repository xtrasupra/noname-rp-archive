"use strict";

const PROPERTY_INTERACT_KEY = 0x45;
let propertyInteraction = null;

function setInteractionPrompt(visible) {
    try { mp.events.call("c:hud:interaction", JSON.stringify(visible ? { key: "E", holdRequired: false } : null)); } catch {}
}

mp.events.add("client:property:interaction", (rawPayload = "null") => {
    let payload = null;
    try { payload = JSON.parse(String(rawPayload)); } catch {}
    if (!payload || payload.contractVersion !== 1 || !["house", "garage", "garageExit"].includes(payload.type)) {
        propertyInteraction = null;
        setInteractionPrompt(false);
        return;
    }
    propertyInteraction = payload;
    setInteractionPrompt(true);
});

const bindKey = global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback));
bindKey(PROPERTY_INTERACT_KEY, false, () => {
    if (!propertyInteraction || global.interfaceLock?.isInputBlocked?.()) return;
    mp.events.callRemote("server:property:interact");
}, { owner: "property", priority: 45 });

// =========================================
// Покупка
// =========================================

mp.events.add("buyHouse", (houseId) => {
    mp.events.callRemote("buyHouse", Number(houseId));
});

// =========================================
// Вход / выход
// =========================================

mp.events.add("enterHouse", (houseId) => {
    mp.events.callRemote(
        "server:property:enterHouse",
        Number(houseId)
    );
});

mp.events.add("exitHouse", () => {
    mp.events.callRemote(
        "server:property:exitHouse"
    );
});

// =========================================
// Гараж
// =========================================

mp.events.add("enterGarage", (houseId, garageIndex) => {
    mp.events.callRemote(
        "server:property:enterGarage",
        Number(houseId),
        Number(garageIndex)
    );
});

function notifyUnsupported(action) {
    try {
        global.interfaceLock?.notify?.(
            `${action} пока не настроено на сервере.`,
            "warning"
        );
    } catch {}
}

mp.events.add("tablet:houseSelectFromBrowser", () => {});
mp.events.add("tablet:apartmentSelectFromBrowser", () => {});
mp.events.add("tablet:houseTabFromBrowser", () => {});
mp.events.add("tablet:apartmentTabFromBrowser", () => {});

// =========================================
// Планшет
// =========================================

// Маршрут

mp.events.add(
    "tablet:houseRouteFromBrowser",
    (houseId) => {

        mp.events.callRemote(
            "server:property:route",
            Number(houseId)
        );

        global.interfaceLock?.closePage?.("tablet");
    }
);

// Закрыть / открыть

mp.events.add(
    "tablet:houseLockToggleFromBrowser",
    (houseId, state) => {

        mp.events.callRemote(
            "server:property:lock",
            Number(houseId),
            Boolean(state)
        );

    }
);

// Войти в дом

mp.events.add(
    "tablet:houseEnterFromBrowser",
    (houseId) => {

        mp.events.call(
            "enterHouse",
            Number(houseId)
        );

        global.interfaceLock?.closePage?.("tablet");
    }
);

// Выйти из дома

mp.events.add(
    "tablet:houseExitFromBrowser",
    () => {

        mp.events.call(
            "exitHouse"
        );

        global.interfaceLock?.closePage?.("tablet");
    }
);

// Войти в гараж

mp.events.add(
    "tablet:houseGarageEnterFromBrowser",
    (houseId, garageIndex = 1) => {

        mp.events.call(
            "enterGarage",
            Number(houseId),
            Number(garageIndex)
        );

        global.interfaceLock?.closePage?.("tablet");
    }
);

[
    "tablet:houseResidentEvictFromBrowser",
    "tablet:apartmentResidentEvictFromBrowser",
    "tablet:houseInteriorApplyFromBrowser",
    "tablet:apartmentInteriorApplyFromBrowser",
    "tablet:houseGarageParkFromBrowser",
    "tablet:houseGarageTakeFromBrowser",
    "tablet:houseGarageAccessFromBrowser",
    "tablet:houseStoragePutFromBrowser",
    "tablet:houseStorageTakeFromBrowser",
    "tablet:houseStorageAccessFromBrowser",
    "tablet:houseActionFromBrowser",
    "tablet:apartmentGarageParkFromBrowser",
    "tablet:apartmentGarageEnterFromBrowser",
    "tablet:apartmentGarageTakeFromBrowser",
    "tablet:apartmentGarageAccessFromBrowser",
    "tablet:apartmentStoragePutFromBrowser",
    "tablet:apartmentStorageTakeFromBrowser",
    "tablet:apartmentStorageAccessFromBrowser",
].forEach((eventName) => {
    mp.events.add(eventName, () => notifyUnsupported(eventName));
});

// =========================================
// GPS
// =========================================

mp.events.add(
    "client:property:setWaypoint",
    (x, y) => {

        mp.game.ui.setNewWaypoint(
            Number(x),
            Number(y)
        );

    }
);

console.log("[PROPERTY CLIENT] Loaded");
