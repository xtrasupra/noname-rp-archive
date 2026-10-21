"use strict";

mp._commandList = mp._commandList || {};
mp._nativeCommandList = mp._nativeCommandList || {};

function parseCommandText(fullText = "", args = []) {
  const parsedArgs = Array.isArray(args) && args.length
    ? args.map((arg) => String(arg))
    : String(fullText || "").trim().split(/\s+/).filter(Boolean);
  const text = String(fullText || "").trim() || parsedArgs.join(" ");

  return {
    text,
    args: parsedArgs,
  };
}

function registerNativeCommand(commandName, handler) {
  if (!mp.events || typeof mp.events.addCommand !== "function") {
    return false;
  }

  if (mp._nativeCommandList[commandName]) {
    return true;
  }

  try {
    mp.events.addCommand(commandName, (player, fullText = "", ...args) => {
      const parsed = parseCommandText(fullText, args);
      const currentHandler = mp._commandList[commandName];

      try {
        if (typeof currentHandler === "function") {
          currentHandler(player, parsed.text, parsed.args);
        }
      } catch (err) {
        console.log(`[COMMANDS] Native error /${commandName}:`, err);
      }
    });

    mp._nativeCommandList[commandName] = true;
    console.log(`[COMMANDS] Native registered /${commandName}`);
    return true;
  } catch (err) {
    console.log(`[COMMANDS] Native register failed /${commandName}:`, err.message);
    return false;
  }
}

mp.registerCommand = function registerCommand(name, handler) {
  if (!name || typeof handler !== "function") {
    return false;
  }

  const commandName = String(name).toLowerCase().trim();

  if (!commandName) {
    return false;
  }

  mp._commandList[commandName] = handler;
  registerNativeCommand(commandName, handler);

  console.log(`[COMMANDS] Registered /${commandName}`);

  return true;
};

mp.unregisterCommand = function unregisterCommand(name, expectedHandler) {
  const commandName = String(name || "").toLowerCase().trim();
  const currentHandler = mp._commandList[commandName];

  if (!commandName || typeof currentHandler !== "function") {
    return false;
  }

  if (expectedHandler && currentHandler !== expectedHandler) {
    return false;
  }

  delete mp._commandList[commandName];
  console.log(`[COMMANDS] Unregistered /${commandName}`);
  return true;
};

mp.callCommand = function callCommand(commandName, player, fullText = "", args = []) {
  const name = String(commandName || "").toLowerCase().trim();
  const command = mp._commandList[name];

  if (typeof command !== "function") {
    return false;
  }

  try {
    command(player, fullText, args);
  } catch (e) {
    console.log(`[COMMANDS] Error /${name}:`, e);
  }

  return true;
};

mp.hasCommand = function hasCommand(commandName) {
  const name = String(commandName || "").toLowerCase().trim();
  return typeof mp._commandList[name] === "function";
};

mp.getCommandList = function getCommandList() {
  return Object.keys(mp._commandList);
};

console.log("[COMMANDS] Registry loaded");
