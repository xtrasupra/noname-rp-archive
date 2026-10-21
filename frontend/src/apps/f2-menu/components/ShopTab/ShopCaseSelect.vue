<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { BaseIcon, ChevronDown } from '@/shared/icons'

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

const selectedOption = computed(() =>
  props.options.find((option) => option.value === props.modelValue) ?? props.options[0],
)

function closeSelect() {
  isOpen.value = false
}

function toggleSelect() {
  isOpen.value = !isOpen.value
}

function selectOption(value: string) {
  emit('update:modelValue', value)
  closeSelect()
}

function handleDocumentClick(event: MouseEvent) {
  if (!selectRef.value?.contains(event.target as Node)) {
    closeSelect()
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
  <div ref="selectRef" class="shop-case-select">
    <button
      class="shop-case-select__trigger"
      :class="{ 'shop-case-select__trigger--open': isOpen }"
      type="button"
      @click.stop="toggleSelect"
      @keydown.esc="closeSelect"
    >
      <span>{{ label }}</span>
      <strong>
        <span class="shop-case-select__value">{{ selectedOption?.label }}</span>
        <BaseIcon
          class="shop-case-select__chevron"
          :icon="ChevronDown"
          size="xs"
          :stroke-width="2.4"
        />
      </strong>
    </button>

    <Transition name="shop-case-select">
      <div v-if="isOpen" class="shop-case-select__menu">
        <button
          v-for="option in options"
          :key="option.value"
          class="shop-case-select__option"
          :class="{ 'shop-case-select__option--active': option.value === modelValue }"
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
.shop-case-select {
  position: relative;
  min-width: 0;
}

.shop-case-select__trigger {
  width: 100%;
  min-height: 4vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1vh;
  padding: 0 1.05vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.65vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 5%), transparent 42%),
    rgb(8 8 9 / 92%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.shop-case-select__trigger:hover,
.shop-case-select__trigger--open {
  border-color: rgb(255 255 255 / 12%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 7%), transparent 42%),
    rgb(10 10 12 / 96%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 4%);
}

.shop-case-select__trigger span {
  overflow: hidden;
  color: rgb(255 255 255 / 48%);
  font-size: 0.88vh;
  font-weight: 700;
  line-height: 1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.shop-case-select__trigger strong {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.62vh;
  overflow: hidden;
  color: #ffffff;
  font-size: 1.08vh;
  font-weight: 700;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-case-select__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-case-select__chevron {
  flex: 0 0 auto;
  opacity: 0.74;
  transition: transform 150ms ease;
}

.shop-case-select__trigger--open .shop-case-select__chevron {
  transform: rotate(180deg);
}

.shop-case-select__menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.55vh);
  right: 0;
  left: 0;
  display: grid;
  gap: 0.35vh;
  padding: 0.45vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.75vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 5%), transparent 36%),
    rgb(7 7 8 / 98%);
  box-shadow:
    inset 0 0 0 0.1vh rgb(255 255 255 / 3%),
    0 1.4vh 3vh rgb(0 0 0 / 48%);
}

.shop-case-select__option {
  min-height: 3.45vh;
  display: grid;
  gap: 0.25vh;
  padding: 0.62vh 0.75vh;
  border: 1px solid transparent;
  border-radius: 0.55vh;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color 140ms ease, background 140ms ease;
}

.shop-case-select__option:hover,
.shop-case-select__option--active {
  border-color: rgb(255 255 255 / 8%);
  background:
    radial-gradient(12vh 4vh at 0% 50%, rgb(104 96 222 / 14%), transparent 72%),
    rgb(255 255 255 / 6%);
}

.shop-case-select__option span {
  color: #ffffff;
  font-size: 1.08vh;
  font-weight: 700;
  line-height: 1.1;
}

.shop-case-select__option small {
  color: rgb(255 255 255 / 48%);
  font-size: 0.88vh;
  font-weight: 600;
  line-height: 1.15;
}

.shop-case-select-enter-active,
.shop-case-select-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.shop-case-select-enter-from,
.shop-case-select-leave-to {
  opacity: 0;
  transform: translateY(-0.35vh);
}

.shop-case-select :is(small, [class*="__meta"], [class*="__description"], [class*="__caption"]) {
  line-height: 1.35;
}
</style>
