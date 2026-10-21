<template>
  <span class="twinkle-option-stepper">
    <button class="twinkle-option-stepper__arrow" type="button" @click="selectPrevious">
      <span class="twinkle-option-stepper__chevron twinkle-option-stepper__chevron--left"></span>
    </button>

    <span class="twinkle-option-stepper__value">{{ currentLabel }}</span>

    <button class="twinkle-option-stepper__arrow" type="button" @click="selectNext">
      <span class="twinkle-option-stepper__chevron twinkle-option-stepper__chevron--right"></span>
    </button>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface StepperOption {
  label: string
  value: string | number
}

const props = defineProps<{
  modelValue: string | number
  options: StepperOption[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const currentIndex = computed(() => {
  const index = props.options.findIndex((option) => option.value === props.modelValue)

  return index === -1 ? 0 : index
})

const currentLabel = computed(() => props.options[currentIndex.value]?.label ?? '')

function selectByOffset(offset: number) {
  if (props.options.length === 0) {
    return
  }

  const nextIndex = (currentIndex.value + offset + props.options.length) % props.options.length

  emit('update:modelValue', props.options[nextIndex].value)
}

function selectPrevious() {
  selectByOffset(-1)
}

function selectNext() {
  selectByOffset(1)
}
</script>

<style lang="scss" scoped>
.twinkle-option-stepper {
  display: inline-flex;
  align-items: center;
  gap: px-to-vh(7);
}

.twinkle-option-stepper__arrow {
  width: px-to-vh(12);
  height: px-to-vh(12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: rgba(28, 28, 28, 1);
  cursor: pointer;
}

.twinkle-option-stepper__chevron {
  width: px-to-vh(5);
  height: px-to-vh(8);
  border-top: px-to-vh(1.5) solid #525252;
  border-left: px-to-vh(1.5) solid #525252;
}

.twinkle-option-stepper__chevron--left {
  transform: rotate(-45deg) translate(px-to-vh(1), px-to-vh(1));
}

.twinkle-option-stepper__chevron--right {
  transform: rotate(135deg) translate(px-to-vh(1), px-to-vh(1));
}

.twinkle-option-stepper__value {
  color: #D2D2D2;
  white-space: nowrap;
}
</style>
