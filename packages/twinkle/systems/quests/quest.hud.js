"use strict";

const QUEST_HUD_TASK_ID = "quest:current";

function buildActiveQuestHudTask(snapshot) {
  const active = snapshot?.active || null;
  if (!active) return null;

  return {
    id: QUEST_HUD_TASK_ID,
    type: "yellow",
    title: String(active.title || "Задание"),
    description: String(active.objective || ""),
    progress: active.progress
      ? {
          steps: Math.max(1, Number(active.progress.target || 1)),
          activeStep: Math.max(0, Number(active.progress.current || 0)),
        }
      : undefined,
  };
}

function buildQuestHudPatch(snapshot) {
  const task = buildActiveQuestHudTask(snapshot) || {
        id: QUEST_HUD_TASK_ID,
        type: "yellow",
        title: "Задание",
        description: "",
        hidden: true,
      };

  return {
    tasks: {
      // Visibility belongs to the shared task container. An active quest must
      // reveal it; removal preserves the visibility chosen by other owners.
      ...(snapshot?.active ? { isVisible: true } : {}),
      merge: true,
      items: [task],
    },
  };
}

module.exports = {
  QUEST_HUD_TASK_ID,
  buildActiveQuestHudTask,
  buildQuestHudPatch,
};
