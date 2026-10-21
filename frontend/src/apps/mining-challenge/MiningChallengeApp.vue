<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Crosshair, Gauge, Pickaxe, Timer, X } from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { MiningChallengePayload } from '@/shared/contracts/mining'

const props = defineProps<{ payload?: MiningChallengePayload }>()
const localIndex = ref(0)
const correct = ref(0)
const errors = ref(0)
const rootElement = ref<HTMLElement | null>(null)
const stepDeadline = ref(0)
const totalDeadline = ref(0)
const totalDuration = ref(1)
const timeRatio = ref(1)
const flash = ref<'correct' | 'wrong' | ''>('')
const serverToken = ref('')
const awaitingServer = ref(false)
const acknowledgedIndex = ref(-1)
let frame = 0
let retryTimer = 0
let pendingInput: { token: string, index: number, key: string, inputId: string, retries: number } | null = null

const cyrillicPhysicalKey: Record<string, string> = {
  'Й': 'Q', 'Ц': 'W', 'У': 'E', 'К': 'R', 'Е': 'T', 'Н': 'Y', 'Г': 'U', 'Ш': 'I', 'Щ': 'O', 'З': 'P',
  'Ф': 'A', 'Ы': 'S', 'В': 'D', 'А': 'F', 'П': 'G', 'Р': 'H', 'О': 'J', 'Л': 'K', 'Д': 'L',
  'Я': 'Z', 'Ч': 'X', 'С': 'C', 'М': 'V', 'И': 'B', 'Т': 'N', 'Ь': 'M',
}

const sequence = computed(() => props.payload?.sequence ?? [])
const currentKey = computed(() => sequence.value[localIndex.value] || '')
const stepReady = computed(() => Boolean(currentKey.value))
const hpRatio = computed(() => Math.max(0, Math.min(1, Number(props.payload?.hp || 0) / Math.max(1, Number(props.payload?.maxHp || 1)))))

function delayFor(index: number) {
  const first = Number(props.payload?.firstDelayMs || 900)
  const minimum = Number(props.payload?.minimumDelayMs || 260)
  const acceleration = Number(props.payload?.acceleration || .91)
  return Math.max(minimum, first * Math.pow(acceleration, index))
}

function armStepDeadline() {
  stepDeadline.value = performance.now() + delayFor(localIndex.value)
}

function normalizeKeyboard(event: KeyboardEvent) {
  if (event.code === 'Space') return 'SPACE'
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') return 'SHIFT'
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3)
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5)
  if (/^Numpad[0-9]$/.test(event.code)) return event.code.slice(6)
  // Embedded CEF versions can omit `code`, especially with a non-English
  // layout. Windows virtual-key codes remain layout-independent.
  const legacyCode = Number(event.keyCode || (event as KeyboardEvent & { which?: number }).which || 0)
  if (legacyCode >= 65 && legacyCode <= 90) return String.fromCharCode(legacyCode)
  if (legacyCode >= 48 && legacyCode <= 57) return String.fromCharCode(legacyCode)
  if (legacyCode >= 96 && legacyCode <= 105) return String(legacyCode - 96)
  if (legacyCode === 32) return 'SPACE'
  if (legacyCode === 16) return 'SHIFT'
  const fallback = String(event.key || '').toUpperCase()
  if (/^[A-Z0-9]$/.test(fallback)) return fallback
  if (cyrillicPhysicalKey[fallback]) return cyrillicPhysicalKey[fallback]
  if (fallback === ' ' || fallback === 'SPACEBAR') return 'SPACE'
  if (fallback === 'SHIFT') return 'SHIFT'
  return null
}

function clearRetryTimer() {
  if (retryTimer) window.clearTimeout(retryTimer)
  retryTimer = 0
}

function dispatchPending() {
  if (!pendingInput) return
  callClientEvent('miningChallenge:inputFromBrowser', JSON.stringify(pendingInput))
}

function armRetry() {
  clearRetryTimer()
  retryTimer = window.setTimeout(() => {
    if (!pendingInput) return
    if (pendingInput.retries >= 2) {
      callClientEvent('miningChallenge:cancelFromBrowser')
      pendingInput = null
      awaitingServer.value = false
      return
    }
    pendingInput.retries += 1
    dispatchPending()
    armRetry()
  }, pendingInput?.retries ? 1500 : 1000)
}

function submit(key: string) {
  const payload = props.payload
  if (!payload?.token || awaitingServer.value || localIndex.value >= sequence.value.length || !stepReady.value) return
  pendingInput = {
    token: payload.token,
    index: localIndex.value,
    key,
    inputId: `${payload.token}:${localIndex.value}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    retries: 0,
  }
  awaitingServer.value = true
  dispatchPending()
  armRetry()
}

function onKeydown(event: KeyboardEvent) {
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.repeat) return
  if (event.key === 'Escape') {
    callClientEvent('miningChallenge:cancelFromBrowser')
    return
  }
  const key = normalizeKeyboard(event)
  if (!key) return
  submit(key)
}

function onMouse(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('button')) return
  const key = event.button === 0 ? 'MOUSE1' : event.button === 2 ? 'MOUSE2' : null
  if (!key) return
  event.preventDefault()
  event.stopImmediatePropagation()
  rootElement.value?.focus()
  submit(key)
}

function onContextMenu(event: MouseEvent) {
  event.preventDefault()
}

function keyLabel(key: string, compact = false) {
  if (!key) return '·'
  if (key === 'SPACE') return compact ? '␣' : 'ПРОБЕЛ'
  if (key === 'SHIFT') return compact ? '⇧' : 'SHIFT'
  if (key === 'MOUSE1') return compact ? 'Л' : 'ЛКМ'
  if (key === 'MOUSE2') return compact ? 'П' : 'ПКМ'
  return key
}

function loop(now: number) {
  if (totalDeadline.value > 0) timeRatio.value = Math.max(0, Math.min(1, (totalDeadline.value - now) / totalDuration.value))
  if (!awaitingServer.value && stepDeadline.value > 0 && localIndex.value < sequence.value.length && stepReady.value && now >= stepDeadline.value) submit('TIMEOUT')
  frame = requestAnimationFrame(loop)
}

watch(() => props.payload, (payload) => {
  if (!payload?.token) {
    serverToken.value = ''
    awaitingServer.value = false
    pendingInput = null
    clearRetryTimer()
    acknowledgedIndex.value = -1
    localIndex.value = 0
    stepDeadline.value = 0
    totalDeadline.value = 0
    return
  }

  const tokenChanged = serverToken.value !== payload.token
  serverToken.value = payload.token
  const authoritativeIndex = Math.max(0, Math.min(
    sequence.value.length,
    Number.isInteger(payload.index) ? Number(payload.index) : 0,
  ))

  const acknowledgedPending = Boolean(pendingInput && payload.ackInputId && payload.ackInputId === pendingInput.inputId)
  if (acknowledgedPending) {
    pendingInput = null
    awaitingServer.value = false
    clearRetryTimer()
    if (!payload.resync) {
      flash.value = payload.lastCorrect ? 'correct' : 'wrong'
      window.setTimeout(() => { flash.value = '' }, 150)
    }
  }

  // The game-client keyboard fallback can win the same physical key race when
  // embedded CEF reports it late. Any authoritative step advance therefore
  // clears a browser request even if its inputId was not the one accepted.
  if (authoritativeIndex > localIndex.value && pendingInput) {
    pendingInput = null
    awaitingServer.value = false
    clearRetryTimer()
  }

  if (tokenChanged) {
    pendingInput = null
    awaitingServer.value = false
    clearRetryTimer()
    acknowledgedIndex.value = -1
    totalDuration.value = Math.max(1, Number(payload.ttlMs || 36000))
    totalDeadline.value = performance.now() + totalDuration.value
  }

  // Reliable UI delivery may replay the same packet. Never let an old or
  // duplicate acknowledgement unlock and rewind an in-flight next key.
  if (!tokenChanged && authoritativeIndex <= acknowledgedIndex.value) return
  acknowledgedIndex.value = authoritativeIndex
  if (!payload.ackInputId) awaitingServer.value = false

  // Correct, wrong and timed-out inputs all move forward only after the
  // authoritative server feedback, preventing skipped or rewound keys.
  localIndex.value = authoritativeIndex
  correct.value = Math.max(0, Number(payload.correct || 0))
  errors.value = Math.max(0, Number(payload.errors || 0))
  if (tokenChanged || payload.resync) flash.value = ''

  if (localIndex.value < sequence.value.length && stepReady.value) armStepDeadline()
  else {
    stepDeadline.value = 0
  }
}, { immediate: true })

onMounted(() => {
  window.focus()
  rootElement.value?.focus()
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('mousedown', onMouse, true)
  window.addEventListener('contextmenu', onContextMenu, true)
  frame = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('mousedown', onMouse, true)
  window.removeEventListener('contextmenu', onContextMenu, true)
  clearRetryTimer()
  cancelAnimationFrame(frame)
})
</script>

<template>
  <main ref="rootElement" class="overlay" tabindex="-1" @pointerdown="rootElement?.focus()">
    <section class="challenge" :class="flash">
      <header>
        <span class="icon"><Pickaxe /></span>
        <div><small>Добыча · {{ props.payload?.tool === 'drill' ? 'пневматический бур' : props.payload?.tool === 'golden_pickaxe' ? 'золотая кирка x2' : 'рабочая кирка' }}</small><h1>{{ props.payload?.resourceName ?? 'Камень' }}</h1></div>
        <button type="button" aria-label="Отменить" @click="callClientEvent('miningChallenge:cancelFromBrowser')"><X /></button>
      </header>

      <div class="rock-health">
        <span><Crosshair /> HP камня</span><strong>{{ Math.max(0, Math.round(props.payload?.hp ?? 0)) }} / {{ props.payload?.maxHp ?? 0 }}</strong>
        <i><b :style="{ width: `${hpRatio * 100}%` }" /></i>
      </div>

      <div class="key-stage">
        <div class="next previous">{{ keyLabel(sequence[localIndex - 1] ?? '·', true) }}</div>
        <div class="current"><span>{{ keyLabel(currentKey) }}</span><small>{{ awaitingServer ? 'проверка…' : 'нажмите сейчас' }}</small></div>
        <div class="next" aria-hidden="true"></div>
      </div>

      <div class="timer"><Timer /><i><b :style="{ width: `${timeRatio * 100}%` }" /></i><span>Общее время</span></div>

      <div class="sequence">
        <span v-for="(key, index) in sequence" :key="`${key}-${index}`" :class="{ done: index < localIndex, active: index === localIndex }">{{ index > localIndex ? '·' : keyLabel(key, true) }}</span>
      </div>

      <footer>
        <span><Gauge /><small>Точность</small><strong>{{ Math.round(correct / Math.max(1, correct + errors) * 100) }}%</strong></span>
        <span class="good"><small>Верно</small><strong>{{ correct }}</strong></span>
        <span class="bad"><small>Ошибки</small><strong>{{ errors }}</strong></span>
        <p>Килограммы зависят от верных клавиш. Нулевой результат не считается участием.</p>
      </footer>
    </section>
  </main>
</template>

<style scoped lang="scss">
.overlay {
  position: fixed; inset: 0; display: flex; align-items: flex-end; justify-content: center;
  padding: 0 0 2.8vh; color: #f4f7f2; font-family: "SF Pro Display", "Segoe UI", sans-serif;
  background: transparent !important;
  pointer-events: auto; outline: none;
}
.challenge {
  width: min(76vh, 62vw); padding: 1vh 1.2vh; border: .1vh solid #e6bc4e66; border-radius: 1.2vh;
  background: linear-gradient(145deg, rgba(87, 72, 35, .9), rgba(35, 62, 40, .88));
  box-shadow: 0 1.1vh 3.2vh #0006, inset 0 0 0 .1vh #ffffff10;
  backdrop-filter: none; pointer-events: auto; transition: border-color .1s, transform .1s;
}
.challenge.correct { border-color: #58e5a7; transform: scale(1.005); }
.challenge.wrong { border-color: #ff775f; transform: translateX(.25vh); }
header { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: .8vh; padding-bottom: .65vh; border-bottom: .1vh solid #ffffff12; }
.icon { width: 3.5vh; height: 3.5vh; display: grid; place-items: center; border-radius: .8vh; color: #171006; background: linear-gradient(145deg, #f0c95d, #db962f); }
svg { width: 1.55vh; }
header small, header h1 { display: block; margin: 0; }
header small { color: #f0cf75; font-size: clamp(10px, .72vh, 14px); font-weight: 850; text-transform: uppercase; }
header h1 { margin-top: .12vh; font-size: clamp(14px, 1.35vh, 22px); }
header button { width: 2.8vh; height: 2.8vh; display: grid; place-items: center; border: .1vh solid #ffffff28; border-radius: .7vh; color: #d3ddd5; background: #ffffff12; }
.rock-health { display: grid; grid-template-columns: 1fr auto; gap: .35vh; margin-top: .65vh; color: #ced9cf; font-size: .78vh; }
.rock-health span { display: flex; align-items: center; gap: .35vh; }
.rock-health svg { width: 1.05vh; color: #f0c95d; }
.rock-health strong { color: #fff; }
.rock-health i, .timer i { grid-column: 1 / 3; height: .46vh; overflow: hidden; border-radius: 1vh; background: #07100880; }
.rock-health i b, .timer i b { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #db8d2c, #f1cc61); }
.rock-health i b { transition: width .18s; }
.key-stage { height: 6.8vh; display: grid; grid-template-columns: 1fr 2fr 1fr; align-items: center; gap: .7vh; }
.current { min-width: 6.4vh; height: 5.7vh; padding: 0 .75vh; display: grid; place-items: center; align-content: center; justify-self: center; border: .16vh solid #f5d27b99; border-radius: 1.2vh; background: radial-gradient(circle, #f2ca6240, #ffffff0d); box-shadow: 0 0 2vh #dcad3c33; }
.current span { font-size: 1.9vh; font-weight: 950; }
.current small { margin-top: .22vh; color: #d2ddd4; font-size: clamp(10px, .58vh, 13px); text-transform: uppercase; }
.next { justify-self: center; color: #aebcaf; font-size: 1.1vh; font-weight: 900; }
.previous { opacity: .42; }
.timer { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: .5vh; color: #d0d9d1; font-size: clamp(10px, .68vh, 13px); }
.timer svg { width: 1.05vh; color: #f0c95d; }
.timer i { grid-column: auto; height: .42vh; }
.timer i b { background: linear-gradient(90deg, #61e0a5, #e8bd4e); transition: none; }
.sequence { display: flex; justify-content: center; gap: .3vh; margin: .65vh 0; overflow: hidden; }
.sequence span { min-width: 1.75vh; height: 1.75vh; display: grid; place-items: center; border: .1vh solid #ffffff20; border-radius: .35vh; color: #a8b7aa; background: #ffffff0b; font-size: clamp(10px, .68vh, 13px); font-weight: 900; }
.sequence span.done { color: #8fd1af; background: #4ad5901c; }
.sequence span.active { border-color: #edc359; color: #171006; background: #e9bd51; box-shadow: 0 0 1vh #e7b94b55; }
footer { display: flex; align-items: center; gap: .55vh; padding-top: .65vh; border-top: .1vh solid #ffffff1f; }
footer > span { min-width: 5.3vh; padding: .4vh .55vh; border-radius: .5vh; background: #ffffff10; }
footer > span:first-child { display: grid; grid-template-columns: auto 1fr; gap: .05vh .3vh; }
footer svg { grid-row: 1 / 3; color: #f0c95d; }
footer small, footer strong { display: block; font-size: clamp(10px, .64vh, 13px); }
footer small { color: #bdc9bf; }
footer strong { font-size: clamp(11px, .85vh, 15px); }
.good strong { color: #62dfa4; }
.bad strong { color: #ff9a88; }
footer p { margin-left: auto; max-width: 25vh; color: #c2cdc4; font-size: clamp(10px, .62vh, 13px); line-height: 1.25; }
button { font: inherit; cursor: pointer; }
</style>
