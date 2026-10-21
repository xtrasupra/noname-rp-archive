<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Banknote, CarFront, MapPin, RefreshCw, X } from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { AutoServicePayload, AutoServiceVehicle } from '@/shared/contracts/auto-service'

const props = defineProps<{ payload?: AutoServicePayload }>()

const selectedId = ref<number | null>(null)
const pending = ref(false)

const vehicles = computed(() => props.payload?.vehicles ?? [])
const selected = computed(() => (
  vehicles.value.find((vehicle) => vehicle.id === selectedId.value) ?? null
))
const canPay = computed(() => Number(props.payload?.cash ?? 0) >= Number(props.payload?.serviceFee ?? 0))
const canDeliver = computed(() => Boolean(selected.value?.spawnable && canPay.value && !pending.value))

const locationLabels: Record<AutoServiceVehicle['location'], string> = {
  stored: 'На хранении',
  outside: 'На улице',
  unavailable: 'Сохранён',
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)))
}

function selectVehicle(vehicle: AutoServiceVehicle) {
  if (!vehicle.spawnable || pending.value) return
  selectedId.value = vehicle.id
}

function deliver() {
  if (!canDeliver.value || !selected.value || !props.payload) return
  pending.value = true
  callClientEvent('auto-service:spawn', props.payload.sessionId, selected.value.id)
}

function refresh() {
  if (!props.payload || pending.value) return
  pending.value = true
  callClientEvent('auto-service:refresh', props.payload.sessionId)
}

function close() {
  callClientEvent('auto-service:close')
}

watch(
  () => props.payload,
  (payload) => {
    pending.value = false
    const current = payload?.vehicles.find((vehicle) => vehicle.id === selectedId.value && vehicle.spawnable)
    selectedId.value = current?.id ?? payload?.vehicles.find((vehicle) => vehicle.spawnable)?.id ?? null
  },
  { immediate: true },
)
</script>

<template>
  <main class="auto-service" aria-label="Автосервис">
    <section class="service-panel">
      <header class="service-header">
        <span class="service-header__icon"><CarFront aria-hidden="true" /></span>
        <div>
          <p>ЛИЧНЫЙ ТРАНСПОРТ</p>
          <h1>Автосервис</h1>
          <span>Выберите автомобиль, который нужно доставить к месту выдачи.</span>
        </div>
        <button class="icon-button" type="button" aria-label="Обновить список транспорта" :disabled="pending" @click="refresh">
          <RefreshCw :class="{ rotating: pending }" />
        </button>
        <button class="icon-button" type="button" aria-label="Закрыть" @click="close"><X /></button>
      </header>

      <div class="service-content">
        <section class="vehicle-catalog" aria-label="Ваш транспорт">
          <div class="section-title">
            <span>Ваш транспорт</span>
            <b>{{ vehicles.length }}</b>
          </div>

          <div v-if="vehicles.length" class="vehicle-list">
            <button
              v-for="vehicle in vehicles"
              :key="vehicle.id"
              class="vehicle-card"
              :class="{ selected: selectedId === vehicle.id, disabled: !vehicle.spawnable }"
              type="button"
              :disabled="!vehicle.spawnable || pending"
              @click="selectVehicle(vehicle)"
            >
              <span class="vehicle-card__visual"><CarFront aria-hidden="true" /></span>
              <span class="vehicle-card__copy">
                <small>{{ vehicle.model }}</small>
                <strong>{{ vehicle.name }}</strong>
                <span>{{ vehicle.plate || 'NO PLATE' }}</span>
              </span>
              <em :class="{ unavailable: !vehicle.spawnable }">
                {{ vehicle.spawnable ? locationLabels[vehicle.location] : 'Занят' }}
              </em>
            </button>
          </div>

          <div v-else class="empty-state">
            <CarFront aria-hidden="true" />
            <strong>Личного транспорта нет</strong>
            <span>Купленные этим персонажем машины появятся здесь.</span>
          </div>
        </section>

        <aside class="checkout">
          <template v-if="selected">
            <div class="checkout__vehicle"><CarFront aria-hidden="true" /></div>
            <p>ВЫБРАННЫЙ ТРАНСПОРТ</p>
            <h2>{{ selected.name }}</h2>
            <span class="plate">{{ selected.plate || 'NO PLATE' }}</span>

            <div class="details">
              <div><MapPin /><span>Текущее состояние</span><strong>{{ locationLabels[selected.location] }}</strong></div>
              <div><Banknote /><span>Наличные</span><strong>${{ formatMoney(payload?.cash ?? 0) }}</strong></div>
            </div>

            <div class="price-row">
              <span>Стоимость доставки</span>
              <strong>${{ formatMoney(payload?.serviceFee ?? 0) }}</strong>
            </div>

            <p v-if="!canPay" class="error-text">Недостаточно наличных для доставки.</p>
            <p v-else class="note">Машина будет перемещена к автосервису. Двигатель останется заглушённым.</p>

            <button class="deliver-button" type="button" :disabled="!canDeliver" @click="deliver">
              {{ pending ? 'Доставляем…' : `Доставить за $${formatMoney(payload?.serviceFee ?? 0)}` }}
            </button>
          </template>
          <div v-else class="checkout-empty">
            <CarFront aria-hidden="true" />
            <span>Выберите доступный транспорт</span>
          </div>
        </aside>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.auto-service, .auto-service * { box-sizing: border-box; }
.auto-service { position: fixed; inset: 0; display: grid; place-items: center; color: #f7f4fa; font-family: "SF Pro Display", "Segoe UI", sans-serif; background: rgb(0 0 0 / 38%); }
.service-panel { width: min(112vh, 94vw); height: min(68vh, 88vh); overflow: hidden; border: .1vh solid rgb(203 62 235 / 28%); border-radius: 1.4vh; background: linear-gradient(145deg, #09070d 0%, #100b14 52%, #07070a 100%); box-shadow: 0 3vh 9vh rgb(0 0 0 / 62%); }
.service-header { min-height: 10.2vh; display: grid; grid-template-columns: 5.2vh minmax(0, 1fr) 4.2vh 4.2vh; align-items: center; gap: 1.2vh; padding: 1.7vh 2vh; border-bottom: .1vh solid rgb(255 255 255 / 8%); }
.service-header__icon { width: 5.2vh; height: 5.2vh; display: grid; place-items: center; border-radius: 1vh; color: #d43bee; background: linear-gradient(145deg, rgb(203 46 230 / 28%), rgb(95 22 111 / 22%)); }
.service-header__icon svg { width: 2.8vh; }
.service-header p, .checkout > p { margin: 0 0 .35vh; color: #d43bee; font-size: 1vh; font-weight: 900; letter-spacing: .18vh; }
.service-header h1 { margin: 0; font-size: 2.15vh; }
.service-header div > span { display: block; margin-top: .35vh; color: rgb(255 255 255 / 46%); font-size: 1.15vh; }
.icon-button { width: 4.2vh; height: 4.2vh; display: grid; place-items: center; padding: 0; border: .1vh solid rgb(255 255 255 / 8%); border-radius: .75vh; color: #fff; background: rgb(255 255 255 / 5%); cursor: pointer; }
.icon-button:disabled { opacity: .45; cursor: default; }
.icon-button svg { width: 1.9vh; }
.rotating { animation: rotate 800ms linear infinite; }
.service-content { height: calc(100% - 10.2vh); display: grid; grid-template-columns: minmax(0, 1fr) 34vh; }
.vehicle-catalog { min-width: 0; display: flex; flex-direction: column; padding: 2vh; border-right: .1vh solid rgb(255 255 255 / 8%); }
.section-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.3vh; color: rgb(255 255 255 / 72%); font-size: 1.25vh; font-weight: 700; }
.section-title b { min-width: 2.7vh; padding: .35vh .7vh; border-radius: 2vh; color: #e48af4; text-align: center; background: rgb(212 59 238 / 13%); }
.vehicle-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1vh; min-height: 0; overflow-y: auto; padding-right: .4vh; }
.vehicle-card { min-width: 0; min-height: 10vh; display: grid; grid-template-columns: 8vh minmax(0, 1fr) auto; align-items: center; gap: 1.1vh; padding: 1.1vh; border: .1vh solid rgb(255 255 255 / 8%); border-radius: .9vh; color: inherit; text-align: left; background: rgb(255 255 255 / 2.5%); cursor: pointer; transition: border-color 140ms ease, background 140ms ease, transform 140ms ease; }
.vehicle-card:hover:not(:disabled), .vehicle-card.selected { border-color: rgb(212 59 238 / 65%); background: rgb(212 59 238 / 9%); transform: translateY(-.1vh); }
.vehicle-card.disabled { opacity: .5; cursor: default; }
.vehicle-card__visual { width: 8vh; height: 7.2vh; display: grid; place-items: center; border-radius: .65vh; color: rgb(255 255 255 / 30%); background: rgb(255 255 255 / 4%); }
.vehicle-card__visual svg { width: 4.1vh; }
.vehicle-card__copy { min-width: 0; display: flex; flex-direction: column; gap: .3vh; }
.vehicle-card__copy small { color: #ce54e3; font-size: .85vh; font-weight: 800; text-transform: uppercase; }
.vehicle-card__copy strong { overflow: hidden; font-size: 1.35vh; text-overflow: ellipsis; white-space: nowrap; }
.vehicle-card__copy span { color: rgb(255 255 255 / 43%); font-size: 1vh; letter-spacing: .08vh; }
.vehicle-card em { padding: .4vh .65vh; border-radius: .45vh; color: #6ce5a0; font-size: .9vh; font-style: normal; background: rgb(45 188 107 / 12%); }
.vehicle-card em.unavailable { color: #ff9696; background: rgb(255 80 80 / 11%); }
.checkout { position: relative; display: flex; flex-direction: column; padding: 2.2vh; background: radial-gradient(38vh 28vh at 50% 0%, rgb(212 59 238 / 12%), transparent 72%); }
.checkout__vehicle { height: 16vh; display: grid; place-items: center; margin-bottom: 1.8vh; border: .1vh solid rgb(255 255 255 / 7%); border-radius: 1vh; color: rgb(255 255 255 / 28%); background: rgb(255 255 255 / 2%); }
.checkout__vehicle svg { width: 8vh; height: 8vh; }
.checkout h2 { margin: 0; font-size: 2.1vh; }
.plate { align-self: flex-start; margin-top: .7vh; padding: .45vh .8vh; border: .1vh solid rgb(255 255 255 / 15%); border-radius: .35vh; color: rgb(255 255 255 / 62%); font-size: 1vh; letter-spacing: .12vh; }
.details { display: grid; gap: .7vh; margin-top: 2vh; }
.details > div { display: grid; grid-template-columns: 2.2vh minmax(0, 1fr) auto; align-items: center; gap: .7vh; min-height: 4.2vh; padding: .8vh 1vh; border-radius: .65vh; background: rgb(255 255 255 / 3%); }
.details svg { width: 1.55vh; color: #d35fea; }
.details span { color: rgb(255 255 255 / 45%); font-size: 1vh; }
.details strong { font-size: 1.05vh; }
.price-row { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding: 1.2vh 0; border-top: .1vh solid rgb(255 255 255 / 8%); color: rgb(255 255 255 / 55%); font-size: 1.15vh; }
.price-row strong { color: #df62f3; font-size: 1.9vh; }
.note, .error-text { min-height: 3.2vh; margin: 0 0 1vh; font-size: 1vh; line-height: 1.4; }
.note { color: rgb(255 255 255 / 38%); }
.error-text { color: #ff7777; }
.deliver-button { min-height: 4.8vh; border: 0; border-radius: .7vh; color: #fff; font-size: 1.15vh; font-weight: 800; background: linear-gradient(90deg, #9d25bd, #d13bec); cursor: pointer; }
.deliver-button:disabled { opacity: .4; cursor: default; }
.empty-state, .checkout-empty { flex: 1; display: grid; place-content: center; justify-items: center; gap: .8vh; color: rgb(255 255 255 / 34%); text-align: center; }
.empty-state svg, .checkout-empty svg { width: 5vh; }
.empty-state strong { color: rgb(255 255 255 / 70%); font-size: 1.5vh; }
.empty-state span, .checkout-empty span { font-size: 1.05vh; }
@keyframes rotate { to { transform: rotate(360deg); } }
@media (max-width: 1050px) { .vehicle-list { grid-template-columns: 1fr; } .service-content { grid-template-columns: minmax(0, 1fr) 31vh; } }
</style>
