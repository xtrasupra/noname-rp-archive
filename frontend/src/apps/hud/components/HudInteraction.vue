<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

type Interaction = NonNullable<InterfacePayloadMap['hud']['interaction']>

const props = defineProps<{ interaction: Interaction }>()

const HOLD_DURATION = 1000
const RADIUS = 9.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const progress = ref(0)

let animationFrame = 0
let holdStartedAt = 0
let activeKey: string | null = null
let completed = false

const normalizedKey = computed(() => props.interaction.key.trim().toLowerCase())
const progressOffset = computed(() => CIRCUMFERENCE * (1 - progress.value))

function matchesInteractionKey(event: KeyboardEvent) {
  return event.key.toLowerCase() === normalizedKey.value
}

function completeInteraction() {
  if (completed) return

  completed = true
  progress.value = 1
  callClientEvent('interaction:completed')
}

function updateProgress(timestamp: number) {
  progress.value = Math.min((timestamp - holdStartedAt) / HOLD_DURATION, 1)

  if (progress.value >= 1) {
    completeInteraction()
    return
  }

  animationFrame = requestAnimationFrame(updateProgress)
}

function handleKeyDown(event: KeyboardEvent) {
  if (!matchesInteractionKey(event) || event.repeat || activeKey) return

  activeKey = normalizedKey.value

  if (!props.interaction.holdRequired) {
    completeInteraction()
    return
  }

  holdStartedAt = performance.now()
  animationFrame = requestAnimationFrame(updateProgress)
}

function releaseInteraction(event?: KeyboardEvent) {
  if (event && !matchesInteractionKey(event)) return

  cancelAnimationFrame(animationFrame)
  animationFrame = 0
  activeKey = null
  completed = false
  progress.value = 0
}

const handleBlur = () => releaseInteraction()

watch(
  () => [props.interaction.key, props.interaction.holdRequired],
  () => releaseInteraction(),
)

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', releaseInteraction)
  window.addEventListener('blur', handleBlur)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', releaseInteraction)
  window.removeEventListener('blur', handleBlur)
})
</script>

<template>
  <div class="hud-interaction">
    <span class="hud-interaction__text">Нажмите</span>

    <div class="hud-interaction__key">
      <svg
        class="hud-interaction__progress"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          class="hud-interaction__progress-track"
          cx="12"
          cy="12"
          :r="RADIUS"
        />
        <circle
          class="hud-interaction__progress-value"
          cx="12"
          cy="12"
          :r="RADIUS"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="progressOffset"
        />
      </svg>

      <kbd>{{ interaction.key }}</kbd>
    </div>

    <span class="hud-interaction__text">для взаимодействия</span>
  </div>
</template>

<style lang="scss" scoped>
.hud-interaction {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: px-to-vh(5);
  white-space: nowrap;
}

.hud-interaction__text {
  color: #fff;
  font:
    510 px-to-vh(14) 'SF Pro',
    sans-serif;
  text-shadow: 0 px-to-vh(1.5) px-to-vh(3.6) rgba(0, 0, 0, 0.6);
}

.hud-interaction__key {
  position: relative;
  display: grid;
  width: px-to-vh(40);
  height: px-to-vh(40);
  flex: none;
  place-items: center;
  border-radius: 50%;
}

.hud-interaction__progress {
  position: absolute;
  width: 100%;
  height: 100%;
  overflow: visible;
  transform: rotate(90deg);
}

.hud-interaction__progress-track,
.hud-interaction__progress-value {
  fill: rgb(224, 0, 255, .25);
  stroke-width: 1.5;
}

.hud-interaction__progress-track {
  stroke: rgba(224, 0, 255, 0.18);
}

.hud-interaction__progress-value {
  fill: transparent;
  stroke: #e000ff;
  stroke-linecap: round;
}

.hud-interaction kbd {
  position: relative;
  z-index: 1;
  border: 0;
  background: transparent;
  color: #fff;
  font:
    510 px-to-vh(14) 'SF Pro',
    sans-serif;
}
</style>
