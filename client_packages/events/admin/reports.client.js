"use strict";

function execReportsCode(code) {
  try {
    if (global.uiBrowser?.execute) {
      global.uiBrowser.execute(code);
      return;
    }

    if (globalThis.twinkleBrowser?.browser?.execute) {
      globalThis.twinkleBrowser.browser.execute(code);
      return;
    }

    if (globalThis.twinkleBrowser?.cef?.execute) {
      globalThis.twinkleBrowser.cef.execute(code);
      return;
    }

    if (globalThis.browser?.execute) {
      globalThis.browser.execute(code);
      return;
    }

    if (mp.browsers?.forEach) {
      mp.browsers.forEach((browser) => {
        try {
          if (browser?.execute) browser.execute(code);
        } catch {}
      });
    }
  } catch (e) {
    console.log("[REPORTS] execReportsCode error:", e);
  }
}

function parsePayload(payloadJson, fallback) {
  try {
    return typeof payloadJson === "string"
      ? JSON.parse(payloadJson)
      : payloadJson;
  } catch {
    return fallback;
  }
}

function sendToF2Reports(payload) {
  const json = JSON.stringify(payload || []);

  execReportsCode(`
    try {
      window.__TWINKLE_REPORTS__ = ${json};

      window.dispatchEvent(new CustomEvent("twinkle:reports:set", {
        detail: ${json}
      }));
    } catch (e) {
      console.log("[REPORTS CEF ERROR]", e);
    }
  `);
}

function sendToPlayerReports(payload) {
  const json = JSON.stringify(payload || []);

  execReportsCode(`
    try {
      window.__TWINKLE_PLAYER_REPORTS__ = ${json};

      window.dispatchEvent(new CustomEvent("twinkle:reports:set", {
        detail: ${json}
      }));
    } catch (e) {
      console.log("[PLAYER REPORTS CEF ERROR]", e);
    }
  `);
}

function sendToReportsStatistics(payload) {
  const json = JSON.stringify(payload || {
    total: 0,
    opened: 0,
    closed: 0,
    avgSeconds: 0,
    avgText: "0 сек.",
  });

  execReportsCode(`
    try {
      window.__TWINKLE_REPORTS_STATISTICS__ = ${json};

      window.dispatchEvent(new CustomEvent("twinkle:reports:statistics", {
        detail: ${json}
      }));
    } catch (e) {
      console.log("[REPORTS STATISTICS CEF ERROR]", e);
    }
  `);
}

function sendToReportsPermissions(payload) {
  const json = JSON.stringify(payload || {
    isAdmin: false,
    adminLevel: 0,
  });

  execReportsCode(`
    try {
      window.__TWINKLE_REPORTS_PERMISSIONS__ = ${json};

      window.dispatchEvent(new CustomEvent("twinkle:reports:permissions", {
        detail: ${json}
      }));
    } catch (e) {
      console.log("[REPORTS PERMISSIONS CEF ERROR]", e);
    }
  `);
}

mp.events.add("c:reports:set", (payloadJson = "[]") => {
  sendToF2Reports(parsePayload(payloadJson, []));
});

mp.events.add("c:reports:setPlayerReports", (payloadJson = "[]") => {
  sendToPlayerReports(parsePayload(payloadJson, []));
});

mp.events.add("c:reports:statistics", (payloadJson = "{}") => {
  sendToReportsStatistics(parsePayload(payloadJson, {
    total: 0,
    opened: 0,
    closed: 0,
    avgSeconds: 0,
    avgText: "0 сек.",
  }));
});

mp.events.add("c:reports:permissions", (payloadJson = "{}") => {
  sendToReportsPermissions(parsePayload(payloadJson, {
    isAdmin: false,
    adminLevel: 0,
  }));
});

mp.events.add("reports:create", (text) => {
  try {
    mp.events.callRemote("s:reports:create", String(text || ""));
  } catch {}
});

mp.events.add("reports:request", () => {
  try {
    mp.events.callRemote("s:reports:request");
  } catch {}
});

mp.events.add("reports:statistics", () => {
  try {
    mp.events.callRemote("s:reports:statistics");
  } catch {}
});

mp.events.add("reports:player:request", () => {
  try {
    mp.events.callRemote("s:reports:player:request");
  } catch {}
});

mp.events.add("reports:select", (reportId) => {
  try {
    mp.events.callRemote("s:reports:select", Number(reportId));
  } catch {}
});

mp.events.add("reports:sendMessage", (reportId, text) => {
  try {
    mp.events.callRemote("s:reports:sendMessage", Number(reportId), String(text || ""));
  } catch {}
});

mp.events.add("reports:close", (reportId) => {
  try {
    mp.events.callRemote("s:reports:close", Number(reportId));
  } catch {}
});

mp.events.add("reports:needHelp", (reportId) => {
  try {
    mp.events.callRemote("s:reports:needHelp", Number(reportId));
  } catch {}
});

mp.events.add("reports:take", (reportId) => {
  try {
    mp.events.callRemote("s:reports:take", Number(reportId));
  } catch {}
});

mp.events.add("reports:teleportToPlayer", (reportId) => {
  try {
    mp.events.callRemote("s:reports:teleportToPlayer", Number(reportId));
  } catch {}
});

mp.events.add("reports:teleportPlayerToMe", (reportId) => {
  try {
    mp.events.callRemote("s:reports:teleportPlayerToMe", Number(reportId));
  } catch {}
});

console.log("[REPORTS] Client loaded");
