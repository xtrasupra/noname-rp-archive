<template>
  <section class="shop-store-home">
    <h1 class="f2-menu__title">Главная</h1>

    <div class="shop-store-home-statusbar">
      <button
        v-for="item in statusItems"
        :key="item.title"
        class="shop-store-home-statusbar__item"
        type="button"
        @click="navigateShop(item.section)"
      >
        <span>
          <BaseIcon :icon="item.icon" size="sm" :stroke-width="2.35" />
        </span>
        <div>
          <small>{{ item.label }}</small>
          <strong>{{ item.title }}</strong>
        </div>
        <b v-if="item.value">{{ item.value }}</b>
      </button>
    </div>

    <div class="shop-store-home-grid">
      <section class="shop-store-home-widget shop-store-home-widget--recommendations">
        <header class="shop-store-home-widget__header">
          <span>
            <BaseIcon :icon="Sparkles" size="sm" :stroke-width="2.35" />
          </span>
          <div>
            <h2>Рекомендации</h2>
            <p>Подборка под текущие разделы магазина</p>
          </div>
        </header>

        <div class="shop-store-home-list">
          <button
            v-for="item in recommendations"
            :key="item.title"
            type="button"
            @click="navigateShop(item.section)"
          >
            <span class="shop-store-home-list__type">{{ item.type }}</span>
            <div>
              <strong>{{ item.title }}</strong>
              <small>{{ item.description }}</small>
            </div>
            <span class="shop-store-home-price">
              <s v-if="item.oldPrice">{{ item.oldPrice }}</s>
              <b>{{ item.price }}</b>
              <BaseIcon :icon="DollarSign" size="xs" :stroke-width="2.45" />
            </span>
          </button>
        </div>
      </section>

      <section class="shop-store-home-widget shop-store-home-widget--exchange">
        <header class="shop-store-home-widget__header">
          <span>
            <BaseIcon :icon="Repeat2" size="sm" :stroke-width="2.35" />
          </span>
          <div>
            <h2>Обмен валюты</h2>
            <p>Coins в игровую валюту</p>
          </div>
        </header>

        <div class="shop-store-home-exchange">
          <div>
            <small>Курс</small>
            <strong>1 Coin = ${{ exchangeRate.toLocaleString('ru-RU') }}</strong>
          </div>
          <div>
            <small>На балансе</small>
            <strong>{{ formattedDonateBalance }} Coins</strong>
          </div>
          <button type="button" @click="navigateShop('currency')">Перейти к обмену</button>
        </div>
      </section>

      <section class="shop-store-home-widget shop-store-home-widget--popular">
        <header class="shop-store-home-widget__header">
          <span>
            <BaseIcon :icon="Star" size="sm" :stroke-width="2.35" />
          </span>
          <div>
            <h2>Популярное</h2>
            <p>Активность игроков сегодня</p>
          </div>
        </header>

        <div class="shop-store-home-mini-list">
          <button
            v-for="item in popularItems"
            :key="item.title"
            type="button"
            @click="navigateShop(item.section)"
          >
            <span>{{ item.meta }}</span>
            <strong>{{ item.title }}</strong>
            <small>{{ item.description }}</small>
          </button>
        </div>
      </section>

      <section class="shop-store-home-widget shop-store-home-widget--character">
        <header class="shop-store-home-widget__header">
          <span>
            <BaseIcon :icon="Shirt" size="sm" :stroke-width="2.35" />
          </span>
          <div>
            <h2>Для персонажа</h2>
            <p>Одежда, предметы и купоны</p>
          </div>
        </header>

        <div class="shop-store-home-mini-list">
          <button
            v-for="item in characterItems"
            :key="item.title"
            type="button"
            @click="navigateShop(item.section)"
          >
            <span>{{ item.meta }}</span>
            <strong>{{ item.title }}</strong>
            <small>{{ item.description }}</small>
          </button>
        </div>
      </section>

    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FunctionalComponent } from 'vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

import {
  BadgeDollarSign,
  BaseIcon,
  Dice5,
  DollarSign,
  Repeat2,
  Shirt,
  Sparkles,
  Star,
  Ticket,
  Wallet,
} from '@/shared/icons'

type ShopSection = 'home' | 'topUp' | 'character' | 'cases' | 'inventory' | 'currency' | 'starterPack' | 'animations'

type StatusItem = {
  icon: FunctionalComponent
  label: string
  section: ShopSection
  title: string
  value?: string
}

type RecommendationItem = {
  description: string
  oldPrice?: string
  price: string
  section: ShopSection
  title: string
  type: string
}

type CompactItem = {
  description: string
  meta: string
  section: ShopSection
  title: string
}

const emit = defineEmits<{
  navigateShop: [section: ShopSection]
}>()

const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()

const shopPayload = computed(() => (props.payload as any)?.shop ?? {})
const serverCases = computed(() => {
  const cases = shopPayload.value.cases

  return Array.isArray(cases) ? cases : []
})
const donateBalance = computed(() => String((props.payload as any)?.donate ?? shopPayload.value.donate ?? 0))
const casesCount = computed(() => String((props.payload as any)?.casesCount ?? shopPayload.value.casesCount ?? 0))
const inventoryCount = computed(() => String((props.payload as any)?.inventoryCount ?? shopPayload.value.inventoryCount ?? 0))
const exchangeRate = computed(() => Number(shopPayload.value.exchange?.coinToCash ?? 120))
const formattedDonateBalance = computed(() => Number(donateBalance.value || 0).toLocaleString('ru-RU'))

const statusItems = computed<StatusItem[]>(() => [
  { icon: Wallet, label: 'Баланс', title: `${donateBalance.value} Coins`, value: '+ x2', section: 'topUp' },
  { icon: Dice5, label: 'Кейсы', title: 'Каталог кейсов', value: casesCount.value, section: 'cases' },
  { icon: BadgeDollarSign, label: 'Валюта', title: `$${exchangeRate.value.toLocaleString('ru-RU')} за Coin`, section: 'currency' },
  { icon: Ticket, label: 'Инвентарь', title: `${inventoryCount.value} предметов`, section: 'inventory' },
])

const recommendations = computed<RecommendationItem[]>(() => {
  const source = serverCases.value.slice(0, 4)

  if (!source.length) {
    return [
      { type: 'Кейс', title: 'Premium Club', description: 'Автомобили и крупные денежные награды', oldPrice: '700', price: '600', section: 'cases' },
      { type: 'Набор', title: 'Набор Шторм', description: 'Стартовый комплект с базовым капиталом', price: '1 789', section: 'starterPack' },
      { type: 'Предмет', title: 'Скидка на транспорт', description: 'Купон из инвентаря для будущей покупки', price: '120', section: 'inventory' },
      { type: 'Валюта', title: 'Быстрый обмен', description: 'Перевод Coins в игровую валюту', price: '1', section: 'currency' },
    ]
  }

  return source.map((caseItem: any) => ({
    type: 'Кейс',
    title: String(caseItem.title || 'Кейс'),
    description: String(caseItem.description || ''),
    oldPrice: caseItem.oldPrice ? String(caseItem.oldPrice) : undefined,
    price: String(caseItem.price ?? 0),
    section: 'cases',
  }))
})

const popularItems = computed<CompactItem[]>(() => {
  const source = [...serverCases.value].sort((left: any, right: any) => Number(right.dailyOpens || 0) - Number(left.dailyOpens || 0)).slice(0, 4)

  if (!source.length) {
    return [
      { meta: '1 304 открытия', title: 'Весенний кейс 2026', description: 'Чаще всего открывают сегодня', section: 'cases' },
      { meta: 'x2 бонус', title: 'Пополнение от 500', description: 'Популярный вариант депозита', section: 'topUp' },
      { meta: 'Одежда', title: 'Белые замшевые челси', description: 'Часто забирают в инвентарь', section: 'inventory' },
      { meta: 'Обмен', title: 'Coins -> $', description: 'Быстрый перевод валюты', section: 'currency' },
    ]
  }

  return source.map((caseItem: any) => ({
    meta: `${Number(caseItem.dailyOpens || 0).toLocaleString('ru-RU')} открытия`,
    title: String(caseItem.title || 'Кейс'),
    description: String(caseItem.description || ''),
    section: 'cases',
  }))
})

const characterItems = computed<CompactItem[]>(() => {
  const inventory = (shopPayload.value.inventory?.items || []) as any[]

  if (!inventory.length) {
    return [
      { meta: 'Одежда', title: 'Черная кофта Adidas', description: 'Временный предмет персонажа', section: 'inventory' },
      { meta: 'Медицина', title: 'Улучшенная аптечка', description: 'Расходник для активной игры', section: 'inventory' },
      { meta: 'Транспорт', title: 'Купон на транспорт', description: 'Скидка для покупки авто', section: 'inventory' },
    ]
  }

  return inventory.slice(0, 3).map((item) => ({
    meta: String(item.category || 'Предмет'),
    title: String(item.name || 'Предмет'),
    description: String(item.description || ''),
    section: 'inventory',
  }))
})

function navigateShop(section: ShopSection) {
  emit('navigateShop', section)
}
</script>

<style scoped>
.shop-store-home {
  position: relative;
  min-height: 0;
  padding-bottom: 0;
  isolation: isolate;
}

.shop-store-home-statusbar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1vh;
  margin-top: 3.35vh;
}

.shop-store-home-statusbar__item,
.shop-store-home-widget,
.shop-store-home-list button,
.shop-store-home-mini-list button {
  border: 1px solid rgb(255 255 255 / 6%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 48%),
    rgb(7 7 8 / 88%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
}

.shop-store-home-statusbar__item {
  min-width: 0;
  min-height: 6.2vh;
  display: grid;
  grid-template-columns: 3.2vh minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.82vh;
  padding: 0.85vh;
  border-radius: 0.78vh;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color 150ms ease, background 150ms ease;
}

.shop-store-home-statusbar__item:hover,
.shop-store-home-list button:hover,
.shop-store-home-mini-list button:hover,
.shop-store-home-exchange button:hover {
  border-color: rgb(172 46 205 / 34%);
  background:
    linear-gradient(180deg, rgb(172 46 205 / 9%), transparent 52%),
    rgb(12 9 14 / 90%);
}

.shop-store-home-statusbar__item > span,
.shop-store-home-widget__header > span {
  width: 3.1vh;
  height: 3.1vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(172 46 205 / 24%);
  border-radius: 0.68vh;
  background: rgb(172 46 205 / 10%);
  color: #d46bff;
}

.shop-store-home-statusbar__item div {
  min-width: 0;
  display: grid;
  gap: 0.25vh;
}

.shop-store-home-statusbar__item small,
.shop-store-home-widget__header p,
.shop-store-home-list small,
.shop-store-home-mini-list small,
.shop-store-home-exchange small {
  color: rgb(255 255 255 / 42%);
  font-weight: 700;
}

.shop-store-home-statusbar__item small {
  font-size: 0.86vh;
  line-height: 1.15;
}

.shop-store-home-statusbar__item strong,
.shop-store-home-statusbar__item b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-store-home-statusbar__item strong {
  color: #ffffff;
  font-size: 1vh;
  font-weight: 900;
}

.shop-store-home-statusbar__item b {
  padding: 0.38vh 0.52vh;
  border-radius: 0.42vh;
  background: rgb(172 46 205 / 16%);
  color: #e7b9ff;
  font-size: 0.78vh;
  font-weight: 900;
  line-height: 1;
}

.shop-store-home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.24fr) minmax(0, 0.86fr) minmax(0, 0.9fr);
  grid-template-areas:
    "recommendations exchange popular"
    "recommendations character popular";
  align-items: stretch;
  gap: 1vh;
  margin-top: 1vh;
}

.shop-store-home-widget {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 1.15vh;
  border-radius: 0.86vh;
  box-sizing: border-box;
}

.shop-store-home-widget--recommendations {
  grid-area: recommendations;
}

.shop-store-home-widget--exchange {
  grid-area: exchange;
}

.shop-store-home-widget--popular {
  grid-area: popular;
}

.shop-store-home-widget--character {
  grid-area: character;
}

.shop-store-home-widget__header {
  display: flex;
  align-items: center;
  gap: 0.82vh;
  margin-bottom: 1vh;
}

.shop-store-home-widget__header div {
  min-width: 0;
}

.shop-store-home-widget__header h2,
.shop-store-home-widget__header p {
  margin: 0;
}

.shop-store-home-widget__header h2 {
  color: #ffffff;
  font-size: 1.12vh;
  font-weight: 950;
  line-height: 1.1;
}

.shop-store-home-widget__header p {
  margin-top: 0.32vh;
  overflow: hidden;
  font-size: 0.92vh;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-store-home-list,
.shop-store-home-mini-list,
.shop-store-home-exchange {
  display: grid;
  gap: 0.76vh;
}

.shop-store-home-list,
.shop-store-home-mini-list {
  flex: 1;
  grid-auto-rows: minmax(0, 1fr);
}

.shop-store-home-list button,
.shop-store-home-mini-list button,
.shop-store-home-exchange button {
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  transition: border-color 150ms ease, background 150ms ease;
}

.shop-store-home-list button {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 5.4vh minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.82vh;
  padding: 0.82vh;
  border-radius: 0.7vh;
  text-align: left;
}

.shop-store-home-list__type {
  min-width: 0;
  padding: 0.42vh 0.5vh;
  border: 1px solid rgb(172 46 205 / 22%);
  border-radius: 0.42vh;
  background: rgb(172 46 205 / 10%);
  color: #d46bff;
  font-size: 0.8vh;
  font-weight: 900;
  line-height: 1;
  text-align: center;
}

.shop-store-home-list div,
.shop-store-home-mini-list button {
  min-width: 0;
}

.shop-store-home-list strong,
.shop-store-home-list small,
.shop-store-home-mini-list strong,
.shop-store-home-mini-list small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-store-home-list strong,
.shop-store-home-mini-list strong {
  color: #ffffff;
  font-size: 0.95vh;
  font-weight: 900;
}

.shop-store-home-list small,
.shop-store-home-mini-list small {
  margin-top: 0.28vh;
  font-size: 0.9vh;
  line-height: 1.3;
}

.shop-store-home-price {
  display: inline-flex;
  align-items: center;
  gap: 0.32vh;
  color: #ffffff;
  font-size: 0.95vh;
  font-weight: 950;
}

.shop-store-home-price s {
  color: rgb(130 126 164 / 88%);
  font-size: 0.8vh;
}

.shop-store-home-price b {
  line-height: 1;
}

.shop-store-home-exchange {
  align-content: start;
}

.shop-store-home-exchange > div {
  min-height: 4.6vh;
  display: grid;
  align-content: center;
  gap: 0.28vh;
  padding: 0 0.82vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.62vh;
  background: rgb(255 255 255 / 3%);
}

.shop-store-home-exchange strong {
  color: #ffffff;
  font-size: 1vh;
  font-weight: 900;
}

.shop-store-home-exchange small {
  font-size: 0.9vh;
  line-height: 1.3;
}

.shop-store-home-exchange button {
  min-height: 4.2vh;
  border: 1px solid rgb(172 46 205 / 45%);
  border-radius: 0.68vh;
  background:
    linear-gradient(180deg, rgb(214 107 255), rgb(137 37 165)),
    #ac2ecd;
  font-size: 0.92vh;
  font-weight: 950;
  text-shadow: 0 0.12vh 0.35vh rgb(0 0 0 / 24%);
}

.shop-store-home-mini-list button {
  min-height: 0;
  display: grid;
  align-content: center;
  gap: 0.22vh;
  padding: 0.75vh;
  border-radius: 0.68vh;
  text-align: left;
}

.shop-store-home-mini-list span {
  color: #d46bff;
  font-size: 0.8vh;
  font-weight: 900;
  line-height: 1;
}

.shop-store-home :is(p, small, [class*="__meta"], [class*="__description"], [class*="__caption"]) {
  line-height: 1.35;
}

@media (max-width: 1200px) {
  .shop-store-home-statusbar,
  .shop-store-home-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .shop-store-home-grid {
    grid-template-areas:
      "recommendations exchange"
      "recommendations popular"
      "character character";
  }
}
</style>
