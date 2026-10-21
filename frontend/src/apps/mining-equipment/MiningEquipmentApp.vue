<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Clock3, Crosshair, Gauge, HardHat, LockKeyhole, Pickaxe, Sparkles, Truck, X } from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { MiningEquipmentEntry, MiningEquipmentPayload, MiningVehicleEntry } from '@/shared/contracts/mining'

const props = defineProps<{ payload?: MiningEquipmentPayload }>()
const tab = ref<'equipment' | 'haul'>('equipment')
const pendingId = ref<string | null>(null)
const now = ref(Date.now())
const payloadReceivedAt = ref(Date.now())
let timer = 0

const profile = computed(() => props.payload?.profile)

function money(value?: number) {
  return `$${Math.round(Number(value || 0)).toLocaleString('ru-RU')}`
}

function formatRemaining(milliseconds: number) {
  if (milliseconds <= 0) return ''
  const totalSeconds = Math.ceil(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds % 3600 / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function remaining(id: string) {
  const milliseconds = Math.max(0, Number(props.payload?.active?.[id]?.remainingMs || 0) - (now.value - payloadReceivedAt.value))
  return formatRemaining(milliseconds)
}

function vehicleRemaining(vehicle: MiningVehicleEntry) {
  const baseline = Number(vehicle.remainingMs ?? vehicle.expiresInMs ?? 0)
  return formatRemaining(Math.max(0, baseline - (now.value - payloadReceivedAt.value)))
}

function canUseVehicle(vehicle: MiningVehicleEntry) {
  return Boolean(vehicle.current || vehicle.available)
}

function buy(item: MiningEquipmentEntry) {
  if (!item.available || pendingId.value) return
  pendingId.value = item.id
  callClientEvent('miningEquipment:purchaseFromBrowser', JSON.stringify({ kind: 'equipment', id: item.id }))
  window.setTimeout(() => { pendingId.value = null }, 1800)
}

function rent(vehicle: MiningVehicleEntry) {
  if (!canUseVehicle(vehicle) || pendingId.value) return
  pendingId.value = vehicle.id
  callClientEvent('miningEquipment:purchaseFromBrowser', JSON.stringify({ kind: 'vehicle', id: vehicle.id }))
  window.setTimeout(() => { pendingId.value = null }, 1800)
}

function close() {
  callClientEvent('miningEquipment:closeFromBrowser')
}

watch(() => props.payload, () => {
  payloadReceivedAt.value = Date.now()
  now.value = Date.now()
}, { immediate: true })

onMounted(() => { timer = window.setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <main class="page">
    <section class="shell">
      <header>
        <span class="logo"><HardHat /></span>
        <div class="title"><small>Twinkle Mining Co.</small><h1>Снаряжение шахтёра</h1></div>
        <div class="profile"><b>LVL {{ profile?.level ?? 1 }}</b><span>{{ profile?.levelName ?? 'Стажёр' }}</span><em>{{ profile?.xp ?? 0 }} XP</em></div>
        <button class="close" type="button" @click="close"><X /></button>
      </header>

      <div class="stats">
        <span><Pickaxe /><small>Продано</small><b>{{ Number(profile?.kgSold || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) }} кг</b></span>
        <span><Sparkles /><small>Бонус уровня</small><b>x{{ Number(profile?.kgMultiplier || 1).toFixed(2) }} к кг</b></span>
        <span><Truck /><small>Рейсов породы</small><b>{{ profile?.haulTrips ?? 0 }}</b></span>
        <span><Gauge /><small>Всего заработано</small><b>{{ money(profile?.totalEarned) }}</b></span>
      </div>

      <nav>
        <button :class="{ active: tab === 'equipment' }" type="button" @click="tab = 'equipment'"><Pickaxe /> Добыча и GPS</button>
        <button :class="{ active: tab === 'haul' }" type="button" @click="tab = 'haul'"><Truck /> Рейсы породы</button>
      </nav>

      <div v-if="tab === 'equipment'" class="grid">
        <article v-for="item in props.payload?.equipment ?? []" :key="item.id" :class="{ locked: !item.available && !remaining(item.id), active: !!remaining(item.id) }">
          <span class="item-icon">
            <Crosshair v-if="item.id === 'gps'" />
            <Sparkles v-else-if="item.id === 'stimulant'" />
            <Pickaxe v-else />
          </span>
          <small>{{ item.consumable ? 'Расходник' : 'Аренда' }}</small>
          <h2>{{ item.name }}</h2>
          <p v-if="item.id === 'drill'">Быстрее наносит удары по HP камня.</p>
          <p v-else-if="item.id === 'golden_pickaxe'">X2 к добытым килограммам. Доступна с 3 уровня.</p>
          <p v-else-if="item.id === 'gps'">Показывает активные камни на карте и подсвечивает их в мире.</p>
          <p v-else>X2 к добыче на 10 минут активной игры. Суммарный бонус ограничен x3.</p>
          <div class="terms"><Clock3 /> {{ item.durationMinutes }} минут <b>·</b> уровень {{ item.minLevel }}</div>
          <div v-if="remaining(item.id)" class="active-time"><Clock3 /> Осталось {{ remaining(item.id) }}</div>
          <div v-else-if="item.reason" class="reason"><LockKeyhole /> {{ item.reason }}</div>
          <footer><strong>{{ money(item.price) }}</strong><button type="button" :disabled="!item.available || !!pendingId" @click="buy(item)">{{ pendingId === item.id ? 'Оформляем…' : item.available ? (item.consumable ? 'Купить' : 'Арендовать') : 'Недоступно' }}</button></footer>
        </article>
      </div>

      <div v-else class="haul-layout">
        <section class="haul-info">
          <small>Открывается с 6 уровня</small>
          <h2>Циклическая развозка породы</h2>
          <p>Загрузитесь из общего склада у точки сбыта, получите случайный склад из системы дальнобоя, разгрузите породу и возвращайтесь за следующим рейсом. Аренда длится один час активной смены.</p>
          <ol><li>Арендуйте транспорт с подходящей CDL.</li><li>Остановитесь в маркере загрузки и нажмите E.</li><li>Доставьте груз без телепортов и вернитесь за новым.</li></ol>
        </section>
        <div class="vehicles">
          <article v-for="vehicle in props.payload?.vehicles ?? []" :key="vehicle.id" :class="{ locked: !vehicle.available && !vehicle.current, current: vehicle.current }">
            <span class="vehicle-icon"><Truck /></span>
            <div><small>{{ vehicle.type === 'truck' ? 'Тягач с прицепом' : 'Карьерный фургон' }}</small><h3>{{ vehicle.name }}</h3><p>Уровень {{ vehicle.minLevel }} · {{ vehicle.license === 'cdl_a' ? 'CDL A' : 'CDL B' }} · {{ vehicle.durationMinutes }} минут</p></div>
            <div v-if="vehicle.current && vehicleRemaining(vehicle)" class="active-time"><Clock3 /> Осталось {{ vehicleRemaining(vehicle) }}</div>
            <div v-else-if="vehicle.reasons.length" class="reason"><LockKeyhole /> {{ vehicle.reasons.join(' · ') }}</div>
            <footer><strong>{{ vehicle.current ? 'Текущая аренда' : money(vehicle.price) }}</strong><button type="button" :disabled="!canUseVehicle(vehicle) || !!pendingId" @click="rent(vehicle)">{{ pendingId === vehicle.id ? 'Выдаём…' : vehicle.current ? 'Восстановить' : 'Арендовать' }}</button></footer>
          </article>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.page{position:fixed;inset:0;display:grid;place-items:center;color:#edf5f1;background:radial-gradient(circle at 18% 0,#cca43b24,transparent 32%),#050805e8;font-family:"SF Pro Display","Segoe UI",sans-serif}.shell{width:min(118vh,94vw);height:min(78vh,92vh);overflow:hidden;border:.1vh solid #e7bb4c4a;border-radius:1.8vh;background:linear-gradient(145deg,#172019,#0d130f 58%,#11170f);box-shadow:0 4vh 12vh #000c}.shell>header{height:9.5vh;display:flex;align-items:center;gap:1.2vh;padding:0 2.2vh;border-bottom:.1vh solid #ffffff14}.logo{width:4.8vh;height:4.8vh;display:grid;place-items:center;border-radius:1.2vh;color:#171006;background:linear-gradient(145deg,#f1ca63,#da8f2d)}svg{width:2vh}.title small,.title h1{display:block;margin:0}.title small{color:#e7b94d;font-size:.9vh;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.title h1{margin-top:.25vh;font-size:2.1vh}.profile{display:grid;grid-template-columns:auto auto;align-items:center;gap:.2vh .7vh;margin-left:auto;padding:.7vh 1vh;border:.1vh solid #ffffff14;border-radius:.9vh;background:#ffffff07}.profile b{grid-row:1/3;color:#f2c861;font-size:1.3vh}.profile span{font-size:1vh}.profile em{color:#758878;font-size:.85vh;font-style:normal}.close{width:3.8vh;height:3.8vh;display:grid;place-items:center;border:.1vh solid #ffffff18;border-radius:.8vh;color:#aebbb0;background:#ffffff08}.stats{height:7vh;display:grid;grid-template-columns:repeat(4,1fr);gap:1vh;padding:1vh 2.2vh;box-sizing:border-box;border-bottom:.1vh solid #ffffff10}.stats span{display:grid;grid-template-columns:auto 1fr;gap:.1vh .65vh;align-content:center;padding:.65vh;border-radius:.7vh;background:#ffffff06}.stats svg{grid-row:1/3;color:#e4b94f}.stats small{color:#718173;font-size:.8vh}.stats b{font-size:1.05vh}.shell>nav{height:5.5vh;display:flex;align-items:end;gap:.5vh;padding:0 2.2vh;border-bottom:.1vh solid #ffffff12}.shell>nav button{height:4.4vh;display:flex;align-items:center;gap:.55vh;padding:0 1.5vh;border:0;border-bottom:.25vh solid transparent;color:#708073;background:transparent;font-weight:850}.shell>nav button.active{border-color:#e5b94e;color:#f4f7f1}.grid{height:calc(100% - 22vh);display:grid;grid-template-columns:repeat(2,1fr);gap:1.1vh;overflow:auto;padding:1.5vh 2.2vh 2.2vh;box-sizing:border-box}.grid article,.vehicles article{position:relative;padding:1.4vh;border:.1vh solid #ffffff14;border-radius:1.1vh;background:linear-gradient(145deg,#ffffff08,#ffffff04)}.grid article.active{border-color:#62e2a44d;background:#42d88e0e}.grid article.locked,.vehicles article.locked{opacity:.58}.item-icon,.vehicle-icon{width:4vh;height:4vh;display:grid;place-items:center;float:right;border-radius:1vh;color:#eac151;background:#e4b64b12}.grid article>small,.haul-info>small,.vehicles small{color:#e8bb50;font-size:.82vh;font-weight:850;text-transform:uppercase}.grid h2{margin:.4vh 0;font-size:1.55vh}.grid p,.haul-info p,.vehicles p{color:#7f9081;font-size:.95vh;line-height:1.45}.terms,.active-time,.reason{display:flex;align-items:center;gap:.45vh;margin-top:.8vh;padding:.65vh .75vh;border-radius:.65vh;background:#ffffff07;color:#8fa092;font-size:.9vh}.active-time{color:#72e2a8;background:#48db9410}.reason{color:#ffad8a;background:#ff774914}.terms svg,.active-time svg,.reason svg{width:1.25vh}.grid footer,.vehicles footer{display:flex;align-items:center;justify-content:space-between;margin-top:1vh}.grid footer strong,.vehicles footer strong{color:#eac359;font-size:1.45vh}.grid footer button,.vehicles footer button{min-width:13vh;height:3.5vh;border:0;border-radius:.7vh;color:#171106;background:linear-gradient(90deg,#e7b849,#f1d37b);font-weight:900}.grid footer button:disabled,.vehicles footer button:disabled{color:#788278;background:#ffffff0c}.haul-layout{height:calc(100% - 22vh);display:grid;grid-template-columns:35% 65%;overflow:hidden}.haul-info{padding:2.2vh;border-right:.1vh solid #ffffff12;background:radial-gradient(circle at 30% 15%,#d7aa3c18,transparent 40%)}.haul-info h2{margin:.5vh 0;font-size:2.2vh}.haul-info p{font-size:1.05vh}.haul-info ol{margin:1.8vh 0;padding-left:1.5vh;color:#9bab9c;font-size:1vh;line-height:1.8}.vehicles{overflow:auto;padding:1.5vh 2.2vh}.vehicles article{display:grid;grid-template-columns:auto 1fr;gap:.8vh;margin-bottom:1vh}.vehicles h3{margin:.25vh 0;font-size:1.4vh}.vehicles p{margin:0}.vehicles .reason,.vehicles footer{grid-column:1/3}.vehicles article.current{border-color:#61e1a24f}.vehicles footer button{min-width:15vh}button{font:inherit;cursor:pointer}button:disabled{cursor:not-allowed}::-webkit-scrollbar{width:.45vh}::-webkit-scrollbar-thumb{border-radius:1vh;background:#ffffff25}
</style>
