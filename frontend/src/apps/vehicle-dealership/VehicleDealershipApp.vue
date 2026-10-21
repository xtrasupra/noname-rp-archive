<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Banknote, CarFront, ChevronLeft, ChevronRight, CreditCard, RotateCcw, X } from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type {
  VehicleDealershipPayload,
  VehicleDealershipVehicle,
} from '@/shared/contracts/ui'

const props = defineProps<{ payload?: VehicleDealershipPayload }>()

const selectedId = ref<string | null>(null)
const selectedColorId = ref<number | null>(null)
const draggingPreview = ref(false)

let dragPointerId: number | null = null
let dragLastX = 0
let pendingDragDelta = 0
let dragFrame: number | null = null

const vehicles = computed(() =>
  Array.isArray(props.payload?.vehicles) ? props.payload.vehicles : [],
)
const selected = computed(() =>
  vehicles.value.find((vehicle) => vehicle.id === selectedId.value) ?? null,
)
const selectedColor = computed(() =>
  selected.value?.colors.find((color) => color.id === selectedColorId.value) ?? null,
)
const cash = computed(() => Math.max(0, Number(props.payload?.balances?.cash || 0)))
const bank = computed(() => Math.max(0, Number(props.payload?.balances?.bank || 0)))
const money = new Intl.NumberFormat('en-US')

function selectVehicle(vehicle: VehicleDealershipVehicle) {
  if (selectedId.value === vehicle.id) return
  selectedId.value = vehicle.id
  selectedColorId.value = vehicle.colors[0]?.id ?? null
  callClientEvent('vehicle-dealership:select', vehicle.id)
}

function selectColor(colorId: number) {
  if (selectedColorId.value === colorId) return
  selectedColorId.value = colorId
  callClientEvent('vehicle-dealership:color', colorId)
}

function rotate(delta: number) {
  callClientEvent('vehicle-dealership:rotate', delta)
}

function flushDragRotation() {
  dragFrame = null
  const delta = pendingDragDelta
  pendingDragDelta = 0
  if (Math.abs(delta) < 0.01) return
  rotate(Math.max(-45, Math.min(45, delta * 0.32)))
}

function queueDragRotation(deltaX: number) {
  pendingDragDelta += deltaX
  if (dragFrame !== null) return
  dragFrame = window.requestAnimationFrame(flushDragRotation)
}

function startPreviewDrag(event: PointerEvent) {
  if (event.button !== 0 || dragPointerId !== null) return
  dragPointerId = event.pointerId
  dragLastX = event.clientX
  draggingPreview.value = true
  event.currentTarget instanceof HTMLElement &&
    event.currentTarget.setPointerCapture(event.pointerId)
  event.preventDefault()
}

function movePreviewDrag(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  const deltaX = event.clientX - dragLastX
  dragLastX = event.clientX
  queueDragRotation(deltaX)
  event.preventDefault()
}

function stopPreviewDrag(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  if (
    event.currentTarget instanceof HTMLElement &&
    event.currentTarget.hasPointerCapture(event.pointerId)
  ) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
  dragPointerId = null
  draggingPreview.value = false
  flushDragRotation()
}

function buy(paymentType: 'cash' | 'card') {
  if (!selected.value || !selectedColor.value) return
  callClientEvent('vehicle-dealership:buy', paymentType)
}

function close() {
  callClientEvent('vehicle-dealership:close')
}

function syncSelection() {
  const preferredId = props.payload?.selectedVehicleId
  const vehicle =
    vehicles.value.find((entry) => entry.id === selectedId.value) ??
    vehicles.value.find((entry) => entry.id === preferredId) ??
    vehicles.value[0]

  selectedId.value = vehicle?.id ?? null
  if (!vehicle) {
    selectedColorId.value = null
    return
  }
  if (!vehicle.colors.some((color) => color.id === selectedColorId.value)) {
    selectedColorId.value = vehicle.colors[0]?.id ?? null
  }
}

watch(vehicles, syncSelection, { immediate: true })

onBeforeUnmount(() => {
  if (dragFrame !== null) window.cancelAnimationFrame(dragFrame)
})
</script>

<template>
  <main class="dealership" aria-label="Vehicle dealership">
    <aside class="catalog panel">
      <header class="panel__header">
        <span class="panel__icon"><CarFront /></span>
        <div>
          <h1>Premium Deluxe Motorsport</h1>
          <p>Select a vehicle to preview it in the showroom</p>
        </div>
      </header>

      <div class="catalog__list">
        <button
          v-for="vehicle in vehicles"
          :key="vehicle.id"
          type="button"
          class="vehicle-card"
          :class="{ 'vehicle-card--active': vehicle.id === selectedId }"
          @click="selectVehicle(vehicle)"
        >
          <span class="vehicle-card__image">
            <img v-if="vehicle.image" :src="vehicle.image" :alt="vehicle.name" />
            <CarFront v-else />
          </span>
          <span class="vehicle-card__copy">
            <small>{{ vehicle.className }}</small>
            <strong>{{ vehicle.name }}</strong>
            <b>$ {{ money.format(vehicle.price) }}</b>
          </span>
        </button>

        <p v-if="vehicles.length === 0" class="catalog__empty">
          No vehicles are currently available.
        </p>
      </div>
    </aside>

    <section
      class="showroom-stage"
      :class="{ 'showroom-stage--dragging': draggingPreview }"
      aria-label="Drag to rotate vehicle preview"
      @pointerdown="startPreviewDrag"
      @pointermove="movePreviewDrag"
      @pointerup="stopPreviewDrag"
      @pointercancel="stopPreviewDrag"
    ></section>

    <section class="showroom-controls" aria-label="Rotate vehicle preview">
      <button type="button" aria-label="Rotate left" @click="rotate(-15)"><ChevronLeft /></button>
      <span><RotateCcw /> Hold LMB and drag to inspect</span>
      <button type="button" aria-label="Rotate right" @click="rotate(15)"><ChevronRight /></button>
    </section>

    <aside class="checkout panel">
      <button class="close" type="button" aria-label="Close dealership" @click="close"><X /></button>

      <template v-if="selected">
        <p class="checkout__eyebrow">{{ selected.className }}</p>
        <h2>{{ selected.name }}</h2>
        <p class="checkout__model">Model: {{ selected.model }}</p>

        <div class="price">
          <span>Vehicle price</span>
          <strong>$ {{ money.format(selected.price) }}</strong>
        </div>

        <fieldset class="colors">
          <legend>Body color</legend>
          <button
            v-for="color in selected.colors"
            :key="color.id"
            type="button"
            :class="{ 'colors__item--active': selectedColorId === color.id }"
            :style="{ '--vehicle-color': color.hex }"
            :aria-label="color.name"
            :title="color.name"
            @click="selectColor(color.id)"
          ><span></span></button>
        </fieldset>

        <div class="balances">
          <div><Banknote /><span>Cash</span><b>$ {{ money.format(cash) }}</b></div>
          <div><CreditCard /><span>Bank</span><b>$ {{ money.format(bank) }}</b></div>
        </div>

        <div class="payments">
          <button
            type="button"
            :disabled="cash < selected.price"
            @click="buy('cash')"
          ><Banknote /> Buy with cash</button>
          <button
            type="button"
            :disabled="bank < selected.price"
            @click="buy('card')"
          ><CreditCard /> Buy with card</button>
        </div>

        <p class="checkout__limit">Personal garage limit: {{ payload?.maxOwnedVehicles ?? 0 }} vehicles</p>
      </template>
    </aside>
  </main>
</template>

<style scoped lang="scss">
.dealership,
.dealership * { box-sizing: border-box; }
.dealership {
  --accent: #c348ff;
  position: relative;
  width: 100vw;
  min-height: 100vh;
  overflow: hidden;
  color: #f6f5fa;
  font-family: "SF Pro Display", "Segoe UI", sans-serif;
  pointer-events: none;
}
.showroom-stage {
  position: absolute;
  inset: 0 px-to-vh(420) 0 px-to-vh(480);
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.showroom-stage--dragging { cursor: grabbing; }
.panel {
  position: absolute;
  top: 50%;
  height: min(px-to-vh(650), 82vh);
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: px-to-vh(10);
  background: linear-gradient(150deg, rgb(13 12 18 / 96%), rgb(5 5 9 / 94%));
  box-shadow: 0 px-to-vh(20) px-to-vh(60) rgb(0 0 0 / 46%);
  transform: translateY(-50%);
  pointer-events: auto;
  backdrop-filter: none;
}
.catalog { left: px-to-vh(48); width: px-to-vh(410); padding: px-to-vh(24); }
.checkout { right: px-to-vh(48); width: px-to-vh(345); padding: px-to-vh(28); }
.panel__header { display: flex; align-items: center; gap: px-to-vh(13); padding-bottom: px-to-vh(20); border-bottom: 1px solid rgb(255 255 255 / 8%); }
.panel__icon { display: grid; width: px-to-vh(46); height: px-to-vh(46); flex: none; place-items: center; border-radius: px-to-vh(7); color: var(--accent); background: rgb(195 72 255 / 13%); }
.panel__icon svg { width: px-to-vh(25); }
.panel h1, .panel h2, .panel p { margin: 0; }
.panel h1 { font-size: px-to-vh(15); font-weight: 650; }
.panel__header p { margin-top: px-to-vh(4); color: rgb(255 255 255 / 42%); font-size: px-to-vh(10); }
.catalog__list { display: grid; gap: px-to-vh(10); height: calc(100% - px-to-vh(68)); padding-top: px-to-vh(18); overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgb(195 72 255 / 45%) transparent; }
.vehicle-card { display: grid; grid-template-columns: px-to-vh(130) 1fr; min-height: px-to-vh(96); padding: 0; overflow: hidden; border: 1px solid rgb(255 255 255 / 7%); border-radius: px-to-vh(7); color: inherit; text-align: left; background: rgb(255 255 255 / 2%); cursor: pointer; }
.vehicle-card:hover, .vehicle-card--active { border-color: rgb(195 72 255 / 55%); background: rgb(195 72 255 / 7%); }
.vehicle-card__image { display: grid; place-items: center; background: radial-gradient(circle, rgb(255 255 255 / 8%), transparent 68%); }
.vehicle-card__image img { width: 92%; max-height: px-to-vh(76); object-fit: contain; }
.vehicle-card__image svg { width: px-to-vh(36); color: rgb(255 255 255 / 18%); }
.vehicle-card__copy { display: flex; flex-direction: column; justify-content: center; gap: px-to-vh(5); padding: px-to-vh(12); }
.vehicle-card__copy small { color: var(--accent); font-size: px-to-vh(9); text-transform: uppercase; }
.vehicle-card__copy strong { font-size: px-to-vh(13); }
.vehicle-card__copy b { color: rgb(255 255 255 / 56%); font-size: px-to-vh(11); font-weight: 500; }
.catalog__empty { padding: px-to-vh(30); color: rgb(255 255 255 / 45%); text-align: center; }
.close { position: absolute; top: px-to-vh(18); right: px-to-vh(18); display: grid; width: px-to-vh(32); height: px-to-vh(32); padding: 0; place-items: center; border: 0; border-radius: px-to-vh(5); color: #fff; background: rgb(255 255 255 / 7%); cursor: pointer; }
.close svg { width: px-to-vh(17); }
.checkout__eyebrow { color: var(--accent); font-size: px-to-vh(10); font-weight: 650; text-transform: uppercase; }
.checkout h2 { max-width: 85%; margin-top: px-to-vh(8); font-size: px-to-vh(25); line-height: 1.05; }
.checkout__model { margin-top: px-to-vh(8) !important; color: rgb(255 255 255 / 38%); font-size: px-to-vh(10); }
.price { display: flex; align-items: center; justify-content: space-between; margin-top: px-to-vh(34); padding: px-to-vh(16); border-radius: px-to-vh(7); background: rgb(195 72 255 / 9%); }
.price span { color: rgb(255 255 255 / 55%); font-size: px-to-vh(11); }
.price strong { color: var(--accent); font-size: px-to-vh(18); }
.colors { display: flex; flex-wrap: wrap; gap: px-to-vh(10); margin: px-to-vh(26) 0 0; padding: 0; border: 0; }
.colors legend { width: 100%; margin-bottom: px-to-vh(2); font-size: px-to-vh(11); }
.colors button { display: grid; width: px-to-vh(34); height: px-to-vh(34); padding: px-to-vh(4); place-items: center; border: 1px solid transparent; border-radius: 50%; background: transparent; cursor: pointer; }
.colors button span { width: 100%; height: 100%; border: 2px solid rgb(255 255 255 / 22%); border-radius: inherit; background: var(--vehicle-color); }
.colors button.colors__item--active { border-color: var(--accent); }
.balances { display: grid; gap: px-to-vh(8); margin-top: px-to-vh(28); }
.balances div { display: grid; grid-template-columns: px-to-vh(22) 1fr auto; align-items: center; gap: px-to-vh(8); padding: px-to-vh(11); border-radius: px-to-vh(6); background: rgb(255 255 255 / 3%); }
.balances svg { width: px-to-vh(16); color: var(--accent); }
.balances span { color: rgb(255 255 255 / 48%); font-size: px-to-vh(10); }
.balances b { font-size: px-to-vh(11); }
.payments { display: grid; gap: px-to-vh(8); margin-top: px-to-vh(20); }
.payments button { display: flex; height: px-to-vh(39); align-items: center; justify-content: center; gap: px-to-vh(8); border: 0; border-radius: px-to-vh(6); color: #fff; font-size: px-to-vh(11); font-weight: 600; background: linear-gradient(135deg, #a931e3, #7620ad); cursor: pointer; }
.payments button:last-child { background: rgb(255 255 255 / 8%); }
.payments button:disabled { opacity: .35; cursor: default; }
.payments svg { width: px-to-vh(15); }
.checkout__limit { margin-top: px-to-vh(14) !important; color: rgb(255 255 255 / 30%); font-size: px-to-vh(9); text-align: center; }
.showroom-controls { position: absolute; bottom: px-to-vh(55); left: 50%; display: flex; align-items: center; gap: px-to-vh(8); padding: px-to-vh(7); border: 1px solid rgb(255 255 255 / 9%); border-radius: px-to-vh(8); background: rgb(7 7 11 / 94%); transform: translateX(-50%); pointer-events: auto; backdrop-filter: none; }
.showroom-controls button { display: grid; width: px-to-vh(38); height: px-to-vh(34); padding: 0; place-items: center; border: 0; border-radius: px-to-vh(5); color: #fff; background: rgb(255 255 255 / 8%); cursor: pointer; }
.showroom-controls button:hover { background: rgb(195 72 255 / 25%); }
.showroom-controls button svg { width: px-to-vh(19); }
.showroom-controls span { display: flex; align-items: center; gap: px-to-vh(6); padding: 0 px-to-vh(10); color: rgb(255 255 255 / 60%); font-size: px-to-vh(10); }
.showroom-controls span svg { width: px-to-vh(13); }
@media (max-aspect-ratio: 4/3) {
  .showroom-stage { right: px-to-vh(350); left: px-to-vh(390); }
  .catalog { left: px-to-vh(18); width: px-to-vh(360); }
  .checkout { right: px-to-vh(18); width: px-to-vh(315); }
}
</style>
