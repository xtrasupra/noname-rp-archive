<template>
  <div class="twinkle-color-picker">
    <button
      v-for="color in colors"
      :key="color"
      class="twinkle-color-picker__swatch"
      :class="{ 'twinkle-color-picker__swatch--selected': color === modelValue }"
      :style="{ background: color }"
      type="button"
      @click="emit('update:modelValue', color)"
    ></button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  colors: string[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<style lang="scss" scoped>
.twinkle-color-picker {
  display: inline-flex;
  align-items: center;
  gap: px-to-vh(7);
}

.twinkle-color-picker__swatch {
  width: px-to-vh(14);
  height: px-to-vh(14);
  padding: 0;
  border: px-to-vh(1) solid transparent;
  border-radius: px-to-vh(3);
  cursor: pointer;
}

.twinkle-color-picker__swatch--selected {
  border-color: #ffffff;
}
</style>
