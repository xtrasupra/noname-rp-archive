"use strict";

const inventory = require("./inventory.service.js");
const hudNeeds = require("../hud/hudNeeds.service.js");
const weaponShotChains = new Map();

function getAdminLevel(player) {
  return Number(
    player?.adminLevel ||
    player?.admin ||
    player?.admin_level ||
    player?.character?.admin_level ||
    player?.characterData?.admin_level ||
    player?.getVariable?.("adminLevel") ||
    player?.getVariable?.("admin") ||
    0
  );
}

function parsePayload(raw) {
  try {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function weaponShotBlockedBySafeZone(player) {
  try {
    return Boolean(global.__twinkleMiningCombatGuard?.(player)
      || global.__twinkleForestryCombatGuard?.(player));
  } catch { return false; }
}

mp.registerCommand("inv", async (player) => {
  try {
    await inventory.openInventory(player);
  } catch (e) {
    console.error("[INVENTORY] /inv error:", e);
  }
});

mp.registerCommand("giveitem", async (player, fullText) => {
  try {
    if (getAdminLevel(player) < 1) {
      return player.outputChatBox("Недостаточно прав для команды /giveitem.");
    }
    const args = String(fullText || "")
      .trim()
      .split(/\s+/);

    const itemId = String(args[0] || "").trim();
    const amount = Math.min(1000, Math.max(1, Math.floor(Number(args[1] || 1))));

    if (!itemId) {
      return player.outputChatBox(
        "Использование: /giveitem [itemId] [amount]"
      );
    }

    const ok = await inventory.addItem(
      player,
      itemId,
      amount
    );

    player.outputChatBox(
      ok
        ? `Предмет добавлен: ${itemId} x${amount}`
        : `Предмет не найден или нет места: ${itemId}`
    );
  } catch (e) {
    console.error(
      "[INVENTORY] /giveitem error:",
      e
    );

    try {
      player.outputChatBox(
        "Ошибка выполнения команды."
      );
    } catch {}
  }
});

mp.events.add(
  "inventory:server:open",
  async (player) => {
    try {
      global.twinkleHunting?.closeInventorySession?.(player);
      await inventory.openInventory(
        player
      );
    } catch (e) {
      console.error(
        "[INVENTORY] inventory:server:open error:",
        e
      );
    }
  }
);

mp.events.add("inventory:server:close", (player) => {
  try { global.twinkleHunting?.closeInventorySession?.(player); } catch {}
});

mp.events.add(
  "inventory:server:move",
  async (player, raw) => {
    try {
      const data = parsePayload(raw);

      if (!data.from || !data.to) {
        return;
      }

      if (data.from.source === "environment" || data.to.source === "environment") {
        const hunting = global.twinkleHunting;
        const hasHuntingSession = Boolean(
          player?.__huntingOpenTentOwner !== null &&
          player?.__huntingOpenTentOwner !== undefined
        ) || Boolean(
          player?.__huntingOpenVehicleId !== null &&
          player?.__huntingOpenVehicleId !== undefined
        );

        if (hasHuntingSession && hunting?.handleInventoryMove) {
          await hunting.handleInventoryMove(player, data);
          return;
        }
      }

      await inventory.moveItem(
        player,
        data.from,
        data.to
      );
    } catch (e) {
      console.error(
        "[INVENTORY] inventory:server:move error:",
        e
      );
    }
  }
);

mp.events.add(
  "inventory:server:action",
  async (player, raw) => {
    try {
      const data = parsePayload(raw);

      if (!data.uid || !data.action) {
        return;
      }

      switch (String(data.action)) {
        case "use": {
          await inventory.useItem(
            player,
            data.uid
          );
          break;
        }

        case "equip": {
          await inventory.equipItem(
            player,
            data.uid,
            data.source,
            data.index
          );
          break;
        }

        case "unequip": {
          await inventory.unequipItem(
            player,
            data.index
          );
          break;
        }

        case "drop": {
          await inventory.dropItem(
            player,
            data.uid,
            data.amount || 1
          );
          break;
        }

        case "give": {
          await inventory.giveItem(
            player,
            data.uid,
            data.amount || 1
          );
          break;
        }

        case "split": {
          await inventory.splitItem(
            player,
            data.uid,
            data.amount
          );
          break;
        }
      }
    } catch (e) {
      console.error(
        "[INVENTORY] inventory:server:action error:",
        e
      );
    }
  }
);

mp.events.add(
  "inventory:item:useWater",
  async (player, item, token) => {
    if (!inventory.isInternalItemUseToken(token)) return;
    try {
      const consumed = await inventory.consumeItemByUid(player, item.uid, item.itemId || item.id, 1);
      if (!consumed?.ok) return;
      await hudNeeds.add(player, { water: Number(item.restoreWater || 25) });
    } catch (e) {
      console.error(
        "[INVENTORY] useWater error:",
        e
      );
    }
  }
);

mp.events.add(
  "inventory:item:useFood",
  async (player, item, token) => {
    if (!inventory.isInternalItemUseToken(token)) return;
    try {
      const consumed = await inventory.consumeItemByUid(player, item.uid, item.itemId || item.id, 1);
      if (!consumed?.ok) return;
      await hudNeeds.add(player, { food: Number(item.restoreFood || 25) });
    } catch (e) {
      console.error(
        "[INVENTORY] useFood error:",
        e
      );
    }
  }
);

mp.events.add(
  "inventory:item:useMedkit",
  async (player, item, token) => {
    if (!inventory.isInternalItemUseToken(token)) return;
    try {
      const consumed = await inventory.consumeItemByUid(player, item.uid, item.itemId || item.id, 1);
      if (!consumed?.ok) return;
      await hudNeeds.setHealth(player, Math.min(
        100,
        Number(player.health || 0) + 50
      ));
    } catch (e) {
      console.error(
        "[INVENTORY] useMedkit error:",
        e
      );
    }
  }
);

mp.events.add(
  "inventory:item:useBandage",
  async (player, item, token) => {
    if (!inventory.isInternalItemUseToken(token)) return;
    try {
      const consumed = await inventory.consumeItemByUid(player, item.uid, item.itemId || item.id, 1);
      if (!consumed?.ok) return;
      await hudNeeds.setHealth(player, Math.min(
        100,
        Number(player.health || 0) + 20
      ));
    } catch (e) {
      console.error(
        "[INVENTORY] useBandage error:",
        e
      );
    }
  }
);

mp.events.add(
  "inventory:item:usePhone",
  async (player, _item, token) => {
    if (!inventory.isInternalItemUseToken(token)) return;
    try {
      player.outputChatBox(
        "Телефон пока не реализован."
      );
    } catch {}
  }
);

mp.events.add(
  "inventory:item:useWeapon",
  async (player, item, token) => {
    if (!inventory.isInternalItemUseToken(token)) return;
    try {
      const ownedItem = await inventory.getOwnedItemByUid(player, item.uid, item.itemId || item.id);
      if (!ownedItem) return;
      await inventory.useWeapon(
        player,
        ownedItem
      );
    } catch (e) {
      console.error(
        "[INVENTORY] useWeapon error:",
        e
      );
    }
  }
);

mp.events.add(
  "inventory:server:quickUse",
  async (player, slot) => {
    try {
      await inventory.useQuickSlot(
        player,
        slot
      );
    } catch (e) {
      console.error(
        "[INVENTORY] inventory:server:quickUse error:",
        e
      );
    }
  }
);
mp.events.add(
  "inventory:server:weaponShot",
  (player, weaponHash, _amount = 1, animalEntityId = -1) => {
    const playerId = Number(player?.id);
    const previous = weaponShotChains.get(playerId) || Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(async () => {
    try {
      const result = weaponShotBlockedBySafeZone(player)
        ? { ok: false, reason: "job_safe_zone", ammo: 0, weaponHash: Number(weaponHash || 0) >>> 0 }
        : await inventory.handleWeaponShot(player, weaponHash, 1);
      const accepted = Boolean(result && (result.ok === true || result === true));
      const normalizedAnimalId = Number(animalEntityId);
      const acceptedWeaponHash = Number(result?.weaponHash || weaponHash || 0) >>> 0;

      try {
        player.call("inventory:client:weaponShotResult", [
          acceptedWeaponHash,
          Number(result?.ammo || 0),
          accepted,
          String(result?.reason || ""),
        ]);
      } catch {}

      if (!accepted) {
        if (Number.isInteger(normalizedAnimalId) && normalizedAnimalId >= 0) {
          console.warn(
            `[HUNTING] Shot rejected | player=${player?.id} weapon=${Number(weaponHash || 0) >>> 0} animal=${normalizedAnimalId} reason=${result?.reason || "unknown"}`
          );

          if (Date.now() - Number(player.__huntingLastRejectedShotAt || 0) > 1200) {
            player.__huntingLastRejectedShotAt = Date.now();
            const reasonText = {
              weapon_not_active: "винтовка не выбрана через быстрый слот",
              weapon_not_owned: "оружие не найдено в инвентаре",
              weapon_broken: "оружие сломано",
              no_ammo: "в инвентаре нет патронов",
              ammo_changed: "состояние патронов изменилось",
            }[String(result?.reason || "")] || String(result?.reason || "неизвестная причина");
            try {
              player.call("hunting:notify", [
                `Выстрел не засчитан сервером: ${reasonText}.`,
              ]);
            } catch {}
          }
        }
        return;
      }

      mp.events.call("hunting:gunshot", player, acceptedWeaponHash);
      console.log(
        `[HUNTING] Shot accepted | player=${player?.id} weapon=${acceptedWeaponHash} item=${String(result?.itemId || "unknown")} target=${Number.isInteger(normalizedAnimalId) && normalizedAnimalId >= 0 ? `animal:${normalizedAnimalId}` : "other"} ammo=${Number(result?.ammo || 0)} durability=${Number(result?.durability ?? -1)}`
      );

      if (accepted && Number.isInteger(normalizedAnimalId) && normalizedAnimalId >= 0) {
        const token = `${Date.now()}:${player.id}:${Math.random().toString(36).slice(2)}`;
        player.__huntingShotTicket = {
          token,
          entityId: normalizedAnimalId,
          weaponHash: acceptedWeaponHash,
          itemId: String(result?.itemId || ""),
          expiresAt: Date.now() + 1000,
        };

        mp.events.call(
          "hunting:validatedShot",
          player,
          normalizedAnimalId,
          acceptedWeaponHash,
          token,
          String(result?.itemId || "")
        );
      }
    } catch (e) {
      console.error(
        "[INVENTORY] weaponShot error:",
        e
      );
    }
      })
      .finally(() => {
        if (weaponShotChains.get(playerId) === current) {
          weaponShotChains.delete(playerId);
        }
      });

    weaponShotChains.set(playerId, current);
  }
);

mp.events.add(
  "inventory:server:useQuickSlot",
  async (player, index) => {
    try {
      await inventory.useQuickSlot(player, index);
    } catch (e) {
      console.error(
        "[INVENTORY] useQuickSlot error:",
        e
      );
    }
  }
);

mp.events.add(
  "inventory:server:restoreEquipment",
  async (player) => {
    try {
      await inventory.restoreEquipment(player);
    } catch (e) {
      console.error(
        "[INVENTORY] restoreEquipment error:",
        e
      );
    }
  }
);

mp.events.add("playerQuit", (player) => {
  weaponShotChains.delete(Number(player?.id));
});

module.exports = inventory;

console.log("[INVENTORY] Loaded");
