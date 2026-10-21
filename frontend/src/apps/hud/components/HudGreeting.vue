<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { UserRound } from 'lucide-vue-next'
import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'
import HudKey from './HudKey.vue'

type Greeting = NonNullable<InterfacePayloadMap['hud']['greeting']>

const props = defineProps<{ greeting: Greeting }>()

const pressedKey = ref<string | null>(null)
const progress = ref(0)

let animationFrame = 0
let startedAt = 0
let settled = false

const identity = computed(
  () => `[ ${props.greeting.serverId} | #${props.greeting.characterId} ]`,
)

function settle(eventName: 'greeting:accepted' | 'greeting:declined') {
  if (settled) return

  settled = true
  cancelAnimationFrame(animationFrame)
  progress.value = 1
  callClientEvent(eventName)
}

function updateProgress(timestamp: number) {
  const duration = Math.max(1, props.greeting.duration)
  progress.value = Math.min((timestamp - startedAt) / duration, 1)

  if (progress.value >= 1) {
    settle('greeting:declined')
    return
  }

  animationFrame = requestAnimationFrame(updateProgress)
}

function restartTimer() {
  cancelAnimationFrame(animationFrame)
  settled = false
  progress.value = 0
  startedAt = performance.now()
  animationFrame = requestAnimationFrame(updateProgress)
}

const keyByCode: Record<string, 'y' | 'n'> = {
  KeyY: 'y',
  KeyN: 'n',
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.repeat || settled) return

  const key = keyByCode[event.code]
  if (!key) return

  pressedKey.value = key
  settle(key === 'y' ? 'greeting:accepted' : 'greeting:declined')
}

function handleKeyUp(event: KeyboardEvent) {
  if (keyByCode[event.code] === pressedKey.value) {
    pressedKey.value = null
  }
}

const releaseKey = () => {
  pressedKey.value = null
}

watch(
  () => [
    props.greeting.nickname,
    props.greeting.serverId,
    props.greeting.characterId,
    props.greeting.duration,
  ],
  restartTimer,
)

onMounted(() => {
  restartTimer()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', releaseKey)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', releaseKey)
})
</script>

<template>
  <article class="hud-greeting">
    <header class="hud-greeting__header">
      <UserRound class="hud-greeting__user-icon" :stroke-width="2" />
      <strong>{{ greeting.nickname }}</strong>
      <span>{{ identity }}</span>
    </header>

    <p>хочет с Вами поздороваться</p>

    <div class="hud-greeting__progress">
      <span :style="{ width: `${progress * 100}%` }"></span>
    </div>

    <div class="hud-greeting__actions">
      <div class="hud-greeting__action">
        <HudKey label="Y" :pressed="pressedKey === 'y'" />
        <span>Принять</span>
      </div>

      <div class="hud-greeting__action">
        <HudKey
          label="N"
          variant="danger"
          :pressed="pressedKey === 'n'"
        />
        <span>Отклонить</span>
      </div>
    </div>
  </article>
</template>

<style lang="scss" scoped>
.hud-greeting {
  width: min(px-to-vh(260), calc(100vw - px-to-vh(60)));
  color: #fff;
  font:
    500 px-to-vh(16) 'SF Pro',
    sans-serif;
}

.hud-greeting__header {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: px-to-vh(8);
  white-space: nowrap;
}

.hud-greeting__header strong {
  overflow: hidden;
  font: inherit;
  text-overflow: ellipsis;
}

.hud-greeting__header span {
  flex: none;
  color: rgba(255, 255, 255, 0.45);
}

.hud-greeting__user-icon {
  width: px-to-vh(20);
  height: px-to-vh(20);
  flex: none;
  color: #e000ff !important;
  stroke: #e000ff !important;
}

.hud-greeting p {
  margin-top: px-to-vh(8);
  line-height: 1.25;
}

.hud-greeting__progress {
  height: px-to-vh(4);
  margin-top: px-to-vh(20);
  overflow: hidden;
  background: #07090f;
}

.hud-greeting__progress span {
  display: block;
  height: px-to-vh(4);
  background: linear-gradient(90deg, #860099 0%, #e000ff 100%);
  box-shadow: 0 0 px-to-vh(8) rgba(224, 0, 255, 0.5);
}

.hud-greeting__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: px-to-vh(16);
  margin-top: px-to-vh(20);
}

.hud-greeting__action {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: px-to-vh(10);
  white-space: nowrap;
}
</style>
