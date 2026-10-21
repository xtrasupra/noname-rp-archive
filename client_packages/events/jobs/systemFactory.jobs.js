"use strict";

let activeJob = null;
let activeIndex = 0;
let routeBlip = null;
let actionInProgress = false;
let actionEndsAt = 0;
let actionStartedAt = 0;
let actionTitle = "";

const E_KEY = 0x45;

function parse(raw) {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function destroyRouteBlip() {
  if (routeBlip && mp.blips.exists(routeBlip)) routeBlip.destroy();
  routeBlip = null;
}

function getPoint() {
  return activeJob?.routePoints?.[activeIndex] || null;
}

function drawText(text, x, y, scale, color = [255, 255, 255, 230]) {
  mp.game.graphics.drawText(String(text), [x, y], {
    font: 4,
    color,
    scale: [scale, scale],
    outline: true,
    centre: true,
  });
}

function drawProgress(title, progress) {
  const clamped = Math.max(0, Math.min(1, Number(progress || 0)));
  drawText(title, 0.5, 0.82, 0.42, [255, 255, 255, 235]);
  mp.game.graphics.drawRect(0.5, 0.865, 0.22, 0.018, 0, 0, 0, 160);
  mp.game.graphics.drawRect(0.39 + clamped * 0.11, 0.865, 0.22 * clamped, 0.018, 88, 194, 255, 220);
}

function showPoint() {
  destroyRouteBlip();
  const point = getPoint();
  if (!point) return;
  routeBlip = mp.blips.new(1, new mp.Vector3(Number(point.x), Number(point.y), Number(point.z)), {
    name: `${activeJob.name}: точка ${activeIndex + 1}`,
    color: Number(activeJob.blip?.color || 5),
    scale: 0.8,
    shortRange: false,
  });
  routeBlip.setRoute(true);
  routeBlip.setRouteColour(Number(activeJob.blip?.color || 5));
  mp.game.ui.setNewWaypoint(Number(point.x), Number(point.y));
}

mp.events.add("factory:job:start", (raw) => {
  activeJob = parse(raw);
  activeIndex = 0;
  actionInProgress = false;
  actionEndsAt = 0;
  actionStartedAt = 0;
  actionTitle = "";
  showPoint();
});

mp.events.add("factory:job:next", (index) => {
  activeIndex = Number(index || 0);
  actionInProgress = false;
  actionEndsAt = 0;
  actionStartedAt = 0;
  actionTitle = "";
  showPoint();
});

mp.events.add("factory:job:finish", () => {
  activeJob = null;
  activeIndex = 0;
  actionInProgress = false;
  actionEndsAt = 0;
  actionStartedAt = 0;
  actionTitle = "";
  destroyRouteBlip();
});

mp.events.add("factory:job:actionStarted", (durationMs, title) => {
  const duration = Math.max(1000, Number(durationMs || 1000));
  actionInProgress = true;
  actionStartedAt = Date.now();
  actionEndsAt = actionStartedAt + duration;
  actionTitle = String(title || "Выполнение работы...");
});

mp.events.add("factory:job:actionCancelled", () => {
  actionInProgress = false;
  actionEndsAt = 0;
  actionStartedAt = 0;
  actionTitle = "";
});

mp.keys.bind(E_KEY, false, () => {
  if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__) return;
  const point = getPoint();
  if (!activeJob || !point || actionInProgress) return;

  const position = mp.players.local.position;
  const distance = mp.game.system.vdist(
    position.x,
    position.y,
    position.z,
    Number(point.x),
    Number(point.y),
    Number(point.z)
  );

  if (distance > Number(point.radius || 4)) return;
  mp.events.callRemote("factory:job:completePoint", String(activeJob.code), activeIndex);
});

mp.events.add("render", () => {
  const point = getPoint();
  if (!point) return;
  const position = mp.players.local.position;
  const x = Number(point.x);
  const y = Number(point.y);
  const z = Number(point.z);
  const radius = Number(point.radius || 4);
  const color = Array.isArray(point.markerColor) ? point.markerColor : [195, 146, 255, 145];
  mp.game.graphics.drawMarker(
    1, x, y, z - 1.0, 0, 0, 0, 0, 0, 0,
    radius * 0.8, radius * 0.8, 1.1,
    Number(color[0] || 195), Number(color[1] || 146), Number(color[2] || 255), Number(color[3] || 145),
    false, false, 2, false, null, null, false
  );
  const distance = mp.game.system.vdist(position.x, position.y, position.z, x, y, z);

  if (actionInProgress) {
    const total = Math.max(1, actionEndsAt - actionStartedAt);
    const progress = (Date.now() - actionStartedAt) / total;
    drawProgress(actionTitle, progress);
    return;
  }

  if (distance <= radius) {
    const title = point.actionTitle || point.label || "Рабочий этап";
    const hint = point.actionText || "Нажмите E, чтобы выполнить действие";
    drawText(title, 0.5, 0.80, 0.42, [255, 255, 255, 235]);
    drawText(hint, 0.5, 0.835, 0.34, [210, 235, 255, 220]);
  }
});
