"use strict";

try {
    if (mp.nametags) {
        mp.nametags.enabled = false;
    }
} catch {}

const UNKNOWN_MAX_DISTANCE = 7.5;
const KNOWN_MAX_DISTANCE = 10;
const AIMED_MAX_DISTANCE = 22;
const DUTY_MAX_DISTANCE = 34;
const HARD_MAX_DISTANCE = 36;
const NAME_SCALE = 0.30;
const ID_SCALE = 0.27;
const KNOWN_CROWD_NAME_SCALE = 0.285;
const KNOWN_CROWD_ID_SCALE = 0.25;
const COMPACT_NAME_SCALE = 0.255;
const COMPACT_ID_SCALE = 0.235;
const DUTY_LABEL_SCALE = 0.30;
const VOICE_LABEL_SCALE = 0.225;
const SELF_PREVIEW_KEY = 0x73; // F4
const ALT_KEY = 0x12;
const SELF_PREVIEW_TIME = 3500;
const STATUS_BAR_WIDTH = 0.052;
const STATUS_BAR_HEIGHT = 0.0048;
const CROWD_DISTANCE = 18;
const CROWD_THRESHOLD = 8;
const MAX_DRAWN_NAMETAGS = 34;
const VEHICLE_NAMETAG_SPACING = 0.09;
const VEHICLE_NAMETAG_COLUMN_SPACING = 0.20;
const VEHICLE_NAMETAG_MIN_X = 0.10;
const VEHICLE_NAMETAG_MAX_X = 0.90;
const VEHICLE_NAMETAG_MIN_Y = 0.065;
const VEHICLE_NAMETAG_MAX_Y = 0.88;
const NAMEPLATE_MIN_WIDTH = 0.072;
const NAMEPLATE_MAX_WIDTH = 0.19;
const NAMEPLATE_HEIGHT = 0.041;
const VOICE_BADGE_WIDTH = 0.044;
const VOICE_BADGE_HEIGHT = 0.015;

let knownPlayers = new Set();
let knowsEveryone = false;
let selfPreviewUntil = 0;

function parseJson(value, fallback = []) {
    try {
        if (!value) return fallback;
        if (Array.isArray(value)) return value;
        if (typeof value === "object") return value;
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function getVariable(entity, key, fallback = null) {
    try {
        const value = entity?.getVariable?.(key);
        return value === undefined || value === null ? fallback : value;
    } catch {
        return fallback;
    }
}

function getLocalAdminLevel() {
    return Number(
        getVariable(mp.players.local, "nametag:adminLevel", 0) ||
        getVariable(mp.players.local, "adminLevel", 0) ||
        getVariable(mp.players.local, "admin", 0) ||
        0
    ) || 0;
}

function getPlayerUuid(player) {
    return Number(
        getVariable(player, "nametag:uuid", 0) ||
        getVariable(player, "uuid", 0) ||
        0
    ) || 0;
}

function getPlayerName(player) {
    return String(
        getVariable(player, "nametag:name", "") ||
        player?.name ||
        ""
    ).trim();
}

function getPlayerAdminLevel(player) {
    return Number(
        getVariable(player, "nametag:adminLevel", 0) ||
        getVariable(player, "adminLevel", 0) ||
        getVariable(player, "admin", 0) ||
        0
    ) || 0;
}

function isAdminDuty(player) {
    return Boolean(
        getVariable(player, "nametag:adminDuty", false) ||
        getVariable(player, "adminDuty", false)
    );
}

function getAdminDutyLabel(player) {
    return String(
        getVariable(player, "nametag:adminDutyLabel", "") ||
        getVariable(player, "adminDutyLabel", "") ||
        "Администратор проекта"
    ).trim();
}

function isKnown(player) {
    if (player === mp.players.local) return true;
    if (knowsEveryone || getLocalAdminLevel() > 0) return true;

    const uuid = getPlayerUuid(player);
    return uuid > 0 && knownPlayers.has(uuid);
}

function worldToScreen(position) {
    try {
        return mp.game.graphics.world3dToScreen2d(
            new mp.Vector3(position.x, position.y, position.z)
        );
    } catch {
        return null;
    }
}

function getVehicleForPlayer(player) {
    try {
        if (player?.vehicle) return player.vehicle;
    } catch {}

    return null;
}

function isPlayerInVehicle(player) {
    try {
        if (player?.vehicle) return true;
        if (typeof player.isInAnyVehicle === "function") return Boolean(player.isInAnyVehicle(false));
        if (typeof player.isSittingInAnyVehicle === "function") return Boolean(player.isSittingInAnyVehicle());
    } catch {}

    return false;
}

function getNametagWorldPosition(player, distance = 0) {
    const vehicle = getVehicleForPlayer(player);

    if (isPlayerInVehicle(player) && vehicle?.position) {
        return {
            x: vehicle.position.x,
            y: vehicle.position.y,
            z: vehicle.position.z + 1.65,
        };
    }

    if (distance > 16 && player?.position) {
        return {
            x: player.position.x,
            y: player.position.y,
            z: player.position.z + 1.18,
        };
    }

    try {
        const headPos = player.getBoneCoords(12844, 0, 0, 0);
        return {
            x: headPos.x,
            y: headPos.y,
            z: headPos.z + 0.38,
        };
    } catch {}

    return {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z + 1.18,
    };
}

function getStablePlayerOrder(player) {
    const remoteId = Number(player?.remoteId);
    if (Number.isFinite(remoteId)) return remoteId;

    const id = Number(player?.id);
    return Number.isFinite(id) ? id : 0;
}

function prepareNametagScreens(entries) {
    const vehicleGroups = new Map();

    entries.forEach((entry) => {
        entry.screen = worldToScreen(getNametagWorldPosition(entry.player, entry.distance));
        if (!entry.screen) return;

        const vehicle = getVehicleForPlayer(entry.player);
        if (!vehicle || !isPlayerInVehicle(entry.player)) return;

        const occupants = vehicleGroups.get(vehicle);
        if (occupants) {
            occupants.push(entry);
        } else {
            vehicleGroups.set(vehicle, [entry]);
        }
    });

    vehicleGroups.forEach((occupants) => {
        if (occupants.length < 2) return;

        occupants.sort((a, b) => getStablePlayerOrder(a.player) - getStablePlayerOrder(b.player));

        const averageX = occupants.reduce((sum, entry) => sum + entry.screen.x, 0) / occupants.length;
        const averageY = occupants.reduce((sum, entry) => sum + entry.screen.y, 0) / occupants.length;
        const availableHeight = VEHICLE_NAMETAG_MAX_Y - VEHICLE_NAMETAG_MIN_Y;
        const maximumRows = Math.floor(availableHeight / VEHICLE_NAMETAG_SPACING) + 1;
        const columnCount = Math.ceil(occupants.length / maximumRows);
        const rowCount = Math.ceil(occupants.length / columnCount);
        const rowSpacing = Math.min(
            VEHICLE_NAMETAG_SPACING,
            availableHeight / Math.max(1, rowCount - 1)
        );
        const totalHeight = rowSpacing * (rowCount - 1);
        const maximumStartY = Math.max(VEHICLE_NAMETAG_MIN_Y, VEHICLE_NAMETAG_MAX_Y - totalHeight);
        const startY = Math.max(
            VEHICLE_NAMETAG_MIN_Y,
            Math.min(maximumStartY, averageY - totalHeight / 2)
        );

        const availableWidth = VEHICLE_NAMETAG_MAX_X - VEHICLE_NAMETAG_MIN_X;
        const columnSpacing = Math.min(
            VEHICLE_NAMETAG_COLUMN_SPACING,
            availableWidth / Math.max(1, columnCount - 1)
        );
        const totalWidth = columnSpacing * (columnCount - 1);
        const maximumStartX = Math.max(VEHICLE_NAMETAG_MIN_X, VEHICLE_NAMETAG_MAX_X - totalWidth);
        const startX = Math.max(
            VEHICLE_NAMETAG_MIN_X,
            Math.min(maximumStartX, averageX - totalWidth / 2)
        );

        occupants.forEach((entry, index) => {
            const columnIndex = Math.floor(index / rowCount);
            const rowIndex = index % rowCount;

            entry.screen = {
                x: startX + columnSpacing * columnIndex,
                y: startY + rowSpacing * rowIndex,
            };
        });
    });
}

function getNametagMaxDistance(entry) {
    if (entry.duty) return DUTY_MAX_DISTANCE;
    if (entry.aimed) return AIMED_MAX_DISTANCE;
    if (entry.speaking) return 18;
    if (entry.known) return KNOWN_MAX_DISTANCE;
    return UNKNOWN_MAX_DISTANCE;
}

function drawText(text, x, y, scale, color = [255, 255, 255, 235]) {
    try {
        mp.game.graphics.drawText(String(text), [x, y], {
            font: 4,
            color,
            scale: [scale, scale],
            outline: true,
            centre: true,
        });
    } catch {}
}

function drawRect(x, y, width, height, color) {
    try {
        mp.game.graphics.drawRect(x, y, width, height, color[0], color[1], color[2], color[3]);
    } catch {}
}

function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, Number(value) || 0));
}

function getPlayerHealthPercent(player) {
    let health = 0;

    try {
        if (typeof player.getHealth === "function") {
            health = Number(player.getHealth());
        } else if (typeof player.health !== "undefined") {
            health = Number(player.health);
        }
    } catch {}

    if (health > 100) {
        health -= 100;
    }

    return clamp(health / 100);
}

function getPlayerArmorPercent(player) {
    let armor = 0;

    try {
        if (typeof player.getArmour === "function") {
            armor = Number(player.getArmour());
        } else if (typeof player.getArmor === "function") {
            armor = Number(player.getArmor());
        } else if (typeof player.armour !== "undefined") {
            armor = Number(player.armour);
        } else if (typeof player.armor !== "undefined") {
            armor = Number(player.armor);
        }
    } catch {}

    return clamp(armor / 100);
}

function isAimingAtPlayer(player) {
    if (!player || !player.handle) return false;

    try {
        if (typeof mp.game.player.isFreeAimingAtEntity === "function") {
            return Boolean(mp.game.player.isFreeAimingAtEntity(player.handle));
        }
    } catch {}

    return false;
}

function drawStatusBars(x, y, player, alpha = 230) {
    const health = getPlayerHealthPercent(player);
    const armor = getPlayerArmorPercent(player);

    const bgAlpha = Math.max(90, alpha - 80);
    const borderAlpha = Math.max(110, alpha - 50);

    drawRect(x, y, STATUS_BAR_WIDTH + 0.004, STATUS_BAR_HEIGHT + 0.004, [0, 0, 0, borderAlpha]);
    drawRect(x, y, STATUS_BAR_WIDTH, STATUS_BAR_HEIGHT, [18, 18, 24, bgAlpha]);
    drawRect(
        x - STATUS_BAR_WIDTH / 2 + (STATUS_BAR_WIDTH * health) / 2,
        y,
        STATUS_BAR_WIDTH * health,
        STATUS_BAR_HEIGHT,
        [80, 225, 110, alpha]
    );

    if (armor <= 0) return;

    const armorY = y + 0.008;

    drawRect(x, armorY, STATUS_BAR_WIDTH + 0.004, STATUS_BAR_HEIGHT + 0.004, [0, 0, 0, borderAlpha]);
    drawRect(x, armorY, STATUS_BAR_WIDTH, STATUS_BAR_HEIGHT, [18, 18, 24, bgAlpha]);
    drawRect(
        x - STATUS_BAR_WIDTH / 2 + (STATUS_BAR_WIDTH * armor) / 2,
        armorY,
        STATUS_BAR_WIDTH * armor,
        STATUS_BAR_HEIGHT,
        [78, 160, 255, alpha]
    );
}

function withAlpha(color, alpha) {
    return [
        color[0],
        color[1],
        color[2],
        Math.max(0, Math.min(255, Math.round(alpha))),
    ];
}

function isPlayerSpeaking(player) {
    try {
        if (global.twinkleVoiceState?.isTalking?.(player)) return true;
    } catch {}

    return Boolean(getVariable(player, "voiceActive", false));
}

function getNameplateWidth(title, compact) {
    const estimated = 0.038 + String(title || "").length * (compact ? 0.00315 : 0.00355);
    return Math.max(NAMEPLATE_MIN_WIDTH, Math.min(NAMEPLATE_MAX_WIDTH, estimated));
}

function drawVoiceBadge(x, y, alpha, mode = "local") {
    const accent = mode === "admin"
        ? [255, 88, 108, alpha]
        : [196, 74, 255, alpha];

    drawRect(x, y, VOICE_BADGE_WIDTH, VOICE_BADGE_HEIGHT, [7, 8, 13, Math.max(120, alpha - 55)]);
    drawRect(x - VOICE_BADGE_WIDTH / 2 + 0.003, y, 0.003, VOICE_BADGE_HEIGHT - 0.004, accent);
    drawText("MIC", x + 0.003, y - 0.007, VOICE_LABEL_SCALE, accent);
}

function getNametagLines(player) {
    const uuid = getPlayerUuid(player);
    const remoteId = Number(player.remoteId ?? player.id ?? 0);
    const adminLevel = getPlayerAdminLevel(player);

    if (!isKnown(player)) {
        return {
            title: `[${remoteId}]`,
            subtitle: `#${uuid || remoteId}`,
            adminLevel,
            color: [230, 230, 238, 230],
            accent: [205, 205, 220, 210],
        };
    }

    const name = getPlayerName(player) || `Player_${uuid || remoteId}`;

    return {
        title: `${name} [${remoteId}]`,
        subtitle: `#${uuid || remoteId}`,
        adminLevel,
        color: [245, 245, 255, 240],
        accent: [205, 205, 220, 220],
    };
}

function canDrawPlayer(player) {
    if (!player || player === mp.players.local) return false;
    if (!mp.players.exists(player)) return false;
    if (!player.handle) return false;
    if (getVariable(player, "InDeath", false)) return false;

    return true;
}

function drawPlayerNametag(player, alpha = 245, options = {}) {
    const screen = options.screen === undefined
        ? worldToScreen(getNametagWorldPosition(player, Number(options.distance || 0)))
        : options.screen;

    if (!screen) return;

    const lines = getNametagLines(player);
    const duty = isAdminDuty(player);
    const dutyLabel = getAdminDutyLabel(player);
    const known = isKnown(player);
    const speaking = isPlayerSpeaking(player);
    const voiceMode = String(getVariable(player, "voiceMode", "local") || "local");
    const isCrowd = Boolean(options.crowd);
    const forcedFull = Boolean(options.forceFull || options.showStatus || duty || speaking);
    const compact = isCrowd && !known && !forcedFull;
    const knownCrowd = isCrowd && known && !forcedFull;
    const nameScale = compact ? COMPACT_NAME_SCALE : knownCrowd ? KNOWN_CROWD_NAME_SCALE : NAME_SCALE;
    const idScale = compact ? COMPACT_ID_SCALE : knownCrowd ? KNOWN_CROWD_ID_SCALE : ID_SCALE;
    const titleY = screen.y;
    const subtitleY = screen.y + (compact ? 0.015 : knownCrowd ? 0.017 : 0.019);
    const statusY = screen.y + (speaking ? 0.061 : compact ? 0.042 : knownCrowd ? 0.046 : 0.049);
    const safeAlpha = Math.max(45, Math.min(245, Math.round(alpha)));
    const plateWidth = getNameplateWidth(lines.title, compact);
    const plateCenterY = screen.y + 0.008;

    drawRect(
        screen.x,
        plateCenterY,
        plateWidth,
        NAMEPLATE_HEIGHT,
        [7, 8, 13, Math.max(70, Math.round(safeAlpha * 0.62))]
    );
    drawRect(
        screen.x,
        screen.y - 0.0115,
        Math.min(0.034, plateWidth * 0.36),
        0.0025,
        [196, 74, 255, Math.max(90, safeAlpha - 20)]
    );

    if (duty && dutyLabel) {
        drawText(dutyLabel, screen.x, screen.y - 0.027, DUTY_LABEL_SCALE, [
            255,
            70,
            70,
            safeAlpha,
        ]);
    }

    const titleColor = compact
        ? [190, 190, 205, Math.max(70, safeAlpha - 35)]
        : withAlpha(lines.color, safeAlpha);

    drawText(lines.title, screen.x, titleY, nameScale, titleColor);

    const subtitleColor = compact
        ? [155, 155, 170, Math.max(55, safeAlpha - 55)]
        : withAlpha(lines.accent, Math.max(70, safeAlpha - 25));

    drawText(lines.subtitle, screen.x, subtitleY, idScale, subtitleColor);

    if (speaking) {
        drawVoiceBadge(screen.x, screen.y + 0.043, safeAlpha, voiceMode);
    }

    if (options.showStatus) {
        drawStatusBars(screen.x, statusY, player, safeAlpha);
    }
}

function showSelfNametagPreview() {
    // F4 is reserved for waypoint teleport while an administrator is online.
    if (getLocalAdminLevel() > 0) return;

    try {
        if (mp.keys.isDown(ALT_KEY)) return;
        if (typeof global.isInputBlocked === "function" && global.isInputBlocked()) return;
    } catch {}

    selfPreviewUntil = Date.now() + SELF_PREVIEW_TIME;

    try {
        if (global.ui?.notify) {
            global.ui.notify("Ваш nametag показан на 3 секунды.", "info");
        }
    } catch {}
}

mp.events.add("nametags:updateKnown", (raw = "[]") => {
    const list = parseJson(raw, []);

    knowsEveryone = Array.isArray(list) && list.includes("*");
    knownPlayers = new Set(
        Array.isArray(list)
            ? list.map((id) => Number(id)).filter(Boolean)
            : []
    );
});

mp.events.add("playerReady", () => {
    try {
        mp.events.callRemote("nametags:server:refreshKnown");
    } catch {}
});

if (typeof global.bindKey === "function") {
    global.bindKey(SELF_PREVIEW_KEY, false, showSelfNametagPreview, {
        allowWhenBlocked: false,
        closeChatBefore: false,
        allowWhenInputFocused: false,
    });
} else {
    mp.keys.bind(SELF_PREVIEW_KEY, false, showSelfNametagPreview);
}

mp.events.add("render", () => {
    if (global.__TWINKLE_GAMEPLAY_OVERLAYS_SUPPRESSED__) return;

    const localPlayer = mp.players.local;
    if (!localPlayer || !localPlayer.handle) return;

    const localPos = localPlayer.position;
    const entries = [];

    if (Date.now() < selfPreviewUntil) {
        drawPlayerNametag(localPlayer, 245, { showStatus: false });
    }

    mp.players.forEachInStreamRange((player) => {
        if (!canDrawPlayer(player)) return;

        const pos = player.position;
        const distance = mp.game.system.vdist(localPos.x, localPos.y, localPos.z, pos.x, pos.y, pos.z);

        if (distance > HARD_MAX_DISTANCE) return;

        const entry = {
            player,
            distance,
            known: isKnown(player),
            duty: isAdminDuty(player),
            aimed: isAimingAtPlayer(player),
            speaking: isPlayerSpeaking(player),
        };

        if (distance > getNametagMaxDistance(entry)) return;

        try {
            const inVehicle = isPlayerInVehicle(player);
            if (!inVehicle && typeof player.hasClearLosTo === "function" && !player.hasClearLosTo(localPlayer.handle, 17)) {
                return;
            }
        } catch {}

        entries.push(entry);
    });

    const crowdCount = entries.filter((entry) => entry.distance <= CROWD_DISTANCE).length;
    const isCrowd = crowdCount >= CROWD_THRESHOLD;

    entries.sort((a, b) => {
        const weightA =
            (a.aimed ? 10000 : 0) +
            (a.duty ? 5000 : 0) +
            (a.speaking ? 3000 : 0) +
            (a.known ? 1500 : 0) -
            a.distance;
        const weightB =
            (b.aimed ? 10000 : 0) +
            (b.duty ? 5000 : 0) +
            (b.speaking ? 3000 : 0) +
            (b.known ? 1500 : 0) -
            b.distance;

        return weightB - weightA;
    });

    const visibleEntries = entries.slice(0, MAX_DRAWN_NAMETAGS);
    prepareNametagScreens(visibleEntries);

    visibleEntries.forEach((entry) => {
        const entryMaxDistance = getNametagMaxDistance(entry);
        let alpha = Math.max(70, Math.min(245, 245 - (entry.distance / entryMaxDistance) * 145));

        if (isCrowd && !entry.known && !entry.duty && !entry.aimed) {
            alpha = Math.max(48, alpha * 0.68);
        }

        if (isCrowd && entry.distance > CROWD_DISTANCE && !entry.known && !entry.duty && !entry.aimed) {
            alpha = Math.max(38, alpha * 0.58);
        }

        drawPlayerNametag(entry.player, alpha, {
            crowd: isCrowd,
            showStatus: entry.aimed,
            forceFull: entry.aimed,
            distance: entry.distance,
            screen: entry.screen,
        });
    });
});

console.log("[NAMETAGS CLIENT] Loaded");
