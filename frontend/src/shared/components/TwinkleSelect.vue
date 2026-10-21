<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

export type TwinkleSelectOption = {
  label: string
  value: string
  description?: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: TwinkleSelectOption[]
  ariaLabel?: string
  variant?: 'default' | 'marketplace' | 'government'
}>(), {
  ariaLabel: 'Select',
  variant: 'default',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
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
  <div ref="selectRef" class="twinkle-select" :class="`twinkle-select--${variant}`">
    <button
      class="twinkle-select__trigger"
      :class="{ 'twinkle-select__trigger--open': isOpen }"
      type="button"
      :aria-label="ariaLabel"
      :aria-expanded="isOpen"
      @click.stop="toggleSelect"
      @keydown.esc.stop.prevent="closeSelect"
    >
      <span v-if="$slots.icon" class="twinkle-select__icon" aria-hidden="true">
        <slot name="icon"></slot>
      </span>
      <span class="twinkle-select__value">{{ selectedOption?.label }}</span>
      <ChevronDown class="twinkle-select__chevron" aria-hidden="true" />
    </button>

    <Transition name="twinkle-select">
      <div v-if="isOpen" class="twinkle-select__menu" role="listbox" :aria-label="ariaLabel">
        <button
          v-for="option in options"
          :key="option.value"
          class="twinkle-select__option"
          :class="{ 'twinkle-select__option--active': option.value === modelValue }"
          type="button"
          role="option"
          :aria-selected="option.value === modelValue"
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
.twinkle-select {
  position: relative;
  min-width: 0;
}

.twinkle-select__trigger {
  width: 100%;
  min-height: 4vh;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  justify-items: start;
  gap: 0.8vh;
  padding: 0 1.05vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.75vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 5%), transparent 42%),
    rgb(8 8 10 / 94%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.twinkle-select__trigger:hover,
.twinkle-select__trigger--open {
  border-color: rgb(255 255 255 / 14%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 7%), transparent 42%),
    rgb(10 10 12 / 98%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 4%);
}

.twinkle-select__icon,
.twinkle-select__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(255 255 255 / 62%);
}

.twinkle-select__icon :deep(svg),
.twinkle-select__chevron {
  width: 1.55vh;
  height: 1.55vh;
}

.twinkle-select__chevron {
  justify-self: end;
  transition: transform 150ms ease;
}

.twinkle-select__trigger--open .twinkle-select__chevron {
  transform: rotate(180deg);
}

.twinkle-select__value {
  width: 100%;
  min-width: 0;
  justify-self: start;
  overflow: hidden;
  color: #ffffff;
  font-size: 1.28vh;
  font-weight: 800;
  line-height: 1;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.twinkle-select__menu {
  position: absolute;
  z-index: 80;
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
    rgb(7 7 9 / 98%);
  box-shadow:
    inset 0 0 0 0.1vh rgb(255 255 255 / 3%),
    0 1.4vh 3vh rgb(0 0 0 / 52%);
}

.twinkle-select__option {
  min-height: 3.35vh;
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

.twinkle-select__option:hover,
.twinkle-select__option--active {
  border-color: rgb(255 255 255 / 8%);
  background: rgb(255 255 255 / 6%);
}

.twinkle-select__option span {
  overflow: hidden;
  color: #ffffff;
  font-size: 1.22vh;
  font-weight: 760;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.twinkle-select__option small {
  color: rgb(255 255 255 / 48%);
  font-size: 1.05vh;
  font-weight: 600;
  line-height: 1.2;
}

.twinkle-select--marketplace .twinkle-select__trigger {
  min-height: px-to-vh(44);
  padding: 0 px-to-vh(12);
  border-color: rgb(255 255 255 / 10%);
  border-radius: px-to-vh(8);
  background: rgb(255 255 255 / 6%);
}

.twinkle-select--marketplace .twinkle-select__trigger:hover,
.twinkle-select--marketplace .twinkle-select__trigger--open {
  border-color: rgb(172 46 205 / 34%);
  background: rgb(172 46 205 / 10%);
}

.twinkle-select--marketplace .twinkle-select__menu {
  top: calc(100% + px-to-vh(6));
  border-color: rgb(172 46 205 / 24%);
  border-radius: px-to-vh(8);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 5%), transparent 42%),
    rgb(10 8 13 / 98%);
}

.twinkle-select--marketplace .twinkle-select__option:hover,
.twinkle-select--marketplace .twinkle-select__option--active {
  border-color: rgb(172 46 205 / 24%);
  background: rgb(172 46 205 / 12%);
}

.twinkle-select--government .twinkle-select__trigger {
  min-height: px-to-vh(38);
  padding: 0 px-to-vh(10);
  border-color: rgb(255 255 255 / 9%);
  border-radius: px-to-vh(5);
  background: #0c1019;
  box-shadow: none;
}

.twinkle-select--government .twinkle-select__trigger:hover,
.twinkle-select--government .twinkle-select__trigger--open {
  border-color: rgb(224 0 255 / 34%);
  background: #101521;
  box-shadow: 0 0 0 px-to-vh(1) rgb(224 0 255 / 8%);
}

.twinkle-select--government .twinkle-select__value {
  font-size: px-to-vh(10);
  font-weight: 500;
}

.twinkle-select--government .twinkle-select__chevron {
  width: px-to-vh(14);
  height: px-to-vh(14);
  color: rgb(255 255 255 / 42%);
}

.twinkle-select--government .twinkle-select__menu {
  z-index: 120;
  top: calc(100% + px-to-vh(5));
  gap: px-to-vh(3);
  padding: px-to-vh(5);
  border-color: rgb(255 255 255 / 9%);
  border-radius: px-to-vh(6);
  background: #0c1019;
  box-shadow: 0 px-to-vh(14) px-to-vh(36) rgb(0 0 0 / 58%);
}

.twinkle-select--government .twinkle-select__option {
  min-height: px-to-vh(37);
  gap: px-to-vh(3);
  padding: px-to-vh(7) px-to-vh(9);
  border-radius: px-to-vh(5);
}

.twinkle-select--government .twinkle-select__option:hover,
.twinkle-select--government .twinkle-select__option--active {
  border-color: rgb(224 0 255 / 18%);
  background: rgb(224 0 255 / 10%);
}

.twinkle-select--government .twinkle-select__option span {
  font-size: px-to-vh(10);
  font-weight: 550;
}

.twinkle-select--government .twinkle-select__option small {
  color: rgb(255 255 255 / 34%);
  font-size: px-to-vh(8);
  font-weight: 400;
}
.twinkle-select-enter-active,
.twinkle-select-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.twinkle-select-enter-from,
.twinkle-select-leave-to {
  opacity: 0;
  transform: translateY(-0.35vh);
}
</style>
