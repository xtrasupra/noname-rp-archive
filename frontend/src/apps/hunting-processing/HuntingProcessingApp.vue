<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

const props = defineProps<{
  payload?: InterfacePayloadMap['huntingProcessing']
}>()

const localPending = ref(false)
let pendingTimer: ReturnType<typeof setTimeout> | null = null
const board = computed(() => {
  const cells = Array.isArray(props.payload?.board) ? props.payload?.board.slice(0, 9) : []
  return Array.from({ length: 9 }, (_, index) => String(cells[index] || ''))
})
const pending = computed(() => Boolean(props.payload?.pending || props.payload?.closing || localPending.value))
const attempts = computed(() => `${Number(props.payload?.attemptsUsed || 0)}/${Number(props.payload?.attemptsMax || 3)}`)

watch(() => props.payload, () => {
  localPending.value = false
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = null
}, { deep: true })

function beginPending() {
  localPending.value = true
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => {
    localPending.value = false
    pendingTimer = null
  }, 2000)
}

function choose(mode: 'minigame' | 'auto') {
  if (pending.value || props.payload?.phase !== 'choice') return
  beginPending()
  callClientEvent('huntingProcessing:choose', JSON.stringify({
    carcassId: Number(props.payload?.carcassId || 0),
    mode,
  }))
}

function move(cell: number) {
  if (pending.value || props.payload?.phase !== 'ttt' || board.value[cell]) return
  beginPending()
  callClientEvent('huntingProcessing:move', JSON.stringify({
    token: String(props.payload?.token || ''),
    cell,
  }))
}

function close() {
  if (pending.value) return
  beginPending()
  callClientEvent('huntingProcessing:close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (pendingTimer) clearTimeout(pendingTimer)
})
</script>

<template>
  <main class="processing-shell">
    <section class="processing-card" :class="`processing-card--${props.payload?.phase || 'choice'}`">
      <header>
        <div>
          <span class="eyebrow">Охотничье ремесло</span>
          <h1>{{ props.payload?.title || `Разделка туши «${props.payload?.speciesName || 'животного'}»` }}</h1>
          <p v-if="props.payload?.phase === 'choice'">Выберите способ обработки. Нож достаточно иметь в инвентаре.</p>
          <p v-else>Вы играете крестиками. Соберите линию раньше соперника.</p>
        </div>
        <button class="close" type="button" :disabled="pending" aria-label="Закрыть" @click="close">×</button>
      </header>

      <div v-if="props.payload?.phase === 'choice'" class="mode-grid">
        <button type="button" :disabled="pending" @click="choose('minigame')">
          <span class="mode-icon">×○</span>
          <strong>Крестики-нолики</strong>
          <small>1 верёвка + 1 мешок</small>
          <em>До 3 попыток</em>
        </button>
        <button class="mode-auto" type="button" :disabled="pending" @click="choose('auto')">
          <span class="mode-icon">✓</span>
          <strong>Автоматическая разделка</strong>
          <small>3 верёвки + 3 мешка</small>
          <em>Без мини-игры</em>
        </button>
      </div>

      <div v-else class="ttt-wrap">
        <div class="ttt-board" aria-label="Крестики-нолики">
          <button
            v-for="(value, index) in board"
            :key="index"
            type="button"
            :class="{ 'is-x': value === 'X', 'is-o': value === 'O' }"
            :disabled="pending || Boolean(value)"
            @click="move(index)"
          >
            {{ value }}
          </button>
        </div>
        <div class="legend"><span><b class="x">X</b> Вы</span><span><b class="o">O</b> Соперник</span></div>
      </div>

      <footer>
        <span>Попытки: {{ attempts }}</span>
        <span>{{ pending ? 'Ожидание сервера…' : 'ESC — отменить и закрыть' }}</span>
      </footer>
    </section>
  </main>
</template>

<style scoped lang="scss">
.processing-shell {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  color: #f5f1e7;
  font-family: "SF Pro Display", "Segoe UI", sans-serif;
  background: transparent;
}

.processing-card {
  width: min(55vh, 92vw);
  padding: 2.2vh;
  border: 1px solid rgb(214 176 104 / 28%);
  border-radius: 1.4vh;
  background:
    radial-gradient(circle at 100% 0%, rgb(71 110 65 / 28%), transparent 42%),
    linear-gradient(145deg, rgb(25 29 22 / 98%), rgb(10 13 11 / 98%));
  box-shadow: 0 2.5vh 9vh rgb(0 0 0 / 65%), inset 0 1px rgb(255 255 255 / 5%);
}

header {
  display: flex;
  justify-content: space-between;
  gap: 2vh;
}

.eyebrow {
  color: #d4aa65;
  font-size: 1vh;
  font-weight: 800;
  letter-spacing: 0.16vh;
  text-transform: uppercase;
}

h1 {
  margin: 0.45vh 0 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 2.7vh;
  font-weight: 600;
}

header p {
  margin: 0.65vh 0 0;
  color: rgb(245 241 231 / 58%);
  font-size: 1.2vh;
}

.close {
  width: 3.4vh;
  height: 3.4vh;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 0.7vh;
  color: #f1ddbb;
  background: rgb(255 255 255 / 5%);
  cursor: pointer;
  font-size: 2.4vh;
}

.mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.1vh;
  margin-top: 2vh;
}

.mode-grid button {
  display: flex;
  min-height: 17vh;
  flex-direction: column;
  align-items: flex-start;
  padding: 1.6vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 1vh;
  color: inherit;
  background: rgb(255 255 255 / 4%);
  cursor: pointer;
  text-align: left;
  transition: 160ms ease;
}

.mode-grid button:hover:not(:disabled) {
  border-color: rgb(110 185 105 / 55%);
  background: rgb(89 136 72 / 18%);
  transform: translateY(-0.2vh);
}

.mode-grid .mode-auto:hover:not(:disabled) { border-color: rgb(214 176 104 / 55%); }
.mode-icon { color: #a9d58d; font: 700 3vh/1 Georgia, serif; }
.mode-grid strong { margin-top: 1.5vh; font-size: 1.45vh; }
.mode-grid small { margin-top: 0.55vh; color: #d9bb82; font-size: 1.12vh; }
.mode-grid em { margin-top: auto; color: rgb(245 241 231 / 44%); font-size: 1vh; font-style: normal; }

.ttt-wrap { margin-top: 1.8vh; }
.ttt-board {
  display: grid;
  width: 30vh;
  margin: 0 auto;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.6vh;
}
.ttt-board button {
  aspect-ratio: 1;
  border: 1px solid rgb(255 255 255 / 9%);
  border-radius: 0.8vh;
  color: #fff;
  background: rgb(255 255 255 / 4%);
  cursor: pointer;
  font: 700 4.1vh/1 Georgia, serif;
}
.ttt-board button:hover:not(:disabled) { background: rgb(110 185 105 / 16%); }
.ttt-board .is-x, .legend .x { color: #83db8b; }
.ttt-board .is-o, .legend .o { color: #e78772; }
.legend { display: flex; justify-content: center; gap: 2.2vh; margin-top: 1.3vh; color: rgb(245 241 231 / 62%); font-size: 1.1vh; }
.legend b { margin-right: 0.35vh; font-family: Georgia, serif; }

footer {
  display: flex;
  justify-content: space-between;
  margin-top: 1.7vh;
  padding-top: 1.25vh;
  border-top: 1px solid rgb(255 255 255 / 7%);
  color: rgb(245 241 231 / 48%);
  font-size: 1.05vh;
}

button:disabled { cursor: default; opacity: 0.5; }

@media (max-width: 700px) {
  .mode-grid { grid-template-columns: 1fr; }
  footer { gap: 1vh; flex-direction: column; }
}
</style>
