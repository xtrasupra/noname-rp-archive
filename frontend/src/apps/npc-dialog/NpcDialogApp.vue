<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

type NpcDialogAction = NonNullable<InterfacePayloadMap['npcDialog']['actions']>[number]

const props = defineProps<{
  payload?: InterfacePayloadMap['npcDialog']
}>()

const defaultActions: NpcDialogAction[] = [
  { id: 'buy', label: 'Хочу купить товар', event: 'npcDialog:action', payload: { action: 'buy' } },
  { id: 'job', label: 'Есть работа?', event: 'npcDialog:action', payload: { action: 'job' } },
  { id: 'question', label: 'У меня есть вопрос', event: 'npcDialog:action', payload: { action: 'question' } },
]

const npcName = computed(() => props.payload?.name?.trim() || 'Незнакомец')
const npcProfession = computed(() => props.payload?.profession?.trim() || 'Гражданин')
const npcMessage = computed(() => props.payload?.message?.trim() || 'Чем могу помочь?')
const customActions = computed(() => props.payload?.actions?.filter((action) => action.label?.trim()) ?? defaultActions)
const actions = computed<NpcDialogAction[]>(() => [
  ...customActions.value,
  { id: 'end-conversation', label: 'Закончить разговор', event: 'npcDialog:end' },
])
const actionGridClass = computed(() => {
  const count = actions.value.length

  if (count <= 2) {
    return 'npc-dialog__actions--compact'
  }

  if (count <= 6) {
    return 'npc-dialog__actions--balanced'
  }

  return 'npc-dialog__actions--dense'
})

function selectAction(action: NpcDialogAction) {
  callClientEvent(action.event || 'npcDialog:action', JSON.stringify({
    id: action.id,
    label: action.label,
    payload: action.payload,
  }))
}

function closeDialog() {
  callClientEvent('npcDialog:end')
}

function onKeydown(event: KeyboardEvent) {
  if (event.altKey && event.key === 'F4') {
    event.preventDefault()
    event.stopPropagation()
    closeDialog()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <main class="npc-dialog" aria-label="Диалог с NPC">
    <section class="npc-dialog__panel">
      <header class="npc-dialog__identity">
        <span class="npc-dialog__portrait" aria-hidden="true">{{ npcName.slice(0, 1) }}</span>
        <div>
          <p>{{ npcProfession }}</p>
          <h1>{{ npcName }}</h1>
        </div>
      </header>

      <article class="npc-dialog__message">
        <span>Сообщение</span>
        <p>{{ npcMessage }}</p>
      </article>

      <section class="npc-dialog__choices" aria-label="Действия">
        <span class="npc-dialog__choices-title">Действия</span>
        <div class="npc-dialog__actions" :class="actionGridClass">
          <button
            v-for="(action, index) in actions"
            :key="action.id ?? action.label"
            class="npc-dialog__action"
            type="button"
            @click="selectAction(action)"
          >
            <span>{{ index + 1 }}</span>
            <b>{{ action.label }}</b>
          </button>
        </div>
      </section>
    </section>
  </main>
</template>

<style lang="scss" scoped>
.npc-dialog {
  position: fixed;
  inset: 0;
  display: grid;
  align-items: end;
  padding: 0 4.8vh 10vh;
  pointer-events: none;
  color: #ffffff;
  font-family: "SF Pro Display", "Segoe UI", sans-serif;
  box-sizing: border-box;
}

.npc-dialog::before {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 42vh;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgb(0 0 0 / 18%) 28%,
    rgb(0 0 0 / 58%) 72%,
    rgb(0 0 0 / 82%) 100%
  );
  content: "";
  pointer-events: none;
}

.npc-dialog__panel {
  position: relative;
  z-index: 1;
  width: min(118vh, calc(100vw - 9.6vh));
  min-height: 22vh;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.4vh;
  align-items: stretch;
  justify-self: center;
  padding: 1.4vh;
  pointer-events: auto;
  box-sizing: border-box;
}

.npc-dialog__identity,
.npc-dialog__message,
.npc-dialog__choices {
  border-radius: 0.8vh;
  background: rgb(255 255 255 / 5%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 6%);
}

.npc-dialog__identity {
  display: grid;
  grid-template-columns: 6.2vh minmax(0, 1fr);
  gap: 1.15vh;
  align-content: center;
  align-items: center;
  padding: 1.25vh 1.45vh;
}

.npc-dialog__portrait {
  display: grid;
  width: 6.2vh;
  height: 6.2vh;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(145deg, #ff8a2a, #9e3d16);
  color: #1b0d05;
  font-size: 2.65vh;
  font-weight: 900;
  text-transform: uppercase;
}

.npc-dialog__identity p,
.npc-dialog__choices-title,
.npc-dialog__message span {
  color: #ff9d4d;
  font-size: 1.08vh;
  font-weight: 800;
  letter-spacing: 0.08vh;
  text-transform: uppercase;
}

.npc-dialog__identity p,
.npc-dialog__identity h1,
.npc-dialog__message p {
  margin: 0;
}

.npc-dialog__identity h1 {
  overflow: hidden;
  margin-top: 0.35vh;
  font-size: 2.8vh;
  font-weight: 900;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.npc-dialog__message {
  display: grid;
  align-content: center;
  gap: 0.75vh;
  padding: 1.35vh 1.45vh;
}

.npc-dialog__message p {
  color: rgb(255 255 255 / 88%);
  font-size: clamp(1.45vh, 1.7vh, 1.9vh);
  font-weight: 600;
  line-height: 1.35;
}

.npc-dialog__choices {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 1vh;
  padding: 1.25vh 1.45vh;
}

.npc-dialog__actions {
  display: grid;
  gap: 0.75vh;
  overflow: auto;
  padding-right: 0.2vh;
}

.npc-dialog__actions--compact {
  grid-template-columns: 1fr;
  align-content: center;
}

.npc-dialog__actions--balanced {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: center;
}

.npc-dialog__actions--dense {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: start;
}

.npc-dialog__action {
  min-width: 0;
  min-height: 4.3vh;
  display: grid;
  grid-template-columns: 2.5vh minmax(0, 1fr);
  align-items: center;
  gap: 0.9vh;
  padding: 0.85vh 1vh;
  border: 0.1vh solid rgb(255 157 77 / 34%);
  border-radius: 0.55vh;
  background: linear-gradient(180deg, rgb(255 157 77 / 18%), rgb(255 157 77 / 8%));
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
}

.npc-dialog__action:hover,
.npc-dialog__action:focus-visible {
  border-color: rgb(255 157 77 / 78%);
  background: linear-gradient(180deg, rgb(255 157 77 / 30%), rgb(255 157 77 / 13%));
  outline: 0;
  transform: translateY(-0.1vh);
}

.npc-dialog__action span {
  display: grid;
  width: 2.5vh;
  height: 2.5vh;
  place-items: center;
  border-radius: 0.45vh;
  background: rgb(255 157 77 / 18%);
  color: #ffb46f;
  font-size: 1.15vh;
  font-weight: 900;
}

.npc-dialog__action b {
  min-width: 0;
  overflow: hidden;
  font-size: 1.2vh;
  font-weight: 800;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .npc-dialog {
    padding-inline: 2vh;
  }

  .npc-dialog__panel {
    width: calc(100vw - 4vh);
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .npc-dialog {
    padding: 0 1.2vh 10vh;
  }

  .npc-dialog__panel {
    grid-template-columns: 1fr;
  }

  .npc-dialog__actions--balanced,
  .npc-dialog__actions--dense {
    grid-template-columns: 1fr;
  }
}
</style>
