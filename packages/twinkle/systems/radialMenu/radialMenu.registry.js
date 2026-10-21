"use strict";

const CONTRACT_VERSION = 1;
const MAX_GROUPS = 16;
const MAX_ACTIONS = 96;
const MAX_CHILDREN = 24;
const MAX_TEXT_LENGTH = 160;
const MAX_RENDERED_PAYLOAD_BYTES = 6500;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9:_-]{1,63}$/i;
const TARGET_KINDS = Object.freeze(["self", "player", "vehicle"]);
const TARGET_KIND_SET = new Set(TARGET_KINDS);

function assertIdentifier(value, fieldName) {
  const identifier = String(value || "").trim();

  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new TypeError(`${fieldName} must contain 2-64 safe identifier characters.`);
  }

  return identifier;
}

function boundedText(value, fallback = "", maxLength = MAX_TEXT_LENGTH) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function boundedOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? Math.max(-10000, Math.min(10000, order)) : 0;
}

function normalizeTargetKinds(value, fallback = ["self"]) {
  const source = value === undefined ? fallback : (Array.isArray(value) ? value : [value]);
  const targetKinds = [...new Set(source.map((entry) => String(entry || "").trim().toLowerCase()))]
    .filter((entry) => TARGET_KIND_SET.has(entry));

  if (!targetKinds.length || targetKinds.length !== source.length) {
    throw new TypeError(`targetKinds must contain only: ${TARGET_KINDS.join(", ")}.`);
  }

  return Object.freeze(targetKinds);
}

function supportsTargetKind(definition, targetKind) {
  return definition.targetKinds.includes(TARGET_KIND_SET.has(targetKind) ? targetKind : "self");
}

function normalizeDisplayState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const normalized = {};
  const booleanFields = ["disabled", "hidden", "closeOnSelect"];
  const textFields = ["label", "shortLabel", "icon", "description", "disabledReason"];

  for (const field of booleanFields) {
    if (typeof value[field] === "boolean") normalized[field] = value[field];
  }
  for (const field of textFields) {
    if (value[field] !== undefined) normalized[field] = boundedText(value[field]);
  }

  return normalized;
}

class RadialMenuRegistry {
  constructor() {
    this.groups = new Map();
    this.actions = new Map();
    this.eventHandlers = new Map();
    this.reportedCoreConflicts = new Set();
    this.reportedBudgetActions = new Set();
    this.sequence = 0;
    this.revision = 0;
  }

  registerGroup(definition) {
    const id = assertIdentifier(definition?.id, "group.id");
    const owner = assertIdentifier(definition?.owner || "twinkle", "group.owner");

    if (this.groups.size >= MAX_GROUPS && !this.groups.has(id)) {
      throw new Error(`Radial menu group limit (${MAX_GROUPS}) reached.`);
    }

    const existing = this.groups.get(id);
    if (existing && existing.owner !== owner) {
      throw new Error(`Radial menu group '${id}' is owned by '${existing.owner}'.`);
    }

    const entry = {
      id,
      owner,
      label: boundedText(definition.label, id, 64),
      icon: boundedText(definition.icon, "circle", 48),
      description: boundedText(definition.description),
      order: boundedOrder(definition.order),
      resolve: typeof definition.resolve === "function" ? definition.resolve : null,
      targetKinds: normalizeTargetKinds(definition.targetKinds, TARGET_KINDS),
      sequence: existing?.sequence ?? this.sequence++,
    };

    this.groups.set(id, entry);
    this.revision += 1;
    return () => this.unregisterGroup(id, owner);
  }

  unregisterGroup(id, owner) {
    const groupId = String(id || "");
    const entry = this.groups.get(groupId);

    if (!entry || entry.owner !== owner) return false;

    this.groups.delete(groupId);
    for (const [actionId, action] of this.actions) {
      if (action.groupId === groupId && action.owner === owner) this.actions.delete(actionId);
    }
    this.revision += 1;
    return true;
  }

  registerAction(definition) {
    const id = assertIdentifier(definition?.id, "action.id");
    const groupId = assertIdentifier(definition?.groupId, "action.groupId");
    const owner = assertIdentifier(definition?.owner || "twinkle", "action.owner");
    const parentId = definition?.parentId
      ? assertIdentifier(definition.parentId, "action.parentId")
      : "";
    const event = definition?.event
      ? assertIdentifier(definition.event, "action.event")
      : "";

    if (this.actions.size >= MAX_ACTIONS && !this.actions.has(id)) {
      throw new Error(`Radial menu action limit (${MAX_ACTIONS}) reached.`);
    }

    const existing = this.actions.get(id);
    if (existing && existing.owner !== owner) {
      throw new Error(`Radial menu action '${id}' is owned by '${existing.owner}'.`);
    }
    if (parentId === id) throw new Error("A radial menu action cannot be its own parent.");
    if (typeof definition.handler !== "function" && !event) {
      throw new TypeError(`Radial menu action '${id}' requires handler or event.`);
    }

    const entry = {
      id,
      groupId,
      parentId,
      owner,
      event,
      handler: typeof definition.handler === "function" ? definition.handler : null,
      resolve: typeof definition.resolve === "function" ? definition.resolve : null,
      label: boundedText(definition.label, id, 64),
      shortLabel: boundedText(definition.shortLabel, "", 32),
      icon: boundedText(definition.icon, "circle", 48),
      description: boundedText(definition.description),
      disabled: Boolean(definition.disabled),
      disabledReason: boundedText(definition.disabledReason),
      hidden: Boolean(definition.hidden),
      closeOnSelect: definition.closeOnSelect !== false,
      order: boundedOrder(definition.order),
      targetKinds: normalizeTargetKinds(definition.targetKinds),
      sequence: existing?.sequence ?? this.sequence++,
    };

    this.actions.set(id, entry);
    this.revision += 1;
    return () => this.unregisterAction(id, owner);
  }

  unregisterAction(id, owner) {
    const actionId = String(id || "");
    const entry = this.actions.get(actionId);

    if (!entry || entry.owner !== owner) return false;

    this.actions.delete(actionId);
    this.revision += 1;
    return true;
  }

  registerEvent(eventName, handler, owner = "twinkle") {
    const event = assertIdentifier(eventName, "eventName");
    const eventOwner = assertIdentifier(owner, "event.owner");

    if (typeof handler !== "function") throw new TypeError("Radial menu event handler must be a function.");

    const existing = this.eventHandlers.get(event);
    if (existing && existing.owner !== eventOwner) {
      throw new Error(`Radial menu event '${event}' is owned by '${existing.owner}'.`);
    }

    this.eventHandlers.set(event, { owner: eventOwner, handler });
    return () => {
      const current = this.eventHandlers.get(event);
      if (!current || current.owner !== eventOwner) return false;
      this.eventHandlers.delete(event);
      return true;
    };
  }

  unregisterOwner(owner) {
    const ownerId = String(owner || "");
    let removed = 0;

    for (const [id, entry] of this.actions) {
      if (entry.owner === ownerId) {
        this.actions.delete(id);
        removed += 1;
      }
    }
    for (const [id, entry] of this.groups) {
      if (entry.owner === ownerId) {
        this.groups.delete(id);
        removed += 1;
      }
    }
    for (const [id, entry] of this.eventHandlers) {
      if (entry.owner === ownerId) {
        this.eventHandlers.delete(id);
        removed += 1;
      }
    }

    if (removed) this.revision += 1;
    return removed;
  }

  async extendGroups(player, baseGroups, context = {}) {
    const targetKind = TARGET_KIND_SET.has(context?.target?.kind) ? context.target.kind : "self";
    const groups = Array.isArray(baseGroups) ? baseGroups.map((group) => ({
      ...group,
      items: Array.isArray(group.items) ? [...group.items] : [],
    })) : [];
    const groupMap = new Map(groups.map((group) => [String(group.id), group]));
    const sortedGroups = [...this.groups.values()].sort((left, right) => (
      left.order - right.order || left.sequence - right.sequence
    ));

    for (const definition of sortedGroups) {
      if (!supportsTargetKind(definition, targetKind)) continue;

      const state = normalizeDisplayState(await definition.resolve?.(player, context));
      const existing = groupMap.get(definition.id);

      if (existing) {
        Object.assign(existing, state);
        continue;
      }
      if (groups.length >= MAX_GROUPS) break;

      const group = {
        id: definition.id,
        label: state.label || definition.label,
        icon: state.icon || definition.icon,
        items: [],
      };
      if (state.description || definition.description) group.description = state.description || definition.description;
      if (state.disabled) group.disabled = true;
      if (state.disabledReason) group.disabledReason = state.disabledReason;
      if (state.hidden) group.hidden = true;
      groups.push(group);
      groupMap.set(group.id, group);
    }

    const sortedActions = [...this.actions.values()].sort((left, right) => (
      left.order - right.order || left.sequence - right.sequence
    ));
    const rendered = new Map();
    const renderedGroups = new Map();

    const indexItems = (items, groupId) => {
      for (const item of items || []) {
        const itemId = String(item?.id || "");
        if (itemId) {
          if (rendered.has(itemId)) throw new Error(`Duplicate core radial menu action '${itemId}'.`);
          rendered.set(itemId, item);
          renderedGroups.set(itemId, groupId);
        }
        indexItems(item?.children, groupId);
      }
    };

    for (const group of groups) indexItems(group.items, String(group.id));

    for (const definition of sortedActions) {
      if (!supportsTargetKind(definition, targetKind)) continue;

      const group = groupMap.get(definition.groupId);
      if (!group) continue;
      if (rendered.has(definition.id)) {
        if (!this.reportedCoreConflicts.has(definition.id)) {
          this.reportedCoreConflicts.add(definition.id);
          console.error(`[RADIAL MENU] Extension action '${definition.id}' conflicts with a core action and was skipped.`);
        }
        continue;
      }

      const state = normalizeDisplayState(await definition.resolve?.(player, context));
      const item = {
        id: definition.id,
        label: state.label || definition.label,
        icon: state.icon || definition.icon,
      };
      const shortLabel = state.shortLabel || definition.shortLabel;
      const description = state.description || definition.description;
      const disabled = state.disabled ?? definition.disabled;
      const disabledReason = state.disabledReason || definition.disabledReason;
      const hidden = state.hidden ?? definition.hidden;
      const closeOnSelect = state.closeOnSelect ?? definition.closeOnSelect;

      if (shortLabel) item.shortLabel = shortLabel;
      if (description) item.description = description;
      if (disabled) item.disabled = true;
      if (disabledReason) item.disabledReason = disabledReason;
      if (hidden) item.hidden = true;
      if (closeOnSelect === false) item.closeOnSelect = false;
      rendered.set(definition.id, item);

      if (definition.parentId) {
        const parent = rendered.get(definition.parentId);
        if (!parent) throw new Error(`Radial menu parent '${definition.parentId}' must be ordered before '${definition.id}'.`);
        if (renderedGroups.get(definition.parentId) !== definition.groupId) {
          throw new Error(`Radial menu parent '${definition.parentId}' belongs to another group.`);
        }
        if (!Array.isArray(parent.children)) parent.children = [];
        if (parent.children.length < MAX_CHILDREN) parent.children.push(item);
      } else if (group.items.length < MAX_CHILDREN) {
        group.items.push(item);
      }
      renderedGroups.set(definition.id, definition.groupId);

      const budgetJson = JSON.stringify(
        { contractVersion: CONTRACT_VERSION, groups },
        (key, value) => {
          if (key === "description" || key === "shortLabel" || key === "payload") return undefined;
          if (key === "disabledReason" && value) return "Недоступно.";
          return value;
        }
      );
      if (Buffer.byteLength(budgetJson, "utf8") > MAX_RENDERED_PAYLOAD_BYTES) {
        if (definition.parentId) {
          const parent = rendered.get(definition.parentId);
          parent.children = (parent.children || []).filter((child) => child !== item);
        } else {
          group.items = group.items.filter((child) => child !== item);
        }
        rendered.delete(definition.id);
        renderedGroups.delete(definition.id);

        if (!this.reportedBudgetActions.has(definition.id)) {
          this.reportedBudgetActions.add(definition.id);
          console.error(`[RADIAL MENU] Extension action '${definition.id}' exceeded the menu payload budget and was skipped.`);
        }
      }
    }

    return {
      contractVersion: CONTRACT_VERSION,
      groups: groups.filter((group) => Array.isArray(group.items) && group.items.length > 0),
      revision: this.revision,
    };
  }

  async execute(player, actionId, context = {}) {
    const definition = this.actions.get(String(actionId || ""));
    if (!definition) return false;

    const targetKind = TARGET_KIND_SET.has(context?.target?.kind) ? context.target.kind : "self";
    if (!supportsTargetKind(definition, targetKind)) throw new Error("Действие недоступно для выбранной цели.");

    const state = normalizeDisplayState(await definition.resolve?.(player, context));
    if ((state.hidden ?? definition.hidden) === true) throw new Error("Действие недоступно.");
    if ((state.disabled ?? definition.disabled) === true) {
      throw new Error(state.disabledReason || definition.disabledReason || "Действие недоступно.");
    }

    const executionContext = Object.freeze({
      actionId: definition.id,
      groupId: definition.groupId,
      owner: definition.owner,
      ...context,
    });

    if (definition.handler) {
      await definition.handler(player, executionContext);
      return true;
    }

    const eventHandler = this.eventHandlers.get(definition.event);
    if (!eventHandler) throw new Error("Обработчик действия не зарегистрирован.");

    await eventHandler.handler(player, executionContext);
    return true;
  }
}

const registry = global.__twinkleRadialMenuRegistry instanceof RadialMenuRegistry
  ? global.__twinkleRadialMenuRegistry
  : new RadialMenuRegistry();

global.__twinkleRadialMenuRegistry = registry;

module.exports = registry;
module.exports.RadialMenuRegistry = RadialMenuRegistry;
module.exports.CONTRACT_VERSION = CONTRACT_VERSION;
module.exports.MAX_RENDERED_PAYLOAD_BYTES = MAX_RENDERED_PAYLOAD_BYTES;
module.exports.TARGET_KINDS = TARGET_KINDS;
