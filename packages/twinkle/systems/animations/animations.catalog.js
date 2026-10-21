"use strict";

const ANIMATION_CATEGORIES = [
  { id: "actions", label: "Действия" },
  { id: "poses", label: "Позы" },
  { id: "positive", label: "Позитивные" },
  { id: "negative", label: "Негативные" },
  { id: "dances", label: "Танцы" },
  { id: "other", label: "Прочие" },
  { id: "exclusive", label: "Эксклюзивные" },
];

const ANIMATIONS = [
  {
    id: "hands-up",
    name: "Руки вверх",
    shortName: "Руки",
    category: "Действия",
    section: "actions",
    pose: "arms-up",
    dict: "random@mugging3",
    nameHash: "handsup_standing_base",
    flags: 49,
  },
  {
    id: "wave-hands",
    name: "Помахать рукой",
    shortName: "Привет",
    category: "Позитивные",
    section: "positive",
    pose: "wave",
    dict: "friends@frj@ig_1",
    nameHash: "wave_a",
    duration: 3000,
    flags: 48,
  },
  {
    id: "salute-one",
    name: "Отдать честь",
    shortName: "Честь",
    category: "Действия",
    section: "actions",
    pose: "salute-one",
    dict: "anim@mp_player_intincarsalutestd@ds@",
    nameHash: "idle_a",
    duration: 2500,
    flags: 48,
  },
  {
    id: "cross-arms",
    name: "Скрестить руки",
    shortName: "Руки",
    category: "Позы",
    section: "poses",
    pose: "cross-arms",
    dict: "amb@world_human_hang_out_street@female_arms_crossed@idle_a",
    nameHash: "idle_a",
    flags: 49,
  },
  {
    id: "lean",
    name: "Облокотиться",
    shortName: "Наклон",
    category: "Позы",
    section: "poses",
    pose: "lean",
    dict: "amb@world_human_leaning@male@wall@back@foot_up@idle_a",
    nameHash: "idle_a",
    flags: 49,
  },
  {
    id: "phone-call",
    name: "Звонок",
    shortName: "Тел.",
    category: "Действия",
    section: "actions",
    pose: "phone",
    dict: "cellphone@",
    nameHash: "cellphone_text_read_base",
    flags: 49,
  },
  {
    id: "kneel",
    name: "Встать на колено",
    shortName: "Колено",
    category: "Позы",
    section: "poses",
    pose: "kneel",
    dict: "amb@medic@standing@kneel@base",
    nameHash: "base",
    flags: 49,
  },
  {
    id: "pushup",
    name: "Отжиматься",
    shortName: "Отжим.",
    category: "Действия",
    section: "actions",
    pose: "pushup",
    dict: "amb@world_human_push_ups@male@base",
    nameHash: "base",
    flags: 49,
  },
  {
    id: "dance",
    name: "Танец",
    shortName: "Танец",
    category: "Танцы",
    section: "dances",
    pose: "stand",
    dict: "anim@amb@nightclub@dancers@crowddance_facedj@hi_intensity",
    nameHash: "hi_dance_facedj_09_v2_male^6",
    flags: 49,
  },
  {
    id: "facepalm",
    name: "Facepalm",
    shortName: "Facepalm",
    category: "Негативные",
    section: "negative",
    pose: "rest",
    dict: "anim@mp_player_intcelebrationmale@face_palm",
    nameHash: "face_palm",
    duration: 3000,
    flags: 48,
  },
  {
    id: "shrug",
    name: "Пожать плечами",
    shortName: "Жест",
    category: "Прочие",
    section: "other",
    pose: "shrug",
    dict: "gestures@f@standing@casual",
    nameHash: "gesture_shrug_hard",
    duration: 2500,
    flags: 48,
  },
  {
    id: "pose",
    name: "Позировать",
    shortName: "Поза",
    category: "Эксклюзивные",
    section: "exclusive",
    pose: "hands-waist",
    dict: "amb@world_human_hang_out_street@male_c@base",
    nameHash: "base",
    flags: 49,
  },
];

function publicAnimation(animation) {
  return {
    id: animation.id,
    name: animation.name,
    shortName: animation.shortName,
    category: animation.category,
    section: animation.section,
    pose: animation.pose,
  };
}

function getAnimationById(id) {
  const key = String(id || "");
  return ANIMATIONS.find((animation) => animation.id === key) || null;
}

function buildAnimationsPayload(player) {
  const favoriteIds = Array.isArray(player?.animationFavoriteIds)
    ? player.animationFavoriteIds
    : ["wave-hands", "hands-up", "phone-call"];

  return {
    categories: ANIMATION_CATEGORIES,
    items: ANIMATIONS.map(publicAnimation),
    favoriteIds,
    circleSlots: player?.animationCircleSlots || {},
  };
}

module.exports = {
  ANIMATIONS,
  buildAnimationsPayload,
  getAnimationById,
};
