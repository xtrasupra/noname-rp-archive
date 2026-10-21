<script setup lang='ts'>
import { computed, ref, watch } from 'vue'
import { Car, X } from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { RentCarPayload, RentCarVehicle } from '@/shared/contracts/ui'

const props = defineProps<{ payload?: RentCarPayload }>()

const selectedId = ref<RentCarVehicle['id'] | null>(null)
const selectedColorId = ref<string | number | null>(null)
const hours = ref(1)

const vehicles = computed(() => props.payload?.vehicles ?? [])
const minHours = computed(() => props.payload?.minHours ?? 1)
const maxHours = computed(() =>
  Math.max(minHours.value, props.payload?.maxHours ?? 8),
)
const selected = computed(() =>
  vehicles.value.find(({ id }) => id === selectedId.value),
)
const selectedColor = computed(() =>
  selected.value?.colors.find(
    ({ colorId }) => colorId === selectedColorId.value,
  ),
)
const total = computed(() => (selected.value?.price ?? 0) * hours.value)
const rangeProgress = computed(() => {
  const length = maxHours.value - minHours.value
  return length > 0 ? ((hours.value - minHours.value) / length) * 100 : 100
})

function selectVehicle(vehicle: RentCarVehicle) {
  selectedId.value = vehicle.id
  selectedColorId.value = vehicle.colors[0]?.colorId ?? null
}

function syncSelection() {
  const vehicle =
    vehicles.value.find(({ id }) => id === selectedId.value) ??
    vehicles.value[0]

  if (!vehicle) {
    selectedId.value = null
    selectedColorId.value = null
    return
  }

  selectedId.value = vehicle.id
  if (
    !vehicle.colors.some(({ colorId }) => colorId === selectedColorId.value)
  ) {
    selectedColorId.value = vehicle.colors[0]?.colorId ?? null
  }
  hours.value = Math.min(maxHours.value, Math.max(minHours.value, hours.value))
}

function rent(paymentType: 'cash' | 'card') {
  if (!selected.value || !selectedColor.value) return
  callClientEvent(
    'rent-car:rentFromBrowser',
    selected.value.id,
    selectedColor.value.colorId,
    hours.value,
    paymentType,
  )
}

function close() {
  callClientEvent('rent-car:closeFromBrowser')
}

watch(vehicles, syncSelection, { immediate: true })
watch([minHours, maxHours], syncSelection)
</script>

<template>
  <main class="rent-car-page">
    <section class="rent-car-app" aria-label="Аренда транспорта">
      <div class="catalog">
        <header class="header">
          <span class="header__icon"><Car aria-hidden="true" /></span>
          <div>
            <h1>Аренда транспорта</h1>
            <p>Так быстро не бывает</p>
          </div>
          <button
            class="close"
            type="button"
            aria-label="Закрыть"
            @click="close"
          >
            <X />
          </button>
        </header>
        <div class="divider"></div>

        <div class="vehicle-list">
          <button
            v-for="vehicle in vehicles"
            :key="vehicle.id"
            class="vehicle-card"
            :class="{ active: selectedId === vehicle.id }"
            type="button"
            @click="selectVehicle(vehicle)"
          >
            <span class="vehicle-card__image">
              <img
                v-if="vehicle.image"
                :src="vehicle.image"
                :alt="vehicle.name"
              />
              <Car v-else aria-hidden="true" />
            </span>
            <span class="vehicle-card__info">
              <strong>{{ vehicle.name }}</strong>
              <em>$ {{ vehicle.price }} / час</em>
            </span>
          </button>
        </div>
      </div>

      <aside v-if="selected" class="checkout">
        <div class="preview">
          <img
            v-if="selected.image"
            :src="selected.image"
            :alt="selected.name"
          />
          <Car v-else aria-hidden="true" />
        </div>
        <strong class="car-name">{{ selected.name }}</strong>
        <span class="price">$ {{ selected.price }} / час</span>

        <div class="hours-title">
          <span>Кол-во часов аренды</span>
          <small>{{ hours }} час.</small>
        </div>
        <input
          v-model.number="hours"
          class="range"
          type="range"
          :min="minHours"
          :max="maxHours"
          :style="{ '--range-progress': `${rangeProgress}%` }"
          aria-label="Количество часов аренды"
        />

        <fieldset class="colors">
          <legend>Выберите цвет</legend>
          <button
            v-for="vehicleColor in selected.colors"
            :key="vehicleColor.colorId"
            :class="{ active: selectedColorId === vehicleColor.colorId }"
            :style="{ backgroundColor: vehicleColor.color }"
            type="button"
            :aria-label="vehicleColor.name"
            :title="vehicleColor.name"
            @click="selectedColorId = vehicleColor.colorId"
          ></button>
        </fieldset>

        <div class="total">
          <span>Итого к оплате</span><strong>$ {{ total }}</strong>
        </div>
        <div class="payments">
          <button
            type="button"
            :disabled="!selectedColor"
            @click="rent('cash')"
          >
            Наличные
          </button>
          <button
            type="button"
            :disabled="!selectedColor"
            @click="rent('card')"
          >
            Карта
          </button>
        </div>
      </aside>

      <aside v-else class="checkout checkout--empty">
        Нет доступных автомобилей
      </aside>
    </section>
  </main>
</template>
<style scoped lang="scss">
.rent-car-page, .rent-car-page * { box-sizing: border-box; }
.rent-car-page { min-height: 100vh; display: grid; place-items: center; overflow: hidden; color: #f4f4f6; font-family: "SF Pro Display", "Segoe UI", sans-serif; background: transparent; backdrop-filter: none; filter: none; }
.rent-car-app {
  display: grid;
  grid-template-columns: px-to-vh(680) px-to-vh(290);
  gap: px-to-vh(10);
  width: px-to-vh(980);
  height: px-to-vh(441);
  transform: scale(1.4);
  transform-origin: center;
}
.catalog, .checkout { min-height: 0; border-radius: px-to-vh(6); background: #07090f; backdrop-filter: none; filter: none; }
.catalog { display: flex; flex-direction: column; padding: px-to-vh(20); overflow: hidden; }
.header { display: grid; grid-template-columns: px-to-vh(40) 1fr px-to-vh(31); align-items: center; gap: px-to-vh(11); flex: none; }
.header__icon { display: grid; width: px-to-vh(40); height: px-to-vh(40); place-items: center; border-radius: px-to-vh(4); color: #d700ff; background: #26002e; }
.header__icon svg { width: px-to-vh(24); height: px-to-vh(24); }
.header h1 { margin: 0; font-size: px-to-vh(14); font-weight: 600; }
.header p { margin: px-to-vh(2) 0 0; color: rgb(255 255 255 / 45%); font-size: px-to-vh(14); font-weight: 200; }
.close { display: grid; width: px-to-vh(31); height: px-to-vh(31); padding: 0; place-items: center; border: 0; border-radius: px-to-vh(3); color: #a344b5; background: #24052c; cursor: pointer; }
.close svg { width: px-to-vh(22); height: px-to-vh(22); }
.divider { flex: 0 0 px-to-vh(1); margin: px-to-vh(20) 0; background: linear-gradient(90deg, rgb(242 242 247 / 9%), rgb(242 242 247 / 10%), rgb(242 242 247 / 9%)); }
.vehicle-list { display: grid; grid-auto-rows: px-to-vh(150); grid-template-columns: repeat(3, minmax(0, 1fr)); gap: px-to-vh(20); min-height: 0; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; }
.vehicle-list::-webkit-scrollbar { display: none; }
.vehicle-card { min-width: 0; height: px-to-vh(150); padding: 0; overflow: hidden; border: px-to-vh(.3) solid rgb(255 255 255 / 10%); border-radius: px-to-vh(5); color: inherit; text-align: left; background: rgb(255 255 255 / 1%); cursor: pointer; }
.vehicle-card.active { border-color: rgb(207 0 235 / 48%); }
.vehicle-card__image { display: grid; height: px-to-vh(85); place-items: center; background: rgb(255 255 255 / 1%); }
.vehicle-card__image > svg { width: px-to-vh(42); height: px-to-vh(42); color: rgb(255 255 255 / 20%); }
.vehicle-card__image img { height: px-to-vh(70); object-fit: contain; }
.vehicle-card__info { display: flex; align-items: flex-start; flex-direction: column; gap: px-to-vh(5); height: px-to-vh(65); padding: px-to-vh(10); background: rgb(255 255 255 / 1%); }
.vehicle-card__info strong { font-size: px-to-vh(14); font-weight: 600; }
.vehicle-card__info em, .price, .total strong { padding: px-to-vh(5); border: px-to-vh(.3) dashed #e000ff; border-radius: px-to-vh(2); color: #e000ff; font-size: px-to-vh(12); font-style: normal; font-weight: 500; background: rgb(224 0 255 / 10%); }
.checkout { position: relative; overflow: hidden; }
.preview { position: absolute; top: px-to-vh(20); left: px-to-vh(20); display: grid; width: px-to-vh(250); height: px-to-vh(125); place-items: center; border: px-to-vh(.3) solid rgb(255 255 255 / 10%); border-radius: px-to-vh(5); background: rgb(255 255 255 / 1%); }
.preview > svg { width: px-to-vh(58); height: px-to-vh(58); color: rgb(255 255 255 / 20%); }
.preview img { width: px-to-vh(124); height: px-to-vh(70); object-fit: contain; }
.car-name { position: absolute; top: px-to-vh(157); left: px-to-vh(20); margin: 0; font-size: px-to-vh(14); font-weight: 500; }
.price { position: absolute; top: px-to-vh(177); left: px-to-vh(20); background: rgb(224 0 255 / 15%); }
.hours-title { position: absolute; top: px-to-vh(220); left: px-to-vh(20); display: flex; width: px-to-vh(250); justify-content: space-between; margin: 0; font-size: px-to-vh(11); font-weight: 500; }
.hours-title small { color: #7c7c85; font-size: inherit; }
.range {
  position: absolute;
  top: px-to-vh(239);
  left: px-to-vh(20);
  width: px-to-vh(250);
  height: px-to-vh(32);
  margin: 0;
  padding: 0 px-to-vh(10);
  appearance: none;
  border: px-to-vh(.6) solid rgb(255 255 255 / 13%);
  border-radius: px-to-vh(4);
  outline: 0;
  background: rgb(255 255 255 / 1%);
  cursor: pointer;
}

.range::-webkit-slider-runnable-track {
  width: 100%;
  height: px-to-vh(4);
  border: 0;
  border-radius: px-to-vh(5);
  background: linear-gradient(
    90deg,
    #e000ff 0 var(--range-progress),
    rgb(255 255 255 / 5%) var(--range-progress) 100%
  );
}

.range::-webkit-slider-thumb {
  width: px-to-vh(4);
  height: px-to-vh(10);
  margin-top: px-to-vh(-3);
  appearance: none;
  border: 0;
  border-radius: px-to-vh(1);
  background: #fff;
  box-shadow: 0 px-to-vh(1) px-to-vh(3.3) rgb(242 242 247 / 25%);
}

.range::-moz-range-track {
  height: px-to-vh(4);
  border: 0;
  border-radius: px-to-vh(5);
  background: rgb(255 255 255 / 5%);
}

.range::-moz-range-progress {
  height: px-to-vh(4);
  border-radius: px-to-vh(5);
  background: #e000ff;
}

.range::-moz-range-thumb {
  width: px-to-vh(4);
  height: px-to-vh(10);
  border: 0;
  border-radius: px-to-vh(1);
  background: #fff;
  box-shadow: 0 px-to-vh(1) px-to-vh(3.3) rgb(242 242 247 / 25%);
}
.colors { position: absolute; top: px-to-vh(277); left: px-to-vh(20); display: flex; gap: px-to-vh(10); margin: 0; padding: 0; border: 0; }
.colors legend { margin-bottom: px-to-vh(7); font-size: px-to-vh(11); }
.colors button { position: relative; width: px-to-vh(26); height: px-to-vh(26); padding: 0; border: 0; border-radius: px-to-vh(2); cursor: pointer; }
.colors button.active::after { position: absolute; right: 0; bottom: px-to-vh(-10); left: 0; height: px-to-vh(2); background: #e000ff; content: ""; }
.total { position: absolute; top: px-to-vh(336); left: px-to-vh(20); display: flex; width: px-to-vh(250); align-items: center; justify-content: space-between; margin: 0; font-size: px-to-vh(11); font-weight: 500; }
.total strong { background: rgb(224 0 255 / 15%); }
.payments { position: absolute; top: px-to-vh(393); left: px-to-vh(20); display: grid; grid-template-columns: px-to-vh(126) px-to-vh(119); gap: px-to-vh(5); margin: 0; }
.payments button { height: px-to-vh(28); border: 0; border-radius: px-to-vh(2); color: #fff; font-size: px-to-vh(10); font-weight: 300; background: rgb(255 255 255 / 2%); cursor: pointer; }
.payments button:disabled { opacity: .45; cursor: default; }
.payments button:active { background: linear-gradient(180deg, rgb(224 0 255 / 65%), rgb(134 0 153 / 65%)); }
.checkout--empty { display: grid; place-items: center; color: rgb(255 255 255 / 45%); font-size: px-to-vh(13); }
</style>
