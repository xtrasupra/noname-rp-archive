# Server-side G-menu extensions

The G-menu accepts extensions only from trusted server modules. The client receives display metadata and an opaque action ID; it never receives or chooses an executable server event name.

## Direct handler

```js
const radialMenu = require("../radialMenu/radialMenu.registry.js");

radialMenu.registerAction({
  owner: "my-system",
  groupId: "documents",
  id: "my-system:show-card",
  targetKinds: ["self", "player"],
  label: "My card",
  icon: "id-card",
  description: "Show the card to a nearby player.",
  order: 10,
  resolve: async (player) => ({
    disabled: !player.character?.myCard,
    disabledReason: "The card has not been issued.",
  }),
  handler: async (player, context) => {
    // context.target is the server-validated self/player/vehicle target used to build this menu.
    // Revalidate feature-specific ownership and permissions here, then perform the action.
  },
});
```

## Named internal event

Named events are local to the registry and are not RAGE:MP remote events. This lets several actions share one trusted server handler without exposing an event name to CEF or clientside code.

```js
radialMenu.registerEvent("my-system:dispatch", async (player, context) => {
  // context.actionId and context.groupId are server-owned values.
}, "my-system");

radialMenu.registerAction({
  owner: "my-system",
  groupId: "property",
  id: "my-system:property-action",
  targetKinds: ["player"],
  label: "Property action",
  icon: "house",
  event: "my-system:dispatch",
});
```

Use `registerGroup` before `registerAction` when a new top-level group is required. Action `targetKinds` may contain `self`, `player`, or `vehicle`; omitted action target kinds default to `self`. A custom group can also declare `targetKinds` and otherwise acts as a reusable container for all target kinds. IDs are unique, registrations are owner-scoped, menu size and text are bounded, and each selection is rebuilt against the same server-owned target before dispatch.
