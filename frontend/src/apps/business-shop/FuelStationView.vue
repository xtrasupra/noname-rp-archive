<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  Banknote,
  CarFront,
  CheckCircle2,
  CreditCard,
  Droplets,
  Fuel,
  HeartPulse,
  MapPin,
  Package,
  Sandwich,
  ShoppingBag,
  X,
} from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { BusinessProduct, InterfacePayloadMap } from '@/shared/contracts/ui'
import { isPurchaseControlDisabled } from './purchase-control'
import { useBusinessPurchaseFeedback } from './useBusinessPurchaseFeedback'

const props = defineProps<{ payload: InterfacePayloadMap['businessShop'] }>()

const paymentType = ref<'cash' | 'card'>('cash')
const selectedFuelId = ref('')

const business = computed(() => props.payload.business)
const businessId = computed(() => business.value.id)
const {
  beginPurchase,
  hasPendingPurchase,
  isPurchasePending,
  isPurchaseRetryAvailable,
  isPurchaseRetrying,
} = useBusinessPurchaseFeedback(businessId)
const station = computed(() => props.payload.fuelStation)
const vehicle = computed(() => station.value?.vehicle ?? null)
const fuelProducts = computed(() => props.payload.products.filter((product) => product.kind === 'fuel'))
const goods = computed(() => props.payload.products.filter((product) => product.kind !== 'fuel'))
const selectedFuel = computed(() => fuelProducts.value.find((product) => product.id === selectedFuelId.value) ?? fuelProducts.value[0] ?? null)
const requiredLitres = computed(() => vehicle.value ? Math.max(0, Math.ceil(vehicle.value.capacity - vehicle.value.fuel)) : 0)
const hasEnoughStock = computed(() => Number(selectedFuel.value?.stock || 0) >= requiredLitres.value)
const fuelTotal = computed(() => Math.max(0, requiredLitres.value * Number(selectedFuel.value?.price || 0)))
const cash = computed(() => Math.max(0, Number(props.payload.balances.cash || 0)))
const card = computed(() => Math.max(0, Number(props.payload.balances.card || 0)))
const isFuelPurchaseDisabled = computed(() => isPurchaseControlDisabled(
  !business.value.isOpen
    || !station.value?.canRefuel
    || !selectedFuel.value
    || !hasEnoughStock.value
    || requiredLitres.value < 1,
  hasPendingPurchase.value,
  isPurchaseRetryAvailable(selectedFuel.value?.id),
))

const reasonCopy = computed(() => {
  switch (station.value?.reason) {
    case 'ready': return hasEnoughStock.value
      ? 'Заправка заполнит бак автомобиля полностью.'
      : 'На станции недостаточно топлива для полного бака.'
    case 'no_vehicle': return 'Припаркуйте автомобиль у колонки.'
    case 'not_driver': return 'Заправлять автомобиль может только водитель.'
    case 'not_owner': return 'У вас нет доступа к управлению этим автомобилем.'
    case 'engine_on': return 'Перед заправкой заглушите двигатель.'
    case 'full': return 'Топливный бак уже заполнен.'
    default: return 'Заправка сейчас недоступна.'
  }
})

function money(value: number) {
  return new Intl.NumberFormat('ru-RU').format(Math.max(0, Number(value || 0)))
}

function productIcon(product: BusinessProduct) {
  const normalized = `${product.id} ${product.name}`.toLowerCase()
  if (normalized.includes('burger') || normalized.includes('food')) return Sandwich
  if (normalized.includes('bandage') || normalized.includes('med')) return HeartPulse
  if (normalized.includes('water') || normalized.includes('drink')) return Droplets
  return Package
}

function selectFuel(productId: string) {
  selectedFuelId.value = productId
}

function buy(product: BusinessProduct, quantity: number) {
  if (isPurchaseRetryAvailable(product.id)) {
    callClientEvent('businessShop:retryPurchaseFromBrowser', JSON.stringify({
      businessId: business.value.id,
      productId: product.id,
    }))
    return
  }
  if (!business.value.isOpen || product.stock < quantity || quantity < 1) return
  if (product.kind === 'fuel' && !station.value?.canRefuel) return
  if (!beginPurchase(product.id)) return

  callClientEvent('businessShop:buyFromBrowser', JSON.stringify({
    businessId: business.value.id,
    productId: product.id,
    quantity,
    paymentType: paymentType.value,
  }))
}

function close() {
  callClientEvent('businessShop:closeFromBrowser')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

watch(fuelProducts, (products) => {
  const requestedId = station.value?.recommendedProductId
  if (products.some((product) => product.id === selectedFuelId.value)) return
  selectedFuelId.value = products.some((product) => product.id === requestedId)
    ? String(requestedId)
    : products[0]?.id ?? ''
}, { immediate: true })

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <main class="fuel-screen">
    <section class="fuel-panel">
      <header class="station-header">
        <div class="station-brand">
          <span class="station-brand__mark"><Fuel /></span>
          <div>
            <span class="eyebrow">ЗАПРАВКА NONAME</span>
            <h1>{{ business.name }}</h1>
            <p><MapPin /> {{ business.district }}</p>
          </div>
        </div>

        <button class="close-button" type="button" aria-label="Закрыть заправку" @click="close"><X /></button>
      </header>

      <section class="station-overview">
        <div class="vehicle-copy">
          <span>Автомобиль</span>
          <strong>{{ vehicle?.name || 'Нет автомобиля' }}</strong>
          <small v-if="vehicle?.plate">Номер: {{ vehicle.plate }}</small>
        </div>

        <div class="fuel-gauge" :style="{ '--fuel-progress': vehicle?.percent || 0 }">
          <svg viewBox="0 0 320 165" aria-hidden="true">
            <path class="fuel-gauge__track" pathLength="100" d="M 26 148 A 134 134 0 0 1 294 148" />
            <path class="fuel-gauge__value" pathLength="100" d="M 26 148 A 134 134 0 0 1 294 148" />
          </svg>
          <div class="fuel-gauge__content">
            <span><Fuel /> {{ selectedFuel?.name || 'Топливо' }}</span>
            <strong>{{ vehicle ? `${Math.round(vehicle.fuel)} л` : '—' }}</strong>
            <CarFront />
          </div>
          <small class="fuel-gauge__empty">0</small>
          <small class="fuel-gauge__full">100</small>
        </div>

        <div class="fuel-state" :class="{ 'fuel-state--ready': station?.canRefuel }">
          <span>Топливная система</span>
          <strong>{{ vehicle ? `${Math.round(vehicle.percent)}%` : '—' }}</strong>
          <p><CheckCircle2 v-if="station?.canRefuel" /><AlertTriangle v-else /> {{ reasonCopy }}</p>
        </div>
      </section>

      <section class="fuel-options" aria-label="Тип топлива">
        <button
          v-for="product in fuelProducts"
          :key="product.id"
          type="button"
          :class="{ active: selectedFuel?.id === product.id }"
          :disabled="product.stock < 1"
          @click="selectFuel(product.id)"
        >
          <span>{{ product.name }}</span>
          <strong>${{ money(product.price) }} <small>/ л</small></strong>
          <i :class="{ available: product.stock > 0 }"></i>
        </button>
      </section>

      <section class="purchase-row">
        <div class="litre-control">
          <span>До полного бака</span>
          <strong>{{ requiredLitres }} л</strong>
        </div>

        <div class="payment-switch">
          <button type="button" :class="{ active: paymentType === 'cash' }" @click="paymentType = 'cash'">
            <Banknote /> Наличные <small>${{ money(cash) }}</small>
          </button>
          <button type="button" :class="{ active: paymentType === 'card' }" @click="paymentType = 'card'">
            <CreditCard /> Карта <small>${{ money(card) }}</small>
          </button>
        </div>

        <button
          class="fuel-submit"
          :class="{ 'is-pending': isPurchasePending(selectedFuel?.id) }"
          type="button"
          :disabled="isFuelPurchaseDisabled"
          :aria-busy="isPurchasePending(selectedFuel?.id) && !isPurchaseRetryAvailable(selectedFuel?.id)"
          @click="selectedFuel && buy(selectedFuel, requiredLitres)"
        >
          <Fuel />
          <span>{{ isPurchaseRetryAvailable(selectedFuel?.id) ? 'Проверить оплату' : isPurchaseRetrying(selectedFuel?.id) ? 'Проверяем оплату…' : isPurchasePending(selectedFuel?.id) ? 'Заправляем…' : 'Заправить до полного' }}</span>
          <strong>${{ money(fuelTotal) }}</strong>
        </button>
      </section>

      <section v-if="goods.length" class="station-goods">
        <div class="station-goods__heading">
          <div>
            <span class="eyebrow">В ДОРОГУ</span>
            <h2>Сопутствующие товары</h2>
          </div>
          <ShoppingBag />
        </div>
        <div class="goods-grid">
          <article v-for="product in goods" :key="product.id" class="goods-card">
            <component :is="productIcon(product)" />
            <div>
              <strong>{{ product.name }}</strong>
              <span>{{ product.description }}</span>
            </div>
            <button
              type="button"
              :class="{ 'is-pending': isPurchasePending(product.id) }"
              :disabled="isPurchaseControlDisabled(product.stock < 1 || !business.isOpen, hasPendingPurchase, isPurchaseRetryAvailable(product.id))"
              :aria-busy="isPurchasePending(product.id) && !isPurchaseRetryAvailable(product.id)"
              @click="buy(product, 1)"
            >
              {{ isPurchaseRetryAvailable(product.id) ? 'Проверить' : isPurchaseRetrying(product.id) ? 'Проверяем…' : isPurchasePending(product.id) ? 'Покупаем…' : `$${money(product.price)}` }}
            </button>
          </article>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped lang="scss">
.fuel-screen {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  color: #182027;
  background: rgba(5, 10, 14, .25);
  font-family: Inter, Arial, sans-serif;
}

.fuel-panel {
  width: min(1180px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, .66);
  border-radius: 24px;
  background: rgba(248, 250, 251, .96);
  box-shadow: 0 30px 90px rgba(3, 12, 17, .38);
}

.station-header,
.station-overview,
.purchase-row,
.station-goods__heading {
  display: flex;
  align-items: center;
}

.station-header { justify-content: space-between; padding: 22px 26px 10px; }
.station-brand { display: flex; align-items: center; gap: 13px; }
.station-brand__mark { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 15px; color: white; background: linear-gradient(145deg, #02aac2, #087f98); }
.station-brand__mark svg { width: 25px; }
.eyebrow { color: #7b858b; font-size: 9px; font-weight: 900; letter-spacing: .18em; }
h1, h2, p { margin: 0; }
h1 { margin-top: 2px; font-size: 18px; }
.station-brand p { display: flex; align-items: center; gap: 4px; margin-top: 3px; color: #738087; font-size: 11px; }
.station-brand p svg { width: 13px; }
.close-button { width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid #dde3e6; border-radius: 12px; color: #657078; background: #fff; cursor: pointer; }
.close-button:hover { color: #111820; border-color: #b9c8ce; }

.station-overview { min-height: 205px; justify-content: space-between; gap: 28px; padding: 0 42px; background: radial-gradient(circle at 50% 110%, rgba(12, 172, 199, .1), transparent 47%); }
.vehicle-copy, .fuel-state { width: 230px; display: grid; gap: 6px; }
.vehicle-copy span, .fuel-state span { color: #899298; font-size: 11px; }
.vehicle-copy strong, .fuel-state strong { font-size: 17px; }
.vehicle-copy small { color: #647078; font-size: 11px; }
.fuel-state { text-align: right; }
.fuel-state p { display: flex; justify-content: flex-end; align-items: center; gap: 6px; color: #cf6b33; font-size: 11px; line-height: 1.4; }
.fuel-state p svg { width: 15px; flex: 0 0 auto; }
.fuel-state--ready p { color: #118f72; }

.fuel-gauge { --fuel-progress: 0; position: relative; width: min(390px, 38vw); height: 190px; flex: 0 0 auto; }
.fuel-gauge svg { width: 100%; height: 100%; overflow: visible; }
.fuel-gauge__track, .fuel-gauge__value { fill: none; stroke-width: 5; stroke-linecap: round; }
.fuel-gauge__track { stroke: #dce4e7; }
.fuel-gauge__value { stroke: #06a9c1; stroke-dasharray: var(--fuel-progress) 100; }
.fuel-gauge__content { position: absolute; inset: 35px 38px 0; display: grid; justify-items: center; align-content: center; gap: 6px; }
.fuel-gauge__content span { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 750; }
.fuel-gauge__content span svg { width: 13px; }
.fuel-gauge__content strong { font-size: 25px; }
.fuel-gauge__content > svg { width: 96px; height: 62px; color: #26343d; stroke-width: 1.25; }
.fuel-gauge__empty, .fuel-gauge__full { position: absolute; bottom: 18px; color: #839097; font-weight: 800; }
.fuel-gauge__empty { left: 18px; }
.fuel-gauge__full { right: 18px; }

.fuel-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 9px; padding: 0 26px 18px; }
.fuel-options button { position: relative; min-height: 76px; display: grid; gap: 7px; padding: 14px; border: 1px solid #dfe5e8; border-radius: 13px; text-align: left; color: #253039; background: #f5f7f8; cursor: pointer; }
.fuel-options button:hover, .fuel-options button.active { color: #fff; border-color: #06a9c1; background: #06a9c1; }
.fuel-options button:disabled { opacity: .45; cursor: not-allowed; }
.fuel-options button span { font-size: 12px; font-weight: 850; text-transform: uppercase; }
.fuel-options button strong { font-size: 15px; }
.fuel-options button strong small { font-size: 9px; font-weight: 700; opacity: .65; }
.fuel-options button i { position: absolute; top: 11px; right: 11px; width: 7px; height: 7px; border-radius: 50%; background: #bec7cb; }
.fuel-options button i.available { background: #3bc96a; }

.purchase-row { gap: 10px; margin: 0 26px; padding: 16px 0; border-top: 1px solid #e0e6e9; border-bottom: 1px solid #e0e6e9; }
.litre-control { min-width: 180px; display: grid; gap: 4px; }
.litre-control span { color: #899298; font-size: 10px; font-weight: 750; text-transform: uppercase; }
.litre-control strong { font-size: 15px; }
.payment-switch button { min-height: 42px; border: 1px solid #dfe5e8; border-radius: 10px; color: #536067; background: #f5f7f8; cursor: pointer; }
.payment-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; flex: 1; }
.payment-switch button { display: grid; grid-template-columns: 17px 1fr; align-items: center; gap: 6px; padding: 7px 11px; text-align: left; }
.payment-switch button svg { width: 16px; grid-row: 1 / 3; }
.payment-switch button small { color: #8a959b; font-size: 9px; }
.payment-switch button.active { color: #077e92; border-color: #80cfda; background: #e7f7f9; }
.fuel-submit { min-width: 180px; min-height: 48px; display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: 8px; padding: 0 15px; border: 0; border-radius: 11px; color: #fff; background: #08a8c0; box-shadow: 0 8px 20px rgba(8,168,192,.24); cursor: pointer; transition: filter 140ms ease, transform 140ms ease, box-shadow 140ms ease; }
.fuel-submit svg { width: 19px; }
.fuel-submit:disabled { opacity: .45; cursor: not-allowed; }
.fuel-submit:not(:disabled):hover { filter: brightness(1.1); box-shadow: 0 11px 27px rgba(8,168,192,.36); transform: translateY(-1px); }
.fuel-submit:not(:disabled):active { filter: brightness(.93); box-shadow: 0 4px 12px rgba(8,168,192,.22); transform: translateY(1px) scale(.985); }
.fuel-submit:focus-visible, .goods-card button:focus-visible { outline: 2px solid #087f98; outline-offset: 2px; }
.fuel-submit.is-pending { background: #087f98; }

.station-goods { padding: 18px 26px 25px; }
.station-goods__heading { justify-content: space-between; margin-bottom: 12px; }
.station-goods__heading h2 { margin-top: 2px; font-size: 15px; }
.station-goods__heading > svg { width: 20px; color: #8a969c; }
.goods-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 9px; }
.goods-card { min-width: 0; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 11px; border: 1px solid #e0e5e8; border-radius: 12px; background: #fafbfb; }
.goods-card > svg { width: 38px; height: 38px; padding: 8px; border-radius: 10px; color: #079ab0; background: #e7f6f8; }
.goods-card div { min-width: 0; display: grid; gap: 3px; }
.goods-card strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.goods-card span { overflow: hidden; color: #8b959a; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.goods-card button { min-width: 58px; min-height: 32px; border: 0; border-radius: 9px; color: #fff; background: #12a9bf; box-shadow: 0 5px 12px rgba(18,169,191,.2); cursor: pointer; transition: filter 140ms ease, transform 140ms ease, box-shadow 140ms ease; }
.goods-card button:disabled { opacity: .45; cursor: not-allowed; }
.goods-card button:not(:disabled):hover { filter: brightness(1.1); box-shadow: 0 7px 18px rgba(18,169,191,.32); transform: translateY(-1px); }
.goods-card button:not(:disabled):active { filter: brightness(.93); transform: translateY(1px) scale(.98); }
.goods-card button.is-pending { min-width: 88px; background: #087f98; }

@media (max-width: 900px) {
  .fuel-screen { padding: 10px; }
  .fuel-panel { max-height: calc(100vh - 20px); }
  .station-overview { gap: 10px; padding: 0 18px; }
  .vehicle-copy, .fuel-state { width: 160px; }
  .fuel-gauge { width: 300px; }
  .purchase-row { flex-wrap: wrap; }
  .litre-control { min-width: 100%; }
  .fuel-submit { flex: 1; }
}
</style>
