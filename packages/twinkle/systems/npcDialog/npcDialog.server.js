"use strict";

const NPCS = require("./npcDialog.config.js");
const chat = require("../chat/chat.service.js");
const inventory = require("../inventory/inventory.service.js");
const licenses = require("../licenses/license.service.js");
const documents = require("../documents/document.service.js");
const logs = require("../../database/logs.js");
const drivingSchool = require("../drivingSchool/drivingSchool.server.js");
const businessService = require("../business/business.service.js");
const { formatCartPurchaseNotification } = require("../business/business.notification.js");
const quests = require("../quests/quest.service.js");
const autoService = require("../autoService/autoService.server.js");

const taxi = require("../jobs/taxi/taxi.server.js");
const delivery = require("../jobs/delivery/delivery.service.js");
const trucker = require("../jobs/trucker/trucker.service.js");
const mining = require("../jobs/mining/mining.service.js");
const forestry = require("../jobs/forestry/forestry.service.js");
const armoredCollector = require("../jobs/armoredCollector/armoredCollector.service.js");
const initialCargoLoader = require("../jobs/cargoLoader/cargoLoader.service.js");

function getCargoLoader() {
    return global.__twinkleCargoLoaderService || initialCargoLoader;
}

try {
    global.__twinkleNpcDialogRuntime?.shutdown?.();
} catch (error) {
    console.error("[NPC_DIALOG] Previous runtime shutdown failed:", error);
}

const npcDialogRuntime = { active: true, events: [], shutdown: null };
global.__twinkleNpcDialogRuntime = npcDialogRuntime;

const commercePurchaseLocks = global.__twinkleCommercePurchaseLocks || {};
if (!(commercePurchaseLocks.fishing instanceof Set)) commercePurchaseLocks.fishing = new Set();
if (!(commercePurchaseLocks.hunting instanceof Set)) commercePurchaseLocks.hunting = new Set();
global.__twinkleCommercePurchaseLocks = commercePurchaseLocks;

function registerNpcEvent(name, handler) {
    const guarded = (...args) => npcDialogRuntime.active ? handler(...args) : undefined;
    mp.events.add(name, guarded);
    npcDialogRuntime.events.push({ name, handler: guarded });
    return guarded;
}

const activeNpcByPlayer = new Map();
const activeNodeByPlayer = new Map();
const npcEntities = [];
const huntingPurchaseLocks = commercePurchaseLocks.hunting;
const huntingShopSessions = new Map();

const HUNTING_SHOP = {
    hunting_rifle: { amount: 1, price: 1500, name: "Пневматическая винтовка", icon: "rifle", description: "Убивает животное с двух подтверждённых сервером выстрелов." },
    hunting_ammo: { amount: 10, price: 250, name: "Патроны", icon: "ammo", description: "Комплект из 10 охотничьих патронов." },
    hunting_sniper_ammo: { amount: 10, price: 450, name: "Снайперские патроны", icon: "ammo", description: "Комплект из 10 патронов только для охотничьей винтовки с прицелом." },
    hunting_knife: { amount: 1, price: 350, name: "Охотничий нож", icon: "knife", description: "Три удара по животному. При успешной разделке теряет 5% прочности." },
    hunting_flashlight: { amount: 1, price: 200, name: "Охотничий фонарик", icon: "flashlight", description: "Ручной фонарик для ночной охоты." },
    hunting_rope: { amount: 1, price: 120, name: "Охотничья верёвка", icon: "rope", description: "Мини-игра расходует одну, автоматическая разделка — три." },
    hunting_bag: { amount: 1, price: 100, name: "Мешок для туши", icon: "bag", description: "Мини-игра расходует один, автоматическая разделка — три." },
    water: { amount: 1, price: 35, name: "Вода", icon: "water", description: "Запас воды для долгой охоты." },
    burger: { amount: 1, price: 55, name: "Еда", icon: "food", description: "Паёк охотника." },
    hunting_tent: { amount: 1, price: 2500, name: "Охотничья палатка", icon: "tent", description: "Личное переносное хранилище для мешков с тушами." },
    hunting_camo: { amount: 1, price: 400, name: "Набор маскировки", icon: "camo", description: "Временно уменьшает дистанцию реакции животных." },
    hunting_stimulant: { amount: 1, price: 650, name: "Охотничий стимулятор", icon: "stimulant", description: "На 2 минуты даёт +20 HP и персональную слышимость животных." },
    hunting_rifle_scoped: { amount: 1, price: 4500, name: "Охотничья снайперская винтовка", icon: "rifle", description: "Настоящий оптический прицел; пригодная туша с одного подтверждённого выстрела. Открыта для теста.", unlocked: true, testAvailable: true },
    hunting_mask_suit: { amount: 1, price: 2800, name: "Маскхалат", icon: "camo", description: "Снижает заметность. Занимает слот одежды и теряет 20% прочности при каждом надевании. Открыт для теста.", unlocked: true, testAvailable: true },
};

function getHuntingService() {
    return global.twinkleHunting || require("../hunting/hunting.js");
}

function getFishingService() {
    return global.twinkleFishing || require("../fishing/fishing.js");
}

function getDistance(a, b) {
    if (!a || !b) return Number.MAX_SAFE_INTEGER;

    const dx = Number(a.x || 0) - Number(b.x || 0);
    const dy = Number(a.y || 0) - Number(b.y || 0);
    const dz = Number(a.z || 0) - Number(b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getPlayerUuid(player) {
    return Number(
        player?.uuid ||
        player?.characterId ||
        player?.character?.uuid ||
        player?.characterData?.uuid ||
        player?.getVariable?.("uuid") ||
        0
    );
}

function getPlayerCash(player) {
    return Number(
        player?.character?.cash ??
        player?.characterData?.cash ??
        player?.getVariable?.("cash") ??
        0
    );
}

function syncPlayerCash(player, value) {
    const cash = Number(value || 0);

    if (player.character) player.character.cash = cash;
    if (player.characterData) player.characterData.cash = cash;

    try {
        player.setVariable("cash", cash);
    } catch {}

    try {
        player.call("c:hud:update", [JSON.stringify({ player: { cash } })]);
    } catch {}
}

function notifyInfo(player, message) {
    if (!player || !message) return;

    try {
        player.call("client:notification", ["info", String(message)]);
        return;
    } catch {}

    try {
        chat.sendInfo(player, message);
    } catch {}
}

function notifyError(player, message) {
    if (!player || !message) return;

    try {
        player.call("c:auth:error", [String(message)]);
        return;
    } catch {}

    try {
        chat.sendError(player, message);
    } catch {}
}

function notifySuccess(player, message) {
    if (!player || !message) return;

    try {
        player.call("client:notification", ["success", String(message)]);
        return;
    } catch {}

    try {
        chat.sendSuccess(player, message);
    } catch {}
}

function getNpcById(id) {
    return NPCS.find((npc) => npc.id === id);
}

function sendToCef(player, payload) {
    if (!player) return;

    try {
        player.call("client:interface:open", [
            "npcDialog",
            JSON.stringify(payload || {}),
        ]);
    } catch (err) {
        console.error("[NPC_DIALOG] sendToCef error:", err);
    }
}

function closeDialog(player) {
    if (!player) return;

    try {
        player.call("client:interface:close", ["npcDialog"]);
    } catch {}
}

async function getHuntingShopPayload(player, purchaseState = null) {
    const business = await businessService.repository.getBusiness("hunting_jeremy");
    const multiplier = Math.max(50, Math.min(200, Number(business?.catalog?.hunting_markup || 100)));
    return {
        contractVersion: 1,
        title: "Магазин охотника",
        seller: "Jeremy Meadows",
        cash: getPlayerCash(player),
        items: Object.entries(HUNTING_SHOP)
          .filter(([, product]) => !product.unlocked || product.testAvailable || getHuntingService().isRareShopUnlocked(player))
          .map(([id, product]) => ({
            id,
            name: product.name,
            description: product.description,
            icon: product.icon,
            amount: product.amount,
            price: Math.max(0, Math.round(Number(product.price || 0) * multiplier / 100)),
        })),
        ...(purchaseState && typeof purchaseState === "object" ? purchaseState : {}),
    };
}

function isNearHuntingSeller(player, npc = getNpcById("hunting_seller")) {
    if (!player || !npc?.position || !player.position) return false;
    if (Number(player.dimension || 0) !== 0) return false;
    return getDistance(player.position, npc.position) <= Number(npc.colshapeRadius || 5) + 1.5;
}

async function sendHuntingShop(player, purchaseState = null) {
    try {
        player.call("client:huntingShop:open", [
            JSON.stringify(await getHuntingShopPayload(player, purchaseState)),
        ]);
    } catch (error) {
        console.error("[HUNTING_SHOP] open error:", error);
    }
}

async function openHuntingShop(player, npc) {
    if (player?.vehicle) {
        notifyError(player, "Выйдите из транспорта, чтобы открыть охотничий магазин.");
        return false;
    }
    if (npc?.id !== "hunting_seller" || !isNearHuntingSeller(player, npc)) {
        notifyError(player, "Подойдите ближе к Jeremy Meadows.");
        return false;
    }

    const business = await businessService.repository.getBusiness("hunting_jeremy");
    if (!business?.isOpen || (business.ownerUuid && business.taxPaidUntil && new Date(business.taxPaidUntil).getTime() < Date.now())) {
        notifyError(player, "Охотничий магазин сейчас закрыт.");
        return false;
    }

    await getHuntingService().ensureProfile(player);
    activeNpcByPlayer.delete(player.id);
    activeNodeByPlayer.delete(player.id);
    huntingShopSessions.set(player.id, {
        npcId: npc.id,
        openedAt: Date.now(),
    });

    closeDialog(player);
    await sendHuntingShop(player);
    return true;
}

function closeHuntingShop(player) {
    if (!player) return;

    huntingShopSessions.delete(player.id);
    try {
        player.call("client:huntingShop:close", []);
    } catch {}
}

function playerHasQuest(player) {
    try {
        if (quests.hasActiveQuestCached(player)) return true;
        return Boolean(
            player.getVariable?.("starterQuest") ||
            player.starterQuest ||
            player.currentQuest
        );
    } catch {
        return false;
    }
}

function canShowAction(player, action) {
    if (!action.onlyIf) return true;

    if (action.onlyIf === "hasQuest") {
        return playerHasQuest(player);
    }

    if (String(action.onlyIf).startsWith("hunting")) {
        return getHuntingService().canShow(player, action.onlyIf);
    }

    if (String(action.onlyIf).startsWith("fishing")) {
        return getFishingService().canShow(player, action.onlyIf);
    }

    if (action.onlyIf === "miningActive") {
        return mining.isShiftActive(player);
    }

    if (action.onlyIf === "miningInactive") {
        return !mining.isShiftActive(player);
    }

    if (action.onlyIf === "forestryActive") {
        return forestry.isShiftActive(player);
    }

    if (action.onlyIf === "forestryInactive") {
        return !forestry.isShiftActive(player);
    }

    if (action.onlyIf === "armoredCollectorActive") {
        return armoredCollector.isShiftActive(player);
    }

    if (action.onlyIf === "armoredCollectorInactive") {
        return !armoredCollector.isShiftActive(player);
    }

    if (action.onlyIf === "cargoLoaderActive") {
        return getCargoLoader().isShiftActive(player);
    }

    if (action.onlyIf === "cargoLoaderInactive") {
        return !getCargoLoader().isShiftActive(player);
    }

    return true;
}

function getActionLabel(_player, action) {
    return action.label;
}

function buildNodePayload(player, npc, nodeId) {
    const realNodeId = nodeId || npc.startNode || "start";

    const node =
        npc.nodes?.[realNodeId] ||
        npc.nodes?.[npc.startNode] ||
        npc.nodes?.start;

    if (!node) {
        return {
            id: npc.id,
            name: npc.name,
            profession: npc.profession,
            message: "Диалог временно недоступен.",
            actions: [],
        };
    }

    const actions = (node.actions || [])
        .filter((action) => canShowAction(player, action))
        .map((action) => ({
            id: action.id,
            label: getActionLabel(player, action),
            event: action.close ? "npcDialog:end" : "npcDialog:action",
            payload: {
                npcId: npc.id,
                nodeId: realNodeId,
                actionId: action.id,
            },
        }));

    let message = node.message;
    if (npc.id === "hunting_seller" && realNodeId === (npc.startNode || "start")) {
        try {
            const state = getHuntingService().getState(player);
            if (state?.quest) {
                message = `${message}\n\nАктивное задание: ${state.quest.description || state.quest.speciesName}`;
            } else if (state?.active) {
                message = `${message}\n\nСейчас активна свободная охота.`;
            }
        } catch {}
    }

    return {
        id: npc.id,
        name: npc.name,
        profession: npc.profession,
        message,
        nodeId: realNodeId,
        position: npc.position
            ? {
                  x: npc.position.x,
                  y: npc.position.y,
                  z: npc.position.z,
              }
            : null,
        actions,
    };
}

function openNpcDialog(player, npc, nodeId) {
    if (!player || !npc) return;

    activeNpcByPlayer.set(player.id, npc.id);

    const payload = buildNodePayload(
        player,
        npc,
        nodeId || npc.startNode || "start"
    );

    activeNodeByPlayer.set(player.id, payload.nodeId || npc.startNode || "start");
    sendToCef(player, payload);
}

function giveStarterTransport(player) {
    notifyInfo(player, "Начальный транспорт пока не подключён к системе транспорта.");
}

async function startStarterQuest(player, npc) {
    return quests.startNewcomerChain(player, {
        npcId: npc?.id || "guide_airport",
        actionId: "startQuest",
    });
}

async function cancelQuest(player) {
    return quests.cancelNewcomerQuest(player);
}

function recordNpcDialogueProgress(player, npc, selectedAction) {
    const uuid = getPlayerUuid(player);
    if (!uuid || !npc?.id || !selectedAction?.id) return;

    quests.recordProgress(player, {
        type: "npc.dialogue_completed",
        subjectId: npc.id,
        idempotencyKey: `npc:${uuid}:${npc.id}:${selectedAction.id}`,
        amount: 1,
        metadata: {
            actionId: selectedAction.id,
            action: selectedAction.action || null,
        },
    }, { sync: false }).catch((error) => {
        console.error("[NPC_DIALOG] quest dialogue progress failed:", error?.message || error);
    });
}

async function buyHuntingCart(player, npc, rawItems) {
    const playerId = Number(player?.id);
    const characterUuid = getPlayerUuid(player);
    const purchaseKey = characterUuid > 0 ? `character:${characterUuid}` : `player:${playerId}`;
    if (huntingPurchaseLocks.has(purchaseKey)) return false;
    huntingPurchaseLocks.add(purchaseKey);
    try {
        return await getHuntingService().runExclusive(player, "shop_purchase", async () => {
    if (npc?.id !== "hunting_seller") {
        notifyError(player, "Этот товар продаёт только охотник.");
        return false;
    }

    if (!isNearHuntingSeller(player, npc)) {
        notifyError(player, "Покупка отменена: вы отошли от продавца.");
        closeHuntingShop(player);
        return false;
    }

    const merged = new Map();
    (Array.isArray(rawItems) ? rawItems : []).forEach((entry) => {
        const itemId = String(entry?.itemId || entry?.id || "");
        const quantity = Math.floor(Number(entry?.quantity));
        if (!itemId || !Number.isInteger(quantity)) return;
        merged.set(itemId, Number(merged.get(itemId) || 0) + quantity);
    });
    const cart = Array.from(merged.entries()).map(([itemId, quantity]) => ({ itemId, quantity }));
    const uuid = getPlayerUuid(player);
    const cash = getPlayerCash(player);

    if (cart.length < 1 || cart.length > 20) {
        notifyError(player, "Корзина пуста или содержит слишком много позиций.");
        return false;
    }
    const grantsByItem = new Map();
    let baseTotalPrice = 0;
    const business = await businessService.repository.getBusiness("hunting_jeremy");
    const markup = Math.max(50, Math.min(200, Number(business?.catalog?.hunting_markup || 100)));
    for (const entry of cart) {
        const product = HUNTING_SHOP[entry.itemId];
        if (!product) {
            notifyError(player, `Товар ${entry.itemId} не найден.`);
            return false;
        }
        if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 10) {
            notifyError(player, "В корзине можно выбрать от 1 до 10 упаковок каждого товара.");
            return false;
        }
        if (product.unlocked && !product.testAvailable && !getHuntingService().isRareShopUnlocked(player)) {
            notifyError(player, `${product.name} откроется после выполнения пяти охотничьих заданий.`);
            return false;
        }
        baseTotalPrice += Math.max(0, Number(product.price || 0)) * entry.quantity;
        grantsByItem.set(
            entry.itemId,
            Number(grantsByItem.get(entry.itemId) || 0) + Math.max(1, Number(product.amount || 1)) * entry.quantity
        );
        if (product.bonusAmmo) {
            const ammoItem = String(product.bonusAmmoItem || "hunting_ammo");
            grantsByItem.set(
                ammoItem,
                Number(grantsByItem.get(ammoItem) || 0) + Number(product.bonusAmmo) * entry.quantity
            );
        }
    }

    const pricingLines = cart.map((entry) => ({
        quantity: entry.quantity,
        unitPrice: Math.max(0, Number(HUNTING_SHOP[entry.itemId]?.price || 0)),
    }));
    const totalPrice = pricingLines.reduce(
        (sum, line) => sum + Math.max(0, Math.round(line.unitPrice * markup / 100)) * line.quantity,
        0
    );

    if (totalPrice > 0 && !uuid) {
        notifyError(player, "Персонаж не загружен.");
        return false;
    }

    if (cash < totalPrice) {
        notifyError(player, "Недостаточно наличных.");
        return false;
    }

    try {
        const grants = Array.from(grantsByItem.entries()).map(([itemId, amount]) => ({ itemId, amount }));

        const stockQuantity = cart.reduce((total, entry) => total + entry.quantity, 0);
        const purchase = await inventory.purchaseItems(
            player,
            grants,
            totalPrice,
            businessService.createPurchaseOptions(
                "hunting_jeremy",
                player,
                [{
                    id: "hunting_supplies",
                    name: "Hunting supplies",
                    quantity: stockQuantity,
                    stockKey: "service_units",
                    unitPrice: stockQuantity > 0 ? Math.round(totalPrice / stockQuantity) : 0,
                }],
                totalPrice,
                "hunting_shop",
                "cash",
                { key: "hunting_markup", basePrice: baseTotalPrice, lines: pricingLines }
            )
        );
        if (!purchase.ok) {
            const messages = {
                cash: "Недостаточно наличных.",
                weight: "Недостаточно свободного веса в инвентаре.",
                slots: "Нет свободного места в инвентаре.",
                character: "Персонаж не загружен.",
                closed: "Охотничий магазин сейчас закрыт.",
                tax: "Охотничий магазин закрыт из-за просроченного налога.",
                stock: "На складе бизнеса закончились товары.",
            };
            notifyError(player, messages[purchase.reason] || "Не удалось выполнить покупку. Деньги и инвентарь не изменены.");
            return false;
        }
        syncPlayerCash(player, purchase.cash);
        notifySuccess(
            player,
            formatCartPurchaseNotification(
                cart.map((entry) => ({
                    name: HUNTING_SHOP[entry.itemId]?.name || entry.itemId,
                    quantity: entry.quantity,
                })),
                totalPrice
            )
        );

        console.log(
            `[HUNTING] Shop cart purchase | player=${player.id} static=${uuid} lines=${cart.length} price=${totalPrice}`
        );
        logs.writeLog({
            type: "hunting",
            level: "info",
            player: { uuid, name: String(player.name || `Player ${player.id}`) },
            message: "shop_purchase",
            data: {
                event: "shop_purchase",
                playerId: Number(player.id),
                items: cart,
                grants,
                price: totalPrice,
            },
        }).catch((logError) => console.error("[HUNTING] Purchase log failed:", logError));
        return true;
    } catch (error) {
        console.error("[NPC_DIALOG] hunting purchase error:", error);
        notifyError(player, "Покупка не выполнена. Попробуйте ещё раз.");
        return false;
    }
        });
    } finally {
        huntingPurchaseLocks.delete(purchaseKey);
    }
}

async function buyHuntingItem(player, npc, itemId, rawQuantity = 1) {
    return buyHuntingCart(player, npc, [{ itemId, quantity: rawQuantity }]);
}

async function handleNpcAction(player, npc, actionName) {
    const action = String(actionName || "");

    if (action.startsWith("licenseVendorIssue:")) {
        if (npc?.id !== "license_vendor_airport") return false;

        const licenseId = action.slice("licenseVendorIssue:".length);
        if (!licenses.getLicenseDefinition(licenseId)?.vendorAvailable) {
            notifyError(player, "Эта лицензия недоступна в отделе лицензирования.");
            return false;
        }

        try {
            const licenseRecord = await licenses.issueVendorLicense(player, licenseId, {
                transactionWork: async () => {
                    const stillAtVendor = (
                        activeNpcByPlayer.get(player.id) === npc.id &&
                        String(player.currentNpcDialogId || "") === npc.id &&
                        !player.vehicle &&
                        Number(player.dimension || 0) === 0 &&
                        getDistance(player.position, npc.position) <= Number(npc.colshapeRadius || 4) + 1.5
                    );

                    if (!stillAtVendor) {
                        throw new Error("Оформление отменено: вернитесь к сотруднику отдела лицензирования.");
                    }
                },
            });

            const characterUuid = getPlayerUuid(player);
            quests.recordProgress(player, {
                type: "license.issued",
                subjectId: licenseId,
                amount: 1,
                idempotencyKey: `license:${characterUuid}:${licenseId}:${licenseRecord?.number || "active"}`,
                metadata: {
                    licenseId,
                    acquisitionChannel: "license_vendor",
                    npcId: npc.id,
                },
            }, { sync: false }).catch((error) => {
                console.error("[NPC_DIALOG] Vendor licence quest progress failed:", error?.message || error);
            });

            return true;
        } catch (error) {
            notifyError(player, error?.message || "Не удалось оформить лицензию.");
            return false;
        }
    }

    switch (action) {
        case "giveStarterTransport": {
            giveStarterTransport(player);
            return true;
        }

        case "startStarterQuest": {
            return startStarterQuest(player, npc);
        }

        case "cancelQuest": {
            return cancelQuest(player, npc);
        }

        case "claimIdentityDocument": {
            if (npc?.id !== "guide_cityhall") return false;

            try {
                const result = await documents.issueIdentityCardQuestReward(player, {
                    issuerName: npc.name,
                });
                notifySuccess(
                    player,
                    result?.reissued
                        ? "ID-карта восстановлена в вашем инвентаре."
                        : "Задание мэрии завершено: ID-карта добавлена в инвентарь."
                );
                return true;
            } catch (error) {
                notifyError(player, error?.message || "Не удалось оформить ID-карту.");
                return false;
            }
        }

        case "completeMedicalScreening": {
            if (npc?.id !== "medical_clerk_pillbox") return false;
            if (Number(player?.health || 0) <= 0 || player?.isDead === true) {
                notifyError(player, "Медицинский осмотр недоступен, пока персонаж находится без сознания.");
                return false;
            }

            try {
                await documents.issueMedicalCertificate({
                    player,
                    issuerName: npc.name,
                    physicalHealthy: true,
                    mentalHealthy: true,
                    notes: "Базовый медицинский осмотр пройден.",
                });
                notifySuccess(
                    player,
                    "Медицинский осмотр завершён: свидетельство добавлено в инвентарь."
                );
                return true;
            } catch (error) {
                notifyError(player, error?.message || "Не удалось оформить медицинское свидетельство.");
                return false;
            }
        }

        case "openHuntingShop": {
            return openHuntingShop(player, npc);
        }

        case "drivingSchoolOpen": {
            if (npc?.id !== "driving_school_instructor") return false;
            const opened = await drivingSchool.openSchool(player, npc);
            if (opened) {
                activeNpcByPlayer.delete(player.id);
                activeNodeByPlayer.delete(player.id);
                closeDialog(player);
            }
            return opened;
        }

        case "drivingSchoolStudy": {
            if (npc?.id !== "driving_school_instructor") return false;
            const opened = drivingSchool.openTheoryStudy(player, npc);
            if (opened) {
                activeNpcByPlayer.delete(player.id);
                activeNodeByPlayer.delete(player.id);
                closeDialog(player);
            }
            return opened;
        }

        case "drivingSchoolStubA": {
            drivingSchool.showUnavailable(player, "A");
            return true;
        }

        case "drivingSchoolStubC": {
            drivingSchool.showUnavailable(player, "C");
            return true;
        }

        case "openFishingShop": {
            if (npc?.id !== "fishing_seller" || !getFishingService().isNearSeller(player)) return false;
            if (player?.vehicle) {
                notifyError(player, "Выйдите из транспорта, чтобы открыть магазин рыбака.");
                return false;
            }
            await getFishingService().ensureProfile(player);
            const fishingBusiness = await businessService.repository.getBusiness("fishing_noah");
            if (!fishingBusiness?.isOpen || (fishingBusiness.ownerUuid && fishingBusiness.taxPaidUntil && new Date(fishingBusiness.taxPaidUntil).getTime() < Date.now())) {
                notifyError(player, "Магазин рыбака сейчас закрыт.");
                return false;
            }
            activeNpcByPlayer.delete(player.id);
            activeNodeByPlayer.delete(player.id);
            closeDialog(player);
            return await getFishingService().openShop(player, npc.id);
        }

        case "fishingGetQuest": {
            if (npc?.id !== "fishing_seller" || !getFishingService().isNearSeller(player)) return false;
            const ok = await getFishingService().assignQuest(player);
            if (ok && !player?.vehicle && getFishingService().isNearSeller(player)) openNpcDialog(player, npc, "start");
            return true;
        }

        case "fishingSubmitQuest": {
            if (npc?.id !== "fishing_seller" || !getFishingService().isNearSeller(player)) return false;
            await getFishingService().submitQuest(player);
            if (!player?.vehicle && getFishingService().isNearSeller(player)) openNpcDialog(player, npc, "start");
            return true;
        }

        case "fishingStartFree": {
            if (npc?.id !== "fishing_seller" || !getFishingService().isNearSeller(player)) return false;
            const ok = await getFishingService().startFreeFishing(player);
            if (ok && !player?.vehicle && getFishingService().isNearSeller(player)) openNpcDialog(player, npc, "start");
            return true;
        }

        case "fishingFinish": {
            if (npc?.id !== "fishing_seller" || !getFishingService().isNearSeller(player)) return false;
            await getFishingService().finishFishing(player);
            if (!player?.vehicle && getFishingService().isNearSeller(player)) openNpcDialog(player, npc, "start");
            return true;
        }

        case "fishingSell": {
            const coefficient = Number(npc?.fishingPriceCoefficient || npc?.huntingPriceCoefficient || 1);
            const isBuyer = npc?.id === "fishing_seller" || coefficient > 0;
            if (!isBuyer || getDistance(player.position, npc.position) > Number(npc.colshapeRadius || 5) + 1.5) return false;
            if (player?.vehicle) {
                notifyError(player, "Выйдите из транспорта для продажи улова.");
                return false;
            }
            return await getFishingService().sellFish(player, coefficient, npc.id);
        }

        case "fishingSellAll": {
            const coefficient = Number(npc?.fishingPriceCoefficient || npc?.huntingPriceCoefficient || 1);
            const isBuyer = npc?.id === "fishing_seller" || coefficient > 0;
            if (!isBuyer || getDistance(player.position, npc.position) > Number(npc.colshapeRadius || 5) + 1.5) return false;
            if (player?.vehicle) {
                notifyError(player, "Выйдите из транспорта для продажи улова.");
                return false;
            }
            return await getFishingService().sellAllFish(player, coefficient, npc.id);
        }

        case "fishingInfo": {
            return getFishingService().showInfo(player);
        }

        case "fishingStats": {
            return getFishingService().showStats(player);
        }

        case "huntingGetQuest": {
            if (npc?.id !== "hunting_seller" || !isNearHuntingSeller(player, npc)) return false;
            const ok = await getHuntingService().assignQuest(player);
            if (ok && !player?.vehicle && isNearHuntingSeller(player, npc)) openNpcDialog(player, npc, "start");
            return ok;
        }

        case "huntingSubmitQuest": {
            if (npc?.id !== "hunting_seller" || !isNearHuntingSeller(player, npc)) return false;
            const ok = await getHuntingService().submitQuest(player);
            if (!player?.vehicle && isNearHuntingSeller(player, npc)) openNpcDialog(player, npc, "start");
            return ok;
        }

        case "huntingStartFree": {
            if (npc?.id !== "hunting_seller" || !isNearHuntingSeller(player, npc)) return false;
            const ok = await getHuntingService().startFreeHunt(player);
            if (ok && !player?.vehicle && isNearHuntingSeller(player, npc)) openNpcDialog(player, npc, "start");
            return ok;
        }

        case "huntingFinish": {
            if (npc?.id !== "hunting_seller" || !isNearHuntingSeller(player, npc)) return false;
            const ok = await getHuntingService().finishHunt(player);
            if (!player?.vehicle && isNearHuntingSeller(player, npc)) openNpcDialog(player, npc, "start");
            return ok;
        }

        case "huntingSell": {
            const isBuyer = npc?.id === "hunting_seller" || Number(npc?.huntingPriceCoefficient || 0) > 0;
            if (!isBuyer || getDistance(player.position, npc.position) > Number(npc.colshapeRadius || 5) + 1.5) return false;
            if (player?.vehicle) {
                player.call("hunting:notify", ["Выйдите из транспорта, чтобы передать товар скупщику."]);
                return false;
            }
            const ok = await getHuntingService().sellCarcassBag(
                player,
                Number(npc.huntingPriceCoefficient || 1),
                npc.id
            );
            if (!player?.vehicle && getDistance(player.position, npc.position) <= Number(npc.colshapeRadius || 5) + 1.5) {
                openNpcDialog(player, npc, "start");
            }
            return ok;
        }

        case "huntingInfo": {
            return getHuntingService().showInfo(player);
        }

        case "taxiJoin": {
            return await taxi.joinTaxiJob(player);
        }

        case "taxiLeave": {
            return await taxi.leaveTaxiJob(player);
        }

        case "deliveryJoin": {
            return await delivery.joinDeliveryJob(player);
        }

        case "deliveryLeave": {
            return await delivery.leaveDeliveryJob(player);
        }

        case "truckerJoin": {
            return await trucker.joinTruckerJob(player);
        }

        case "truckerLeave": {
            return await trucker.leaveTruckerJob(player);
        }

        case "truckerRentalOpen": {
            activeNpcByPlayer.delete(player.id);
            activeNodeByPlayer.delete(player.id);
            closeDialog(player);
            return await trucker.openRentalMenu(player);
        }

        case "miningJoin": {
            return await mining.joinMiningJob(player);
        }

        case "miningLeave": {
            return await mining.leaveMiningJob(player);
        }

        case "miningShopOpen": {
            const opened = await mining.openShop(player);
            if (opened) {
                activeNpcByPlayer.delete(player.id);
                activeNodeByPlayer.delete(player.id);
                closeDialog(player);
            }
            return opened;
        }

        case "forestryJoin": {
            activeNpcByPlayer.delete(player.id);
            activeNodeByPlayer.delete(player.id);
            closeDialog(player);
            return await forestry.joinForestryJob(player);
        }

        case "forestryLeave": {
            return await forestry.leaveForestryJob(player);
        }

        case "forestryShopOpen":
        case "forestryVehicleOpen": {
            // Close the blocking NPC page before asking the client to open the
            // shop. Otherwise interfaceLock correctly rejects the second page.
            activeNpcByPlayer.delete(player.id);
            activeNodeByPlayer.delete(player.id);
            closeDialog(player);
            return await forestry.openShop(player, action === "forestryVehicleOpen" ? "haul" : "equipment");
        }

        case "armoredCollectorJoin": {
            const joined = await armoredCollector.joinArmoredCollector(player);
            if (joined) {
                activeNpcByPlayer.delete(player.id);
                activeNodeByPlayer.delete(player.id);
                closeDialog(player);
            }
            return joined;
        }

        case "armoredCollectorLeave": {
            return await armoredCollector.leaveArmoredCollector(player);
        }

        case "cargoLoaderLeave": {
            return await getCargoLoader().leave(player);
        }

        case "autoServiceOpen": {
            if (npc?.id !== autoService.npcId) return false;
            activeNpcByPlayer.delete(player.id);
            activeNodeByPlayer.delete(player.id);
            closeDialog(player);
            return autoService.openForPlayer(player);
        }

        default: {
            if (action.startsWith("cargoLoaderJoin:")) {
                const siteId = action.slice("cargoLoaderJoin:".length);
                const cargoLoader = getCargoLoader();
                const site = cargoLoader.getSite(siteId);
                if (!site || npc?.id !== site.npc.id) return false;
                return await cargoLoader.joinSite(player, siteId);
            }

            if (action.startsWith("huntingBuy:")) {
                const itemId = action.split(":")[1];
                return await buyHuntingItem(player, npc, itemId);
            }

            if (action.startsWith("taxiRent:")) {
                const vehicleId = action.split(":")[1];
                return await taxi.rentTaxiVehicle(player, vehicleId);
            }

            if (action.startsWith("deliveryRent:")) {
                const vehicleId = action.split(":")[1];
                return await delivery.rentDeliveryVehicle(player, vehicleId);
            }

            if (action.startsWith("truckerRent:")) {
                const vehicleId = action.slice("truckerRent:".length);
                return await trucker.rentVehicle(player, vehicleId);
            }

            if (action.startsWith("drivingSchoolCdl:")) {
                if (npc?.id !== "driving_school_instructor") return false;
                const licenseId = action.slice("drivingSchoolCdl:".length);
                return await trucker.purchaseCdl(player, licenseId, npc.position);
            }

            if (action.startsWith("starterVehicleBuy:")) {
                const vehicleId = action.split(":")[1];
                return quests.purchaseStarterVehicle(player, vehicleId);
            }

            if (action === "starterVehicleStore") {
                return quests.storeStarterVehicle(player);
            }

            notifyError(player, "Это действие пока не реализовано.");
            return false;
        }
    }
}

function createNpcBlip(npc) {
    if (!npc.blip) return null;

    try {
        return mp.blips.new(npc.blip.sprite, npc.position, {
            name: npc.blip.name || npc.name,
            color: npc.blip.color,
            scale: npc.blip.scale,
            shortRange: npc.blip.shortRange !== false,
        });
    } catch (err) {
        console.error(`[NPC_DIALOG] create blip error for ${npc.id}:`, err);
        return null;
    }
}

function createNpcColshape(npc) {
    try {
        const radius = Number(npc.colshapeRadius || 5);

        const shape = mp.colshapes.newSphere(
            npc.position.x,
            npc.position.y,
            npc.position.z,
            radius
        );

        shape.isNpcDialog = true;
        shape.npcDialogId = npc.id;

        return shape;
    } catch (err) {
        console.error(`[NPC_DIALOG] create colshape error for ${npc.id}:`, err);
        return null;
    }
}

function createNpcLabel(npc) {
    try {
        return mp.labels.new(
            `~o~${npc.name}\n~w~${npc.profession}\n~c~Нажмите E`,
            new mp.Vector3(npc.position.x, npc.position.y, npc.position.z + 1.1),
            {
                los: false,
                font: 4,
                drawDistance: 15,
                dimension: 0,
            }
        );
    } catch (err) {
        console.error(`[NPC_DIALOG] create label error for ${npc.id}:`, err);
        return null;
    }
}

function createNpcPed(npc) {
    if (!npc.model) return null;

    try {
        const ped = mp.peds.new(
            mp.joaat(npc.model),
            npc.position,
            {
                dynamic: false,
                frozen: true,
                invincible: true,
            }
        );

        ped.dimension = 0;

        ped.npcDialogId = npc.id;

        ped.setVariable("npcDialogId", npc.id);
        ped.setVariable("npcFrozen", true);
        ped.setVariable("npcInvincible", true);
        ped.setVariable("npcScenario", npc.scenario || null);
        ped.setVariable("npcHeading", npc.heading || 0);

        return ped;
    } catch (err) {
        console.error(`[NPC_DIALOG] create ped error for ${npc.id}:`, err);
        return null;
    }
}

function initNpcDialogs() {
    for (const npc of NPCS) {
        if (!npc.position) {
            console.error(`[NPC_DIALOG] NPC ${npc.id} has no position`);
            continue;
        }

        const blip = createNpcBlip(npc);
        const colshape = createNpcColshape(npc);
        const label = createNpcLabel(npc);
        const ped = createNpcPed(npc);

        npcEntities.push({
            npcId: npc.id,
            blip,
            colshape,
            label,
            ped,
        });
    }

    console.log(`[NPC_DIALOG] Loaded ${NPCS.length} NPC dialogs`);
}

registerNpcEvent("playerEnterColshape", (player, shape) => {
    if (!shape?.isNpcDialog) return;

    player.currentNpcDialogId = shape.npcDialogId;
    player.call("client:npcDialog:setHint", [true]);
});

registerNpcEvent("playerExitColshape", (player, shape) => {
    if (!shape?.isNpcDialog) return;

    if (player.currentNpcDialogId === shape.npcDialogId) {
        player.currentNpcDialogId = null;
    }

    activeNpcByPlayer.delete(player.id);
    activeNodeByPlayer.delete(player.id);

    if (shape.npcDialogId === "hunting_seller" && huntingShopSessions.has(player.id)) {
        closeHuntingShop(player);
    }

    if (shape.npcDialogId === "fishing_seller") {
        try { getFishingService().closeShop(player); } catch {}
    }

    player.call("client:npcDialog:setHint", [false]);
    closeDialog(player);
});

registerNpcEvent("server:npcDialog:tryOpen", (player) => {
    Promise.resolve()
        .then(async () => {
            if (player?.vehicle) {
                notifyError(player, "Для разговора с NPC выйдите из транспорта.");
                return;
            }
            const npcId = player.currentNpcDialogId;

            if (!npcId) {
                notifyError(player, "Рядом нет NPC для разговора.");
                return;
            }

            const npc = getNpcById(npcId);

            if (!npc) {
                notifyError(player, "NPC не найден.");
                return;
            }

            if (npc.id === "license_vendor_airport") {
                await licenses.loadPlayerLicenses(player);
            }

            if (npc.id === autoService.npcId) {
                await autoService.openForPlayer(player);
                return;
            }

            openNpcDialog(player, npc);
        })
        .catch((error) => {
            console.error("[NPC_DIALOG] open error:", error);
            notifyError(player, "Не удалось открыть диалог.");
        });
});

registerNpcEvent("server:npcDialog:action", async (player, rawData) => {
    let data = {};

    try {
        data = typeof rawData === "string"
            ? JSON.parse(rawData)
            : rawData || {};
    } catch (e) {
        console.error("[NPC_DIALOG] parse error:", e);
        data = typeof rawData === "string" ? { id: rawData } : {};
    }

    if (player?.vehicle) {
        notifyError(player, "Для взаимодействия выйдите из транспорта.");
        return;
    }

    const nestedPayload = data?.payload && typeof data.payload === "object"
        ? data.payload
        : {};
    const deepPayload = nestedPayload?.payload && typeof nestedPayload.payload === "object"
        ? nestedPayload.payload
        : {};
    const payload = {
        ...(data && typeof data === "object" ? data : {}),
        ...nestedPayload,
        ...deepPayload,
    };

    const activeNpcId = activeNpcByPlayer.get(player.id);
    const npcId = activeNpcId;

    const npc = getNpcById(npcId);

    if (
        !npc ||
        String(payload.npcId || npcId) !== String(npcId) ||
        String(player.currentNpcDialogId || "") !== String(npcId) ||
        getDistance(player.position, npc.position) > Number(npc.colshapeRadius || 5) + 1.5
    ) {
        activeNpcByPlayer.delete(player.id);
        activeNodeByPlayer.delete(player.id);
        notifyError(player, "NPC не найден.");
        closeDialog(player);
        return;
    }

    const activeNodeId = activeNodeByPlayer.get(player.id) || npc.startNode || "start";
    const node = npc.nodes?.[activeNodeId];
    const requestedActionId = String(payload.id || payload.actionId || data.id || "");
    const selectedAction = Array.isArray(node?.actions)
        ? node.actions.find((action) => String(action.id) === requestedActionId)
        : null;

    if (!selectedAction || !canShowAction(player, selectedAction)) {
        notifyError(player, "Действие недоступно в текущем диалоге.");
        return;
    }

    if (selectedAction.close) {
        activeNpcByPlayer.delete(player.id);
        activeNodeByPlayer.delete(player.id);
        closeDialog(player);
        return;
    }

    let handledAction = false;

    if (selectedAction.action) {
        const ok = await handleNpcAction(
            player,
            npc,
            selectedAction.action
        );

        if (!ok) {
            return;
        }

        handledAction = true;
        recordNpcDialogueProgress(player, npc, selectedAction);
    }

    if (selectedAction.next) {
        openNpcDialog(
            player,
            npc,
            selectedAction.next
        );

        return;
    }

    if (handledAction) return;

    notifyError(player, "Действие не найдено.");
});

registerNpcEvent("server:huntingShop:buy", async (player, itemId, rawQuantity = 1) => {
    try {
        const session = huntingShopSessions.get(player.id);
        const npc = getNpcById("hunting_seller");
        const productId = String(itemId || "");

        if (
            !session ||
            player?.vehicle ||
            session.npcId !== "hunting_seller" ||
            Date.now() - Number(session.openedAt || 0) > 30 * 60 * 1000 ||
            !isNearHuntingSeller(player, npc)
        ) {
            notifyError(player, "Магазин недоступен: подойдите к Jeremy Meadows заново.");
            closeHuntingShop(player);
            return;
        }

        if (!Object.prototype.hasOwnProperty.call(HUNTING_SHOP, productId)) {
            notifyError(player, "Такого товара нет в магазине.");
            return;
        }

        const purchased = await buyHuntingItem(player, npc, productId, rawQuantity);
        if (purchased && huntingShopSessions.has(player.id)) await sendHuntingShop(player);
    } catch (error) {
        console.error("[HUNTING_SHOP] purchase event error:", error);
        notifyError(player, "Не удалось выполнить покупку.");
    }
});

registerNpcEvent("server:huntingShop:buyCart", async (player, rawCart) => {
    try {
        const session = huntingShopSessions.get(player.id);
        const npc = getNpcById("hunting_seller");
        if (
            !session || player?.vehicle || session.npcId !== "hunting_seller" ||
            Date.now() - Number(session.openedAt || 0) > 30 * 60 * 1000 ||
            !isNearHuntingSeller(player, npc)
        ) {
            notifyError(player, "Магазин недоступен: подойдите к Jeremy Meadows заново.");
            closeHuntingShop(player);
            return;
        }
        let payload = rawCart;
        if (typeof rawCart === "string") payload = JSON.parse(rawCart);
        const items = Array.isArray(payload) ? payload : payload?.items;
        const purchased = await buyHuntingCart(player, npc, items);
        if (huntingShopSessions.has(player.id)) {
            await sendHuntingShop(player, {
                purchaseRevision: Date.now(),
                purchaseSucceeded: Boolean(purchased),
            });
        }
    } catch (error) {
        console.error("[HUNTING_SHOP] cart purchase event error:", error);
        notifyError(player, "Не удалось оплатить корзину.");
    }
});

registerNpcEvent("server:huntingShop:close", (player) => {
    closeHuntingShop(player);
});

registerNpcEvent("server:npcDialog:end", (player) => {
    activeNpcByPlayer.delete(player.id);
    activeNodeByPlayer.delete(player.id);
    closeDialog(player);
});

registerNpcEvent("playerQuit", (player) => {
    activeNpcByPlayer.delete(player.id);
    activeNodeByPlayer.delete(player.id);
    huntingShopSessions.delete(player.id);
    try { getFishingService().closeShop(player); } catch {}
});

registerNpcEvent("playerDeath", (player) => {
    closeHuntingShop(player);
    try { getFishingService().closeShop(player); } catch {}
});

initNpcDialogs();

npcDialogRuntime.shutdown = () => {
    if (!npcDialogRuntime.active) return;
    npcDialogRuntime.active = false;
    for (const entry of npcEntities.splice(0)) {
        for (const entity of [entry.ped, entry.label, entry.blip, entry.colshape]) {
            try { entity?.destroy?.(); } catch {}
        }
    }
    activeNpcByPlayer.clear();
    activeNodeByPlayer.clear();
    huntingShopSessions.clear();
};

module.exports = {
    openNpcDialog,
    closeDialog,
    buildNodePayload,
    getNpcById,
};
