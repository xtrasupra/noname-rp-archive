<template>
  <div class="twinkle-axis-field" :class="`twinkle-axis-field--${type}`">
    <div v-if="type === 'plane'" class="twinkle-axis-field__plane">
      <div class="twinkle-axis-field__label twinkle-axis-field__label--top">{{ labels.top }}</div>
      <div class="twinkle-axis-field__label twinkle-axis-field__label--left">{{ labels.left }}</div>
      <div
        ref="fieldElement"
        class="twinkle-axis-field__grid"
        @pointerdown="handlePointerDown"
      >
        <div
          class="twinkle-axis-field__thumb"
          :style="{ left: `${planePercentage.x}%`, top: `${planePercentage.y}%` }"
        ></div>
      </div>
      <div class="twinkle-axis-field__label twinkle-axis-field__label--right">{{ labels.right }}</div>
      <div class="twinkle-axis-field__label twinkle-axis-field__label--bottom">{{ labels.bottom }}</div>
    </div>

    <div v-else class="twinkle-axis-field__line">
      <div class="twinkle-axis-field__line-label">{{ labels.left }}</div>
      <div
        ref="fieldElement"
        class="twinkle-axis-field__track"
        @pointerdown="handlePointerDown"
      >
        <div class="twinkle-axis-field__thumb" :style="{ left: `${linePercentage}%` }"></div>
      </div>
      <div class="twinkle-axis-field__line-label">{{ labels.right }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

export type AxisFieldValue = number | {
  x: number
  y: number
}

const props = withDefaults(
  defineProps<{
    labels?: {
      bottom?: string
      left?: string
      right?: string
      top?: string
    }
    modelValue: AxisFieldValue
    type?: 'line' | 'plane'
  }>(),
  {
    labels: () => ({}),
    type: 'plane',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: AxisFieldValue]
}>()

const fieldElement = ref<HTMLElement | null>(null)

const labels = computed(() => ({
  bottom: props.labels.bottom ?? 'Z',
  left: props.labels.left ?? 'Y',
  right: props.labels.right ?? 'W',
  top: props.labels.top ?? 'X',
}))

const planeValue = computed(() => {
  if (typeof props.modelValue === 'number') {
    return { x: props.modelValue, y: 0 }
  }

  return props.modelValue
})

const planePercentage = computed(() => ({
  x: valueToPercentage(planeValue.value.x),
  y: valueToPercentage(-planeValue.value.y),
}))

const lineValue = computed(() => (typeof props.modelValue === 'number' ? props.modelValue : props.modelValue.x))
const linePercentage = computed(() => valueToPercentage(lineValue.value))

function clamp(value: number) {
  return Math.min(1, Math.max(-1, value))
}

function valueToPercentage(value: number) {
  return ((clamp(value) + 1) / 2) * 100
}

function percentageToValue(percentage: number) {
  return Number(clamp(percentage * 2 - 1).toFixed(4))
}

function updateFromPointer(event: PointerEvent) {
  const rect = fieldElement.value?.getBoundingClientRect()

  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return
  }

  const xRatio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))

  if (props.type === 'line') {
    emit('update:modelValue', percentageToValue(xRatio))
    return
  }

  const yRatio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))

  emit('update:modelValue', {
    x: percentageToValue(xRatio),
    y: -percentageToValue(yRatio),
  })
}

function handlePointerDown(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement

  target.setPointerCapture(event.pointerId)
  updateFromPointer(event)

  const handlePointerMove = (moveEvent: PointerEvent) => {
    updateFromPointer(moveEvent)
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
</script>

<style lang="scss" scoped>
.twinkle-axis-field {
  width: 100%;
  color: #ffffff;
}

.twinkle-axis-field__plane {
  display: grid;
  grid-template-columns: px-to-vh(56) px-to-vh(150) px-to-vh(56);
  grid-template-rows: auto px-to-vh(150) auto;
  align-items: center;
  justify-content: center;
  gap: px-to-vh(8);
}

.twinkle-axis-field__label {
  font-size: px-to-vh(14);
  line-height: 1;
  text-align: center;
}

.twinkle-axis-field__label--top {
  grid-column: 2;
  grid-row: 1;
}

.twinkle-axis-field__label--left {
  grid-column: 1;
  grid-row: 2;
  text-align: right;
}

.twinkle-axis-field__label--right {
  grid-column: 3;
  grid-row: 2;
  text-align: left;
}

.twinkle-axis-field__label--bottom {
  grid-column: 2;
  grid-row: 3;
}

.twinkle-axis-field__grid {
  position: relative;
  grid-column: 2;
  grid-row: 2;
  width: px-to-vh(150);
  height: px-to-vh(150);
  cursor: pointer;
  touch-action: none;
  background-color: rgba(255, 255, 255, 0.04);
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.1) px-to-vh(1), transparent px-to-vh(1)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.1) px-to-vh(1), transparent px-to-vh(1));
  background-size: 20% 20%;
  border: px-to-vh(1) solid rgba(255, 255, 255, 0.12);
}

.twinkle-axis-field__thumb {
  position: absolute;
  width: px-to-vh(10);
  height: px-to-vh(10);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  transform: translate(-50%, -50%);
}

.twinkle-axis-field__line {
  display: grid;
  grid-template-columns: auto minmax(px-to-vh(160), 1fr) auto;
  align-items: center;
  gap: px-to-vh(16);
}

.twinkle-axis-field__line-label {
  color: #ffffff;
  font-size: px-to-vh(18);
}

.twinkle-axis-field__track {
  position: relative;
  height: px-to-vh(18);
  cursor: pointer;
  touch-action: none;
}

.twinkle-axis-field__track::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: px-to-vh(1);
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-50%);
}
</style>
