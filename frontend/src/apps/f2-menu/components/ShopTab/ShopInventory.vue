<template>
  <section class="shop-inventory" @click="activeMenu = null">
    <header class="shop-inventory__toolbar" @click.stop>
      <div class="shop-inventory-filter-control">
        <button
          class="shop-inventory-filter shop-inventory-filter--items"
          :class="{ 'shop-inventory-filter--open': activeMenu === 'category' }"
          type="button"
          @click="toggleMenu('category')"
        >
          <span></span>
          {{ selectedCategoryLabel }}
          <i></i>
        </button>

        <div v-if="activeMenu === 'category'" class="shop-inventory-menu">
          <button
            v-for="option in categoryOptions"
            :key="option.value"
            class="shop-inventory-menu__item"
            :class="{ 'shop-inventory-menu__item--active': selectedCategory === option.value }"
            type="button"
            @click="selectCategory(option.value)"
          >
            <strong>{{ option.label }}</strong>
            <small>{{ option.description }}</small>
          </button>
        </div>
      </div>

      <div class="shop-inventory-filter-control">
        <button
          class="shop-inventory-filter shop-inventory-filter--sort"
          :class="{ 'shop-inventory-filter--open': activeMenu === 'sort' }"
          type="button"
          @click="toggleMenu('sort')"
        >
          <span></span>
          {{ selectedSortLabel }}
          <i></i>
        </button>

        <div v-if="activeMenu === 'sort'" class="shop-inventory-menu shop-inventory-menu--sort">
          <button
            v-for="option in sortOptions"
            :key="option.value"
            class="shop-inventory-menu__item"
            :class="{ 'shop-inventory-menu__item--active': selectedSort === option.value }"
            type="button"
            @click="selectSort(option.value)"
          >
            <strong>{{ option.label }}</strong>
            <small>{{ option.description }}</small>
          </button>
        </div>
      </div>

      <div class="shop-inventory__count">
        {{ filteredInventoryItems.length }} / {{ inventoryItemsView.length }}
      </div>
    </header>

    <div v-if="filteredInventoryItems.length" class="shop-inventory__grid">
      <article
        v-for="item in filteredInventoryItems"
        :key="item.name"
        class="inventory-card"
        :class="[`inventory-card--${item.tone}`, { 'inventory-card--with-action': item.action }]"
      >
        <span class="inventory-card__rarity"></span>

        <div class="inventory-card__meta">
          <strong v-if="item.amount">{{ item.amount }}</strong>
          <span v-if="item.price">{{ item.price }} <i :class="`inventory-card__currency--${item.currency ?? 'coin'}`"></i></span>
          <small v-if="item.extra">{{ item.extra }}</small>
        </div>

        <div class="inventory-card__visual">
          <img v-if="item.image" :src="item.image" alt="">
          <span v-else :class="['inventory-card__shape', `inventory-card__shape--${item.shape}`]"></span>
        </div>

        <div class="inventory-card__footer">
          <strong>{{ item.name }}</strong>
          <p v-if="item.description">{{ item.description }}</p>
        </div>

        <div class="inventory-card__actions" aria-label="Действия с предметом">
          <button type="button" @click.stop="claimInventoryItem(item)">
            Забрать
          </button>
          <button type="button" @click.stop="sellInventoryItem(item)">
            <span>Продать за</span>
            <b>{{ getSellPrice(item) }}</b>
            <BaseIcon :icon="DollarSign" size="xs" :stroke-width="2.4" />
          </button>
        </div>
      </article>
    </div>

    <div v-else class="shop-inventory__empty">
      Предметы не найдены
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

import { BaseIcon, DollarSign } from '@/shared/icons'
import { callClientEvent } from '@/core/client-events/client-event'
import { useNotificationStore } from '@/stores/notification.store'

const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()

type InventoryTone = 'purple' | 'gray' | 'blue' | 'pink'
type InventoryShape = 'packet' | 'ticket' | 'repair' | 'bomb' | 'medkit' | 'jacket' | 'boots' | 'cream' | 'syringe' | 'cane' | 'card' | 'armor' | 'ears' | 'wheel'
type InventoryCurrency = 'coin' | 'drop'
type InventoryCategory = 'all' | 'discounts' | 'medical' | 'clothes' | 'currency' | 'tools' | 'upgrades'
type InventorySort = 'default' | 'priceAsc' | 'priceDesc' | 'nameAsc' | 'amountDesc'
type InventoryMenu = 'category' | 'sort' | null

type InventoryItem = {
  action?: string
  amount?: string
  category: Exclude<InventoryCategory, 'all'>
  currency?: InventoryCurrency
  description?: string
  extra?: string
  image?: string
  name: string
  price?: string
  shape?: InventoryShape
  tone: InventoryTone
}

const notificationStore = useNotificationStore()

const serverInventoryItems = computed(() => {
  const items = (props.payload as any)?.inventory?.items ?? (props.payload as any)?.shop?.inventory?.items

  return Array.isArray(items) && items.length ? items : null
})

const inventoryItems = ref<InventoryItem[]>([
  { name: 'Пакетик с Green', amount: '150 шт.', category: 'tools', shape: 'packet', tone: 'purple' },
  { name: '10% скидка на покупку транспорта', category: 'discounts', price: '1', shape: 'ticket', tone: 'pink' },
  { name: 'Ремонтный комплект для оружия', category: 'upgrades', price: '120', shape: 'repair', tone: 'gray' },
  { name: 'StatTrak', category: 'upgrades', price: '250', currency: 'drop', shape: 'bomb', tone: 'blue' },
  { name: 'Улучшенная аптечка', category: 'medical', price: '20', shape: 'medkit', tone: 'gray' },
  { name: 'Черная кофта Adidas Chinese', category: 'clothes', description: 'в д. 23 ч. 45 м.', price: '800', currency: 'drop', shape: 'jacket', tone: 'gray' },
  { name: 'Белые замшевые челси', category: 'clothes', shape: 'boots', tone: 'gray' },
  { name: 'Крем-маска', category: 'medical', price: '20', extra: '4 шт.', shape: 'cream', tone: 'gray' },
  { name: '10% скидка на покупку одежды', category: 'discounts', price: '1', shape: 'ticket', tone: 'gray' },
  { name: 'Стимулятор лечения', category: 'medical', price: '20', extra: '3 шт.', shape: 'syringe', tone: 'gray' },
  { name: 'Лом', action: 'Забрать', category: 'tools', shape: 'cane', tone: 'gray' },
  { name: '$7 500', category: 'currency', shape: 'card', tone: 'gray' },
  { name: 'Бронепластина', category: 'upgrades', price: '200', currency: 'drop', extra: '5 шт.', shape: 'armor', tone: 'blue' },
  { name: 'Белые ушки кота', category: 'clothes', shape: 'ears', tone: 'pink' },
  { name: 'Vorsteiner VC-323 Покрасочное колесо с эл. хрома', category: 'upgrades', price: '800', currency: 'drop', shape: 'wheel', tone: 'gray' },
])

const inventoryItemsView = computed(() => serverInventoryItems.value ?? inventoryItems.value)

const categoryOptions: Array<{ description: string, label: string, value: InventoryCategory }> = [
  { value: 'all', label: 'Все предметы', description: 'Полный инвентарь' },
  { value: 'discounts', label: 'Скидки', description: 'Купоны и предложения' },
  { value: 'medical', label: 'Медицина', description: 'Аптечки и лечение' },
  { value: 'clothes', label: 'Одежда', description: 'Образы и аксессуары' },
  { value: 'currency', label: 'Валюта', description: 'Деньги и балансы' },
  { value: 'tools', label: 'Предметы', description: 'Используемые вещи' },
  { value: 'upgrades', label: 'Улучшения', description: 'Модули и детали' },
]

const sortOptions: Array<{ description: string, label: string, value: InventorySort }> = [
  { value: 'default', label: 'Без сортировки', description: 'Как получено' },
  { value: 'priceAsc', label: 'Сначала дешевые', description: 'Цена по возрастанию' },
  { value: 'priceDesc', label: 'Сначала дорогие', description: 'Цена по убыванию' },
  { value: 'amountDesc', label: 'Больше количества', description: 'Сначала стаки' },
  { value: 'nameAsc', label: 'По названию', description: 'А-Я' },
]

const activeMenu = ref<InventoryMenu>(null)
const selectedCategory = ref<InventoryCategory>('all')
const selectedSort = ref<InventorySort>('default')

const selectedCategoryLabel = computed(() => categoryOptions.find((option) => option.value === selectedCategory.value)?.label ?? 'Все предметы')
const selectedSortLabel = computed(() => sortOptions.find((option) => option.value === selectedSort.value)?.label ?? 'Без сортировки')

const filteredInventoryItems = computed(() => {
  const byCategory = selectedCategory.value === 'all'
    ? inventoryItemsView.value
    : inventoryItemsView.value.filter((item) => item.category === selectedCategory.value)

  const sorted = [...byCategory]

  switch (selectedSort.value) {
    case 'priceAsc':
      return sorted.sort((left, right) => getPriceValue(left) - getPriceValue(right))
    case 'priceDesc':
      return sorted.sort((left, right) => getPriceValue(right) - getPriceValue(left))
    case 'amountDesc':
      return sorted.sort((left, right) => getAmountValue(right) - getAmountValue(left))
    case 'nameAsc':
      return sorted.sort((left, right) => left.name.localeCompare(right.name, 'ru'))
    default:
      return sorted
  }
})

function getPriceValue(item: InventoryItem) {
  return Number(item.price?.replace(/[^\d]/g, '') ?? 0)
}

function getAmountValue(item: InventoryItem) {
  return Number((item.amount ?? item.extra)?.replace(/[^\d]/g, '') ?? 0)
}

function getSellPrice(item: InventoryItem) {
  const price = getPriceValue(item)

  if (price > 0) {
    return price
  }

  const amount = getAmountValue(item)

  if (amount > 0) {
    return Math.max(10, Math.round(amount * 0.35))
  }

  return 50
}

function claimInventoryItem(item: InventoryItem) {
  callClientEvent('f2:inventory:claim', JSON.stringify(item))
  notificationStore.notify(`${item.name} забран`, {
    title: 'Инвентарь',
    variant: 'success',
  })
}

function sellInventoryItem(item: InventoryItem) {
  const sellPrice = getSellPrice(item)

  callClientEvent('f2:inventory:sell', JSON.stringify(item))
  notificationStore.notify(`${item.name} продан за ${sellPrice} Coins`, {
    title: 'Продажа предмета',
    variant: 'success',
  })
}

function toggleMenu(menu: Exclude<InventoryMenu, null>) {
  activeMenu.value = activeMenu.value === menu ? null : menu
}

function selectCategory(category: InventoryCategory) {
  selectedCategory.value = category
  activeMenu.value = null
}

function selectSort(sort: InventorySort) {
  selectedSort.value = sort
  activeMenu.value = null
}
</script>

<style scoped>
.shop-inventory {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 1.35vh;
  padding: 1.5vh 1.65vh 2vh;
  overflow: hidden auto;
}

.shop-inventory__toolbar {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 1vh;
}

.shop-inventory-filter-control {
  position: relative;
}

.shop-inventory-filter {
  min-width: 18.6vh;
  height: 4.1vh;
  display: inline-flex;
  align-items: center;
  gap: 0.85vh;
  padding: 0 1.35vh;
  border: 0;
  border-radius: 0.65vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 7%), rgb(255 255 255 / 3%)),
    rgb(15 15 17 / 94%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 7%);
  color: rgb(255 255 255 / 58%);
  cursor: pointer;
  font: inherit;
  font-size: 1.08vh;
  font-weight: 600;
  transition: color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  white-space: nowrap;
}

.shop-inventory-filter span,
.shop-inventory-filter i {
  position: relative;
  flex: 0 0 auto;
}

.shop-inventory-filter span {
  width: 1.25vh;
  height: 1.25vh;
  opacity: 0.7;
}

.shop-inventory-filter--items span {
  background:
    linear-gradient(currentColor 0 0) 0 0 / 0.45vh 0.45vh,
    linear-gradient(currentColor 0 0) 0.8vh 0 / 0.45vh 0.45vh,
    linear-gradient(currentColor 0 0) 0 0.8vh / 0.45vh 0.45vh,
    linear-gradient(currentColor 0 0) 0.8vh 0.8vh / 0.45vh 0.45vh;
  background-repeat: no-repeat;
}

.shop-inventory-filter--sort span::before,
.shop-inventory-filter--sort span::after {
  position: absolute;
  left: 0;
  width: 1.2vh;
  height: 0.18vh;
  border-radius: 999px;
  background: currentColor;
  content: "";
}

.shop-inventory-filter--sort span::before {
  top: 0.35vh;
}

.shop-inventory-filter--sort span::after {
  top: 0.8vh;
  width: 0.75vh;
}

.shop-inventory-filter i {
  width: 0.6vh;
  height: 0.6vh;
  margin-left: auto;
  border-right: 0.18vh solid currentColor;
  border-bottom: 0.18vh solid currentColor;
  transform: rotate(45deg) translateY(-0.15vh);
  transition: transform 0.16s ease;
}

.shop-inventory-filter:hover,
.shop-inventory-filter--open {
  color: rgb(255 255 255 / 86%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 4%)),
    rgb(18 18 21 / 96%);
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 12%),
    0 1.2vh 2.4vh rgb(0 0 0 / 22%);
}

.shop-inventory-filter--open i {
  transform: rotate(225deg) translate(-0.18vh, -0.12vh);
}

.shop-inventory-menu {
  position: absolute;
  left: 0;
  top: calc(100% + 0.55vh);
  z-index: 20;
  width: 24vh;
  display: grid;
  gap: 0.35vh;
  padding: 0.55vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.7vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 7%), rgb(255 255 255 / 2%)),
    rgb(10 10 12 / 98%);
  box-shadow: 0 1.8vh 4vh rgb(0 0 0 / 42%);
}

.shop-inventory-menu--sort {
  width: 25.5vh;
}

.shop-inventory-menu__item {
  min-height: 4.15vh;
  display: grid;
  gap: 0.25vh;
  justify-items: start;
  padding: 0.75vh 0.9vh;
  border: 0;
  border-radius: 0.5vh;
  background: transparent;
  color: rgb(255 255 255 / 74%);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
}

.shop-inventory-menu__item strong,
.shop-inventory-menu__item small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-inventory-menu__item strong {
  font-size: 1.02vh;
  font-weight: 700;
  line-height: 1.1;
}

.shop-inventory-menu__item small {
  color: rgb(255 255 255 / 42%);
  font-size: 0.82vh;
  font-weight: 600;
  line-height: 1.1;
}

.shop-inventory-menu__item:hover,
.shop-inventory-menu__item--active {
  background: rgb(255 255 255 / 7%);
  color: #ffffff;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 7%);
}

.shop-inventory-menu__item--active small {
  color: rgb(255 255 255 / 58%);
}

.shop-inventory__count {
  min-width: 6.8vh;
  height: 4.1vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 1vh;
  border-radius: 0.65vh;
  background: rgb(255 255 255 / 4%);
  color: rgb(255 255 255 / 44%);
  font-size: 0.96vh;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 5%);
}

.shop-inventory__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.15vh;
  align-content: start;
  padding-bottom: 3vh;
}

.shop-inventory__empty {
  min-height: 19.6vh;
  display: grid;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.55vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 32%),
    rgb(8 8 9 / 92%);
  color: rgb(255 255 255 / 48%);
  font-size: 1.08vh;
  font-weight: 700;
}

.inventory-card {
  position: relative;
  min-height: 22.4vh;
  display: grid;
  grid-template-rows: 1fr auto;
  padding: 1.15vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.55vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 32%),
    rgb(8 8 9 / 92%);
  box-sizing: border-box;
  overflow: hidden;
}

.inventory-card__rarity {
  position: absolute;
  left: 1vh;
  top: 1vh;
  width: 1.8vh;
  height: 0.35vh;
  border-radius: 999px;
  background: #a0a0a0;
}

.inventory-card--purple .inventory-card__rarity {
  background: #7d4dff;
}

.inventory-card--blue .inventory-card__rarity {
  background: #3aa7ff;
}

.inventory-card--pink .inventory-card__rarity {
  background: #f11967;
}

.inventory-card__meta {
  position: absolute;
  right: 1vh;
  top: 0.95vh;
  z-index: 2;
  display: grid;
  justify-items: end;
  gap: 0.25vh;
  color: #ffffff;
  font-size: 0.92vh;
  font-weight: 600;
}

.inventory-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 0.35vh;
}

.inventory-card__meta small {
  color: rgb(255 255 255 / 48%);
  font-size: 0.82vh;
}

.inventory-card__currency--coin,
.inventory-card__currency--drop {
  width: 1vh;
  height: 1vh;
  display: inline-block;
  border-radius: 50%;
}

.inventory-card__currency--coin {
  background: radial-gradient(circle at 38% 35%, #ff8ebb, #e21563 68%);
}

.inventory-card__currency--drop {
  background: radial-gradient(circle at 35% 35%, #75d8ff, #0a84ff 70%);
}

.inventory-card__visual {
  display: grid;
  place-items: center;
  min-height: 12.5vh;
}

.inventory-card__visual img {
  max-width: 82%;
  max-height: 11vh;
  object-fit: contain;
}

.inventory-card__shape {
  position: relative;
  display: block;
  width: 8.2vh;
  height: 8.2vh;
}

.inventory-card__shape--packet {
  width: 5.9vh;
  height: 8.2vh;
  border-radius: 0.3vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 18%), transparent 22%),
    linear-gradient(0deg, #5b7334 0 28%, #b5b2a4 29% 100%);
  opacity: 0.82;
}

.inventory-card__shape--ticket {
  width: 10.5vh;
  height: 5.2vh;
  border-radius: 0.5vh;
  background: linear-gradient(135deg, #67a7ff, #2f6ce5);
}

.inventory-card__shape--ticket::before {
  position: absolute;
  inset: 1.2vh 1.1vh;
  color: #ffffff;
  content: "10%";
  font-size: 2.3vh;
  font-weight: 600;
}

.inventory-card__shape--ticket::after {
  position: absolute;
  right: 0.8vh;
  top: 0.65vh;
  width: 2.2vh;
  height: 3.9vh;
  border-radius: 0.2vh;
  background:
    repeating-linear-gradient(90deg, #111 0 0.12vh, #fff 0.12vh 0.28vh);
  content: "";
}

.inventory-card__shape--repair {
  width: 8.2vh;
  height: 5.8vh;
  border-radius: 0.55vh;
  background: linear-gradient(145deg, #fafafa, #bfc2c8);
}

.inventory-card__shape--repair::before {
  position: absolute;
  left: 2.9vh;
  top: -0.8vh;
  width: 2.6vh;
  height: 1.5vh;
  border: 0.45vh solid #d7d9df;
  border-bottom: 0;
  border-radius: 0.6vh 0.6vh 0 0;
  content: "";
}

.inventory-card__shape--bomb {
  width: 11vh;
  height: 5.8vh;
  border-radius: 0.35vh;
  background:
    linear-gradient(90deg, #1d1f25, #2d3039),
    #111;
  box-shadow: inset 0 0 0 0.28vh #da4258;
}

.inventory-card__shape--bomb::before {
  position: absolute;
  inset: 0.8vh 1vh;
  color: #ff88a0;
  content: "00 0000";
  font-size: 2.2vh;
  font-weight: 600;
  letter-spacing: 0.12vh;
}

.inventory-card__shape--medkit {
  width: 9.4vh;
  height: 5.6vh;
  border-radius: 0.7vh;
  background: linear-gradient(145deg, #ffd51f, #e39a00);
}

.inventory-card__shape--medkit::before {
  position: absolute;
  left: 4.15vh;
  top: 1.65vh;
  width: 1.3vh;
  height: 2.3vh;
  background: #ffffff;
  box-shadow: -0.5vh 0.5vh 0 -0.2vh #ffffff, 0.5vh 0.5vh 0 -0.2vh #ffffff;
  content: "";
}

.inventory-card__shape--jacket {
  width: 8.8vh;
  height: 8.4vh;
  background: #14161a;
  clip-path: polygon(18% 12%, 38% 0, 50% 12%, 62% 0, 82% 12%, 100% 72%, 75% 84%, 68% 37%, 64% 100%, 36% 100%, 32% 37%, 25% 84%, 0 72%);
}

.inventory-card__shape--boots::before,
.inventory-card__shape--boots::after {
  position: absolute;
  bottom: 2vh;
  width: 3vh;
  height: 2.1vh;
  border-radius: 0.4vh 0.4vh 0.8vh 0.8vh;
  background: linear-gradient(145deg, #e9e9e9, #a9adb5);
  content: "";
}

.inventory-card__shape--boots::before {
  left: 1vh;
}

.inventory-card__shape--boots::after {
  right: 1vh;
}

.inventory-card__shape--cream {
  width: 4.2vh;
  height: 8.5vh;
  border-radius: 0.5vh 0.5vh 1vh 1vh;
  background: linear-gradient(180deg, #f6e5dc, #ffffff);
}

.inventory-card__shape--cream::before {
  position: absolute;
  left: 1vh;
  top: 2.6vh;
  color: #d71932;
  content: "CREAM";
  font-size: 0.75vh;
  font-weight: 600;
}

.inventory-card__shape--syringe {
  width: 1.25vh;
  height: 9vh;
  border-radius: 999px;
  background: linear-gradient(180deg, #ffffff 0 48%, #e6293f 49% 78%, #ffffff 79%);
}

.inventory-card__shape--cane {
  width: 1vh;
  height: 9.5vh;
  border-radius: 999px;
  background: #3a2015;
  transform: rotate(8deg);
}

.inventory-card__shape--cane::before {
  position: absolute;
  left: -1.6vh;
  top: -0.35vh;
  width: 2.8vh;
  height: 2.2vh;
  border: 0.5vh solid #3a2015;
  border-right: 0;
  border-bottom: 0;
  border-radius: 1.4vh 0 0 0;
  content: "";
}

.inventory-card__shape--card {
  width: 8.8vh;
  height: 5.2vh;
  border-radius: 0.55vh;
  background: linear-gradient(145deg, #db2335, #711520);
  transform: rotate(-12deg);
}

.inventory-card__shape--card::before {
  position: absolute;
  left: 1vh;
  top: 1.6vh;
  color: #ffffff;
  content: "SHARK";
  font-size: 1.15vh;
  font-weight: 600;
}

.inventory-card__shape--armor {
  width: 7vh;
  height: 8.7vh;
  border-radius: 1vh 1vh 0.45vh 0.45vh;
  background: linear-gradient(145deg, #30343a, #111318);
  clip-path: polygon(18% 0, 82% 0, 100% 18%, 82% 100%, 18% 100%, 0 18%);
}

.inventory-card__shape--ears::before,
.inventory-card__shape--ears::after {
  position: absolute;
  bottom: 1.4vh;
  width: 3vh;
  height: 5.4vh;
  background: linear-gradient(145deg, #ffffff, #b7bbc2);
  content: "";
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}

.inventory-card__shape--ears::before {
  left: 1vh;
  transform: rotate(-18deg);
}

.inventory-card__shape--ears::after {
  right: 1vh;
  transform: rotate(18deg);
}

.inventory-card__shape--wheel {
  width: 8vh;
  height: 8vh;
  border-radius: 50%;
  background:
    radial-gradient(circle, transparent 0 18%, #111 19% 27%, transparent 28%),
    conic-gradient(#d9d9d9 0 8%, #222 8% 17%, #d9d9d9 17% 25%, #222 25% 34%, #d9d9d9 34% 42%, #222 42% 51%, #d9d9d9 51% 59%, #222 59% 68%, #d9d9d9 68% 76%, #222 76% 85%, #d9d9d9 85% 93%, #222 93%);
  box-shadow: inset 0 0 0 0.8vh #30343a;
}

.inventory-card__footer {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 0.62vh;
}

.inventory-card__footer strong,
.inventory-card__footer p {
  margin: 0;
}

.inventory-card__footer strong {
  color: #ffffff;
  font-size: 1.12vh;
  font-weight: 600;
  line-height: 1.2;
}

.inventory-card__footer p {
  color: rgb(255 255 255 / 64%);
  font-size: 1vh;
  font-weight: 600;
  line-height: 1.35;
}

.inventory-card__actions {
  position: absolute;
  left: 1vh;
  right: 1vh;
  bottom: 1vh;
  z-index: 4;
  display: grid;
  gap: 0.55vh;
  opacity: 0;
  pointer-events: none;
  transform: translateY(0.7vh);
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.inventory-card:hover .inventory-card__actions,
.inventory-card:focus-within .inventory-card__actions {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.inventory-card__actions button {
  width: 100%;
  min-height: 3.45vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.38vh;
  border: 0;
  border-radius: 0.5vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 5%)),
    rgb(18 18 20 / 92%);
  color: rgb(255 255 255 / 88%);
  cursor: pointer;
  font: inherit;
  font-size: 1.02vh;
  font-weight: 700;
  line-height: 1;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%);
  transition: background 0.14s ease, box-shadow 0.14s ease, color 0.14s ease;
  white-space: nowrap;
}

.inventory-card__actions button:hover {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 14%), rgb(255 255 255 / 7%)),
    rgb(24 24 27 / 96%);
  color: #ffffff;
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 14%),
    0 0.7vh 1.4vh rgb(0 0 0 / 24%);
}

.inventory-card__actions button:last-child {
  color: #ffffff;
}

.inventory-card__actions b {
  font-size: 1.08vh;
  font-weight: 800;
}

.inventory-card__actions :deep(.twinkle-icon) {
  flex: 0 0 auto;
  width: 1.1vh;
  height: 1.1vh;
}

.shop-inventory :is(p, small, [class*="__meta"], [class*="__description"], [class*="__caption"]) {
  line-height: 1.35;
}
</style>
