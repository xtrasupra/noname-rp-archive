"use strict";

const PHASE = Object.freeze({
  PRE_AUTH: "pre_auth",
  AUTHENTICATING: "authenticating",
  CHARACTER_SELECTION: "character_selection",
  CHARACTER_SELECTING: "character_selecting",
  CHARACTER_CREATOR: "character_creator",
  CHARACTER_SAVING: "character_saving",
  SPAWN_SELECTION: "spawn_selection",
  SPAWNING: "spawning",
  IN_GAME: "in_game",
  DENIED: "denied",
});

function getPhase(player) {
  return String(player?.__twinkleAuthPhase || "");
}

function setPhase(player, phase) {
  if (!player) return false;
  player.__twinkleAuthPhase = phase;
  return true;
}

function isPhase(player, ...allowedPhases) {
  return allowedPhases.includes(getPhase(player));
}

function transition(player, expectedPhase, nextPhase) {
  if (!isPhase(player, expectedPhase)) return false;
  setPhase(player, nextPhase);
  return true;
}

module.exports = {
  PHASE,
  getPhase,
  isPhase,
  setPhase,
  transition,
};
