<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BadgeCheck, Clock3, LockKeyhole, Scale, ShieldCheck, Truck, X } from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { TruckerRentalPayload, TruckerVehicle, TruckerVehicleType } from '@/shared/contracts/trucker'

const props = defineProps<{ payload?: TruckerRentalPayload }>()

const category = ref<TruckerVehicleType>('pickup')
const selectedId = ref<string | null>(null)
const pending = ref(false)
const categories: TruckerVehicleType[] = ['pickup', 'van', 'truck']

const categoryVehicles = computed(() =>
  (props.payload?.vehicles ?? []).filter((vehicle) => vehicle.type === category.value),
)
const selected = computed(() =>
  props.payload?.vehicles.find((vehicle) => vehicle.id === selectedId.value) ?? categoryVehicles.value[0] ?? null,
)

function chooseCategory(next: TruckerVehicleType) {
  category.value = next
  selectedId.value = (props.payload?.vehicles ?? []).find((vehicle) => vehicle.type === next)?.id ?? null
}

function formatMoney(value: number) {
  return `$${Math.round(value || 0).toLocaleString('ru-RU')}`
}

function formatWeight(value: number) {
  return `${(Number(value || 0) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т`
}

function typeLabel(type: TruckerVehicleType) {
  return { pickup: 'Пикап', van: 'Фургон', truck: 'Фура с прицепом' }[type]
}

function close() {
  callClientEvent('truckerRental:closeFromBrowser')
}

function rent(vehicle: TruckerVehicle | null) {
  if (!vehicle?.available || pending.value) return
  pending.value = true
  callClientEvent('truckerRental:rentFromBrowser', JSON.stringify({ vehicleId: vehicle.id }))
  window.setTimeout(() => { pending.value = false }, 1800)
}

watch(categoryVehicles, (vehicles) => {
  if (!vehicles.some((vehicle) => vehicle.id === selectedId.value)) selectedId.value = vehicles[0]?.id ?? null
}, { immediate: true })
</script>

<template>
  <main class="rental-page">
    <section class="rental-shell">
      <header>
        <div class="brand"><span><Truck /></span><div><small>Cross-State Logistics</small><h1>Аренда рабочего транспорта</h1></div></div>
        <div class="terms"><Clock3 /><span>{{ props.payload?.durationMinutes ?? 90 }} минут</span><b>или</b><span>{{ props.payload?.orderLimit ?? 5 }} рейсов</span></div>
        <button class="close" type="button" aria-label="Закрыть" @click="close"><X /></button>
      </header>

      <div v-if="props.payload?.currentVehicle" class="current">
        <BadgeCheck /><span>Сейчас арендован</span><strong>{{ props.payload.currentVehicle.name }}</strong><small>Осталось рейсов: {{ props.payload.currentVehicle.ordersRemaining }}</small>
      </div>

      <nav>
        <button v-for="item in categories" :key="item" type="button" :class="{ active: category === item }" @click="chooseCategory(item)">
          <Truck /><span>{{ item === 'pickup' ? 'Пикапы' : item === 'van' ? 'Фургоны' : 'Фуры' }}</span>
        </button>
      </nav>

      <div class="content">
        <aside>
          <button v-for="vehicle in categoryVehicles" :key="vehicle.id" type="button" :class="{ active: selected?.id === vehicle.id, locked: !vehicle.available }" @click="selectedId = vehicle.id">
            <span class="vehicle-icon"><Truck /></span>
            <span class="vehicle-name"><small>{{ typeLabel(vehicle.type) }}</small><strong>{{ vehicle.name }}</strong><em>{{ formatWeight(vehicle.maxWeightKg) }} · ранг {{ vehicle.minRank }}</em></span>
            <b>{{ formatMoney(vehicle.rentPrice) }}</b>
          </button>
        </aside>

        <article v-if="selected" class="details">
          <div class="hero"><Truck /><span>{{ typeLabel(selected.type) }}</span></div>
          <small>Рабочая единица</small>
          <h2>{{ selected.name }}</h2>
          <p>{{ selected.type === 'pickup' ? 'Для лёгких городских перевозок и первых рангов.' : selected.type === 'van' ? 'Закрытый кузов для средних и ценных грузов.' : 'Магистральный тягач выдаётся вместе с назначенным прицепом.' }}</p>

          <div class="specs">
            <span><Scale /><small>Максимальный груз</small><strong>{{ formatWeight(selected.maxWeightKg) }}</strong></span>
            <span><ShieldCheck /><small>Категория</small><strong>{{ selected.license === 'cdl_a' ? 'CDL A' : 'CDL B' }}</strong></span>
            <span><BadgeCheck /><small>Минимальный ранг</small><strong>{{ selected.minRank }}</strong></span>
          </div>

          <div v-if="selected.disabledReasons.length" class="reasons"><LockKeyhole /><span>{{ selected.disabledReasons.join(' · ') }}</span></div>
          <footer><div><small>Стоимость аренды</small><strong>{{ formatMoney(selected.rentPrice) }}</strong></div><button type="button" :disabled="!selected.available || pending" @click="rent(selected)">{{ pending ? 'Оформляем…' : selected.available ? 'Арендовать транспорт' : 'Транспорт недоступен' }}</button></footer>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.rental-page{position:fixed;inset:0;display:grid;place-items:center;color:#edf7ff;background:radial-gradient(circle at 15% 0,#17677d55,transparent 34%),#02070bd9;font-family:"SF Pro Display","Segoe UI",sans-serif}.rental-shell{width:min(118vh,94vw);height:min(76vh,90vh);overflow:hidden;border:.1vh solid #51dfff42;border-radius:2vh;background:linear-gradient(145deg,#0b1822,#071018 62%,#0a151d);box-shadow:0 3vh 10vh #000b}.rental-shell>header{height:10vh;display:flex;align-items:center;gap:2vh;padding:0 2.4vh;border-bottom:.1vh solid #ffffff17;box-sizing:border-box}.brand{display:flex;align-items:center;gap:1.1vh}.brand>span{width:4.6vh;height:4.6vh;display:grid;place-items:center;border-radius:1.2vh;color:#06131a;background:linear-gradient(135deg,#46d9ff,#64f0b9)}svg{width:2vh}.brand small,.brand h1{display:block;margin:0}.brand small{color:#5edfff;font-size:1vh;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.brand h1{margin-top:.3vh;font-size:2vh}.terms{margin-left:auto;display:flex;align-items:center;gap:.8vh;padding:.8vh 1.1vh;border-radius:.8vh;color:#b9d0de;background:#ffffff08;font-size:1.1vh}.terms b{color:#647c8c}.close{width:4vh;height:4vh;display:grid;place-items:center;border:.1vh solid #ffffff1c;border-radius:1vh;color:#b8cbd7;background:#ffffff08}.current{height:4.5vh;display:flex;align-items:center;gap:.7vh;padding:0 2.4vh;color:#7de9bd;background:#35d59612;font-size:1.05vh}.current strong{color:#ecfff8}.current small{margin-left:auto;color:#8ba4b3}.rental-shell>nav{height:7vh;display:flex;align-items:end;gap:.8vh;padding:0 2.4vh;border-bottom:.1vh solid #ffffff12;box-sizing:border-box}.rental-shell>nav button{height:5.2vh;display:flex;align-items:center;gap:.7vh;padding:0 1.8vh;border:0;border-bottom:.25vh solid transparent;color:#7892a2;background:transparent;font-size:1.2vh;font-weight:850}.rental-shell>nav button.active{border-color:#50dfff;color:#effbff}.content{height:calc(100% - 21.5vh);display:grid;grid-template-columns:43% 57%}.content>aside{overflow:auto;padding:1.5vh 1vh 2vh 2.4vh;border-right:.1vh solid #ffffff12}.content>aside button{width:100%;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:1vh;margin-bottom:.8vh;padding:1vh;border:.1vh solid #ffffff12;border-radius:1vh;color:#e8f5fb;background:#ffffff06;text-align:left}.content>aside button.active{border-color:#4bdcff66;background:#3fcffb12;box-shadow:inset .3vh 0 #4bdcff}.content>aside button.locked{opacity:.55}.vehicle-icon{width:4vh;height:4vh;display:grid;place-items:center;border-radius:.9vh;color:#62e2ff;background:#4ad7ff12}.vehicle-name small,.vehicle-name strong,.vehicle-name em{display:block}.vehicle-name small{color:#5edfff;font-size:.82vh;text-transform:uppercase}.vehicle-name strong{margin:.2vh 0;font-size:1.15vh}.vehicle-name em{color:#718998;font-size:.9vh;font-style:normal}.content>aside button>b{color:#70efbd;font-size:1.15vh}.details{position:relative;overflow:auto;padding:2.2vh 2.5vh 2.5vh}.hero{height:14vh;display:grid;place-items:center;align-content:center;gap:.8vh;border:.1vh solid #4cdcff28;border-radius:1.4vh;color:#68e6ff;background:radial-gradient(circle,#32d3ff20,transparent 62%)}.hero svg{width:6vh;height:6vh}.hero span{font-size:1vh;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.details>small{display:block;margin-top:1.5vh;color:#5edfff;font-size:.9vh;text-transform:uppercase}.details h2{margin:.35vh 0;font-size:2.5vh}.details>p{margin:.5vh 0 1.4vh;color:#829aaa;font-size:1.05vh}.specs{display:grid;grid-template-columns:repeat(3,1fr);gap:.8vh}.specs>span{display:grid;grid-template-columns:auto 1fr;gap:.3vh .6vh;padding:1vh;border-radius:.8vh;background:#ffffff07}.specs svg{grid-row:1/3;color:#5edfff}.specs small,.specs strong{display:block}.specs small{color:#7892a1;font-size:.82vh}.specs strong{font-size:1.05vh}.reasons{display:flex;align-items:center;gap:.7vh;margin-top:1.2vh;padding:1vh;border:.1vh solid #ff766638;border-radius:.8vh;color:#ffafa5;background:#ff625912;font-size:.95vh}.details footer{display:flex;align-items:center;justify-content:space-between;gap:1vh;margin-top:1.5vh}.details footer small,.details footer strong{display:block}.details footer small{color:#77909f;font-size:.9vh}.details footer strong{color:#73f0be;font-size:1.8vh}.details footer button{min-width:20vh;height:4.2vh;border:0;border-radius:.8vh;color:#06151c;background:linear-gradient(90deg,#4edcff,#66efb9);font-size:1.05vh;font-weight:900}.details footer button:disabled{color:#6e8491;background:#ffffff0b}button{font:inherit;cursor:pointer}button:disabled{cursor:not-allowed}::-webkit-scrollbar{width:.45vh}::-webkit-scrollbar-thumb{border-radius:1vh;background:#ffffff22}
</style>
