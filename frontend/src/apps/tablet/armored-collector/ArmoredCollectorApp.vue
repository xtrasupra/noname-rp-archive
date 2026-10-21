<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  Banknote,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Gauge,
  LoaderCircle,
  MapPin,
  Navigation,
  PackageCheck,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Truck,
  X,
} from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import {
  canSelectArmoredCollectorRoute,
  getArmoredCollectorLevelProgress,
  getArmoredCollectorRefreshSeconds,
  type ArmoredCollectorRoute,
  type ArmoredCollectorCancelRouteRequest,
  type ArmoredCollectorRouteStage,
  type ArmoredCollectorSelectRouteRequest,
  type ArmoredCollectorTabletPayload,
} from '@/shared/contracts/armored-collector'

const props = defineProps<{
  payload?: ArmoredCollectorTabletPayload | null
}>()

const emit = defineEmits<{
  close: []
}>()

const now = ref(Date.now())
const nowAtLastPayload = ref(Date.now())
const selectedRouteId = ref<string | null>(null)
const cancelRouteConfirmation = ref(false)
const lastAutoRefreshDeadline = ref<number | null>(null)
let clock: ReturnType<typeof setInterval> | null = null

const profile = computed(() => props.payload?.profile)
const activeRoute = computed(() => props.payload?.activeRoute ?? null)
const selectedRoute = computed(() =>
  props.payload?.routes.find((route) => route.routeId === selectedRouteId.value) ?? null,
)
const levelProgress = computed(() => getArmoredCollectorLevelProgress(profile.value))
const levelPayScale = computed(() => props.payload?.levelPayScale ?? [])
const refreshSeconds = computed(() => getArmoredCollectorRefreshSeconds(props.payload, now.value, nowAtLastPayload.value))
const isLoading = computed(() => props.payload?.status === 'loading')
const errorMessage = computed(() =>
  props.payload?.status === 'error'
    ? props.payload.errorMessage || 'Не удалось получить маршруты. Попробуйте ещё раз.'
    : props.payload?.request.errorMessage
      ? props.payload.request.errorMessage
      : null,
)

const activeStageLabel = computed(() => stageLabel(activeRoute.value?.stage, activeRoute.value?.phase))
const activeBonusSeconds = computed(() => {
  const selectedAt = Number(activeRoute.value?.selectedAt)
  const targetSeconds = Number(activeRoute.value?.targetSeconds)
  const serverNow = Number(props.payload?.serverNow)
  if (!Number.isFinite(selectedAt) || !Number.isFinite(targetSeconds) || !Number.isFinite(serverNow)) return 0
  const deadlineAt = selectedAt + targetSeconds * 1000
  return Math.max(0, Math.ceil((deadlineAt - (now.value + serverNow - nowAtLastPayload.value)) / 1000))
})

watch([() => props.payload?.serverNow, () => props.payload?.revision], () => {
  nowAtLastPayload.value = Date.now()
}, { immediate: true })

watch(() => props.payload?.revision, () => {
  lastAutoRefreshDeadline.value = null
  if (selectedRouteId.value && !selectedRoute.value) selectedRouteId.value = null
})

watch(() => props.payload?.activeRoute?.routeId, (activeRouteId) => {
  if (activeRouteId) selectedRouteId.value = null
  else cancelRouteConfirmation.value = false
})

function formatMoney(value: number) {
  return `$${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')}`
}

function formatLevelBonus() {
  const bonus = profile.value?.levelBonus
  if (!bonus) return formatMoney(0)
  return bonus.kind === 'percent'
    ? `${Math.max(0, Number(bonus.amount) || 0).toLocaleString('ru-RU')}%`
    : formatMoney(bonus.amount)
}

function formatDistance(value: number) {
  const distance = Math.max(0, Number(value) || 0)
  if (distance < 1000) return `${Math.round(distance)} м`
  return `${(distance / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`
}

function formatDuration(value: number) {
  const minutes = Math.max(1, Math.round((Number(value) || 0) / 60))
  return `${minutes} мин.`
}

function formatCountdown(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function stageLabel(stage?: ArmoredCollectorRouteStage, phase?: 'pickup' | 'unload') {
  if (stage === 'to_pickup') return 'Следуйте к точке сбора'
  if (stage === 'collecting') return 'Заберите денежные мешки'
  if (stage === 'loading_vehicle') return 'Загрузите мешки в броневик'
  if (stage === 'to_dropoff' || stage === 'to_unload') return 'Следуйте на разгрузку'
  if (stage === 'unloading') return 'Разгрузите броневик'
  return phase === 'pickup' ? 'Заберите и загрузите мешки' : 'Доставьте и разгрузите мешки'
}

function requestRoutes() {
  if (isLoading.value) return
  callClientEvent('tablet:armoredCollector:requestFromBrowser')
}

function openConfirmation(route: ArmoredCollectorRoute) {
  if (!canSelectArmoredCollectorRoute(props.payload, route)) return
  selectedRouteId.value = route.routeId
}

function confirmRoute() {
  const route = selectedRoute.value
  const payload = props.payload
  if (!route || !payload || !canSelectArmoredCollectorRoute(payload, route)) return

  const request: ArmoredCollectorSelectRouteRequest = {
    routeId: route.routeId,
    revision: payload.revision,
  }
  callClientEvent('tablet:armoredCollector:selectRouteFromBrowser', JSON.stringify(request))
}

function restoreRoute() {
  callClientEvent('tablet:armoredCollector:restoreRouteFromBrowser')
}

function confirmCancelRoute() {
  const route = activeRoute.value
  if (!route) return
  const request: ArmoredCollectorCancelRouteRequest = { routeId: route.routeId, runId: route.runId }
  cancelRouteConfirmation.value = false
  callClientEvent('tablet:armoredCollector:cancelRouteFromBrowser', JSON.stringify(request))
}

onMounted(() => {
  clock = setInterval(() => {
    const previous = refreshSeconds.value
    now.value = Date.now()

    if (
      previous > 0
      && refreshSeconds.value === 0
      && lastAutoRefreshDeadline.value !== props.payload?.nextRefreshAt
    ) {
      lastAutoRefreshDeadline.value = Number(props.payload?.nextRefreshAt) || Date.now()
      requestRoutes()
    }
  }, 1000)
})

onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
})
</script>

<template>
  <section class="collector-app">
    <header class="collector-header">
      <button class="icon-button" type="button" aria-label="Назад" @click="emit('close')">
        <ArrowLeft />
      </button>
      <div class="brand">
        <span class="brand__icon"><ShieldCheck /></span>
        <div>
          <strong>Gruppe Sechs</strong>
          <small>Инкассационная служба</small>
        </div>
      </div>
      <div class="refresh">
        <Clock3 />
        <span>Обновление через <b>{{ formatCountdown(refreshSeconds) }}</b></span>
        <button type="button" aria-label="Обновить маршруты" :disabled="isLoading" @click="requestRoutes">
          <RefreshCw :class="{ spinning: isLoading }" />
        </button>
      </div>
    </header>

    <div class="dashboard">
      <article>
        <span>Уровень {{ profile?.level ?? 1 }}</span>
        <strong>Надбавка +{{ profile?.levelPayPercent ?? 0 }}%</strong>
        <div class="progress"><i :style="{ width: `${levelProgress}%` }"></i></div>
        <small>
          {{ (profile?.currentLevelXp ?? 0).toLocaleString('ru-RU') }} XP
          <template v-if="profile?.nextLevelXp !== null"> / {{ (profile?.nextLevelXp ?? 0).toLocaleString('ru-RU') }}</template>
        </small>
      </article>

      <article class="bonus-card" :class="{ unlocked: profile?.levelBonus.unlocked }">
        <span>Постоянная надбавка</span>
        <strong>{{ formatLevelBonus() }} / маршрут</strong>
        <small v-if="profile?.levelBonus.unlocked"><CheckCircle2 /> Активна на всех маршрутах</small>
        <small v-else><Sparkles /> Откроется на {{ profile?.levelBonus.unlockLevel ?? 10 }} уровне</small>
      </article>

      <article>
        <span>Текущая смена</span>
        <strong>{{ props.payload?.shift.vehicleLabel || 'Броневик' }}</strong>
        <small>{{ profile?.completedRoutes ?? 0 }} рейсов · {{ formatMoney(profile?.totalEarned ?? 0) }} заработано</small>
      </article>

      <article v-if="activeRoute" class="active-card">
        <span>Активный маршрут</span>
        <strong>{{ activeRoute.title }}</strong>
        <small>{{ activeStageLabel }} · {{ activeRoute.point.label }} · {{ formatDistance(activeRoute.distanceM) }}</small>
        <small>Мешки {{ activeRoute.bagsLoaded }}/{{ activeRoute.bags }} · целевое время {{ formatCountdown(activeBonusSeconds) }}</small>
        <div class="active-card__actions">
          <button type="button" @click="restoreRoute"><Navigation /> GPS</button>
          <button class="danger" type="button" @click="cancelRouteConfirmation = true"><X /> Отменить</button>
        </div>
      </article>
    </div>

    <div class="level-scale" aria-label="Надбавки за уровни инкассатора">
      <span
        v-for="tier in levelPayScale"
        :key="tier.level"
        :class="{ current: tier.level === (profile?.level ?? 1), unlocked: tier.level <= (profile?.level ?? 1) }"
      >
        <b>{{ tier.level }} ур.</b>
        <small>+{{ tier.percent }}%<template v-if="tier.flatBonus"> · +{{ formatMoney(tier.flatBonus) }}</template></small>
      </span>
    </div>

    <div class="board-title">
      <div>
        <span>Диспетчерская</span>
        <h2>Доступные маршруты</h2>
      </div>
      <p><i></i> Список формирует сервер каждые 5 минут</p>
    </div>

    <main class="routes">
      <div v-if="errorMessage" class="state-card state-card--error">
        <TriangleAlert />
        <div><strong>Ошибка диспетчерской</strong><span>{{ errorMessage }}</span></div>
        <button type="button" @click="requestRoutes"><RefreshCw /> Повторить</button>
      </div>

      <div v-else-if="isLoading || !props.payload" class="state-card state-card--loading">
        <LoaderCircle class="spinning" />
        <div><strong>Получаем маршруты</strong><span>Связываемся с диспетчерской…</span></div>
      </div>

      <div v-else-if="activeRoute" class="state-card state-card--active">
        <Route />
        <div><strong>Маршрут уже выбран</strong><span>Завершите текущую инкассацию, чтобы взять следующую.</span></div>
        <button type="button" @click="restoreRoute"><Navigation /> Показать цель</button>
      </div>

      <div v-else-if="!props.payload.routes.length" class="state-card">
        <BriefcaseBusiness />
        <div><strong>Свободных маршрутов пока нет</strong><span>Список обновится автоматически.</span></div>
      </div>

      <div v-else class="route-grid">
        <article
          v-for="route in props.payload.routes"
          :key="route.routeId"
          class="route-card"
          :class="{ disabled: !canSelectArmoredCollectorRoute(props.payload, route) }"
        >
          <header>
            <span><ShieldCheck /> {{ route.title }}</span>
            <strong>{{ formatMoney(route.maxPayout) }}</strong>
          </header>

          <div class="route-line">
            <span class="route-dot route-dot--pickup"></span>
            <div><small>Забрать</small><b>{{ route.pickup.label }}</b><em>{{ route.pickup.address }}</em></div>
          </div>
          <div class="route-line">
            <span class="route-dot route-dot--dropoff"></span>
            <div><small>Доставить</small><b>{{ route.unload.label }}</b><em>{{ route.unload.address }}</em></div>
          </div>

          <div class="metrics">
            <span><MapPin /> {{ formatDistance(route.distanceToPickupM) }} до точки</span>
            <span><Route /> {{ formatDistance(route.routeDistanceM) }}</span>
            <span><PackageCheck /> {{ route.bags }} меш.</span>
            <span><Clock3 /> ~{{ formatDuration(route.targetSeconds) }}</span>
          </div>

          <div class="payout">
            <span><Banknote /> База <b>{{ formatMoney(route.basePay) }}</b></span>
            <span><Gauge /> За скорость <b>+{{ formatMoney(route.speedBonus) }}</b></span>
            <span v-if="route.levelBonus"><Sparkles /> Уровень <b>+{{ formatMoney(route.levelBonus) }}</b></span>
            <span v-if="route.veteranBonus"><Sparkles /> Стаж <b>+{{ formatMoney(route.veteranBonus) }}</b></span>
          </div>

          <p v-if="route.disabledReasons?.length" class="route-error">{{ route.disabledReasons.join(' · ') }}</p>
          <button
            type="button"
            :disabled="!canSelectArmoredCollectorRoute(props.payload, route)"
            @click="openConfirmation(route)"
          >
            {{ route.canSelect !== false ? 'Выбрать маршрут' : 'Недоступно' }}
          </button>
        </article>
      </div>
    </main>

    <div v-if="selectedRoute" class="modal" @click.self="selectedRouteId = null">
      <section>
        <button class="modal__close" type="button" aria-label="Закрыть" @click="selectedRouteId = null"><X /></button>
        <ShieldCheck class="modal__hero" />
        <span>Подтверждение маршрута</span>
        <h2>{{ selectedRoute.title }}</h2>
        <p>{{ selectedRoute.pickup.label }} → {{ selectedRoute.unload.label }}</p>
        <dl>
          <div><dt>Расстояние</dt><dd>{{ formatDistance(selectedRoute.routeDistanceM) }}</dd></div>
          <div><dt>Мешки</dt><dd>{{ selectedRoute.bags }}</dd></div>
          <div><dt>База</dt><dd>{{ formatMoney(selectedRoute.basePay) }}</dd></div>
          <div><dt>Максимум</dt><dd>{{ formatMoney(selectedRoute.maxPayout) }}</dd></div>
        </dl>
        <p class="modal__hint">Итоговую выплату и скоростную премию рассчитает сервер после разгрузки.</p>
        <p v-if="props.payload?.request.errorMessage" class="modal__error">
          {{ props.payload.request.errorMessage }}
        </p>
        <button
          class="modal__action"
          type="button"
          :disabled="props.payload?.request.pending"
          @click="confirmRoute"
        >
          <LoaderCircle v-if="props.payload?.request.pending" class="spinning" />
          <Truck v-else />
          {{ props.payload?.request.pending ? 'Назначаем маршрут…' : 'Подтвердить маршрут' }}
        </button>
      </section>
    </div>

    <div v-if="cancelRouteConfirmation && activeRoute" class="modal" @click.self="cancelRouteConfirmation = false">
      <section>
        <button class="modal__close" type="button" aria-label="Закрыть" @click="cancelRouteConfirmation = false"><X /></button>
        <TriangleAlert class="modal__hero modal__hero--danger" />
        <span>Отмена маршрута</span>
        <h2>{{ activeRoute.title }}</h2>
        <p>Маршрут станет недоступен до следующего обновления списка.</p>
        <dl>
          <div><dt>Загружено</dt><dd>{{ activeRoute.bagsLoaded }}/{{ activeRoute.bags }}</dd></div>
          <div><dt>Штраф</dt><dd class="danger-text">{{ formatMoney(activeRoute.cancelFee) }}</dd></div>
        </dl>
        <p class="modal__hint">Списание и отмена выполняются сервером один раз.</p>
        <button class="modal__action modal__action--danger" type="button" @click="confirmCancelRoute">
          <X /> Отменить и списать штраф
        </button>
      </section>
    </div>
  </section>
</template>

<style scoped lang="scss">
.collector-app { position: relative; height: 100%; overflow: hidden; color: #f5f7ed; background: radial-gradient(circle at 88% 0, #5d7d2c45, transparent 32%), linear-gradient(145deg, #0a100b, #111b13 58%, #080d09); font-family: "SF Pro Display", "Segoe UI", sans-serif; }
button { cursor: pointer; font: inherit; }
button:disabled { cursor: not-allowed; }
.collector-header { height: 8.5%; display: flex; align-items: center; gap: 1.2vh; padding: 0 2.2vh; box-sizing: border-box; border-bottom: .1vh solid #ffffff14; background: #080d09d9; }
.icon-button, .refresh button { width: 3.6vh; height: 3.6vh; display: grid; place-items: center; border: .1vh solid #ffffff1f; border-radius: 1vh; color: #effbdc; background: #ffffff0a; svg { width: 1.8vh; } }
.brand { display: flex; align-items: center; gap: 1vh; strong, small { display: block; } strong { font-size: 1.65vh; } small { color: #91a584; font-size: 1.02vh; text-transform: uppercase; letter-spacing: .13em; } }
.brand__icon { width: 3.8vh; height: 3.8vh; display: grid; place-items: center; border-radius: 1.1vh; color: #11180d; background: linear-gradient(135deg, #e0f467, #80bd48); box-shadow: 0 0 2vh #9ed9502b; svg { width: 2.2vh; } }
.refresh { margin-left: auto; display: flex; align-items: center; gap: .7vh; color: #91a584; font-size: 1.1vh; svg { width: 1.5vh; } b { color: #dff56e; } button:disabled { opacity: .55; } }
.dashboard { height: 14.5%; display: grid; grid-template-columns: 1fr 1.15fr 1.1fr 1.35fr; gap: 1vh; padding: 1.2vh 2.2vh; box-sizing: border-box; article { min-width: 0; padding: .8vh 1.1vh; border: .1vh solid #ffffff12; border-radius: 1.05vh; background: #ffffff08; } span, strong, small { display: block; } > article > span { color: #879b7a; font-size: .95vh; text-transform: uppercase; letter-spacing: .08em; } strong { margin: .32vh 0; overflow: hidden; font-size: 1.4vh; text-overflow: ellipsis; white-space: nowrap; } small { color: #829276; font-size: .92vh; } }
.progress { height: .34vh; margin: .45vh 0; overflow: hidden; border-radius: 2vh; background: #ffffff12; i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #accb43, #e4f66c); box-shadow: 0 0 .8vh #cae65666; } }
.bonus-card { border-color: #ffffff12 !important; strong { color: #a0ad91; } small { display: flex; align-items: center; gap: .35vh; svg { width: 1.05vh; } } &.unlocked { border-color: #dff26042 !important; background: #d1ed4710 !important; strong { color: #e5f870; } small { color: #b8d25c; } } }
.active-card { position: relative; padding-right: 8.3vh !important; border-color: #acd44d48 !important; background: #9bc44012 !important; }
.active-card__actions { position: absolute; top: 50%; right: .7vh; display: grid; gap: .35vh; transform: translateY(-50%); button { height: 2.35vh; display: flex; align-items: center; justify-content: center; gap: .25vh; padding: 0 .5vh; border: .1vh solid #cfeb5b44; border-radius: .48vh; color: #e5f58f; background: #cae94b13; font-size: .7vh; font-weight: 800; svg { width: .9vh; } &.danger { border-color: #ff78523d; color: #ff9a82; background: #ff623c10; } } }
.board-title { height: 7.5%; display: flex; align-items: center; justify-content: space-between; padding: 0 2.2vh; box-sizing: border-box; border-top: .1vh solid #ffffff0d; border-bottom: .1vh solid #ffffff10; div span { color: #b8d653; font-size: .82vh; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; } h2 { margin: .25vh 0 0; font-size: 1.55vh; } p { display: flex; align-items: center; gap: .5vh; color: #788b6c; font-size: .95vh; } p i { width: .62vh; height: .62vh; border-radius: 50%; background: #b9db52; box-shadow: 0 0 1vh #b9db52; } }
.level-scale { height: 6%; display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: .4vh; padding: .35vh 2.2vh .7vh; box-sizing: border-box; border-top: .1vh solid #ffffff0a; background: #080d0966; > span { min-width: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; border: .1vh solid #ffffff10; border-radius: .55vh; color: #66715f; background: #ffffff04; } b { font-size: .78vh; } small { max-width: 100%; overflow: hidden; font-size: .67vh; text-overflow: ellipsis; white-space: nowrap; } .unlocked { color: #adbf76; border-color: #b7d55324; background: #b7d55308; } .current { color: #efff9c; border-color: #d9f4666b; background: #cdea4c18; box-shadow: 0 0 1vh #badf4b1d; } }
.routes { height: 63.5%; overflow: auto; padding: 1.4vh 2.2vh 2.2vh; box-sizing: border-box; }
.route-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1vh; padding-bottom: 1vh; }
.route-card { min-width: 0; padding: 1.15vh; border: .1vh solid #ffffff14; border-radius: 1.1vh; background: linear-gradient(150deg, #172119e8, #0c140de8); box-shadow: 0 .8vh 2vh #0002; &.disabled { opacity: .62; } > header { display: flex; align-items: center; justify-content: space-between; span { display: flex; align-items: center; gap: .4vh; color: #bcd65a; font-size: .95vh; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; svg { width: 1.2vh; } } strong { color: #e4f86f; font-size: 1.35vh; } } > button { width: 100%; height: 3.1vh; margin-top: .75vh; border: .1vh solid #cde95755; border-radius: .7vh; color: #11180d; background: linear-gradient(90deg, #b9da4c, #e4f475); font-size: 1.02vh; font-weight: 900; &:disabled { border-color: #ffffff12; color: #829077; background: #ffffff08; } } }
.route-line { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .65vh; margin-top: .72vh; div { min-width: 0; } small, b, em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } small { color: #75886b; font-size: .75vh; text-transform: uppercase; } b { margin: .08vh 0; font-size: 1.03vh; } em { color: #819075; font-size: .82vh; font-style: normal; } }
.route-dot { position: relative; width: .75vh; height: .75vh; margin-top: .45vh; border: .16vh solid #bee04e; border-radius: 50%; box-sizing: border-box; &::after { content: ""; position: absolute; top: .75vh; left: 50%; width: .12vh; height: 2.8vh; background: #ffffff15; transform: translateX(-50%); } &--dropoff { border-color: #f0f5de; &::after { display: none; } } }
.metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .4vh; margin-top: .85vh; padding: .65vh; border-radius: .65vh; background: #ffffff06; span { display: flex; align-items: center; gap: .35vh; color: #98a98d; font-size: .85vh; } svg { width: 1.05vh; } }
.payout { display: flex; flex-wrap: wrap; gap: .4vh .8vh; margin-top: .65vh; span { display: flex; align-items: center; gap: .25vh; color: #87977c; font-size: .8vh; } svg { width: .95vh; } b { color: #cfe766; } }
.route-error { min-height: 1.8vh; margin: .55vh 0 0; padding: .35vh .5vh; border-radius: .45vh; color: #ffb1a5; background: #ff5f4412; font-size: .8vh; }
.state-card { min-height: 12vh; display: flex; align-items: center; gap: 1.2vh; padding: 2vh; border: .1vh solid #ffffff13; border-radius: 1.2vh; color: #a8b69f; background: #ffffff06; svg { width: 3vh; flex: 0 0 auto; } strong, span { display: block; } strong { color: #eff5e9; font-size: 1.25vh; } span { margin-top: .3vh; font-size: .95vh; } button { margin-left: auto; height: 3.2vh; display: flex; align-items: center; gap: .4vh; padding: 0 .9vh; border: .1vh solid #d8ed6544; border-radius: .65vh; color: #e2f47a; background: #d3ed5310; font-size: .9vh; font-weight: 800; svg { width: 1.1vh; } } &--error { border-color: #ff725032; color: #ff967f; } &--active { border-color: #d8ee5b36; color: #dff16f; } }
.modal { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: #020502c7; backdrop-filter: blur(.5vh); > section { position: relative; width: 39vh; padding: 2vh; box-sizing: border-box; border: .1vh solid #d7ec5f3d; border-radius: 1.35vh; text-align: center; background: linear-gradient(150deg, #19231a, #0a100b); box-shadow: 0 2vh 6vh #000a; > span { color: #bedc50; font-size: .9vh; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; } h2 { margin: .5vh 0; font-size: 1.7vh; } > p { color: #91a086; font-size: 1vh; } } }
.modal__close { position: absolute; top: 1vh; right: 1vh; width: 2.8vh; height: 2.8vh; display: grid; place-items: center; border: 0; border-radius: .6vh; color: #aebba4; background: #ffffff0a; svg { width: 1.3vh; } }
.modal__hero { width: 3.5vh; height: 3.5vh; margin: 0 auto 1vh; color: #d7ed64; }
.modal__hero--danger, .danger-text { color: #ff8f74 !important; }
.modal dl { display: grid; grid-template-columns: repeat(2, 1fr); gap: .55vh; margin: 1.1vh 0; div { display: flex; justify-content: space-between; padding: .65vh; border-radius: .55vh; background: #ffffff07; font-size: .9vh; } dt { color: #829078; } dd { margin: 0; color: #dff16d; font-weight: 800; } }
.modal__hint { margin: .8vh 0 !important; color: #77856e !important; font-size: .82vh !important; }
.modal__error { margin: .8vh 0 !important; padding: .55vh; border-radius: .5vh; color: #ffad98 !important; background: #ff604412; font-size: .84vh !important; }
.modal__action { width: 100%; height: 3.7vh; display: flex; align-items: center; justify-content: center; gap: .45vh; border: 0; border-radius: .72vh; color: #11180d; background: linear-gradient(90deg, #b9da4c, #e5f579); font-size: 1.02vh; font-weight: 900; svg { width: 1.35vh; } &:disabled { color: #89927e; background: #ffffff0c; } }
.modal__action--danger { color: #fff5f1; background: linear-gradient(90deg, #c94d35, #ef765a); }
.spinning { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
::-webkit-scrollbar { width: .45vh; } ::-webkit-scrollbar-thumb { border-radius: 1vh; background: #ffffff1f; }
</style>
