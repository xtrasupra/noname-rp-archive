<template>
  <div
    ref="trackElement"
    class="twinkle-range-slider"
    :class="`twinkle-range-slider--${theme}`"
    role="slider"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="modelValue"
    tabindex="0"
    @keydown="handleKeydown"
    @pointerdown="handlePointerDown"
  >
    <div class="twinkle-range-slider__thumb" :style="{ left: `${percentage}%` }"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    max?: number
    min?: number
    modelValue: number
    step?: number
    theme?: 'dark' | 'light'
  }>(),
  {
    max: 1,
    min: -1,
    step: 0.01,
    theme: 'dark',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const trackElement = ref<HTMLElement | null>(null)

const percentage = computed(() => {
  const range = props.max - props.min

  if (range <= 0) {
    return 0
  }

  return ((clamp(props.modelValue) - props.min) / range) * 100
})

function clamp(value: number) {
  return Math.min(props.max, Math.max(props.min, value))
}

function normalize(value: number) {
  const stepped = Math.round(value / props.step) * props.step

  return Number(clamp(stepped).toFixed(4))
}

function updateFromClientX(clientX: number) {
  const rect = trackElement.value?.getBoundingClientRect()

  if (!rect || rect.width <= 0) {
    return
  }

  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  const value = props.min + ratio * (props.max - props.min)

  emit('update:modelValue', normalize(value))
}

function handlePointerDown(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement

  target.setPointerCapture(event.pointerId)
  updateFromClientX(event.clientX)

  const handlePointerMove = (moveEvent: PointerEvent) => {
    updateFromClientX(moveEvent.clientX)
  }

  const handlePointerUp = () => {
    target.removeEventListener('pointermove', handlePointerMove)
    target.removeEventListener('pointerup', handlePointerUp)
    target.removeEventListener('pointercancel', handlePointerUp)
  }

  target.addEventListener('pointermove', handlePointerMove)
  target.addEventListener('pointerup', handlePointerUp)
  target.addEventListener('pointercancel', handlePointerUp)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return
  }

  event.preventDefault()

  const direction = event.key === 'ArrowRight' ? 1 : -1

  emit('update:modelValue', normalize(props.modelValue + props.step * direction))
}
</script>

<style lang="scss" scoped>
.twinkle-range-slider {
  position: relative;
  width: 100%;
  height: px-to-vh(14);
  cursor: pointer;
  touch-action: none;
  outline: none;
}

.twinkle-range-slider::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: px-to-vh(1);
  background: var(--twinkle-range-track);
  transform: translateY(-50%);
}

.twinkle-range-slider__thumb {
  position: absolute;
  top: 50%;
  width: px-to-vh(10);
  height: px-to-vh(10);
  border-radius: 50%;
  background: var(--twinkle-range-thumb);
  transform: translate(-50%, -50%);
}

.twinkle-range-slider--dark {
  --twinkle-range-thumb: rgba(0, 0, 0, 0.8);
  --twinkle-range-track: rgba(0, 0, 0, 0.3);
}

.twinkle-range-slider--light {
  --twinkle-range-thumb: rgba(255, 255, 255, 0.8);
  --twinkle-range-track: rgba(255, 255, 255, 0.3);
}
</style>
