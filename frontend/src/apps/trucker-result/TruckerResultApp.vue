<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import {
  Award,
  Banknote,
  Clock3,
  Fuel,
  PackageCheck,
  Route,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

const props = defineProps<{
  payload?: InterfacePayloadMap['truckerResult']
}>()

function close() {
  callClientEvent('truckerResult:closeFromBrowser')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' || event.key === 'Enter') close()
}

function money(value?: number) {
  return `$${Math.round(Number(value || 0)).toLocaleString('ru-RU')}`
}

function distance(value?: number) {
  return `${(Number(value || 0) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`
}

function duration(value?: number) {
  const total = Math.max(0, Math.round(Number(value || 0)))
  const minutes = Math.floor(total / 60)
  return `${minutes} мин ${total % 60} сек`
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <main class="result-overlay">
    <section class="result-card">
      <button class="close" type="button" aria-label="Закрыть" @click="close"><X /></button>
      <header>
        <span class="success"><PackageCheck /></span>
        <div><small>Cross-State Logistics</small><h1>Заказ доставлен</h1><p>{{ props.payload?.cargo }} · {{ props.payload?.company }}</p></div>
        <strong>{{ money(props.payload?.finalPayout) }}</strong>
      </header>

      <div class="summary">
        <article><Route /><span>Маршрут</span><strong>{{ distance(props.payload?.actualDistanceM) }}</strong><small>План {{ distance(props.payload?.routeDistanceM) }}</small></article>
        <article><Clock3 /><span>Время в пути</span><strong>{{ duration(props.payload?.durationSeconds) }}</strong><small v-if="props.payload?.earlySeconds">На {{ duration(props.payload.earlySeconds) }} раньше</small><small v-else-if="props.payload?.lateSeconds" class="negative">Опоздание {{ duration(props.payload.lateSeconds) }}</small><small v-else>Точно в срок</small></article>
        <article><ShieldCheck /><span>Сохранность</span><strong>{{ Math.round(props.payload?.cargoValidity ?? 100) }}%</strong><small>{{ Number(props.payload?.weightKg || 0).toLocaleString('ru-RU') }} кг</small></article>
        <article><Fuel /><span>Топливо</span><strong>{{ Number(props.payload?.fuelUsed || 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) }} л</strong><small>Фактический расход</small></article>
      </div>

      <div class="settlement">
        <div><span><Banknote /> Базовая ставка</span><strong>{{ money(props.payload?.basePay) }}</strong></div>
        <div class="positive"><span><Sparkles /> За скорость</span><strong>+ {{ money(props.payload?.earlyBonus) }}</strong></div>
        <div class="positive"><span><Star /> Бонус навыков</span><strong>+ {{ money(props.payload?.skillBonus) }}</strong></div>
        <div v-if="props.payload?.damagePenalty" class="negative"><span>Штраф за повреждения</span><strong>− {{ money(props.payload.damagePenalty) }}</strong></div>
        <div v-if="props.payload?.latePenalty" class="negative"><span>Штраф за опоздание</span><strong>− {{ money(props.payload.latePenalty) }}</strong></div>
        <div class="total"><span>Итого</span><strong>{{ money(props.payload?.finalPayout) }}</strong></div>
      </div>

      <footer>
        <div><TrendingUp /><span>Опыт</span><strong>+{{ props.payload?.xpEarned ?? 0 }} XP</strong></div>
        <div><Star /><span>Прогресс умения</span><strong>+{{ props.payload?.skillProgressEarned ?? 0 }}</strong></div>
        <div v-if="props.payload?.skillPointsEarned"><Award /><span>Новые очки</span><strong>+{{ props.payload.skillPointsEarned }}</strong></div>
        <div v-if="(props.payload?.newRank ?? 0) > (props.payload?.oldRank ?? 0)" class="rank-up"><Award /><span>Новый ранг</span><strong>{{ props.payload?.newRank }}</strong></div>
        <button type="button" @click="close">Продолжить <small>ENTER</small></button>
      </footer>
    </section>
  </main>
</template>

<style scoped lang="scss">
.result-overlay { position: fixed; inset: 0; display: grid; place-items: center; color: #eef8ff; background: radial-gradient(circle at center, #092334b8, #02070ce8 62%); backdrop-filter: blur(.65vh); font-family: "SF Pro Display", "Segoe UI", sans-serif; pointer-events: auto; }
.result-card { position: relative; width: min(82vh, 74vw); padding: 2.2vh; box-sizing: border-box; overflow: hidden; border: .1vh solid #5de7ff55; border-radius: 1.8vh; background: radial-gradient(circle at 12% 0, #2bd5ff21, transparent 28%), linear-gradient(145deg, #102431fa, #07131dfa); box-shadow: 0 4vh 12vh #000b, inset 0 0 0 .1vh #ffffff08; }
.close { position: absolute; top: 1.3vh; right: 1.3vh; width: 3.2vh; height: 3.2vh; display: grid; place-items: center; z-index: 2; border: .1vh solid #ffffff1c; border-radius: .8vh; color: #8da5b7; background: #ffffff09; cursor: pointer; svg { width: 1.5vh; } }
header { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 1.3vh; padding-bottom: 1.6vh; border-bottom: .1vh solid #ffffff13; .success { width: 5.3vh; height: 5.3vh; display: grid; place-items: center; border-radius: 50%; color: #07151b; background: linear-gradient(145deg, #5af2bd, #32cfff); box-shadow: 0 0 2.5vh #3fddc14d; svg { width: 2.8vh; } } small { color: #4fdfff; font-size: 1vh; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; } h1 { margin: .25vh 0; font-size: 2.6vh; } p { margin: 0; color: #8099ac; font-size: 1.15vh; } > strong { margin-right: 3.8vh; color: #6af1b9; font-size: 2.8vh; } }
.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1vh; margin: 1.4vh 0; article { position: relative; padding: 1.2vh; border: .1vh solid #ffffff13; border-radius: 1vh; background: #ffffff07; > svg { position: absolute; top: 1vh; right: 1vh; width: 1.7vh; color: #50dfff; } span, strong, small { display: block; } span { color: #7e97aa; font-size: 1vh; } strong { margin: .55vh 0 .25vh; font-size: 1.45vh; } small { color: #6f8799; font-size: .95vh; } } }
.settlement { padding: .5vh 1.2vh; border: .1vh solid #ffffff12; border-radius: 1vh; background: #030a1080; > div { min-height: 3.1vh; display: flex; align-items: center; justify-content: space-between; border-bottom: .1vh solid #ffffff0c; color: #93a9b8; font-size: 1.05vh; span { display: flex; align-items: center; gap: .55vh; } svg { width: 1.35vh; } strong { color: #dce9f2; } &.positive strong { color: #65eeb7; } &.negative strong { color: #ff9488; } &.total { min-height: 4.1vh; border: 0; color: #f1f7fb; font-size: 1.25vh; strong { color: #6af1b9; font-size: 1.75vh; } } } }
.negative { color: #ff8f84 !important; }
footer { display: flex; align-items: stretch; gap: 1vh; margin-top: 1.4vh; > div { min-width: 10vh; padding: .8vh 1vh; border: .1vh solid #ffffff13; border-radius: .8vh; background: #ffffff07; svg { width: 1.45vh; color: #53dfff; } span, strong { display: block; } span { color: #72899b; font-size: .9vh; } strong { margin-top: .2vh; font-size: 1.1vh; } &.rank-up { border-color: #ffe57f48; svg, strong { color: #ffe57f; } } } button { min-width: 17vh; margin-left: auto; border: 0; border-radius: .85vh; color: #07141b; background: linear-gradient(90deg, #51dcff, #64efb8); font-weight: 900; cursor: pointer; small { margin-left: .6vh; opacity: .6; } } }
</style>
