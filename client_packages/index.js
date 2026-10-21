require("./events/hud/hudSnapshot.js");
require("./events/interfaceLock.js");
require('./loader.js');

let cursorVisibleDebug = false;
mp.gui.chat.activate(false);
mp.gui.chat.show(false);

mp.keys.bind(0xC0, false, () => { 
  if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__) return;
  cursorVisibleDebug = !cursorVisibleDebug;
  mp.gui.cursor.show(cursorVisibleDebug, cursorVisibleDebug);
});

mp.events.add("render", () => {
  mp.game.controls.disableControlAction(0, 37, true);
});

"use strict";

mp.keys.bind(0x45, true, () => { // E
    if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__) return;

    if (mp.gui.cursor.visible)
        return;

    if (mp.players.local.vehicle)
        return;

    mp.events.callRemote("server.house.pressE");

});
