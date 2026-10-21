<script setup lang="ts">
import { ArrowLeft, Building2, Check, CircleSlash, Clock3, MapPin, UserRound, Users, X } from 'lucide-vue-next'
import { computed } from 'vue'

import type { TabletApartment } from '@/shared/contracts/ui'

const props = defineProps<{
  apartments: TabletApartment[]
  selectedApartment: TabletApartment | null
  title: string
}>()

const emit = defineEmits<{
  back: []
  close: []
  evictResident: [residentId: string | number]
  route: []
  select: [apartment: TabletApartment]
  toggleLock: []
}>()

function backFromApartmentDetails() {
  emit('back')
}

function closeTabletApp() {
  emit('close')
}

function selectApartment(apartment: TabletApartment) {
  emit('select', apartment)
}

function toggleApartmentLock() {
  emit('toggleLock')
}

function routeToApartment() {
  emit('route')
}

function evictApartmentResident(residentId: string | number) {
  emit('evictResident', residentId)
}

const tabletApartments = computed(() => props.apartments)
const apartmentTitle = computed(() => props.title)
</script>

<template>
<section class="apartment-app" aria-label="Моя квартира">
  <header class="apartment-app__header">
    <div class="apartment-app__title">
      <button
        v-if="selectedApartment"
        class="apartment-app__back"
        type="button"
        aria-label="Назад"
        @click="backFromApartmentDetails"
      >
        <ArrowLeft aria-hidden="true" />
      </button>
      <div>
        <h1>{{ apartmentTitle }}</h1>
        <p>{{ selectedApartment ? selectedApartment.address : 'Выберите апартаменты персонажа' }}</p>
      </div>
    </div>

    <button class="apartment-app__close" type="button" aria-label="Закрыть" @click="closeTabletApp">
      <X aria-hidden="true" />
    </button>
  </header>

  <div v-if="!selectedApartment" class="apartment-app__content apartment-app__content--list">
    <section v-if="tabletApartments.length === 0" class="apartment-empty" aria-label="Нет квартиры">
      <span aria-hidden="true">
        <Building2 />
      </span>
      <strong>У вас нет квартиры</strong>
      <p>Когда персонаж купит квартиру, она появится в этом приложении планшета.</p>
    </section>

    <div v-else class="apartment-cards" aria-label="Список квартир">
      <button
        v-for="apartment in tabletApartments"
        :key="apartment.id"
        class="apartment-card"
        type="button"
        @click="selectApartment(apartment)"
      >
        <div class="apartment-card__media" :style="apartment.image ? { '--apartment-image': `url(${apartment.image})` } : undefined">
          <span>
            <Building2 aria-hidden="true" />
            {{ apartment.title }}
          </span>
          <strong>#{{ apartment.number }}</strong>
        </div>
        <div class="apartment-card__body">
          <p>
            <MapPin aria-hidden="true" />
            {{ apartment.address }}
          </p>
          <dl>
            <div v-for="feature in apartment.features.slice(0, 3)" :key="feature.label">
              <dt>{{ feature.label }}</dt>
              <dd>{{ feature.value }}</dd>
            </div>
          </dl>
        </div>
      </button>
    </div>
  </div>

  <div v-else class="apartment-app__content apartment-details">
    <section class="apartment-details__hero">
      <div class="apartment-details__media" :style="selectedApartment.image ? { '--apartment-image': `url(${selectedApartment.image})` } : undefined">
        <span>Апартаменты</span>
        <strong>#{{ selectedApartment.number }}</strong>
      </div>

      <div class="apartment-details__summary">
        <article>
          <Clock3 aria-hidden="true" />
          <span>Оплачено до</span>
          <strong>{{ selectedApartment.paidUntil }}</strong>
        </article>
        <article>
          <Users aria-hidden="true" />
          <span>Жильцы</span>
          <strong>{{ selectedApartment.residents.length }} / {{ selectedApartment.residentLimit }}</strong>
        </article>
        <article>
          <MapPin aria-hidden="true" />
          <span>Адрес</span>
          <strong>{{ selectedApartment.address }}</strong>
        </article>
      </div>

      <div class="apartment-details__actions">
        <button type="button" @click="toggleApartmentLock">
          <component :is="selectedApartment.locked ? Check : CircleSlash" aria-hidden="true" />
          <span>{{ selectedApartment.locked ? 'Открыть квартиру' : 'Закрыть квартиру' }}</span>
        </button>
        <button type="button" @click="routeToApartment">
          <MapPin aria-hidden="true" />
          <span>Проложить маршрут</span>
        </button>
      </div>
    </section>

    <section class="apartment-details__main">
      <header>
        <div>
          <span>Доступ</span>
          <strong>Подселённые игроки</strong>
        </div>
        <b>{{ selectedApartment.residents.length }} / {{ selectedApartment.residentLimit }}</b>
      </header>

      <div class="apartment-features">
        <article v-for="feature in selectedApartment.features" :key="feature.label">
          <span>{{ feature.label }}</span>
          <strong>{{ feature.value }}</strong>
        </article>
      </div>

      <div v-if="selectedApartment.residents.length" class="apartment-residents">
        <article v-for="resident in selectedApartment.residents" :key="resident.id">
          <span aria-hidden="true">
            <UserRound />
          </span>
          <div>
            <strong>{{ resident.name }}</strong>
            <small>Static {{ resident.static }}</small>
          </div>
          <button type="button" @click="evictApartmentResident(resident.id)">Выселить</button>
        </article>
      </div>
      <p v-else class="apartment-residents__empty">Подселённых игроков пока нет.</p>
    </section>
  </div>
</section>
</template>

<style lang="scss" scoped>
.apartment-app {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: px-to-vh(18);
  padding: px-to-vh(24) px-to-vh(28);
background: linear-gradient(90deg, rgb(58 58 58 / 5%) 0 0.0925925926vh, #00000000 0.0925925926vh 5vh), linear-gradient(180deg, rgb(7 7 7 / 4%) 0 0.0925925926vh, #00000000 0.0925925926vh 5vh), linear-gradient(110deg, #000000 0%, #000000 52%, #000000 100%);
  background-size:
    px-to-vh(54) px-to-vh(54),
    px-to-vh(54) px-to-vh(54),
    auto;
  color: #ffffff;
  box-sizing: border-box;
}

.apartment-app__header,
.apartment-app__title,
.apartment-details__summary article,
.apartment-details__actions button,
.apartment-card__body p,
.apartment-residents article,
.apartment-residents article > span {
  display: flex;
  align-items: center;
}

.apartment-app__header {
  justify-content: space-between;
  gap: px-to-vh(18);
}

.apartment-app__title {
  min-width: 0;
  gap: px-to-vh(12);
}

.apartment-app__title h1,
.apartment-app__title p,
.apartment-card__body p,
.apartment-card dl,
.apartment-details__main header span,
.apartment-details__main header strong,
.apartment-residents__empty {
  margin: 0;
}

.apartment-app__title h1 {
  overflow: hidden;
  font-size: px-to-vh(27);
  font-weight: 900;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apartment-app__title p {
  margin-top: px-to-vh(5);
  color: rgb(255 255 255 / 56%);
  font-size: px-to-vh(13);
  font-weight: 650;
}

.apartment-app__back,
.apartment-app__close {
  width: px-to-vh(38);
  height: px-to-vh(38);
  display: grid;
  place-items: center;
  padding: 0;
  border: px-to-vh(1) solid rgb(255 255 255 / 11%);
  border-radius: px-to-vh(8);
  background: rgb(255 255 255 / 7%);
  color: #ffffff;
  cursor: pointer;
}

.apartment-app__back:hover,
.apartment-app__back:focus-visible,
.apartment-app__close:hover,
.apartment-app__close:focus-visible {
  border-color: rgb(172 46 205 / 32%);
  background: rgb(172 46 205 / 8%);
  outline: none;
}

.apartment-app__back svg,
.apartment-app__close svg {
  width: px-to-vh(19);
  height: px-to-vh(19);
}

.apartment-app__content {
  min-height: 0;
  flex: 1 1 auto;
}

.apartment-app__content--list {
  overflow-y: auto;
  padding-right: px-to-vh(4);
}

.apartment-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: px-to-vh(16);
}

.apartment-card {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, px-to-vh(230)) minmax(0, 1fr);
  padding: 0;
  border: px-to-vh(1) solid rgb(255 255 255 / 10%);
  border-radius: px-to-vh(8);
  overflow: hidden;
  background: rgb(255 255 255 / 6%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color 150ms ease, transform 150ms ease, background 150ms ease;
}

.apartment-card:hover,
.apartment-card:focus-visible {
  border-color: rgb(172 46 205 / 32%);
  background: rgb(172 46 205 / 8%);
  outline: none;
  transform: translateY(px-to-vh(-1));
}

.apartment-card__media {
  position: relative;
  min-height: px-to-vh(165);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: px-to-vh(13);
  background:
    linear-gradient(180deg, rgb(0 0 0 / 18%), rgb(0 0 0 / 72%)),
    var(--apartment-image, url('/property/house.png')) center / cover no-repeat;
}

.apartment-card__media span,
.apartment-details__media span {
  display: inline-flex;
  align-items: center;
  gap: px-to-vh(6);
  width: fit-content;
  max-width: 100%;
  padding: px-to-vh(7) px-to-vh(9);
  border-radius: px-to-vh(6);
  background: rgb(3 8 14 / 74%);
  color: rgb(255 255 255 / 84%);
  font-size: px-to-vh(12);
  font-weight: 850;
}

.apartment-card__media span svg {
  width: px-to-vh(14);
  height: px-to-vh(14);
  color: #35d6c9;
}

.apartment-card__media strong,
.apartment-details__media strong {
  color: #ffffff;
  font-size: px-to-vh(38);
  font-weight: 950;
  line-height: 0.95;
  text-shadow: 0 px-to-vh(4) px-to-vh(16) rgb(0 0 0 / 48%);
}

.apartment-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: px-to-vh(14);
  padding: px-to-vh(15);
}

.apartment-card__body p {
  min-width: 0;
  gap: px-to-vh(7);
  color: rgb(255 255 255 / 66%);
  font-size: px-to-vh(13);
  font-weight: 700;
}

.apartment-card__body p svg {
  width: px-to-vh(15);
  height: px-to-vh(15);
  color: #35d6c9;
  flex: 0 0 auto;
}

.apartment-card dl,
.apartment-features {
  display: grid;
  gap: px-to-vh(8);
}

.apartment-card dl div,
.apartment-features article {
  min-width: 0;
  display: grid;
  gap: px-to-vh(4);
  padding: px-to-vh(9) px-to-vh(10);
  border: px-to-vh(1) solid rgb(255 255 255 / 8%);
  border-radius: px-to-vh(7);
  background: #80008008;
}

.apartment-card dt,
.apartment-card dd,
.apartment-features span,
.apartment-features strong {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apartment-card dt,
.apartment-features span,
.apartment-details__summary span,
.apartment-details__main header span,
.apartment-residents small {
  color: rgb(255 255 255 / 48%);
  font-size: px-to-vh(11);
  font-weight: 750;
}

.apartment-card dd,
.apartment-features strong {
  color: #ffffff;
  font-size: px-to-vh(13);
  font-weight: 850;
}

.apartment-empty {
  min-height: px-to-vh(420);
  display: grid;
  place-items: center;
  align-content: center;
  gap: px-to-vh(10);
  color: rgb(255 255 255 / 62%);
  text-align: center;
}

.apartment-empty > span {
  width: px-to-vh(74);
  height: px-to-vh(74);
  display: grid;
  place-items: center;
  border: px-to-vh(1) solid rgb(255 255 255 / 12%);
  border-radius: px-to-vh(10);
  background: rgb(53 214 201 / 10%);
  color: #35d6c9;
}

.apartment-empty svg {
  width: px-to-vh(34);
  height: px-to-vh(34);
}

.apartment-empty strong {
  color: #ffffff;
  font-size: px-to-vh(20);
  font-weight: 900;
}

.apartment-empty p {
  max-width: px-to-vh(360);
  margin: 0;
  font-size: px-to-vh(13);
  font-weight: 650;
  line-height: 1.4;
}

.apartment-details {
  display: grid;
  grid-template-columns: minmax(0, px-to-vh(365)) minmax(0, 1fr);
  gap: px-to-vh(18);
}

.apartment-details__hero,
.apartment-details__main {
  min-width: 0;
  min-height: 0;
  border: px-to-vh(1) solid rgb(255 255 255 / 10%);
  border-radius: px-to-vh(10);
  background: rgb(255 255 255 / 6%);
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 3%);
}

.apartment-details__hero {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.apartment-details__media {
  min-height: px-to-vh(230);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: px-to-vh(16);
  background:
    linear-gradient(180deg, rgb(0 0 0 / 10%), rgb(0 0 0 / 76%)),
    var(--apartment-image, url('/property/house.png')) center / cover no-repeat;
}

.apartment-details__summary {
  display: grid;
  gap: px-to-vh(8);
  padding: px-to-vh(14);
}

.apartment-details__summary article {
  min-width: 0;
  gap: px-to-vh(10);
  padding: px-to-vh(10);
  border-radius: px-to-vh(8);
  background: rgb(0 0 0 / 18%);
}

.apartment-details__summary svg {
  width: px-to-vh(18);
  height: px-to-vh(18);
  color: white;
  flex: 0 0 auto;
}

.apartment-details__summary span,
.apartment-details__summary strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apartment-details__summary span {
  flex: 0 0 px-to-vh(82);
}

.apartment-details__summary strong {
  min-width: 0;
  color: #ffffff;
  font-size: px-to-vh(13);
  font-weight: 850;
}

.apartment-details__actions {
  display: grid;
  gap: px-to-vh(8);
  padding: 0 px-to-vh(14) px-to-vh(14);
}

.apartment-details__actions button {
  justify-content: center;
  gap: px-to-vh(8);
  min-height: px-to-vh(44);
  border: px-to-vh(1) solid rgb(255 255 255 / 10%);
  border-radius: px-to-vh(8);
  background: rgb(255 255 255 / 7%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: px-to-vh(13);
  font-weight: 850;
}

.apartment-details__actions button:hover,
.apartment-details__actions button:focus-visible {
  border-color: rgb(172 46 205 / 32%);
  background: rgb(172 46 205 / 8%);
  outline: none;
}

.apartment-details__actions svg {
  width: px-to-vh(18);
  height: px-to-vh(18);
  color: rgba(172, 46, 205, 1);
}

.apartment-details__main {
  display: flex;
  flex-direction: column;
  gap: px-to-vh(14);
  padding: px-to-vh(18);
  overflow: hidden;
}

.apartment-details__main header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: px-to-vh(12);
}

.apartment-details__main header strong {
  display: block;
  margin-top: px-to-vh(4);
  color: #ffffff;
  font-size: px-to-vh(21);
  font-weight: 900;
  line-height: 1.1;
}

.apartment-details__main header b {
  padding: px-to-vh(7) px-to-vh(10);
  border-radius: px-to-vh(999);
  border: 1px solid rgba(172, 46, 205, 0.15);
  background: rgba(172, 46, 205, 0.08);
  color: rgba(172, 46, 205, 1);
  font-size: px-to-vh(13);
  font-weight: 900;
  white-space: nowrap;
}

.apartment-features {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.apartment-residents {
  min-height: 0;
  display: grid;
  align-content: start;
  gap: px-to-vh(9);
  overflow-y: auto;
  padding-right: px-to-vh(3);
}

.apartment-residents article {
  min-width: 0;
  gap: px-to-vh(12);
  min-height: px-to-vh(60);
  padding: px-to-vh(10) px-to-vh(12);
  border: px-to-vh(1) solid rgb(255 255 255 / 8%);
  border-radius: px-to-vh(8);
  background: rgb(0 0 0 / 18%);
}

.apartment-residents article:hover,
.apartment-residents article:focus-within {
  border-color: rgb(172 46 205 / 32%);
  background: rgb(172 46 205 / 8%);
}

.apartment-residents article > span {
  justify-content: center;
  width: px-to-vh(40);
  height: px-to-vh(40);
  border-radius: px-to-vh(8);
  background: rgb(172 46 205 / 12%);
  color: #ac2ecd;
  flex: 0 0 auto;
}

.apartment-residents svg {
  width: px-to-vh(20);
  height: px-to-vh(20);
}

.apartment-residents div {
  min-width: 0;
  flex: 1 1 auto;
}

.apartment-residents strong,
.apartment-residents small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apartment-residents strong {
  color: #ffffff;
  font-size: px-to-vh(14);
  font-weight: 850;
}

.apartment-residents small {
  margin-top: px-to-vh(4);
}

.apartment-residents button {
  min-height: px-to-vh(34);
  padding: 0 px-to-vh(12);
  border: px-to-vh(1) solid rgb(255 89 116 / 34%);
  border-radius: px-to-vh(7);
  background: rgb(255 89 116 / 10%);
  color: #ff8aa0;
  cursor: pointer;
  font: inherit;
  font-size: px-to-vh(12);
  font-weight: 850;
}

.apartment-residents button:hover,
.apartment-residents button:focus-visible {
  background: rgb(255 89 116 / 18%);
  color: #ffffff;
  outline: none;
}

.apartment-residents__empty {
  display: grid;
  place-items: center;
  min-height: px-to-vh(190);
  border: px-to-vh(1) dashed rgb(255 255 255 / 12%);
  border-radius: px-to-vh(8);
  color: rgb(255 255 255 / 52%);
  font-size: px-to-vh(13);
  font-weight: 700;
}
</style>
