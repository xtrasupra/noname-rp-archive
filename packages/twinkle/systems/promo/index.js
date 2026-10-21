const {
  withConn,
  createPromoCode,
  applyPromoToCharacter,
  getPromoStatsByOwner,
  getAllPromoStats
} = require("../../database/query.js");

const {
  getCharacterUuid,
  checkPromoReward
} = require("./promo.service.js");

function notify(player, text) {
  player.outputChatBox(text);
}

mp.events.add("s:promo:activate", async (player, code) => {
  if (!player.auth) return;

  const characterUuid = getCharacterUuid(player);
  if (!characterUuid) {
    return notify(player, "!{#ff5555}Персонаж не загружен.");
  }

  if (!code || !code.trim()) {
    return notify(player, "!{#ff5555}Введите промокод.");
  }

  try {
    await withConn(async (conn) => {
      const result = await applyPromoToCharacter(characterUuid, code, conn);

      if (!result.success) {
        return notify(player, `!{#ff5555}${result.message}`);
      }

      notify(player, `!{#5eff5e}${result.message}`);

      await checkPromoReward(player);
    });
  } catch (err) {
    console.error("[PROMO ERROR]", err);
    notify(player, "!{#ff5555}Ошибка.");
  }
});

mp.events.addCommand("promo", (player, _, code) => {
  mp.events.call("s:promo:activate", player, code);
});

mp.events.addCommand("createpromo", async (player, _, code, type, ownerUuid) => {
  if (!player.admin_level || player.admin_level < 8) {
    return notify(player, "Нет прав.");
  }

  if (!code || !type) {
    return notify(player, "/createpromo [code] [media/player] [ownerUUID/null]");
  }

  type = type.toLowerCase();

  let ownerCharacterUuid = null;
  if (ownerUuid && ownerUuid !== "null") {
    ownerCharacterUuid = Number(ownerUuid);
  }

  try {
    await withConn(async (conn) => {
      await createPromoCode({
        code,
        type,
        ownerCharacterUuid
      }, conn);
    });

    notify(player, `Промокод ${code} создан.`);
  } catch (err) {
    console.error(err);
    notify(player, "Ошибка создания.");
  }
});

mp.events.addCommand("mypromo", async (player) => {
  const characterUuid = getCharacterUuid(player);

  await withConn(async (conn) => {
    const rows = await getPromoStatsByOwner(characterUuid, conn);

    if (!rows.length) {
      return notify(player, "У вас нет промокодов.");
    }

    rows.forEach(promo => {
      notify(player,
        `${promo.code} | вводов: ${promo.used_count} | наград: ${promo.rewarded_count}`
      );
    });
  });
});

mp.events.addCommand("promostats", async (player) => {
  if (!player.admin_level || player.admin_level < 8) return;

  await withConn(async (conn) => {
    const rows = await getAllPromoStats(conn);

    rows.forEach(promo => {
      notify(player,
        `[${promo.id}] ${promo.code} | ${promo.type} | owner: ${promo.owner_character_uuid || "нет"} | вводов: ${promo.used_count} | наград: ${promo.rewarded_count}`
      );
    });
  });
});

module.exports = {};