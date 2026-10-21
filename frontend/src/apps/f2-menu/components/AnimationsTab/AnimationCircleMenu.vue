<template>
  <section class="animation-circle-menu">
    <h1 class="f2-menu__title">Круговое меню</h1>

    <div class="animation-circle-menu__layout">
      <section class="animation-wheel-panel">
        <header class="animation-circle-header">
          <span>Слоты меню</span>
          <strong>{{ assignedCount }} / {{ wheelSlots.length }}</strong>
        </header>

        <div class="animation-wheel-preview" aria-label="Слоты кругового меню">
          <svg class="animation-wheel-preview__ring" viewBox="0 0 560 560" role="presentation">
            <circle class="animation-wheel-preview__base" cx="280" cy="280" r="192" />

            <g v-for="(slot, index) in wheelSlots" :key="slot.id">
              <path
                class="animation-wheel-preview__segment"
                :class="{
                  'animation-wheel-preview__segment--active': selectedSlotId === slot.id,
                  'animation-wheel-preview__segment--filled': getSlotAnimation(slot.id),
                }"
                :d="getSegmentPath(index)"
                @click="selectedSlotId = slot.id"
              />
              <text
                class="animation-wheel-preview__label"
                dominant-baseline="middle"
                text-anchor="middle"
                :x="getLabelPosition(index).x"
                :y="getLabelPosition(index).y"
                :transform="getLabelTransform(index)"
              >
                {{ getSlotAnimation(slot.id)?.shortName ?? slot.label }}
              </text>
            </g>

            <circle class="animation-wheel-preview__hole" cx="280" cy="280" r="116" />
          </svg>

          <div class="animation-wheel-preview__center">
            <span>F3</span>
            <strong>{{ selectedAnimation?.name ?? 'Выберите слот' }}</strong>
          </div>
        </div>
      </section>

      <section class="animation-picker">
        <header class="animation-circle-header">
          <span>Выбор анимации</span>
          <strong>Слот {{ selectedSlot?.label }}</strong>
        </header>

        <label class="animation-picker__search">
          <BaseIcon :icon="Search" size="xs" :stroke-width="2.35" />
          <input v-model.trim="searchQuery" type="text" placeholder="Найти анимацию">
        </label>

        <div class="animation-picker__selected">
          <span>Назначено</span>
          <strong>{{ selectedAnimation?.name ?? 'Анимация не выбрана' }}</strong>
          <button
            type="button"
            :disabled="!selectedAnimation"
            @click="clearSelectedSlot"
          >
            <BaseIcon :icon="X" size="xs" :stroke-width="2.45" />
          </button>
        </div>

        <div class="animation-picker__list">
          <button
            v-for="animation in filteredAnimations"
            :key="animation.id"
            type="button"
            :class="{ 'animation-picker__item--active': selectedAnimation?.id === animation.id }"
            @click="assignAnimation(animation)"
          >
            <span class="animation-picker__mock" aria-hidden="true">GIF</span>
            <div>
              <strong>{{ animation.name }}</strong>
              <small>{{ animation.category }}</small>
            </div>
            <BaseIcon
              v-if="selectedAnimation?.id === animation.id"
              :icon="Check"
              size="xs"
              :stroke-width="2.55"
            />
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { BaseIcon, Check, Search, X } from '@/shared/icons'
import type { AnimationCatalogItem } from './animationCatalog'

type WheelSlot = {
  id: number
  label: string
}

type Point = {
  x: number
  y: number
}

const props = defineProps<{
  animationItems: AnimationCatalogItem[]
}>()

const wheelSlots: WheelSlot[] = [
  { id: 1, label: 'Слот 1' },
  { id: 2, label: 'Слот 2' },
  { id: 3, label: 'Слот 3' },
  { id: 4, label: 'Слот 4' },
  { id: 5, label: 'Слот 5' },
  { id: 6, label: 'Слот 6' },
]

const center = 280
const outerRadius = 245
const innerRadius = 139
const labelRadius = 192
const segmentGap = 10
const cornerRadius = 21

const assignedAnimations = ref<Record<number, string>>({
  1: 'hands-up',
  2: 'wave-hands',
  3: 'phone-call',
})
const searchQuery = ref('')
const selectedSlotId = ref(1)

const selectedSlot = computed(() => wheelSlots.find((slot) => slot.id === selectedSlotId.value))
const assignedCount = computed(() => Object.values(assignedAnimations.value).filter(Boolean).length)
const animations = computed(() => props.animationItems)
const selectedAnimation = computed(() => getSlotAnimation(selectedSlotId.value))
const filteredAnimations = computed(() => {
  const query = searchQuery.value.toLowerCase()

  if (!query) {
    return animations.value
  }

  return animations.value.filter((animation) =>
    animation.name.toLowerCase().includes(query)
    || animation.category.toLowerCase().includes(query),
  )
})

function getSlotAnimation(slotId: number) {
  const animationId = assignedAnimations.value[slotId]

  return animations.value.find((animation) => animation.id === animationId)
}

function assignAnimation(animation: AnimationCatalogItem) {
  assignedAnimations.value = {
    ...assignedAnimations.value,
    [selectedSlotId.value]: animation.id,
  }
}

function clearSelectedSlot() {
  const nextAssignments = { ...assignedAnimations.value }

  delete nextAssignments[selectedSlotId.value]
  assignedAnimations.value = nextAssignments
}

function getSegmentPath(index: number) {
  const step = 360 / wheelSlots.length
  const startAngle = -90 + index * step + segmentGap / 2
  const endAngle = -90 + (index + 1) * step - segmentGap / 2
  const outerCornerAngle = (cornerRadius / outerRadius) * (180 / Math.PI)
  const innerCornerAngle = (cornerRadius / innerRadius) * (180 / Math.PI)
  const outerStart = polarToCartesian(startAngle + outerCornerAngle, outerRadius)
  const outerEnd = polarToCartesian(endAngle - outerCornerAngle, outerRadius)
  const endOuterControl = polarToCartesian(endAngle, outerRadius)
  const endOuterSide = polarToCartesian(endAngle, outerRadius - cornerRadius)
  const endInnerSide = polarToCartesian(endAngle, innerRadius + cornerRadius)
  const endInnerControl = polarToCartesian(endAngle, innerRadius)
  const innerEnd = polarToCartesian(endAngle - innerCornerAngle, innerRadius)
  const innerStart = polarToCartesian(startAngle + innerCornerAngle, innerRadius)
  const startInnerControl = polarToCartesian(startAngle, innerRadius)
  const startInnerSide = polarToCartesian(startAngle, innerRadius + cornerRadius)
  const startOuterSide = polarToCartesian(startAngle, outerRadius - cornerRadius)
  const startOuterControl = polarToCartesian(startAngle, outerRadius)
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `Q ${endOuterControl.x} ${endOuterControl.y} ${endOuterSide.x} ${endOuterSide.y}`,
    `L ${endInnerSide.x} ${endInnerSide.y}`,
    `Q ${endInnerControl.x} ${endInnerControl.y} ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    `Q ${startInnerControl.x} ${startInnerControl.y} ${startInnerSide.x} ${startInnerSide.y}`,
    `L ${startOuterSide.x} ${startOuterSide.y}`,
    `Q ${startOuterControl.x} ${startOuterControl.y} ${outerStart.x} ${outerStart.y}`,
    'Z',
  ].join(' ')
}

function getLabelPosition(index: number) {
  return polarToCartesian(getMiddleAngle(index), labelRadius)
}

function getLabelTransform(index: number) {
  const angle = getMiddleAngle(index)
  const { x, y } = getLabelPosition(index)
  const normalizedAngle = normalizeLabelAngle(angle)

  return `rotate(${normalizedAngle} ${x} ${y})`
}

function getMiddleAngle(index: number) {
  const step = 360 / wheelSlots.length

  return -90 + index * step + step / 2
}

function polarToCartesian(angleInDegrees: number, pointRadius = outerRadius): Point {
  const angleInRadians = (angleInDegrees * Math.PI) / 180

  return {
    x: center + pointRadius * Math.cos(angleInRadians),
    y: center + pointRadius * Math.sin(angleInRadians),
  }
}

function normalizeLabelAngle(angle: number) {
  const normalizedAngle = ((angle % 360) + 360) % 360
  const readableAngle = normalizedAngle > 90 && normalizedAngle < 270
    ? normalizedAngle + 180
    : normalizedAngle

  return readableAngle > 180 ? readableAngle - 360 : readableAngle
}
</script>

<style scoped>
.animation-circle-menu {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  padding-bottom: 0;
}

.animation-circle-menu__layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42vh;
  gap: 1.45vh;
  margin-top: 2vh;
}

.animation-wheel-panel,
.animation-picker,
.animation-picker__selected,
.animation-picker__search,
.animation-picker__list button {
  border: 1px solid rgb(255 255 255 / 6%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 48%),
    rgb(7 7 8 / 88%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
}

.animation-wheel-panel,
.animation-picker {
  min-width: 0;
  min-height: 0;
  padding: 1.35vh;
  border-radius: 0.9vh;
}

.animation-circle-header {
  display: flex;
  align-items: center;
  gap: 1vh;
  margin-bottom: 1.1vh;
}

.animation-circle-header span {
  color: rgb(255 255 255 / 46%);
  font-size: 0.92vh;
  font-weight: 800;
  text-transform: uppercase;
}

.animation-circle-header strong {
  margin-left: auto;
  color: #ffffff;
  font-size: 1.05vh;
  font-weight: 950;
}

.animation-wheel-preview {
  position: relative;
  height: calc(100% - 4.1vh);
  min-height: 0;
  display: grid;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.8vh;
  background:
    radial-gradient(22vh 22vh at 50% 50%, rgb(172 46 205 / 9%), transparent 72%),
    rgb(255 255 255 / 3%);
  overflow: hidden;
}

.animation-wheel-preview__ring {
  width: min(61vh, 100%);
  height: min(61vh, 100%);
  display: block;
  overflow: visible;
}

.animation-wheel-preview__base {
  fill: none;
  stroke: rgb(8 8 8 / 85%);
  stroke-width: 150;
}

.animation-wheel-preview__segment {
  fill: rgb(8 8 8 / 85%);
  fill-opacity: 0.85;
  cursor: pointer;
  outline: none;
  transition: fill 140ms ease, fill-opacity 140ms ease;
}

.animation-wheel-preview__segment:hover,
.animation-wheel-preview__segment--active {
  fill-opacity: 0.94;
}

.animation-wheel-preview__segment:hover {
  fill: #dedede;
}

.animation-wheel-preview__segment--active {
  fill: #ac2ecd;
}

.animation-wheel-preview__segment--filled:not(.animation-wheel-preview__segment--active) {
  fill: rgb(24 20 31 / 94%);
}

.animation-wheel-preview__hole {
  fill: transparent;
  stroke: transparent;
  stroke-width: 12;
  pointer-events: none;
}

.animation-wheel-preview__label {
  fill: #fff;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0;
  pointer-events: none;
  user-select: none;
}

.animation-wheel-preview__center {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  width: 15.6vh;
  height: 15.6vh;
  display: grid;
  place-content: center;
  gap: 0.5vh;
  padding: 0 1.2vh;
  border-radius: 50%;
  background: rgb(0 0 0 / 34%);
  text-align: center;
  transform: translate(-50%, -50%);
}

.animation-wheel-preview__center span {
  color: #d46bff;
  font-size: 1.7vh;
  font-weight: 950;
}

.animation-wheel-preview__center strong {
  max-width: 12vh;
  overflow: hidden;
  color: rgb(255 255 255 / 72%);
  font-size: 0.86vh;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.animation-picker {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  align-content: start;
  gap: 1vh;
}

.animation-picker .animation-circle-header {
  margin-bottom: 0;
}

.animation-picker__search {
  min-height: 4.2vh;
  display: flex;
  align-items: center;
  gap: 0.7vh;
  padding: 0 1vh;
  border-radius: 0.65vh;
  color: rgb(255 255 255 / 58%);
}

.animation-picker__search input {
  min-width: 0;
  width: 100%;
  border: 0;
  background: transparent;
  color: #ffffff;
  font: inherit;
  font-size: 1vh;
  font-weight: 800;
  outline: none;
}

.animation-picker__search input::placeholder {
  color: rgb(255 255 255 / 34%);
}

.animation-picker__selected {
  min-height: 5.6vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 3.2vh;
  align-items: center;
  gap: 0.8vh;
  padding: 0.8vh;
  border-radius: 0.65vh;
}

.animation-picker__selected span,
.animation-picker__selected strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.animation-picker__selected span {
  grid-column: 1;
  color: rgb(255 255 255 / 42%);
  font-size: 0.78vh;
  font-weight: 800;
  line-height: 1;
}

.animation-picker__selected strong {
  grid-column: 1;
  color: #ffffff;
  font-size: 1vh;
  font-weight: 900;
}

.animation-picker__selected button {
  grid-column: 2;
  grid-row: 1 / span 2;
  width: 3.2vh;
  height: 3.2vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 0.55vh;
  background: rgb(255 255 255 / 5%);
  color: #ffffff;
  cursor: pointer;
}

.animation-picker__selected button:disabled {
  cursor: default;
  opacity: 0.42;
}

.animation-picker__list {
  min-height: 0;
  max-height: none;
  display: grid;
  align-content: start;
  gap: 0.65vh;
  overflow-y: auto;
  padding-right: 0.35vh;
}

.animation-picker__list button {
  min-width: 0;
  min-height: 6.2vh;
  display: grid;
  grid-template-columns: 5.2vh minmax(0, 1fr) 2vh;
  align-items: center;
  gap: 0.8vh;
  padding: 0.65vh;
  border-radius: 0.65vh;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.animation-picker__item--active {
  border-color: rgb(172 46 205 / 42%) !important;
  background:
    linear-gradient(180deg, rgb(172 46 205 / 12%), transparent 50%),
    rgb(12 9 14 / 95%) !important;
}

.animation-picker__mock {
  min-height: 4.4vh;
  display: grid;
  place-items: center;
  border-radius: 0.45vh;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 46%);
  font-size: 0.72vh;
  font-weight: 900;
}

.animation-picker__list div {
  min-width: 0;
}

.animation-picker__list strong,
.animation-picker__list small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.animation-picker__list strong {
  color: #ffffff;
  font-size: 0.95vh;
  font-weight: 900;
}

.animation-picker__list small {
  margin-top: 0.28vh;
  color: rgb(255 255 255 / 42%);
  font-size: 0.76vh;
  font-weight: 700;
}

.animation-picker__list .twinkle-icon {
  color: #d46bff;
}
</style>
