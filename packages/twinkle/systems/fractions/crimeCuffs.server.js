"use strict";

const chat = require("../chat/chat.service.js");
const fractionService = require("./fraction.service.js");
const {
    playerUuid,
    playerName,
} = require("../../utils/player.js");

const MAX_INTERACT_DISTANCE = 2.2;
const ACTION_COOLDOWN_MS = 500;
const actionCooldowns = new WeakMap();

function consumeActionCooldown(player) {
    const now = Date.now();
    const previous = Number(actionCooldowns.get(player) || 0);
    if (now - previous < ACTION_COOLDOWN_MS) return false;
    actionCooldowns.set(player, now);
    return true;
}

function distance(a, b) {

    if (!a?.position || !b?.position)
        return Number.MAX_SAFE_INTEGER;

    const dx = Number(a.position.x || 0) - Number(b.position.x || 0);
    const dy = Number(a.position.y || 0) - Number(b.position.y || 0);
    const dz = Number(a.position.z || 0) - Number(b.position.z || 0);

    return Math.sqrt(
        dx * dx +
        dy * dy +
        dz * dz
    );

}

async function isCrimeMember(player) {
    if (!playerUuid(player)) return false;
    return fractionService.isPlayerFactionKind(player, "crime");
}

function findNearestPlayer(player, maxDistance = MAX_INTERACT_DISTANCE) {

    let nearest = null;
    let nearestDistance = maxDistance;

    mp.players.forEach(target => {

        if (!target)
            return;

        if (target === player)
            return;

        if (!mp.players.exists(target))
            return;

        if (target.dimension !== player.dimension)
            return;

        const dist = distance(
            player,
            target
        );

        if (dist <= nearestDistance) {

            nearest = target;
            nearestDistance = dist;

        }

    });

    return nearest;

}

function isCrimeCuffed(player) {

    return Boolean(
        player?.crimeCuffed
    );

}

function setCrimeCuffed(target, state) {

    const enabled = Boolean(state);

    target.crimeCuffed = enabled;

    target.setVariable(
        "crimeCuffed",
        enabled
    );

    if (!enabled) {

        clearEscortByTarget(
            target
        );

    }

    try {

        target.call(
            "client:crimeCuffs:set",
            [enabled]
        );

    } catch {}

}

function clearEscort(officer, suspect) {

    if (officer) {

        officer.crimeEscortTarget = null;

        officer.setVariable(
            "crimeEscortTarget",
            -1
        );

    }

    if (suspect) {

        suspect.crimeEscortOfficer = null;

        suspect.setVariable(
            "crimeEscortOfficer",
            -1
        );

        try {

            suspect.call(
                "client:crimeCuffs:stopEscort"
            );

        } catch {}

    }

}

function clearEscortByTarget(suspect) {

    if (!suspect?.crimeEscortOfficer) {

        suspect?.setVariable?.(
            "crimeEscortOfficer",
            -1
        );

        return;

    }

    clearEscort(
        suspect.crimeEscortOfficer,
        suspect
    );

}

function clearEscortByOfficer(officer) {

    if (!officer?.crimeEscortTarget) {

        officer?.setVariable?.(
            "crimeEscortTarget",
            -1
        );

        return;

    }

    clearEscort(
        officer,
        officer.crimeEscortTarget
    );

}

function startEscort(officer, suspect) {

    clearEscortByOfficer(
        officer
    );

    clearEscortByTarget(
        suspect
    );

    officer.crimeEscortTarget = suspect;
    suspect.crimeEscortOfficer = officer;

    officer.setVariable(
        "crimeEscortTarget",
        suspect.id
    );

    suspect.setVariable(
        "crimeEscortOfficer",
        officer.id
    );

    try {

        officer.call(
            "client:crimeCuffs:startEscort",
            [suspect.id]
        );

        suspect.call(
            "client:crimeCuffs:startEscort",
            [officer.id]
        );

    } catch {}

}

async function handleToggleCuffs(player) {

    if (!consumeActionCooldown(player)) return;

    if (!(await isCrimeMember(player))) {

        return chat.sendError(
            player,
            "Доступно только крайм-фракциям."
        );

    }

    const target = findNearestPlayer(player);

    if (!target) {

        return chat.sendError(
            player,
            "Рядом нет игрока."
        );

    }

    if (
        target.crimeEscortOfficer ||
        target.crimeEscortTarget
    ) {

        clearEscortByTarget(target);
        clearEscortByOfficer(target);

    }

    const nextState = !isCrimeCuffed(target);

    setCrimeCuffed(
        target,
        nextState
    );

    const targetName = playerName(target);

    chat.sendInfo(
        player,
        nextState
            ? `Вы надели стяжки на ${targetName}.`
            : `Вы сняли стяжки с ${targetName}.`
    );

    chat.sendInfo(
        target,
        nextState
            ? `${playerName(player)} надел на вас стяжки.`
            : `${playerName(player)} снял с вас стяжки.`
    );

}

async function handleToggleEscort(player) {

    if (!consumeActionCooldown(player)) return;

    if (!(await isCrimeMember(player))) {

        return chat.sendError(
            player,
            "Доступно только крайм-фракциям."
        );

    }

    if (player.crimeEscortTarget) {

        const target =
            player.crimeEscortTarget;

        clearEscortByOfficer(player);

        chat.sendInfo(
            player,
            "Вы отпустили игрока."
        );

        if (target) {

            chat.sendInfo(
                target,
                "Вас отпустили."
            );

        }

        return;

    }

    const target =
        findNearestPlayer(player);

    if (!target) {

        return chat.sendError(
            player,
            "Рядом нет игрока."
        );

    }

    if (!isCrimeCuffed(target)) {

        return chat.sendError(
            player,
            "Сначала наденьте стяжки."
        );

    }

    if (target.crimeEscortOfficer) {

        return chat.sendError(
            player,
            "Игрок уже удерживается."
        );

    }

    startEscort(
        player,
        target
    );

    chat.sendInfo(
        player,
        `Вы взяли ${playerName(target)} в залом.`
    );

    chat.sendInfo(
        target,
        `${playerName(player)} взял вас в залом.`
    );

}

mp.events.add(
    "server:crimeCuffs:toggle",
    (player) => {

        handleToggleCuffs(player)
            .catch((error) => {

                console.log(
                    "[CRIME CUFFS]",
                    error
                );

                chat.sendError(
                    player,
                    error?.message ||
                    "Ошибка стяжек."
                );

            });

    }
);

mp.events.add(
    "server:crimeCuffs:toggleEscort",
    (player) => {

        handleToggleEscort(player)
            .catch((error) => {

                console.log(
                    "[CRIME CUFFS]",
                    error
                );

                chat.sendError(
                    player,
                    error?.message ||
                    "Ошибка залома."
                );

            });

    }
);

mp.events.add(
    "playerDeath",
    (player) => {

        clearEscortByTarget(player);
        clearEscortByOfficer(player);

        if (isCrimeCuffed(player)) {

            setCrimeCuffed(
                player,
                false
            );

        }

    }
);

mp.events.add(
    "playerQuit",
    (player) => {

        clearEscortByTarget(player);
        clearEscortByOfficer(player);

    }
);

console.log(
    "[CRIME CUFFS] Loaded"
);
