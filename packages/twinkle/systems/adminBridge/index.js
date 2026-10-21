"use strict";

const http = require("http");
const registry = require("./registry-runtime.js");
const logsDb = require("../../database/logs.js");

const BRIDGE_HOST = process.env.TWINKLE_BRIDGE_HOST || "127.0.0.1";
const BRIDGE_PORT = Number(process.env.TWINKLE_BRIDGE_PORT || 4010);
const BRIDGE_TOKEN = process.env.TWINKLE_BRIDGE_TOKEN || "EUTWINKLE01TEST";

const tempMapBlips = new Map();
const tempGameBlips = new Map();
let nextTempBlipId = 1;

function sendJson(res, status, data) {
    const body = JSON.stringify(data);

    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
    });

    res.end(body);
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let raw = "";

        req.on("data", (chunk) => {
            raw += chunk;

            if (raw.length > 1024 * 1024) {
                reject(new Error("Payload too large"));
                req.destroy();
            }
        });

        req.on("end", () => {
            if (!raw) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(error);
            }
        });

        req.on("error", reject);
    });
}

function checkAuth(req) {
    return req.headers["x-bridge-token"] === BRIDGE_TOKEN;
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function toStringSafe(value, fallback = "") {
    if (value === undefined || value === null) return fallback;
    return String(value).trim();
}

function normalizeBlip(body, id = null) {
    const name = toStringSafe(body.name);

    if (!name) {
        const error = new Error("Название метки обязательно");
        error.status = 400;
        throw error;
    }

    const x = toNumber(body.x, NaN);
    const y = toNumber(body.y, NaN);
    const z = toNumber(body.z, 0);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        const error = new Error("Некорректные координаты x/y");
        error.status = 400;
        throw error;
    }

    const sprite = Math.max(1, Math.floor(toNumber(body.sprite ?? body.icon, 1)));
    const icon = Math.max(1, Math.floor(toNumber(body.icon ?? body.sprite, sprite)));

    return {
        id: id ?? nextTempBlipId++,
        name: name.slice(0, 96),
        description: toStringSafe(body.description, "").slice(0, 255),
        x,
        y,
        z,
        icon,
        sprite,
        type: toStringSafe(body.type, "custom"),
        group: toStringSafe(body.group || body.groupName || body.category, "Другое").slice(0, 64),
        createdBy: toStringSafe(body.createdBy, "web-admin"),
        updatedBy: toStringSafe(body.updatedBy, "web-admin"),
        createdAt: body.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function destroyTempGameBlip(id) {
    const blip = tempGameBlips.get(Number(id));

    if (blip && mp.blips.exists(blip)) {
        blip.destroy();
    }

    tempGameBlips.delete(Number(id));
}

function createTempGameBlip(data) {
    const id = Number(data.id);

    if (!Number.isFinite(id)) return;

    destroyTempGameBlip(id);

    const blip = mp.blips.new(
        Number(data.sprite || data.icon || 1),
        new mp.Vector3(
            Number(data.x || 0),
            Number(data.y || 0),
            Number(data.z || 0)
        ),
        {
            name: String(data.name || "Web Blip"),
            shortRange: true,
            scale: Number(data.scale || 0.9),
            color: Number(data.color || 0),
        }
    );

    tempGameBlips.set(id, blip);
}

function createTempBlip(body) {
    const blip = normalizeBlip(body);

    tempMapBlips.set(blip.id, blip);
    createTempGameBlip(blip);

    return blip;
}

function updateTempBlip(id, body) {
    const oldBlip = tempMapBlips.get(Number(id));

    if (!oldBlip) {
        const error = new Error("Метка не найдена");
        error.status = 404;
        throw error;
    }

    const blip = normalizeBlip(
        {
            ...oldBlip,
            ...body,
            createdAt: oldBlip.createdAt,
        },
        Number(id)
    );

    tempMapBlips.set(Number(id), blip);
    createTempGameBlip(blip);

    return blip;
}

function deleteTempBlip(id) {
    const numericId = Number(id);

    if (!tempMapBlips.has(numericId)) {
        const error = new Error("Метка не найдена");
        error.status = 404;
        throw error;
    }

    tempMapBlips.delete(numericId);
    destroyTempGameBlip(numericId);

    return true;
}

function clearTempBlips() {
    const count = tempMapBlips.size;

    for (const id of tempMapBlips.keys()) {
        destroyTempGameBlip(id);
    }

    tempMapBlips.clear();

    return count;
}

function getPlayersList() {
    const players = [];

    mp.players.forEach((player) => {
        players.push({
            id: player.id,
            name: player.name,
            socialClub: player.socialClub,
            ping: player.ping,
            ip: player.ip,
            dimension: player.dimension,
            health: player.health,
            armour: player.armour,
            adminLvl:
                player.adminLvl ||
                player.adminLevel ||
                player.getVariable?.("adminLvl") ||
                player.getVariable?.("adminLevel") ||
                0,
            staticId:
                player.staticId ||
                player.sqlId ||
                player.dbid ||
                player.character?.id ||
                player.characterData?.id ||
                null,
        });
    });

    return players;
}

function findPlayerById(id) {
    const playerId = Number(id);

    if (!Number.isFinite(playerId)) {
        return null;
    }

    return mp.players.at(playerId) || null;
}

async function handleRequest(req, res) {
    try {
        if (!checkAuth(req)) {
            sendJson(res, 401, {
                ok: false,
                message: "Unauthorized",
            });
            return;
        }

        const url = new URL(req.url, `http://${req.headers.host}`);

        if (req.method === "GET" && url.pathname === "/health") {
            sendJson(res, 200, {
                ok: true,
                name: "Twinkle RP RAGE Bridge",
                online: mp.players.length,
                uptime: process.uptime(),
                tempMapBlips: tempMapBlips.size,
            });
            return;
        }

        if (req.method === "GET" && url.pathname === "/players") {
            sendJson(res, 200, {
                ok: true,
                online: mp.players.length,
                players: getPlayersList(),
            });
            return;
        }

        if (req.method === "GET" && url.pathname === "/ghetto/client-status") {
            const statuses = [];
            const source = global.ghettoClientStatuses;

            if (source && typeof source.entries === "function") {
                for (const [playerId, status] of source.entries()) {
                    const player = mp.players.at(Number(playerId));
                    statuses.push({
                        playerId: Number(playerId),
                        name: player?.name || `Player #${playerId}`,
                        ...status,
                    });
                }
            }

            sendJson(res, 200, {
                ok: true,
                expectedZones: 90,
                statuses,
            });
            return;
        }

        if (req.method === "POST" && url.pathname === "/fractions/reload") {
            const body = await readJson(req);
            const ghetto = require("../fractions/ghetto/ghetto.service.js");
            await ghetto.loadZones();
            const zones = ghetto.snapshot();
            ghetto.syncZoneIds(zones.map((zone) => zone.id));
            sendJson(res, 200, {
                ok: true,
                fractionId: Number(body.fractionId || 0),
                ghettoZonesUpdated: zones.length,
            });
            return;
        }

        if (req.method === "POST" && url.pathname === "/fractions/refresh") {
            const body = await readJson(req);
            const fractionId = Number(body.fractionId || 0);
            if (!fractionId) throw new Error("Некорректный ID фракции");
            const fractions = require("../fractions/fraction.service.js");
            await fractions.updateOnlineFraction(fractionId);
            sendJson(res, 200, { ok: true, fractionId });
            return;
        }

        if (req.method === "POST" && url.pathname === "/discord/settings/reload") {
            const discord = require("../discord/discordBridge.js");
            await discord.reloadSettings();
            sendJson(res, 200, { ok: true });
            return;
        }

        if (req.method === "GET" && url.pathname === "/registry/snapshot") {
            sendJson(res, 200, registry.snapshot());
            return;
        }

        if (req.method === "GET" && url.pathname === "/factory") {
            sendJson(res, 200, { ok: true, factory: registry.factorySnapshot() });
            return;
        }

        const factoryMatch = url.pathname.match(/^\/factory\/(commands|items|fractions|jobs|workflows)(?:\/([^/]+))?$/);

        if (factoryMatch && (req.method === "POST" || req.method === "PUT")) {
            const body = await readJson(req);
            const item = await registry.upsertFactory(factoryMatch[1], body);
            sendJson(res, 200, { ok: true, item, factory: registry.factorySnapshot() });
            return;
        }

        if (factoryMatch && req.method === "DELETE" && factoryMatch[2]) {
            await registry.deleteFactory(factoryMatch[1], decodeURIComponent(factoryMatch[2]));
            sendJson(res, 200, { ok: true, factory: registry.factorySnapshot() });
            return;
        }

        const registryEventMatch = url.pathname.match(/^\/registry\/events\/([a-f0-9]+)$/);

        if (registryEventMatch && req.method === "GET") {
            const event = registry.getEvent(registryEventMatch[1]);
            sendJson(res, event ? 200 : 404, event || { ok: false, message: "Событие не найдено" });
            return;
        }

        const registryEventActionMatch = url.pathname.match(
            /^\/registry\/events\/([a-f0-9]+)\/(validate|publish|rollback)$/
        );

        if (registryEventActionMatch && req.method === "POST") {
            const [, eventId, action] = registryEventActionMatch;
            const body = await readJson(req);
            let result;

            if (action === "validate") {
                result = registry.validateEvent(eventId, body.code);
            } else if (action === "publish") {
                result = registry.publishEvent(eventId, body.code, body.enabled, body.author);
            } else {
                result = registry.rollbackEvent(eventId);
            }

            sendJson(res, 200, { ok: true, event: result });
            return;
        }

        const registryBlipMatch = url.pathname.match(/^\/registry\/blips\/(\d+)$/);

        if (registryBlipMatch && req.method === "PATCH") {
            const body = await readJson(req);
            const blip = registry.updateBlip(Number(registryBlipMatch[1]), body);
            sendJson(res, 200, { ok: true, blip });
            return;
        }

        if (req.method === "POST" && url.pathname === "/notify") {
            const body = await readJson(req);
            const text = String(body.text || "").trim();

            if (!text) {
                sendJson(res, 400, {
                    ok: false,
                    message: "Text is required",
                });
                return;
            }

            mp.players.broadcast(`[ADMIN] ${text}`);

            sendJson(res, 200, {
                ok: true,
            });
            return;
        }

        if (req.method === "POST" && url.pathname === "/player/kick") {
            const body = await readJson(req);
            const player = findPlayerById(body.playerId);

            if (!player) {
                sendJson(res, 404, {
                    ok: false,
                    message: "Player not found",
                });
                return;
            }

            const reason = String(body.reason || "Kicked by admin panel");
            logsDb.setPlayerQuitReason(player, "admin_kick", reason);
            player.kick(reason);

            sendJson(res, 200, {
                ok: true,
            });
            return;
        }

        if (req.method === "GET" && url.pathname === "/map/blips") {
            const blips = Array.from(tempMapBlips.values()).sort((a, b) => b.id - a.id);

            sendJson(res, 200, {
                ok: true,
                items: blips,
                blips,
            });
            return;
        }

        if (req.method === "POST" && url.pathname === "/map/blips") {
            const body = await readJson(req);
            const blip = createTempBlip(body);

            sendJson(res, 201, {
                ok: true,
                message: "Временная метка создана",
                id: blip.id,
                blip,
            });
            return;
        }

        const blipIdMatch = url.pathname.match(/^\/map\/blips\/(\d+)$/);

        if (blipIdMatch && req.method === "PATCH") {
            const body = await readJson(req);
            const blip = updateTempBlip(Number(blipIdMatch[1]), body);

            sendJson(res, 200, {
                ok: true,
                message: "Временная метка обновлена",
                blip,
            });
            return;
        }

        if (blipIdMatch && req.method === "DELETE") {
            const deleted = deleteTempBlip(Number(blipIdMatch[1]));

            sendJson(res, 200, {
                ok: true,
                message: "Временная метка удалена",
                deleted,
            });
            return;
        }

        if (req.method === "DELETE" && url.pathname === "/map/blips") {
            const deleted = clearTempBlips();

            sendJson(res, 200, {
                ok: true,
                message: "Временные метки очищены",
                deleted,
            });
            return;
        }

        sendJson(res, 404, {
            ok: false,
            message: "Not found",
        });
    } catch (error) {
        sendJson(res, error.status || 500, {
            ok: false,
            message: error.message || "Bridge error",
        });
    }
}

function startBridge() {
    const server = http.createServer(handleRequest);

    server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
        console.log(`[ADMIN_BRIDGE] Started http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
    });

    server.on("error", (error) => {
        console.log(`[ADMIN_BRIDGE] Error: ${error.message}`);
    });
}

startBridge();
