"use strict";

const chat = require("../chat/chat.service.js");
const service = require("./fraction.service.js");
const { sanitizeText } = require("../../utils/text.js");

const TABLET_REQUEST_COOLDOWN_MS = 1000;
const lastTabletRequestByPlayer = new Map();

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function safe(player, task) {
  try {
    await task();
  } catch (error) {
    console.error("[FRACTION TABLET]", error);
    const message = sanitizeText(error?.message || "Ошибка выполнения запроса.");
    chat.sendError(player, message);
    try {
      player.call("client:fraction:tablet:error", [message]);
    } catch {}
  }
}

mp.events.add("server:fraction:tablet:request", (player, rawOptions) => {
  const playerId = Number(player?.id);
  const now = Date.now();
  if (now - Number(lastTabletRequestByPlayer.get(playerId) || 0) < TABLET_REQUEST_COOLDOWN_MS) return;
  lastTabletRequestByPlayer.set(playerId, now);

  const requested = parsePayload(rawOptions);
  const reason = String(requested?.reason || "client_request").slice(0, 64);
  return safe(player, () => service.pushOrganization(player, {
    // Cache invalidation and forced refresh are server-owned capabilities.
    force: false,
    reason,
  }));
});

mp.events.add("server:fraction:tablet:subscription", (player, active) => {
  service.setTabletSubscription(player, active === true);
});

mp.events.add("server:fraction:tablet:memberAction", (player, fractionId, targetUuid, action, rawPayload) =>
  safe(player, () =>
    service.memberAction(player, Number(fractionId), Number(targetUuid), String(action), parsePayload(rawPayload))
  )
);

mp.events.add("server:fraction:tablet:balanceAction", (player, fractionId, action, rawPayload) =>
  safe(player, () =>
    service.balanceAction(player, Number(fractionId), String(action), parsePayload(rawPayload))
  )
);

mp.events.add("server:fraction:tablet:massBonusAction", (player, fractionId, rawPayload) =>
  safe(player, () =>
    service.massBonusAction(player, Number(fractionId), parsePayload(rawPayload))
  )
);

mp.events.add("server:fraction:tablet:blacklistAdd", (player, fractionId, rawPayload) =>
  safe(player, () =>
    service.blacklistAdd(player, Number(fractionId), parsePayload(rawPayload))
  )
);

mp.events.add("server:fraction:tablet:blacklistRemove", (player, fractionId, rawPayload) =>
  safe(player, () =>
    service.blacklistRemove(player, Number(fractionId), parsePayload(rawPayload))
  )
);

mp.events.add(
  "server:fraction:tablet:permission",
  (player, fractionId, rankIndex, permissionId, enabled) =>
    safe(player, () =>
      service.togglePermission(
        player,
        Number(fractionId),
        Number(rankIndex),
        String(permissionId),
        Boolean(enabled)
      )
    )
);

mp.events.add("server:fraction:tablet:createDepartment", (player, fractionId, rawPayload) =>
  safe(player, () =>
    service.createDepartment(player, Number(fractionId), parsePayload(rawPayload))
  )
);

mp.events.add("playerQuit", (player) => {
  lastTabletRequestByPlayer.delete(Number(player?.id));
  service.setTabletSubscription(player, false);
  const uuid = service.playerUuid(player);
  const fractionId = Number(player?.fractionId || player?.fraction || player?.character?.fraction_id || 0);
  if (!uuid) return;
  service.ensureSchema()
    .then(() => require("../../database/query.js").query(
      "UPDATE fraction_members SET last_seen_at = NOW() WHERE character_uuid = ?",
      [uuid]
    ))
    .then(() => {
      if (fractionId) return service.updateOnlineFraction(fractionId);
      return null;
    })
    .catch(() => null);
});

mp.events.add("twinkle:character:loaded", (player) => {
  safe(player, async () => {
    await service.preloadOrganization(player);
    const fractionId = Number(player?.fractionId || player?.fraction || player?.character?.fraction_id || 0);
    if (fractionId) {
      await service.updateOnlineFraction(fractionId);
    }
  });
});

service.ensureSchema()
  .then(() => console.log("[FRACTION TABLET] Schema ready"))
  .catch((error) => console.error("[FRACTION TABLET] Schema error:", error));

console.log("[FRACTION TABLET] Loaded");
