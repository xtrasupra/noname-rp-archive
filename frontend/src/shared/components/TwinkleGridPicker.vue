<template>
  <div class="twinkle-grid-picker">
    <h2 class="twinkle-grid-picker__title">{{ title }}</h2>

    <div class="twinkle-grid-picker__grid">
      <button
        v-for="option in options"
        :key="option.key"
        class="twinkle-grid-picker__item"
        :class="{ 'twinkle-grid-picker__item--selected': option.key === modelValue }"
        type="button"
        @click="emit('update:modelValue', option.key)"
      >
        <img class="twinkle-grid-picker__image" :src="option.img" :alt="option.label ?? title">
      </button>
    </div>

    <div class="twinkle-grid-picker__actions">
      <button class="twinkle-grid-picker__button" type="button" @click="emit('back')">Назад</button>
      <button class="twinkle-grid-picker__button" type="button" @click="emit('done')">Готово</button>
    </div>
  </div>
</template>

<script setup lang="ts">
export type GridPickerKey = number | string

export interface GridPickerOption {
  img: string
  key: GridPickerKey
  label?: string
}

defineProps<{
  modelValue: GridPickerKey
  options: GridPickerOption[]
  title: string
}>()

const emit = defineEmits<{
  back: []
  done: []
  'update:modelValue': [value: GridPickerKey]
}>()
</script>

<style lang="scss" scoped>
.twinkle-grid-picker {
  width: fit-content;
  display: flex;
  flex-direction: column;
}

.twinkle-grid-picker__title {
  margin: 0 0 px-to-vh(15);
  color: #FFFFFF;
  font-size: px-to-vh(24);
  font-weight: 400;
  text-align: center;
}

.twinkle-grid-picker__grid {
  display: grid;
  grid-template-columns: repeat(3, px-to-vh(123));
  max-height: calc(px-to-vh(123) * 4 + px-to-vh(7) * 3);
  overflow-y: auto;
  gap: px-to-vh(7);
}

.twinkle-grid-picker__item {
  appearance: none;
  width: px-to-vh(123);
  height: px-to-vh(123);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: px-to-vh(1) solid rgba(255, 255, 255, 0.07);
  border-radius: px-to-vh(8);
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
}

.twinkle-grid-picker__item--selected {
  border-color: #FFFFFF;
  background: rgba(255, 255, 255, 0.08);
}

.twinkle-grid-picker__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.twinkle-grid-picker__actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: px-to-vh(7);
  margin-top: px-to-vh(30);
}

.twinkle-grid-picker__button {
  background: #101010;
  padding: px-to-vh(13) px-to-vh(77);
  color: #FFFFFF;
  font-size: px-to-vh(15);
  border: none;
  border-radius: px-to-vh(8);
  cursor: pointer;
}
</style>
