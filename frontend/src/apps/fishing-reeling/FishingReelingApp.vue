<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

const props = defineProps<{
  payload?: InterfacePayloadMap['fishingReeling']
}>()

const localProgress = ref(0)
const submitted = ref(false)
let frameId = 0
let localStartedAt = 0

const phase = computed(() => props.payload?.phase || 'timing')
const token = computed(() => props.payload?.token || '')
const durationMs = computed(() => Math.max(900, Number(props.payload?.durationMs || 2400)))
const targetStart = computed(() => clamp(Number(props.payload?.targetStart ?? 0.68), 0.05, 0.95))
const targetEnd = computed(() => clamp(Number(props.payload?.targetEnd ?? 0.84), targetStart.value + 0.03, 0.98))
const targetMiddle = computed(() => (targetStart.value + targetEnd.value) / 2)
const resultText = computed(() => {
  const reason = props.payload?.reason || ''
  if (reason === 'caught') return 'Улов получен'
  if (reason === 'missed' || reason === 'escaped') return 'Рыба сорвалась'
  if (reason === 'moved') return 'Рыбалка отменена'
  return 'Сессия завершена'
})
const panelTitle = computed(() => {
  if (phase.value === 'result') return resultText.value
  if (phase.value === 'fail') return 'Промах'
  return 'Подсекай'
})
const panelSubtitle = computed(() => {
  if (phase.value === 'result') return 'Возвращайтесь к точке для следующего заброса'
  if (phase.value === 'fail') return 'Новая попытка начнётся через секунду'
  return props.payload?.pointName || 'Точка ловли'
})
const progressPercent = computed(() => Math.round(localProgress.value * 100))
const pulseStyle = computed(() => ({
  width: `${Math.max(0.5, localProgress.value * 100)}%`,
  height: `${Math.max(0.5, localProgress.value * 100)}%`,
  opacity: localProgress.value > 0.02 ? '1' : '0',
}))
const targetStyle = computed(() => ({
  width: `${targetMiddle.value * 100}%`,
  height: `${targetMiddle.value * 100}%`,
}))

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0))
}

function stopLoop() {
  if (frameId) window.cancelAnimationFrame(frameId)
  frameId = 0
}

function tick() {
  const elapsed = performance.now() - localStartedAt
  localProgress.value = clamp(elapsed / durationMs.value)
  if (localProgress.value < 1 && !submitted.value && phase.value === 'timing') {
    frameId = window.requestAnimationFrame(tick)
  }
}

function startLoop() {
  stopLoop()
  submitted.value = false
  localProgress.value = 0
  localStartedAt = performance.now()
  frameId = window.requestAnimationFrame(tick)
}

function submitTiming() {
  if (phase.value !== 'timing' || submitted.value) return
  submitted.value = true
  stopLoop()
  callClientEvent('fishingReeling:hook', JSON.stringify({
    token: token.value,
    progress: localProgress.value,
  }))
}

function cancel() {
  callClientEvent('fishingReeling:cancel')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
    return
  }

  if (event.code === 'Space') {
    event.preventDefault()
    submitTiming()
  }
}

watch(
  () => `${phase.value}:${token.value}:${props.payload?.startedAt || 0}`,
  () => {
    if (phase.value === 'timing') startLoop()
    else stopLoop()
  },
  { immediate: true },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  stopLoop()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <main class="fishing-reeling">
    <section class="timing-panel" :class="`phase-${phase}`">
      <header class="timing-panel__header">
        <div>
          <span>Рыбалка</span>
          <h1>{{ panelTitle }}</h1>
          <p>{{ panelSubtitle }}</p>
        </div>
        <button type="button" @click="cancel">ESC</button>
      </header>

      <div v-if="phase === 'timing' || phase === 'fail'" class="timing-game" :class="{ submitted, failed: phase === 'fail' }">
        <div class="timing-game__arena" @click="submitTiming">
          <div v-if="phase === 'timing'" class="timing-game__target" :style="targetStyle"></div>
          <div v-if="phase === 'timing'" class="timing-game__pulse" :style="pulseStyle"></div>
          <div class="timing-game__core"></div>
          <strong v-if="phase === 'fail'" class="timing-game__fail">Провал</strong>
        </div>

        <div v-if="phase === 'timing'" class="timing-game__status">
          <strong>SPACE</strong>
          <span>Нажмите, когда белый круг попадёт в красный</span>
          <i>{{ progressPercent }}%</i>
        </div>
      </div>

      <div v-else class="result-state">
        <strong>{{ resultText }}</strong>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.fishing-reeling {
  display: contents;
  color: #fff;
  font-family: "Montserrat", "Inter", "Segoe UI", sans-serif;
  pointer-events: none;
  background: transparent;
}

.timing-panel {
  --fish-panel: rgb(9 6 13 / 91%);
  --fish-panel-strong: rgb(20 8 28 / 89%);
  --fish-purple: #d94cff;
  --fish-cyan: #4bdaff;
  --fish-red: #ff3454;
  --fish-white: #f8fbff;

  position: fixed;
  top: 50%;
  right: 4vw;
  transform: translateY(-50%);
  width: min(32vh, 22vw);
  min-width: 27vh;
  padding: 1.35vh;
  box-sizing: border-box;
  border: 0.1vh solid rgb(217 76 255 / 48%);
  border-radius: 1.15vh;
  background:
    radial-gradient(circle at 22% 0%, rgb(217 76 255 / 20%), transparent 36%),
    linear-gradient(155deg, var(--fish-panel), var(--fish-panel-strong));
  box-shadow: 0 2vh 5vh rgb(0 0 0 / 42%);
  pointer-events: auto;
  animation: panelIn 180ms ease-out both;
}

.timing-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1vh;
  margin-bottom: 1.1vh;

  span {
    color: var(--fish-purple);
    font-size: 0.92vh;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.25vh 0 0;
    color: var(--fish-white);
    font-size: 2.1vh;
    line-height: 1.05;
  }

  p {
    margin: 0.45vh 0 0;
    color: rgb(248 251 255 / 62%);
    font-size: 1.08vh;
    line-height: 1.3;
  }

  button {
    min-width: 4.8vh;
    height: 3vh;
    border: 0.1vh solid rgb(217 76 255 / 48%);
    border-radius: 0.75vh;
    color: #fff;
    background: rgb(16 6 24 / 88%);
    cursor: pointer;
    font: inherit;
    font-size: 0.95vh;
    font-weight: 800;
    transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;

    &:hover {
      transform: translateY(-0.08vh);
      border-color: rgb(75 218 255 / 72%);
      background: rgb(217 76 255 / 30%);
    }
  }
}

.timing-game {
  display: grid;
  gap: 1.25vh;
  justify-items: center;
  padding: 0.8vh 0 0.4vh;

  &.submitted {
    opacity: 0.72;
  }

  &.failed {
    opacity: 1;
  }
}

.timing-game__arena {
  position: relative;
  width: 18vh;
  height: 18vh;
  border-radius: 50%;
  background:
    radial-gradient(circle, rgb(217 76 255 / 28%) 0 13%, transparent 14%),
    radial-gradient(circle, rgb(255 255 255 / 6%) 0 42%, rgb(3 5 8 / 82%) 43% 100%);
  box-shadow:
    inset 0 0 3.2vh rgb(0 0 0 / 56%),
    0 0 2.4vh rgb(217 76 255 / 24%);
  overflow: hidden;
}

.timing-game__target,
.timing-game__pulse,
.timing-game__core {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.timing-game__target {
  border: 0.42vh solid var(--fish-red);
  box-shadow:
    0 0 1.6vh rgb(255 52 84 / 62%),
    inset 0 0 1.2vh rgb(255 52 84 / 22%);
}

.timing-game__pulse {
  border: 0.26vh solid rgb(255 255 255 / 95%);
  background: rgb(255 255 255 / 12%);
  box-shadow:
    0 0 1.6vh rgb(255 255 255 / 36%),
    inset 0 0 1.2vh rgb(255 255 255 / 14%);
}

.timing-game__core {
  width: 1.6vh;
  height: 1.6vh;
  background: var(--fish-white);
  box-shadow: 0 0 1.4vh rgb(255 255 255 / 58%);
}

.timing-game__fail {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 3;
  color: var(--fish-red);
  font-size: 2.4vh;
  font-weight: 950;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 0 1.6vh rgb(255 52 84 / 72%);
  transform: translate(-50%, -50%);
}

.timing-game.failed .timing-game__arena {
  background:
    radial-gradient(circle, rgb(255 52 84 / 24%) 0 24%, transparent 25%),
    radial-gradient(circle, rgb(255 255 255 / 6%) 0 42%, rgb(3 5 8 / 78%) 43% 100%);
  box-shadow:
    inset 0 0 3.2vh rgb(0 0 0 / 66%),
    0 0 2.4vh rgb(255 52 84 / 28%);
}

.timing-game.failed .timing-game__core {
  opacity: 0;
}

.timing-game__status {
  display: grid;
  gap: 0.35vh;
  justify-items: center;
  text-align: center;

  strong {
    min-width: 7.2vh;
    padding: 0.5vh 1vh;
    border: 0.1vh solid rgb(217 76 255 / 58%);
    border-radius: 0.7vh;
    color: #fff;
    background: rgb(217 76 255 / 20%);
    font-size: 1.05vh;
    letter-spacing: 0.08em;
  }

  span,
  i {
    color: rgb(255 255 255 / 64%);
    font-size: 1.02vh;
    font-style: normal;
  }
}

.result-state {
  display: grid;
  min-height: 12vh;
  place-items: center;
  text-align: center;

  strong {
    font-size: 1.8vh;
  }
}

@keyframes panelIn {
  from {
    opacity: 0;
    transform: translate(1vh, -50%) scale(0.96);
  }

  to {
    opacity: 1;
    transform: translate(0, -50%) scale(1);
  }
}
</style>
