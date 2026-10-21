<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ArrowLeft,
  Banknote,
  CarFront,
  CreditCard,
  CircleGauge,
  Disc3,
  Droplets,
  Gauge,
  Lightbulb,
  Paintbrush,
  RotateCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
  Zap,
} from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type {
  LsCustomsCategory,
  LsCustomsOption,
  LsCustomsPayload,
} from '@/shared/contracts/ui'

const props = defineProps<{ payload?: LsCustomsPayload }>()

const activeCategoryId = ref<string | null>(null)
const selectedOptionId = ref<string | number | null>(null)
const selectedColor = ref('#e000ff')
const rotating = ref(false)
let lastPointerX = 0

const iconMap = {
  repair: Wrench,
  engine: Gauge,
  transmission: Settings2,
  brakes: Disc3,
  suspension: CarFront,
  turbo: Zap,
  body: ShieldCheck,
  wheels: CircleGauge,
  tint: Droplets,
  lights: Lightbulb,
  paint: Paintbrush,
} as const

const vehicle = computed(() => props.payload?.vehicle)
const balance = computed(() => props.payload?.balance ?? { cash: 0, bank: 0 })
const categories = computed(() => props.payload?.categories.filter(({ available }) => available !== false) ?? [])
const activeCategory = computed(() => categories.value.find(({ id }) => id === activeCategoryId.value) ?? null)
const selectedOption = computed(() => activeCategory.value?.options.find(({ id }) => id === selectedOptionId.value) ?? null)
const installedOptionId = computed(() => activeCategory.value ? props.payload?.installed[activeCategory.value.id] : undefined)


const accentStyle = computed(() => ({ '--preview-color': selectedColor.value }))

const colorPresets = ['#0d1116', '#f5f5f7', '#c00e1a', '#f78616', '#ffc91f', '#66b81f', '#0b9cf1', '#3b39e0', '#e000ff', '#f21f99']
const money = new Intl.NumberFormat('ru-RU')

function getCategoryIcon(category: LsCustomsCategory) {
  return iconMap[category.icon as keyof typeof iconMap] ?? Sparkles
}

function scrollCategories(event: WheelEvent) {
  const list = event.currentTarget as HTMLElement
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  if (!delta) return

  list.scrollLeft += delta
  event.preventDefault()
}

function openCategory(category: LsCustomsCategory) {
  activeCategoryId.value = category.id
  selectedOptionId.value = props.payload?.installed[category.id] ?? category.options[0]?.id ?? null
  callClientEvent('ls-customs:setCategoryFromBrowser', category.id)
}

function selectOption(option: LsCustomsOption) {
  if (option.available === false) return
  selectedOptionId.value = option.id
  callClientEvent(
    'ls-customs:previewFromBrowser',
    activeCategory.value?.id,
    option.id,
    option.gameModIndex ?? null,
    activeCategory.value?.supportsColor ? selectedColor.value : null,
  )
}

function changeColor(color: string) {
  selectedColor.value = color
  if (!activeCategory.value?.supportsColor || !selectedOption.value) return
  callClientEvent('ls-customs:previewColorFromBrowser', activeCategory.value.id, selectedOption.value.id, color)
}

function buy(paymentType: 'cash' | 'card') {
  if (!activeCategory.value || !selectedOption.value) {
    window.twinkleBrowser?.notify('Сначала выберите модификацию.', { variant: 'error' })
    return
  }

  if (selectedOption.value.available === false) {
    window.twinkleBrowser?.notify('Эта модификация недоступна для автомобиля.', { variant: 'error' })
    return
  }

  if (!activeCategory.value.supportsColor && selectedOption.value.id === installedOptionId.value) {
    window.twinkleBrowser?.notify('Эта модификация уже установлена.', { variant: 'error' })
    return
  }

  callClientEvent(
    'ls-customs:buyFromBrowser',
    props.payload?.sessionId ?? '',
    activeCategory.value.id,
    selectedOption.value.id,
    activeCategory.value.supportsColor ? selectedColor.value : null,
    paymentType,
  )
}

function back() {
  callClientEvent('ls-customs:restorePreviewFromBrowser')
  activeCategoryId.value = null
  selectedOptionId.value = null
}

function startRotation(event: PointerEvent) {
  if ((event.target as HTMLElement).closest('button, input, .control-dock, .color-panel, .lsc-header')) return
  rotating.value = true
  lastPointerX = event.clientX
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function rotateVehicle(event: PointerEvent) {
  if (!rotating.value) return
  const delta = event.clientX - lastPointerX
  lastPointerX = event.clientX
  if (Math.abs(delta) > 0) callClientEvent('ls-customs:rotateFromBrowser', delta)
}

function stopRotation() {
  rotating.value = false
}
function close() {
  callClientEvent('ls-customs:closeFromBrowser')
}

watch(
  () => props.payload?.sessionId,
  () => {
    activeCategoryId.value = null
    selectedOptionId.value = null
  },
)
</script>

<template>
  <main
    class="lsc-page"
    :class="{ rotating }"
    :style="accentStyle"
    @pointerdown="startRotation"
    @pointermove="rotateVehicle"
    @pointerup="stopRotation"
    @pointercancel="stopRotation"
  >
    <header class="lsc-header">
      <div class="brand">
        <span class="brand__mark"><Wrench /></span>
        <div>
          <strong>LS CUSTOMS</strong>
          <small>Тюнинг-ателье NoName</small>
        </div>
      </div>

      <div v-if="vehicle" class="vehicle-chip">
        <CarFront />
        <div>
          <strong>{{ vehicle.name }}</strong>
          <span>{{ vehicle.plate }}</span>
        </div>
      </div>

      <div class="balances">
        <span><Banknote /> Наличные <strong>$ {{ money.format(balance.cash) }}</strong></span>
        <span><CreditCard /> Карта <strong>$ {{ money.format(balance.bank) }}</strong></span>
      </div>

      <button class="icon-button close-button" type="button" aria-label="Закрыть" @click="close">
        <X />
      </button>
    </header>

    <aside v-if="activeCategory?.supportsColor && selectedOption" class="color-panel">
      <div class="panel-heading">
        <span><Paintbrush /></span>
        <div><strong>Выбор цвета</strong><small>Предпросмотр в реальном времени</small></div>
      </div>
      <div class="color-current">
        <input v-model="selectedColor" type="color" aria-label="Произвольный цвет" @input="changeColor(selectedColor)" />
        <div><small>Текущий цвет</small><strong>{{ selectedColor.toUpperCase() }}</strong></div>
      </div>
      <div class="color-grid">
        <button
          v-for="color in colorPresets"
          :key="color"
          type="button"
          :class="{ active: selectedColor === color }"
          :style="{ background: color }"
          :aria-label="color"
          @click="changeColor(color)"
        ></button>
      </div>
    </aside>

    <div class="rotation-hint"><RotateCw /><span>Зажмите ЛКМ, чтобы осмотреть автомобиль</span></div>

    <section class="control-dock">
      <div class="dock-topline">
        <button v-if="activeCategory" class="back-button" type="button" @click="back"><ArrowLeft /> Назад</button>
        <div class="dock-title">
          <strong>{{ activeCategory?.name ?? 'Выберите категорию' }}</strong>
          <small>{{ activeCategory?.description ?? 'Настройте автомобиль под себя' }}</small>
        </div>
        <span class="step">{{ activeCategory ? 'ДЕТАЛИ' : 'КАТЕГОРИИ' }}</span>
      </div>

      <div v-if="!activeCategory" class="horizontal-list category-list" @wheel="scrollCategories">
        <button
          v-for="category in categories"
          :key="category.id"
          class="tile category-tile"
          type="button"
          @click="openCategory(category)"
        >
          <span class="tile__icon"><component :is="getCategoryIcon(category)" /></span>
          <span class="tile__copy"><strong>{{ category.name }}</strong><small>{{ category.description }}</small></span>
          <em>{{ category.options.length }}</em>
        </button>
      </div>

      <div v-else class="detail-layout">
        <div class="horizontal-list option-list">
          <button
            v-for="option in activeCategory.options"
            :key="option.id"
            class="tile option-tile"
            :class="{
              active: selectedOptionId === option.id,
              installed: installedOptionId === option.id,
              unavailable: option.available === false,
            }"
            type="button"
            :disabled="option.available === false"
            @click="selectOption(option)"
          >
            <span class="option-tile__preview"><component :is="getCategoryIcon(activeCategory)" /></span>
            <span class="tile__copy">
              <small v-if="installedOptionId === option.id" class="installed-label">Установлено</small>
              <strong>{{ option.name }}</strong>
              <small>{{ option.description ?? `Вариант ${option.gameModIndex !== undefined ? option.gameModIndex + 1 : ''}` }}</small>
            </span>
            <span class="price">$ {{ money.format(option.price) }}</span>
          </button>
        </div>

        <aside class="checkout">
          <div>
            <small>Выбранная модификация</small>
            <strong>{{ selectedOption?.name ?? 'Не выбрано' }}</strong>
          </div>
          <span class="checkout__price">$ {{ money.format(selectedOption?.price ?? 0) }}</span>
          <div class="payment-buttons">
            <button type="button" @click="buy('cash')"><Banknote /> Наличные</button>
            <button type="button" @click="buy('card')"><CreditCard /> Карта</button>
          </div>
        </aside>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.lsc-page, .lsc-page * { box-sizing: border-box; }
.lsc-page {
  --panel: rgb(7 9 15 / 94%);
  --stroke: rgb(255 255 255 / 9%);
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  color: #f4f4f6;
  font-family: 'SF Pro Display', 'Segoe UI', sans-serif;
  pointer-events: auto;
  cursor: grab;
}
button, input { font: inherit; }
.lsc-page.rotating { cursor: grabbing; }
.lsc-header {
  position: absolute;
  top: px-to-vh(28);
  right: px-to-vh(30);
  left: px-to-vh(30);
  display: flex;
  align-items: center;
  gap: px-to-vh(10);
  pointer-events: auto;
}
.brand, .vehicle-chip, .balances, .icon-button, .color-panel, .control-dock, .rotation-hint {
  border: px-to-vh(.5) solid var(--stroke);
  background: var(--panel);
  box-shadow: 0 px-to-vh(12) px-to-vh(40) rgb(0 0 0 / 28%);

}
.brand { display: flex; min-width: px-to-vh(226); height: px-to-vh(58); align-items: center; gap: px-to-vh(11); padding: 0 px-to-vh(14); border-radius: px-to-vh(6); }
.brand__mark, .panel-heading > span { display: grid; width: px-to-vh(36); height: px-to-vh(36); place-items: center; border-radius: px-to-vh(4); color: #e000ff; background: rgb(224 0 255 / 13%); }
.brand svg { width: px-to-vh(20); }
.brand strong { display: block; font-size: px-to-vh(14); letter-spacing: px-to-vh(1.1); }
.brand small, .vehicle-chip span, .panel-heading small, .dock-title small, .tile__copy small, .checkout small, .color-current small { color: rgb(255 255 255 / 42%); font-size: px-to-vh(10); }
.vehicle-chip { display: flex; height: px-to-vh(58); align-items: center; gap: px-to-vh(10); padding: 0 px-to-vh(15); border-radius: px-to-vh(6); }
.vehicle-chip > svg { width: px-to-vh(24); color: #e000ff; }
.vehicle-chip strong, .vehicle-chip span { display: block; }
.vehicle-chip strong { font-size: px-to-vh(12); }
.balances { display: flex; height: px-to-vh(58); align-items: center; gap: px-to-vh(18); margin-left: auto; padding: 0 px-to-vh(16); border-radius: px-to-vh(6); }
.balances span { display: flex; align-items: center; gap: px-to-vh(6); color: rgb(255 255 255 / 42%); font-size: px-to-vh(10); }
.balances svg { width: px-to-vh(14); color: #e000ff; }
.balances strong { color: #fff; }
.icon-button { display: grid; width: px-to-vh(42); height: px-to-vh(42); padding: 0; place-items: center; border-radius: px-to-vh(5); color: #a344b5; cursor: pointer; }
.icon-button svg { width: px-to-vh(20); }
.color-panel { position: absolute; top: px-to-vh(112); left: px-to-vh(30); width: px-to-vh(240); padding: px-to-vh(14); border-radius: px-to-vh(6); pointer-events: auto; }
.panel-heading { display: flex; align-items: center; gap: px-to-vh(10); padding-bottom: px-to-vh(13); border-bottom: px-to-vh(.5) solid var(--stroke); }
.panel-heading svg { width: px-to-vh(18); }
.panel-heading strong, .panel-heading small { display: block; }
.panel-heading strong { font-size: px-to-vh(12); }
.color-current { display: flex; align-items: center; gap: px-to-vh(10); margin: px-to-vh(14) 0; }
.color-current input { width: px-to-vh(44); height: px-to-vh(44); padding: px-to-vh(3); border: px-to-vh(1) solid rgb(224 0 255 / 45%); border-radius: px-to-vh(4); background: transparent; cursor: pointer; }
.color-current strong, .color-current small { display: block; }
.color-current strong { margin-top: px-to-vh(3); font-size: px-to-vh(11); }
.color-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: px-to-vh(7); }
.color-grid button { position: relative; aspect-ratio: 1; padding: 0; border: px-to-vh(1) solid rgb(255 255 255 / 12%); border-radius: px-to-vh(3); cursor: pointer; }
.color-grid button.active::after { position: absolute; inset: px-to-vh(-3); border: px-to-vh(1) solid #e000ff; border-radius: px-to-vh(5); content: ''; }
.rotation-hint { position: absolute; right: px-to-vh(30); bottom: px-to-vh(286); display: flex; height: px-to-vh(34); align-items: center; gap: px-to-vh(8); padding: 0 px-to-vh(11); border-radius: px-to-vh(4); color: rgb(255 255 255 / 50%); font-size: px-to-vh(9); }
.rotation-hint svg { width: px-to-vh(14); color: #e000ff; }
.control-dock { position: absolute; right: px-to-vh(30); bottom: px-to-vh(30); left: px-to-vh(30); height: px-to-vh(236); padding: px-to-vh(14); border-radius: px-to-vh(7); pointer-events: auto; }
.dock-topline { display: flex; height: px-to-vh(42); align-items: center; gap: px-to-vh(10); padding-bottom: px-to-vh(12); border-bottom: px-to-vh(.5) solid var(--stroke); }
.back-button { display: flex; height: px-to-vh(30); align-items: center; gap: px-to-vh(5); padding: 0 px-to-vh(10); border: 0; border-radius: px-to-vh(3); color: #fff; background: rgb(255 255 255 / 6%); cursor: pointer; }
.back-button svg { width: px-to-vh(14); }
.dock-title strong, .dock-title small { display: block; }
.dock-title strong { font-size: px-to-vh(13); }
.step { margin-left: auto; padding: px-to-vh(5) px-to-vh(7); border-radius: px-to-vh(3); color: #e000ff; font-size: px-to-vh(8); letter-spacing: px-to-vh(.8); background: rgb(224 0 255 / 10%); }
.horizontal-list { display: flex; min-width: 0; gap: px-to-vh(9); overflow-x: auto; scrollbar-width: none; }
.horizontal-list::-webkit-scrollbar { display: none; }
.category-list { height: px-to-vh(166); padding-top: px-to-vh(12); }
.tile { position: relative; display: flex; flex: 0 0 px-to-vh(174); min-width: 0; padding: px-to-vh(12); overflow: hidden; border: px-to-vh(.5) solid var(--stroke); border-radius: px-to-vh(5); color: inherit; text-align: left; background: rgb(255 255 255 / 2%); cursor: pointer; transition: border-color .15s ease, background .15s ease, transform .15s ease; }
.tile:hover, .tile.active { border-color: rgb(224 0 255 / 55%); background: rgb(224 0 255 / 7%); transform: translateY(px-to-vh(-2)); }
.category-tile { height: px-to-vh(138); flex-direction: column; }
.tile__icon { display: grid; width: px-to-vh(42); height: px-to-vh(42); place-items: center; border-radius: px-to-vh(4); color: rgb(255 255 255 / 50%); background: rgb(255 255 255 / 4%); }
.tile:hover .tile__icon, .tile.active .tile__icon { color: #e000ff; background: rgb(224 0 255 / 12%); }
.tile__icon svg { width: px-to-vh(23); }
.tile__copy { display: block; min-width: 0; }
.category-tile .tile__copy { margin-top: auto; }
.tile__copy strong, .tile__copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile__copy strong { font-size: px-to-vh(11); font-weight: 600; }
.tile__copy small { margin-top: px-to-vh(4); }
.category-tile em { position: absolute; top: px-to-vh(12); right: px-to-vh(12); color: rgb(255 255 255 / 28%); font-size: px-to-vh(9); font-style: normal; }
.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) px-to-vh(270); gap: px-to-vh(12); height: px-to-vh(166); padding-top: px-to-vh(12); }
.option-list { height: px-to-vh(138); }
.option-tile { height: px-to-vh(138); flex-direction: column; }
.option-tile__preview { display: grid; height: px-to-vh(54); place-items: center; border-radius: px-to-vh(4); color: rgb(255 255 255 / 20%); background: linear-gradient(135deg, rgb(255 255 255 / 3%), rgb(224 0 255 / 5%)); }
.option-tile__preview svg { width: px-to-vh(30); }
.option-tile .tile__copy { margin-top: px-to-vh(9); }
.option-tile .price { position: absolute; right: px-to-vh(10); bottom: px-to-vh(10); color: #e000ff; font-size: px-to-vh(10); }
.option-tile.installed { border-color: rgb(64 255 129 / 35%); }
.option-tile.unavailable { opacity: .35; cursor: default; }
.installed-label { color: #40ff81 !important; }
.checkout { display: grid; grid-template-columns: 1fr auto; grid-template-rows: 1fr px-to-vh(34); gap: px-to-vh(10); height: px-to-vh(138); padding: px-to-vh(13); border: px-to-vh(.5) solid var(--stroke); border-radius: px-to-vh(5); background: rgb(255 255 255 / 2%); }
.checkout strong, .checkout small { display: block; }
.checkout strong { margin-top: px-to-vh(5); font-size: px-to-vh(12); }
.checkout__price { color: #e000ff; font-size: px-to-vh(14); font-weight: 650; }
.payment-buttons { display: grid; grid-column: 1 / -1; grid-template-columns: 1fr 1fr; gap: px-to-vh(6); }
.payment-buttons button { display: flex; align-items: center; justify-content: center; gap: px-to-vh(6); border: 0; border-radius: px-to-vh(3); color: #fff; font-size: px-to-vh(9); background: linear-gradient(180deg, rgb(224 0 255 / 68%), rgb(132 0 151 / 68%)); cursor: pointer; }
.payment-buttons button:first-child { background: rgb(255 255 255 / 6%); }

.payment-buttons svg { width: px-to-vh(13); }
</style>