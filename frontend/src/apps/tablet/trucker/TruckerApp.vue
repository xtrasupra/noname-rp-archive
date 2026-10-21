<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock3,
  Gauge,
  LockKeyhole,
  Package,
  RefreshCw,
  Route,
  Scale,
  Star,
  Truck,
  X,
} from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import TwinkleSelect from '@/shared/components/TwinkleSelect.vue'
import type { TruckerOrder, TruckerSkill, TruckerTabletPayload, TruckerVehicleType } from '@/shared/contracts/trucker'

const props = defineProps<{
  payload?: TruckerTabletPayload | null
}>()

const emit = defineEmits<{
  close: []
}>()

type SortMode = 'pay' | 'payPerKm' | 'pickup' | 'route' | 'weight'

const activeTab = ref<'orders' | 'skills'>('orders')
const vehicleType = ref<'all' | TruckerVehicleType>('all')
const cargoKind = ref('all')
const maxPickupKm = ref(20)
const maxRouteKm = ref(25)
const maxWeightKg = ref(30000)
const minPay = ref(0)
const availableOnly = ref(false)
const sortMode = ref<SortMode>('pay')
const selectedOrder = ref<TruckerOrder | null>(null)
const selectedSkillId = ref<string | null>(null)
const showCancelConfirm = ref(false)
const now = ref(Date.now())
const serverClockOffset = ref(0)
let clock: ReturnType<typeof setInterval> | null = null
let skillHoldTimer: ReturnType<typeof setTimeout> | null = null
let skillHoldProgressTimer: ReturnType<typeof setInterval> | null = null
let skillHoldStartedAt = 0
const holdingSkillId = ref<string | null>(null)
const skillHoldProgress = ref(0)
const SKILL_HOLD_MS = 650

const vehicleOptions = [
  { value: 'all', label: 'Все типы' },
  { value: 'pickup', label: 'Пикапы' },
  { value: 'van', label: 'Фургоны' },
  { value: 'truck', label: 'Фуры' },
]
const sortOptions = [
  { value: 'pay', label: 'Сначала дорогие' },
  { value: 'payPerKm', label: 'Выгоднее за км' },
  { value: 'pickup', label: 'Ближе к погрузке' },
  { value: 'route', label: 'Короче маршрут' },
  { value: 'weight', label: 'Легче груз' },
]

const profile = computed(() => props.payload?.profile)
const xpProgress = computed(() => {
  const current = profile.value
  if (!current || current.nextRankXp === null) return 100
  const rankFloor = props.payload?.ranks.find((rank) => rank.rank === current.rank)?.xp ?? 0
  return Math.max(0, Math.min(100, (current.xp - rankFloor) / Math.max(1, current.nextRankXp - rankFloor) * 100))
})
const refreshSeconds = computed(() => Math.max(0, Math.ceil((Number(props.payload?.nextRefreshAt || now.value) - (now.value + serverClockOffset.value)) / 1000)))
const cargoKinds = computed(() => [...new Set((props.payload?.orders ?? []).map((order) => order.cargoKind))])
const cargoOptions = computed(() => [
  { value: 'all', label: 'Любой груз' },
  ...cargoKinds.value.map((kind) => ({ value: kind, label: kindLabel(kind) })),
])
const payPerKm = (order: TruckerOrder) => order.basePay / Math.max(1, order.routeDistanceM / 1000)
const filteredOrders = computed(() => {
  const orders = (props.payload?.orders ?? []).filter((order) => {
    if (vehicleType.value !== 'all' && order.vehicleType !== vehicleType.value) return false
    if (cargoKind.value !== 'all' && order.cargoKind !== cargoKind.value) return false
    if (order.distanceToPickupM > maxPickupKm.value * 1000) return false
    if (order.routeDistanceM > maxRouteKm.value * 1000) return false
    if (order.weightKg > maxWeightKg.value) return false
    if (order.basePay < minPay.value) return false
    if (availableOnly.value && !order.canAccept) return false
    return true
  })

  return [...orders].sort((left, right) => {
    if (sortMode.value === 'payPerKm') return payPerKm(right) - payPerKm(left)
    if (sortMode.value === 'pickup') return left.distanceToPickupM - right.distanceToPickupM
    if (sortMode.value === 'route') return left.routeDistanceM - right.routeDistanceM
    if (sortMode.value === 'weight') return left.weightKg - right.weightKg
    return right.basePay - left.basePay
  })
})
const skillBranches = computed(() => {
  const skills = props.payload?.skills ?? []
  const byId = new Map(skills.map((skill) => [skill.id, skill]))
  const children = new Map<string, TruckerSkill[]>()
  for (const skill of skills) {
    if (!skill.prerequisite || !byId.has(skill.prerequisite)) continue
    if (!children.has(skill.prerequisite)) children.set(skill.prerequisite, [])
    children.get(skill.prerequisite)?.push(skill)
  }
  const walk = (skill: TruckerSkill, depth: number): Array<{ skill: TruckerSkill, depth: number }> => [
    { skill, depth },
    ...(children.get(skill.id) ?? [])
      .sort((left, right) => left.minRank - right.minRank)
      .flatMap((child) => walk(child, depth + 1)),
  ]
  return skills
    .filter((skill) => !skill.prerequisite || !byId.has(skill.prerequisite))
    .sort((left, right) => left.minRank - right.minRank)
    .map((root, index) => ({ id: root.id, number: index + 1, entries: walk(root, 0) }))
})
const selectedSkill = computed(() => props.payload?.skills.find((skill) => skill.id === selectedSkillId.value) ?? null)
const activeStageLabel = computed(() => {
  const stage = props.payload?.activeOrder?.stage
  if (stage === 'to_pickup') return 'Едьте на погрузку'
  if (stage === 'loading') return 'Идёт погрузка'
  if (stage === 'to_dropoff') return 'Едьте на разгрузку'
  if (stage === 'unloading') return 'Идёт разгрузка'
  return ''
})
const activeDeadlineSeconds = computed(() => Math.max(
  0,
  Math.ceil((Number(props.payload?.activeOrder?.deadlineAt || now.value) - (now.value + serverClockOffset.value)) / 1000),
))

watch(() => props.payload?.serverNow, (serverNow) => {
  serverClockOffset.value = Number.isFinite(Number(serverNow)) ? Number(serverNow) - Date.now() : 0
}, { immediate: true })

function formatMoney(value: number) {
  return `$${Math.round(Number(value || 0)).toLocaleString('ru-RU')}`
}

function formatDistance(value: number) {
  return `${(Number(value || 0) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`
}

function formatWeight(value: number) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} кг`
}

function formatCountdown(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function vehicleLabel(type: TruckerVehicleType) {
  return { pickup: 'Пикап', van: 'Фургон', truck: 'Фура' }[type]
}

function kindLabel(kind: string) {
  return {
    standard: 'Обычный',
    valuable: 'Ценный',
    fragile: 'Хрупкий',
    perishable: 'Скоропортящийся',
    hazmat: 'Опасный',
  }[kind] ?? kind
}

function setVehicleType(value: string) {
  if (['all', 'pickup', 'van', 'truck'].includes(value)) vehicleType.value = value as 'all' | TruckerVehicleType
}

function setCargoKind(value: string) {
  cargoKind.value = value
}

function setSortMode(value: string) {
  if (['pay', 'payPerKm', 'pickup', 'route', 'weight'].includes(value)) sortMode.value = value as SortMode
}

function stopSkillHold() {
  if (skillHoldTimer) clearTimeout(skillHoldTimer)
  if (skillHoldProgressTimer) clearInterval(skillHoldProgressTimer)
  skillHoldTimer = null
  skillHoldProgressTimer = null
  holdingSkillId.value = null
  skillHoldProgress.value = 0
}

function startSkillHold(skillId: string) {
  stopSkillHold()
  holdingSkillId.value = skillId
  skillHoldStartedAt = Date.now()
  skillHoldProgressTimer = setInterval(() => {
    skillHoldProgress.value = Math.min(100, (Date.now() - skillHoldStartedAt) / SKILL_HOLD_MS * 100)
  }, 16)
  skillHoldTimer = setTimeout(() => {
    selectedSkillId.value = skillId
    stopSkillHold()
  }, SKILL_HOLD_MS)
}

function requestRefresh() {
  callClientEvent('tablet:trucker:requestFromBrowser')
}

function confirmOrder() {
  if (!selectedOrder.value?.canAccept) return
  callClientEvent('tablet:trucker:acceptOrderFromBrowser', JSON.stringify({ orderId: selectedOrder.value.orderId }))
  selectedOrder.value = null
}

function confirmSkill() {
  if (!selectedSkillId.value) return
  callClientEvent('tablet:trucker:unlockSkillFromBrowser', JSON.stringify({ skillId: selectedSkillId.value }))
  selectedSkillId.value = null
}

function restoreRoute() {
  callClientEvent('tablet:trucker:restoreRouteFromBrowser')
}

function cancelOrder() {
  const orderId = props.payload?.activeOrder?.orderId
  if (!orderId) return
  callClientEvent('tablet:trucker:cancelOrderFromBrowser', JSON.stringify({ orderId }))
  showCancelConfirm.value = false
}

onMounted(() => {
  clock = setInterval(() => {
    const previous = refreshSeconds.value
    now.value = Date.now()
    if (previous > 0 && refreshSeconds.value === 0) requestRefresh()
  }, 1000)
})

onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
  stopSkillHold()
})
</script>

<template>
  <section class="trucker-app">
    <header class="trucker-header">
      <button class="icon-button" type="button" aria-label="Назад" @click="emit('close')">
        <ArrowLeft />
      </button>
      <div class="brand">
        <span class="brand__icon"><Truck /></span>
        <div>
          <strong>Cross-State</strong>
          <small>Грузоперевозки</small>
        </div>
      </div>
      <div class="refresh">
        <Clock3 />
        <span>Новые заказы через <b>{{ formatCountdown(refreshSeconds) }}</b></span>
        <button type="button" aria-label="Обновить" @click="requestRefresh"><RefreshCw /></button>
      </div>
    </header>

    <div class="stats">
      <article>
        <span>Ранг {{ profile?.rank ?? 1 }}</span>
        <strong>{{ profile?.rankName ?? 'Стажёр' }}</strong>
        <div class="xp"><i :style="{ width: `${xpProgress}%` }"></i></div>
        <small>{{ (profile?.xp ?? 0).toLocaleString('ru-RU') }} XP<span v-if="profile?.nextRankXp"> / {{ profile.nextRankXp.toLocaleString('ru-RU') }}</span></small>
      </article>
      <article>
        <span>Очки умения</span>
        <strong>{{ profile?.skillPoints ?? 0 }}</strong>
        <small v-if="profile?.cancellationDebt" class="debt">Долг {{ formatMoney(profile.cancellationDebt) }}</small>
        <small v-else>{{ profile?.skillProgress ?? 0 }}/100 до следующего очка</small>
      </article>
      <article>
        <span>Транспорт</span>
        <strong>{{ props.payload?.currentVehicle?.name ?? 'Не арендован' }}</strong>
        <small v-if="props.payload?.currentVehicle">Лимит {{ formatWeight(props.payload.currentVehicle.maxWeightKg) }} · {{ props.payload.currentVehicle.ordersRemaining }} рейсов</small>
        <small v-else>Аренда у диспетчера</small>
      </article>
      <article v-if="props.payload?.activeOrder" class="active-card">
        <span>Активный заказ</span>
        <strong>{{ props.payload.activeOrder.cargo }}</strong>
        <small>{{ activeStageLabel }} · {{ formatDistance(props.payload.activeOrder.distanceToTargetM) }}</small>
        <small>Сохранность {{ Math.round(props.payload.activeOrder.cargoValidity) }}% · срок {{ formatCountdown(activeDeadlineSeconds) }}</small>
        <div class="active-card__actions">
          <button type="button" @click="restoreRoute"><Route /> GPS</button>
          <button class="danger" type="button" @click="showCancelConfirm = true"><X /> Отмена</button>
        </div>
      </article>
    </div>

    <nav class="tabs">
      <button type="button" :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'"><Package /> Заказы</button>
      <button type="button" :class="{ active: activeTab === 'skills' }" @click="activeTab = 'skills'"><Star /> Умения</button>
    </nav>

    <div v-if="activeTab === 'orders'" class="orders-layout">
      <aside class="filters">
        <div class="filters__title"><Gauge /> Фильтры</div>
        <label><span>Тип машины</span><TwinkleSelect :model-value="vehicleType" :options="vehicleOptions" aria-label="Тип машины" @update:model-value="setVehicleType" /></label>
        <label><span>Тип груза</span><TwinkleSelect :model-value="cargoKind" :options="cargoOptions" aria-label="Тип груза" @update:model-value="setCargoKind" /></label>
        <label><span>До погрузки ≤ {{ maxPickupKm }} км</span><input v-model.number="maxPickupKm" type="range" min="1" max="20"></label>
        <label><span>Маршрут ≤ {{ maxRouteKm }} км</span><input v-model.number="maxRouteKm" type="range" min="2" max="25"></label>
        <label><span>Вес ≤ {{ formatWeight(maxWeightKg) }}</span><input v-model.number="maxWeightKg" type="range" min="500" max="30000" step="500"></label>
        <label><span>Оплата от</span><input v-model.number="minPay" class="number-input" type="number" min="0" step="500"></label>
        <label><span>Сортировка</span><TwinkleSelect :model-value="sortMode" :options="sortOptions" aria-label="Сортировка" @update:model-value="setSortMode" /></label>
        <label class="check"><input v-model="availableOnly" type="checkbox"><span>Только доступные</span></label>
      </aside>

      <main class="orders">
        <div class="orders__title">
          <div><b>Диспетчерская</b><span>{{ filteredOrders.length }} из {{ props.payload?.orders.length ?? 0 }} заказов</span></div>
          <span class="market-status"><i></i> Рынок обновляется каждые 5 минут</span>
        </div>
        <div class="order-list">
          <article v-for="order in filteredOrders" :key="order.orderId" class="order" :class="{ locked: !order.canAccept }">
            <div class="order__head">
              <span class="vehicle"><Truck /> {{ vehicleLabel(order.vehicleType) }}</span>
              <span class="kind">{{ kindLabel(order.cargoKind) }}</span>
              <strong>{{ formatMoney(order.basePay) }}</strong>
            </div>
            <h3>{{ order.cargo }}</h3>
            <p>{{ order.company }}</p>
            <div class="order__metrics">
              <span><Route /> {{ formatDistance(order.routeDistanceM) }}</span>
              <span><Banknote /> {{ formatMoney(payPerKm(order)) }}/км</span>
              <span><Scale /> {{ formatWeight(order.weightKg) }}</span>
              <span><Clock3 /> {{ Math.round(order.timeLimitSeconds / 60) }} мин.</span>
              <span><Package /> {{ formatDistance(order.distanceToPickupM) }} до груза</span>
            </div>
            <div v-if="order.disabledReasons.length" class="order__reason"><LockKeyhole /> {{ order.disabledReasons.join(' · ') }}</div>
            <button type="button" :disabled="!order.canAccept" @click="selectedOrder = order">
              {{ order.canAccept ? 'Принять вызов' : 'Недоступно' }}
            </button>
          </article>
          <div v-if="!filteredOrders.length" class="empty">Нет заказов по выбранным фильтрам.</div>
        </div>
      </main>
    </div>

    <main v-else class="skills">
      <header><div><span>Дерево развития</span><h2>Навыки логиста</h2><small>Зажмите узел, чтобы открыть навык</small></div><strong><Star /> {{ profile?.skillPoints ?? 0 }} очков</strong></header>
      <div class="skill-tree">
        <section v-for="branch in skillBranches" :key="branch.id" class="skill-branch">
          <div class="skill-branch__title"><span>Ветка {{ branch.number }}</span></div>
          <div class="skill-branch__track">
            <div v-for="entry in branch.entries" :key="entry.skill.id" class="skill-node-wrap" :style="{ '--depth': entry.depth }">
              <button
                type="button"
                class="skill-node"
                :class="{ unlocked: entry.skill.unlocked, locked: !entry.skill.unlocked, holding: holdingSkillId === entry.skill.id }"
                :style="{ '--hold-progress': `${holdingSkillId === entry.skill.id ? skillHoldProgress : 0}%` }"
                @mousedown.left.prevent="startSkillHold(entry.skill.id)"
                @mouseup="stopSkillHold"
                @mouseleave="stopSkillHold"
                @touchstart.prevent="startSkillHold(entry.skill.id)"
                @touchend.prevent="stopSkillHold"
                @contextmenu.prevent
              >
                <span class="skill-icon"><CheckCircle2 v-if="entry.skill.unlocked" /><LockKeyhole v-else /></span>
                <span class="skill-copy"><small>Ранг {{ entry.skill.minRank }} · {{ entry.skill.cost }} очк.</small><strong>{{ entry.skill.name }}</strong><em>{{ entry.skill.unlocked ? 'Изучено' : entry.skill.canUnlock ? 'Можно изучить' : 'Закрыто' }}</em></span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>

    <div v-if="selectedOrder" class="modal" @click.self="selectedOrder = null">
      <section>
        <button class="modal__close" type="button" @click="selectedOrder = null"><X /></button>
        <Package class="modal__hero" />
        <span>Подтверждение заказа</span>
        <h2>{{ selectedOrder.cargo }}</h2>
        <p>{{ selectedOrder.company }} · {{ formatDistance(selectedOrder.routeDistanceM) }} · {{ formatWeight(selectedOrder.weightKg) }}</p>
        <div><span>Предварительная оплата</span><strong>{{ formatMoney(selectedOrder.basePay) }}</strong></div>
        <button class="modal__action" type="button" @click="confirmOrder"><Banknote /> Принять вызов</button>
      </section>
    </div>

    <div v-if="selectedSkillId" class="modal" @click.self="selectedSkillId = null">
      <section>
        <button class="modal__close" type="button" @click="selectedSkillId = null"><X /></button>
        <Star class="modal__hero" />
        <span>Развитие навыка</span>
        <h2>{{ selectedSkill?.name }}</h2>
        <p>{{ selectedSkill?.description }}</p>
        <div><span>Требования</span><strong>{{ selectedSkill?.prerequisite ? `После «${props.payload?.skills.find((skill) => skill.id === selectedSkill?.prerequisite)?.name}»` : `Ранг ${selectedSkill?.minRank}` }}</strong></div>
        <button v-if="selectedSkill && !selectedSkill.unlocked" class="modal__action" type="button" :disabled="!selectedSkill.canUnlock" @click="confirmSkill">{{ selectedSkill.canUnlock ? `Изучить за ${selectedSkill.cost} очк.` : 'Требования не выполнены' }}</button>
        <span v-else class="skill-modal-learned"><CheckCircle2 /> Навык уже изучен</span>
      </section>
    </div>

    <div v-if="showCancelConfirm && props.payload?.activeOrder" class="modal" @click.self="showCancelConfirm = false">
      <section>
        <button class="modal__close" type="button" @click="showCancelConfirm = false"><X /></button>
        <X class="modal__hero modal__hero--danger" />
        <span>Отмена перевозки</span>
        <h2>{{ props.payload.activeOrder.cargo }}</h2>
        <p>Заказ будет закрыт, один рейс аренды израсходован. Штраф зависит от стадии перевозки.</p>
        <div><span>Штраф</span><strong class="danger-text">{{ formatMoney(props.payload.activeOrder.cancelFee) }}</strong></div>
        <button class="modal__action modal__action--danger" type="button" @click="cancelOrder">Отменить и списать штраф</button>
      </section>
    </div>
  </section>
</template>

<style scoped lang="scss">
.trucker-app { position: relative; height: 100%; overflow: hidden; color: #edf5ff; background: radial-gradient(circle at 90% 0, #0f526f66, transparent 30%), linear-gradient(145deg, #071019, #0c1823 56%, #071018); font-family: "SF Pro Display", "Segoe UI", sans-serif; }
button, select, input { font: inherit; }
button { cursor: pointer; }
.trucker-header { height: 8.5%; display: flex; align-items: center; gap: 1.2vh; padding: 0 2.2vh; box-sizing: border-box; border-bottom: .1vh solid #ffffff16; background: #071019cc; }
.icon-button, .refresh button { width: 3.6vh; height: 3.6vh; display: grid; place-items: center; border: .1vh solid #ffffff1f; border-radius: 1vh; color: #dff6ff; background: #ffffff0a; svg { width: 1.8vh; } }
.brand { display: flex; align-items: center; gap: 1vh; strong, small { display: block; } strong { font-size: 1.65vh; } small { color: #7f9aae; font-size: 1.02vh; text-transform: uppercase; letter-spacing: .13em; } }
.brand__icon { width: 3.8vh; height: 3.8vh; display: grid; place-items: center; border-radius: 1.1vh; color: #05121b; background: linear-gradient(135deg, #39d0ff, #6fffc8); svg { width: 2.2vh; } }
.refresh { margin-left: auto; display: flex; align-items: center; gap: .7vh; color: #8ea6b8; font-size: 1.1vh; svg { width: 1.5vh; } b { color: #60e4ff; } }
.stats { height: 14%; display: grid; grid-template-columns: 1.25fr .8fr 1.25fr 1fr; gap: 1vh; padding: 1.2vh 2.2vh; box-sizing: border-box; article { min-width: 0; padding: .8vh 1.2vh; border: .1vh solid #ffffff13; border-radius: 1.1vh; background: #ffffff08; } span, small, strong { display: block; } span { color: #7690a4; font-size: 1vh; text-transform: uppercase; letter-spacing: .08em; } strong { margin: .35vh 0; overflow: hidden; color: #f6fbff; font-size: 1.45vh; text-overflow: ellipsis; white-space: nowrap; } small { color: #7890a3; font-size: 1vh; } .active-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: .7vh; border-color: #4fe7ac45; background: #1cc98514; > span, > strong, > small { grid-column: 1; } } }
.active-card__actions { grid-column: 2; grid-row: 1 / span 4; align-self: center; display: flex; flex-direction: column; gap: .45vh; button { height: 2.2vh; display: flex; align-items: center; justify-content: center; gap: .3vh; padding: 0 .6vh; border: .1vh solid #46dcff44; border-radius: .45vh; color: #bdefff; background: #2bcdf31a; font-size: .82vh; font-weight: 800; svg { width: 1vh; } &.danger { border-color: #ff6c6c3d; color: #ffb4b4; background: #ff535312; } } }
.xp { height: .35vh; margin: .45vh 0; overflow: hidden; border-radius: 1vh; background: #ffffff12; i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #37c7ff, #6effbf); } }
.debt { color: #ff9292 !important; }
.tabs { height: 6.5%; display: flex; align-items: end; gap: .5vh; padding: 0 2.2vh; box-sizing: border-box; border-bottom: .1vh solid #ffffff13; button { display: flex; align-items: center; gap: .6vh; height: 100%; padding: 0 1.5vh; border: 0; border-bottom: .25vh solid transparent; color: #758da0; background: transparent; font-size: 1.2vh; font-weight: 700; svg { width: 1.6vh; } &.active { border-color: #4ddcff; color: #eafaff; } } }
.orders-layout { height: 71%; display: grid; grid-template-columns: 21% 79%; }
.filters { position: relative; z-index: 4; overflow: auto; padding: 1.4vh 1.5vh 2vh 2.2vh; border-right: .1vh solid #ffffff12; background: #07121c88; }
.filters__title { display: flex; align-items: center; gap: .7vh; margin-bottom: 1vh; font-size: 1.25vh; font-weight: 800; svg { width: 1.5vh; } }
.filters label { display: grid; gap: .4vh; margin: .8vh 0; color: #8199aa; font-size: 1vh; }
.number-input { width: 100%; height: 3vh; padding: 0 .7vh; box-sizing: border-box; border: .1vh solid #ffffff19; border-radius: .65vh; color: #dceaf3; outline: 0; background: #071019; font-size: 1.05vh; }
.filters :deep(.twinkle-select__trigger) { min-height: 3vh; border-color: #ffffff19; border-radius: .65vh; background: #071019; }
.filters :deep(.twinkle-select__value) { font-size: 1.02vh; }
.filters :deep(.twinkle-select__menu) { position: static; margin-top: .35vh; background: #071019; }
.filters :deep(.twinkle-select__option) { min-height: 2.7vh; }
.filters :deep(.twinkle-select__option span) { color: #e8f4fc; font-size: .98vh; }
input[type="range"] { width: 100%; accent-color: #43d9ff; }
.check { display: flex !important; grid-template-columns: auto 1fr; align-items: center; input { accent-color: #43d9ff; } }
.orders { min-width: 0; overflow: hidden; padding: 1.3vh 2.2vh 1.8vh 1.5vh; box-sizing: border-box; }
.orders__title { display: flex; align-items: center; justify-content: space-between; height: 4vh; div { display: flex; align-items: baseline; gap: .8vh; } b { font-size: 1.35vh; } span { color: #748da0; font-size: 1vh; } }
.market-status { display: flex; align-items: center; gap: .5vh; i { width: .65vh; height: .65vh; border-radius: 50%; background: #58ebb1; box-shadow: 0 0 1vh #58ebb1; } }
.order-list { height: calc(100% - 4vh); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 1vh; overflow: auto; padding-right: .5vh; }
.order { position: relative; padding: 1.1vh; border: .1vh solid #ffffff14; border-radius: 1.05vh; background: linear-gradient(145deg, #132330e8, #0b1721e8); &.locked { opacity: .68; } h3 { margin: .65vh 0 .15vh; font-size: 1.25vh; } p { margin: 0; color: #7d96a9; font-size: 1vh; } > button { width: 100%; height: 3.15vh; margin-top: .8vh; border: .1vh solid #42dcff55; border-radius: .7vh; color: #05131b; background: linear-gradient(90deg, #4ddaff, #63efbe); font-size: 1.02vh; font-weight: 900; &:disabled { cursor: not-allowed; border-color: #ffffff13; color: #758998; background: #ffffff0a; } } }
.order__head { display: flex; align-items: center; gap: .6vh; .vehicle, .kind { display: flex; align-items: center; gap: .35vh; padding: .32vh .55vh; border-radius: .45vh; color: #82dfff; background: #39c9ff16; font-size: .92vh; } .kind { color: #a8bad0; background: #ffffff0a; } svg { width: 1.1vh; } strong { margin-left: auto; color: #6cf5bd; font-size: 1.25vh; } }
.order__metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: .45vh; margin-top: .8vh; span { display: flex; align-items: center; gap: .4vh; color: #9ab0bf; font-size: .92vh; } svg { width: 1.1vh; } }
.order__reason { display: flex; align-items: center; gap: .4vh; min-height: 2.4vh; margin-top: .6vh; padding: .35vh .55vh; border-radius: .5vh; color: #ffb0a5; background: #ff624812; font-size: .86vh; line-height: 1.25; svg { width: 1.1vh; flex: 0 0 auto; } }
.empty { grid-column: 1 / -1; padding: 4vh; color: #7890a2; text-align: center; }
.skills { height: 71%; overflow: auto; padding: 1.6vh 2.2vh 2.2vh; box-sizing: border-box; > header { display: flex; align-items: center; justify-content: space-between; > div > span { color: #63dbff; font-size: 1vh; text-transform: uppercase; letter-spacing: .1em; } h2 { margin: .3vh 0 0; font-size: 1.8vh; } small { color: #718b9c; font-size: .88vh; } > strong { display: flex; align-items: center; gap: .5vh; color: #ffe47f; font-size: 1.2vh; svg { width: 1.5vh; } } } }
.skill-tree { display: grid; grid-template-columns: repeat(4, minmax(17vh, 1fr)); gap: 1.1vh; min-width: 74vh; margin-top: 1.4vh; padding: .4vh 0 2vh; }
.skill-branch { min-width: 0; padding: .9vh; border: .1vh solid #ffffff12; border-radius: 1.1vh; background: linear-gradient(165deg, #102430aa, #08131c88); }
.skill-branch__title { display: flex; align-items: center; gap: .6vh; margin-bottom: .8vh; color: #66ddff; font-size: .78vh; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; &::before { content: ""; width: .7vh; height: .7vh; border-radius: 50%; background: #5ddfff; box-shadow: 0 0 .9vh #4edfff; } }
.skill-branch__track { position: relative; display: grid; gap: .75vh; padding-left: 1.1vh; &::before { content: ""; position: absolute; top: 0; bottom: 2.1vh; left: .35vh; width: .16vh; background: linear-gradient(#57ddff, #57ddff55 72%, transparent); box-shadow: 0 0 .7vh #4edfff42; } }
.skill-node-wrap { position: relative; margin-left: calc(var(--depth) * 1.5vh); &::before { content: ""; position: absolute; top: 50%; right: 100%; width: calc(.75vh + var(--depth) * 1.5vh); height: .16vh; background: #50d9ff7a; } }
.skill-node { --hold-progress: 0%; position: relative; width: 100%; min-height: 5.8vh; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: .7vh; overflow: hidden; padding: .75vh; border: .1vh solid #ffffff17; border-radius: .85vh; color: #edf7fc; background: linear-gradient(145deg, #142a38, #0a1822); text-align: left; user-select: none; &::after { content: ""; position: absolute; left: 0; bottom: 0; width: var(--hold-progress); height: .25vh; background: linear-gradient(90deg, #50dfff, #68efb9); box-shadow: 0 0 .8vh #4edfff; } &.holding { border-color: #55deff88; transform: translateY(-.05vh); } &.unlocked { border-color: #59ebb052; background: linear-gradient(145deg, #153a31, #0b201b); } &.locked { color: #a5b5bf; } }
.skill-icon { width: 2.8vh; height: 2.8vh; display: grid; place-items: center; border-radius: 50%; color: #66e9b5; background: #ffffff0b; box-shadow: inset 0 0 0 .1vh #ffffff0b; svg { width: 1.35vh; } }
.skill-copy { min-width: 0; small, strong, em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } small { color: #59dfff; font-size: .7vh; } strong { margin: .18vh 0; font-size: .98vh; } em { color: #748e9e; font-size: .7vh; font-style: normal; } }
.skill-modal-learned { display: flex !important; align-items: center; justify-content: center; gap: .5vh; min-height: 3.8vh; color: #68efb7 !important; font-size: 1.05vh !important; font-weight: 900; svg { width: 1.4vh; } }
.modal { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: #02070cba; backdrop-filter: blur(.5vh); > section { position: relative; width: 36vh; padding: 2.2vh; box-sizing: border-box; border: .1vh solid #45dfff43; border-radius: 1.4vh; text-align: center; background: linear-gradient(145deg, #132635, #08131d); box-shadow: 0 2vh 6vh #0009; > span { color: #55dfff; font-size: 1vh; text-transform: uppercase; letter-spacing: .1em; } h2 { margin: .5vh 0; font-size: 1.8vh; } p { color: #91a7b6; font-size: 1.05vh; } > div { display: flex; justify-content: space-between; margin: 1.3vh 0; padding: 1vh; border-radius: .7vh; background: #ffffff08; font-size: 1.05vh; strong { color: #6af0b8; } } } }
.modal__hero { width: 3.6vh; height: 3.6vh; margin: 0 auto 1vh; color: #60e4ff; }
.modal__hero--danger, .danger-text { color: #ff8585 !important; }
.modal__close { position: absolute; top: 1vh; right: 1vh; width: 2.8vh; height: 2.8vh; display: grid; place-items: center; border: 0; border-radius: .6vh; color: #9bb0bf; background: #ffffff0a; svg { width: 1.3vh; } }
.modal__action { width: 100%; height: 3.8vh; display: flex; align-items: center; justify-content: center; gap: .5vh; border: 0; border-radius: .75vh; color: #06131b; background: linear-gradient(90deg, #4bdcff, #69efb9); font-size: 1.05vh; font-weight: 900; svg { width: 1.4vh; } }
.modal__action--danger { color: #fff3f3; background: linear-gradient(90deg, #f05d5d, #ff8a6c); }
::-webkit-scrollbar { width: .45vh; } ::-webkit-scrollbar-thumb { border-radius: 1vh; background: #ffffff1f; }
</style>
