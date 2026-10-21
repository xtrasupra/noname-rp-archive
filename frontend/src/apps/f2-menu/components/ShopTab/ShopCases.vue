<template>
  <section ref="casesRoot" class="shop-cases">
    <header v-if="selectedCase" class="shop-cases__header">
      <button v-if="selectedCase" class="shop-cases__back" type="button" @click="selectedCaseId = null">
        <BaseIcon :icon="ArrowLeft" size="sm" :stroke-width="2.4" />
      </button>
      <h1>{{ selectedCase ? selectedCase.title : 'Кейсы' }}</h1>

    </header>

    <div class="shop-cases__ticker" aria-label="Популярные награды">
      <span class="shop-cases__ticker-label">Новое</span>
      <div class="shop-cases__ticker-track">
        <article v-for="(item, index) in liveTickerItems" :key="`${item.name}-${index}`" class="shop-cases-ticker-card">
          <span :class="['shop-cases-ticker-card__icon', `shop-cases-ticker-card__icon--${item.type}`]">
            <BaseIcon v-if="item.type === 'coin'" :icon="DollarSign" size="lg" :stroke-width="2.4" />
            <img v-if="item.image" :src="item.image" alt="">
          </span>
          <strong>{{ item.name }}</strong>
        </article>
      </div>
    </div>

    <template v-if="!selectedCase">
      <section class="shop-cases-filters" aria-label="Фильтры кейсов">
        <div class="shop-cases-filter">
          <span>Категория</span>
          <div>
            <button
              v-for="option in categoryOptions"
              :key="option.value"
              type="button"
              :class="{ 'shop-cases-filter__option--active': selectedCategory === option.value }"
              @click="selectedCategory = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="shop-cases-filter shop-cases-filter--compact">
          <ShopCaseSelect
            v-model="selectedSort"
            label="Сортировка"
            :options="sortOptions"
          />
        </div>

        <div class="shop-cases-filter shop-cases-filter--compact">
          <ShopCaseSelect
            v-model="selectedRarity"
            label="Редкость"
            :options="rarityOptions"
          />
        </div>
      </section>

      <section class="shop-cases-recommendations" aria-label="Рекомендации кейсов">
        <header class="shop-cases-recommendations__header">
          <span class="shop-cases-recommendations__icon">
            <BaseIcon :icon="Sparkles" size="sm" :stroke-width="2.3" />
          </span>
          <div>
            <h2>Рекомендовано для вас</h2>
            <p>Популярные кейсы и выгодные предложения сегодня</p>
          </div>
          <span class="shop-cases-recommendations__meta">4 предложения</span>
        </header>

        <div class="shop-cases-recommendations__list">
          <button
            v-for="(caseItem, index) in recommendedTickerCases"
            :key="`${caseItem.id}-${index}`"
            class="shop-case-recommendation"
            :style="{ '--card-order': String(index), '--card-drift': `${getCardDrift(index)}vh` }"
            type="button"
            @click="openCase(caseItem.id)"
          >
            <span
              class="shop-case-recommendation__label"
              :class="`shop-case-recommendation__label--${getRecommendationTone(index)}`"
            >
              {{ getRecommendationLabel(caseItem, index) }}
            </span>

            <img
              class="shop-case-recommendation__image"
              :class="`shop-case-recommendation__image--${caseItem.tone}`"
              src="/image 31.png"
              alt=""
            >

            <div class="shop-case-recommendation__content">
              <strong>{{ caseItem.title }}</strong>
              <small>{{ caseItem.dailyOpens.toLocaleString('ru-RU') }} открытий сегодня</small>
            </div>

            <span class="shop-case-recommendation__price">
              <s v-if="caseItem.oldPrice">{{ caseItem.oldPrice }}</s>
              <span class="shop-cases-price-row">
                <b>{{ caseItem.price }}</b>
                <BaseIcon :icon="DollarSign" size="sm" :stroke-width="2.4" />
              </span>
            </span>
          </button>
        </div>
      </section>

      <div class="shop-cases__grid">
        <button
          v-for="(caseItem, index) in visibleCases"
          :key="caseItem.id"
          class="shop-case-card"
          :class="`shop-case-card--${caseItem.rarity}`"
          :style="{ '--card-order': String(index), '--card-drift': `${getCardDrift(index)}vh` }"
          type="button"
          @click="openCase(caseItem.id)"
        >
          <span class="shop-case-card__rarity-line" aria-hidden="true"></span>
          <span class="shop-case-card__badges">
            <span class="shop-case-card__badges-left">
              <span class="shop-case-card__owned">У вас: {{ getOwnedCaseCount(caseItem.id) }}</span>
              <span v-if="caseItem.timer" class="shop-case-card__timer">{{ caseItem.timer }}</span>
            </span>
            <span v-if="caseItem.discount" class="shop-case-card__discount">{{ caseItem.discount }}</span>
          </span>
          <span class="shop-case-card__content">
            <span class="shop-case-card__labels">
              <b :class="`shop-case-card__label--${caseItem.rarity}`">{{ getRarityLabel(caseItem.rarity) }}</b>
              <b>{{ getCategoryLabel(caseItem.category) }}</b>
            </span>
            <strong>{{ caseItem.title }}</strong>
            <span
              class="shop-case-card__price shop-cases-price-row"
              :class="{ 'shop-case-card__price--discount': caseItem.oldPrice }"
            >
              <s v-if="caseItem.oldPrice">{{ caseItem.oldPrice }}</s>
              <b>{{ caseItem.price }}</b>
              <BaseIcon :icon="DollarSign" size="sm" :stroke-width="2.4" />
            </span>
          </span>
          <span :class="['shop-case-card__visual', `shop-case-card__visual--${caseItem.tone}`]">
            <img class="shop-case-card__image" src="/image 31.png" alt="" loading="lazy" decoding="async">
          </span>
        </button>
      </div>

      <div
        v-if="hasMoreCases"
        ref="loadMoreTarget"
        class="shop-cases__load-more"
        aria-hidden="true"
      >
        <span></span>
      </div>

      <p v-if="filteredCases.length === 0" class="shop-cases__empty">Кейсы по выбранным фильтрам не найдены</p>
    </template>

    <template v-else>
      <section class="shop-case-detail">
        <div class="shop-case-detail__preview">
          <article>
            <strong>{{ selectedCase.title }}</strong>
            <p>{{ selectedCase.description }}</p>
          </article>

          <div :class="['shop-case-detail__visual', `shop-case-detail__visual--${selectedCase.tone}`]">
            <img src="/image 31.png" alt="" loading="lazy" decoding="async">
            <span class="shop-case-detail__owned">У вас: {{ selectedOwnedCount }}</span>
          </div>
        </div>

        <Transition name="shop-case-panel">
          <section
            ref="rouletteRoot"
            v-show="isRouletteVisible"
            class="shop-case-roulette"
            :class="{
              'shop-case-roulette--active': isRouletteMoving,
              'shop-case-roulette--quick': quickOpen,
            }"
          >
            <div class="shop-case-roulette__beam"></div>
            <span class="shop-case-roulette__marker"></span>
            <div
              ref="rouletteTrack"
              class="shop-case-roulette__track"
              :style="{ '--roulette-offset': rouletteOffset }"
              @transitionend="handleRouletteTransitionEnd"
            >
              <article
                v-for="item in rouletteItems"
                :key="item.key"
                :class="['shop-reward-card', `shop-reward-card--${item.reward.rarity}`]"
              >
                <span class="shop-reward-card__rarity"></span>
                <img v-if="item.reward.image" :src="item.reward.image" alt="">
                <span v-else class="shop-reward-card__money">{{ item.reward.value }}</span>
                <strong>{{ item.reward.name }}</strong>
              </article>
            </div>
          </section>
        </Transition>

        <Transition name="shop-case-result">
          <div v-if="resultReady && wonReward" class="shop-case-result">
            <span class="shop-case-result__preview">
              <img v-if="wonReward.image" :src="wonReward.image" alt="">
              <b v-else>{{ wonReward.value }}</b>
            </span>
            <div class="shop-case-result__info">
              <span>Вы выиграли</span>
              <strong>{{ wonReward.name }}</strong>
              <p>{{ getRewardDescription(wonReward) }}</p>
            </div>
            <div class="shop-case-result__actions">
              <button type="button" @click="claimReward">Забрать</button>
              <button type="button" @click="claimReward">В инвентарь</button>
            </div>
          </div>
        </Transition>
      </section>

      <section class="shop-case-open">
        <div class="shop-case-open__controls">
          <span>Открыть кейсов</span>
          <div>
            <button
              v-for="amount in openAmounts"
              :key="amount"
              type="button"
              :class="{ 'shop-case-open__amount--active': amount === selectedOpenAmount }"
              @click="selectedOpenAmount = amount"
            >
              {{ amount }}
            </button>
          </div>
        </div>

        <button
          class="shop-case-open__button"
          type="button"
          :class="{ 'shop-case-open__button--idle': resultReady }"
          :disabled="isOpening"
          @click="spinCase"
        >
          {{ caseActionLabel }}
        </button>

        <label class="shop-case-open__quick">
          <span>Быстрое открытие</span>
          <input v-model="quickOpen" type="checkbox">
          <i></i>
        </label>

        <span class="shop-case-open__status">
          В наличии: {{ selectedOwnedCount }}
          <b v-if="caseMessage">{{ caseMessage }}</b>
        </span>
      </section>

      <h2 class="shop-case-content-title">Содержимое кейса</h2>
      <div class="shop-case-content">
        <article
          v-for="reward in activeCaseRewards"
          :key="reward.name"
          :class="['shop-reward-card', `shop-reward-card--${reward.rarity}`]"
        >
          <span class="shop-reward-card__rarity"></span>
          <img v-if="reward.image" :src="reward.image" alt="">
          <span v-else class="shop-reward-card__money">{{ reward.value }}</span>
          <strong>{{ reward.name }}</strong>
        </article>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

import { ArrowLeft, BaseIcon, DollarSign, Sparkles } from '@/shared/icons'
import { callClientEvent } from '@/core/client-events/client-event'
import { useNotificationStore } from '@/stores/notification.store'

import ShopCaseSelect from './ShopCaseSelect.vue'

const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()

type CaseTone = 'default' | 'premium' | 'spring' | 'summer' | 'autumn'
type RewardRarity = 'common' | 'rare' | 'epic' | 'legendary'
type CaseCategory = 'all' | 'cars' | 'clothes' | 'money' | 'items' | 'seasonal'
type CaseRarityFilter = 'all' | 'rare' | 'notRare'
type CaseSort = 'popular' | 'priceAsc' | 'priceDesc' | 'rarityDesc' | 'rarityAsc'

type CaseItem = {
  category: Exclude<CaseCategory, 'all'>
  dailyOpens: number
  description: string
  discount?: string
  id: string
  image?: string
  oldPrice?: number
  price: number
  rarity: RewardRarity
  rewards?: RewardItem[]
  timer?: string
  title: string
  tone: CaseTone
}

type RewardItem = {
  amount?: number
  image?: string
  name: string
  rarity: RewardRarity
  type?: string
  value?: string
}

type RouletteItem = {
  key: string
  reward: RewardItem
}

const categoryOptions: Array<{ label: string, value: CaseCategory }> = [
  { label: 'Все', value: 'all' },
  { label: 'Машины', value: 'cars' },
  { label: 'Одежда', value: 'clothes' },
  { label: 'Валюта', value: 'money' },
  { label: 'Предметы', value: 'items' },
  { label: 'Сезоны', value: 'seasonal' },
]

const sortOptions: Array<{ description?: string, label: string, value: CaseSort }> = [
  { label: 'Популярные', value: 'popular', description: 'Больше всего открывали сегодня' },
  { label: 'Цена: по возрастанию', value: 'priceAsc', description: 'От дешёвых к дорогим' },
  { label: 'Цена: по убыванию', value: 'priceDesc', description: 'Сначала дорогие кейсы' },
  { label: 'Сначала редкие', value: 'rarityDesc', description: 'Легендарные и эпические выше' },
  { label: 'Сначала обычные', value: 'rarityAsc', description: 'Обычные и базовые выше' },
]

const rarityOptions: Array<{ description?: string, label: string, value: CaseRarityFilter }> = [
  { label: 'Все редкости', value: 'all', description: 'Показать весь каталог' },
  { label: 'Редкие', value: 'rare', description: 'Rare, epic и legendary' },
  { label: 'Не редкие', value: 'notRare', description: 'Базовые кейсы без редкого тира' },
]

const rarityRank: Record<RewardRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
}

const openAmounts = [1, 2, 3, 4, 5]
const initialVisibleCaseCount = 10
const caseLoadBatchSize = 5
const rouletteTargetIndex = 28
const rouletteTransitionMs = 5200
const casesRoot = ref<HTMLElement | null>(null)
const caseMessage = ref('')
const isOpening = ref(false)
const isRouletteMoving = ref(false)
const isRouletteVisible = ref(false)
const loadMoreTarget = ref<HTMLElement | null>(null)
const notificationStore = useNotificationStore()
const ownedCases = ref<Record<string, number>>({})
const quickOpen = ref(false)
const resultReady = ref(false)
const rouletteItems = ref<RouletteItem[]>([])
const rouletteOffset = ref('0px')
const rouletteSpin = ref(0)
const rouletteRoot = ref<HTMLElement | null>(null)
const rouletteTrack = ref<HTMLElement | null>(null)
const selectedCategory = ref<CaseCategory>('all')
const selectedCaseId = ref<string | null>(null)
const selectedOpenAmount = ref(1)
const selectedRarity = ref<CaseRarityFilter>('all')
const selectedSort = ref<CaseSort>('popular')
const visibleCaseCount = ref(initialVisibleCaseCount)
const wonReward = ref<RewardItem | null>(null)
let lastCaseResultKey = ''
let lastCaseResultAt = 0
const shopPayload = computed(() => (props.payload as any)?.shop ?? {})
const donateBalance = computed(() => Number((props.payload as any)?.donate ?? shopPayload.value.donate ?? shopPayload.value.balance ?? 0))
const serverOwnedCases = computed<Record<string, number>>(() => {
  const source = (props.payload as any)?.ownedCases ?? shopPayload.value.ownedCases ?? {}

  return Object.fromEntries(
    Object.entries(source).map(([id, amount]) => [id, Math.max(0, Number(amount || 0))]),
  )
})
const catalogCases = computed<CaseItem[]>(() => {
  const casesFromServer = shopPayload.value.cases

  return Array.isArray(casesFromServer) ? casesFromServer as CaseItem[] : []
})
const liveTickerItems = computed(() => {
  const serverItems = shopPayload.value.tickerItems
  const source = Array.isArray(serverItems) ? serverItems : []

  return [...source, ...source]
})

const discountedCases = computed(() => catalogCases.value.filter((caseItem) => Boolean(caseItem.discount || caseItem.oldPrice)))
const topUsedCases = computed(() => [...catalogCases.value].sort((left, right) => right.dailyOpens - left.dailyOpens))
const recommendedCases = computed(() => {
  const recommendationMap = new Map<string, CaseItem>()

  ;[...discountedCases.value, ...topUsedCases.value].forEach((caseItem) => {
    if (recommendationMap.size < 4) {
      recommendationMap.set(caseItem.id, caseItem)
    }
  })

  return [...recommendationMap.values()]
})
const recommendedTickerCases = computed(() => [...recommendedCases.value, ...recommendedCases.value])
const filteredCases = computed(() => {
  const nextCases = catalogCases.value.filter((caseItem) => {
    const categoryMatches = selectedCategory.value === 'all' || caseItem.category === selectedCategory.value
    const rarityMatches = selectedRarity.value === 'all'
      || (selectedRarity.value === 'rare' && rarityRank[caseItem.rarity] >= rarityRank.rare)
      || (selectedRarity.value === 'notRare' && rarityRank[caseItem.rarity] < rarityRank.rare)

    return categoryMatches && rarityMatches
  })

  return [...nextCases].sort((left, right) => {
    if (selectedSort.value === 'priceAsc') {
      return left.price - right.price
    }

    if (selectedSort.value === 'priceDesc') {
      return right.price - left.price
    }

    if (selectedSort.value === 'rarityDesc') {
      return rarityRank[right.rarity] - rarityRank[left.rarity]
    }

    if (selectedSort.value === 'rarityAsc') {
      return rarityRank[left.rarity] - rarityRank[right.rarity]
    }

    return right.dailyOpens - left.dailyOpens
  })
})
const visibleCases = computed(() => filteredCases.value.slice(0, visibleCaseCount.value))
const hasMoreCases = computed(() => visibleCaseCount.value < filteredCases.value.length)
const selectedCase = computed(() => catalogCases.value.find((caseItem) => caseItem.id === selectedCaseId.value) ?? null)
const activeCaseRewards = computed<RewardItem[]>(() => {
  const rewards = (selectedCase.value as any)?.rewards

  return Array.isArray(rewards) ? rewards as RewardItem[] : []
})
const selectedOwnedCount = computed(() => selectedCaseId.value ? getOwnedCaseCount(selectedCaseId.value) : 0)
const caseActionLabel = computed(() => {
  if (isOpening.value) return selectedOwnedCount.value < selectedOpenAmount.value ? 'Покупаем...' : 'Открываем...'
  if (resultReady.value) return 'Выигрыш готов'
  if (selectedOwnedCount.value < selectedOpenAmount.value) return 'Купить кейс'
  return 'Открыть кейс'
})

let openingTimer: number | undefined
let caseObserver: IntersectionObserver | undefined

function openCase(id: string) {
  selectedCaseId.value = id
  resultReady.value = false
  isOpening.value = false
  isRouletteMoving.value = false
  isRouletteVisible.value = false
  rouletteItems.value = []
  rouletteOffset.value = '0px'
  wonReward.value = null
  caseMessage.value = ''
}

function getOwnedCaseCount(id: string) {
  return ownedCases.value[id] ?? 0
}

function getCategoryLabel(category: CaseItem['category']) {
  return categoryOptions.find((option) => option.value === category)?.label ?? 'Кейс'
}

function getRecommendationLabel(caseItem: CaseItem, index: number) {
  const labels = ['Скидка дня', 'Популярно', 'Выбор игроков', 'Тренд']

  if (caseItem.discount || caseItem.oldPrice) {
    return labels[index % labels.length]
  }

  return labels[(index + 1) % labels.length]
}

function getRecommendationTone(index: number) {
  return ['discount', 'popular', 'choice', 'trend'][index % 4]
}

function getRewardDescription(reward: RewardItem) {
  if (reward.image) {
    return 'Предмет добавлен в список наград. Заберите его сейчас или отправьте в инвентарь.'
  }

  if (reward.name.includes('MC')) {
    return 'Валюта будет зачислена на ваш игровой счет после получения.'
  }

  if (reward.name.includes('$')) {
    return 'Денежная награда будет зачислена после получения.'
  }

  return 'Выигрыш готов к получению.'
}

function getSpinReward() {
  if (!activeCaseRewards.value.length) {
    return null
  }

  return activeCaseRewards.value[(rouletteSpin.value * 3 + 2) % activeCaseRewards.value.length]
}

function buildRouletteItems(targetReward: RewardItem) {
  const totalItems = 42
  const rewards = activeCaseRewards.value.length ? activeCaseRewards.value : [targetReward]

  return Array.from({ length: totalItems }, (_, index) => {
      const reward = index === rouletteTargetIndex
        ? targetReward
        : rewards[(index + rouletteSpin.value * 5) % rewards.length]

    return {
      key: `${rouletteSpin.value}-${index}-${reward.name}`,
      reward,
    }
  })
}

function finishRouletteSpin() {
  if (!isOpening.value) {
    return
  }

  window.clearTimeout(openingTimer)
  isOpening.value = false
  resultReady.value = true
  caseMessage.value = wonReward.value ? `Вы выиграли: ${wonReward.value.name}` : 'Выигрыш определён'
}

function handleRouletteTransitionEnd(event: TransitionEvent) {
  if (event.propertyName !== 'transform') {
    return
  }

  finishRouletteSpin()
}

function showInsufficientFundsNotification(price: number) {
  notificationStore.notify(`Недостаточно денег для покупки кейса. Нужно: ${price} Coins`, {
    title: 'Недостаточно средств',
    variant: 'error',
  })
}

function getCardDrift(index: number) {
  const drifts = [-0.45, 0.25, -0.15, 0.38, -0.28, 0.12]

  return drifts[index % drifts.length]
}

function getRarityLabel(rarity: RewardRarity) {
  const labels: Record<RewardRarity, string> = {
    common: 'Обычный',
    rare: 'Редкий',
    epic: 'Эпический',
    legendary: 'Легендарный',
  }

  return labels[rarity]
}

function loadMoreCases() {
  if (!hasMoreCases.value) {
    return
  }

  visibleCaseCount.value = Math.min(
    visibleCaseCount.value + caseLoadBatchSize,
    filteredCases.value.length,
  )
}

function observeLoadMoreTarget() {
  caseObserver?.disconnect()

  if (!loadMoreTarget.value || !hasMoreCases.value) {
    return
  }

  caseObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMoreCases()
      }
    },
    {
      root: casesRoot.value,
      rootMargin: '0px 0px 22% 0px',
      threshold: 0.1,
    },
  )

  caseObserver.observe(loadMoreTarget.value)
}

function spinCase() {
  if (!selectedCase.value || isOpening.value || resultReady.value) {
    return
  }

  const totalPrice = selectedCase.value.price * selectedOpenAmount.value

  if (selectedOwnedCount.value < selectedOpenAmount.value) {
    if (donateBalance.value < totalPrice) {
      caseMessage.value = 'Недостаточно Coins'
      showInsufficientFundsNotification(totalPrice)
      return
    }

    isOpening.value = true
    caseMessage.value = 'Покупаем кейс...'
    callClientEvent('f2:case:buy', JSON.stringify({
      caseId: selectedCase.value.id,
      amount: selectedOpenAmount.value,
    }))
    return
  }

  if (!activeCaseRewards.value.length) {
    caseMessage.value = 'Содержимое кейса не загружено'
    return
  }

  if (donateBalance.value < 0) {
    caseMessage.value = 'Недостаточно Coins'
    showInsufficientFundsNotification(totalPrice)
    return
  }

  window.clearTimeout(openingTimer)
  resultReady.value = false
  caseMessage.value = 'Открываем кейс...'
  isOpening.value = true
  isRouletteMoving.value = false
  wonReward.value = null
  rouletteSpin.value += 1
  rouletteOffset.value = '0px'
  callClientEvent('f2:case:open', JSON.stringify({
    caseId: selectedCase.value.id,
    amount: selectedOpenAmount.value,
  }))
}

function claimReward() {
  resultReady.value = false
  isRouletteMoving.value = false
  isRouletteVisible.value = false
  rouletteItems.value = []
  rouletteOffset.value = '0px'
  wonReward.value = null
  caseMessage.value = 'Награда получена'
}

function applyCaseResult(rawPayload: unknown) {
  const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload || '{}') : rawPayload as any
  const action = String(payload?.action || '')

  if (payload?.ownedCases) {
    ownedCases.value = Object.fromEntries(
      Object.entries(payload.ownedCases).map(([id, amount]) => [id, Math.max(0, Number(amount || 0))]),
    )
  }

  if (!payload?.success) {
    isOpening.value = false
    caseMessage.value = String(payload?.message || 'Действие с кейсом не выполнено')
    notificationStore.notify(caseMessage.value, {
      title: 'Кейсы',
      variant: 'error',
    })
    return
  }

  caseMessage.value = String(payload.message || '')

  if (action === 'buy') {
    isOpening.value = false
    notificationStore.notify(caseMessage.value || 'Кейс куплен', {
      title: 'Кейсы',
      variant: 'success',
    })
    return
  }

  const reward = (payload.reward || payload.rewards?.[0] || getSpinReward()) as RewardItem | null
  if (!reward) {
    isOpening.value = false
    caseMessage.value = 'Награда не пришла с сервера'
    notificationStore.notify(caseMessage.value, {
      title: 'Кейсы',
      variant: 'error',
    })
    return
  }

  wonReward.value = reward

  if (quickOpen.value) {
    isOpening.value = false
    resultReady.value = true
    isRouletteVisible.value = false
    caseMessage.value = reward?.name ? `Вы выиграли: ${reward.name}` : 'Выигрыш определён'
    return
  }

  rouletteItems.value = buildRouletteItems(reward)
  isRouletteVisible.value = true

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const rootRect = rouletteRoot.value?.getBoundingClientRect()
      const targetCard = rouletteTrack.value?.children?.[rouletteTargetIndex] as HTMLElement | undefined
      const markerCenter = rootRect ? rootRect.width / 2 : 0
      const targetCenter = targetCard ? targetCard.offsetLeft + (targetCard.offsetWidth / 2) : 0
      rouletteOffset.value = `${Math.round(markerCenter - targetCenter)}px`
      isRouletteMoving.value = true
    })
  })

  openingTimer = window.setTimeout(() => {
    finishRouletteSpin()
  }, rouletteTransitionMs + 350)
}

function handleCaseResult(event: Event) {
  try {
    const detail = (event as CustomEvent).detail
    const payload = typeof detail === 'string' ? JSON.parse(detail || '{}') : detail as any
    const key = JSON.stringify([
      payload?.action,
      payload?.success,
      payload?.case?.id,
      payload?.amount,
      payload?.message,
      payload?.reward?.id,
      payload?.reward?.name,
      payload?.donate,
    ])
    const now = Date.now()

    if (key === lastCaseResultKey && now - lastCaseResultAt < 1200) {
      return
    }

    lastCaseResultKey = key
    lastCaseResultAt = now
    applyCaseResult(payload)
  } catch {
    caseMessage.value = 'Не удалось обработать результат кейса'
  }
}

watch(
  [selectedCategory, selectedRarity, selectedSort],
  async () => {
    visibleCaseCount.value = initialVisibleCaseCount
    await nextTick()
    observeLoadMoreTarget()
  },
)

watch(
  [hasMoreCases, selectedCase],
  async () => {
    await nextTick()
    observeLoadMoreTarget()
  },
)

watch(
  serverOwnedCases,
  (value) => {
    ownedCases.value = { ...value }
  },
  { immediate: true },
)

onMounted(async () => {
  window.addEventListener('twinkle:f2:case:result', handleCaseResult)
  await nextTick()
  observeLoadMoreTarget()
})

onBeforeUnmount(() => {
  window.removeEventListener('twinkle:f2:case:result', handleCaseResult)
  caseObserver?.disconnect()
  window.clearTimeout(openingTimer)
})
</script>

<style scoped>
.shop-cases {
  --shop-cases-surface: rgb(8 8 9 / 92%);
  --shop-cases-surface-soft: rgb(255 255 255 / 5%);
  --shop-cases-border: rgb(255 255 255 / 5%);
  --shop-cases-border-strong: rgb(255 255 255 / 10%);
  --shop-cases-text-muted: rgb(255 255 255 / 58%);
  --shop-cases-accent: #6860de;
  --shop-cases-accent-deep: #413ac2;
  --shop-cases-accent-soft: rgb(104 96 222 / 12%);
  --shop-cases-shadow: 0 0.9vh 2.2vh rgb(0 0 0 / 22%);

  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-auto-flow: row;
  grid-auto-rows: max-content;
  align-content: start;
  gap: 1.15vh;
  padding: 1.25vh 1.55vh 2vh;
  background:
    radial-gradient(70vh 30vh at 52% 16%, rgb(104 96 222 / 5%), transparent 68%),
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 22%);
  overflow: hidden auto;
  scrollbar-color: rgb(255 255 255 / 18%) rgb(255 255 255 / 4%);
  scrollbar-width: thin;
}

.shop-cases::-webkit-scrollbar {
  width: 0.55vh;
}

.shop-cases::-webkit-scrollbar-track {
  background: rgb(255 255 255 / 4%);
}

.shop-cases::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgb(255 255 255 / 18%);
}

.shop-cases::-webkit-scrollbar-thumb:hover {
  background: rgb(255 255 255 / 28%);
}

.shop-cases:has(.shop-cases__header) {
  padding-top: 1.7vh;
}

.shop-cases:has(.shop-cases__header) .shop-cases__ticker {
  height: 6.65vh;
  min-height: 6.65vh;
  opacity: 0.72;
}

.shop-cases:has(.shop-cases__header) .shop-cases-ticker-card {
  height: 5.75vh;
}

.shop-cases__header {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 1.1vh;
}

.shop-cases__header h1 {
  margin: 0;
  color: #ffffff;
  font-size: 2.55vh;
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
}

.shop-cases__back {
  width: 3vh;
  height: 3vh;
  border: 1px solid var(--shop-cases-border);
  border-radius: 50%;
  background: var(--shop-cases-surface-soft);
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}

.shop-cases__back:hover {
  border-color: var(--shop-cases-border-strong);
  background: rgb(255 255 255 / 8%);
}

.shop-cases-price-row {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.45vh;
  line-height: 1;
  white-space: nowrap;
}

.shop-cases-price-row b {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

.shop-cases-price-row s {
  flex: 0 0 auto;
  line-height: 1;
}

.shop-cases-price-row :deep(.twinkle-icon) {
  flex: 0 0 auto;
}

.shop-case-open__button,
.shop-case-result button {
  border: 0;
  border-radius: 0.65vh;
  background: rgb(255 255 255 / 7%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}

.shop-cases__ticker {
  position: relative;
  height: 7.5vh;
  min-height: 7.5vh;
  padding: 0.45vh 0.55vh 0.45vh 3.25vh;
  border-radius: 0.8vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 42%),
    rgb(0 0 0 / 32%);
  box-shadow: inset 0 0 0 0.1vh var(--shop-cases-border);
  overflow: hidden;
}

.shop-cases__ticker-track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(16.6vh, 19.9vh);
  gap: 0.55vh;
  height: 100%;
  width: max-content;
  transform: translateX(0);
}

.shop-cases__ticker-label {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 2;
  width: 2.35vh;
  display: grid;
  place-items: center;
  border-radius: 0.8vh 0 0 0.8vh;
  background: var(--shop-cases-surface);
  color: #ffffff;
  font-size: 0.9vh;
  font-weight: 600;
  box-shadow: inset -0.1vh 0 0 rgb(255 255 255 / 6%);
  writing-mode: vertical-rl;
}

.shop-cases__ticker-label::before {
  width: 0.55vh;
  height: 0.55vh;
  margin-bottom: 0.55vh;
  border-radius: 50%;
  background: var(--shop-cases-accent);
  content: "";
}

.shop-cases-ticker-card {
  height: 6.6vh;
  min-width: 0;
  display: grid;
  grid-template-rows: 3.3vh minmax(0, 1fr);
  align-items: center;
  justify-items: center;
  gap: 0.35vh;
  padding: 0.75vh;
  border-radius: 0.65vh;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 5%), rgb(255 255 255 / 2%)),
    rgb(18 18 20 / 88%);
  box-shadow: inset 0 0 0 0.1vh var(--shop-cases-border);
  box-sizing: border-box;
}

.shop-cases-ticker-card__icon {
  width: 4.8vh;
  height: 3.3vh;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.7vh;
  background: rgb(255 255 255 / 7%);
}

.shop-cases-ticker-card__icon img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.shop-cases-ticker-card strong {
  overflow: hidden;
  max-width: 100%;
  color: #ffffff;
  font-size: 1.05vh;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes shop-cases-ticker-scroll {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(calc(-50% - 0.275vh));
  }
}

@media (prefers-reduced-motion: reduce) {
  .shop-cases__ticker-track,
  .shop-cases-recommendations__list {
    animation: none;
  }

  .shop-case-card,
  .shop-case-recommendation,
  .shop-cases__load-more span {
    animation: none;
  }
}

.shop-cases-filters {
  display: grid;
  grid-template-columns: minmax(28vh, 1fr) minmax(18vh, 22vh) minmax(18vh, 22vh);
  align-items: start;
  gap: 0.85vh;
  min-height: 5.4vh;
  padding: 0.65vh;
  border: 1px solid var(--shop-cases-border);
  border-radius: 0.8vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 48%),
    rgb(0 0 0 / 24%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
  margin-bottom: 0.15vh;
}

.shop-cases-filter {
  min-width: 0;
  display: grid;
  height: 100%;
  gap: 0.55vh;
  padding: 0.65vh 0.72vh;
  border: 1px solid var(--shop-cases-border);
  border-radius: 0.65vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 42%),
    rgb(255 255 255 / 3%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
}

.shop-cases-filter > span {
  color: var(--shop-cases-text-muted);
  font-size: 0.92vh;
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
}

.shop-cases-filter > div {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45vh;
  min-width: 0;
}

.shop-cases-filter button {
  min-height: 2.55vh;
  min-width: 0;
  border: 1px solid var(--shop-cases-border);
  border-radius: 0.52vh;
  background: rgb(255 255 255 / 5%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 1.02vh;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.shop-cases-filter button {
  padding: 0 0.82vh;
  transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}

.shop-cases-filter button:hover,
.shop-cases-filter__option--active {
  border-color: var(--shop-cases-border-strong) !important;
  background: rgb(255 255 255 / 10%) !important;
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 4%);
}

.shop-cases-filter--compact {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.shop-cases-recommendations {
  display: grid;
  gap: 1.18vh;
  padding: 1.18vh 1.2vh 1.25vh;
  border: 1px solid var(--shop-cases-border);
  border-radius: 0.8vh;
  background:
    radial-gradient(34vh 12vh at 12% 0%, rgb(104 96 222 / 10%), transparent 70%),
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 42%),
    rgb(0 0 0 / 30%);
  box-shadow:
    inset 0 0 0 0.1vh rgb(255 255 255 / 2%),
    0 0.9vh 2vh rgb(0 0 0 / 18%);
  overflow: hidden;
}

.shop-cases-recommendations__header {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.9vh;
  padding-bottom: 0.85vh;
  border-bottom: 1px solid rgb(255 255 255 / 6%);
}

.shop-cases-recommendations__icon {
  width: 2.9vh;
  height: 2.9vh;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.65vh;
  background:
    radial-gradient(2.8vh 2.2vh at 50% 0%, rgb(104 96 222 / 24%), transparent 76%),
    rgb(255 255 255 / 6%);
  color: #ffffff;
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 3%);
}

.shop-cases-recommendations__header div {
  min-width: 0;
  display: grid;
  gap: 0.28vh;
}

.shop-cases-recommendations__header h2,
.shop-cases-recommendations__header p {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-cases-recommendations__header h2 {
  color: #ffffff;
  font-size: 1.5vh;
  font-weight: 700;
  line-height: 1.05;
}

.shop-cases-recommendations__header p {
  color: var(--shop-cases-text-muted);
  font-size: 0.98vh;
  font-weight: 600;
  line-height: 1.15;
}

.shop-cases-recommendations__meta {
  min-height: 2.3vh;
  display: inline-flex;
  align-items: center;
  padding: 0 0.78vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 999px;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 62%);
  font-size: 0.9vh;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.shop-cases-recommendations__list {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 35.4vh;
  gap: 0.85vh;
  width: max-content;
  transform: translateX(0);
}

@keyframes shop-cases-recommendations-scroll {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(calc(-50% - 0.425vh));
  }
}

.shop-case-recommendation {
  position: relative;
  min-height: 10.6vh;
  display: grid;
  grid-template-columns: 7.6vh minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "label label"
    "image content"
    "image price";
  align-items: center;
  column-gap: 0.95vh;
  row-gap: 0.52vh;
  padding: 0.9vh 1vh;
  border: 1px solid var(--shop-cases-border);
  border-radius: 0.75vh;
  background:
    radial-gradient(15vh 8vh at 6% 62%, var(--shop-cases-accent-soft), transparent 78%),
    linear-gradient(180deg, rgb(255 255 255 / 5%), transparent 46%),
    rgb(8 8 9 / 90%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
  overflow: hidden;
}

.shop-case-recommendation:hover {
  border-color: var(--shop-cases-border-strong);
  background:
    radial-gradient(16vh 8vh at 6% 62%, rgb(104 96 222 / 16%), transparent 78%),
    linear-gradient(180deg, rgb(255 255 255 / 6%), transparent 46%),
    rgb(10 10 12 / 96%);
}

.shop-case-recommendation__label {
  grid-area: label;
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  padding: 0.35vh 0.55vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 999px;
  background: rgb(255 255 255 / 6%);
  color: rgb(255 255 255 / 76%);
  font-size: 0.82vh;
  font-weight: 700;
  line-height: 1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.shop-case-recommendation__label--discount {
  border-color: rgb(255 211 61 / 18%);
  background: rgb(255 211 61 / 8%);
  color: #ffe28a;
}

.shop-case-recommendation__label--popular {
  border-color: rgb(58 167 255 / 18%);
  background: rgb(58 167 255 / 8%);
  color: #a8ddff;
}

.shop-case-recommendation__label--choice {
  border-color: rgb(104 96 222 / 24%);
  background: rgb(104 96 222 / 12%);
  color: #c8b8ff;
}

.shop-case-recommendation__label--trend {
  border-color: rgb(0 190 145 / 18%);
  background: rgb(0 190 145 / 8%);
  color: #b8ffed;
}

.shop-case-recommendation__image {
  grid-area: image;
  width: 7vh;
  max-height: 6.7vh;
  align-self: center;
  object-fit: contain;
}

.shop-case-recommendation__image--premium {
  transform: scale(1.04) translateY(-0.08vh);
}

.shop-case-recommendation__image--spring {
  transform: scale(0.98) translateX(0.18vh);
}

.shop-case-recommendation__image--summer {
  transform: scale(1.02) translateX(-0.16vh);
}

.shop-case-recommendation__image--autumn {
  transform: scale(0.96) translateY(0.08vh);
}

.shop-case-recommendation__content {
  grid-area: content;
  min-width: 0;
  display: grid;
  align-self: end;
  gap: 0.32vh;
}

.shop-case-recommendation strong {
  overflow: hidden;
  color: #ffffff;
  font-size: 1.22vh;
  font-weight: 600;
  line-height: 1.12;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-case-recommendation small {
  overflow: hidden;
  color: var(--shop-cases-text-muted);
  font-size: 0.95vh;
  font-weight: 600;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-case-recommendation__price {
  grid-area: price;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-self: start;
  align-self: start;
  gap: 0.52vh;
  color: #ffffff;
  line-height: 1;
}

.shop-case-recommendation__price s {
  color: rgb(255 255 255 / 38%);
  font-size: 1.02vh;
  font-weight: 600;
  line-height: 1;
  text-decoration-color: rgb(104 96 222 / 74%);
  text-decoration-thickness: 0.14vh;
}

.shop-case-recommendation__price b {
  color: #ffffff;
  font-size: 1.52vh;
  font-weight: 700;
}

.shop-case-recommendation__price .shop-cases-price-row {
  gap: 0.38vh;
}

.shop-cases__grid,
.shop-case-content {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1vh;
}

.shop-cases__grid {
  align-content: start;
  padding-bottom: 3vh;
}

.shop-cases__empty {
  margin: 0;
  padding: 2vh;
  border: 1px solid var(--shop-cases-border);
  border-radius: 0.75vh;
  background: rgb(0 0 0 / 30%);
  color: var(--shop-cases-text-muted);
  font-size: 1.18vh;
  font-weight: 600;
  text-align: center;
}

.shop-cases__load-more {
  min-height: 4.8vh;
  display: grid;
  place-items: center;
}

.shop-cases__load-more span {
  width: 2.4vh;
  height: 2.4vh;
  border: 0.24vh solid rgb(255 255 255 / 10%);
  border-top-color: rgb(255 255 255 / 58%);
  border-radius: 50%;
  animation: shop-cases-loader 780ms linear infinite;
}

@keyframes shop-cases-loader {
  to {
    transform: rotate(360deg);
  }
}

.shop-case-card,
.shop-reward-card {
  position: relative;
  min-height: 28.4vh;
  border: 1px solid var(--shop-cases-border);
  border-radius: 0.65vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 32%),
    var(--shop-cases-surface);
  color: #ffffff;
  box-shadow:
    inset 0 0 0 0.1vh rgb(255 255 255 / 2%),
    var(--shop-cases-shadow);
  overflow: hidden;
}

.shop-case-card {
  --case-rarity-color: rgb(255 255 255 / 78%);
  --case-rarity-soft: rgb(255 255 255 / 10%);

  position: relative;
  display: grid;
  grid-template-rows: 0.28vh auto auto minmax(15.4vh, 1fr);
  justify-items: center;
  gap: 0.8vh;
  padding: 1.2vh;
  cursor: pointer;
  transition:
    background 160ms ease,
    box-shadow 160ms ease;
}

.shop-case-card--rare {
  --case-rarity-color: #3aa7ff;
  --case-rarity-soft: rgb(58 167 255 / 13%);
}

.shop-case-card--epic {
  --case-rarity-color: #ff4f6d;
  --case-rarity-soft: rgb(255 79 109 / 13%);
}

.shop-case-card--legendary {
  --case-rarity-color: #ffd33d;
  --case-rarity-soft: rgb(255 211 61 / 14%);
}

.shop-case-card__rarity-line {
  width: 100%;
  height: 0.28vh;
  border-radius: 999px;
  background: var(--case-rarity-color);
  pointer-events: none;
}

.shop-case-card:hover {
  background:
    linear-gradient(180deg, var(--case-rarity-soft), transparent 30%),
    radial-gradient(18vh 14vh at 50% 48%, var(--case-glow, rgb(104 96 222 / 8%)), transparent 72%),
    linear-gradient(180deg, rgb(255 255 255 / 5%), transparent 32%),
    rgb(10 10 12 / 96%);
  box-shadow:
    inset 0 0 0 0.1vh var(--shop-cases-border-strong),
    0 0 1.2vh var(--case-glow, rgb(255 255 255 / 8%));
}

@keyframes shop-case-card-enter {
  from {
    opacity: 0;
    transform: translateY(calc(1.1vh + var(--card-drift, 0vh))) translateX(calc(var(--card-drift, 0vh) * -1)) scale(0.975);
  }

  to {
    opacity: 1;
    transform: translateY(0) translateX(0) scale(1);
  }
}

.shop-case-card__badges {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.55vh;
  pointer-events: none;
}

.shop-case-card__badges-left {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4vh;
}

.shop-case-card__owned,
.shop-case-card__timer,
.shop-case-card__discount {
  max-width: 100%;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  padding: 0.38vh 0.58vh;
  border-radius: 0.5vh;
  background: rgb(255 255 255 / 7%);
  color: #ffffff;
  font-size: 0.88vh;
  font-weight: 600;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-shadow: inset 0 0 0 0.1vh var(--shop-cases-border);
}

.shop-case-card__timer {
  background: rgb(0 190 145 / 14%);
}

.shop-case-card__discount {
  flex: 0 0 auto;
  border-color: rgb(255 211 61 / 18%);
  background: rgb(255 211 61 / 10%);
  color: #ffe28a;
}

.shop-case-card__labels {
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35vh;
  pointer-events: none;
}

.shop-case-card__labels b {
  max-width: 100%;
  min-height: 1.7vh;
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  padding: 0 0.52vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 999px;
  background: rgb(0 0 0 / 42%);
  color: rgb(255 255 255 / 68%);
  font-size: 0.78vh;
  font-weight: 700;
  line-height: 1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.shop-case-card__content {
  width: 100%;
  min-width: 0;
  display: grid;
  justify-items: center;
  gap: 0.58vh;
  padding: 0.85vh 0.85vh 0.95vh;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 0.65vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 62%),
    rgb(0 0 0 / 18%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
}

.shop-case-card__label--rare {
  border-color: rgb(58 167 255 / 28%) !important;
  background: rgb(58 167 255 / 14%) !important;
  color: #a8ddff !important;
}

.shop-case-card__label--epic {
  border-color: rgb(125 77 255 / 30%) !important;
  background: rgb(125 77 255 / 15%) !important;
  color: #c8b8ff !important;
}

.shop-case-card__label--legendary {
  border-color: rgb(255 211 61 / 30%) !important;
  background: rgb(255 211 61 / 13%) !important;
  color: #ffe28a !important;
}

.shop-case-card__visual {
  width: 100%;
  min-height: 15.4vh;
  display: grid;
  place-items: center;
  border-radius: 0.7vh;
  background:
    radial-gradient(15vh 10vh at 50% 58%, var(--case-glow), transparent 70%),
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent),
    rgb(255 255 255 / 2%);
}

.shop-case-card__image {
  max-width: 90%;
  max-height: 13.4vh;
  object-fit: contain;
}

.shop-case-card__visual--default,
.shop-case-detail__visual--default {
  --case-glow: rgb(255 255 255 / 16%);
}

.shop-case-card__visual--premium,
.shop-case-detail__visual--premium {
  --case-glow: rgb(104 96 222 / 26%);
}

.shop-case-card__visual--spring,
.shop-case-detail__visual--spring {
  --case-glow: rgb(58 167 255 / 26%);
}

.shop-case-card__visual--summer,
.shop-case-detail__visual--summer {
  --case-glow: rgb(0 170 255 / 44%);
}

.shop-case-card__visual--autumn,
.shop-case-detail__visual--autumn {
  --case-glow: rgb(255 211 61 / 24%);
}

.shop-case-card__content strong,
.shop-case-card__price {
  color: #ffffff;
  font-size: 1.16vh;
  font-weight: 600;
}

.shop-case-card__content > strong {
  min-width: 0;
  max-width: 100%;
  min-height: 2.5vh;
  max-height: 2.5vh;
  display: -webkit-box;
  overflow: hidden;
  text-align: center;
  line-height: 1.15;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.shop-case-card__price {
  max-width: 100%;
  overflow: hidden;
  color: #ffffff;
  font-size: 1.54vh;
  justify-content: center;
}

.shop-case-card__price--discount {
  padding: 0.34vh 0.58vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 999px;
  background: rgb(255 255 255 / 4%);
}

.shop-case-card__price s {
  color: rgb(255 255 255 / 34%);
  font-size: 1.08vh;
  font-weight: 600;
  text-decoration-color: rgb(104 96 222 / 74%);
  text-decoration-thickness: 0.14vh;
}

.shop-case-detail {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.4vh;
  align-content: start;
  min-height: 32vh;
  padding: 2.2vh 3vh;
  border: 1px solid var(--shop-cases-border);
  border-radius: 0.8vh;
  background:
    radial-gradient(40vh 18vh at 48% 55%, var(--case-glow, rgb(104 96 222 / 8%)), transparent 68%),
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 46%),
    rgb(5 5 6 / 78%);
  box-shadow:
    inset 0 0 0 0.1vh rgb(255 255 255 / 3%),
    var(--shop-cases-shadow);
  overflow: hidden;
}

.shop-case-detail__preview {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 28vh minmax(24vh, 1fr);
  align-items: center;
  justify-content: center;
  gap: 4.4vh;
  min-width: 0;
  max-width: 72vh;
  justify-self: center;
}

.shop-case-panel-enter-active,
.shop-case-panel-leave-active {
  transition:
    opacity 280ms cubic-bezier(.22, .61, .36, 1),
    transform 280ms cubic-bezier(.22, .61, .36, 1);
}

.shop-case-panel-enter-from,
.shop-case-panel-leave-to {
  opacity: 0;
  transform: translateY(0.28vh) scale(0.996);
}

.shop-case-result-enter-active,
.shop-case-result-leave-active {
  overflow: hidden;
  transition:
    max-height 320ms cubic-bezier(.22, .61, .36, 1),
    opacity 260ms cubic-bezier(.22, .61, .36, 1),
    padding-top 320ms cubic-bezier(.22, .61, .36, 1),
    padding-bottom 320ms cubic-bezier(.22, .61, .36, 1),
    transform 320ms cubic-bezier(.22, .61, .36, 1);
}

.shop-case-result-enter-from,
.shop-case-result-leave-to {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
  transform: translateY(-0.22vh);
}

.shop-case-result-enter-to,
.shop-case-result-leave-from {
  max-height: 9.2vh;
  opacity: 1;
  transform: translateY(0);
}

.shop-case-detail__visual {
  position: relative;
  min-height: 18vh;
  display: grid;
  place-items: center;
  border-radius: 0;
  background:
    radial-gradient(17vh 8vh at 50% 76%, var(--case-glow), transparent 72%);
}

.shop-case-detail__visual img {
  max-width: 29vh;
  max-height: 15.5vh;
  object-fit: contain;
}

.shop-case-detail__owned {
  position: absolute;
  left: 50%;
  bottom: 0.7vh;
  padding: 0.45vh 0.7vh;
  border-radius: 0.45vh;
  background: rgb(255 255 255 / 7%);
  color: #ffffff;
  font-size: 0.95vh;
  font-weight: 600;
  line-height: 1;
  transform: translateX(-50%);
}

.shop-case-detail__preview article {
  min-width: 0;
  max-width: 26vh;
  padding: 2.1vh 2.2vh;
  border-radius: 0.85vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 42%),
    rgb(255 255 255 / 4%);
  box-shadow: inset 0 0 0 0.1vh var(--shop-cases-border);
}

.shop-case-detail__preview strong,
.shop-case-content-title {
  margin: 0;
  color: #ffffff;
  font-size: 1.65vh;
  font-weight: 600;
  line-height: 1.1;
  text-transform: uppercase;
}

.shop-case-detail__preview p {
  margin: 1vh 0 0;
  color: var(--shop-cases-text-muted);
  font-size: 1.14vh;
  font-weight: 600;
  line-height: 1.45;
}

.shop-case-open {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 22vh minmax(0, 1fr);
  align-items: center;
  gap: 2vh;
  min-height: 5.5vh;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.shop-case-open__controls {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 0.75vh;
  color: #ffffff;
  font-size: 1.16vh;
  font-weight: 600;
  text-transform: uppercase;
}

.shop-case-open__controls > div {
  display: flex;
  gap: 0.45vh;
}

.shop-case-open__controls button {
  width: 3vh;
  height: 3vh;
  border: 1px solid var(--shop-cases-border);
  border-radius: 0.55vh;
  background: var(--shop-cases-surface-soft);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}

.shop-case-open__amount--active {
  background: rgb(255 255 255 / 12%) !important;
  border-color: var(--shop-cases-border-strong) !important;
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 7%);
}

.shop-case-open__button {
  min-height: 4.7vh;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 10%), transparent 70%),
    rgb(255 255 255 / 8%);
  box-shadow: inset 0 0 0 0.1vh var(--shop-cases-border);
  text-transform: uppercase;
  transition: background 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
}

.shop-case-open__button:hover:not(:disabled) {
  background:
    linear-gradient(135deg, rgb(255 255 255 / 13%), transparent 70%),
    rgb(255 255 255 / 10%);
  box-shadow: inset 0 0 0 0.1vh var(--shop-cases-border-strong);
}

.shop-case-open__button:disabled {
  cursor: default;
  opacity: 0.72;
}

.shop-case-open__button--idle {
  background: rgb(255 255 255 / 8%);
  box-shadow: none;
  cursor: default;
  opacity: 0.7;
}

@keyframes shop-case-ready-pulse {
  from { transform: translateY(0); }
  to { transform: translateY(-0.15vh); }
}

.shop-case-open__quick {
  display: flex;
  align-items: center;
  gap: 1vh;
  color: #ffffff;
  font-size: 1.12vh;
  font-weight: 600;
  text-transform: uppercase;
}

.shop-case-open__quick input {
  display: none;
}

.shop-case-open__quick i {
  position: relative;
  width: 3.6vh;
  height: 2vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 10%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 7%);
}

.shop-case-open__quick i::before {
  position: absolute;
  left: 0.3vh;
  top: 0.3vh;
  width: 1.4vh;
  height: 1.4vh;
  border-radius: 50%;
  background: rgb(255 255 255 / 78%);
  content: "";
  transition: transform 140ms ease, background 140ms ease;
}

.shop-case-open__quick input:checked + i {
  background: rgb(104 96 222 / 36%);
}

.shop-case-open__quick input:checked + i::before {
  background: #ffffff;
  transform: translateX(1.6vh);
}

.shop-case-open__status {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1vh;
  color: var(--shop-cases-text-muted);
  font-size: 1.08vh;
  font-weight: 600;
  line-height: 1;
}

.shop-case-open__status b {
  color: var(--shop-cases-accent);
  font-weight: 600;
}

.shop-case-roulette {
  position: relative;
  display: grid;
  min-height: 18.5vh;
  border: 1px solid var(--shop-cases-border);
  border-radius: 1vh;
  background:
    radial-gradient(34vh 12vh at 50% 50%, rgb(104 96 222 / 5%), transparent 72%),
    rgb(6 6 8 / 84%);
  box-shadow:
    inset 0 0 0 0.1vh rgb(255 255 255 / 3%),
    var(--shop-cases-shadow);
  contain: layout paint;
  overflow: hidden;
}

.shop-case-roulette__beam {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 49.85%, rgb(255 255 255 / 10%) 50%, transparent 50.15%);
  pointer-events: none;
}

.shop-case-roulette__marker {
  position: absolute;
  left: 50%;
  top: 1.2vh;
  bottom: 1.2vh;
  z-index: 4;
  width: 0.2vh;
  border-radius: 999px;
  background: #ffffff;
}

.shop-case-roulette__track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 18vh;
  gap: 1vh;
  align-items: center;
  padding: 1.7vh;
  backface-visibility: hidden;
  transform: translate3d(0, 0, 0);
  transition: transform 5200ms cubic-bezier(.12, .72, .18, 1);
}

.shop-case-roulette--active .shop-case-roulette__track {
  will-change: transform;
}

.shop-case-roulette--quick .shop-case-roulette__track {
  transition-duration: 1200ms;
}

.shop-case-roulette--active .shop-case-roulette__track {
  transform: translate3d(var(--roulette-offset), 0, 0);
}

.shop-case-roulette .shop-reward-card {
  box-shadow: none;
}

.shop-case-result {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 9vh minmax(0, 1fr) auto;
  align-items: center;
  justify-content: stretch;
  gap: 1.2vh;
  min-height: 7.2vh;
  padding: 0.9vh 1vh;
  border: 1px solid var(--shop-cases-border);
  border-radius: 0.9vh;
  background:
    radial-gradient(24vh 10vh at 8% 50%, rgb(104 96 222 / 12%), transparent 72%),
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 52%),
    rgb(0 0 0 / 52%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 3%);
}

.shop-case-result__preview {
  width: 8.2vh;
  height: 5.6vh;
  display: grid;
  place-items: center;
  border-radius: 0.65vh;
  background: rgb(255 255 255 / 5%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 4%);
}

.shop-case-result__preview img {
  max-width: 92%;
  max-height: 5vh;
  object-fit: contain;
}

.shop-case-result__preview b {
  color: #ffffff;
  font-size: 1.6vh;
  font-weight: 700;
  line-height: 1;
}

.shop-case-result__info {
  min-width: 0;
  display: grid;
  gap: 0.35vh;
}

.shop-case-result__info span {
  color: var(--shop-cases-accent);
  font-size: 0.9vh;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}

.shop-case-result__info strong {
  overflow: hidden;
  color: #ffffff;
  font-size: 1.24vh;
  font-weight: 600;
  line-height: 1.1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.shop-case-result__info p {
  overflow: hidden;
  margin: 0;
  color: var(--shop-cases-text-muted);
  font-size: 0.98vh;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-case-result__actions {
  display: flex;
  gap: 0.8vh;
}

.shop-case-result button {
  min-width: 15vh;
  min-height: 3.9vh;
  background: rgb(255 255 255 / 10%);
  font-size: 1.08vh;
  text-transform: uppercase;
}

.shop-case-result button:last-child {
  background: rgb(255 255 255 / 14%);
  box-shadow: inset 0 0 0 0.1vh var(--shop-cases-border-strong);
}

.shop-case-content-title {
  text-align: center;
}

.shop-reward-card {
  min-height: 13.2vh;
  display: grid;
  grid-template-rows: 1fr auto;
  align-items: end;
  padding: 1vh;
  border-radius: 0.75vh;
}

.shop-reward-card__rarity {
  position: absolute;
  left: 1vh;
  top: 1vh;
  width: 1.7vh;
  height: 0.35vh;
  border-radius: 999px;
  background: #20d8ad;
}

.shop-reward-card--legendary .shop-reward-card__rarity {
  background: #ffd33d;
}

.shop-reward-card--epic .shop-reward-card__rarity {
  background: #7d4dff;
}

.shop-reward-card--common .shop-reward-card__rarity {
  background: #a0a0a0;
}

.shop-reward-card img {
  max-width: 90%;
  max-height: 8vh;
  justify-self: center;
  object-fit: contain;
}

.shop-reward-card strong {
  color: #ffffff;
  font-size: 1.05vh;
  line-height: 1.2;
}

.shop-reward-card__money {
  align-self: center;
  justify-self: center;
  color: #ffffff;
  font-size: 2.45vh;
  font-weight: 600;
}

.shop-cases :is(p, small, [class*="__meta"], [class*="__description"], [class*="__caption"]) {
  line-height: 1.35;
}

</style>
