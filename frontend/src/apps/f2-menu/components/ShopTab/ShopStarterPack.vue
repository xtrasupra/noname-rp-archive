<template>
  <section class="shop-starter-pack">
    <h1 class="f2-menu__title">Стартовые наборы</h1>

    <div class="shop-starter-pack__grid">
      <article
        v-for="pack in starterPacks"
        :key="pack.id"
        class="starter-pack-card"
        :class="`starter-pack-card--${pack.labelTone}`"
        role="button"
        tabindex="0"
        @click="selectedPack = pack"
        @keydown.enter.prevent="selectedPack = pack"
        @keydown.space.prevent="selectedPack = pack"
      >
        <div class="starter-pack-card__visual">
          <div>
            <span>Пакет:</span>
            <strong>«{{ pack.title }}»</strong>
          </div>
          <img :src="pack.heroImage" alt="">
          <i></i>
        </div>

        <div class="starter-pack-card__body">
          <div class="starter-pack-card__labels">
            <span>{{ pack.kicker }}</span>
            <b :class="`starter-pack-card__label--${pack.labelTone}`">{{ pack.label }}</b>
          </div>

          <strong>Стартовый набор "{{ pack.title }}"</strong>
          <p>{{ pack.description }}</p>
        </div>

        <div class="starter-pack-card__includes">
          <article v-for="item in pack.items.slice(0, 4)" :key="item.title">
            <img :src="item.image" alt="">
            <div>
              <span>{{ item.category }}</span>
              <strong>{{ item.title }}</strong>
            </div>
          </article>
        </div>

        <footer class="starter-pack-card__footer">
          <span>
            <small>Цена</small>
            <b>{{ pack.price }}</b>
          </span>

          <button type="button" @click.stop="selectedPack = pack">
            Подробнее
          </button>
        </footer>
      </article>
    </div>

    <Teleport to="body">
      <Transition name="starter-pack-modal">
        <div
          v-if="selectedPack"
          class="starter-pack-modal"
          :class="`starter-pack-modal--${selectedPack.labelTone}`"
          role="dialog"
          aria-modal="true"
          aria-label="Состав стартового набора"
          @click.self="selectedPack = null"
        >
          <section class="starter-pack-modal__panel">
            <header class="starter-pack-modal__header">
              <div>
                <span>{{ selectedPack.kicker }}</span>
                <h2>Стартовый набор "{{ selectedPack.title }}"</h2>
                <p>{{ selectedPack.description }}</p>
              </div>

              <button type="button" aria-label="Закрыть" @click="selectedPack = null">
                <BaseIcon :icon="X" size="sm" :stroke-width="2.6" />
              </button>
            </header>

            <div class="starter-pack-modal__hero">
              <img :src="selectedPack.heroImage" alt="">
              <div>
                <span>Стоимость набора</span>
                <strong>{{ selectedPack.price }}</strong>
              </div>
            </div>

            <div class="starter-pack-modal__items">
              <article
                v-for="item in selectedPack.items"
                :key="item.title"
                class="starter-pack-item"
              >
                <div class="starter-pack-item__visual">
                  <img :src="item.image" alt="">
                </div>

                <div>
                  <span>{{ item.category }}</span>
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.description }}</p>
                </div>
              </article>
            </div>

            <footer class="starter-pack-modal__actions">
              <button type="button" @click="selectedPack = null">Закрыть</button>
              <button type="button" @click="buyPack(selectedPack)">Купить набор</button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import { BaseIcon, X } from '@/shared/icons'
import { useNotificationStore } from '@/stores/notification.store'

type StarterPackItem = {
  category: string
  description: string
  image: string
  title: string
}

type StarterPack = {
  description: string
  heroImage: string
  id: string
  image: string
  items: StarterPackItem[]
  kicker: string
  label: string
  labelTone: 'popular' | 'rare' | 'value'
  price: string
  title: string
}

const notificationStore = useNotificationStore()
const selectedPack = ref<StarterPack | null>(null)

const starterPacks: StarterPack[] = [
  {
    description: 'Подойдет для начинающих, чтобы быстро встать на ноги в городе.',
    heroImage: './starter-packs/property-pack-hq.png',
    id: 'property',
    image: './starter-packs/crate.png',
    kicker: 'Для старта',
    label: 'Популярно',
    labelTone: 'popular',
    price: '1 490 Coins',
    title: 'Имущество',
    items: [
      { category: 'Баланс', description: 'Деньги для первых покупок и расходов.', image: './starter-packs/money.png', title: '$150 000' },
      { category: 'Транспорт', description: 'Быстрый автомобиль для города.', image: './starter-packs/car-keys.png', title: 'Машина Cheetah' },
      { category: 'Статус', description: 'Комфортные бонусы на первый месяц.', image: './starter-packs/crate.png', title: 'VIP 30 дней' },
      { category: 'Документы', description: 'Базовые права для езды по штату.', image: './starter-packs/car-keys.png', title: 'Водительские права' },
    ],
  },
  {
    description: 'Набор для тех, кто хочет начать с транспорта и документов.',
    heroImage: './starter-packs/property-pack-hq.png',
    id: 'driver',
    image: './starter-packs/crate.png',
    kicker: 'Городской',
    label: 'Выгодно',
    labelTone: 'value',
    price: '990 Coins',
    title: 'Водитель',
    items: [
      { category: 'Баланс', description: 'Запас на топливо, штрафы и мелкие покупки.', image: './starter-packs/money.png', title: '$75 000' },
      { category: 'Транспорт', description: 'Личный автомобиль начального класса.', image: './starter-packs/car-keys.png', title: 'Машина Sultan' },
      { category: 'Документы', description: 'Доступ к базовому транспорту.', image: './starter-packs/car-keys.png', title: 'Водительские права' },
      { category: 'Бонус', description: 'Ускоренный старт в городских активностях.', image: './starter-packs/crate.png', title: 'VIP 14 дней' },
    ],
  },
  {
    description: 'Для активной RP-игры, покупок и быстрого развития персонажа.',
    heroImage: './starter-packs/property-pack-hq.png',
    id: 'business',
    image: './starter-packs/crate.png',
    kicker: 'Премиум',
    label: 'Редкий',
    labelTone: 'rare',
    price: '2 490 Coins',
    title: 'Бизнес',
    items: [
      { category: 'Баланс', description: 'Крупная сумма для вложений и покупок.', image: './starter-packs/money.png', title: '$300 000' },
      { category: 'Транспорт', description: 'Автомобиль для статуса и скорости.', image: './starter-packs/car-keys.png', title: 'Машина Comet' },
      { category: 'Статус', description: 'Больше удобства и бонусов каждый день.', image: './starter-packs/crate.png', title: 'VIP 30 дней' },
      { category: 'Документы', description: 'Готовый пакет городских разрешений.', image: './starter-packs/car-keys.png', title: 'Пакет лицензий' },
    ],
  },
]

function buyPack(pack: StarterPack) {
  notificationStore.notify(`${pack.title} добавлен к покупке`, {
    title: 'Стартовые наборы',
    variant: 'success',
  })
  selectedPack.value = null
}
</script>

<style scoped>
.shop-starter-pack {
  min-height: 80vh;
  padding-bottom: 2vh;
}

.shop-starter-pack__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.2vh;
  margin-top: 3.35vh;
}

.starter-pack-card {
  --pack-accent: #d454f4;
  --pack-accent-border: #d454f459;
  --pack-accent-soft: #d454f426;

  min-width: 0;
  min-height: 55vh;
  display: grid;
  grid-template-rows: minmax(23vh, 1fr) auto auto auto;
  gap: 1.2vh;
  padding: 1.3vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.9vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 42%),
    rgb(7 7 8 / 88%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
  color: #ffffff;
  cursor: pointer;
  outline: 0;
  overflow: hidden;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.starter-pack-card--value {
  --pack-accent: rgb(83 169 232);
  --pack-accent-border: rgb(83 169 232 / 42%);
  --pack-accent-soft: rgb(83 169 232 / 15%);
}

.starter-pack-card--popular {
  --pack-accent: #d454f4;
  --pack-accent-border: #d454f459;
  --pack-accent-soft: #d454f426;
}

.starter-pack-card--rare {
  --pack-accent: #f4c454;
  --pack-accent-border: #f4c45459;
  --pack-accent-soft: #f4c45426;
}

.starter-pack-card--popular .starter-pack-card__visual {
  background:
    linear-gradient(180deg, rgb(54 45 34 / 84%), rgb(32 28 25 / 94%)),
    rgb(11 11 12 / 94%);
}

.starter-pack-card--value .starter-pack-card__visual {
  background:
    linear-gradient(180deg, rgb(29 43 55 / 86%), rgb(20 27 34 / 94%)),
    rgb(11 11 12 / 94%);
}

.starter-pack-card--rare .starter-pack-card__visual {
  background:
    linear-gradient(180deg, var(--pack-accent-soft), rgb(34 28 17 / 94%)),
    rgb(11 11 12 / 94%);
}

.starter-pack-card:hover,
.starter-pack-card:focus-visible {
  border-color: var(--pack-accent-border);
  background:
    linear-gradient(180deg, var(--pack-accent-soft), transparent 48%),
    rgb(8 8 9 / 92%);
  transform: translateY(-0.2vh);
}

.starter-pack-card__visual {
  position: relative;
  min-height: 23vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  justify-items: center;
  align-items: end;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.7vh;
  background: rgb(255 255 255 / 3%);
  overflow: hidden;
}

.starter-pack-card__visual div {
  position: relative;
  z-index: 2;
  display: grid;
  justify-items: center;
  gap: 0.42vh;
  padding-top: 1.45vh;
}

.starter-pack-card__visual div span {
  color: rgb(255 255 255 / 78%);
  font-size: 1.02vh;
  font-weight: 700;
  line-height: 1;
}

.starter-pack-card__visual div strong {
  color: #ffffff;
  font-size: 1.34vh;
  font-weight: 950;
  line-height: 1;
}

.starter-pack-card__visual img {
  position: relative;
  z-index: 1;
  width: 112%;
  max-height: 18vh;
  object-fit: contain;
}

.starter-pack-card__visual i {
  position: absolute;
  left: 2.6vh;
  right: 2.6vh;
  bottom: 0;
  height: 0.28vh;
  border-radius: 999px 999px 0 0;
  background: var(--pack-accent);
}

.starter-pack-card--popular .starter-pack-card__visual i {
  background: var(--pack-accent);
}

.starter-pack-card--value .starter-pack-card__visual i {
  background: var(--pack-accent);
}

.starter-pack-card--rare .starter-pack-card__visual i {
  background: var(--pack-accent);
  box-shadow: 0 0 1.2vh var(--pack-accent-border);
}

.starter-pack-card__body {
  min-width: 0;
}

.starter-pack-card__labels {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8vh;
}

.starter-pack-card__labels > span,
.starter-pack-modal__header span,
.starter-pack-modal__hero span,
.starter-pack-item span {
  color: var(--pack-accent, #d454f4);
  font-size: 0.78vh;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
}

.starter-pack-card__labels b {
  flex: 0 0 auto;
  padding: 0.42vh 0.62vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 999px;
  color: #ffffff;
  font-size: 0.72vh;
  font-weight: 950;
  line-height: 1;
  text-transform: uppercase;
}

.starter-pack-card__label--popular {
  border-color: var(--pack-accent-border) !important;
  background: var(--pack-accent-soft);
}

.starter-pack-card__label--value {
  border-color: var(--pack-accent-border) !important;
  background: var(--pack-accent-soft);
}

.starter-pack-card__label--rare {
  border-color: rgb(255 255 255 / 12%) !important;
  background: rgb(0 0 0 / 34%);
  color: var(--pack-accent) !important;
}

.starter-pack-card__body strong {
  display: block;
  margin-top: 0.62vh;
  overflow: hidden;
  color: #ffffff;
  font-size: 1.45vh;
  font-weight: 950;
  line-height: 1.08;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.starter-pack-card__body p {
  margin: 0.72vh 0 0;
  color: rgb(255 255 255 / 64%);
  font-size: 1.08vh;
  font-weight: 700;
  line-height: 1.38;
}

.starter-pack-card__includes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.62vh;
}

.starter-pack-card__includes article {
  min-width: 0;
  min-height: 6.2vh;
  display: grid;
  grid-template-columns: 4.4vh minmax(0, 1fr);
  align-items: center;
  gap: 0.65vh;
  padding: 0.55vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.58vh;
  background: rgb(255 255 255 / 4%);
}

.starter-pack-card__includes img {
  width: 4.2vh;
  max-height: 4.2vh;
  object-fit: contain;
}

.starter-pack-card__includes div {
  min-width: 0;
}

.starter-pack-card__includes span {
  display: block;
  overflow: hidden;
  color: rgb(255 255 255 / 38%);
  font-size: 0.78vh;
  font-weight: 850;
  line-height: 1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.starter-pack-card__includes strong {
  display: block;
  margin-top: 0.34vh;
  overflow: hidden;
  color: #ffffff;
  font-size: 0.98vh;
  font-weight: 900;
  line-height: 1.12;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.starter-pack-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1vh;
}

.starter-pack-card__footer span {
  display: grid;
  gap: 0.28vh;
}

.starter-pack-card__footer small {
  color: rgb(255 255 255 / 38%);
  font-size: 0.78vh;
  font-weight: 800;
}

.starter-pack-card__footer b {
  color: #ffffff;
  font-size: 1.35vh;
  font-weight: 950;
  line-height: 1;
}

.starter-pack-card__footer button,
.starter-pack-modal__actions button {
  min-height: 3.25vh;
  border-radius: 0.58vh;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 0.86vh;
  font-weight: 950;
}

.starter-pack-card__footer button {
  padding: 0 1.05vh;
  border: 1px solid var(--pack-accent-border);
  background: var(--pack-accent-soft);
}

.starter-pack-modal {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 72%);
}

.starter-pack-modal--popular {
  --pack-accent: #d454f4;
  --pack-accent-border: #d454f459;
  --pack-accent-soft: #d454f426;
}

.starter-pack-modal--rare {
  --pack-accent: #f4c454;
  --pack-accent-border: #f4c45459;
  --pack-accent-soft: #f4c45426;
}

.starter-pack-modal--value {
  --pack-accent: rgb(83 169 232);
  --pack-accent-border: rgb(83 169 232 / 42%);
  --pack-accent-soft: rgb(83 169 232 / 15%);
}

.starter-pack-modal__panel {
  width: 76vh;
  max-height: 82vh;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  border: 1px solid var(--pack-accent-border);
  border-radius: 1vh;
  background:
    linear-gradient(180deg, var(--pack-accent-soft), transparent 34%),
    rgb(7 7 8 / 98%);
  box-shadow: 0 2vh 5vh rgb(0 0 0 / 58%);
  overflow: hidden;
}

.starter-pack-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2vh;
  padding: 1.75vh 1.9vh 1.2vh;
  border-bottom: 1px solid var(--pack-accent-border);
}

.starter-pack-modal__header h2,
.starter-pack-modal__header p {
  margin: 0;
}

.starter-pack-modal__header h2 {
  margin-top: 0.45vh;
  color: #ffffff;
  font-size: 2vh;
  font-weight: 950;
  line-height: 1;
}

.starter-pack-modal__header p {
  margin-top: 0.68vh;
  color: rgb(255 255 255 / 48%);
  font-size: 0.98vh;
  font-weight: 700;
  line-height: 1.32;
}

.starter-pack-modal__header > button {
  width: 3.2vh;
  height: 3.2vh;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid var(--pack-accent-border);
  border-radius: 0.58vh;
  background: var(--pack-accent-soft);
  color: #ffffff;
  cursor: pointer;
}

.starter-pack-modal__hero {
  display: grid;
  grid-template-columns: 20vh minmax(0, 1fr);
  align-items: center;
  gap: 1.4vh;
  margin: 1.35vh 1.9vh 0;
  padding: 1vh 1.2vh;
  border: 1px solid var(--pack-accent-border);
  border-radius: 0.78vh;
  background:
    linear-gradient(90deg, var(--pack-accent-soft), transparent 68%),
    rgb(255 255 255 / 3%);
}

.starter-pack-modal__hero img {
  width: 100%;
  max-height: 12vh;
  object-fit: contain;
}

.starter-pack-modal__hero strong {
  display: block;
  margin-top: 0.5vh;
  color: #ffffff;
  font-size: 2.2vh;
  font-weight: 950;
  line-height: 1;
}

.starter-pack-modal__items {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9vh;
  margin-top: 1vh;
  padding: 0 1.9vh 1.2vh;
  overflow-y: auto;
}

.starter-pack-item {
  min-height: 11vh;
  display: grid;
  grid-template-columns: 9vh minmax(0, 1fr);
  align-items: center;
  gap: 1vh;
  padding: 0.85vh;
  border: 1px solid var(--pack-accent-border);
  border-radius: 0.72vh;
  background:
    linear-gradient(180deg, var(--pack-accent-soft), transparent 64%),
    rgb(255 255 255 / 4%);
}

.starter-pack-item__visual {
  height: 8.8vh;
  display: grid;
  place-items: center;
  border-radius: 0.58vh;
  border: 1px solid var(--pack-accent-border);
  background: rgb(0 0 0 / 28%);
}

.starter-pack-item__visual img {
  width: 82%;
  max-height: 7.6vh;
  object-fit: contain;
}

.starter-pack-item strong,
.starter-pack-item p {
  margin: 0;
}

.starter-pack-item strong {
  display: block;
  margin-top: 0.45vh;
  color: #ffffff;
  font-size: 1.18vh;
  font-weight: 950;
  line-height: 1.1;
}

.starter-pack-item p {
  margin-top: 0.48vh;
  color: rgb(255 255 255 / 44%);
  font-size: 0.82vh;
  font-weight: 700;
  line-height: 1.24;
}

.starter-pack-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.8vh;
  padding: 1.15vh 1.9vh 1.45vh;
  border-top: 1px solid var(--pack-accent-border);
}

.starter-pack-modal__actions button {
  min-width: 13vh;
  padding: 0 1.2vh;
}

.starter-pack-modal__actions button:first-child {
  border: 1px solid var(--pack-accent-border);
  background: var(--pack-accent-soft);
}

.starter-pack-modal__actions button:last-child {
  border: 1px solid var(--pack-accent-border);
  background: var(--pack-accent);
}

.starter-pack-modal-enter-active,
.starter-pack-modal-leave-active {
  transition: opacity 150ms ease;
}

.starter-pack-modal-enter-active .starter-pack-modal__panel,
.starter-pack-modal-leave-active .starter-pack-modal__panel {
  transition: transform 150ms ease;
}

.starter-pack-modal-enter-from,
.starter-pack-modal-leave-to {
  opacity: 0;
}

.starter-pack-modal-enter-from .starter-pack-modal__panel,
.starter-pack-modal-leave-to .starter-pack-modal__panel {
  transform: translateY(0.8vh);
}

.shop-starter-pack :is(p, small, [class*="__meta"], [class*="__description"], [class*="__caption"]) {
  line-height: 1.35;
}
</style>
