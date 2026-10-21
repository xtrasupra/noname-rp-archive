<template>
  <div ref="root" class="select">
    <button class="current" type="button" @click="opened = !opened">
      <span class="label">{{ currentCategory }}</span>
      <span class="arrow" :class="{ opened }">
        <img src="../assets/images/filter.svg" class="filter" width="11" height="11" alt="" />
      </span>
    </button>

    <Transition name="dropdown">
      <div v-show="opened" class="dropdown">
        <button
          v-for="category in categories"
          :key="category"
          class="option"
          :class="{ active: category === currentCategory }"
          type="button"
          @click="select(category)"
        >
          {{ category }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{
  categories: string[]
  currentCategory: string
}>()

const emit = defineEmits<{
  change: [category: string]
}>()

const opened = ref(false)
const root = ref<HTMLElement>()

function select(category: string) {
  opened.value = false
  emit('change', category)
}

function clickOutside(event: MouseEvent) {
  if (!root.value) {
    return
  }

  if (root.value.contains(event.target as Node)) {
    return
  }

  opened.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', clickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', clickOutside)
})
</script>

<style scoped>
.select {
  position: relative;
  --option-height: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
}

.current {
  position: relative;
  width: 100%;
  height: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0 12px;
  border: 0.1px solid #d454f4;
  border-radius: 3px;
  background: rgb(212 84 244 / 4%);
  color: #efb1ffbf;
  cursor: pointer;
  font: inherit;
  transition:
    background 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;
}

.current:hover,
.current:focus-visible {
  background: rgb(212 84 244 / 10%);
  outline: none;
}

.label {
  position: absolute;
  inset: 0 26px 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow {
  position: absolute;
  right: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b44cff;
  transition: transform 180ms ease;
}

.dropdown {
  position: absolute;
  top: 30px;
  left: 0;
  right: 0;
  z-index: 100;
  max-height: calc(var(--option-height) * 4);
  overflow-y: auto;
  border: 0.1px solid #d454f4;
  border-radius: 3px;
  background: rgb(18 7 24 / 96%);
  box-shadow: 0 12px 30px rgb(0 0 0 / 34%);
  scrollbar-color: #d454f4 transparent;
  transform-origin: top;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.dropdown::-webkit-scrollbar {
  width: 4px;
}

.dropdown::-webkit-scrollbar-track {
  background: transparent;
}

.dropdown::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #d454f4;
  box-shadow: 0 0 8px rgb(212 84 244 / 48%);
}

.option {
  width: 100%;
  height: var(--option-height);
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: #efb1ff66;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  text-align: left;
  transition:
    background 150ms ease,
    color 150ms ease;
}

.option:hover,
.option:focus-visible {
  background: rgb(212 84 244 / 14%);
  color: #efb1ffbf;
  outline: none;
}

.option.active {
  color: #efb1ffbf;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease,
    max-height 220ms ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px) scaleY(0.96);
}

.dropdown-enter-to,
.dropdown-leave-from {
  max-height: calc(var(--option-height) * 4);
  opacity: 1;
  transform: translateY(0) scaleY(1);
}
</style>
