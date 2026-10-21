"use strict";

mp.gui.chat.show(false);

const bindKey =
    global.bindKey ||
    ((key, hold, cb) => mp.keys.bind(key, hold, cb));

let opened = false;
let history = [];

function browser() {

    return (
        global.uiBrowser ||
        globalThis.browser ||
        globalThis.twinkleBrowser?.browser ||
        globalThis.twinkleBrowser?.cef
    );

}

function execute(js){

    const b=browser();

    if(!b?.execute)
        return;

    b.execute(js);

}

function push(message){

    history.push(message);

    if(history.length>200){

        history.splice(
            0,
            history.length-200
        );

    }

    if (global.uiState?.rememberEvent) {
        global.uiState.rememberEvent("hud", "twinkle:chat:add", message, {
            retryKey: "hud:chat:add",
        });

        global.uiState.patch("hud", {
            chat: {
                isVisible: true,
                isActive: opened,
                messages: history,
                maxMessages: 80,
            },
        }, {
            eventName: "twinkle:hud:update",
            globalName: "__TWINKLE_HUD_PAYLOAD__",
            retryKey: "hud:payload",
            push: true,
        });
    }

    execute(`
        window.dispatchEvent(
            new CustomEvent(
                "twinkle:chat:add",
                {
                    detail:${JSON.stringify(message)}
                }
            )
        );
    `);

}

function replace(list){

    history=list;

    if (global.uiState?.rememberEvent) {
        global.uiState.rememberEvent("hud", "twinkle:chat:history", list, {
            retryKey: "hud:chat:history",
        });

        global.uiState.patch("hud", {
            chat: {
                isVisible: true,
                isActive: opened,
                messages: history,
                maxMessages: 80,
            },
        }, {
            eventName: "twinkle:hud:update",
            globalName: "__TWINKLE_HUD_PAYLOAD__",
            retryKey: "hud:payload",
            push: true,
        });
    }

    execute(`
        window.dispatchEvent(
            new CustomEvent(
                "twinkle:chat:history",
                {
                    detail:${JSON.stringify(list)}
                }
            )
        );
    `);

}

function open(prefix=""){

    if(opened)
        return;

    const state = global.interfaceLock?.getInterfaceState?.();
    // A page lock can remain stale after a CEF page closes. Only a page that
    // still owns the cursor should prevent the player from opening the chat.
    if (state?.activePage && mp.gui.cursor.visible) {
        return;
    }

    opened=true;
    global.interfaceLock?.syncChatState?.(true);

    mp.gui.cursor.show(true,true);

    if (global.uiState?.remember) {
        global.uiState.patch("hud", {
            chat: {
                isVisible: true,
                isActive: opened,
                messages: history,
                maxMessages: 80,
            },
        }, {
            eventName: "twinkle:hud:update",
            globalName: "__TWINKLE_HUD_PAYLOAD__",
            retryKey: "hud:payload",
            push: true,
        });
    }

    execute(`
        window.dispatchEvent(
            new CustomEvent(
                "twinkle:chat:open",
                {
                    detail:{
                        prefix:${JSON.stringify(prefix)}
                    }
                }
            )
        );
    `);

}

function close(){

    if(!opened)
        return;

    opened=false;
    global.interfaceLock?.syncChatState?.(false);

    mp.gui.cursor.show(false,false);

    if (global.uiState?.patch) {
        global.uiState.patch("hud", {
            chat: {
                isVisible: true,
                isActive: opened,
                messages: history,
                maxMessages: 80,
            },
        }, {
            eventName: "twinkle:hud:update",
            globalName: "__TWINKLE_HUD_PAYLOAD__",
            retryKey: "hud:payload",
            push: true,
        });
    }

    execute(`
        window.dispatchEvent(
            new CustomEvent(
                "twinkle:chat:close"
            )
        );
    `);

}

bindKey(
    0x54,
    false,
    ()=>{

        open();

    },
    { allowWhenBlocked: true }
);

bindKey(
    0x1B,
    false,
    ()=>{

        close();

    }
);

mp.events.add(
    "chat:send",
    payload=>{

        close();

        let text = String(payload || "").trim();
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === "object") {
                text = String(parsed.message || "").trim();
                const channel = String(parsed.channel || "IC").toLowerCase();
                if (text && !text.startsWith("/") && ["do", "fam", "fraction", "me", "ooc", "try"].includes(channel)) {
                    text = `/${channel} ${text}`;
                }
            }
        } catch {}

        if (!text) return;

        mp.events.callRemote(
            "chat:server:send",
            text
        );

    }
);

mp.events.add("chat:closed", () => close());

mp.events.add(
    "chat:client:add",
    json=>{

        try{

            push(
                JSON.parse(json)
            );

        }catch{}

    }
);

mp.events.add(
    "chat:client:history",
    json=>{

        try{

            replace(
                JSON.parse(json)
            );

        }catch{}

    }
);

mp.events.add(
    "chat:client:clear",
    ()=>{

        history=[];

        replace([]);

    }
);

mp.events.add(
    "chat:client:open",
    prefix=>{

        open(prefix);

    }
);

mp.events.add(
    "chat:client:close",
    ()=>{

        close();

    }
);

mp.events.add(
    "playerReady",
    ()=>{

        setTimeout(()=>{

            mp.events.callRemote(
                "chat:server:history:request"
            );

        },500);

    }
);

console.log("[CHAT] Client loaded");
