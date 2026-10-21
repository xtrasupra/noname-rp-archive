"use strict";

const logsDb = require("../../database/logs.js");

mp.events.add("twinkle:character:loaded", (player) => {
  logsDb.writePlayerSessionLog(player, "join", {
    reasonType: "loaded",
    reason: "Вход в игру",
  }).catch((error) => console.log("[SESSION LOG] join:", error?.message || error));
});

mp.events.add("playerQuit", (player) => {
  logsDb.writePlayerSessionLog(player, "leave").catch((error) =>
    console.log("[SESSION LOG] leave:", error?.message || error)
  );
});

logsDb.ensureLogsSchema()
  .then(() => console.log("[SESSION LOG] Loaded"))
  .catch((error) => console.log("[SESSION LOG] Schema error:", error?.message || error));
