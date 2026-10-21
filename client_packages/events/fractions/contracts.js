"use strict";

mp.events.add("contract:accept", (payloadJson) => {
    mp.events.callRemote("server:contract:accept", payloadJson || "{}");
});

mp.events.add("contract:decline", (payloadJson) => {
    mp.events.callRemote("server:contract:decline", payloadJson || "{}");
});