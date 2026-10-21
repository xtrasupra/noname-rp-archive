<template>
  <section class="shop-character-store">
    <h1 class="f2-menu__title">Персонаж</h1>

    <header class="shop-character-store__toolbar">
      <div class="shop-character-store__filters">
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
        <ShopCaseSelect
          v-model="selectedRarity"
          label="Класс"
          :options="rarityOptions"
        />
      </div>

      <div class="shop-character-store__summary">
        <span>Товаров</span>
        <strong>{{ filteredItems.length }} / {{ characterItemsView.length }}</strong>
      </div>
    </header>

    <section v-if="featuredItem" class="shop-character-store__spotlight">
      <div>
        <span>Подборка недели</span>
        <h2>Городской комплект</h2>
        <p>Одежда, снаряжение и полезные предметы для активной RP-игры.</p>
      </div>

      <button type="button" @click="buyItem(featuredItem)">
        Купить комплект
        <span>
          {{ featuredItem.price }}
          <BaseIcon :icon="DollarSign" size="xs" :stroke-width="2.45" />
        </span>
      </button>
    </section>

    <div v-if="filteredItems.length" class="shop-character-store__grid">
      <article
        v-for="item in filteredItems"
        :key="item.id"
        class="shop-character-card"
        :class="[`shop-character-card--${item.tone}`, `shop-character-card--${item.rarity}`]"
      >
        <div class="shop-character-card__top">
          <span>{{ getCategoryLabel(item.category) }}</span>
          <b :class="`shop-character-card__rarity--${item.rarity}`">{{ getRarityLabel(item.rarity) }}</b>
        </div>

        <div class="shop-character-card__visual">
          <BaseIcon :icon="item.icon" size="lg" :stroke-width="2.15" />
        </div>

        <div class="shop-character-card__body">
          <strong>{{ item.title }}</strong>
          <p>{{ item.description }}</p>
        </div>

        <div class="shop-character-card__footer">
          <span class="shop-character-card__price">
            <s v-if="item.oldPrice">{{ item.oldPrice }}</s>
            <b>{{ item.price }}</b>
            <BaseIcon :icon="DollarSign" size="xs" :stroke-width="2.45" />
          </span>

          <button type="button" @click="buyItem(item)">
            Купить
          </button>
        </div>
      </article>
    </div>

    <div v-else class="shop-character-store__empty">
      Товары по выбранным фильтрам не найдены
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, type FunctionalComponent } from 'vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

import {
  BaseIcon,
  BriefcaseBusiness,
  Crosshair,
  DollarSign,
  Package,
  ShieldCheck,
  Shirt,
  Sparkles,
  Tag,
} from '@/shared/icons'
import { useNotificationStore } from '@/stores/notification.store'

import ShopCaseSelect from './ShopCaseSelect.vue'

const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()

type CharacterCategory = 'all' | 'clothes' | 'weapons' | 'equipment' | 'accessories' | 'services'
type CharacterSort = 'popular' | 'priceAsc' | 'priceDesc' | 'rarityDesc' | 'nameAsc'
type CharacterRarityFilter = 'all' | 'basic' | 'rare' | 'premium'
type CharacterRarity = 'basic' | 'rare' | 'premium'
type CharacterTone = 'purple' | 'blue' | 'gray' | 'green'

type CharacterShopItem = {
  category: Exclude<CharacterCategory, 'all'>
  description: string
  icon: FunctionalComponent
  id: string
  oldPrice?: number
  popularity: number
  price: number
  rarity: CharacterRarity
  title: string
  tone: CharacterTone
}

const notificationStore = useNotificationStore()

const selectedCategory = ref<CharacterCategory>('all')
const selectedSort = ref<CharacterSort>('popular')
const selectedRarity = ref<CharacterRarityFilter>('all')

const categoryOptions: Array<{ description: string, label: string, value: CharacterCategory }> = [
  { value: 'all', label: 'Все товары', description: 'Одежда, оружие и предметы' },
  { value: 'clothes', label: 'Одежда', description: 'Образы и комплекты' },
  { value: 'weapons', label: 'Оружие', description: 'Лицензии и снаряжение' },
  { value: 'equipment', label: 'Снаряжение', description: 'Броня и расходники' },
  { value: 'accessories', label: 'Аксессуары', description: 'Детали персонажа' },
  { value: 'services', label: 'Услуги', description: 'Смена внешности и бонусы' },
]

const sortOptions: Array<{ description: string, label: string, value: CharacterSort }> = [
  { value: 'popular', label: 'Популярные', description: 'Чаще всего покупают' },
  { value: 'priceAsc', label: 'Сначала дешевые', description: 'Цена по возрастанию' },
  { value: 'priceDesc', label: 'Сначала дорогие', description: 'Цена по убыванию' },
  { value: 'rarityDesc', label: 'Сначала премиум', description: 'Редкие товары выше' },
  { value: 'nameAsc', label: 'По названию', description: 'А-Я' },
]

const rarityOptions: Array<{ description: string, label: string, value: CharacterRarityFilter }> = [
  { value: 'all', label: 'Все классы', description: 'Показать весь каталог' },
  { value: 'basic', label: 'Базовые', description: 'Доступные товары' },
  { value: 'rare', label: 'Редкие', description: 'Редкие и премиум' },
  { value: 'premium', label: 'Премиум', description: 'Самые ценные позиции' },
]

const rarityRank: Record<CharacterRarity, number> = {
  basic: 0,
  rare: 1,
  premium: 2,
}

const iconMap: Record<string, FunctionalComponent> = {
  briefcase: BriefcaseBusiness,
  crosshair: Crosshair,
  package: Package,
  shield: ShieldCheck,
  shirt: Shirt,
  sparkles: Sparkles,
  tag: Tag,
}

function normalizeServerItem(item: any): CharacterShopItem {
  return {
    category: item.category || 'services',
    description: String(item.description || ''),
    icon: typeof item.icon === 'string' ? iconMap[item.icon] ?? Package : item.icon ?? Package,
    id: String(item.id || item.name || item.title),
    oldPrice: item.oldPrice == null ? undefined : Number(item.oldPrice),
    popularity: Number(item.popularity || item.dailyOpens || 0),
    price: Number(item.price || 0),
    rarity: item.rarity || 'basic',
    title: String(item.title || item.name || 'Товар'),
    tone: item.tone || 'gray',
  }
}

const serverItems = computed<CharacterShopItem[] | null>(() => {
  const shop = (props.payload as any)?.shop ?? {}
  const items = shop.character?.items ?? shop.products ?? shop.items

  return Array.isArray(items) ? items.map(normalizeServerItem) : null
})
const serverFeaturedItem = computed<CharacterShopItem | null>(() => {
  const item = (props.payload as any)?.shop?.character?.featured

  return item ? normalizeServerItem(item) : null
})

const characterItems: CharacterShopItem[] = [
  { id: 'black-hoodie', title: 'Черная кофта Adidas', description: 'Городской верх для повседневного RP-образа.', category: 'clothes', icon: Shirt, price: 800, popularity: 91, rarity: 'rare', tone: 'gray' },
  { id: 'white-chelsea', title: 'Белые замшевые челси', description: 'Аккуратная обувь для премиального образа.', category: 'clothes', icon: Shirt, price: 450, popularity: 83, rarity: 'basic', tone: 'gray' },
  { id: 'tactical-vest', title: 'Бронепластина', description: 'Защитный элемент для рискованных выездов.', category: 'equipment', icon: ShieldCheck, oldPrice: 240, price: 200, popularity: 88, rarity: 'rare', tone: 'blue' },
  { id: 'weapon-repair', title: 'Ремкомплект оружия', description: 'Поддерживает оружие в рабочем состоянии.', category: 'weapons', icon: Crosshair, price: 120, popularity: 73, rarity: 'basic', tone: 'green' },
  { id: 'license-pack', title: 'Пакет лицензий', description: 'Быстрый старт для активной городской игры.', category: 'services', icon: BriefcaseBusiness, price: 650, popularity: 79, rarity: 'rare', tone: 'purple' },
  { id: 'appearance-change', title: 'Смена внешности', description: 'Обновление внешнего вида персонажа.', category: 'services', icon: Sparkles, price: 500, popularity: 69, rarity: 'rare', tone: 'purple' },
  { id: 'discount-clothes', title: '10% скидка на одежду', description: 'Купон для следующих покупок в гардеробе.', category: 'accessories', icon: Tag, price: 1, popularity: 95, rarity: 'basic', tone: 'green' },
  { id: 'premium-loadout', title: 'Тактический комплект', description: 'Набор снаряжения для сложных ситуаций.', category: 'equipment', icon: Package, oldPrice: 950, price: 790, popularity: 86, rarity: 'premium', tone: 'purple' },
  { id: 'weapon-permit', title: 'Оружейный пропуск', description: 'Доступ к расширенным возможностям оружия.', category: 'weapons', icon: Crosshair, price: 900, popularity: 76, rarity: 'premium', tone: 'blue' },
  { id: 'mask-kit', title: 'Крем-маска', description: 'Малый расходник для RP-сценариев.', category: 'accessories', icon: Package, price: 20, popularity: 52, rarity: 'basic', tone: 'gray' },
  { id: 'med-stim', title: 'Стимулятор лечения', description: 'Полезный расходник для быстрых действий.', category: 'equipment', icon: ShieldCheck, price: 80, popularity: 66, rarity: 'basic', tone: 'green' },
  { id: 'elite-outfit', title: 'Комплект Elite Street', description: 'Премиальный городской образ персонажа.', category: 'clothes', icon: Shirt, oldPrice: 1100, price: 950, popularity: 82, rarity: 'premium', tone: 'purple' },
]

const characterItemsView = computed(() => serverItems.value ?? characterItems)
const featuredItem = computed(() => serverFeaturedItem.value ?? characterItemsView.value[7] ?? characterItemsView.value[0] ?? null)

const filteredItems = computed(() => {
  const byCategory = selectedCategory.value === 'all'
    ? characterItemsView.value
    : characterItemsView.value.filter((item) => item.category === selectedCategory.value)

  const byRarity = byCategory.filter((item) => {
    if (selectedRarity.value === 'all') {
      return true
    }

    if (selectedRarity.value === 'rare') {
      return rarityRank[item.rarity as CharacterRarity] >= rarityRank.rare
    }

    return item.rarity === selectedRarity.value
  })

  return [...byRarity].sort((left, right) => {
    if (selectedSort.value === 'priceAsc') {
      return left.price - right.price
    }

    if (selectedSort.value === 'priceDesc') {
      return right.price - left.price
    }

    if (selectedSort.value === 'rarityDesc') {
      return rarityRank[right.rarity as CharacterRarity] - rarityRank[left.rarity as CharacterRarity]
    }

    if (selectedSort.value === 'nameAsc') {
      return left.title.localeCompare(right.title, 'ru')
    }

    return right.popularity - left.popularity
  })
})

function getCategoryLabel(category: CharacterShopItem['category']) {
  return categoryOptions.find((option) => option.value === category)?.label ?? 'Товар'
}

function getRarityLabel(rarity: CharacterRarity) {
  const labels: Record<CharacterRarity, string> = {
    basic: 'Базовый',
    rare: 'Редкий',
    premium: 'Премиум',
  }

  return labels[rarity]
}

function buyItem(item: CharacterShopItem) {
  notificationStore.notify(`${item.title} добавлен к покупке`, {
    title: 'Магазин персонажа',
    variant: 'success',
  })
}
</script>

<style scoped>
.shop-character-store {
  position: relative;
  min-height: 80vh;
  padding-bottom: 2vh;
  isolation: isolate;
}

.shop-character-store__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 13vh;
  align-items: end;
  gap: 1.2vh;
  margin-top: 3.35vh;
}

.shop-character-store__filters {
  display: grid;
  grid-template-columns: minmax(0, 27vh) minmax(0, 29vh) minmax(0, 24vh);
  gap: 1vh;
}

.shop-character-store__summary,
.shop-character-store__spotlight,
.shop-character-card,
.shop-character-store__empty {
  border: 1px solid rgb(255 255 255 / 6%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 48%),
    rgb(7 7 8 / 88%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
}

.shop-character-store__summary {
  min-height: 4vh;
  display: grid;
  place-content: center;
  gap: 0.22vh;
  border-radius: 0.65vh;
  text-align: center;
}

.shop-character-store__summary span {
  color: rgb(255 255 255 / 42%);
  font-size: 0.72vh;
  font-weight: 800;
  line-height: 1;
}

.shop-character-store__summary strong {
  color: #ffffff;
  font-size: 0.98vh;
  font-weight: 900;
  line-height: 1;
}

.shop-character-store__spotlight {
  min-height: 9.2vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1.2vh;
  margin-top: 1.2vh;
  padding: 1.25vh 1.45vh;
  border-radius: 0.86vh;
  background:
    radial-gradient(30vh 10vh at 78% 50%, rgb(172 46 205 / 12%), transparent 75%),
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 48%),
    rgb(7 7 8 / 88%);
}

.shop-character-store__spotlight div {
  min-width: 0;
}

.shop-character-store__spotlight span,
.shop-character-card__top span {
  color: #d46bff;
  font-size: 0.78vh;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
}

.shop-character-store__spotlight h2,
.shop-character-store__spotlight p {
  margin: 0;
}

.shop-character-store__spotlight h2 {
  margin-top: 0.52vh;
  color: #ffffff;
  font-size: 1.42vh;
  font-weight: 950;
  line-height: 1;
}

.shop-character-store__spotlight p {
  margin-top: 0.52vh;
  color: rgb(255 255 255 / 48%);
  font-size: 0.88vh;
  font-weight: 700;
  line-height: 1.25;
}

.shop-character-store__spotlight button,
.shop-character-card__footer button {
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-weight: 950;
}

.shop-character-store__spotlight button {
  min-height: 4.2vh;
  display: flex;
  align-items: center;
  gap: 0.85vh;
  padding: 0 1.15vh;
  border: 1px solid rgb(172 46 205 / 45%);
  border-radius: 0.72vh;
  background:
    linear-gradient(180deg, rgb(214 107 255), rgb(137 37 165)),
    #ac2ecd;
  font-size: 0.94vh;
  text-shadow: 0 0.12vh 0.35vh rgb(0 0 0 / 24%);
}

.shop-character-store__spotlight button span {
  display: inline-flex;
  align-items: center;
  gap: 0.28vh;
  color: #ffffff;
}

.shop-character-store__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.15vh;
  margin-top: 1.2vh;
}

.shop-character-card {
  min-width: 0;
  min-height: 26.4vh;
  display: grid;
  grid-template-rows: auto minmax(8.8vh, 1fr) auto auto;
  gap: 1.05vh;
  padding: 1.15vh;
  border-radius: 0.86vh;
  overflow: hidden;
}

.shop-character-card--purple {
  background:
    radial-gradient(16vh 9vh at 50% 37%, rgb(172 46 205 / 13%), transparent 74%),
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 48%),
    rgb(7 7 8 / 88%);
}

.shop-character-card--blue {
  background:
    radial-gradient(16vh 9vh at 50% 37%, rgb(70 112 190 / 14%), transparent 74%),
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 48%),
    rgb(7 7 8 / 88%);
}

.shop-character-card--green {
  background:
    radial-gradient(16vh 9vh at 50% 37%, rgb(63 174 128 / 10%), transparent 74%),
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 48%),
    rgb(7 7 8 / 88%);
}

.shop-character-card__top,
.shop-character-card__footer,
.shop-character-card__price {
  display: flex;
  align-items: center;
}

.shop-character-card__top {
  min-width: 0;
  gap: 0.55vh;
}

.shop-character-card__top span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-character-card__top b {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 0.38vh 0.52vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 0.42vh;
  background: rgb(255 255 255 / 7%);
  color: rgb(255 255 255 / 76%);
  font-size: 0.7vh;
  font-weight: 900;
  line-height: 1;
}

.shop-character-card__rarity--rare {
  color: #8ecbff !important;
}

.shop-character-card__rarity--premium {
  color: #e7b9ff !important;
}

.shop-character-card__visual {
  display: grid;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.72vh;
  background:
    radial-gradient(11vh 7vh at 50% 45%, rgb(255 255 255 / 8%), transparent 74%),
    rgb(255 255 255 / 3%);
  color: rgb(255 255 255 / 74%);
}

.shop-character-card__body {
  min-width: 0;
  display: grid;
  gap: 0.58vh;
}

.shop-character-card__body strong,
.shop-character-card__body p {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shop-character-card__body strong {
  color: #ffffff;
  font-size: 1.18vh;
  font-weight: 950;
  line-height: 1.12;
  white-space: nowrap;
}

.shop-character-card__body p {
  display: -webkit-box;
  color: rgb(255 255 255 / 64%);
  font-size: 1vh;
  font-weight: 700;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.shop-character-card__footer {
  gap: 0.8vh;
}

.shop-character-card__price {
  min-width: 0;
  gap: 0.32vh;
  margin-right: auto;
  color: #ffffff;
}

.shop-character-card__price s {
  color: rgb(130 126 164 / 88%);
  font-size: 0.78vh;
  font-weight: 800;
}

.shop-character-card__price b {
  font-size: 1.12vh;
  font-weight: 950;
  line-height: 1;
}

.shop-character-card__footer button {
  min-height: 3.2vh;
  padding: 0 1vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.58vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 7%), transparent 44%),
    rgb(255 255 255 / 6%);
  font-size: 0.82vh;
  transition: border-color 150ms ease, background 150ms ease;
}

.shop-character-card__footer button:hover {
  border-color: rgb(172 46 205 / 38%);
  background: rgb(172 46 205 / 12%);
}

.shop-character-store__empty {
  min-height: 16vh;
  display: grid;
  place-items: center;
  margin-top: 1.2vh;
  border-radius: 0.86vh;
  color: rgb(255 255 255 / 48%);
  font-size: 1vh;
  font-weight: 800;
}

.shop-character-store :is(p, small, [class*="__meta"], [class*="__description"], [class*="__caption"]) {
  line-height: 1.35;
}
</style>
