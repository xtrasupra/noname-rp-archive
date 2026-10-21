<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

type SelectOption = {
  label: string
  value: string
  description?: string
}

const props = defineProps<{
  label: string
  modelValue: string
  options: SelectOption[]
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const isOpen = ref(false)
const selectRef = ref<HTMLElement | null>(null)

function toggleSelect() {
  isOpen.value = !isOpen.value
}

function selectOption(value: string) {
  emit('update:modelValue', value)
  isOpen.value = false
}

function handleDocumentClick(event: MouseEvent) {
  if (!selectRef.value?.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<template>
  <div ref="selectRef" class="f2-filter-select">
    <button
      class="f2-filter-select__trigger"
      :class="{ 'f2-filter-select__trigger--open': isOpen }"
      type="button"
      @click.stop="toggleSelect"
      @keydown.esc="isOpen = false"
    >
      <span>{{ label }}</span>
      <strong>{{ options.find((option) => option.value === modelValue)?.label }}</strong>
    </button>

    <Transition name="f2-filter-select">
      <div v-if="isOpen" class="f2-filter-select__menu">
        <button
          v-for="option in options"
          :key="option.value"
          class="f2-filter-select__option"
          :class="{ 'f2-filter-select__option--active': option.value === modelValue }"
          type="button"
          @click="selectOption(option.value)"
        >
          <span>{{ option.label }}</span>
          <small v-if="option.description">{{ option.description }}</small>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.f2-filter-select {
  position: relative;
  width: min(23vh, 100%);
}

.f2-filter-select__trigger {
  width: 100%;
  min-height: 4.55vh;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 1vh;
  padding: 0 1.25vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 0.9vh;
  background: rgb(9 9 9 / 96%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color 140ms ease, background 140ms ease;
}

.f2-filter-select__trigger:hover,
.f2-filter-select__trigger--open {
  border-color: rgb(255 255 255 / 18%);
  background: rgb(18 18 18 / 96%);
}

.f2-filter-select__trigger span {
  color: rgb(255 255 255 / 58%);
  font-size: 1.12vh;
  font-weight: 600;
}

.f2-filter-select__trigger strong {
  display: inline-flex;
  align-items: center;
  gap: 0.7vh;
  color: #ffffff;
  font-size: 1.28vh;
  font-weight: 600;
  white-space: nowrap;
}

.f2-filter-select__trigger strong::after {
  width: 0.55vh;
  height: 0.55vh;
  border-right: 0.18vh solid currentColor;
  border-bottom: 0.18vh solid currentColor;
  content: "";
  transform: translateY(-0.18vh) rotate(45deg);
  transition: transform 140ms ease;
}

.f2-filter-select__trigger--open strong::after {
  transform: translateY(0.12vh) rotate(225deg);
}

.f2-filter-select__menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.55vh);
  right: 0;
  width: 100%;
  display: grid;
  gap: 0.35vh;
  padding: 0.55vh;
  border: 1px solid rgb(255 255 255 / 9%);
  border-radius: 0.95vh;
  background: rgb(7 7 7 / 99%);
  box-shadow: 0 1.4vh 3vh rgb(0 0 0 / 48%);
}

.f2-filter-select__option {
  min-height: 4.15vh;
  display: grid;
  gap: 0.35vh;
  padding: 0.75vh 0.85vh;
  border: 1px solid transparent;
  border-radius: 0.7vh;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.f2-filter-select__option:hover,
.f2-filter-select__option--active {
  border-color: rgb(255 255 255 / 8%);
  background: rgb(255 255 255 / 6%);
}

.f2-filter-select__option span {
  font-size: 1.22vh;
  font-weight: 600;
}

.f2-filter-select__option small {
  color: rgb(255 255 255 / 56%);
  font-size: 1vh;
  font-weight: 600;
  line-height: 1.2;
}

.f2-filter-select-enter-active,
.f2-filter-select-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.f2-filter-select-enter-from,
.f2-filter-select-leave-to {
  opacity: 0;
  transform: translateY(-0.35vh);
}
</style>
