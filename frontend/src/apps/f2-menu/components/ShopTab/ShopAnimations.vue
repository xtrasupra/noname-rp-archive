<template>
  <section class="shop-animations-store">
    <h1 class="f2-menu__title">Анимации</h1>

    <header class="shop-animations-store__toolbar">
      <div class="shop-animations-store__filters">
        <ShopCaseSelect
          v-model="selectedCategory"
          label="Категория"
          :options="categoryOptions"
        />
        <ShopCaseSelect
          v-model="selectedSort"
          label="Сортировка"
          :options="sortOptions"
        />
      </div>

      <div class="shop-animations-store__summary">
        <span>Куплено</span>
        <strong>{{ purchasedAnimationIds.length }} / {{ animationShopItems.length }}</strong>
      </div>
    </header>

    <section v-if="featuredAnimation" class="shop-animations-store__spotlight">
      <div>
        <span>Подборка недели</span>
        <h2>{{ featuredAnimation.name }}</h2>
        <p>Анимация для быстрых RP-сцен, общения с игроками и кругового меню.</p>
      </div>

      <button
        type="button"
        :disabled="isPurchased(featuredAnimation.id)"
        @click="buyAnimation(featuredAnimation)"
      >
        {{ isPurchased(featuredAnimation.id) ? 'Куплено' : 'Купить' }}
        <span v-if="!isPurchased(featuredAnimation.id)">
          {{ featuredAnimation.price }}
          <BaseIcon :icon="DollarSign" size="xs" :stroke-width="2.45" />
        </span>
      </button>
    </section>

    <div v-if="filteredAnimations.length" class="shop-animations-store__grid">
      <article
        v-for="item in filteredAnimations"
        :key="item.id"
        class="shop-animation-card"
        :class="{ 'shop-animation-card--purchased': isPurchased(item.id) }"
      >
        <div class="shop-animation-card__top">
          <span>{{ item.category }}</span>
          <b v-if="isPurchased(item.id)">Куплено</b>
        </div>

        <span class="shop-animation-card__mock" aria-hidden="true">
          <span>GIF</span>
        </span>

        <div class="shop-animation-card__body">
          <strong>{{ item.name }}</strong>
          <p>{{ item.description }}</p>
        </div>

        <div class="shop-animation-card__footer">
          <span class="shop-animation-card__price">
            <b>{{ item.price }}</b>
            <BaseIcon :icon="DollarSign" size="xs" :stroke-width="2.45" />
          </span>

          <button
            type="button"
            :disabled="isPurchased(item.id)"
            @click="buyAnimation(item)"
          >
            {{ isPurchased(item.id) ? 'Куплено' : 'Купить' }}
          </button>
        </div>
      </article>
    </div>
    <div v-else class="shop-animations-store__empty">
      Каталог анимаций не загружен
    </div>  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

import { BaseIcon, DollarSign } from '@/shared/icons'
import { useNotificationStore } from '@/stores/notification.store'

import ShopCaseSelect from './ShopCaseSelect.vue'

type AnimationCategoryFilter = 'all' | 'actions' | 'poses' | 'positive' | 'other' | 'exclusive'
type AnimationSort = 'popular' | 'priceAsc' | 'priceDesc' | 'nameAsc'

type AnimationShopItem = {
  category: string
  description: string
  id: string
  name: string
  pose?: string
  popularity: number
  price: number
  purchased?: boolean
  section?: string
  shortName?: string
}

const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()

const notificationStore = useNotificationStore()

const selectedCategory = ref<AnimationCategoryFilter>('all')
const selectedSort = ref<AnimationSort>('popular')

const categoryOptions: Array<{ description: string, label: string, value: AnimationCategoryFilter }> = [
  { value: 'all', label: 'Все анимации', description: 'Полный серверный каталог движений' },
  { value: 'actions', label: 'Действия', description: 'RP-действия персонажа' },
  { value: 'poses', label: 'Позы', description: 'Стойки и положение тела' },
  { value: 'positive', label: 'Позитивные', description: 'Жесты общения' },
  { value: 'other', label: 'Прочие', description: 'Дополнительные сценарии' },
  { value: 'exclusive', label: 'Эксклюзивные', description: 'Редкие анимации' },
]

const sortOptions: Array<{ description: string, label: string, value: AnimationSort }> = [
  { value: 'popular', label: 'Популярные', description: 'Чаще покупают игроки' },
  { value: 'priceAsc', label: 'Сначала дешевые', description: 'Цена по возрастанию' },
  { value: 'priceDesc', label: 'Сначала дорогие', description: 'Цена по убыванию' },
  { value: 'nameAsc', label: 'По названию', description: 'А-Я' },
]

const categoryFilterMap: Partial<Record<AnimationCategoryFilter, string>> = {
  actions: 'actions',
  exclusive: 'exclusive',
  other: 'other',
  poses: 'poses',
  positive: 'positive',
}

const animationShopPayload = computed(() => (props.payload as any)?.shop?.animations ?? {})
const animationShopItems = computed<AnimationShopItem[]>(() => {
  const items = animationShopPayload.value.items

  return Array.isArray(items) ? items as AnimationShopItem[] : []
})
const featuredAnimation = computed<AnimationShopItem | null>(() => {
  return animationShopPayload.value.featured || animationShopItems.value[0] || null
})
const purchasedAnimationIds = computed<string[]>(() => {
  const ids = animationShopPayload.value.purchasedIds

  return Array.isArray(ids) ? ids.map(String) : []
})

const filteredAnimations = computed(() => {
  const category = categoryFilterMap[selectedCategory.value]
  const byCategory = category
    ? animationShopItems.value.filter((item) => item.section === category)
    : animationShopItems.value

  return [...byCategory].sort((left, right) => {
    if (selectedSort.value === 'priceAsc') {
      return left.price - right.price
    }

    if (selectedSort.value === 'priceDesc') {
      return right.price - left.price
    }

    if (selectedSort.value === 'nameAsc') {
      return left.name.localeCompare(right.name, 'ru')
    }

    return right.popularity - left.popularity
  })
})

function isPurchased(animationId: string) {
  return purchasedAnimationIds.value.includes(animationId)
    || Boolean(animationShopItems.value.find((item) => item.id === animationId)?.purchased)
}

function buyAnimation(item: AnimationShopItem) {
  if (isPurchased(item.id)) {
    return
  }

  notificationStore.notify(`${item.name} куплена`, {
    title: 'Магазин анимаций',
    variant: 'success',
  })
}
</script>

<style scoped>
.shop-animations-store {
  position: relative;
  min-height: 80vh;
  padding-bottom: 2vh;
}

.shop-animations-store__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 13vh;
  align-items: end;
  gap: 1.2vh;
  margin-top: 3.35vh;
}

.shop-animations-store__filters {
  display: grid;
  grid-template-columns: minmax(0, 27vh) minmax(0, 29vh);
  gap: 1vh;
}

.shop-animations-store__summary,
.shop-animations-store__spotlight,
.shop-animation-card {
  border: 1px solid rgb(255 255 255 / 6%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 48%),
    rgb(7 7 8 / 88%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
}

.shop-animations-store__summary {
  min-height: 4vh;
  display: grid;
  place-content: center;
  gap: 0.22vh;
  border-radius: 0.65vh;
  text-align: center;
}

.shop-animations-store__summary span {
  color: rgb(255 255 255 / 42%);
  font-size: 0.72vh;
  font-weight: 800;
  line-height: 1;
}

.shop-animations-store__summary strong {
  color: #ffffff;
  font-size: 0.98vh;
  font-weight: 900;
  line-height: 1;
}

.shop-animations-store__spotlight {
  min-height: 9.2vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1.2vh;
  margin-top: 1.2vh;
  padding: 1.25vh 1.45vh;
  border-radius: 0.86vh;
}

.shop-animations-store__spotlight div {
  min-width: 0;
}

.shop-animations-store__spotlight span,
.shop-animation-card__top span {
  color: #d454f4;
  font-size: 0.78vh;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
}

.shop-animations-store__spotlight h2,
.shop-animations-store__spotlight p {
  margin: 0;
}

.shop-animations-store__spotlight h2 {
  margin-top: 0.52vh;
  color: #ffffff;
  font-size: 1.42vh;
  font-weight: 950;
  line-height: 1;
}

.shop-animations-store__spotlight p {
  margin-top: 0.52vh;
  color: rgb(255 255 255 / 48%);
  font-size: 0.88vh;
  font-weight: 700;
  line-height: 1.25;
}

.shop-animations-store__spotlight button,
.shop-animation-card__footer button {
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-weight: 950;
}

.shop-animations-store__spotlight button {
  min-height: 4.2vh;
  display: flex;
  align-items: center;
  gap: 0.85vh;
  padding: 0 1.15vh;
  border: 1px solid #d454f459;
  border-radius: 0.72vh;
  background: #d454f4;
  font-size: 0.94vh;
  text-shadow: 0 0.12vh 0.35vh rgb(0 0 0 / 24%);
}

.shop-animations-store__spotlight button:disabled {
  border-color: rgb(255 255 255 / 8%);
  background: rgb(255 255 255 / 7%);
  color: rgb(255 255 255 / 58%);
  cursor: default;
}

.shop-animations-store__spotlight button span {
  display: inline-flex;
  align-items: center;
  gap: 0.28vh;
  color: #ffffff;
}

.shop-animations-store__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.15vh;
  margin-top: 1.2vh;
  padding-bottom: 2vh;
}

.shop-animation-card {
  min-width: 0;
  min-height: 25.2vh;
  display: grid;
  grid-template-rows: auto minmax(9.8vh, 1fr) auto auto;
  gap: 1.05vh;
  padding: 1.15vh;
  border-radius: 0.86vh;
  overflow: hidden;
}

.shop-animation-card--purchased {
  border-color: #d454f459;
}

.shop-animation-card__top,
.shop-animation-card__footer,
.shop-animation-card__price {
  display: flex;
  align-items: center;
}

.shop-animation-card__top {
  min-width: 0;
  gap: 0.55vh;
}

.shop-animation-card__top span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-animation-card__top b {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 0.38vh 0.52vh;
  border-radius: 0.42vh;
  background: #d454f426;
  color: #ffffff;
  font-size: 0.7vh;
  font-weight: 900;
  line-height: 1;
}

.shop-animation-card__mock {
  min-width: 0;
  min-height: 9.2vh;
  display: grid;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.58vh;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 4%) 25%, transparent 25% 50%, rgb(255 255 255 / 4%) 50% 75%, transparent 75%),
    rgb(255 255 255 / 3%);
  background-size: 1.4vh 1.4vh;
}

.shop-animation-card__mock span {
  padding: 0.42vh 0.68vh;
  border-radius: 0.35vh;
  background: rgb(0 0 0 / 38%);
  color: rgb(255 255 255 / 48%);
  font-size: 0.82vh;
  font-weight: 800;
  line-height: 1;
}

.shop-animation-card__body {
  min-width: 0;
  display: grid;
  gap: 0.58vh;
}

.shop-animation-card__body strong,
.shop-animation-card__body p {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shop-animation-card__body strong {
  color: #ffffff;
  font-size: 1.18vh;
  font-weight: 950;
  line-height: 1.12;
  white-space: nowrap;
}

.shop-animation-card__body p {
  display: -webkit-box;
  color: rgb(255 255 255 / 64%);
  font-size: 1vh;
  font-weight: 700;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.shop-animation-card__footer {
  gap: 0.8vh;
}

.shop-animation-card__price {
  min-width: 0;
  gap: 0.32vh;
  margin-right: auto;
  color: #ffffff;
}

.shop-animation-card__price b {
  font-size: 1.12vh;
  font-weight: 950;
  line-height: 1;
}

.shop-animation-card__footer button {
  min-height: 3.2vh;
  min-width: 7.8vh;
  padding: 0 1vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.58vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 7%), transparent 44%),
    rgb(255 255 255 / 6%);
  font-size: 0.82vh;
  transition: border-color 150ms ease, background 150ms ease;
}

.shop-animation-card__footer button:hover {
  border-color: #d454f459;
  background: #d454f426;
}

.shop-animation-card__footer button:disabled {
  border-color: #d454f459;
  background: #d454f426;
  color: #ffffff;
  cursor: default;
}

.shop-animations-store :is(p, small, [class*="__meta"], [class*="__description"], [class*="__caption"]) {
  line-height: 1.35;
}
</style>
