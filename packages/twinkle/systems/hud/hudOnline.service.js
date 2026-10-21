"use strict";

const onlineStats = require("./onlineStats.service.js");
const db = require("../../database/query.js");
const logsDb = require("../../database/logs.js");
const hud = require("./hud.service.js");
const levelService = require("../level/level.service.js");
const f2PayloadCache = require("../f2menu/f2menu.cache.js");

const ONLINE_TICK_MS = 60 * 1000;
const HUD_STATE_SYNC_MS = 15 * 1000;
const MANUAL_SYNC_COOLDOWN_MS = 5000;
const manualSyncAt = new WeakMap();
const manualSyncInFlight = new WeakMap();

function getOnlinePayload() {
    return {
        server: {
            online: `${mp.players.length} / ${Number(mp.config.maxplayers || 1000)}`,
            x2: true,
            logo: "/tw.png",
        },
        info: {
            ...hud.getClockPayload(),
        },
    };
}

function getFinancePayload(player) {
    const character = player?.character || player?.characterData || {};

    return {
        player: {
            finance: {
                cash: Number(character.cash ?? player?.cash ?? player?.getVariable?.("cash") ?? 0),
                bank: Number(character.bank ?? player?.bank ?? player?.getVariable?.("bank") ?? 0),
            },
        },
    };
}

function isHudEnabled(player) {
    try {
        if (!player?.character) return false;

        return Boolean(player.hudEnabled === true);
    } catch {
        return false;
    }
}

function getCharacterSessionEpoch(player) {
    return Math.max(0, Math.trunc(Number(player?.twinkleCharacterSessionEpoch || 0)));
}

function isSameHudSession(player, characterUuid, sessionEpoch) {
    return Boolean(
        player &&
        mp.players.exists(player) &&
        isHudEnabled(player) &&
        getCharacterUuid(player) === characterUuid &&
        getCharacterSessionEpoch(player) === sessionEpoch
    );
}

function rows(result) {
    if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
    return Array.isArray(result) ? result : [];
}

function getCharacterUuid(player) {
    return Number(player?.character?.uuid || player?.characterId || player?.uuid || 0);
}

function applyFinanceSnapshot(player, row) {
    if (!row) return getFinancePayload(player);

    const cash = Math.max(0, Number(row.cash || 0));
    const bank = Math.max(0, Number(row.bank || 0));

    if (player.character) {
        player.character.cash = cash;
        player.character.bank = bank;
    }
    if (player.characterData) {
        player.characterData.cash = cash;
        player.characterData.bank = bank;
    }

    player.cash = cash;
    player.bank = bank;

    try {
        player.setVariable("cash", cash);
        player.setVariable("bank", bank);
    } catch {}

    return { player: { finance: { cash, bank } } };
}

async function syncAuthoritativeHudState() {
    const players = [];

    mp.players.forEach((player) => {
        if (player && mp.players.exists(player) && isHudEnabled(player) && getCharacterUuid(player)) {
            players.push(player);
        }
    });

    if (!players.length) return;

    const uuids = [...new Set(players.map(getCharacterUuid))];
    const placeholders = uuids.map(() => "?").join(",");
    const result = await db.query(
        `SELECT uuid, cash, bank FROM characters WHERE uuid IN (${placeholders})`,
        uuids
    );
    const financeByUuid = new Map(
        rows(result).map((row) => [Number(row.uuid), row])
    );
    const shared = getOnlinePayload();

    players.forEach((player) => {
        hud.update(player, {
            ...shared,
            ...applyFinanceSnapshot(player, financeByUuid.get(getCharacterUuid(player))),
        });
    });
}

async function updateHudOnlineForPlayer(player) {
    if (!player || !mp.players.exists(player)) return;
    if (!isHudEnabled(player)) return;
    const characterUuid = getCharacterUuid(player);
    const sessionEpoch = getCharacterSessionEpoch(player);
    if (!characterUuid) return;

    const finance = getFinancePayload(player);
    const reward = await onlineStats.getHudBonusPayload(characterUuid);
    if (!isSameHudSession(player, characterUuid, sessionEpoch)) return;

    hud.update(player, {
        ...getOnlinePayload(),
        ...finance,
        ...reward,
    });
}

async function updateHudOnlineForAll() {
    const payload = getOnlinePayload();
    const tasks = [];

    mp.players.forEach((player) => {
        if (!player || !mp.players.exists(player)) return;
        if (!isHudEnabled(player)) return;

        tasks.push((async () => {
            hud.update(player, {
                ...payload,
                ...getFinancePayload(player),
                ...(await onlineStats.getHudBonusPayload(player)),
            });
        })());
    });

    await Promise.allSettled(tasks);
}

function updateHudCash(player) {
    const cash = Number(player.character?.cash ?? player.characterData?.cash ?? player.getVariable?.("cash") ?? 0);
    const bank = Number(player.character?.bank ?? player.characterData?.bank ?? player.getVariable?.("bank") ?? 0);

hud.update(player, {
    player: {
        finance: {
            cash,
            bank,
        },
    },
});
}

async function giveFractionSalary(player, paydaysGranted = 1) {
    const uuid = onlineStats.getUuid(player);
    const multiplier = Math.max(1, Math.floor(Number(paydaysGranted || 1)));
    if (!uuid) return { amount: 0, rankName: null, fractionName: null };

    const salaryRowsResult = await db.query(
        `SELECT fm.fraction_id,
                fm.rank_index,
                fr.rank_name,
                COALESCE(fr.salary, 0) AS salary,
                f.name AS fraction_name
           FROM fraction_members fm
           JOIN fractions f ON f.fraction_id = fm.fraction_id AND f.is_active = 1
           LEFT JOIN fraction_ranks fr
             ON fr.fraction_id = fm.fraction_id AND fr.rank_index = fm.rank_index
          WHERE fm.character_uuid = ?
          LIMIT 1`,
        [uuid]
    );
    const salaryRows = Array.isArray(salaryRowsResult) && Array.isArray(salaryRowsResult[0])
        ? salaryRowsResult[0]
        : salaryRowsResult;
    const salaryRow = salaryRows?.[0];
    const salary = Math.max(0, Number(salaryRow?.salary || 0));
    const amount = salary * multiplier;

    if (!salaryRow || amount <= 0) {
        return {
            amount: 0,
            rankName: salaryRow?.rank_name || null,
            fractionName: salaryRow?.fraction_name || null,
        };
    }

    await db.query(
        "UPDATE characters SET bank = COALESCE(bank, 0) + ? WHERE uuid = ?",
        [amount, uuid]
    );

    if (player.character) {
        player.character.bank = Number(player.character.bank || 0) + amount;
    }
    if (player.characterData) {
        player.characterData.bank = Number(player.characterData.bank || 0) + amount;
    }

    player.setVariable?.("bank", Number(player.character?.bank || player.characterData?.bank || 0));

    return {
        amount,
        rankName: salaryRow.rank_name || `Ранг ${salaryRow.rank_index}`,
        fractionName: salaryRow.fraction_name || null,
    };
}

async function giveOnlineReward(player) {
    const uuid = onlineStats.getUuid(player);
    const amount = Number(onlineStats.ONLINE_REWARD.donate || 0);
    if (!uuid || amount <= 0) return;

    const beforeRowsResult = await db.query(
        `SELECT a.id AS account_id, a.donate
           FROM accounts a
           JOIN characters c ON c.account_id = a.id
          WHERE c.uuid = ?
          LIMIT 1`,
        [uuid]
    );
    const beforeRows = Array.isArray(beforeRowsResult) && Array.isArray(beforeRowsResult[0])
        ? beforeRowsResult[0]
        : beforeRowsResult;
    const beforeDonate = Number(beforeRows?.[0]?.donate || 0);

    await db.query(
        `UPDATE accounts a
            JOIN characters c ON c.account_id = a.id
             SET a.donate = GREATEST(COALESCE(a.donate, 0) + ?, 0)
           WHERE c.uuid = ?`,
        [
            amount,
            uuid,
        ]
    );

    const accountRowsResult = await db.query(
        `SELECT a.donate
           FROM accounts a
           JOIN characters c ON c.account_id = a.id
          WHERE c.uuid = ?
          LIMIT 1`,
        [
            uuid,
        ]
    );
    const accountRows = Array.isArray(accountRowsResult) && Array.isArray(accountRowsResult[0])
        ? accountRowsResult[0]
        : accountRowsResult;
    const donate = Number(accountRows?.[0]?.donate || 0);
    await logsDb.writeDonateLog({
        source: "online_reward",
        action: "reward",
        amount,
        balanceBefore: beforeDonate,
        balanceAfter: donate,
        target: player,
        accountId: beforeRows?.[0]?.account_id || null,
        comment: "Онлайн-бонус",
    });

    if (player.account) player.account.donate = donate;
    if (player.accountData) player.accountData.donate = donate;
    player.donate = donate;
    player.setVariable?.("donate", donate);

    try {
        player.call?.("client:donate:update", [
            donate,
        ]);
    } catch {}

    try {
        updateHudOnlineForPlayer(player).catch(() => {});
    } catch {}

    try {
        f2PayloadCache.refresh(player, { push: true }).catch(() => {});
    } catch {}

    try {
        player.outputChatBox(`!{#b86bff}Онлайн-бонус: !{#ffffff}+${amount.toLocaleString("ru-RU")} доната`);
    } catch {}
}

async function tickOnlineRewards() {
    const now = Date.now();
    const players = [];

    mp.players.forEach((player) => {
        players.push(player);
    });

    for (const player of players) {
        if (!player || !mp.players.exists(player)) continue;
        if (!isHudEnabled(player)) continue;

        const state = await onlineStats.getState(player);
        if (!state) continue;

        const elapsed = Math.max(0, Math.floor((now - state.lastTickAt) / 1000));
        if (elapsed <= 0) continue;

        state.lastTickAt = now;
        const updatedState = await onlineStats.addOnlineSeconds(player, elapsed);
        const levelProgress = await levelService.grantPaydayExperience(
            player,
            updatedState?.totalSeconds || state.totalSeconds
        );

        if (levelProgress) {
            const salary = await giveFractionSalary(player, levelProgress.paydaysGranted);
            f2PayloadCache.refresh(player, { push: true }).catch(() => {});

            try {
                const salaryText = salary.amount > 0
                    ? ` Зарплата фракции: $${salary.amount.toLocaleString("ru-RU")}.`
                    : "";
                player.outputChatBox(`!{#b86bff}PayDay: !{#ffffff}+${levelProgress.paydaysGranted * levelService.LEVEL_CONFIG.paydayXp} XP.${salaryText}`);
            } catch {}

            if (salary.amount > 0) {
                updateHudCash(player);
            }

            if (levelProgress.level > levelProgress.oldLevel) {
                try {
                    const donateText = levelProgress.donateReward > 0
                        ? ` Донат за уровень: +${levelProgress.donateReward}.`
                        : "";
                    player.outputChatBox(`!{#b86bff}Уровень повышен: !{#ffffff}${levelProgress.oldLevel} -> ${levelProgress.level}.${donateText}`);
                } catch {}
            }
        }
        if (onlineStats.getRewardRemainingSeconds(state) <= 0) {
            try {
                await giveOnlineReward(player);
                await onlineStats.markRewardClaimed(player);

                await updateHudOnlineForPlayer(player);

            } catch (error) {
                console.log("[HUD ONLINE] Reward error:", error?.message || error);
            }
        }

        await updateHudOnlineForPlayer(player);
    }
}

mp.events.add("playerJoin", (player) => {
    setTimeout(() => {
        updateHudOnlineForAll().catch((error) => {
            console.log("[HUD ONLINE] Join sync error:", error?.message || error);
        });
    }, 500);

    setTimeout(() => {
        updateHudOnlineForPlayer(player).catch((error) => {
            console.log("[HUD ONLINE] Player sync error:", error?.message || error);
        });
    }, 1500);
});

mp.events.add("playerQuit", (player) => {
    onlineStats.clearPlayer(player);

    setTimeout(() => {
        updateHudOnlineForAll().catch((error) => {
            console.log("[HUD ONLINE] Quit sync error:", error?.message || error);
        });
    }, 500);
});

mp.events.add("playerSpawn", (player) => {
    setTimeout(() => {
        updateHudOnlineForPlayer(player).catch((error) => {
            console.log("[HUD ONLINE] Spawn sync error:", error?.message || error);
        });
    }, 1000);
});

mp.events.add("twinkle:character:loaded", (player) => {
    setTimeout(async () => {
        try {
            const state = await onlineStats.loadStats(onlineStats.getUuid(player));
            if (state) state.lastTickAt = Date.now();
            const levelProgress = await levelService.normalizeProgress(player);
            if (levelProgress?.changed) {
                f2PayloadCache.refresh(player, { push: true }).catch(() => {});

                if (levelProgress.level > levelProgress.oldLevel) {
                    try {
                        const donateText = levelProgress.donateReward > 0
                            ? ` Донат за уровень: +${levelProgress.donateReward}.`
                            : "";
                        player.outputChatBox(`!{#b86bff}Уровень пересчитан: !{#ffffff}${levelProgress.oldLevel} -> ${levelProgress.level}.${donateText}`);
                    } catch {}
                }
            }
            await updateHudOnlineForPlayer(player);
        } catch (error) {
            console.log("[HUD ONLINE] Character sync error:", error?.message || error);
        }
    }, 1000);
});

mp.events.add("s:hud:syncOnline", (player) => {
    if (!player || !mp.players.exists(player) || !isHudEnabled(player)) return;

    const now = Date.now();
    const sessionEpoch = getCharacterSessionEpoch(player);
    const previousRequest = manualSyncAt.get(player);
    if (
        previousRequest?.sessionEpoch === sessionEpoch &&
        now - Number(previousRequest.at || 0) < MANUAL_SYNC_COOLDOWN_MS
    ) return;
    manualSyncAt.set(player, { at: now, sessionEpoch });

    const previousOperation = manualSyncInFlight.get(player);
    if (previousOperation?.sessionEpoch === sessionEpoch) return;
    const operation = updateHudOnlineForPlayer(player)
        .catch((error) => {
            console.log("[HUD ONLINE] Manual sync error:", error?.message || error);
        })
        .finally(() => {
            if (manualSyncInFlight.get(player)?.operation === operation) manualSyncInFlight.delete(player);
        });
    manualSyncInFlight.set(player, { operation, sessionEpoch });
});

onlineStats.ensureSchema().catch((error) => {
    console.log("[HUD ONLINE] Schema error:", error?.message || error);
});

levelService.ensureSchema().catch((error) => {
    console.log("[LEVEL] Schema error:", error?.message || error);
});

setInterval(() => {
    tickOnlineRewards().catch((error) => {
        console.log("[HUD ONLINE] Tick error:", error?.message || error);
    });
}, ONLINE_TICK_MS);

setInterval(() => {
    updateHudOnlineForAll().catch((error) => {
        console.log("[HUD ONLINE] Clock sync error:", error?.message || error);
    });
}, 60000);

setInterval(() => {
    syncAuthoritativeHudState().catch((error) => {
        console.log("[HUD ONLINE] State sync error:", error?.message || error);
    });
}, HUD_STATE_SYNC_MS);

setInterval(() => {

    mp.players.forEach(async (player) => {

        if (!player || !mp.players.exists(player))
            return;

        if (!isHudEnabled(player))
            return;

        try {

            const reward = await onlineStats.getHudBonusPayload(player);

            hud.update(player, reward);

        } catch (e) {
            console.log("[HUD ONLINE] Reward refresh:", e.message);
        }

    });

}, 60000);

module.exports = {
    getOnlinePayload,
    getOnlineRewardPayload: onlineStats.getHudBonusPayload,
    getFinancePayload,
    updateHudOnlineForPlayer,
    updateHudOnlineForAll,
    syncAuthoritativeHudState,
};

console.log("[HUD ONLINE] Loaded");
