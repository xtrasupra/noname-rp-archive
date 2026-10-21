<template>
  <section class="character-quests">
    <header class="character-quests__header">
      <div>
        <h1 class="f2-menu__title">Задания</h1>
        <p>Ваш путь развития, журнал заданий и текущая точка маршрута.</p>
      </div>

      <span class="character-quests__revision">версия {{ questState.revision }}</span>
    </header>

    <article v-if="questState.active" class="quest-card quest-card--active">
      <div class="quest-card__main">
        <span class="quest-card__eyebrow">Текущее задание</span>
        <h2>{{ questState.active.title }}</h2>
        <p>{{ questState.active.objective }}</p>

        <div v-if="questState.active.progress" class="quest-card__progress">
          <div>
            <span>Прогресс</span>
            <strong>{{ Math.floor(questState.active.progress.current) }} / {{ Math.floor(questState.active.progress.target) }}</strong>
          </div>
          <progress
            :max="questState.active.progress.target"
            :value="questState.active.progress.current"
          />
        </div>
      </div>

      <aside v-if="questState.active.target" class="quest-card__target">
        <span>{{ targetKindLabel(questState.active.target.kind) }}</span>
        <strong>{{ questState.active.target.label }}</strong>
        <button type="button" @click="requestGps">
          Проложить маршрут
        </button>
      </aside>
    </article>

    <article v-else class="quest-card quest-card--empty">
      <span class="quest-card__eyebrow">Нет активного задания</span>
      <h2>Поговорите с персонажем-проводником</h2>
      <p>Доступные цепочки появятся здесь, когда вы начнёте задание у игрового персонажа.</p>
    </article>

    <div class="character-quests__list">
      <article
        v-for="quest in questState.available"
        :key="quest.questId"
        class="quest-row"
      >
        <div>
          <strong>{{ quest.title }}</strong>
          <span>Цепочка заданий</span>
        </div>
        <em>{{ questStatusLabel(quest.status) }}</em>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'
import { emptyQuestState, parseQuestState, type QuestStateV1 } from '@/shared/contracts/quests'

declare global {
  interface Window {
    __TWINKLE_QUEST_STATE__?: unknown
  }
}

const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()

const initialState = parseQuestState(props.payload?.quests ?? window.__TWINKLE_QUEST_STATE__)
const localQuestState = ref<QuestStateV1>(initialState)

const questState = computed(() => localQuestState.value)

const questStatusLabels: Record<string, string> = {
  active: 'Активно',
  completed: 'Завершено',
  cancelled: 'Приостановлено',
}

const targetKindLabels: Record<string, string> = {
  npc: 'Персонаж',
  business: 'Бизнес',
  job: 'Работа',
  vehicle: 'Транспорт',
  location: 'Точка',
}

function questStatusLabel(status: string) {
  return questStatusLabels[status] || 'Неизвестно'
}

function targetKindLabel(kind: string) {
  return targetKindLabels[kind] || 'Цель'
}

watch(
  () => props.payload?.quests,
  (value) => {
    localQuestState.value = parseQuestState(value ?? window.__TWINKLE_QUEST_STATE__)
  },
  { deep: true },
)

function onQuestState(event: Event) {
  localQuestState.value = parseQuestState((event as CustomEvent<unknown>).detail)
}

function requestGps() {
  const active = questState.value.active
  if (!active) return

  callClientEvent('quests:gpsFromBrowser', JSON.stringify({
    questId: active.questId,
    questVersion: active.questVersion,
    stepId: active.stepId,
  }))
}

onMounted(() => {
  window.addEventListener('twinkle:quests:state', onQuestState)
  localQuestState.value = parseQuestState(window.__TWINKLE_QUEST_STATE__ ?? props.payload?.quests ?? emptyQuestState)
})

onBeforeUnmount(() => {
  window.removeEventListener('twinkle:quests:state', onQuestState)
})
</script>

<style scoped>
.character-quests {
  min-height: 100%;
  padding-right: 1.8vh;
}

.character-quests__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2vh;
}

.character-quests__header p {
  margin: 0.8vh 0 0;
  color: rgb(255 255 255 / 48%);
  font-size: 1.1vh;
  font-weight: 600;
}

.character-quests__revision {
  margin-top: 0.45vh;
  padding: 0.55vh 0.9vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 7%);
  color: rgb(255 255 255 / 52%);
  font-size: 0.95vh;
  font-weight: 700;
}

.quest-card {
  margin-top: 3vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 25vh;
  gap: 1.4vh;
  padding: 1.8vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.9vh;
  background:
    radial-gradient(26vh 18vh at 85% 20%, rgb(255 202 64 / 14%), transparent 70%),
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 42%),
    rgb(8 8 9 / 78%);
}

.quest-card--empty {
  display: block;
  max-width: 62vh;
}

.quest-card__eyebrow {
  color: #ffd05f;
  font-size: 0.95vh;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.quest-card h2 {
  margin: 0.75vh 0 0;
  color: #ffffff;
  font-size: 2.1vh;
  font-weight: 700;
}

.quest-card p {
  max-width: 62vh;
  margin: 1vh 0 0;
  color: rgb(255 255 255 / 62%);
  font-size: 1.2vh;
  font-weight: 600;
  line-height: 1.55;
}

.quest-card__progress {
  margin-top: 2vh;
  display: grid;
  gap: 0.8vh;
}

.quest-card__progress div {
  display: flex;
  justify-content: space-between;
  color: rgb(255 255 255 / 58%);
  font-size: 1vh;
  font-weight: 700;
}

.quest-card__progress strong {
  color: #ffffff;
}

.quest-card__progress progress {
  width: 100%;
  height: 0.65vh;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  background: rgb(255 255 255 / 10%);
}

.quest-card__progress progress::-webkit-progress-bar {
  background: rgb(255 255 255 / 10%);
}

.quest-card__progress progress::-webkit-progress-value {
  border-radius: 999px;
  background: linear-gradient(90deg, #ffd05f, #ff8f3d);
}

.quest-card__target {
  display: grid;
  align-content: center;
  gap: 0.8vh;
  padding: 1.4vh;
  border-radius: 0.7vh;
  background: rgb(255 255 255 / 5%);
}

.quest-card__target span {
  color: rgb(255 255 255 / 46%);
  font-size: 0.95vh;
  font-weight: 800;
  text-transform: uppercase;
}

.quest-card__target strong {
  color: #ffffff;
  font-size: 1.25vh;
}

.quest-card__target button {
  width: max-content;
  margin-top: 0.6vh;
  padding: 0.8vh 1.15vh;
  border: 0;
  border-radius: 0.45vh;
  background: #ffd05f;
  color: #101010;
  font-size: 1vh;
  font-weight: 800;
  cursor: pointer;
}

.character-quests__list {
  margin-top: 1.4vh;
  display: grid;
  gap: 0.75vh;
}

.quest-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1vh;
  padding: 1.1vh 1.25vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.65vh;
  background: rgb(8 8 9 / 62%);
}

.quest-row div {
  display: grid;
  gap: 0.25vh;
}

.quest-row strong {
  color: #ffffff;
  font-size: 1.15vh;
}

.quest-row span,
.quest-row em {
  color: rgb(255 255 255 / 48%);
  font-size: 0.95vh;
  font-style: normal;
  font-weight: 700;
}
</style>
