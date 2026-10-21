<script setup lang="ts">
import {
  ArrowLeft,
  ArrowUpDown,
  Banknote,
  Bell,
  Car,
  Clock3,
  CreditCard,
  Eye,
  Funnel,
  Heart,
  History,
  House,
  Megaphone,
  Package,
  PlusCircle,
  Search,
  Shirt,
  ShoppingBag,
  Store,
  Tag,
  X,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import TwinkleSelect, { type TwinkleSelectOption } from '@/shared/components/TwinkleSelect.vue'
import type { TabletMarketplaceState } from '@/shared/contracts/tablet-marketplace'
import { isDevelopmentMockEnabled } from '@/shared/development-mocks'
import { useCharacterStore } from '@/stores/character.store'
import { createDevelopmentMarketplaceState } from './development-data'
import type {
  MarketplaceCategory,
  MarketplaceCategoryId,
  MarketplaceDraft,
  MarketplaceListing,
  MarketplaceSortKey,
} from './types'
import { useMarketplace } from './useMarketplace'

const props = defineProps<{
  payload?: TabletMarketplaceState
}>()
const emit = defineEmits<{
  close: []
}>()

const dayMs = 24 * 60 * 60 * 1000
const characterStore = useCharacterStore()
const initialMarketplaceState = props.payload
  ?? (isDevelopmentMockEnabled ? createDevelopmentMarketplaceState(Date.now(), dayMs) : { listings: [], purchases: [] })

const marketplaceCategories: MarketplaceCategory[] = [
  { id: 'items', label: 'Предметы', icon: Package },
  { id: 'vehicles', label: 'Автомобили', icon: Car },
  { id: 'realEstate', label: 'Недвижимость', icon: House },
  { id: 'ads', label: 'Реклама', icon: Megaphone },
  { id: 'clothes', label: 'Одежда и аксессуары', icon: Shirt },
  { id: 'businesses', label: 'Бизнесы', icon: Store },
]

const marketplaceSortOptions: Array<{ id: MarketplaceSortKey; label: string }> = [
  { id: 'popular', label: 'По популярности' },
  { id: 'priceAsc', label: 'Сначала дешевле' },
  { id: 'priceDesc', label: 'Сначала дороже' },
  { id: 'newest', label: 'Новые объявления' },
  { id: 'expiresSoon', label: 'Скоро истекают' },
]
const marketplaceCategoryOptions = computed<TwinkleSelectOption[]>(() => [
  { value: 'all', label: 'Все категории' },
  ...marketplaceCategories.map((category) => ({
    value: category.id,
    label: category.label,
  })),
])
const marketplaceSortSelectOptions = computed<TwinkleSelectOption[]>(() =>
  marketplaceSortOptions.map((option) => ({
    value: option.id,
    label: option.label,
  })),
)

const marketplaceCashBalance = computed(() => characterStore.cash)
const marketplaceCardBalance = computed(() => characterStore.bank)
const businessPaymentType = ref<'cash' | 'card'>('card')

const {
  marketplaceCategory,
  marketplaceDraft,
  marketplacePurchases,
  marketplaceSearch,
  marketplaceSort,
  marketplaceStats,
  marketplaceView,
  openMarketplaceListing,
  selectedMarketplaceListing,
  setMarketplaceListings,
  setMarketplacePurchases,
  setMarketplaceView,
  sortedMarketplaceListings,
  submitMarketplaceListing,
  toggleMarketplaceFavorite,
} = useMarketplace({
  createListing: createMarketplaceListingFromDraft,
  initialListings: initialMarketplaceState.listings ?? [],
  initialPurchases: initialMarketplaceState.purchases ?? [],
  onCreateListing(listing) {
    callClientEvent('tablet:marketplaceListingCreateFromBrowser', {
      id: listing.id,
      category: listing.category,
      price: listing.price,
      placementPrice: listing.placementPrice,
      description: listing.description,
    })
  },
  onFavoriteOpen() {
    callClientEvent('tablet:marketplaceFavoritesOpenFromBrowser')
  },
  onHistoryOpen() {
    callClientEvent('tablet:marketplaceHistoryOpenFromBrowser')
  },
  onListingFavorite(listing, favorited) {
    callClientEvent('tablet:marketplaceListingFavoriteFromBrowser', listing.id, favorited)
  },
  onListingOpen(listing) {
    callClientEvent('tablet:marketplaceListingOpenFromBrowser', listing.id)
  },
})
const marketplaceCategorySelect = computed({
  get: () => marketplaceCategory.value,
  set: (value: string) => {
    marketplaceCategory.value = value as MarketplaceCategoryId | 'all'
  },
})
const marketplaceSortSelect = computed({
  get: () => marketplaceSort.value,
  set: (value: string) => {
    marketplaceSort.value = value as MarketplaceSortKey
  },
})
const marketplaceDraftCategorySelect = computed({
  get: () => marketplaceDraft.value.category,
  set: (value: string) => {
    marketplaceDraft.value.category = value as MarketplaceCategoryId
  },
})

function formatMoney(value: number) {
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} $`
}

function getMarketplaceCategoryLabel(categoryId: MarketplaceCategoryId) {
  return marketplaceCategories.find((category) => category.id === categoryId)?.label ?? 'Маркет'
}

function getMarketplaceCategoryIcon(categoryId: MarketplaceCategoryId) {
  return marketplaceCategories.find((category) => category.id === categoryId)?.icon ?? Package
}

function formatMarketplaceTimeLeft(expiresAt: number) {
  const diff = Math.max(0, expiresAt - Date.now())
  const hours = Math.floor(diff / (60 * 60 * 1000))
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))

  if (hours <= 0) {
    return `${minutes} мин.`
  }

  return `${hours} ч. ${minutes} мин.`
}

function createMarketplaceListingFromDraft(draft: MarketplaceDraft): MarketplaceListing | null {
  const title = draft.title.trim()
  const description = draft.description.trim()
  const price = Number(draft.price)
  const placementPrice = Number(draft.placementPrice)

  if (!title || !description || !Number.isFinite(price) || price <= 0) {
    return null
  }

  return {
    id: `tw-market-local-${Date.now()}`,
    title,
    category: draft.category,
    price,
    placementPrice: Number.isFinite(placementPrice) && placementPrice > 0 ? placementPrice : 500,
    phone: '555-0101',
    seller: characterStore.name,
    description,
    image: draft.category === 'vehicles'
      ? './property/mercedes-g63.png'
      : draft.category === 'realEstate'
        ? './property/house.png'
        : draft.category === 'businesses'
          ? './property/business.png'
          : draft.category === 'clothes'
            ? './bag.png'
            : draft.category === 'ads'
              ? './Rectangle 7294.png'
              : './starter-packs/crate.png',
    createdAt: Date.now(),
    expiresAt: Date.now() + dayMs,
    likes: 0,
    views: 0,
    favorited: false,
    specs: [
      { label: 'Категория', value: getMarketplaceCategoryLabel(draft.category) },
      { label: 'Размещение', value: '24 часа' },
      { label: 'Комиссия', value: formatMoney(Number.isFinite(placementPrice) ? placementPrice : 500) },
    ],
  }
}

function purchaseBusinessListing() {
  const listing = selectedMarketplaceListing.value
  if (!listing || listing.category !== 'businesses' || !listing.purchasable) return
  if (!window.confirm(`Купить ${listing.title} за ${formatMoney(listing.price)}?`)) return
  callClientEvent('tablet:marketplaceBusinessBuyFromBrowser', listing.id, businessPaymentType.value)
}

watch(
  () => props.payload,
  (payload) => {
    if (payload?.listings) {
      setMarketplaceListings(payload.listings)
    }

    if (payload?.purchases) {
      setMarketplacePurchases(payload.purchases)
    }
  },
  { deep: true },
)
</script>

<template>
  <section class="marketplace-app" aria-label="Маркетплейс">
    <aside class="marketplace-sidebar" aria-label="Навигация маркетплейса">
      <div class="marketplace-brand">
        <div>
          <strong>NoName Market</strong>
          <span>Игровая торговая площадка</span>
        </div>
      </div>

      <nav class="marketplace-nav">
        <button class="marketplace-nav__item" :class="{ 'marketplace-nav__item--active': marketplaceView === 'home' && marketplaceCategory === 'all' }" type="button" @click="setMarketplaceView('home'); marketplaceCategory = 'all'">
          <ShoppingBag aria-hidden="true" />
          <span>Главная</span>
        </button>
        <button
          v-for="category in marketplaceCategories"
          :key="category.id"
          class="marketplace-nav__item"
          :class="{ 'marketplace-nav__item--active': marketplaceView === 'home' && marketplaceCategory === category.id }"
          type="button"
          @click="setMarketplaceView('home'); marketplaceCategory = category.id"
        >
          <component :is="category.icon" aria-hidden="true" />
          <span>{{ category.label }}</span>
        </button>
      </nav>

      <nav class="marketplace-nav marketplace-nav--secondary">
        <button class="marketplace-nav__item" :class="{ 'marketplace-nav__item--active': marketplaceView === 'favorites' }" type="button" @click="setMarketplaceView('favorites')">
          <Heart aria-hidden="true" />
          <span>Избранное</span>
          <strong>{{ marketplaceStats.favorites }}</strong>
        </button>
        <button class="marketplace-nav__item" :class="{ 'marketplace-nav__item--active': marketplaceView === 'history' }" type="button" @click="setMarketplaceView('history')">
          <History aria-hidden="true" />
          <span>История покупок</span>
          <strong>{{ marketplaceStats.purchases }}</strong>
        </button>
        <button class="marketplace-nav__item marketplace-nav__item--create" :class="{ 'marketplace-nav__item--active': marketplaceView === 'create' }" type="button" @click="setMarketplaceView('create')">
          <PlusCircle aria-hidden="true" />
          <span>Создать объявление</span>
        </button>
      </nav>
    </aside>

    <section class="marketplace-main">
      <header class="marketplace-header">
        <div class="marketplace-heading">
          <button v-if="marketplaceView === 'detail'" class="marketplace-back" type="button" aria-label="Назад" @click="setMarketplaceView('home')">
            <ArrowLeft aria-hidden="true" />
          </button>
          <div>
            <h1>{{ marketplaceView === 'favorites' ? 'Избранное' : marketplaceView === 'history' ? 'История покупок' : marketplaceView === 'create' ? 'Новое объявление' : selectedMarketplaceListing ? selectedMarketplaceListing.title : 'Маркетплейс' }}</h1>
            <p>{{ marketplaceView === 'detail' && selectedMarketplaceListing ? getMarketplaceCategoryLabel(selectedMarketplaceListing.category) : 'Покупка и продажа игровых активов' }}</p>
          </div>
        </div>

        <div class="marketplace-wallet" aria-label="Баланс">
          <span><CreditCard aria-hidden="true" /> {{ formatMoney(marketplaceCardBalance) }}</span>
          <span><Banknote aria-hidden="true" /> {{ formatMoney(marketplaceCashBalance) }}</span>
          <button class="marketplace-close" type="button" aria-label="Закрыть" @click="emit('close')"><X aria-hidden="true" /></button>
        </div>
      </header>

      <div v-if="marketplaceView === 'home' || marketplaceView === 'favorites'" class="marketplace-toolbar">
        <label class="marketplace-search">
          <Search aria-hidden="true" />
          <input v-model="marketplaceSearch" type="text" placeholder="Поиск по названию, описанию или продавцу">
        </label>
        <TwinkleSelect
          v-model="marketplaceCategorySelect"
          class="marketplace-select"
          aria-label="Категория маркетплейса"
          :options="marketplaceCategoryOptions"
          variant="marketplace"
        >
          <template #icon>
            <Funnel />
          </template>
        </TwinkleSelect>
        <TwinkleSelect
          v-model="marketplaceSortSelect"
          class="marketplace-select"
          aria-label="Сортировка маркетплейса"
          :options="marketplaceSortSelectOptions"
          variant="marketplace"
        >
          <template #icon>
            <ArrowUpDown />
          </template>
        </TwinkleSelect>
      </div>

      <div v-if="marketplaceView === 'home' || marketplaceView === 'favorites'" class="marketplace-grid" aria-label="Объявления">
        <button
          v-for="listing in sortedMarketplaceListings"
          :key="listing.id"
          class="marketplace-card"
          type="button"
          @click="openMarketplaceListing(listing)"
        >
          <span class="marketplace-card__media">
            <img :src="listing.image" :alt="listing.title">
            <span class="marketplace-card__tag"><component :is="getMarketplaceCategoryIcon(listing.category)" aria-hidden="true" /> {{ getMarketplaceCategoryLabel(listing.category) }}</span>
            <span class="marketplace-card__time"><Clock3 aria-hidden="true" /> {{ formatMarketplaceTimeLeft(listing.expiresAt) }}</span>
          </span>
          <span class="marketplace-card__body">
            <strong>{{ listing.title }}</strong>
            <span>{{ listing.seller }} · {{ listing.phone }}</span>
            <b>{{ formatMoney(listing.price) }}</b>
          </span>
          <span class="marketplace-card__meta">
            <button class="marketplace-like" :class="{ 'marketplace-like--active': listing.favorited }" type="button" aria-label="В избранное" @click="toggleMarketplaceFavorite(listing, $event)">
              <Heart aria-hidden="true" /> {{ listing.likes }}
            </button>
            <span><Eye aria-hidden="true" /> {{ listing.views }}</span>
          </span>
        </button>

        <section v-if="sortedMarketplaceListings.length === 0" class="marketplace-empty">
          <Search aria-hidden="true" />
          <strong>Ничего не найдено</strong>
          <span>Попробуйте выбрать другую категорию или изменить запрос.</span>
        </section>
      </div>

      <section v-else-if="marketplaceView === 'detail' && selectedMarketplaceListing" class="marketplace-detail">
        <div class="marketplace-detail__media">
          <img :src="selectedMarketplaceListing.image" :alt="selectedMarketplaceListing.title">
          <span><Clock3 aria-hidden="true" /> Активно еще {{ formatMarketplaceTimeLeft(selectedMarketplaceListing.expiresAt) }}</span>
        </div>
        <div class="marketplace-detail__content">
          <div class="marketplace-detail__topline">
            <span><component :is="getMarketplaceCategoryIcon(selectedMarketplaceListing.category)" aria-hidden="true" /> {{ getMarketplaceCategoryLabel(selectedMarketplaceListing.category) }}</span>
            <button class="marketplace-like" :class="{ 'marketplace-like--active': selectedMarketplaceListing.favorited }" type="button" @click="toggleMarketplaceFavorite(selectedMarketplaceListing, $event)">
              <Heart aria-hidden="true" /> {{ selectedMarketplaceListing.likes }}
            </button>
          </div>
          <h2>{{ selectedMarketplaceListing.title }}</h2>
          <strong class="marketplace-detail__price">{{ formatMoney(selectedMarketplaceListing.price) }}</strong>
          <p>{{ selectedMarketplaceListing.description }}</p>
          <dl class="marketplace-specs">
            <div v-for="spec in selectedMarketplaceListing.specs" :key="spec.label">
              <dt>{{ spec.label }}</dt>
              <dd>{{ spec.value }}</dd>
            </div>
          </dl>
          <div class="marketplace-contact">
            <span><Tag aria-hidden="true" /> Продавец: {{ selectedMarketplaceListing.seller }}</span>
            <span><Bell aria-hidden="true" /> Телефон: {{ selectedMarketplaceListing.phone }}</span>
            <span><Eye aria-hidden="true" /> Просмотры: {{ selectedMarketplaceListing.views }}</span>
          </div>
          <div v-if="selectedMarketplaceListing.category === 'businesses' && selectedMarketplaceListing.purchasable" class="marketplace-business-purchase">
            <select v-model="businessPaymentType">
              <option value="card">Карта · {{ formatMoney(marketplaceCardBalance) }}</option>
              <option value="cash">Наличные · {{ formatMoney(marketplaceCashBalance) }}</option>
            </select>
            <button type="button" @click="purchaseBusinessListing">Купить бизнес</button>
          </div>
        </div>
      </section>

      <section v-else-if="marketplaceView === 'history'" class="marketplace-history" aria-label="История покупок">
        <article v-for="purchase in marketplacePurchases" :key="purchase.id" class="marketplace-history__item">
          <span><component :is="getMarketplaceCategoryIcon(purchase.category)" aria-hidden="true" /></span>
          <div>
            <strong>{{ purchase.listingTitle }}</strong>
            <small>{{ purchase.purchasedAt }} · {{ purchase.seller }}</small>
          </div>
          <b>{{ formatMoney(purchase.price) }}</b>
        </article>

        <section v-if="marketplacePurchases.length === 0" class="marketplace-empty">
          <History aria-hidden="true" />
          <strong>Покупок пока нет</strong>
          <span>Завершённые сделки будут отображаться в истории.</span>
        </section>
      </section>

      <form v-else-if="marketplaceView === 'create'" class="marketplace-create" @submit.prevent="submitMarketplaceListing">
        <label>
          <span>Категория</span>
          <TwinkleSelect
            v-model="marketplaceDraftCategorySelect"
            aria-label="Категория объявления"
            :options="marketplaceCategoryOptions.filter((option) => option.value !== 'all' && option.value !== 'businesses')"
            variant="marketplace"
          />
        </label>
        <label>
          <span>Название</span>
          <input v-model="marketplaceDraft.title" type="text" placeholder="Например: Karin Sultan RS">
        </label>
        <label>
          <span>Цена</span>
          <input v-model="marketplaceDraft.price" type="number" min="1" placeholder="125000">
        </label>
        <label>
          <span>Цена размещения</span>
          <input v-model="marketplaceDraft.placementPrice" type="number" min="1" placeholder="500">
        </label>
        <label class="marketplace-create__wide">
          <span>Описание для детальной страницы</span>
          <textarea v-model="marketplaceDraft.description" rows="5" placeholder="Опишите состояние, условия сделки и важные детали"></textarea>
        </label>
        <button class="marketplace-create__submit" type="submit">
          <PlusCircle aria-hidden="true" /> Создать объявление на 24 часа
        </button>
      </form>
    </section>
  </section>
</template>

<style lang="scss" scoped>
.marketplace-app {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  grid-template-columns: px-to-vh(245) minmax(0, 1fr);
  background:
    linear-gradient(90deg, rgb(58 58 58 / 5%) 0 px-to-vh(1), transparent px-to-vh(1) px-to-vh(54)),
    linear-gradient(180deg, rgb(7 7 7 / 4%) 0 px-to-vh(1), transparent px-to-vh(1) px-to-vh(54)),
    radial-gradient(px-to-vh(540) px-to-vh(320) at 82% 2%, rgb(172 46 205 / 18%), transparent 70%),
    linear-gradient(110deg, #000000 0%, #050308 52%, #000000 100%);
  background-size:
    px-to-vh(54) px-to-vh(54),
    px-to-vh(54) px-to-vh(54),
    auto,
    auto;
  color: #ffffff;
}

.marketplace-sidebar {
  display: flex;
  flex-direction: column;
  gap: px-to-vh(18);
  padding: px-to-vh(24) px-to-vh(18);
  border-right: px-to-vh(1) solid rgb(255 255 255 / 8%);
  background: rgb(3 3 6 / 86%);
}

.marketplace-brand {
  display: flex;
  align-items: center;
  gap: px-to-vh(12);
  min-width: 0;
}

.marketplace-card__tag,
.marketplace-card__time,
.marketplace-detail__topline span,
.marketplace-contact span,
.marketplace-wallet span,
.marketplace-history__item > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.marketplace-brand strong,
.marketplace-brand span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marketplace-brand strong {
  font-size: px-to-vh(18);
  font-weight: 800;
}

.marketplace-brand span {
  margin-top: px-to-vh(3);
  color: rgb(255 255 255 / 52%);
  font-size: px-to-vh(12);
  font-weight: 600;
}

.marketplace-nav {
  display: grid;
  gap: px-to-vh(7);
}

.marketplace-nav--secondary {
  margin-top: auto;
}

.marketplace-nav__item {
  min-height: px-to-vh(42);
  display: grid;
  grid-template-columns: px-to-vh(22) minmax(0, 1fr) auto;
  align-items: center;
  gap: px-to-vh(10);
  padding: 0 px-to-vh(12);
  border: px-to-vh(1) solid transparent;
  border-radius: px-to-vh(8);
  background: transparent;
  color: rgb(255 255 255 / 68%);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.marketplace-nav__item svg {
  width: px-to-vh(18);
  height: px-to-vh(18);
}

.marketplace-nav__item span {
  overflow: hidden;
  font-size: px-to-vh(13);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marketplace-nav__item strong {
  min-width: px-to-vh(22);
  padding: px-to-vh(2) px-to-vh(6);
  border-radius: px-to-vh(999);
  background: rgb(255 255 255 / 10%);
  color: #ffffff;
  font-size: px-to-vh(11);
  text-align: center;
}

.marketplace-nav__item:hover,
.marketplace-nav__item:focus-visible,
.marketplace-nav__item--active {
  border-color: rgb(172 46 205 / 34%);
  background: rgb(172 46 205 / 10%);
  color: #ffffff;
  outline: none;
}

.marketplace-nav__item--create {
  border-color: rgb(172 46 205 / 48%);
  background:
    linear-gradient(135deg, rgb(172 46 205 / 86%), rgb(83 20 104 / 86%)),
    rgb(172 46 205 / 14%);
  color: #ffffff;
}

.marketplace-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: px-to-vh(16);
  padding: px-to-vh(22) px-to-vh(24);
}

.marketplace-header,
.marketplace-toolbar,
.marketplace-wallet,
.marketplace-heading,
.marketplace-card__meta,
.marketplace-detail__topline {
  display: flex;
  align-items: center;
}

.marketplace-header {
  justify-content: space-between;
  gap: px-to-vh(16);
}

.marketplace-heading {
  min-width: 0;
  gap: px-to-vh(12);
}

.marketplace-heading h1,
.marketplace-heading p {
  margin: 0;
}

.marketplace-heading h1 {
  overflow: hidden;
  color: #ffffff;
  font-size: px-to-vh(25);
  font-weight: 850;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marketplace-heading p {
  margin-top: px-to-vh(5);
  color: rgb(255 255 255 / 54%);
  font-size: px-to-vh(13);
  font-weight: 600;
}

.marketplace-back,
.marketplace-close {
  width: px-to-vh(38);
  height: px-to-vh(38);
  display: grid;
  place-items: center;
  border: px-to-vh(1) solid rgb(255 255 255 / 12%);
  border-radius: px-to-vh(8);
  background: rgb(255 255 255 / 7%);
  color: #ffffff;
  cursor: pointer;
}

.marketplace-back:hover,
.marketplace-back:focus-visible,
.marketplace-close:hover,
.marketplace-close:focus-visible {
  border-color: rgb(172 46 205 / 34%);
  background: rgb(172 46 205 / 10%);
  outline: none;
}

.marketplace-back svg,
.marketplace-close svg {
  width: px-to-vh(19);
  height: px-to-vh(19);
}

.marketplace-wallet {
  gap: px-to-vh(8);
  flex: 0 0 auto;
}

.marketplace-wallet span {
  gap: px-to-vh(7);
  height: px-to-vh(38);
  padding: 0 px-to-vh(12);
  border: px-to-vh(1) solid rgb(172 46 205 / 18%);
  border-radius: px-to-vh(8);
  background: rgb(172 46 205 / 7%);
  color: #ffffff;
  font-size: px-to-vh(13);
  font-weight: 800;
}

.marketplace-wallet svg {
  width: px-to-vh(17);
  height: px-to-vh(17);
  color: #ac2ecd;
}

.marketplace-toolbar {
  gap: px-to-vh(10);
}

.marketplace-search,
.marketplace-create label {
  min-width: 0;
  border: px-to-vh(1) solid rgb(255 255 255 / 10%);
  border-radius: px-to-vh(8);
  background: rgb(255 255 255 / 6%);
}

.marketplace-search {
  height: px-to-vh(44);
  display: flex;
  align-items: center;
  gap: px-to-vh(8);
  padding: 0 px-to-vh(12);
}

.marketplace-search {
  flex: 1 1 auto;
}

.marketplace-select {
  flex: 0 0 px-to-vh(205);
}

.marketplace-search svg {
  width: px-to-vh(17);
  height: px-to-vh(17);
  color: rgb(255 255 255 / 52%);
  flex: 0 0 auto;
}

.marketplace-search input,
.marketplace-create input,
.marketplace-create textarea {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: #ffffff;
  font: inherit;
  font-size: px-to-vh(13);
  font-weight: 700;
  outline: none;
}

.marketplace-search input::placeholder,
.marketplace-create input::placeholder,
.marketplace-create textarea::placeholder {
  color: rgb(255 255 255 / 36%);
}

.marketplace-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: px-to-vh(14);
  overflow-y: auto;
  padding-right: px-to-vh(4);
}

.marketplace-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  border: px-to-vh(1) solid rgb(255 255 255 / 9%);
  border-radius: px-to-vh(8);
  overflow: hidden;
  background: rgb(255 255 255 / 6%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.marketplace-card:hover,
.marketplace-card:focus-visible {
  border-color: rgb(172 46 205 / 34%);
  background: rgb(172 46 205 / 8%);
  outline: none;
  transform: translateY(px-to-vh(-1));
}

.marketplace-card__media {
  position: relative;
  height: px-to-vh(150);
  display: block;
  background: linear-gradient(135deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 3%));
}

.marketplace-card__media img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.marketplace-card__tag,
.marketplace-card__time {
  position: absolute;
  gap: px-to-vh(5);
  padding: px-to-vh(6) px-to-vh(8);
  border-radius: px-to-vh(6);
  background: rgb(5 7 12 / 74%);
  color: #ffffff;
  font-size: px-to-vh(11);
  font-weight: 800;
}

.marketplace-card__tag {
  left: px-to-vh(10);
  top: px-to-vh(10);
}

.marketplace-card__time {
  right: px-to-vh(10);
  top: px-to-vh(10);
}

.marketplace-card__tag svg,
.marketplace-card__time svg,
.marketplace-card__meta svg,
.marketplace-like svg {
  width: px-to-vh(13);
  height: px-to-vh(13);
}

.marketplace-card__body {
  display: grid;
  gap: px-to-vh(6);
  padding: px-to-vh(12);
}

.marketplace-card__body strong,
.marketplace-card__body span,
.marketplace-card__body b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marketplace-card__body strong {
  font-size: px-to-vh(15);
  font-weight: 850;
}

.marketplace-card__body span {
  color: rgb(255 255 255 / 48%);
  font-size: px-to-vh(12);
  font-weight: 650;
}

.marketplace-card__body b {
  color: #ac2ecd;
  font-size: px-to-vh(17);
  font-weight: 900;
}

.marketplace-card__meta {
  justify-content: space-between;
  gap: px-to-vh(10);
  margin-top: auto;
  padding: 0 px-to-vh(12) px-to-vh(12);
  color: rgb(255 255 255 / 52%);
  font-size: px-to-vh(12);
  font-weight: 750;
}

.marketplace-card__meta > span,
.marketplace-like {
  display: inline-flex;
  align-items: center;
  gap: px-to-vh(5);
}

.marketplace-like {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.marketplace-like--active {
  color: #ff6b9d;
}

.marketplace-detail {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, px-to-vh(405)) minmax(0, 1fr);
  gap: px-to-vh(18);
  overflow: hidden;
}

.marketplace-detail__media {
  position: relative;
  min-height: 0;
  border-radius: px-to-vh(10);
  overflow: hidden;
  background: rgb(255 255 255 / 6%);
}

.marketplace-detail__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.marketplace-detail__media span {
  position: absolute;
  left: px-to-vh(14);
  bottom: px-to-vh(14);
  display: inline-flex;
  align-items: center;
  gap: px-to-vh(7);
  padding: px-to-vh(8) px-to-vh(10);
  border-radius: px-to-vh(8);
  background: rgb(4 6 12 / 75%);
  font-size: px-to-vh(12);
  font-weight: 800;
}

.marketplace-detail__content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: px-to-vh(14);
  overflow-y: auto;
  padding: px-to-vh(18);
  border: px-to-vh(1) solid rgb(255 255 255 / 9%);
  border-radius: px-to-vh(10);
  background: rgb(255 255 255 / 6%);
}

.marketplace-detail__topline {
  justify-content: space-between;
  gap: px-to-vh(12);
}

.marketplace-detail__topline span {
  gap: px-to-vh(7);
  color: #ac2ecd;
  font-size: px-to-vh(12);
  font-weight: 850;
}

.marketplace-detail__content h2,
.marketplace-detail__content p,
.marketplace-detail__price {
  margin: 0;
}

.marketplace-detail__content h2 {
  font-size: px-to-vh(27);
  line-height: 1.05;
}

.marketplace-detail__price {
  color: #ac2ecd;
  font-size: px-to-vh(26);
  font-weight: 950;
}

.marketplace-detail__content p {
  color: rgb(255 255 255 / 70%);
  font-size: px-to-vh(14);
  font-weight: 600;
  line-height: 1.45;
}

.marketplace-specs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: px-to-vh(10);
  margin: 0;
}

.marketplace-specs div {
  min-width: 0;
  padding: px-to-vh(11);
  border-radius: px-to-vh(8);
  background: rgb(255 255 255 / 7%);
}

.marketplace-specs dt,
.marketplace-specs dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marketplace-specs dt {
  color: rgb(255 255 255 / 45%);
  font-size: px-to-vh(11);
  font-weight: 700;
}

.marketplace-specs dd {
  margin-top: px-to-vh(5);
  color: #ffffff;
  font-size: px-to-vh(13);
  font-weight: 850;
}

.marketplace-contact {
  display: grid;
  gap: px-to-vh(8);
  margin-top: auto;
}

.marketplace-contact span {
  justify-content: flex-start;
  gap: px-to-vh(8);
  color: rgb(255 255 255 / 72%);
  font-size: px-to-vh(13);
  font-weight: 750;
}

.marketplace-business-purchase {
  display: flex;
  gap: px-to-vh(10);
  margin-top: px-to-vh(14);
}

.marketplace-business-purchase select,
.marketplace-business-purchase button {
  min-height: px-to-vh(42);
  border: px-to-vh(1) solid rgb(255 255 255 / 12%);
  border-radius: px-to-vh(8);
  padding: 0 px-to-vh(14);
  color: #ffffff;
  font: inherit;
  font-weight: 800;
}

.marketplace-business-purchase select {
  flex: 1;
  background: #17131b;
}

.marketplace-business-purchase button {
  border: 0;
  background: linear-gradient(135deg, #8d24ab, #d13bc0);
  cursor: pointer;
}

.marketplace-history,
.marketplace-create {
  min-height: 0;
  overflow-y: auto;
}

.marketplace-history {
  display: grid;
  align-content: start;
  gap: px-to-vh(10);
}

.marketplace-history__item {
  display: grid;
  grid-template-columns: px-to-vh(44) minmax(0, 1fr) auto;
  align-items: center;
  gap: px-to-vh(12);
  min-height: px-to-vh(66);
  padding: px-to-vh(10) px-to-vh(14);
  border: px-to-vh(1) solid rgb(255 255 255 / 9%);
  border-radius: px-to-vh(8);
  background: rgb(255 255 255 / 6%);
}

.marketplace-history__item > span {
  width: px-to-vh(44);
  height: px-to-vh(44);
  border-radius: px-to-vh(8);
  background: rgb(172 46 205 / 12%);
  color: #ac2ecd;
}

.marketplace-history__item svg {
  width: px-to-vh(21);
  height: px-to-vh(21);
}

.marketplace-history__item strong,
.marketplace-history__item small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marketplace-history__item strong {
  font-size: px-to-vh(15);
  font-weight: 850;
}

.marketplace-history__item small {
  margin-top: px-to-vh(4);
  color: rgb(255 255 255 / 48%);
  font-size: px-to-vh(12);
  font-weight: 650;
}

.marketplace-history__item b {
  color: #ac2ecd;
  font-size: px-to-vh(15);
}

.marketplace-create {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: px-to-vh(12);
}

.marketplace-create label {
  display: grid;
  gap: px-to-vh(7);
  padding: px-to-vh(11) px-to-vh(12);
}

.marketplace-create label span {
  color: rgb(255 255 255 / 48%);
  font-size: px-to-vh(11);
  font-weight: 800;
  text-transform: uppercase;
}

.marketplace-create textarea {
  min-height: px-to-vh(118);
  resize: none;
  line-height: 1.4;
}

.marketplace-create__wide,
.marketplace-create__submit {
  grid-column: 1 / -1;
}

.marketplace-create__submit {
  min-height: px-to-vh(48);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: px-to-vh(8);
  border: 0;
  border-radius: px-to-vh(8);
  border: px-to-vh(1) solid rgb(172 46 205 / 44%);
  background: linear-gradient(135deg, #ac2ecd, #571568);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: px-to-vh(14);
  font-weight: 900;
}

.marketplace-create__submit svg {
  width: px-to-vh(18);
  height: px-to-vh(18);
}

.marketplace-empty {
  grid-column: 1 / -1;
  min-height: px-to-vh(260);
  display: grid;
  place-items: center;
  align-content: center;
  gap: px-to-vh(8);
  color: rgb(255 255 255 / 56%);
  text-align: center;
}

.marketplace-empty svg {
  width: px-to-vh(34);
  height: px-to-vh(34);
  color: #ac2ecd;
}

.marketplace-empty strong {
  color: #ffffff;
  font-size: px-to-vh(17);
}

.marketplace-empty span {
  font-size: px-to-vh(13);
  font-weight: 650;
}
</style>
