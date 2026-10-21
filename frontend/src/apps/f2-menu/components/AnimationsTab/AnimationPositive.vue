<template>
  <section class="interface-page">
    <h1 v-if="showTitle" class="f2-menu__title">{{ title }}</h1>

    <div class="crosshair-panel">
      <div class="crosshair-preview" aria-label="Предпросмотр прицела">
        <span
          class="crosshair-preview__target"
          :class="[
            `crosshair-preview__target--${settings.type}`,
            {
              'crosshair-preview__target--center-dot': showCenterDot,
              'crosshair-preview__target--outlined': showOutline,
            },
          ]"
          :style="crosshairStyle"
        ></span>
      </div>

      <div class="crosshair-controls">
        <label class="crosshair-control">
          <span>Вид прицела</span>
          <select v-model="settings.type">
            <option value="cross">Крестик</option>
            <option value="dot">Точка</option>
            <option value="rectangle">Прямоугольник</option>
          </select>
        </label>

        <label class="crosshair-control crosshair-control--slider">
          <span>Толщина контура</span>
          <input v-model.number="settings.outlineThickness" type="range" min="0" max="1" step="0.01">
          <b>{{ formatRatio(settings.outlineThickness) }}</b>
        </label>

        <label class="crosshair-control">
          <span>Цвет прицела</span>
          <input v-model="settings.color" class="crosshair-control__color" type="color">
        </label>

        <label class="crosshair-control">
          <span>Точка в центре</span>
          <select v-model="settings.centerDot">
            <option value="yes">Да</option>
            <option value="no">Нет</option>
            <option value="default">По умолчанию</option>
          </select>
        </label>

        <label class="crosshair-control crosshair-control--slider">
          <span>Длина</span>
          <input v-model.number="settings.length" type="range" min="0" max="1" step="0.01">
          <b>{{ formatRatio(settings.length) }}</b>
        </label>

        <label class="crosshair-control">
          <span>Цвет при наведении</span>
          <input v-model="settings.hoverColor" class="crosshair-control__color" type="color">
        </label>

        <label class="crosshair-control">
          <span>Контур</span>
          <select v-model="settings.outline">
            <option value="yes">Да</option>
            <option value="no">Нет</option>
            <option value="default">По умолчанию</option>
          </select>
        </label>

        <label class="crosshair-control crosshair-control--slider">
          <span>Ширина</span>
          <input v-model.number="settings.width" type="range" min="0" max="1" step="0.01">
          <b>{{ formatRatio(settings.width) }}</b>
        </label>

        <label class="crosshair-control">
          <span>Код прицела</span>
          <input
            v-model="settings.code"
            class="crosshair-control__code"
            type="text"
            inputmode="text"
            maxlength="11"
            pattern="[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}"
            placeholder="XXX-XXX-XXX"
            @input="formatCrosshairCode"
          >
        </label>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'

type CrosshairType = 'cross' | 'dot' | 'rectangle'
type TernaryOption = 'yes' | 'no' | 'default'

withDefaults(defineProps<{
  showTitle?: boolean
  title?: string
}>(), {
  showTitle: true,
  title: 'Интерфейс',
})

const settings = reactive({
  centerDot: 'yes' as TernaryOption,
  code: '',
  color: '#000000',
  hoverColor: '#000000',
  length: 0,
  outline: 'yes' as TernaryOption,
  outlineThickness: 0,
  type: 'cross' as CrosshairType,
  width: 0,
})

const showCenterDot = computed(() => settings.centerDot !== 'no')
const showOutline = computed(() => settings.outline !== 'no')

const crosshairStyle = computed(() => ({
  '--crosshair-color': settings.color,
  '--crosshair-hover-color': settings.hoverColor,
  '--crosshair-length': `${1.35 + settings.length * 3.2}vh`,
  '--crosshair-outline-width': `${settings.outlineThickness * 0.55}vh`,
  '--crosshair-width': `${0.32 + settings.width * 1.25}vh`,
}))

function formatRatio(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')
}

function formatCrosshairCode(event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 9)
    .replace(/(.{3})(?=.)/g, '$1-')

  settings.code = value
}
</script>

<style scoped>
.interface-page {
  display: grid;
  justify-items: center;
}

.crosshair-panel {
  width: 93vh;
  margin-top: 2.1vh;
  padding: 2.35vh 3vh 2.45vh;
  border-radius: 1.2vh;
  background: rgb(0 0 0 / 88%);
  box-sizing: border-box;
}

.crosshair-preview {
  position: relative;
  height: 33.5vh;
  border-radius: 0.7vh;
  overflow: hidden;
  background: url("/crosshair-bg.png") center / cover no-repeat;
}

.crosshair-preview__target {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: var(--crosshair-length);
  height: var(--crosshair-length);
  color: var(--crosshair-color);
  transform: translate(-50%, -50%);
}

.crosshair-preview__target::before,
.crosshair-preview__target::after {
  position: absolute;
  left: 50%;
  top: 50%;
  background: currentColor;
  content: "";
  transform: translate(-50%, -50%);
}

.crosshair-preview:hover .crosshair-preview__target {
  color: var(--crosshair-hover-color);
}

.crosshair-preview__target--cross::before {
  width: 100%;
  height: var(--crosshair-width);
  border-radius: 999px;
}

.crosshair-preview__target--cross::after {
  width: var(--crosshair-width);
  height: 100%;
  border-radius: 999px;
}

.crosshair-preview__target--dot {
  width: calc(1.05vh + var(--crosshair-width));
  height: calc(1.05vh + var(--crosshair-width));
}

.crosshair-preview__target--dot::before {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.crosshair-preview__target--dot::after {
  content: none;
}

.crosshair-preview__target--rectangle {
  width: calc(2.3vh + var(--crosshair-length));
  height: calc(1.15vh + var(--crosshair-width));
}

.crosshair-preview__target--rectangle::before {
  width: 100%;
  height: 100%;
  border-radius: 0.55vh;
}

.crosshair-preview__target--rectangle::after {
  content: none;
}

.crosshair-preview__target--outlined::before,
.crosshair-preview__target--outlined::after {
  box-shadow: 0 0 0 var(--crosshair-outline-width) rgb(0 0 0 / 78%);
}

.crosshair-preview__target--center-dot {
  background: radial-gradient(circle, currentColor 0 0.32vh, transparent 0.34vh);
}

.crosshair-controls {
  display: grid;
  grid-template-columns: 25.6vh 32.3vh 28vh;
  gap: 0.45vh 0.75vh;
  margin-top: 1.65vh;
}

.crosshair-control {
  min-height: 4.75vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1vh;
  padding: 0 1.2vh;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 0.45vh;
  background: rgb(255 255 255 / 4%);
  box-sizing: border-box;
}

.crosshair-control span {
  color: #ffffff;
  font-size: 1.25vh;
  line-height: 1;
}

.crosshair-control select,
.crosshair-control__code {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: rgb(255 255 255 / 76%);
  cursor: pointer;
  font: inherit;
  font-size: 0.96vh;
}

.crosshair-control select {
  width: 12.4vh;
  min-height: 2.9vh;
  padding: 0 1.7vh 0 0.8vh;
  border-radius: 0.28vh;
  appearance: none;
  background:
    linear-gradient(45deg, transparent 50%, currentColor 50%) right 0.72vh center / 0.42vh 0.42vh no-repeat,
    linear-gradient(135deg, currentColor 50%, transparent 50%) right 0.42vh center / 0.42vh 0.42vh no-repeat,
    rgb(0 0 0 / 24%);
  color: #ffffff;
  text-align: right;
}

.crosshair-control select option {
  background-color: #101010;
  color: #ffffff;
}

.crosshair-control select option:checked {
  background-color: #202020;
  color: #ffffff;
}

.crosshair-control--slider {
  grid-template-columns: 13.8vh minmax(0, 1fr) auto;
}

.crosshair-control input[type="range"] {
  width: 100%;
  height: 0.75vh;
  border-radius: 999px;
  background: #7b7b7b;
  accent-color: #d8d8d8;
  appearance: none;
  cursor: pointer;
}

.crosshair-control input[type="range"]::-webkit-slider-runnable-track {
  height: 0.75vh;
  border-radius: 999px;
  background: #7b7b7b;
}

.crosshair-control input[type="range"]::-webkit-slider-thumb {
  width: 3.2vh;
  height: 1.35vh;
  margin-top: -0.3vh;
  border: 0;
  border-radius: 0.35vh;
  background: #dddddd;
  appearance: none;
}

.crosshair-control input[type="range"]::-moz-range-track {
  height: 0.75vh;
  border-radius: 999px;
  background: #7b7b7b;
}

.crosshair-control input[type="range"]::-moz-range-thumb {
  width: 3.2vh;
  height: 1.35vh;
  border: 0;
  border-radius: 0.35vh;
  background: #dddddd;
}

.crosshair-control b {
  min-width: 2.7vh;
  color: #ffffff;
  font-size: 2vh;
  font-weight: 600;
  line-height: 1;
  text-align: right;
}

.crosshair-control__color {
  width: 3.2vh;
  height: 1.8vh;
  padding: 0;
  border: 0;
  border-radius: 0.35vh;
  background: transparent;
  cursor: pointer;
  overflow: hidden;
}

.crosshair-control__code {
  width: 12.4vh;
  min-height: 2.9vh;
  padding: 0 0.8vh;
  border-radius: 0.28vh;
  background: rgb(0 0 0 / 24%);
  cursor: text;
}

.crosshair-control__code::placeholder {
  color: rgb(255 255 255 / 28%);
}
</style>
