<template>
  <section class="character-overview">
    <h1 class="f2-menu__title">Основное</h1>

    <div class="character-overview__grid">
      <article
        v-for="card in renderedCards"
        :key="card.title"
        class="overview-card"
        :class="`overview-card--${card.icon}`"
      >
        <div>
          <h2>{{ card.title }}</h2>
          <strong>{{ card.value }}</strong>
          <p v-if="card.caption">{{ card.caption }}</p>
          <div v-if="card.money" class="overview-card__money">
            <span v-for="item in card.money" :key="item.label">
              <i :class="`overview-card__money-icon--${item.icon}`"></i>
              {{ item.label }}
            </span>
          </div>
        </div>

        <span class="overview-card__icon" aria-hidden="true"></span>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { InterfacePayloadMap } from '@/shared/contracts/ui'

const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()

type OverviewIcon =
  | 'money'
  | 'age'
  | 'home'
  | 'job'
  | 'marriage'
  | 'organization'
  | 'family'
  | 'subscription'
  | 'salary'

type MoneyLine = {
  icon: 'cash' | 'card'
  label: string
}

type OverviewCard = {
  caption?: string
  icon: OverviewIcon
  money?: MoneyLine[]
  title: string
  value: string
}

const overviewCards: OverviewCard[] = [
  {
    title: 'Денежные средства',
    value: '$204 074,55',
    icon: 'money',
    money: [
      { icon: 'cash', label: '$76 546,55' },
      { icon: 'card', label: '$127 528' },
    ],
  },
  {
    title: 'Возраст',
    value: '25 лет',
    caption: 'Национальность: USA',
    icon: 'age',
  },
  {
    title: 'Место жительства',
    value: 'Нет прописки',
    caption: 'Дом: Нет    Квартира: Нет',
    icon: 'home',
  },
  {
    title: 'Работа',
    value: 'Безработный',
    icon: 'job',
  },
  {
    title: 'Семейное положение',
    value: 'Не в браке',
    icon: 'marriage',
  },
  {
    title: 'Организация',
    value: 'Нет',
    caption: 'Должность: Нет',
    icon: 'organization',
  },
  {
    title: 'Семья',
    value: 'Нет',
    icon: 'family',
  },
  {
    title: 'Статус подписки',
    value: 'Отсутствует',
    icon: 'subscription',
  },
  {
    title: 'Время до зарплаты',
    value: '9 минут',
    caption: 'Предыдущая: $2 000',
    icon: 'salary',
  },
]

const renderedCards = computed(() => {
  const cards = (props.payload as any)?.overview?.cards

  return Array.isArray(cards) && cards.length ? cards : overviewCards
})
</script>

<style scoped>
.character-overview {
  min-height: 100%;
  padding-right: 1.8vh;
}

.character-overview__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1vh;
  margin-top: 4.2vh;
}

.overview-card {
  position: relative;
  min-height: 13.2vh;
  display: grid;
  align-content: start;
  padding: 1.7vh 1.85vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.65vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 34%),
    rgb(8 8 9 / 74%);
  box-sizing: border-box;
  overflow: hidden;
}

.overview-card h2,
.overview-card strong,
.overview-card p,
.overview-card__money {
  position: relative;
  z-index: 2;
}

.overview-card h2 {
  margin: 0;
  color: rgb(255 255 255 / 62%);
  font-size: 1.08vh;
  font-weight: 600;
}

.overview-card strong {
  display: block;
  margin-top: 1.75vh;
  color: #ffffff;
  font-size: 1.58vh;
  font-weight: 600;
  line-height: 1;
}

.overview-card p {
  margin: 1.65vh 0 0;
  color: rgb(255 255 255 / 44%);
  font-size: 1vh;
  font-weight: 600;
}

.overview-card__money {
  display: flex;
  flex-wrap: wrap;
  gap: 1vh;
  margin-top: 1.65vh;
  color: rgb(255 255 255 / 76%);
  font-size: 1vh;
  font-weight: 600;
}

.overview-card__money span {
  display: inline-flex;
  align-items: center;
  gap: 0.35vh;
}

.overview-card__money i {
  width: 1.05vh;
  height: 1.05vh;
  display: inline-block;
  opacity: 0.78;
  background: currentColor;
}

.overview-card__money-icon--cash {
  border-radius: 0.2vh;
  transform: rotate(-12deg);
}

.overview-card__money-icon--card {
  border-radius: 0.12vh;
  box-shadow: inset 0 -0.32vh 0 rgb(8 8 9 / 70%);
}

.overview-card__icon {
  position: absolute;
  right: 1.55vh;
  top: 50%;
  width: 4.9vh;
  height: 4.9vh;
  color: #ffffff;
  opacity: 0.08;
  transform: translateY(-50%);
}

.overview-card__icon::before,
.overview-card__icon::after {
  position: absolute;
  content: "";
}

.overview-card--money .overview-card__icon::before,
.overview-card--salary .overview-card__icon::before {
  inset: 0.8vh 0.45vh;
  border-radius: 50%;
  background: currentColor;
}

.overview-card--money .overview-card__icon::after {
  left: 1.85vh;
  top: 1.25vh;
  color: rgb(8 8 9);
  content: "$";
  font-size: 2.1vh;
  font-weight: 600;
}

.overview-card--age .overview-card__icon::before {
  left: 0.75vh;
  top: 0.55vh;
  width: 1.55vh;
  height: 1.55vh;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 1.85vh 0.55vh 0 -0.18vh currentColor;
}

.overview-card--age .overview-card__icon::after {
  inset: 2.35vh 0.7vh 0.7vh;
  background: currentColor;
  clip-path: polygon(0 100%, 18% 0, 45% 0, 58% 100%, 74% 22%, 100% 100%);
}

.overview-card--home .overview-card__icon::before {
  inset: 1.9vh 0.8vh 0.7vh;
  border-radius: 0.25vh;
  background: currentColor;
}

.overview-card--home .overview-card__icon::after {
  inset: 0.75vh 0.45vh auto;
  height: 2.6vh;
  background: currentColor;
  clip-path: polygon(50% 0, 100% 48%, 82% 48%, 82% 100%, 18% 100%, 18% 48%, 0 48%);
}

.overview-card--job .overview-card__icon::before {
  inset: 1.45vh 0.45vh 0.8vh;
  border-radius: 0.35vh;
  background: currentColor;
}

.overview-card--job .overview-card__icon::after {
  left: 1.65vh;
  top: 0.75vh;
  width: 1.7vh;
  height: 1.1vh;
  border: 0.35vh solid currentColor;
  border-bottom: 0;
  border-radius: 0.35vh 0.35vh 0 0;
}

.overview-card--marriage .overview-card__icon::before,
.overview-card--family .overview-card__icon::before {
  left: 0.55vh;
  top: 0.65vh;
  width: 1.45vh;
  height: 1.45vh;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 2.3vh 0 0 currentColor;
}

.overview-card--marriage .overview-card__icon::after,
.overview-card--family .overview-card__icon::after {
  left: 0.15vh;
  right: 0.15vh;
  bottom: 0.65vh;
  height: 2.35vh;
  background: currentColor;
  clip-path: polygon(0 100%, 16% 0, 38% 0, 48% 100%, 52% 100%, 62% 0, 84% 0, 100% 100%);
}

.overview-card--organization .overview-card__icon::before {
  inset: 0.65vh 1vh;
  border-radius: 0.3vh;
  background: currentColor;
}

.overview-card--organization .overview-card__icon::after {
  left: 1.45vh;
  top: 1.1vh;
  width: 0.55vh;
  height: 0.55vh;
  background: rgb(8 8 9);
  box-shadow:
    1vh 0 0 rgb(8 8 9),
    0 1vh 0 rgb(8 8 9),
    1vh 1vh 0 rgb(8 8 9),
    0 2vh 0 rgb(8 8 9),
    1vh 2vh 0 rgb(8 8 9);
}

.overview-card--subscription .overview-card__icon::before {
  inset: 0.7vh 0.3vh;
  background: currentColor;
  clip-path: polygon(0 0, 28% 30%, 50% 0, 72% 30%, 100% 0, 84% 100%, 16% 100%);
}

.overview-card--salary .overview-card__icon::before {
  border-radius: 0.4vh;
  transform: rotate(-35deg);
}
</style>
