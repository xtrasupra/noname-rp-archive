<template>
  <section class="roulette-page">
    <h1 class="f2-menu__title">Рулетка</h1>

    <div class="roulette-page__layout">
      <div class="roulette-page__left">
        <div class="roulette-wheel" aria-label="Рулетка">
          <svg
            class="roulette-wheel__segments"
            :style="rouletteWheelStyle"
            viewBox="0 0 1000 1000"
            aria-hidden="true"
          >
            <path
              v-for="segment in rouletteSegmentPaths"
              :key="segment.id"
              class="roulette-wheel__segment"
              :d="segment.path"
              :fill="segment.color"
            />
          </svg>
          <Transition name="roulette-prize">
            <img v-if="visiblePrize" :key="visiblePrize.id" class="roulette-wheel__prize" :src="visiblePrize.image"
              :alt="visiblePrize.label">
          </Transition>
          <span class="roulette-wheel__pointer" aria-hidden="true"></span>
        </div>

        <div class="roulette-bet">
          <strong>Сделать ставку</strong>
          <div class="roulette-bet__controls">
            <input v-model="betAmount" type="text" placeholder="Введите сумму..." :disabled="isSpinning || !bridgeReady">
            <button v-for="multiplier in multipliers" :key="multiplier.value" class="roulette-bet__button"
              :class="`roulette-bet__button--${multiplier.tone}`" type="button" :disabled="isSpinning || !bridgeReady"
              @click="spinRoulette(multiplier.value)">
              {{ multiplier.label }}
            </button>
          </div>
          <span class="roulette-bet__result">{{ spinStatus }}</span>
          <button v-if="recoveryAvailable" class="roulette-bet__recovery" type="button" @click="retryPendingSpin">
            Проверить результат
          </button>
        </div>
      </div>

      <aside class="roulette-history">
        <h2>История рулетки</h2>

        <div v-for="entry in history" :key="entry.id" class="roulette-history__item">
          <span :style="{ background: entry.color }">{{ entry.label }}</span>
          <p>- ставка {{ entry.amount }} NoName Coin</p>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import {
  multiplierLabelToValue,
  multiplierValueToLabel,
  parseRouletteBridgeState,
  parseRouletteConfig,
  parseRouletteResult,
  type RouletteMultiplierLabel,
  type RouletteMultiplierValue,
  type RouletteSegmentConfig,
} from '@/apps/f2-menu/roulette-contract'

type RouletteSegment = RouletteSegmentConfig & {
  result: RouletteMultiplierLabel
}

type RouletteHistoryItem = {
  amount: string
  color: string
  id: string
  label: RouletteMultiplierLabel
}

type PendingSpin = {
  amount: number
  requestId: string
  selectedMultiplier: RouletteMultiplierValue
}

const props = defineProps<{
  payload?: unknown
}>()

const ROULETTE_START_ANGLE = -18
const ROULETTE_SEGMENT_GAP_DEGREES = 0.72
const ROULETTE_CENTER = 500
const ROULETTE_OUTER_RADIUS = 498
const ROULETTE_INNER_RADIUS = 296
const ROULETTE_SPIN_DURATION_MS = 3600
const ROULETTE_RESPONSE_TIMEOUT_MS = 12000
const MAX_RESPONSE_RETRIES = 3

const multiplierTones: Record<RouletteMultiplierValue, string> = {
  2: 'light',
  3: 'red',
  5: 'green',
  10: 'yellow',
}

const betAmount = ref('')
const history = ref<RouletteHistoryItem[]>([])
const bridgeReady = ref(false)
const isSpinning = ref(false)
const spinRotation = ref(0)
const spinStatus = ref('Загрузка конфигурации рулетки...')
const visiblePrize = ref<{ id: string, image: string, label: string } | null>(null)
const recoveryAvailable = ref(false)
let pendingSpin: PendingSpin | null = null
let responseRetryCount = 0
let responseTimeoutId: number | undefined
let spinTimeoutId: number | undefined

const rouletteConfig = computed(() => parseRouletteConfig(props.payload))
const rouletteSegments = computed<RouletteSegment[]>(() => (
  rouletteConfig.value?.segments.map((segment) => ({
    ...segment,
    result: multiplierValueToLabel(segment.multiplier),
  })) ?? []
))
const multipliers = computed(() => (
  [...(rouletteConfig.value?.multipliers ?? [])]
    .sort((left, right) => right - left)
    .map((multiplier) => ({
      label: multiplierValueToLabel(multiplier),
      tone: multiplierTones[multiplier],
      value: multiplierValueToLabel(multiplier),
    }))
))
const totalChance = computed(() => rouletteSegments.value.reduce((sum, segment) => sum + segment.chance, 0))

const rouletteSegmentPaths = computed(() => {
  let cursor = 0
  return rouletteSegments.value.map((segment) => {
    const start = cursor / totalChance.value * 360
    cursor += segment.chance
    const end = cursor / totalChance.value * 360
    const gap = Math.min(ROULETTE_SEGMENT_GAP_DEGREES, (end - start) / 3)
    const visibleStart = start + gap / 2
    const visibleEnd = end - gap / 2

    return {
      color: segment.color,
      id: segment.id,
      path: describeRouletteSegment(ROULETTE_START_ANGLE + visibleStart, ROULETTE_START_ANGLE + visibleEnd),
    }
  })
})

const rouletteWheelStyle = computed(() => ({
  '--roulette-rotation': `${spinRotation.value}deg`,
}))

function getSegmentCenterAngle(segmentId: string) {
  let cursor = 0

  for (const segment of rouletteSegments.value) {
    const start = cursor / totalChance.value * 360
    cursor += segment.chance
    const end = cursor / totalChance.value * 360

    if (segment.id === segmentId) {
      return ROULETTE_START_ANGLE + (start + end) / 2
    }
  }

  return 0
}

function polarToCartesian(radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180

  return {
    x: ROULETTE_CENTER + radius * Math.cos(angleInRadians),
    y: ROULETTE_CENTER + radius * Math.sin(angleInRadians),
  }
}

function describeRouletteSegment(startAngle: number, endAngle: number) {
  const outerStart = polarToCartesian(ROULETTE_OUTER_RADIUS, startAngle)
  const outerEnd = polarToCartesian(ROULETTE_OUTER_RADIUS, endAngle)
  const innerEnd = polarToCartesian(ROULETTE_INNER_RADIUS, endAngle)
  const innerStart = polarToCartesian(ROULETTE_INNER_RADIUS, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1

  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${ROULETTE_OUTER_RADIUS} ${ROULETTE_OUTER_RADIUS} 0 ${largeArcFlag} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${ROULETTE_INNER_RADIUS} ${ROULETTE_INNER_RADIUS} 0 ${largeArcFlag} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    'Z',
  ].join(' ')
}

function normalizeAmount(value: string) {
  const normalized = value.replace(/[^\d]/g, '')

  return normalized
}

function showBetAmountError() {
  spinStatus.value = 'Введите корректную сумму ставки'
}

function addHistory(segment: RouletteSegment, amount: number) {
  history.value = [
    {
      id: `${Date.now()}-${segment.id}`,
      label: segment.result,
      amount: String(amount),
      color: segment.color,
    },
    ...history.value,
  ].slice(0, 6)
}

function clearResponseTimeout() {
  if (responseTimeoutId !== undefined) {
    window.clearTimeout(responseTimeoutId)
    responseTimeoutId = undefined
  }
}

function clearSpinTimeout() {
  if (spinTimeoutId !== undefined) {
    window.clearTimeout(spinTimeoutId)
    spinTimeoutId = undefined
  }
}

function createRequestId() {
  return `roulette:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
}

function getResultSegment(multiplier: RouletteMultiplierValue, segmentId: string) {
  return rouletteSegments.value.find((segment) => (
    segment.id === segmentId && segment.multiplier === multiplier
  )) ?? null
}

function acknowledgeSpin(requestId: string) {
  callClientEvent('cef:roulette:ack', requestId)
}

function finishFailedSpin(message: string, requestId?: string) {
  clearResponseTimeout()
  clearSpinTimeout()
  pendingSpin = null
  responseRetryCount = 0
  recoveryAvailable.value = false
  isSpinning.value = false
  spinStatus.value = message
  if (requestId) acknowledgeSpin(requestId)
}

function applyRouletteResult(result: ReturnType<typeof parseRouletteResult>) {
  if (!result || !pendingSpin || result.requestId !== pendingSpin.requestId) {
    return
  }

  if (spinTimeoutId !== undefined) return
  clearResponseTimeout()
  responseRetryCount = 0
  recoveryAvailable.value = false

  if (!result.success || result.resultMultiplier === null) {
    finishFailedSpin(result.message, result.requestId)
    return
  }

  const activeSpin = pendingSpin
  const winningSegment = result.segmentId
    ? getResultSegment(result.resultMultiplier, result.segmentId)
    : null

  if (!winningSegment) {
    finishFailedSpin('Сервер вернул неизвестный сектор рулетки.', result.requestId)
    return
  }

  const targetAngle = getSegmentCenterAngle(winningSegment.id)
  const currentFullTurns = Math.ceil(spinRotation.value / 360)
  const extraTurns = 6 + Math.floor(Math.random() * 3)

  spinRotation.value = (currentFullTurns + extraTurns) * 360 - targetAngle
  spinStatus.value = 'Рулетка крутится...'
  clearSpinTimeout()
  spinTimeoutId = window.setTimeout(() => {
    if (pendingSpin?.requestId !== result.requestId) return

    addHistory(winningSegment, activeSpin.amount)
    visiblePrize.value = winningSegment.prizeImage
      ? {
          id: `${Date.now()}-${winningSegment.id}`,
          image: winningSegment.prizeImage,
          label: `Приз ${winningSegment.result}`,
        }
      : null
    spinStatus.value = result.message || `Выпало ${winningSegment.result}`
    pendingSpin = null
    responseRetryCount = 0
    recoveryAvailable.value = false
    isSpinning.value = false
    spinTimeoutId = undefined
    acknowledgeSpin(result.requestId)
  }, ROULETTE_SPIN_DURATION_MS)
}

function handleRouletteResult(event: Event) {
  applyRouletteResult(parseRouletteResult((event as CustomEvent<unknown>).detail))
}

function armResponseTimeout(requestId: string) {
  clearResponseTimeout()
  responseTimeoutId = window.setTimeout(() => {
    if (pendingSpin?.requestId !== requestId) return

    responseTimeoutId = undefined

    if (responseRetryCount >= MAX_RESPONSE_RETRIES) {
      recoveryAvailable.value = true
      spinStatus.value = 'Ответ задерживается. Ставка сохранена — проверьте результат повторно.'
      return
    }

    responseRetryCount += 1
    spinStatus.value = `Ответ задерживается. Проверяем сохранённый результат (${responseRetryCount}/${MAX_RESPONSE_RETRIES})...`
    callClientEvent('cef:roulette:retry', requestId)
    armResponseTimeout(requestId)
  }, ROULETTE_RESPONSE_TIMEOUT_MS)
}

function retryPendingSpin() {
  if (!pendingSpin) return

  responseRetryCount = 0
  recoveryAvailable.value = false
  spinStatus.value = 'Повторно проверяем сохранённый результат...'
  callClientEvent('cef:roulette:retry', pendingSpin.requestId)
  armResponseTimeout(pendingSpin.requestId)
}

function handleRouletteState(event: Event) {
  const state = parseRouletteBridgeState((event as CustomEvent<unknown>).detail)
  bridgeReady.value = true

  if (!rouletteConfig.value) {
    spinStatus.value = 'Конфигурация рулетки недоступна'
    return
  }

  if (!state?.pending) {
    const storedResult = rouletteConfig.value.pendingResult

    if (!pendingSpin && storedResult?.success && storedResult.selectedMultiplier !== null) {
      pendingSpin = {
        amount: storedResult.bet,
        requestId: storedResult.requestId,
        selectedMultiplier: storedResult.selectedMultiplier,
      }
      betAmount.value = String(storedResult.bet)
      isSpinning.value = true
      spinStatus.value = 'Восстанавливаем сохранённый результат...'
      applyRouletteResult(storedResult)
      return
    }

    if (!pendingSpin) {
      isSpinning.value = false
      spinStatus.value = 'Введите ставку и выберите множитель'
    }
    return
  }

  pendingSpin = { ...state.pending }
  responseRetryCount = 0
  recoveryAvailable.value = false
  betAmount.value = String(state.pending.amount)
  isSpinning.value = true
  spinStatus.value = state.result ? 'Восстанавливаем результат...' : 'Ожидаем результат сервера...'

  if (state.result) {
    applyRouletteResult(state.result)
  } else {
    armResponseTimeout(state.pending.requestId)
  }
}

function spinRoulette(selectedMultiplierLabel: RouletteMultiplierLabel) {
  if (isSpinning.value) {
    return
  }

  const normalizedAmount = normalizeAmount(betAmount.value)
  const amount = Number(normalizedAmount)
  const config = rouletteConfig.value

  if (
    !config
    || !normalizedAmount
    || !Number.isSafeInteger(amount)
    || amount < config.minBet
    || amount > config.maxBet
  ) {
    showBetAmountError()
    return
  }

  const requestId = createRequestId()
  const selectedMultiplier = multiplierLabelToValue(selectedMultiplierLabel)

  pendingSpin = { amount, requestId, selectedMultiplier }
  responseRetryCount = 0
  recoveryAvailable.value = false
  isSpinning.value = true
  visiblePrize.value = null
  spinStatus.value = 'Проверяем ставку...'
  callClientEvent('cef:roulette:bet', amount, selectedMultiplier, requestId)
  armResponseTimeout(requestId)
}

onMounted(() => {
  window.addEventListener('twinkle:roulette:result', handleRouletteResult)
  window.addEventListener('twinkle:roulette:state', handleRouletteState)
  callClientEvent('cef:roulette:ready')
})

onBeforeUnmount(() => {
  window.removeEventListener('twinkle:roulette:result', handleRouletteResult)
  window.removeEventListener('twinkle:roulette:state', handleRouletteState)
  clearResponseTimeout()
  clearSpinTimeout()
  pendingSpin = null
})
</script>

<style scoped>
.roulette-page {
  position: relative;
  min-height: calc(100vh - 2.1vh);
  isolation: isolate;
}

.roulette-page__layout {
  display: grid;
  grid-template-columns: minmax(0, 62vh) 52.6vh;
  gap: 6.6vh;
  align-items: start;
  width: fit-content;
  margin: 4.25vh auto 0;
}

.roulette-page__left {
  display: grid;
  justify-items: center;
}

.roulette-wheel {
  position: relative;
  width: 59.3vh;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  isolation: isolate;
}

.roulette-wheel__segments {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 0.18vh rgb(0 0 0 / 72%),
    0 0.45vh 0 rgb(0 0 0 / 28%);
  backface-visibility: hidden;
  transform: rotate(var(--roulette-rotation));
  transform-origin: 50% 50%;
  transition: transform 3600ms cubic-bezier(0.08, 0.78, 0.08, 1);
  will-change: transform;
}

.roulette-wheel__segment {
  stroke: #050505;
  stroke-linejoin: round;
  stroke-width: 0.5;
  vector-effect: non-scaling-stroke;
}

.roulette-wheel__center {
  position: absolute;
  inset: 12vh;
  z-index: 1;
  border-radius: 50%;
  background: #050505;
}

.roulette-wheel__prize {
  position: absolute;
  left: 50%;
  bottom: -7px;
  z-index: 2;
  width: 100%;
  height: 45.6vh;
  object-fit: contain;
  object-position: center bottom;
  pointer-events: none;
  transform: translateX(-50%);
  transform-origin: 50% 64%;
}

.roulette-prize-enter-active {
  animation: roulette-prize-reveal 620ms cubic-bezier(0.18, 0.88, 0.24, 1.12);
}

.roulette-prize-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.roulette-prize-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.9) rotate(-8deg);
}

@keyframes roulette-prize-reveal {
  0% {
    opacity: 0;
    transform: translateX(-50%) scale(0.42) rotate(-26deg);
  }

  58% {
    opacity: 1;
    transform: translateX(-50%) scale(1.06) rotate(5deg);
  }

  100% {
    opacity: 1;
    transform: translateX(-50%) scale(1) rotate(0deg);
  }
}

.roulette-wheel__pointer {
  position: absolute;
  top: -0.15vh;
  left: 50%;
  z-index: 3;
  width: 0;
  height: 0;
  border-right: 1.55vh solid transparent;
  border-left: 1.55vh solid transparent;
  border-top: 5.1vh solid #050505;
  transform: translateX(-50%);
}

.roulette-bet {
  width: 62.6vh;
  min-height: 10.75vh;
  display: grid;
  justify-items: center;
  margin-top: 1.45vh;
  padding: 1.65vh 3.75vh 2vh;
  border: 1px solid rgb(255 255 255 / 3%);
  border-radius: 1.55vh;
  background: rgb(0 0 0 / 72%);
  box-sizing: border-box;
}

.roulette-bet strong {
  color: #ffffff;
  font-size: 1.75vh;
  line-height: 1;
}

.roulette-bet__controls {
  display: grid;
  grid-template-columns: minmax(0, 19.9vh) repeat(4, 8.25vh);
  gap: 0.55vh;
  margin-top: 1.3vh;
}

.roulette-bet__result {
  margin-top: 1.05vh;
  color: rgb(255 255 255 / 68%);
  font-size: 1.35vh;
  font-weight: 600;
}

.roulette-bet__recovery {
  margin-top: 0.9vh;
  padding: 0.75vh 1.4vh;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 0.55vh;
  background: rgb(255 255 255 / 8%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 1.25vh;
  font-weight: 600;
}

.roulette-bet__recovery:hover,
.roulette-bet__recovery:focus-visible {
  border-color: rgb(255 255 255 / 34%);
  background: rgb(255 255 255 / 13%);
  outline: 0;
}

.roulette-bet input {
  min-width: 0;
  height: 4.05vh;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 0.45vh;
  background: rgb(255 255 255 / 5%);
  color: #ffffff;
  padding: 0 1vh;
  font: inherit;
  font-size: 1.25vh;
  outline: 0;
}

.roulette-bet input::placeholder {
  color: rgb(255 255 255 / 40%);
}

.roulette-bet__button {
  height: 4.05vh;
  border: 0;
  border-radius: 0.55vh;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 1.95vh;
  font-weight: 600;
  transition: filter 140ms ease, transform 140ms ease;
}

.roulette-bet__button:disabled {
  cursor: wait;
  filter: saturate(0.72) brightness(0.9);
}

.roulette-bet__button:hover,
.roulette-bet__button:focus-visible {
  filter: brightness(1.1);
  outline: 0;
  transform: translateY(-0.1vh);
}

.roulette-bet__button:active {
  transform: translateY(0) scale(0.97);
}

.roulette-bet__button--yellow {
  background: #f0e600;
}

.roulette-bet__button--green {
  background: #19c994;
}

.roulette-bet__button--red {
  background: #e40000;
}

.roulette-bet__button--light {
  background: #dddddd;
  color: #000000;
}

.roulette-history {
  width: 52.6vh;
  min-height: 71.2vh;
  margin-top: 0;
  padding: 2.05vh 3.55vh;
  border: 1px solid rgb(255 255 255 / 3%);
  border-radius: 1.55vh;
  background: rgb(0 0 0 / 76%);
  box-sizing: border-box;
}

.roulette-history h2 {
  margin: 0;
  color: #ffffff;
  font-size: 1.9vh;
  font-weight: 600;
  line-height: 1;
  text-align: center;
}

.roulette-history__item {
  min-height: 4.75vh;
  display: flex;
  align-items: center;
  gap: 1.05vh;
  margin-top: 2.15vh;
  padding: 0 1.6vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.45vh;
  background: rgb(255 255 255 / 5%);
}

.roulette-history__item span {
  min-width: 6.35vh;
  min-height: 3.15vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.45vh;
  background: #19c994;
  color: #ffffff;
  font-size: 1.9vh;
  font-weight: 600;
}

.roulette-history__item p {
  margin: 0;
  color: #ffffff;
  font-size: 1.55vh;
  font-weight: 600;
  line-height: 1;
}
</style>
