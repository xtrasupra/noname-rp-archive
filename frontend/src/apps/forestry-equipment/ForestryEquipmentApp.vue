<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Axe, Clock3, Gauge, LockKeyhole, Sparkles, Trees, Truck, X } from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { ForestryEquipmentEntry, ForestryEquipmentPayload, ForestryVehicleEntry } from '@/shared/contracts/forestry'

const props = defineProps<{ payload?: ForestryEquipmentPayload }>()
const tab = ref<'equipment' | 'haul'>('equipment')
const pendingId = ref<string | null>(null)
const now = ref(Date.now())
const payloadReceivedAt = ref(Date.now())
let timer = 0
const profile = computed(() => props.payload?.profile)

function money(value?: number) { return `$${Math.round(Number(value || 0)).toLocaleString('ru-RU')}` }
function formatRemaining(milliseconds: number) {
  if (milliseconds <= 0) return ''
  const seconds = Math.ceil(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
function remaining(id: string) { return formatRemaining(Math.max(0, Number(props.payload?.active?.[id]?.remainingMs || 0) - (now.value - payloadReceivedAt.value))) }
function vehicleRemaining(vehicle: ForestryVehicleEntry) { return formatRemaining(Math.max(0, Number(vehicle.remainingMs ?? vehicle.expiresInMs ?? 0) - (now.value - payloadReceivedAt.value))) }
function buy(item: ForestryEquipmentEntry) {
  if (!item.available || pendingId.value) return
  pendingId.value = item.id
  callClientEvent('forestryEquipment:purchaseFromBrowser', JSON.stringify({ kind: 'equipment', id: item.id }))
  window.setTimeout(() => { pendingId.value = null }, 1800)
}
function rent(vehicle: ForestryVehicleEntry) {
  if ((!vehicle.current && !vehicle.available) || pendingId.value) return
  pendingId.value = vehicle.id
  callClientEvent('forestryEquipment:purchaseFromBrowser', JSON.stringify({ kind: 'vehicle', id: vehicle.id }))
  window.setTimeout(() => { pendingId.value = null }, 1800)
}
function close() { callClientEvent('forestryEquipment:closeFromBrowser') }
watch(() => props.payload, (payload) => {
  payloadReceivedAt.value = Date.now()
  now.value = Date.now()
  if (payload?.initialTab === 'equipment' || payload?.initialTab === 'haul') tab.value = payload.initialTab
}, { immediate: true })
onMounted(() => { timer = window.setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <main class="page">
    <section class="shell">
      <header>
        <span class="logo"><Trees /></span>
        <div class="title"><small>Twinkle Timber Co.</small><h1>Снаряжение лесоруба</h1></div>
        <div class="profile"><b>LVL {{ profile?.level ?? 1 }}</b><span>{{ profile?.levelName ?? 'Ученик' }}</span><em>{{ profile?.xp ?? 0 }} XP</em></div>
        <button class="close" type="button" @click="close"><X /></button>
      </header>
      <div class="stats">
        <span><Trees /><small>Срублено</small><b>{{ Number(profile?.treesCut || 0).toLocaleString('ru-RU') }}</b></span>
        <span><Sparkles /><small>Выход уровня</small><b>x{{ Number(profile?.yieldMultiplier || 1).toFixed(2) }}</b></span>
        <span><Truck /><small>Рейсов</small><b>{{ profile?.haulTrips ?? 0 }}</b></span>
        <span><Gauge /><small>Заработано</small><b>{{ money(profile?.totalEarned) }}</b></span>
      </div>
      <nav>
        <button :class="{ active: tab === 'equipment' }" type="button" @click="tab = 'equipment'"><Axe /> Инструменты</button>
        <button :class="{ active: tab === 'haul' }" type="button" @click="tab = 'haul'"><Truck /> Вывоз дерева</button>
      </nav>
      <div v-if="tab === 'equipment'" class="grid">
        <article v-for="item in props.payload?.equipment ?? []" :key="item.id" :class="{ locked: !item.available && !remaining(item.id), active: !!remaining(item.id) }">
          <span class="item-icon"><Sparkles v-if="item.id === 'stimulant'" /><Axe v-else /></span>
          <small>{{ item.consumable ? 'Расходник' : 'Аренда' }}</small><h2>{{ item.name }}</h2>
          <p v-if="item.id === 'chainsaw'">Стандартный рабочий инструмент для срубки деревьев.</p>
          <p v-else-if="item.id === 'golden_axe'">Открывается на 3 уровне и даёт x2 к выходу древесины.</p>
          <p v-else>Даёт x2 к добыче на 5 минут. Итоговый выход ограничен x3.</p>
          <div class="terms"><Clock3 /> {{ item.durationMinutes }} мин. <b>·</b> уровень {{ item.minLevel }}</div>
          <div v-if="remaining(item.id)" class="active-time"><Clock3 /> Осталось {{ remaining(item.id) }}</div>
          <div v-else-if="item.reason" class="reason"><LockKeyhole /> {{ item.reason }}</div>
          <footer><strong>{{ money(item.price) }}</strong><button type="button" :disabled="!item.available || !!pendingId" @click="buy(item)">{{ pendingId === item.id ? 'Оформляем…' : item.available ? (item.consumable ? 'Купить' : 'Арендовать') : 'Недоступно' }}</button></footer>
        </article>
        <article class="trophy" :class="{ active: profile?.secretSawClaimed }">
          <span class="item-icon"><Sparkles /></span><small>Трофей</small><h2>Секретная пила</h2>
          <p>Навсегда выдаётся за 1000 срубленных деревьев. Поднимает общий рабочий множитель до x3, не складываясь в x9.</p>
          <div class="terms"><Trees /> {{ Math.min(1000, Number(profile?.treesCut || 0)) }} / 1000</div>
          <div v-if="profile?.secretSawClaimed" class="active-time"><Sparkles /> Получена и привязана к персонажу</div>
        </article>
      </div>
      <div v-else class="haul-layout">
        <section class="haul-info"><small>С 6 уровня + физическая CDL</small><h2>Вывоз древесины со склада</h2><p>Загрузите древесину, которую принесли лесорубы, и отвезите её на случайный склад из логистической сети дальнобоя. Маршрут и целостность поездки проверяются сервером.</p><ol><li>Арендуйте Mule с CDL B или Phantom с CDL A.</li><li>Встаньте транспортом в точку загрузки и нажмите E.</li><li>Следуйте по маршруту, разгрузитесь и возвращайтесь.</li></ol></section>
        <div class="vehicles">
          <article v-for="vehicle in props.payload?.vehicles ?? []" :key="vehicle.id" :class="{ locked: !vehicle.available && !vehicle.current, current: vehicle.current }">
            <span class="vehicle-icon"><Truck /></span><div><small>{{ vehicle.type === 'truck' ? 'Тягач с прицепом' : 'Рабочий фургон' }}</small><h3>{{ vehicle.name }}</h3><p>Уровень {{ vehicle.minLevel }} · {{ vehicle.license.toUpperCase() }} · {{ vehicle.durationMinutes }} мин.</p></div>
            <div v-if="vehicle.current && vehicleRemaining(vehicle)" class="active-time"><Clock3 /> Осталось {{ vehicleRemaining(vehicle) }}</div>
            <div v-else-if="vehicle.reasons.length" class="reason"><LockKeyhole /> {{ vehicle.reasons.join(' · ') }}</div>
            <footer><strong>{{ vehicle.current ? 'Текущая аренда' : money(vehicle.price) }}</strong><button type="button" :disabled="(!vehicle.current && !vehicle.available) || !!pendingId" @click="rent(vehicle)">{{ pendingId === vehicle.id ? 'Выдаём…' : vehicle.current ? 'Восстановить' : 'Арендовать' }}</button></footer>
          </article>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.page{position:fixed;inset:0;display:grid;place-items:center;color:#edf7ef;background:radial-gradient(circle at 14% 0,#4f9b5129,transparent 34%),#040806e8;font-family:"SF Pro Display","Segoe UI",sans-serif}.shell{width:min(118vh,94vw);height:min(78vh,92vh);overflow:hidden;border:.1vh solid #62b87355;border-radius:1.8vh;background:linear-gradient(145deg,#13231a,#0a120e 58%,#151c10);box-shadow:0 4vh 12vh #000c}.shell>header{height:9.5vh;display:flex;align-items:center;gap:1.2vh;padding:0 2.2vh;border-bottom:.1vh solid #ffffff14}.logo{width:4.8vh;height:4.8vh;display:grid;place-items:center;border-radius:1.2vh;color:#07130a;background:linear-gradient(145deg,#8ad774,#4a9c57)}svg{width:2vh}.title small,.title h1{display:block;margin:0}.title small{color:#75c681;font-size:.9vh;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.title h1{margin-top:.25vh;font-size:2.1vh}.profile{display:grid;grid-template-columns:auto auto;align-items:center;gap:.2vh .7vh;margin-left:auto;padding:.7vh 1vh;border:.1vh solid #ffffff14;border-radius:.9vh;background:#ffffff07}.profile b{grid-row:1/3;color:#8fd99b;font-size:1.3vh}.profile span{font-size:1vh}.profile em{color:#758878;font-size:.85vh;font-style:normal}.close{width:3.8vh;height:3.8vh;display:grid;place-items:center;border:.1vh solid #ffffff18;border-radius:.8vh;color:#aebbb0;background:#ffffff08}.stats{height:7vh;display:grid;grid-template-columns:repeat(4,1fr);gap:1vh;padding:1vh 2.2vh;box-sizing:border-box;border-bottom:.1vh solid #ffffff10}.stats span{display:grid;grid-template-columns:auto 1fr;gap:.1vh .65vh;align-content:center;padding:.65vh;border-radius:.7vh;background:#ffffff06}.stats svg{grid-row:1/3;color:#72c980}.stats small{color:#718173;font-size:.8vh}.stats b{font-size:1.05vh}.shell>nav{height:5.5vh;display:flex;align-items:end;gap:.5vh;padding:0 2.2vh;border-bottom:.1vh solid #ffffff12}.shell>nav button{height:4.4vh;display:flex;align-items:center;gap:.55vh;padding:0 1.5vh;border:0;border-bottom:.25vh solid transparent;color:#708073;background:transparent;font-weight:850}.shell>nav button.active{border-color:#69bd77;color:#f4f7f1}.grid{height:calc(100% - 22vh);display:grid;grid-template-columns:repeat(2,1fr);gap:1.1vh;overflow:auto;padding:1.5vh 2.2vh 2.2vh;box-sizing:border-box}.grid article,.vehicles article{position:relative;padding:1.4vh;border:.1vh solid #ffffff14;border-radius:1.1vh;background:linear-gradient(145deg,#ffffff08,#ffffff04)}.grid article.active{border-color:#62e2a44d;background:#42d88e0e}.grid article.locked,.vehicles article.locked{opacity:.58}.item-icon,.vehicle-icon{width:4vh;height:4vh;display:grid;place-items:center;float:right;border-radius:1vh;color:#7ed18c;background:#62c07314}.grid article>small,.haul-info>small,.vehicles small{color:#75c982;font-size:.82vh;font-weight:850;text-transform:uppercase}.grid h2{margin:.4vh 0;font-size:1.55vh}.grid p,.haul-info p,.vehicles p{color:#87968a;font-size:.95vh;line-height:1.45}.terms,.active-time,.reason{display:flex;align-items:center;gap:.45vh;margin-top:.8vh;padding:.65vh .75vh;border-radius:.65vh;background:#ffffff07;color:#8fa092;font-size:.9vh}.active-time{color:#72e2a8;background:#48db9410}.reason{color:#ffad8a;background:#ff774914}.terms svg,.active-time svg,.reason svg{width:1.25vh}.grid footer,.vehicles footer{display:flex;align-items:center;justify-content:space-between;margin-top:1vh}.grid footer strong,.vehicles footer strong{font-size:1.3vh}.grid footer button,.vehicles footer button{padding:.7vh 1.1vh;border:0;border-radius:.65vh;color:#071209;background:#75cc82;font-weight:900}.grid footer button:disabled,.vehicles footer button:disabled{opacity:.45}.trophy{grid-column:1/-1}.haul-layout{height:calc(100% - 22vh);display:grid;grid-template-columns:.8fr 1.2fr;gap:1.5vh;padding:1.7vh 2.2vh;box-sizing:border-box}.haul-info{padding:1.6vh;border:.1vh solid #ffffff12;border-radius:1.1vh;background:#ffffff05}.haul-info h2{font-size:1.8vh}.haul-info li{margin:.7vh 0;color:#9bab9e;font-size:.95vh}.vehicles{display:grid;gap:1vh;overflow:auto}.vehicles article{display:grid;grid-template-columns:auto 1fr;gap:1vh}.vehicles h3{margin:.2vh 0;font-size:1.4vh}.vehicles footer,.vehicles .active-time,.vehicles .reason{grid-column:1/-1}button{font:inherit;cursor:pointer}
</style>
