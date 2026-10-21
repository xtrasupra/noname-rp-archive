<script setup lang="ts">
import { ArrowLeft, Check, CircleSlash, Gift, House, MapPin, Settings, UserRound, Users, X } from 'lucide-vue-next'
import { computed } from 'vue'

import type { TabletHouse } from '@/shared/contracts/ui'
import type { HouseTab } from './useTabletProperty'

const props = defineProps<{
  activeHouseTab: HouseTab
  houses: TabletHouse[]
  selectedHouse: TabletHouse | null
  title: string
}>()

const emit = defineEmits<{
  back: []
  close: []
  evictResident: [residentId: string | number]
  route: []
  select: [house: TabletHouse]
  setTab: [tab: HouseTab]
  toggleLock: []
}>()

function backFromHouseDetails() {
  emit('back')
}

function closeTabletApp() {
  emit('close')
}

function selectHouse(house: TabletHouse) {
  emit('select', house)
}

function toggleHouseLock() {
  emit('toggleLock')
}

function routeToHouse() {
  emit('route')
}

function setHouseTab(tab: HouseTab) {
  emit('setTab', tab)
}

function evictHouseResident(residentId: string | number) {
  emit('evictResident', residentId)
}

const tabletHouses = computed(() => props.houses)
const houseTitle = computed(() => props.title)
</script>

<template>
<section class="house-app" aria-label="Мой дом">
  <header class="house-app__header">
    <div class="house-app__title">
      <button
        v-if="selectedHouse"
        class="house-app__back"
        type="button"
        aria-label="Назад"
        @click="backFromHouseDetails"
      >
        <ArrowLeft aria-hidden="true" />
      </button>
      <div>
        <h1>{{ houseTitle }}</h1>
        <p>{{ selectedHouse ? selectedHouse.address : 'Выберите имущество' }}</p>
      </div>
    </div>

    <button class="house-app__close" type="button" aria-label="Закрыть" @click="closeTabletApp">
      <X aria-hidden="true" />
    </button>
  </header>

  <div v-if="!selectedHouse" class="house-app__content house-app__content--list">
    <section v-if="tabletHouses.length === 0" class="house-empty" aria-label="Нет дома">
      <span aria-hidden="true">
        <House />
      </span>
      <strong>У вас нет дома</strong>
      <p>Когда у персонажа появится имущество, оно отобразится в этом приложении.</p>
    </section>

    <div v-else class="house-cards" aria-label="Список домов">
      <button
        v-for="house in tabletHouses"
        :key="house.id"
        class="house-card"
        type="button"
        @click="selectHouse(house)"
      >
        <header :style="house.image ? { '--house-image': `url(${house.image})` } : undefined">
          <strong>{{ house.title }}</strong>
          <span aria-hidden="true">
            <MapPin />
          </span>
        </header>

        <dl>
          <div v-for="feature in house.features" :key="feature.label">
            <dt>{{ feature.label }}</dt>
            <dd>{{ feature.value }}</dd>
          </div>
        </dl>
      </button>
    </div>
  </div>

  <div v-else class="house-app__content house-details">
    <aside class="house-details__summary">
      <div
        class="house-details__preview"
        :style="selectedHouse.image ? { '--house-image': `url(${selectedHouse.image})` } : undefined"
      >
        <strong>#{{ selectedHouse.number }}</strong>
      </div>

      <div class="house-details__facts">
        <article>
          <span>Оплачено до</span>
          <strong>{{ selectedHouse.paidUntil }}</strong>
        </article>
        <article>
          <span>Адрес</span>
          <strong>{{ selectedHouse.address }}</strong>
        </article>
        <article>
          <span>Подселение</span>
          <strong>{{ selectedHouse.residents.length }} / {{ selectedHouse.residentLimit }}</strong>
        </article>
      </div>

      <div class="house-details__actions">
        <button type="button" @click="toggleHouseLock">
          <component :is="selectedHouse.locked ? Check : CircleSlash" aria-hidden="true" />
          <span>{{ selectedHouse.locked ? 'Открыть' : 'Закрыть' }}</span>
        </button>
        <button type="button" @click="routeToHouse">
          <MapPin aria-hidden="true" />
          <span>Проложить маршрут</span>
        </button>
      </div>
    </aside>

    <section class="house-details__main">
      <div class="house-tabs" role="tablist" aria-label="Разделы дома">
        <button
          class="house-tabs__tab"
          :class="{ 'house-tabs__tab--active': activeHouseTab === 'residents' }"
          type="button"
          role="tab"
          :aria-selected="activeHouseTab === 'residents'"
          @click="setHouseTab('residents')"
        >
          <Users aria-hidden="true" />
          <span>Жильцы</span>
        </button>
        <button
          class="house-tabs__tab"
          :class="{ 'house-tabs__tab--active': activeHouseTab === 'upgrades' }"
          type="button"
          role="tab"
          :aria-selected="activeHouseTab === 'upgrades'"
          @click="setHouseTab('upgrades')"
        >
          <Settings aria-hidden="true" />
          <span>Улучшения</span>
        </button>
      </div>

      <div v-if="activeHouseTab === 'residents'" class="house-residents">
        <header>
          <strong>Подселённые игроки</strong>
          <span>{{ selectedHouse.residents.length }} / {{ selectedHouse.residentLimit }}</span>
        </header>
        <div v-if="selectedHouse.residents.length" class="house-residents__list">
          <article v-for="resident in selectedHouse.residents" :key="resident.id">
            <UserRound aria-hidden="true" />
            <strong>{{ resident.name }}</strong>
            <span>{{ resident.static }}</span>
            <button type="button" @click="evictHouseResident(resident.id)">Выселить</button>
          </article>
        </div>
        <p v-else>Подселённых игроков пока нет.</p>
      </div>

      <div v-else class="house-upgrades-placeholder">
        <Gift aria-hidden="true" />
        <strong>Улучшения дома</strong>
        <p>Этот раздел будет доступен в будущей обнове.</p>
      </div>
    </section>
  </div>
</section>
</template>

<style lang="scss" scoped>
.house-app {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 2.2vh;
  padding: 2.15vh 2.55vh;
  background:
    radial-gradient(45vh 30vh at 84% 8%, rgb(172 46 205 / 18%), transparent 68%),
    radial-gradient(45vh 32vh at 10% 88%, rgb(172 46 205 / 10%), transparent 72%),
    linear-gradient(180deg, rgb(1 8 14 / 86%), rgb(3 6 12 / 94%));
  color: #ffffff;
  box-sizing: border-box;
}

.house-app__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2vh;
}

.house-app__title {
  display: flex;
  align-items: center;
  gap: 1.05vh;
  min-width: 0;
}

.house-app__title h1,
.house-app__title p {
  margin: 0;
}

.house-app__title h1 {
  overflow: hidden;
  color: #ffffff;
  font-size: clamp(20px, 2vh, 26px);
  font-weight: 800;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.house-app__title p {
  margin-top: 0.45vh;
  color: rgb(255 255 255 / 58%);
  font-size: clamp(12px, 1.1vh, 14px);
  font-weight: 600;
}

.house-app__content {
  min-height: 0;
  flex: 1 1 auto;
}

.house-app__content--list {
  overflow-y: auto;
  padding-right: 0.35vh;
}

.house-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.4vh;
}

.house-card {
  min-width: 0;
  padding: 0;
  border: 0.12vh solid rgb(255 255 255 / 10%);
  border-radius: 0.72vh;
  overflow: hidden;
  background: linear-gradient(180deg, rgb(14 21 30 / 94%), rgb(6 10 17 / 96%));
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  box-shadow: 0 1.2vh 2.8vh rgb(0 0 0 / 24%);
  transition: border-color 150ms ease, transform 150ms ease, box-shadow 150ms ease;
}

.house-card:hover,
.house-card:focus-visible {
  border-color: rgb(172 46 205 / 56%);
  outline: 0;
  transform: translateY(-0.18vh);
  box-shadow: 0 1.6vh 3.2vh rgb(0 0 0 / 38%), 0 0 0 0.1vh rgb(172 46 205 / 12%) inset;
}

.house-card header {
  min-height: 7.2vh;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1vh;
  padding: 0.85vh;
  background:
    linear-gradient(180deg, rgb(0 0 0 / 26%), rgb(0 0 0 / 50%)),
    var(--house-image, url('/property/house.png')) center / cover no-repeat;
}

.house-card header strong {
  min-width: 0;
  overflow: hidden;
  color: #ffffff;
  font-size: clamp(12px, 1.1vh, 14px);
  font-weight: 800;
  line-height: 1.2;
  text-shadow: 0 0.2vh 0.65vh rgb(0 0 0 / 52%);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.house-card header span {
  width: 3.6vh;
  height: 3.6vh;
  display: grid;
  place-items: center;
  border-radius: 0.36vh;
  background: #280e2e;
  color: #ac2ecd;
  flex: 0 0 auto;
  box-shadow: 0 0.45vh 1.1vh rgb(0 0 0 / 20%);
}

.house-card header svg {
  width: 1.65vh;
  height: 1.65vh;
}

.house-card dl {
  display: grid;
  gap: 0.92vh;
  padding: 1.35vh 1.25vh 1.45vh;
  background: rgb(255 255 255 / 3%);
}

.house-card dl div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1vh;
  min-width: 0;
}

.house-card dt,
.house-card dd {
  margin: 0;
  font-size: clamp(10px, 0.95vh, 12px);
  font-weight: 700;
  line-height: 1.1;
}

.house-card dt {
  overflow: hidden;
  color: rgb(255 255 255 / 48%);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.house-card dd {
  color: #ffffff;
  flex: 0 0 auto;
}

.house-empty {
  height: 100%;
  min-height: 42vh;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 1.1vh;
  color: rgb(255 255 255 / 72%);
  text-align: center;
}

.house-empty > span {
  width: 7vh;
  height: 7vh;
  display: grid;
  place-items: center;
  border: 0.12vh solid rgb(255 255 255 / 10%);
  border-radius: 1vh;
  background: rgb(255 255 255 / 6%);
  color: #ac2ecd;
}

.house-empty svg {
  width: 3.2vh;
  height: 3.2vh;
}

.house-empty strong {
  color: #ffffff;
  font-size: clamp(18px, 1.8vh, 24px);
  font-weight: 800;
}

.house-empty p {
  max-width: 32vh;
  margin: 0;
  color: rgb(255 255 255 / 56%);
  font-size: clamp(12px, 1.12vh, 15px);
  font-weight: 600;
  line-height: 1.35;
}

.house-details {
  display: grid;
  grid-template-columns: minmax(24vh, 0.8fr) minmax(0, 1.2fr);
  gap: 1.4vh;
}

.house-details__summary,
.house-details__main {
  min-width: 0;
  border: 0.12vh solid rgb(255 255 255 / 8%);
  border-radius: 0.72vh;
  background: rgb(255 255 255 / 4%);
  box-shadow: inset 0 0 0 0.1vh rgb(0 0 0 / 24%);
}

.house-details__summary {
  overflow: hidden;
}

.house-details__preview {
  min-height: 18vh;
  display: flex;
  align-items: flex-end;
  padding: 1.2vh;
  background:
    linear-gradient(180deg, rgb(0 0 0 / 12%), rgb(0 0 0 / 72%)),
    var(--house-image, url('/property/house.png')) center / cover no-repeat;
}

.house-details__preview strong {
  color: #ffffff;
  font-size: clamp(24px, 2.5vh, 34px);
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 0.4vh 1.1vh rgb(0 0 0 / 54%);
}

.house-details__facts {
  display: grid;
  gap: 0.85vh;
  padding: 1.35vh;
}

.house-details__facts article {
  min-width: 0;
  display: grid;
  gap: 0.35vh;
}

.house-details__facts span,
.house-residents header span {
  color: rgb(255 255 255 / 48%);
  font-size: clamp(11px, 1.05vh, 13px);
  font-weight: 700;
}

.house-details__facts strong {
  overflow: hidden;
  color: #ffffff;
  font-size: clamp(11px, 1.22vh, 16px);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.house-details__actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.8vh;
  padding: 0 1.35vh 1.35vh;
}

.house-details__actions button,
.house-tabs__tab {
  min-width: 0;
  height: 4.7vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6vh;
  border: 0.12vh solid rgb(255 255 255 / 9%);
  border-radius: 0.46vh;
  background: rgb(255 255 255 / 6%);
  color: rgb(255 255 255 / 76%);
  cursor: pointer;
  font: inherit;
  font-size: clamp(12px, 1.1vh, 14px);
  font-weight: 800;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
}

.house-details__actions button:hover,
.house-details__actions button:focus-visible,
.house-tabs__tab:hover,
.house-tabs__tab:focus-visible,
.house-tabs__tab--active {
  border-color: rgb(172 46 205 / 48%);
  background: rgb(172 46 205 / 14%);
  color: #ffffff;
  outline: 0;
}

.house-details__actions svg {
  width: 2.05vh;
  height: 2.05vh;
  flex: 0 0 auto;
  color: #ac2ecd;
}

.house-tabs__tab svg {
  width: 1.85vh;
  height: 1.85vh;
  flex: 0 0 auto;
  color: #ac2ecd;
}
.house-details__actions span,
.house-tabs__tab span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.house-details__main {
  display: flex;
  flex-direction: column;
  gap: 1.2vh;
  padding: 1.35vh;
}

.house-tabs {
  display: flex;
  gap: 0.75vh;
  flex: 0 0 auto;
}

.house-tabs__tab {
  width: auto;
  padding: 0 1.25vh;
}

.house-residents,
.house-upgrades-placeholder {
  min-height: 0;
  flex: 1 1 auto;
}

.house-residents header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1vh;
  margin-bottom: 1vh;
}

.house-residents header strong,
.house-upgrades-placeholder strong {
  color: #ffffff;
  font-size: clamp(13px, 1.45vh, 19px);
  font-weight: 600;
}

.house-residents__list {
  display: grid;
  gap: 0.75vh;
  max-height: 45vh;
  overflow-y: auto;
  padding-right: 0.25vh;
}

.house-residents__list article {
  min-width: 0;
  min-height: 4.8vh;
  display: grid;
  grid-template-columns: 2.2vh minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 1.05vh;
  padding: 1.05vh 1.2vh;
  border: 0.12vh solid rgb(255 255 255 / 6%);
  border-radius: 0.42vh;
  background: rgb(0 0 0 / 22%);
  transition: border-color 140ms ease, background 140ms ease;
}

.house-residents__list article:hover,
.house-residents__list article:focus-within {
  border-color: rgb(172 46 205 / 30%);
  background: rgb(172 46 205 / 9%);
}

.house-residents__list article button {
  height: 2.8vh;
  padding: 0 0.95vh;
  border: 0.12vh solid rgb(255 89 116 / 30%);
  border-radius: 0.36vh;
  background: rgb(255 89 116 / 10%);
  color: #ff8aa0;
  cursor: pointer;
  font: inherit;
  font-size: clamp(11px, 1.02vh, 13px);
  font-weight: 800;
  opacity: 0;
  pointer-events: none;
  transform: translateX(0.35vh);
  transition: opacity 140ms ease, transform 140ms ease, background 140ms ease, color 140ms ease;
  white-space: nowrap;
}

.house-residents__list article:hover button,
.house-residents__list article:focus-within button {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
}

.house-residents__list article button:hover,
.house-residents__list article button:focus-visible {
  background: rgb(255 89 116 / 20%);
  color: #ffffff;
  outline: 0;
}

.house-residents__list svg {
  width: 1.85vh;
  height: 1.85vh;
  color: #ac2ecd;
}

.house-residents__list strong,
.house-residents__list span,
.house-residents > p {
  overflow: hidden;
  font-size: clamp(12px, 1.12vh, 14px);
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.house-residents__list strong {
  color: #ffffff;
}

.house-residents__list span,
.house-residents > p {
  color: rgb(255 255 255 / 54%);
}

.house-upgrades-placeholder {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.9vh;
  text-align: center;
}

.house-upgrades-placeholder svg {
  width: 4vh;
  height: 4vh;
  color: #ac2ecd;
}

.house-upgrades-placeholder p {
  max-width: 34vh;
  margin: 0;
  color: rgb(255 255 255 / 55%);
  font-size: clamp(12px, 1.12vh, 15px);
  font-weight: 650;
  line-height: 1.35;
}

.house-app__back,
.house-app__close {
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

.house-app__back:hover,
.house-app__back:focus-visible,
.house-app__close:hover,
.house-app__close:focus-visible {
  border-color: rgb(57 215 191 / 35%);
  background: rgb(57 215 191 / 12%);
  outline: none;
}

.house-app__back svg,
.house-app__close svg {
  width: px-to-vh(19);
  height: px-to-vh(19);
}
</style>
