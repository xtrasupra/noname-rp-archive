<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Axe, Gauge, Sparkles, Timer, Trees, X } from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { ForestryChallengePayload } from '@/shared/contracts/forestry'

const props = defineProps<{ payload?: ForestryChallengePayload }>()
const root = ref<HTMLElement | null>(null)
const cursor = ref(.5)
const timeRatio = ref(1)
const waiting = ref(false)
const flash = ref('')
const localRound = ref(-1)
let roundStartsAt = performance.now()
let totalEndsAt = performance.now()
let totalDuration = 1
let frame = 0
let pending: { token: string; round: number; inputId: string; retries: number } | null = null
let retryTimer = 0

const targetLeft = computed(() => Math.max(0, (Number(props.payload?.targetCenter || .5) - Number(props.payload?.targetWidth || .15) / 2) * 100))
const targetWidth = computed(() => Math.max(2, Math.min(100 - targetLeft.value, Number(props.payload?.targetWidth || .15) * 100)))
const attemptsLeft = computed(() => Math.max(0, Number(props.payload?.maxAttempts || 6) - Number(props.payload?.attempts || 0)))

function clearRetry() { if (retryTimer) window.clearTimeout(retryTimer); retryTimer = 0 }
function sendPending() {
  if (!pending) return
  callClientEvent('forestryChallenge:inputFromBrowser', JSON.stringify({ token: pending.token, round: pending.round, inputId: pending.inputId }))
}
function armRetry() {
  clearRetry()
  retryTimer = window.setTimeout(() => {
    if (!pending) return
    if (pending.retries >= 2) {
      callClientEvent('forestryChallenge:cancelFromBrowser')
      pending = null
      waiting.value = false
      return
    }
    pending.retries += 1
    sendPending()
    armRetry()
  }, pending?.retries ? 1500 : 1050)
}
function submit() {
  const payload = props.payload
  if (!payload?.token || waiting.value || performance.now() < roundStartsAt) return
  pending = {
    token: payload.token,
    round: Number(payload.round || 0),
    inputId: `${payload.token}:${payload.round}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    retries: 0,
  }
  waiting.value = true
  sendPending()
  armRetry()
}
function onKeydown(event: KeyboardEvent) {
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.repeat) return
  if (event.key === 'Escape') callClientEvent('forestryChallenge:cancelFromBrowser')
  else if (event.code === 'Space' || event.key === ' ') submit()
}
function loop(now: number) {
  const payload = props.payload
  if (payload?.token) {
    if (now < roundStartsAt) cursor.value = Number(payload.direction || 1) < 0 ? 1 - Number(payload.phase || 0) : Number(payload.phase || 0)
    else {
      const elapsed = Math.max(0, now - roundStartsAt) / 1000
      const cycle = ((Number(payload.phase || 0) + elapsed * Number(payload.speed || 1)) % 2 + 2) % 2
      const triangle = cycle <= 1 ? cycle : 2 - cycle
      cursor.value = Number(payload.direction || 1) < 0 ? 1 - triangle : triangle
    }
    timeRatio.value = Math.max(0, Math.min(1, (totalEndsAt - now) / Math.max(1, totalDuration)))
  }
  frame = requestAnimationFrame(loop)
}

watch(() => props.payload, (payload) => {
  if (!payload?.token) return
  const nextRound = Number(payload.round || 0)
  const acknowledged = Boolean(pending && payload.ackInputId === pending.inputId)
  if (acknowledged || nextRound !== localRound.value || payload.resync) {
    pending = null
    waiting.value = false
    clearRetry()
  }
  if (acknowledged && payload.lastHit !== null && payload.lastHit !== undefined && !payload.resync) {
    flash.value = payload.lastHit ? 'correct' : 'wrong'
    window.setTimeout(() => { flash.value = '' }, 220)
  }
  if (nextRound !== localRound.value || payload.resync) {
    localRound.value = nextRound
    roundStartsAt = performance.now() + Math.max(0, Number(payload.clientStartDelayMs || 0))
  }
  totalDuration = Math.max(1, Number(payload.ttlMs || 24000))
  totalEndsAt = performance.now() + totalDuration
}, { immediate: true })

onMounted(() => {
  window.focus(); root.value?.focus()
  window.addEventListener('keydown', onKeydown, true)
  frame = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  clearRetry(); cancelAnimationFrame(frame)
})
</script>

<template>
  <main ref="root" class="overlay" tabindex="-1" @pointerdown="root?.focus()">
    <section class="challenge" :class="flash">
      <header>
        <span class="icon"><Axe /></span>
        <div><small>{{ props.payload?.tool === 'golden_axe' ? 'Золотой топор · выход x2' : 'Рабочая бензопила' }}</small><h1>{{ props.payload?.treeName ?? 'Дерево' }}</h1></div>
        <button type="button" aria-label="Отменить" @click="callClientEvent('forestryChallenge:cancelFromBrowser')"><X /></button>
      </header>
      <div class="objective"><Trees /><span>Попадите бегунком в зелёную зону 3 раза</span><b>{{ props.payload?.hits ?? 0 }} / {{ props.payload?.hitsRequired ?? 3 }}</b></div>
      <div class="track" :class="{ waiting }" @click="submit">
        <span class="target" :style="{ left: `${targetLeft}%`, width: `${targetWidth}%` }" />
        <i class="cursor" :style="{ left: `${cursor * 100}%` }"><b /></i>
      </div>
      <div class="hint"><span>{{ waiting ? 'Проверка сервером…' : 'ПРОБЕЛ или ЛКМ' }}</span><em v-if="props.payload?.accelerated"><Sparkles /> Бегунок ускорился</em></div>
      <div class="timer"><Timer /><i><b :style="{ width: `${timeRatio * 100}%` }" /></i><span>Общее время</span></div>
      <footer>
        <span class="good"><Trees /><small>Попаданий</small><strong>{{ props.payload?.hits ?? 0 }}</strong></span>
        <span class="bad"><Gauge /><small>Промахов</small><strong>{{ props.payload?.misses ?? 0 }}</strong></span>
        <span><small>Попыток осталось</small><strong>{{ attemptsLeft }}</strong></span>
        <p>Скорость и зона задаются сервером для каждого раунда. Бегунок может случайно ускоряться.</p>
      </footer>
    </section>
  </main>
</template>

<style scoped lang="scss">
.overlay{position:fixed;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:0 0 3vh;color:#f3f8f2;font-family:"SF Pro Display","Segoe UI",sans-serif;background:transparent!important;pointer-events:auto;outline:none}.challenge{width:min(78vh,64vw);padding:1.15vh 1.35vh;border:.1vh solid #72ca816b;border-radius:1.2vh;background:linear-gradient(145deg,rgba(31,72,42,.92),rgba(27,42,24,.91));box-shadow:0 1.1vh 3.2vh #0007,inset 0 0 0 .1vh #ffffff10;transition:border-color .1s,transform .1s}.challenge.correct{border-color:#65efa1;transform:scale(1.006)}.challenge.wrong{border-color:#ff7764;transform:translateX(.25vh)}header{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.8vh;padding-bottom:.7vh;border-bottom:.1vh solid #ffffff16}.icon{width:3.5vh;height:3.5vh;display:grid;place-items:center;border-radius:.8vh;color:#07140b;background:linear-gradient(145deg,#97df81,#4ea55c)}svg{width:1.55vh}header small,header h1{display:block;margin:0}header small{color:#9bdd9d;font-size:clamp(10px,.72vh,14px);font-weight:850;text-transform:uppercase}header h1{margin-top:.12vh;font-size:clamp(14px,1.35vh,22px)}header button{width:2.8vh;height:2.8vh;display:grid;place-items:center;border:.1vh solid #ffffff28;border-radius:.7vh;color:#d3ddd5;background:#ffffff12}.objective{display:flex;align-items:center;gap:.5vh;margin-top:.7vh;color:#cbd9cd;font-size:.82vh}.objective svg{color:#7ad087}.objective b{margin-left:auto;color:#9ee6a8;font-size:1.15vh}.track{position:relative;height:5.2vh;margin:1vh .6vh .45vh;border:.12vh solid #ffffff22;border-radius:1vh;background:linear-gradient(180deg,#07120b,#0a1710);box-shadow:inset 0 .6vh 1.4vh #0008;cursor:pointer;overflow:hidden}.track.waiting{opacity:.7}.target{position:absolute;top:0;bottom:0;background:linear-gradient(90deg,#45ca7944,#6ced987f,#45ca7944);border-left:.14vh solid #65e899;border-right:.14vh solid #65e899;box-shadow:0 0 1.4vh #51de8c88}.cursor{position:absolute;top:.4vh;bottom:.4vh;width:.18vh;margin-left:-.09vh;background:#ffe185;box-shadow:0 0 .9vh #ffd863;will-change:left}.cursor b{position:absolute;top:50%;left:50%;width:1.05vh;height:1.05vh;border:.16vh solid #fff;border-radius:50%;background:#e6a932;transform:translate(-50%,-50%)}.hint{display:flex;align-items:center;justify-content:center;gap:1vh;color:#cbd7cd;font-size:.74vh;font-weight:850}.hint span{padding:.35vh .8vh;border-radius:.45vh;background:#ffffff12}.hint em{display:flex;align-items:center;gap:.3vh;color:#ffd071;font-style:normal}.hint em svg{width:1.1vh}.timer{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.5vh;margin-top:.7vh;color:#cbd7cd;font-size:.7vh}.timer svg{width:1.05vh;color:#7ed18c}.timer i{height:.42vh;overflow:hidden;border-radius:1vh;background:#07100880}.timer i b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#61e0a5,#c7d85b)}footer{display:flex;align-items:center;gap:.55vh;margin-top:.75vh;padding-top:.7vh;border-top:.1vh solid #ffffff1f}footer>span{min-width:6vh;padding:.4vh .55vh;border-radius:.5vh;background:#ffffff10}footer svg{float:left;margin-right:.35vh;color:#7ed18c}footer small,footer strong{display:block;font-size:clamp(10px,.64vh,13px)}footer small{color:#bdc9bf}footer strong{font-size:clamp(11px,.85vh,15px)}.good strong{color:#62dfa4}.bad strong{color:#ff9a88}footer p{margin-left:auto;max-width:27vh;color:#c2cdc4;font-size:clamp(10px,.62vh,13px);line-height:1.25}button{font:inherit;cursor:pointer}
</style>
