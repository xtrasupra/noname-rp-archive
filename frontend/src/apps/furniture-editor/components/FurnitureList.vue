<template>
  <div class="panel-shell" :class="{ collapsed }">
    <button
      class="menu-handle"
      type="button"
      :aria-label="collapsed ? 'Показать меню мебели' : 'Скрыть меню мебели'"
      @click="$emit('toggle-hidden')"
    >
      <span />
    </button>

    <div class="panel">
      <div class="header">
        <div class="title">
          <img src="../assets/images/furniture-editor-icon.svg" class="logo" height="40" width="40" alt="" />
          <span class="purple"><strong>{{ titleParts.accent }}</strong></span>
          <span>{{ titleParts.rest }}</span>
        </div>

        <div class="right">
          <button class="delete-all" type="button" @click="$emit('delete-all')">
            Убрать всё
          </button>

          <CategorySelect
            :categories="categories"
            :current-category="currentCategory"
            @change="$emit('change-category', $event)"
          />

          <button class="close" type="button" aria-label="Закрыть" @click="$emit('close')">
            <img src="../assets/images/cross.svg" alt="" width="11" height="11" />
          </button>
        </div>
      </div>

      <div class="split" :class="{ visible: hasOverflow }" @mousedown.stop="jumpScroll">
        <span class="scroll-thumb" :style="scrollThumbStyle" />
      </div>

      <div
        ref="scroll"
        class="list"
        @scroll="updateScrollMetrics"
        @mouseleave="stopDrag"
        @mousedown="startDrag"
        @mousemove="drag"
        @mouseup="stopDrag"
        @wheel.prevent="wheelScroll"
      >
        <FurnitureCard
          v-for="item in items"
          :key="item.id"
          :item="item"
          :selected="selectedId === item.id"
          @buy="$emit('buy', $event)"
          @delete="$emit('delete', $event)"
          @find="$emit('find', $event)"
          @move="$emit('move', $event)"
          @select="$emit('select', $event)"
        />

        <div v-if="items.length === 0" class="empty">
          В этой категории пока нет предметов
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { FurnitureEditorItem } from '@/shared/contracts/ui'

import CategorySelect from './CategorySelect.vue'
import FurnitureCard from './FurnitureCard.vue'

const props = defineProps<{
  categories: string[]
  collapsed: boolean
  currentCategory: string
  items: FurnitureEditorItem[]
  selectedId: string | number | null
  title: string
}>()

defineEmits<{
  buy: [id: string | number]
  'change-category': [category: string]
  close: []
  delete: [id: string | number]
  'delete-all': []
  find: [id: string | number]
  move: [id: string | number]
  select: [id: string | number]
  'toggle-hidden': []
}>()

const titleParts = computed(() => {
  const [accent = 'Редактор', ...rest] = props.title.split(/\s+/)

  return {
    accent,
    rest: rest.join(' ') || 'мебели',
  }
})

const scroll = ref<HTMLElement>()
const hasOverflow = ref(false)
const scrollProgress = ref(0)
const thumbScale = ref(1)
let pressed = false
let startX = 0
let scrollLeft = 0

const scrollThumbStyle = computed(() => ({
  left: `${(1 - thumbScale.value) * scrollProgress.value * 100}%`,
  width: `${thumbScale.value * 100}%`,
}))

function updateScrollMetrics() {
  const element = scroll.value

  if (!element) {
    hasOverflow.value = false
    scrollProgress.value = 0
    thumbScale.value = 1
    return
  }

  const maxScroll = element.scrollWidth - element.clientWidth

  hasOverflow.value = maxScroll > 1
  scrollProgress.value = maxScroll > 0 ? element.scrollLeft / maxScroll : 0
  thumbScale.value = element.scrollWidth > 0
    ? Math.max(0.16, Math.min(1, element.clientWidth / element.scrollWidth))
    : 1
}

function wheelScroll(event: WheelEvent) {
  if (!scroll.value) {
    return
  }

  scroll.value.scrollLeft += event.deltaY
  updateScrollMetrics()
}

function startDrag(event: MouseEvent) {
  if (!scroll.value) {
    return
  }

  pressed = true
  startX = event.pageX
  scrollLeft = scroll.value.scrollLeft
}

function drag(event: MouseEvent) {
  if (!pressed || !scroll.value) {
    return
  }

  const walk = event.pageX - startX
  scroll.value.scrollLeft = scrollLeft - walk
  updateScrollMetrics()
}

function stopDrag() {
  pressed = false
}

function jumpScroll(event: MouseEvent) {
  const element = scroll.value

  if (!element || !hasOverflow.value) {
    return
  }

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  element.scrollLeft = ratio * (element.scrollWidth - element.clientWidth)
  updateScrollMetrics()
}

watch(
  () => props.currentCategory,
  () => {
    if (scroll.value) {
      scroll.value.scrollLeft = 0
    }

    nextTick(updateScrollMetrics)
  },
)

watch(
  () => props.items.length,
  () => nextTick(updateScrollMetrics),
)

onMounted(() => {
  nextTick(updateScrollMetrics)
  window.addEventListener('resize', updateScrollMetrics)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScrollMetrics)
})
</script>

<style scoped>
.panel-shell {
  position: absolute;
  right: 28px;
  bottom: 24px;
  width: 815px;
  height: 242px;
  transition: transform 260ms ease;
}

.panel-shell.collapsed {
  transform: translateX(calc(100% + 6px));
}

.panel {
  position: absolute;
  inset: 0 0 0 5px;
  width: 810px;
  height: 242px;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: #070707;
}

.menu-handle {
  position: absolute;
  left: 0;
  top: 70px;
  z-index: 20;
  width: 10px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0.1px solid #d454f4;
  border-radius: 3px;
  background: rgb(212 84 244 / 10%);
  color: #d454f4;
  cursor: pointer;
  transition:
    background 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;
}

.menu-handle span {
  width: 4px;
  height: 14px;
  border-radius: 999px;
  background: #d454f4;
  box-shadow: 0 0 8px rgb(212 84 244 / 55%);
}

.menu-handle:hover,
.menu-handle:focus-visible {
  background: rgb(212 84 244 / 18%);
  box-shadow: 0 0 10px rgb(212 84 244 / 16%) inset;
  outline: none;
  transform: translateY(1px);
}

.header {
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px;
}

.split {
  position: relative;
  width: 100%;
  height: 1px;
  border-radius: 1px;
  overflow: hidden;
  background: transparent;
  cursor: pointer;
  opacity: 0;
  transition: opacity 160ms ease;
}

.split.visible {
  opacity: 1;
  background: linear-gradient(90deg, rgb(18 18 18 / 0%) 0%, rgb(212 84 244 / 18%) 37.5%, rgb(18 18 18 / 0%) 100%);
}

.scroll-thumb {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(18, 18, 18, 0) 0%, rgba(212, 84, 244, 0.4) 37.5%, rgba(18, 18, 18, 0) 100%);
  box-shadow: 0 0 10px rgb(212 84 244 / 48%);
  transition:
    left 90ms linear,
    width 120ms ease;
}

.title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ffffff;
  font-size: 13px;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.logo {
  width: 40px;
  height: 40px;
}

.purple {
  color: #D454F4;
}

.right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.delete-all {
  width: 120px;
  height: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
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

.delete-all:hover,
.delete-all:focus-visible {
  background: rgb(212 84 244 / 10%);
  outline: none;
}

.close {
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 3px;
  background: linear-gradient(133.9deg, rgb(123 49 142 / 5%) 0%, rgb(212 84 244 / 8%) 50%, rgb(123 49 142 / 5%) 100%);
  box-shadow: 0 -0.5px 0 0 #d454f4 inset;
  color: #b64cff;
  cursor: pointer;
  transition:
    background 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;
}

.close:hover,
.close:focus-visible {
  background: rgb(212 84 244 / 18%);
  box-shadow: 0 0 10px rgb(212 84 244 / 12%) inset;
  outline: none;
  transform: translateY(1px);
}

.list {
  min-width: 0;
  flex: 1;
  display: flex;
  gap: 14px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 16px;
  cursor: grab;
  scrollbar-width: none;
}

.list::-webkit-scrollbar {
  display: none;
}

.list:active {
  cursor: grabbing;
}

.empty {
  min-width: 100%;
  height: 120px;
  display: grid;
  place-items: center;
  border: 0.1px solid #3c3c4399;
  border-radius: 6px;
  color: rgb(255 255 255 / 48%);
  font-size: 12px;
}
</style>
