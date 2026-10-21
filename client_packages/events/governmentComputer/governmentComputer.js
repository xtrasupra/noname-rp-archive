"use strict";

const PAGE_NAME = "government-computer";
const KEY_E = 0x45;
const KEY_ESCAPE = 0x1B;
let available = false;
let opened = false;

function setHint(state) {
  try { mp.events.call("c:hud:interaction", JSON.stringify(state ? { key: "E", holdRequired: false } : null)); } catch {}
}
function refreshHint() {
  const activePage = global.interfaceLock?.getInterfaceState?.()?.activePage;
  setHint(available && !opened && !activePage);
}
function parse(raw) {
  try { return typeof raw === "object" ? raw : JSON.parse(String(raw || "{}")); } catch { return {}; }
}
function close(notifyServer = true) {
  if (global.interfaceLock) global.interfaceLock.closePage(PAGE_NAME);
  opened = false;
  refreshHint();
  if (notifyServer) try { mp.events.callRemote("server:governmentComputer:close"); } catch {}
}

mp.events.add("client:governmentComputer:setAvailable", (state) => {
  available = Boolean(state);
  refreshHint();
  if (!available && opened) close(false);
});
mp.events.add("client:governmentComputer:open", (payloadRaw) => {
  if (!global.interfaceLock) return;
  setHint(false);
  opened = Boolean(global.interfaceLock.openPage(PAGE_NAME, null, parse(payloadRaw)));
  if (!opened) refreshHint();
});
mp.events.add("client:governmentComputer:update", (payloadRaw) => {
  if (opened && global.interfaceLock) global.interfaceLock.openPage(PAGE_NAME, null, parse(payloadRaw));
});
mp.events.add("client:governmentComputer:operationResult", (payloadRaw) => {
  if (!opened || !global.uiBrowser) return;
  const detail = JSON.stringify(parse(payloadRaw)).replace(/[\u2028\u2029]/g, "");
  global.uiBrowser.execute(`window.dispatchEvent(new CustomEvent("twinkle:government-computer:result", { detail: ${detail} }));`);
});
mp.events.add("client:governmentComputer:close", () => close(false));
mp.events.add("government-computer:closeFromBrowser", () => close(true));
mp.events.add("government-computer:orderMaterialsFromBrowser", (fractionId, amount) => {
  const requestId = `gov-order:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
  mp.events.callRemote("server:governmentComputer:orderMaterials", Number(fractionId), Number(amount), requestId);
});
mp.events.add("government-computer:saveDecreeFromBrowser", (payload) => {
  mp.events.callRemote("server:governmentComputer:saveDecree", typeof payload === "string" ? payload : JSON.stringify(payload || {}));
});
mp.events.add("government-computer:deleteDecreeFromBrowser", (id) => {
  mp.events.callRemote("server:governmentComputer:deleteDecree", Number(id));
});
mp.keys.bind(KEY_E, false, () => {
  if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__) return;
  if (!available || opened || global.interfaceLock?.getInterfaceState?.()?.activePage) return;
  mp.events.callRemote("server:governmentComputer:requestOpen");
});
mp.keys.bind(KEY_ESCAPE, false, () => { if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__) return; if (opened) close(true); });
mp.events.add("playerQuit", () => { available = false; opened = false; setHint(false); });

console.log("[GOVERNMENT COMPUTER] Client loaded");
