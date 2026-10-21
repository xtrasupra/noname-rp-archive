"use strict";

const PAGE_NAME = "businessShop";
const INTERACT_KEY = 0x45;

let nearbyBusiness = null;
let shopOpen = false;
let currentShopPayload = null;
let previewCamera = null;
let previewModeActive = false;
let previewVisibilityOwned = false;
let previewReadyTimer = null;
const previewVisibilityTimers = new Set();
let previewSnapshot = null;
let previewStage = null;
let purchaseSequence = 0;
let shopInstance = 0;
const pendingPurchases = new Map();
let tabletBusinessState = { businesses: [], marketplace: { listings: [] } };

const PREVIEW_READY_POLL_MS = 50;
const PREVIEW_READY_TIMEOUT_MS = 5000;
const PREVIEW_STAGE_POSITION_TOLERANCE = 1.0;
const PURCHASE_RETRY_DELAYS_MS = Object.freeze([8000, 20000]);
const PURCHASE_MANUAL_RETRY_DELAY_MS = 8000;

const PREVIEW_FRAMES = Object.freeze({
  // RAGE:MP reports this ped's entity origin around the pelvis rather than at
  // the studio floor. Head and full-body values are calibrated from the proven
  // character-creation camera; the other presets descend from that same origin.
  full: Object.freeze({ cameraZ: 0.55, distance: 4.74, fov: 38, targetZ: 0.55 }),
  torso: Object.freeze({ cameraZ: 0.3, distance: 2.2, fov: 34, targetZ: 0.25 }),
  legs: Object.freeze({ cameraZ: -0.2, distance: 2.2, fov: 35, targetZ: -0.25 }),
  feet: Object.freeze({ cameraZ: -0.65, distance: 1.9, fov: 31, targetZ: -0.75 }),
  head: Object.freeze({ cameraZ: 0.82, distance: 1.74, fov: 28, targetZ: 0.68 }),
});

const BARBER_PREVIEW_COMPONENTS = Object.freeze([1]);
const BARBER_PREVIEW_PROPS = Object.freeze([0]);
const TATTOO_PREVIEW_COMPONENTS = Object.freeze([1, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
const TATTOO_PREVIEW_PROPS = Object.freeze([0, 1, 2, 6, 7]);
const TATTOO_PREVIEW_OUTFITS = Object.freeze({
  female: Object.freeze({ 1: 0, 3: 15, 4: 14, 5: 0, 6: 35, 7: 0, 8: 15, 9: 0, 10: 0, 11: 15 }),
  male: Object.freeze({ 1: 0, 3: 15, 4: 21, 5: 0, 6: 34, 7: 0, 8: 15, 9: 0, 10: 0, 11: 15 }),
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function normalizeHeading(value) {
  const heading = Number(value) % 360;
  return heading < 0 ? heading + 360 : heading;
}

function parsePayload(rawPayload) {
  try {
    if (rawPayload && typeof rawPayload === "object") return rawPayload;
    const parsed = JSON.parse(String(rawPayload || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isAppearanceShop(payload = currentShopPayload) {
  return String(payload?.business?.interfaceMode || "") === "appearance";
}

function isFuelShop(payload = currentShopPayload) {
  return String(payload?.business?.interfaceMode || "") === "fuel";
}

function clearPendingPurchase(requestId) {
  const pendingPurchase = pendingPurchases.get(requestId);
  if (!pendingPurchase) return null;
  if (pendingPurchase.retryTimer) clearTimeout(pendingPurchase.retryTimer);
  pendingPurchases.delete(requestId);
  return pendingPurchase;
}

function clearPendingPurchases() {
  for (const requestId of pendingPurchases.keys()) clearPendingPurchase(requestId);
}

function isPendingPurchaseActive(pendingPurchase) {
  return Boolean(shopOpen && pendingPurchase && (
    pendingPurchase.shopInstance === shopInstance &&
    String(currentShopPayload?.business?.id || "") === pendingPurchase.businessId &&
    (!pendingPurchase.sessionId || getShopSessionId() === pendingPurchase.sessionId)
  ));
}

function emitPurchaseProgress(pendingPurchase, state) {
  if (!isPendingPurchaseActive(pendingPurchase)) return;
  global.ui?.emit?.(PAGE_NAME, "twinkle:business-shop:purchase-progress", {
    contractVersion: 1,
    businessId: pendingPurchase.businessId,
    productId: pendingPurchase.productId,
    state,
  }, {
    cache: false,
    retryDelays: [0],
    retryKey: `business-shop:purchase-progress:${pendingPurchase.requestId}`,
  });
}

function armPurchaseRetry(requestId) {
  const pendingPurchase = pendingPurchases.get(requestId);
  if (!pendingPurchase) return;
  const delay = PURCHASE_RETRY_DELAYS_MS[pendingPurchase.retryAttempt];
  if (!Number.isFinite(delay)) {
    pendingPurchase.retryTimer = setTimeout(() => {
      const current = pendingPurchases.get(requestId);
      if (!current || current !== pendingPurchase) return;
      current.retryTimer = null;
      if (!isPendingPurchaseActive(current)) {
        clearPendingPurchase(requestId);
        return;
      }
      current.manualRetryAvailable = true;
      emitPurchaseProgress(current, "retry_available");
    }, PURCHASE_MANUAL_RETRY_DELAY_MS);
    return;
  }
  pendingPurchase.retryTimer = setTimeout(() => {
    const current = pendingPurchases.get(requestId);
    if (!current || current !== pendingPurchase) return;
    current.retryTimer = null;
    if (!isPendingPurchaseActive(current)) {
      clearPendingPurchase(requestId);
      return;
    }
    emitPurchaseProgress(current, "retrying");
    mp.events.callRemote("server:business:buy", current.serializedPayload);
    current.retryAttempt += 1;
    armPurchaseRetry(requestId);
  }, delay);
}

function getShopSessionId(payload = currentShopPayload) {
  return String(payload?.sessionId || "").slice(0, 64);
}

function getPreviewSession(payload = currentShopPayload) {
  const session = payload?.previewSession;
  const position = session?.position;
  const initialFrame = String(session?.initialFrame || "full");
  if (
    session?.version !== 1 ||
    !isBoundedString(session?.sessionId, 1, 64) ||
    typeof session?.dimension !== "number" || !Number.isInteger(session.dimension) || session.dimension < 0 ||
    typeof session?.heading !== "number" || !Number.isFinite(session.heading) ||
    typeof position?.x !== "number" || !Number.isFinite(position.x) ||
    typeof position?.y !== "number" || !Number.isFinite(position.y) ||
    typeof position?.z !== "number" || !Number.isFinite(position.z) ||
    !Object.prototype.hasOwnProperty.call(PREVIEW_FRAMES, initialFrame)
  ) return null;
  return {
    sessionId: String(session.sessionId).slice(0, 64),
    dimension: session.dimension,
    heading: normalizeHeading(session.heading),
    initialFrame,
    position: {
      x: position.x,
      y: position.y,
      z: position.z,
    },
  };
}

function isBoundedString(value, minimum, maximum) {
  const length = typeof value === "string" ? value.length : -1;
  return length >= minimum && length <= maximum;
}

function isValidProductPreview(preview) {
  if (preview === null || preview === undefined) return true;
  if (!preview || typeof preview !== "object") return false;
  if (
    preview.focus !== undefined &&
    !Object.prototype.hasOwnProperty.call(PREVIEW_FRAMES, String(preview.focus))
  ) return false;
  if (preview.type === "component") {
    return (
      Number.isInteger(preview.component) && preview.component >= 0 && preview.component <= 11 &&
      Number.isInteger(preview.drawable) && preview.drawable >= 0 && preview.drawable <= 1024 &&
      Number.isInteger(preview.texture) && preview.texture >= 0 && preview.texture <= 255 &&
      Number.isInteger(preview.palette) && preview.palette >= 0 && preview.palette <= 3
    );
  }
  if (preview.type === "prop") {
    return (
      Number.isInteger(preview.prop) && preview.prop >= 0 && preview.prop <= 7 &&
      Number.isInteger(preview.drawable) && preview.drawable >= -1 && preview.drawable <= 1024 &&
      Number.isInteger(preview.texture) && preview.texture >= 0 && preview.texture <= 255
    );
  }
  if (preview.type === "hair") {
    return (
      Number.isInteger(preview.hairId) && preview.hairId >= 0 && preview.hairId <= 1024 &&
      Number.isInteger(preview.color1) && preview.color1 >= 0 && preview.color1 <= 63 &&
      Number.isInteger(preview.color2) && preview.color2 >= 0 && preview.color2 <= 63
    );
  }
  if (preview.type === "tattoo") {
    return isBoundedString(preview.collection, 1, 64) && isBoundedString(preview.overlay, 1, 64);
  }
  return false;
}

function isValidFuelStation(state) {
  if (!state || typeof state !== "object") return false;
  if (
    typeof state.canRefuel !== "boolean" ||
    !["ready", "no_vehicle", "not_driver", "not_owner", "engine_on", "full"].includes(state.reason) ||
    !isBoundedString(state.recommendedProductId, 1, 64)
  ) return false;
  if (state.vehicle === null) return true;
  const vehicle = state.vehicle;
  return Boolean(
    vehicle && typeof vehicle === "object" &&
    isBoundedString(vehicle.name, 1, 96) &&
    isBoundedString(vehicle.plate, 0, 8) &&
    typeof vehicle.fuel === "number" && Number.isFinite(vehicle.fuel) && vehicle.fuel >= 0 && vehicle.fuel <= 10000 &&
    typeof vehicle.capacity === "number" && Number.isFinite(vehicle.capacity) && vehicle.capacity >= 1 && vehicle.capacity <= 10000 &&
    typeof vehicle.percent === "number" && Number.isFinite(vehicle.percent) && vehicle.percent >= 0 && vehicle.percent <= 100 &&
    typeof vehicle.engineOn === "boolean"
  );
}

function isValidShopPayload(payload) {
  const business = payload?.business;
  const balances = payload?.balances;
  const appearance = payload?.appearance;
  const products = payload?.products;
  if (
    payload?.contractVersion !== 5 ||
    !isBoundedString(payload?.sessionId, 1, 64) ||
    !business || typeof business !== "object" ||
    !isBoundedString(business.id, 1, 64) ||
    !isBoundedString(business.type, 1, 32) ||
    !isBoundedString(business.name, 1, 128) ||
    typeof business.isOpen !== "boolean" ||
    (business.ownerUuid !== null && business.ownerUuid !== undefined && (!Number.isInteger(business.ownerUuid) || business.ownerUuid < 1)) ||
    !isBoundedString(business.ownerName, 1, 128) ||
    !Number.isFinite(business.purchasePrice) || business.purchasePrice < 0 || business.purchasePrice > 1000000000 ||
    !isBoundedString(business.description, 0, 240) ||
    !isBoundedString(business.district, 1, 96) ||
    !isBoundedString(business.controlLabel, 1, 96) ||
    !["catalog", "appearance", "fuel"].includes(String(business.interfaceMode || "")) ||
    !business.blip || typeof business.blip !== "object" ||
    !Number.isInteger(business.blip.color) || business.blip.color < 0 || business.blip.color > 255 ||
    !isBoundedString(business.blip.label, 1, 96) ||
    !Number.isInteger(business.blip.sprite) || business.blip.sprite < 0 || business.blip.sprite > 2048 ||
    !balances || !Number.isFinite(balances.cash) || balances.cash < 0 || balances.cash > 1000000000000 ||
    !Number.isFinite(balances.card) || balances.card < 0 || balances.card > 1000000000000 ||
    !appearance || typeof appearance !== "object" ||
    !["male", "female"].includes(String(appearance.gender || "")) ||
    !appearance.hair || typeof appearance.hair !== "object" ||
    !Number.isInteger(appearance.hair.hairId) || appearance.hair.hairId < 0 || appearance.hair.hairId > 1024 ||
    !Number.isInteger(appearance.hair.color1) || appearance.hair.color1 < 0 || appearance.hair.color1 > 63 ||
    !Number.isInteger(appearance.hair.color2) || appearance.hair.color2 < 0 || appearance.hair.color2 > 63 ||
    !Array.isArray(appearance.decorations) || appearance.decorations.length > 32 ||
    !Array.isArray(products) || products.length > 80
  ) return false;

  const decorationsValid = appearance.decorations.every((entry) => (
    isBoundedString(entry?.collection, 1, 64) && isBoundedString(entry?.overlay, 1, 64)
  ));
  const productsValid = products.every((product) => (
    product && typeof product === "object" &&
    isBoundedString(product.id, 1, 64) &&
    isBoundedString(product.name, 1, 96) &&
    (product.description === undefined || isBoundedString(product.description, 0, 240)) &&
    isBoundedString(product.category, 1, 48) &&
    isBoundedString(product.kind, 1, 32) &&
    Number.isFinite(product.price) && product.price >= 0 && product.price <= 1000000000 &&
    Number.isInteger(product.stock) && product.stock >= 0 && product.stock <= 1000000 &&
    isValidProductPreview(product.preview)
  ));
  const transaction = payload.transaction;
  const transactionValid = transaction === undefined || Boolean(
    transaction && typeof transaction === "object" &&
    ["idle", "pending", "success", "error"].includes(String(transaction.status || "")) &&
    (transaction.requestId === undefined || isBoundedString(transaction.requestId, 1, 64)) &&
    (transaction.productId === undefined || isBoundedString(transaction.productId, 1, 64)) &&
    (transaction.message === undefined || isBoundedString(transaction.message, 0, 180)) &&
    (transaction.equipped === undefined || typeof transaction.equipped === "boolean")
  );
  if (!decorationsValid || !productsValid || !transactionValid) return false;

  const previewSession = getPreviewSession(payload);
  if (payload.previewSession !== null && payload.previewSession !== undefined && !previewSession) return false;
  if (previewSession && previewSession.sessionId !== getShopSessionId(payload)) return false;
  const fuelStation = payload.fuelStation;
  if (fuelStation !== null && fuelStation !== undefined && !isValidFuelStation(fuelStation)) return false;
  if (business.interfaceMode === "appearance" && !previewSession) return false;
  if (business.interfaceMode === "fuel" && !isValidFuelStation(fuelStation)) return false;
  return true;
}

function findShopProduct(productId) {
  const products = Array.isArray(currentShopPayload?.products) ? currentShopPayload.products : [];
  return products.find((entry) => String(entry?.id || "") === String(productId || "")) || null;
}

function getPreviewFrame(preview) {
  if (!preview || typeof preview !== "object") return "full";
  const explicitFocus = String(preview.focus || "");
  if (Object.prototype.hasOwnProperty.call(PREVIEW_FRAMES, explicitFocus)) return explicitFocus;
  if (["hair", "tattoo", "prop"].includes(String(preview.type))) return "head";
  if (String(preview.type) !== "component") return "full";
  const component = Number(preview.component);
  if ([0, 1, 2].includes(component)) return "head";
  if ([3, 7, 8, 10, 11].includes(component)) return "torso";
  if (component === 4) return "legs";
  if (component === 6) return "feet";
  return "full";
}

function updatePreviewCamera(frameName = previewStage?.frame || "full") {
  if (!previewCamera || !previewStage) return;
  const frame = PREVIEW_FRAMES[frameName] || PREVIEW_FRAMES.full;
  previewStage.frame = PREVIEW_FRAMES[frameName] ? frameName : "full";
  const zoom = clamp(previewStage.zoom, -2, 2);
  const distance = Math.max(0.9, frame.distance - zoom * 0.18);
  const fov = clamp(frame.fov - zoom * 2.5, 24, 44);
  const headingRadians = previewStage.heading * Math.PI / 180;
  const cameraX = previewStage.origin.x - Math.sin(headingRadians) * distance;
  const cameraY = previewStage.origin.y + Math.cos(headingRadians) * distance;

  previewCamera.setCoord(cameraX, cameraY, previewStage.origin.z + frame.cameraZ);
  previewCamera.setFov(fov);
  previewCamera.pointAtCoord(
    previewStage.origin.x,
    previewStage.origin.y,
    previewStage.origin.z + frame.targetZ
  );
}

function clearPreviewVisibilityTimers() {
  for (const timer of previewVisibilityTimers) {
    try {
      clearTimeout(timer);
    } catch (error) {
      mp.console.logError(`[BUSINESS] Failed to clear preview visibility timer: ${error.message}`);
    }
  }

  previewVisibilityTimers.clear();
}

function clearPreviewReadyTimer() {
  if (!previewReadyTimer) return;
  clearTimeout(previewReadyTimer);
  previewReadyTimer = null;
}

function ensurePreviewPlayerVisible(expectedSessionId = previewStage?.sessionId) {
  if (
    !previewModeActive ||
    !previewStage ||
    previewStage.sessionId !== expectedSessionId
  ) return;

  const player = mp.players.local;
  if (!player || !player.handle) return;

  try {
    player.setAlpha(255);
    player.setVisible(true, false);
    player.setHeading(previewStage.heading);

    const position = player.position;
    if (
      position &&
      Number.isFinite(Number(position.x)) &&
      Number.isFinite(Number(position.y)) &&
      Number.isFinite(Number(position.z))
    ) {
      previewStage.origin = {
        x: Number(position.x),
        y: Number(position.y),
        z: Number(position.z),
      };
    }

    updatePreviewCamera(previewStage.frame);
  } catch (error) {
    mp.console.logError("[BUSINESS] Failed to enforce preview visibility: " + error.message);
  }
}

function schedulePreviewVisibilityCheck(sessionId, delay) {
  const timer = setTimeout(() => {
    previewVisibilityTimers.delete(timer);
    ensurePreviewPlayerVisible(sessionId);
  }, delay);

  previewVisibilityTimers.add(timer);
}

function acquirePreviewVisibility(sessionId) {
  clearPreviewVisibilityTimers();
  previewVisibilityOwned = true;

  try {
    mp.events.call("business:preview:visibility", true);
  } catch {}

  ensurePreviewPlayerVisible(sessionId);
  [100, 350, 800].forEach((delay) => {
    schedulePreviewVisibilityCheck(sessionId, delay);
  });
}

function releasePreviewVisibility() {
  clearPreviewVisibilityTimers();
  if (!previewVisibilityOwned) return;
  previewVisibilityOwned = false;

  try {
    mp.events.call("business:preview:visibility", false);
  } catch {}
}

function capturePreviewSnapshot(payload) {
  previewSnapshot = null;
  if (!isAppearanceShop(payload)) return;

  const player = mp.players.local;
  const products = Array.isArray(payload?.products) ? payload.products : [];
  if (!player) return;

  const componentIds = new Set();
  const propIds = new Set();
  for (const product of products) {
    const preview = product?.preview;
    if (preview?.type === "component") componentIds.add(Number(preview.component));
    if (preview?.type === "hair") componentIds.add(2);
    if (preview?.type === "prop") propIds.add(Number(preview.prop));
  }
  const businessType = String(payload?.business?.type || "");
  if (businessType === "barber") {
    BARBER_PREVIEW_COMPONENTS.forEach((component) => componentIds.add(component));
    BARBER_PREVIEW_PROPS.forEach((prop) => propIds.add(prop));
  } else if (businessType === "tattoo") {
    TATTOO_PREVIEW_COMPONENTS.forEach((component) => componentIds.add(component));
    TATTOO_PREVIEW_PROPS.forEach((prop) => propIds.add(prop));
  }

  try {
    previewSnapshot = {
      components: Array.from(componentIds)
        .filter(Number.isInteger)
        .map((component) => ({
          component,
          drawable: Number(player.getDrawableVariation(component)),
          texture: Number(player.getTextureVariation(component)),
          palette: Number(player.getPaletteVariation(component)),
        })),
      props: Array.from(propIds)
        .filter(Number.isInteger)
        .map((prop) => ({
          prop,
          drawable: Number(player.getPropIndex(prop)),
          texture: Number(player.getPropTextureIndex(prop)),
        })),
      hair: {
        hairId: Math.max(0, Math.floor(Number(payload?.appearance?.hair?.hairId || 0))),
        color1: Math.max(0, Math.min(63, Math.floor(Number(payload?.appearance?.hair?.color1 || 0)))),
        color2: Math.max(0, Math.min(63, Math.floor(Number(payload?.appearance?.hair?.color2 || 0)))),
      },
      decorations: Array.isArray(payload?.appearance?.decorations)
        ? payload.appearance.decorations.slice(0, 32)
        : [],
    };
  } catch (error) {
    previewSnapshot = null;
    mp.console.logError(`[BUSINESS] Failed to capture preview baseline: ${error.message}`);
  }
}

function prepareAppearancePreview(payload) {
  const player = mp.players.local;
  const businessType = String(payload?.business?.type || "");
  if (!player || !["barber", "tattoo"].includes(businessType)) return;
  if (!previewSnapshot) throw new Error("Appearance baseline is unavailable.");

  if (businessType === "barber") {
    player.setComponentVariation(1, 0, 0, 0);
    player.clearProp(0);
    return;
  }

  const gender = String(payload?.appearance?.gender || "") === "female" ? "female" : "male";
  const outfit = TATTOO_PREVIEW_OUTFITS[gender];
  for (const [component, drawable] of Object.entries(outfit)) {
    player.setComponentVariation(Number(component), drawable, 0, 0);
  }
  for (const prop of TATTOO_PREVIEW_PROPS) player.clearProp(prop);
}

function restorePreviewSnapshot() {
  const snapshot = previewSnapshot;
  previewSnapshot = null;
  const player = mp.players.local;
  if (!snapshot || !player) return;

  try {
    for (const component of snapshot.components) {
      player.setComponentVariation(
        component.component,
        component.drawable,
        component.texture,
        component.palette
      );
    }
    for (const prop of snapshot.props) {
      if (prop.drawable < 0) player.clearProp(prop.prop);
      else player.setPropIndex(prop.prop, prop.drawable, prop.texture, true);
    }
    if (snapshot.hair) {
      player.setHairColor(snapshot.hair.color1, snapshot.hair.color2);
    }
    applyDecorations(player, JSON.stringify({
      decorations: Array.isArray(snapshot.decorations) ? snapshot.decorations : [],
    }));
  } catch (error) {
    mp.console.logError(`[BUSINESS] Failed to restore preview baseline: ${error.message}`);
  }
}

function restoreProductPreview(productId) {
  const snapshot = previewSnapshot;
  const player = mp.players.local;
  const preview = findShopProduct(productId)?.preview;
  if (!snapshot || !player || !preview) return;
  try {
    if (preview.type === "component") {
      const component = snapshot.components.find((entry) => entry.component === Number(preview.component));
      if (component) {
        player.setComponentVariation(component.component, component.drawable, component.texture, component.palette);
      }
    } else if (preview.type === "prop") {
      const prop = snapshot.props.find((entry) => entry.prop === Number(preview.prop));
      if (prop?.drawable < 0) player.clearProp(prop.prop);
      else if (prop) player.setPropIndex(prop.prop, prop.drawable, prop.texture, true);
    }
  } catch (error) {
    mp.console.logError(`[BUSINESS] Failed to restore rejected equipment preview: ${error.message}`);
  }
}

function updatePreviewSnapshotFromCanonical(payload) {
  if (!previewSnapshot || !isAppearanceShop(payload)) return;
  const hair = payload?.appearance?.hair;
  if (hair && typeof hair === "object") {
    previewSnapshot.hair = {
      hairId: Math.max(0, Math.floor(Number(hair.hairId || 0))),
      color1: Math.max(0, Math.min(63, Math.floor(Number(hair.color1 || 0)))),
      color2: Math.max(0, Math.min(63, Math.floor(Number(hair.color2 || 0)))),
    };
    const hairComponent = previewSnapshot.components.find((entry) => entry.component === 2);
    if (hairComponent) {
      hairComponent.drawable = previewSnapshot.hair.hairId;
      hairComponent.texture = 0;
      hairComponent.palette = 0;
    }
  }
  previewSnapshot.decorations = Array.isArray(payload?.appearance?.decorations)
    ? payload.appearance.decorations.slice(0, 32)
    : [];
}

function applyCanonicalAppearance(payload) {
  const appearance = payload?.appearance;
  const player = mp.players.local;
  if (!appearance || !player) return;
  const hair = appearance.hair;
  if (hair && typeof hair === "object") {
    player.setComponentVariation(2, Number(hair.hairId || 0), 0, 0);
    player.setHairColor(Number(hair.color1 || 0), Number(hair.color2 || 0));
  }
  applyDecorations(player, JSON.stringify({
    decorations: Array.isArray(appearance.decorations) ? appearance.decorations : [],
  }));
}

function applyProductPreview(product) {
  const preview = product?.preview;
  const player = mp.players.local;
  if (!preview || !player) return false;

  if (preview.type === "component") {
    player.setComponentVariation(
      Number(preview.component),
      Number(preview.drawable),
      Number(preview.texture || 0),
      Number(preview.palette || 0)
    );
  } else if (preview.type === "prop") {
    if (Number(preview.drawable) < 0) player.clearProp(Number(preview.prop));
    else player.setPropIndex(Number(preview.prop), Number(preview.drawable), Number(preview.texture || 0), true);
  } else if (preview.type === "hair") {
    player.setComponentVariation(2, Number(preview.hairId), 0, 0);
    player.setHairColor(Number(preview.color1 || 0), Number(preview.color2 || 0));
  } else if (preview.type === "tattoo") {
    const canonical = Array.isArray(previewSnapshot?.decorations)
      ? previewSnapshot.decorations
      : currentShopPayload?.appearance?.decorations;
    const decorations = Array.isArray(canonical) ? canonical.slice(0, 31) : [];
    if (!decorations.some((entry) => entry?.collection === preview.collection && entry?.overlay === preview.overlay)) {
      decorations.push({ collection: String(preview.collection), overlay: String(preview.overlay) });
    }
    applyDecorations(player, JSON.stringify({ decorations }));
  } else {
    return false;
  }

  if (previewStage) updatePreviewCamera(getPreviewFrame(preview));
  return true;
}

function commitPurchasedPreview(productId, equipped) {
  if (!previewSnapshot || !equipped) return;
  const product = findShopProduct(productId);
  const preview = product?.preview;
  if (!preview) return;

  applyProductPreview(product);
  if (preview.type === "component") {
    const component = previewSnapshot.components.find((entry) => entry.component === Number(preview.component));
    if (component) {
      component.drawable = Number(preview.drawable);
      component.texture = Number(preview.texture || 0);
      component.palette = Number(preview.palette || 0);
    }
  } else if (preview.type === "prop") {
    const prop = previewSnapshot.props.find((entry) => entry.prop === Number(preview.prop));
    if (prop) {
      prop.drawable = Number(preview.drawable);
      prop.texture = Number(preview.texture || 0);
    }
  }
}

function isPreviewStageReady(player, session) {
  const position = player?.position;
  if (
    !player || !Number.isFinite(Number(player.handle)) || Number(player.handle) === 0 ||
    !position || !Number.isFinite(Number(position.x)) ||
    !Number.isFinite(Number(position.y)) || !Number.isFinite(Number(position.z)) ||
    Number(player.dimension) !== Number(session.dimension)
  ) return false;

  const deltaX = Number(position.x) - session.position.x;
  const deltaY = Number(position.y) - session.position.y;
  const deltaZ = Number(position.z) - session.position.z;
  const toleranceSquared = PREVIEW_STAGE_POSITION_TOLERANCE * PREVIEW_STAGE_POSITION_TOLERANCE;
  if (deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ > toleranceSquared) return false;

  return Boolean(mp.game.entity.hasCollisionLoadedAround(player.handle));
}

function activatePreviewCamera(session) {
  if (
    !previewModeActive || !previewStage ||
    previewStage.sessionId !== session.sessionId || previewCamera
  ) return;

  const player = mp.players.local;
  const position = player?.position;
  if (position) {
    previewStage.origin = {
      x: Number(position.x),
      y: Number(position.y),
      z: Number(position.z),
    };
  }

  previewCamera = mp.cameras.new(
    "default",
    new mp.Vector3(session.position.x, session.position.y, session.position.z + 0.9),
    new mp.Vector3(0, 0, 0),
    PREVIEW_FRAMES[session.initialFrame].fov
  );
  updatePreviewCamera(session.initialFrame);
  previewCamera.setActive(true);
  mp.game.cam.renderScriptCams(true, true, 350, true, false);
  acquirePreviewVisibility(session.sessionId);
}

function waitForPreviewStage(session, deadline = Date.now() + PREVIEW_READY_TIMEOUT_MS) {
  clearPreviewReadyTimer();
  const poll = () => {
    previewReadyTimer = null;
    if (
      !shopOpen || !previewModeActive || !previewStage ||
      previewStage.sessionId !== session.sessionId
    ) return;

    const player = mp.players.local;
    try {
      mp.game.streaming.requestCollisionAtCoord(
        session.position.x,
        session.position.y,
        session.position.z
      );
      if (isPreviewStageReady(player, session)) {
        player.setHeading(session.heading);
        activatePreviewCamera(session);
        return;
      }
    } catch (error) {
      mp.console.logError(`[BUSINESS] Preview readiness check failed: ${error.message}`);
    }

    if (Date.now() >= deadline) {
      mp.console.logError("[BUSINESS] Preview stage did not become ready before timeout.");
      closeShop(true);
      return;
    }

    previewReadyTimer = setTimeout(poll, PREVIEW_READY_POLL_MS);
  };

  poll();
}

function stopPreviewMode() {
  restorePreviewSnapshot();
  const player = mp.players.local;
  const previousFrozen = previewStage?.wasFrozen;
  clearPreviewReadyTimer();
  if (previewCamera) {
    try { previewCamera.setActive(false); } catch {}
    try { previewCamera.destroy(); } catch {}
    previewCamera = null;
    try { mp.game.cam.renderScriptCams(false, true, 250, true, false); } catch {}
  }
  if (previewModeActive && typeof previousFrozen === "boolean") {
    try { player?.freezePosition(previousFrozen); } catch {}
  }
  previewStage = null;
  previewModeActive = false;
  releasePreviewVisibility();
}

function startPreviewMode(payload = currentShopPayload) {
  if (!isAppearanceShop() || previewModeActive) return;
  const player = mp.players.local;
  const session = getPreviewSession(payload);
  if (!player || !session) return;
  try {
    let wasFrozen = false;
    try { wasFrozen = Boolean(player.isPositionFrozen); } catch {}
    previewStage = {
      frame: session.initialFrame,
      heading: session.heading,
      origin: { ...session.position },
      sessionId: session.sessionId,
      wasFrozen,
      zoom: 0,
    };
    player.setHeading(session.heading);
    player.freezePosition(true);
    previewModeActive = true;
    prepareAppearancePreview(payload);
    waitForPreviewStage(session);
  } catch (error) {
    mp.console.logError(`[BUSINESS] Preview camera failed: ${error.message}`);
    closeShop(true);
  }
}

function closeShop(notifyServer = true) {
  const wasOpen = shopOpen;
  const sessionId = getShopSessionId();
  shopOpen = false;
  shopInstance = (shopInstance + 1) % 1000000;
  clearPendingPurchases();
  stopPreviewMode();
  currentShopPayload = null;
  if (wasOpen) global.interfaceLock?.closePage?.(PAGE_NAME);
  if (notifyServer && wasOpen && sessionId) {
    mp.events.callRemote("server:business:close", sessionId);
  }
}

function patchShop(rawPayload) {
  const payload = parsePayload(rawPayload);
  if (!shopOpen || !isValidShopPayload(payload)) return;
  if (
    String(payload?.business?.id || "") !==
    String(currentShopPayload?.business?.id || "")
  ) return;
  if (!getShopSessionId(payload) || getShopSessionId(payload) !== getShopSessionId(currentShopPayload)) return;
  if (isAppearanceShop(payload)) {
    const currentSession = getPreviewSession(currentShopPayload);
    const incomingSession = getPreviewSession(payload);
    if (!currentSession || !incomingSession || currentSession.sessionId !== incomingSession.sessionId) return;
  }
  updatePreviewSnapshotFromCanonical(payload);
  currentShopPayload = payload;
  global.uiState?.patch?.(PAGE_NAME, payload, {
    globalName: "__TWINKLE_BUSINESS_SHOP_PAYLOAD__",
    retryKey: "business-shop:payload",
  });
}

function patchTablet(rawPayload) {
  const payload = parsePayload(rawPayload);
  if (payload.businessReset) tabletBusinessState.businesses = [];
  if (payload.businessMerge && Array.isArray(payload.businesses)) {
    const businesses = tabletBusinessState.businesses.slice();
    for (const business of payload.businesses) {
      const index = businesses.findIndex((entry) => String(entry?.id || "") === String(business?.id || ""));
      if (index >= 0) businesses[index] = business;
      else businesses.push(business);
    }
    tabletBusinessState.businesses = businesses;
  }
  if (payload.businessAppendField && payload.businessId && Array.isArray(payload.items)) {
    const field = String(payload.businessAppendField);
    if (["employees", "ledger", "supplies"].includes(field)) {
      tabletBusinessState.businesses = tabletBusinessState.businesses.map((business) => (
        String(business?.id || "") === String(payload.businessId)
          ? { ...business, [field]: [...(Array.isArray(business[field]) ? business[field] : []), ...payload.items] }
          : business
      ));
    }
  }
  if (payload.marketplaceReset) tabletBusinessState.marketplace = { listings: [] };
  if (payload.marketplaceAppend && Array.isArray(payload.marketplace?.listings)) {
    tabletBusinessState.marketplace = {
      ...tabletBusinessState.marketplace,
      ...payload.marketplace,
      listings: [...tabletBusinessState.marketplace.listings, ...payload.marketplace.listings],
    };
  }
  payload.businesses = tabletBusinessState.businesses;
  payload.marketplace = tabletBusinessState.marketplace;
  mp.events.call("client:tablet:business:update", payload);
}

mp.events.add("client:business:nearby", (rawPayload) => {
  const payload = parsePayload(rawPayload);
  nearbyBusiness = payload.active && payload.businessId
    ? { id: String(payload.businessId), label: String(payload.label || "Бизнес") }
    : null;
});

mp.events.add("client:business:open", (rawPayload) => {
  const payload = parsePayload(rawPayload);
  if (!isValidShopPayload(payload)) {
    mp.console.logError("[BUSINESS] Rejected an invalid business shop contract.");
    const sessionId = getShopSessionId(payload);
    if (sessionId) mp.events.callRemote("server:business:close", sessionId);
    return;
  }
  if (shopOpen) closeShop(false);
  shopInstance = (shopInstance + 1) % 1000000;
  clearPendingPurchases();
  currentShopPayload = payload;
  capturePreviewSnapshot(payload);
  const opened = global.interfaceLock?.openPage?.(PAGE_NAME, null, payload);
  shopOpen = Boolean(opened);
  if (shopOpen) {
    startPreviewMode(payload);
  } else {
    const sessionId = getShopSessionId(payload);
    currentShopPayload = null;
    previewSnapshot = null;
    if (sessionId) mp.events.callRemote("server:business:close", sessionId);
  }
});

mp.events.add("client:business:update", patchShop);
mp.events.add("client:business:purchaseResult", (rawPayload) => {
  const result = parsePayload(rawPayload);
  const requestId = String(result.requestId || "");
  const pendingPurchase = pendingPurchases.get(requestId);
  if (!requestId || !pendingPurchase) return;
  clearPendingPurchase(requestId);
  const activeBusinessMatches = shopOpen && (
    pendingPurchase.shopInstance === shopInstance &&
    String(currentShopPayload?.business?.id || "") === pendingPurchase.businessId
    && (!result.businessId || String(result.businessId) === pendingPurchase.businessId) &&
    (!pendingPurchase.sessionId || String(result.sessionId || "") === pendingPurchase.sessionId)
  );
  if (!activeBusinessMatches) return;
  global.ui?.emit?.(PAGE_NAME, "twinkle:business-shop:purchase-result", {
    contractVersion: 1,
    businessId: pendingPurchase.businessId,
    productId: pendingPurchase.productId,
    success: result.success === true,
    reason: String(result.reason || "").slice(0, 64),
  }, {
    cache: false,
    retryDelays: [0],
    retryKey: `business-shop:purchase-result:${requestId}`,
  });
  if (!result.success) return;

  if (result.appearance) {
    applyCanonicalAppearance({ appearance: result.appearance });
    updatePreviewSnapshotFromCanonical({
      business: currentShopPayload?.business,
      appearance: result.appearance,
    });
  }
  if (result.equipped === false) restoreProductPreview(pendingPurchase.productId);
  commitPurchasedPreview(pendingPurchase.productId, result.equipped === true);
});
mp.events.add("client:business:tablet:update", patchTablet);
mp.events.add("client:business:close", () => {
  nearbyBusiness = null;
  closeShop(false);
});

mp.events.add("interface:lock:closing", (page) => {
  if ((String(page) !== "*" && String(page) !== PAGE_NAME) || !shopOpen) return;
  const sessionId = getShopSessionId();
  shopOpen = false;
  shopInstance = (shopInstance + 1) % 1000000;
  clearPendingPurchases();
  stopPreviewMode();
  currentShopPayload = null;
  if (sessionId) mp.events.callRemote("server:business:close", sessionId);
});

function applyDecorations(player, rawPayload) {
  const payload = parsePayload(rawPayload);
  const decorations = Array.isArray(payload.decorations) ? payload.decorations.slice(0, 32) : [];
  if (!player || !Number.isFinite(Number(player.handle)) || Number(player.handle) === 0) return;
  try {
    mp.game.ped.clearDecorations(player.handle);
    for (const decoration of decorations) {
      const collection = String(decoration?.collection || "");
      const overlay = String(decoration?.overlay || "");
      if (!collection || !overlay) continue;
      mp.game.ped.addDecorationFromHashes(
        player.handle,
        mp.game.joaat(collection),
        mp.game.joaat(overlay)
      );
    }
  } catch (error) {
    mp.console.logError(`[BUSINESS] Appearance synchronization failed: ${error.message}`);
  }
}

mp.events.add("client:business:applyAppearance", (rawPayload) => {
  applyDecorations(mp.players.local, rawPayload);
});

mp.events.addDataHandler("twinkleDecorations", (entity, value) => {
  if (!entity || entity.type !== "player") return;
  applyDecorations(entity, JSON.stringify({ decorations: parsePayload(value) }));
});

mp.events.add("entityStreamIn", (entity) => {
  if (!entity || entity.type !== "player") return;
  const decorations = entity.getVariable("twinkleDecorations");
  if (decorations !== undefined && decorations !== null) {
    applyDecorations(entity, JSON.stringify({ decorations: parsePayload(decorations) }));
  }
});

mp.events.add("businessShop:buyFromBrowser", (rawPayload) => {
  if (!shopOpen || pendingPurchases.size > 0) return;
  const payload = parsePayload(rawPayload);
  const businessId = String(payload.businessId || "");
  const productId = String(payload.productId || "");
  const product = findShopProduct(productId);
  const paymentType = String(payload.paymentType || "");
  if (
    !product || businessId !== String(currentShopPayload?.business?.id || "") ||
    !["cash", "card"].includes(paymentType)
  ) return;
  purchaseSequence = (purchaseSequence + 1) % 1000000;
  const requestId = `${Date.now()}:${purchaseSequence}`;
  const sessionId = getShopSessionId();
  const serializedPayload = JSON.stringify({
    businessId,
    productId,
    paymentType,
    quantity: isAppearanceShop()
      ? 1
      : clamp(Math.floor(Number(payload.quantity || 1)), 1, isFuelShop() ? 10000 : 20),
    requestId,
    sessionId,
  });
  pendingPurchases.set(requestId, {
    businessId,
    manualRetryAvailable: false,
    productId,
    requestId,
    retryAttempt: 0,
    retryTimer: null,
    serializedPayload,
    sessionId,
    shopInstance,
  });
  mp.events.callRemote("server:business:buy", serializedPayload);
  armPurchaseRetry(requestId);
});

mp.events.add("businessShop:retryPurchaseFromBrowser", (rawPayload) => {
  if (!shopOpen || pendingPurchases.size !== 1) return;
  const payload = parsePayload(rawPayload);
  const pendingPurchase = pendingPurchases.values().next().value;
  if (
    !pendingPurchase?.manualRetryAvailable ||
    !isPendingPurchaseActive(pendingPurchase) ||
    String(payload.businessId || "") !== pendingPurchase.businessId ||
    String(payload.productId || "") !== pendingPurchase.productId
  ) return;
  pendingPurchase.manualRetryAvailable = false;
  emitPurchaseProgress(pendingPurchase, "retrying");
  mp.events.callRemote("server:business:buy", pendingPurchase.serializedPayload);
  armPurchaseRetry(pendingPurchase.requestId);
});

mp.events.add("businessShop:previewFromBrowser", (rawPayload) => {
  if (!shopOpen || !isAppearanceShop()) return;
  const payload = parsePayload(rawPayload);
  const productId = String(payload.productId || "");
  const product = findShopProduct(productId);
  if (!product?.preview) return;

  try {
    applyProductPreview(product);
  } catch (error) {
    mp.console.logError(`[BUSINESS] Product preview failed: ${error.message}`);
  }
});

mp.events.add("businessShop:closeFromBrowser", () => closeShop(true));

mp.events.add("tablet:businessRefreshFromBrowser", () => {
  mp.events.callRemote("server:business:tablet:request");
});

mp.events.add("tablet:businessBalanceFromBrowser", (rawPayload) => {
  mp.events.callRemote("server:business:tablet:balance", JSON.stringify(parsePayload(rawPayload)));
});

mp.events.add("tablet:businessToggleFromBrowser", (rawPayload) => {
  mp.events.callRemote("server:business:tablet:toggle", JSON.stringify(parsePayload(rawPayload)));
});

mp.events.add("tablet:businessSupplyFromBrowser", (rawPayload) => {
  mp.events.callRemote("server:business:tablet:supply", JSON.stringify(parsePayload(rawPayload)));
});

mp.events.add("tablet:businessPriceFromBrowser", (rawPayload) => {
  mp.events.callRemote("server:business:tablet:price", JSON.stringify(parsePayload(rawPayload)));
});

mp.events.add("tablet:businessTaxFromBrowser", (rawPayload) => {
  mp.events.callRemote("server:business:tablet:tax", JSON.stringify(parsePayload(rawPayload)));
});

mp.events.add("tablet:businessListSaleFromBrowser", (rawPayload) => {
  mp.events.callRemote("server:business:tablet:listSale", JSON.stringify(parsePayload(rawPayload)));
});

mp.events.add("tablet:businessSellStateFromBrowser", (rawPayload) => {
  mp.events.callRemote("server:business:tablet:sellState", JSON.stringify(parsePayload(rawPayload)));
});

mp.events.add("tablet:marketplaceBusinessBuyFromBrowser", (listingId, paymentType) => {
  mp.events.callRemote("server:business:marketplace:buy", JSON.stringify({ listingId, paymentType }));
});

mp.events.add("tablet:businessEmployeeUpsertFromBrowser", (rawPayload) => {
  mp.events.callRemote("server:business:tablet:employeeUpsert", JSON.stringify(parsePayload(rawPayload)));
});

mp.events.add("tablet:businessEmployeeRemoveFromBrowser", (rawPayload) => {
  mp.events.callRemote("server:business:tablet:employeeRemove", JSON.stringify(parsePayload(rawPayload)));
});

const bindKey = global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback));
bindKey(INTERACT_KEY, false, () => {
  if (!nearbyBusiness || shopOpen || !global.__TWINKLE_GAMEPLAY_READY__) return;
  if (global.interfaceLock?.getInterfaceState?.()?.activePage) return;
  mp.events.callRemote("server:business:interact", nearbyBusiness.id);
}, {
  allowWhenBlocked: false,
  closeChatBefore: false,
});

console.log("[BUSINESS] Client loaded");
