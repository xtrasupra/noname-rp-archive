<template>
  <section class="character-statistics">
    <h1 class="f2-menu__title">Статистика</h1>

    <div class="character-statistics__grid">
      <article
        v-for="card in statisticCards"
        :key="card.title"
        class="stat-card"
        :class="`stat-card--${card.icon}`"
      >
        <div>
          <h2>{{ card.title }}</h2>
          <strong>{{ card.value }}</strong>
          <p>{{ card.caption }}</p>
        </div>

        <div v-if="card.tabs" class="stat-card__select" :aria-label="`${card.title}: переключатель`">
          <ShopCaseSelect
            v-model="activeStatisticTabs[card.title]"
            :label="card.tabsLabel ?? 'Период'"
            :options="getSelectOptions(card.tabs)"
          />
        </div>

        <button v-if="card.action" class="stat-card__action" type="button" @click="handleCardAction(card)">
          {{ card.action }}
        </button>
        <span class="stat-card__icon" aria-hidden="true">
          <BaseIcon :icon="card.iconComponent" :size="46" :stroke-width="1.8" />
        </span>
      </article>
    </div>

    <Teleport to="body">
      <Transition name="block-history-modal">
        <div
          v-if="isBlockHistoryOpen"
          class="block-history-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-history-title"
          @click.self="closeBlockHistory"
        >
          <section class="block-history-modal__panel">
            <header class="block-history-modal__header">
              <div>
                <span>История персонажа</span>
                <h2 id="block-history-title">Блокировки</h2>
              </div>

              <button class="block-history-modal__close" type="button" aria-label="Закрыть" @click="closeBlockHistory">
                <BaseIcon :icon="X" size="sm" :stroke-width="2.4" />
              </button>
            </header>

            <div v-if="blockHistory.length" class="block-history-modal__list">
              <article
                v-for="entry in blockHistory"
                :key="entry.id"
                class="block-history-entry"
                :class="{ 'block-history-entry--active': entry.status === 'active' }"
              >
                <header class="block-history-entry__header">
                  <div>
                    <strong>{{ entry.title }}</strong>
                    <span>{{ entry.date }}</span>
                  </div>
                  <b>{{ entry.status === 'active' ? 'Активна' : 'Истекла' }}</b>
                </header>

                <div class="block-history-entry__details">
                  <div>
                    <span>Срок</span>
                    <strong>{{ entry.duration }}</strong>
                  </div>
                  <div>
                    <span>Причина</span>
                    <strong>{{ entry.reason }}</strong>
                  </div>
                  <div>
                    <span>Выдал</span>
                    <strong>{{ entry.issuedBy }}</strong>
                  </div>
                  <div>
                    <span>Роль</span>
                    <strong>{{ entry.role }}</strong>
                  </div>
                </div>
              </article>
            </div>

            <div v-else class="block-history-modal__empty">
              <strong>История блокировок отсутствует</strong>
              <p>По персонажу нет записей о блокировках.</p>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup lang="ts">

import {
  BaseIcon,
  X,
} from '@/shared/icons'

import { computed, ref, watch, type Component } from "vue";
import ShopCaseSelect from '../ShopTab/ShopCaseSelect.vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

const props = defineProps<{
    payload?: InterfacePayloadMap["f2Menu"]
}>()

type StatIcon =
  | 'registration'
  | 'level'
  | 'time'
  | 'arrests'
  | 'convictions'
  | 'kills'
  | 'blocks'
  | 'money'
  | 'spent'
  | 'casino'
  | 'contracts'
  | 'world'
  | 'achievements'
  | 'promo'

type StatisticCard = {
  action?: string
  activeTab?: string
  caption: string
  icon: StatIcon
  iconComponent: Component
  tabs?: string[]
  tabsLabel?: string
  title: string
  value: string
}

type BlockHistoryEntry = {
  date: string
  duration: string
  id: string
  issuedBy: string
  reason: string
  role: string
  status: 'active' | 'expired'
  title: string
}

const blockHistory: BlockHistoryEntry[] = [
  {
    id: 'chat-active',
    title: 'Блокировка чата',
    date: 'Сегодня, 18:42',
    duration: '24 часа',
    reason: 'Оскорбление нации',
    issuedBy: 'Nick Name',
    role: 'Администратор',
    status: 'active',
  },
  {
    id: 'chat-expired',
    title: 'Блокировка чата',
    date: '12.05.2026, 21:10',
    duration: '2 часа',
    reason: 'Флуд в общий чат',
    issuedBy: 'Helper Twinkle',
    role: 'Старший хелпер',
    status: 'expired',
  },
  {
    id: 'voice-expired',
    title: 'Блокировка голосового чата',
    date: '03.05.2026, 14:05',
    duration: '6 часов',
    reason: 'Провокация конфликта',
    issuedBy: 'Admin RP',
    role: 'Куратор',
    status: 'expired',
  },
]

const statisticCards = computed(() => {
    return (props.payload as any)?.statistics?.cards ?? [];
});

const activeStatisticTabs = ref<Record<string, string>>(
    Object.fromEntries(
        statisticCards.value
            .filter((card: any) => card.tabs?.length)
            .map((card: any) => [
                card.title,
                card.activeTab ?? card.tabs[0]
            ])
    )
);

const isBlockHistoryOpen = ref(false);

function getSelectOptions(tabs: string[]) {
    return tabs.map(tab => ({
        label: tab,
        value: tab
    }));
}

function handleCardAction(card: StatisticCard) {
    if (card.icon === "blocks") {
        isBlockHistoryOpen.value = true;
    }
}

function closeBlockHistory() {
    isBlockHistoryOpen.value = false;
}

watch(statisticCards, (cards) => {
    activeStatisticTabs.value = Object.fromEntries(
        cards
            .filter((card: any) => card.tabs?.length)
            .map((card: any) => [
                card.title,
                card.activeTab ?? card.tabs[0]
            ])
    );
}, { immediate: true });

</script>

<style scoped>
.character-statistics {
  min-height: 100%;
  padding-right: 1.8vh;
}

.character-statistics__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1vh;
  margin-top: 4.2vh;
}

.stat-card {
  position: relative;
  z-index: 1;
  min-height: 13.2vh;
  display: grid;
  align-content: start;
  gap: 1.05vh;
  padding: 1.7vh 1.85vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.65vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 38%),
    linear-gradient(135deg, rgb(255 255 255 / 3%), transparent 42%),
    rgb(8 8 9 / 88%);
  box-shadow:
    inset 0 0 0 0.1vh rgb(255 255 255 / 2%),
    0 0.8vh 1.8vh rgb(0 0 0 / 16%);
  box-sizing: border-box;
  overflow: visible;
}

.stat-card:has(.shop-case-select__trigger--open) {
  z-index: 25;
}

.stat-card h2,
.stat-card strong,
.stat-card p {
  position: relative;
  z-index: 2;
}

.stat-card h2 {
  margin: 0;
  color: rgb(255 255 255 / 68%);
  font-size: 1.08vh;
  font-weight: 600;
}

.stat-card strong {
  display: block;
  margin-top: 1.35vh;
  color: #ffffff;
  font-size: 1.58vh;
  font-weight: 600;
  line-height: 1;
}

.stat-card p {
  min-height: 1.25vh;
  margin: 1.65vh 0 0;
  color: rgb(255 255 255 / 46%);
  font-size: 1vh;
  font-weight: 600;
}

.stat-card__select {
  position: relative;
  z-index: 2;
  width: 18vh;
  margin-top: auto;
}

.stat-card__action {
  position: relative;
  z-index: 2;
  width: fit-content;
  min-height: 2.55vh;
  margin-top: auto;
  padding: 0 1vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.45vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 7%), rgb(255 255 255 / 4%)),
    rgb(12 12 14 / 88%);
  color: rgb(255 255 255 / 66%);
  cursor: pointer;
  font: inherit;
  font-size: 0.9vh;
  font-weight: 600;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.stat-card__action:hover {
  border-color: rgb(255 255 255 / 12%);
  background:
    radial-gradient(10vh 4vh at 0% 50%, rgb(172 46 205 / 14%), transparent 72%),
    rgb(255 255 255 / 8%);
  color: #ffffff;
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 3%);
}

.stat-card__icon {
  position: absolute;
  right: 1.55vh;
  top: 50%;
  width: 4.7vh;
  height: 4.7vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(255 255 255 / 100%);
  opacity: 0.085;
  transform: translateY(-50%);
}

.stat-card__icon :deep(.twinkle-icon) {
  width: 4.7vh;
  height: 4.7vh;
}

.block-history-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 2vh;
  background: rgb(0 0 0 / 72%);
  box-sizing: border-box;
}

.block-history-modal__panel {
  width: 72vh;
  max-height: 74vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 1.15vh;
  background: rgb(9 9 10 / 98%);
  box-shadow: 0 2.2vh 6vh rgb(0 0 0 / 58%);
  overflow: hidden;
}

.block-history-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1vh;
  min-height: 8.5vh;
  padding: 1.9vh 2.4vh 1.65vh;
  border-bottom: 1px solid rgb(255 255 255 / 7%);
}

.block-history-modal__header div {
  min-width: 0;
  display: grid;
  gap: 0.35vh;
}

.block-history-modal__header span {
  color: rgb(255 255 255 / 42%);
  font-size: 1.02vh;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}

.block-history-modal__header h2 {
  margin: 0;
  color: #ffffff;
  font-size: 2.1vh;
  font-weight: 800;
  line-height: 1;
}

.block-history-modal__close {
  width: 3.65vh;
  height: 3.65vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 0.8vh;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 82%);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
}

.block-history-modal__close:hover {
  border-color: rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 9%);
  color: #ffffff;
}

.block-history-modal__list {
  display: grid;
  gap: 1.05vh;
  max-height: 59vh;
  padding: 1.45vh 1.55vh;
  overflow: hidden auto;
}

.block-history-modal__list::-webkit-scrollbar {
  width: 0.45vh;
}

.block-history-modal__list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgb(255 255 255 / 16%);
}

.block-history-entry {
  display: grid;
  gap: 1.05vh;
  padding: 1.25vh 1.35vh 1.35vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 0.85vh;
  background: rgb(18 18 18 / 78%);
}

.block-history-entry--active {
  border-color: rgb(255 71 71 / 42%);
  background:
    linear-gradient(180deg, rgb(255 71 71 / 9%), rgb(255 71 71 / 4%)),
    rgb(24 8 8 / 84%);
}

.block-history-entry__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1vh;
}

.block-history-entry__header div {
  min-width: 0;
  display: grid;
  gap: 0.35vh;
}

.block-history-entry__header strong {
  overflow: hidden;
  color: #ffffff;
  font-size: 1.28vh;
  font-weight: 800;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-history-entry__header span {
  color: rgb(255 255 255 / 46%);
  font-size: 0.98vh;
  font-weight: 700;
  line-height: 1;
}

.block-history-entry__header b {
  flex: 0 0 auto;
  min-height: 2.2vh;
  display: inline-flex;
  align-items: center;
  padding: 0 0.95vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 12%);
  color: #ffffff;
  font-size: 0.92vh;
  font-weight: 800;
  line-height: 1;
}

.block-history-entry--active .block-history-entry__header b {
  background: #ff4747;
  box-shadow: 0 0 1.2vh rgb(255 71 71 / 18%);
}

.block-history-entry__details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85vh;
}

.block-history-entry__details div {
  min-height: 4.8vh;
  display: grid;
  align-content: center;
  gap: 0.38vh;
  padding: 0.8vh 0.95vh;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 0.55vh;
  background: rgb(0 0 0 / 26%);
}

.block-history-entry--active .block-history-entry__details div {
  border-color: rgb(255 71 71 / 8%);
  background: rgb(0 0 0 / 28%);
}

.block-history-entry__details span {
  overflow: hidden;
  color: rgb(255 255 255 / 36%);
  font-size: 0.86vh;
  font-weight: 800;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-history-entry__details strong {
  overflow: hidden;
  color: #ffffff;
  font-size: 1.02vh;
  font-weight: 800;
  line-height: 1.08;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-history-modal__empty {
  min-height: 18vh;
  margin: 1.45vh 1.55vh;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.65vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.7vh;
  background: rgb(18 18 18 / 78%);
  text-align: center;
}

.block-history-modal__empty p {
  margin: 0;
  color: rgb(255 255 255 / 50%);
  font-size: 0.98vh;
  font-weight: 600;
  line-height: 1.35;
}

.block-history-modal__empty strong {
  color: #ffffff;
  font-size: 1.2vh;
  font-weight: 700;
  line-height: 1;
}

.block-history-modal-enter-active,
.block-history-modal-leave-active {
  transition: opacity 160ms ease;
}

.block-history-modal-enter-active .block-history-modal__panel,
.block-history-modal-leave-active .block-history-modal__panel {
  transition: transform 160ms ease, opacity 160ms ease;
}

.block-history-modal-enter-from,
.block-history-modal-leave-to {
  opacity: 0;
}

.block-history-modal-enter-from .block-history-modal__panel,
.block-history-modal-leave-to .block-history-modal__panel {
  opacity: 0;
  transform: translateY(0.6vh) scale(0.985);
}
</style>
