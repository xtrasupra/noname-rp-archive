<template>
  <main class="f2-menu">
    <section class="f2-menu__content" aria-label="F2 меню">
      <aside class="f2-menu__sidebar">
        <header class="f2-menu__profile">
          <img class="f2-menu__logo" src="/tw.png" alt="Twinkle RP">

          <div class="f2-menu__profile-text">
            <strong>{{ playerName }}</strong>
            <span>{{ playerTitle }}</span>
          </div>

          <span v-if="adminLevel > 0" class="f2-menu__level">{{ adminLevel }}</span>
        </header>

        <nav class="f2-menu__nav" aria-label="Навигация F2 меню">
          <div class="f2-menu__group">
            <button
              class="f2-menu__nav-button f2-menu__nav-button--section"
              :class="{ 'f2-menu__nav-button--active': activeRoute === 'character' }"
              type="button"
              @click="setRoute('character', { section: 'overview' })"
            >
              <span class="f2-menu__nav-icon f2-menu__nav-icon--character-person" aria-hidden="true"></span>
              <span>Персонаж</span>
            </button>

            <div
              class="f2-menu__subnav"
              :style="{
                '--active-section-index': String(activeCharacterSectionIndex),
                '--subnav-height': '16.75vh',
              }"
            >
              <button
                v-for="item in characterNavigation"
                :key="item.section"
                class="f2-menu__nav-button"
                :class="{ 'f2-menu__nav-button--active': isCharacterSectionActive(item.section) }"
                type="button"
                @click="setRoute('character', { section: item.section })"
              >
                <span class="f2-menu__nav-icon" :class="`f2-menu__nav-icon--${item.icon}`" aria-hidden="true"></span>
                <span>{{ item.label }}</span>
              </button>
            </div>
          </div>

          <div class="f2-menu__group">
            <button
              class="f2-menu__nav-button f2-menu__nav-button--section"
              :class="{ 'f2-menu__nav-button--active': activeRoute === 'animations' }"
              type="button"
              @click="setRoute('animations', { animation: 'actions' })"
            >
              <span class="f2-menu__nav-icon f2-menu__nav-icon--animations" aria-hidden="true"></span>
              <span>Анимации</span>
            </button>

            <div
              v-if="activeRoute === 'animations'"
              class="f2-menu__subnav"
              :style="{
                '--active-section-index': String(activeAnimationSectionIndex),
                '--subnav-height': '31.5vh',
              }"
            >
              <button
                v-for="item in animationNavigation"
                :key="item.section"
                class="f2-menu__nav-button"
                :class="{ 'f2-menu__nav-button--active': isAnimationSectionActive(item.section) }"
                type="button"
                @click="setRoute('animations', { animation: item.section })"
              >
                <span class="f2-menu__nav-icon" :class="`f2-menu__nav-icon--${item.icon}`" aria-hidden="true"></span>
                <span>{{ item.label }}</span>
              </button>
            </div>

            <template v-for="item in secondaryNavigation" :key="item.route">
              <button
                class="f2-menu__nav-button"
                :class="[
                  item.plain ? 'f2-menu__nav-button--plain' : '',
                  { 'f2-menu__nav-button--active': activeRoute === item.route },
                ]"
                type="button"
                @click="setRoute(item.route)"
              >
                <span class="f2-menu__nav-icon" :class="`f2-menu__nav-icon--${item.icon}`" aria-hidden="true"></span>
                <span>{{ item.label }}</span>
              </button>

              <div
                v-if="item.route === 'appeals' && activeRoute === 'appeals'"
                class="f2-menu__subnav"
                :style="{
                  '--active-section-index': String(activeAppealSectionIndex),
                  '--subnav-height': '10.1vh',
                }"
              >
                <button
                  v-for="appealItem in appealNavigation"
                  :key="appealItem.section"
                  class="f2-menu__nav-button"
                  :class="{ 'f2-menu__nav-button--active': isAppealSectionActive(appealItem.section) }"
                  type="button"
                  @click="setRoute('appeals', { appeal: appealItem.section })"
                >
                  <span class="f2-menu__nav-icon" :class="`f2-menu__nav-icon--${appealItem.icon}`" aria-hidden="true"></span>
                  <span>{{ appealItem.label }}</span>
                </button>
              </div>

              <div
                v-if="item.route === 'shop' && activeRoute === 'shop'"
                class="f2-menu__subnav"
                :style="{
                  '--active-section-index': String(activeShopSectionIndex),
                  '--subnav-height': '27.9vh',
                }"
              >
                <button
                  v-for="shopItem in shopNavigation"
                  :key="shopItem.section"
                  class="f2-menu__nav-button"
                  :class="{ 'f2-menu__nav-button--active': isShopSectionActive(shopItem.section) }"
                  type="button"
                  @click="setRoute('shop', { shop: shopItem.section })"
                >
                  <span class="f2-menu__nav-icon" :class="`f2-menu__nav-icon--${shopItem.icon}`" aria-hidden="true"></span>
                  <span>{{ shopItem.label }}</span>
                </button>
              </div>

              <div
                v-if="item.route === 'miniGames' && activeRoute === 'miniGames'"
                class="f2-menu__subnav"
                :style="{
                  '--active-section-index': String(activeMiniGameSectionIndex),
                  '--subnav-height': '6.65vh',
                }"
              >
                <button
                  v-for="miniGameItem in miniGameNavigation"
                  :key="miniGameItem.section"
                  class="f2-menu__nav-button"
                  :class="{ 'f2-menu__nav-button--active': isMiniGameSectionActive(miniGameItem.section) }"
                  type="button"
                  @click="setRoute('miniGames', { miniGame: miniGameItem.section })"
                >
                  <span class="f2-menu__nav-icon" :class="`f2-menu__nav-icon--${miniGameItem.icon}`" aria-hidden="true"></span>
                  <span>{{ miniGameItem.label }}</span>
                </button>
              </div>
            </template>
          </div>
        </nav>
      </aside>

      <section class="f2-menu__main">
        <div v-if="!isPayloadReady" class="f2-menu__loading">
          <span>Загрузка данных персонажа...</span>
        </div>
        <Transition name="f2-menu-page" mode="out-in">
          <component
            v-if="isPayloadReady"
            :is="activeComponent"
            :key="activeViewKey"
            :animation-items="animationItems"
            :animation-section="activeAnimationSection"
            :favorite-animation-ids="favoriteAnimationIds"
            :payload="f2Payload"
            :route="activeRoute"
            :title="activePageTitle"
            @play-animation="playAnimation"
            @toggle-animation-favorite="toggleAnimationFavorite"
            @navigate-shop="setRoute('shop', { shop: $event })"
          />
        </Transition>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import {
    computed,
    ref,
    watch,
    onMounted,
    onBeforeUnmount,
    type Component,
} from "vue"
import type { InterfacePayloadMap } from '@/shared/contracts/ui'
import { callClientEvent } from '@/core/client-events/client-event'

import AnimationActions from './components/AnimationsTab/AnimationActions.vue'
import AnimationCircleMenu from './components/AnimationsTab/AnimationCircleMenu.vue'
import AnimationOther from './components/AnimationsTab/AnimationOther.vue'
import { animationCatalog as fallbackAnimationCatalog } from './components/AnimationsTab/animationCatalog'
import AppealsModeration from './components/AppealsTab/AppealsModeration.vue'
import AppealsOverview from './components/AppealsTab/AppealsOverview.vue'
import AppealsStatistics from './components/AppealsTab/AppealsStatistics.vue'
import CharacterOverview from './components/CharacterTab/CharacterOverview.vue'
import CharacterProperty from './components/CharacterTab/CharacterProperty.vue'
import CharacterQuests from './components/CharacterTab/CharacterQuests.vue'
import CharacterSkills from './components/CharacterTab/CharacterSkills.vue'
import CharacterStatistics from './components/CharacterTab/CharacterStatistics.vue'
import F2MenuSection from './components/F2MenuSection.vue'
import ShopAnimations from './components/ShopTab/ShopAnimations.vue'
import ShopCharacter from './components/ShopTab/ShopCharacter.vue'
import ShopCases from './components/ShopTab/ShopCases.vue'
import ShopCurrency from './components/ShopTab/ShopCurrency.vue'
import ShopHome from './components/ShopTab/ShopHome.vue'
import ShopInventory from './components/ShopTab/ShopInventory.vue'
import ShopStarterPack from './components/ShopTab/ShopStarterPack.vue'
import ShopTopUp from './components/ShopTab/ShopTopUp.vue'
import SettingsPage from './components/SettingsTab/SettingsPage.vue'

type F2Route = 'character' | 'animations' | 'appeals' | 'shop' | 'miniGames' | 'settings'
type CharacterSection = 'overview' | 'statistics' | 'skills' | 'property' | 'quests'
type AppealSection = 'overview' | 'moderation' | 'statistics'
type ShopSection = 'home' | 'topUp' | 'character' | 'cases' | 'inventory' | 'currency' | 'starterPack' | 'animations'
type MiniGameSection = 'roulette' | 'x3'
type AnimationSection =
  | 'actions'
  | 'poses'
  | 'positive'
  | 'negative'
  | 'dances'
  | 'other'
  | 'exclusive'
  | 'favorite'
  | 'circleMenu'

type F2Query = {
  appeal?: AppealSection
  animation?: AnimationSection
  miniGame?: MiniGameSection
  section?: CharacterSection
  shop?: ShopSection
}

type NavIconName =
  | 'actions'
  | 'animations'
  | 'animation-actions'
  | 'animation-circle-menu'
  | 'animation-dances'
  | 'animation-exclusive'
  | 'animation-favorite'
  | 'animation-negative'
  | 'animation-other'
  | 'animation-positive'
  | 'animation-poses'
  | 'appeals'
  | 'appeals-moderation'
  | 'appeals-statistics'
  | 'circleMenu'
  | 'home'
  | 'interface'
  | 'miniGames'
  | 'moderation'
  | 'overview-home'
  | 'character-person'
  | 'property-house'
  | 'roulette'
  | 'settings'
  | 'settingsTab'
  | 'shop'
  | 'shop-animations'
  | 'shop-cases'
  | 'shop-character'
  | 'shop-currency'
  | 'shop-home'
  | 'shop-items'
  | 'shop-starter-pack'
  | 'shop-top-up'
  | 'skill-tree-false'
  | 'starterPack'
  | 'statistics-tru'
  | 'topUp'
  | 'x3'

type CharacterNavigationItem = {
  icon: NavIconName
  label: string
  section: CharacterSection
}

type AnimationNavigationItem = {
  icon: NavIconName
  label: string
  section: AnimationSection
}

type AppealNavigationItem = {
  icon: NavIconName
  label: string
  section: AppealSection
}

type MiniGameNavigationItem = {
  icon: NavIconName
  label: string
  section: MiniGameSection
}

type ShopNavigationItem = {
  icon: NavIconName
  label: string
  section: ShopSection
}

type MainNavigationItem = {
  icon: NavIconName
  label: string
  plain?: boolean
  route: Exclude<F2Route, 'character'>
}

const characterNavigation: CharacterNavigationItem[] = [
  { icon: 'overview-home', label: 'Основное', section: 'overview' },
  { icon: 'statistics-tru', label: 'Статистика', section: 'statistics' },
  { icon: 'skill-tree-false', label: 'Дерево навыков', section: 'skills' },
  { icon: 'property-house', label: 'Имущество', section: 'property' },
  { icon: 'skill-tree-false', label: 'Задания', section: 'quests' },
]

const animationNavigation: AnimationNavigationItem[] = [
  { icon: 'animation-actions', label: 'Действия', section: 'actions' },
  { icon: 'animation-poses', label: 'Позы', section: 'poses' },
  { icon: 'animation-positive', label: 'Позитивные', section: 'positive' },
  { icon: 'animation-negative', label: 'Негативные', section: 'negative' },
  { icon: 'animation-dances', label: 'Танцы', section: 'dances' },
  { icon: 'animation-other', label: 'Прочие', section: 'other' },
  { icon: 'animation-exclusive', label: 'Эксклюзивные', section: 'exclusive' },
  { icon: 'animation-favorite', label: 'Избранное', section: 'favorite' },
  { icon: 'animation-circle-menu', label: 'Круговое меню', section: 'circleMenu' },
]

const appealNavigation: AppealNavigationItem[] = [
  { icon: 'appeals', label: 'Обращения', section: 'overview' },
  { icon: 'appeals-moderation', label: 'Модерация', section: 'moderation' },
  { icon: 'appeals-statistics', label: 'Статистика', section: 'statistics' },
]

const shopNavigation: ShopNavigationItem[] = [
  { icon: 'shop-home', label: 'Главная', section: 'home' },
  { icon: 'shop-top-up', label: 'Пополнить', section: 'topUp' },
  { icon: 'shop-character', label: 'Персонаж', section: 'character' },
  { icon: 'shop-cases', label: 'Кейсы', section: 'cases' },
  { icon: 'shop-items', label: 'Инвентарь', section: 'inventory' },
  { icon: 'shop-currency', label: 'Валюта', section: 'currency' },
  { icon: 'shop-starter-pack', label: 'Стартовый набор', section: 'starterPack' },
  { icon: 'shop-animations', label: 'Анимации', section: 'animations' },
]

const miniGameNavigation: MiniGameNavigationItem[] = [
  { icon: 'roulette', label: 'Рулетка', section: 'roulette' },
  { icon: 'x3', label: 'x3', section: 'x3' },
]

const mainNavigation: MainNavigationItem[] = [
  {
    icon: 'animations',
    label: 'Анимации',
    plain: true,
    route: 'animations',
  },
  {
    icon: 'appeals',
    label: 'Обращения',
    route: 'appeals',
  },
  {
    icon: 'shop',
    label: 'Магазин',
    route: 'shop',
  },
  {
    icon: 'miniGames',
    label: 'Мини-игры',
    route: 'miniGames',
  },
  {
    icon: 'settings',
    label: 'Настройки',
    route: 'settings',
  },
]

const routeComponents: Record<CharacterSection, Component> = {
  overview: CharacterOverview,
  statistics: CharacterStatistics,
  skills: CharacterSkills,
  property: CharacterProperty,
  quests: CharacterQuests,
}

const animationComponents: Record<AnimationSection, Component> = {
  actions: AnimationActions,
  poses: AnimationActions,
  positive: AnimationActions,
  negative: AnimationActions,
  dances: AnimationActions,
  other: AnimationActions,
  exclusive: AnimationActions,
  favorite: AnimationActions,
  circleMenu: AnimationCircleMenu,
}

const activeRoute = ref<F2Route>('character')
const activeQuery = ref<F2Query>({ section: 'overview' })
const localFavoriteAnimationIds = ref<string[]>([])

const props = defineProps<{
    payload?: InterfacePayloadMap["f2Menu"]
}>()

const f2Payload = ref<any>(props.payload ?? {})

watch(
    () => props.payload,
    value => {
        f2Payload.value = value ?? {}
    },
    {
        immediate: true,
        deep: true,
    }
)

function setPayload(payload: any) {
    f2Payload.value = payload ?? {}
}

function onPayloadUpdate(event: Event) {
    setPayload((event as CustomEvent).detail)
}

function onAnimationsUpdate(event: Event) {
    f2Payload.value = {
        ...(f2Payload.value || {}),
        animations: (event as CustomEvent).detail || {},
    }
}

function onQuestsUpdate(event: Event) {
    f2Payload.value = {
        ...(f2Payload.value || {}),
        quests: (event as CustomEvent<unknown>).detail,
    }
}

const isPayloadReady = computed(() => {
  const payload = f2Payload.value as any
  return Boolean(payload?.player || payload?.playerName || payload?.character?.name || payload?.character?.uuid)
})

onMounted(() => {
    window.addEventListener("twinkle:f2:update", onPayloadUpdate)
    window.addEventListener("twinkle:f2:animations:set", onAnimationsUpdate)
    window.addEventListener("twinkle:quests:state", onQuestsUpdate)

    ;(window as any).TWINKLE_F2 = {
        setPayload,
    }

    callClientEvent('c:f2menu:ready')
})

onBeforeUnmount(() => {
    window.removeEventListener("twinkle:f2:update", onPayloadUpdate)
    window.removeEventListener("twinkle:f2:animations:set", onAnimationsUpdate)
    window.removeEventListener("twinkle:quests:state", onQuestsUpdate)
})

const playerName = computed(() => {
  const payload = f2Payload.value as any

  return String(
    payload?.playerName
      ?? payload?.player?.name
      ?? payload?.character?.name
      ?? payload?.character?.fullName
      ?? 'TWINKLE RP'
  )
})

const playerTitle = computed(() => {
  const payload = f2Payload.value as any

  return String(
    payload?.playerTitle
      ?? payload?.character?.adminTitle
      ?? payload?.character?.rankTitle
      ?? payload?.character?.jobName
      ?? payload?.character?.fractionName
      ?? payload?.character?.organizationName
      ?? 'Player'
  )
})

const adminLevel = computed(() => {
  const payload = f2Payload.value as any
  const value = Number(
    payload?.adminLevel
      ?? payload?.character?.admin_level
      ?? payload?.character?.adminLevel
      ?? 0
  )

  return Number.isFinite(value) ? value : 0
})

const animationsPayload = computed(() => {
  const payload = f2Payload.value as any
  return payload?.animations || {}
})

const animationItems = computed(() => {
  const items = animationsPayload.value?.items
  return Array.isArray(items) && items.length ? items : fallbackAnimationCatalog
})

const favoriteAnimationIds = computed(() => {
  const serverFavorites = animationsPayload.value?.favoriteIds

  if (Array.isArray(serverFavorites)) {
    return serverFavorites.map(String)
  }

  return localFavoriteAnimationIds.value
})

const activeCharacterSection = computed<CharacterSection>(() => activeQuery.value.section ?? 'overview')
const activeAppealSection = computed<AppealSection>(() => activeQuery.value.appeal ?? 'overview')
const activeAnimationSection = computed<AnimationSection>(() => activeQuery.value.animation ?? 'actions')
const activeMiniGameSection = computed<MiniGameSection>(() => activeQuery.value.miniGame ?? 'roulette')
const activeShopSection = computed<ShopSection>(() => activeQuery.value.shop ?? 'home')
const secondaryNavigation = computed(() => mainNavigation.filter((item) => item.route !== 'animations'))
const activePageTitle = computed(() => {
  if (activeRoute.value === 'animations') {
    return animationNavigation.find((item) => item.section === activeAnimationSection.value)?.label ?? 'Действия'
  }

  return undefined
})

const activeCharacterSectionIndex = computed(() => {
  if (activeRoute.value !== 'character') {
    return 0
  }

  return Math.max(
    characterNavigation.findIndex((item) => item.section === activeCharacterSection.value),
    0,
  )
})

const activeAnimationSectionIndex = computed(() => {
  if (activeRoute.value !== 'animations') {
    return 0
  }

  return Math.max(
    animationNavigation.findIndex((item) => item.section === activeAnimationSection.value),
    0,
  )
})

const activeAppealSectionIndex = computed(() => {
  if (activeRoute.value !== 'appeals') {
    return 0
  }

  return Math.max(
    appealNavigation.findIndex((item) => item.section === activeAppealSection.value),
    0,
  )
})

const activeMiniGameSectionIndex = computed(() => {
  if (activeRoute.value !== 'miniGames') {
    return 0
  }

  return Math.max(
    miniGameNavigation.findIndex((item) => item.section === activeMiniGameSection.value),
    0,
  )
})

const activeShopSectionIndex = computed(() => {
  if (activeRoute.value !== 'shop') {
    return 0
  }

  return Math.max(
    shopNavigation.findIndex((item) => item.section === activeShopSection.value),
    0,
  )
})

const activeComponent = computed<Component>(() => {
  if (activeRoute.value === 'character') {
    return routeComponents[activeCharacterSection.value]
  }

  if (activeRoute.value === 'animations') {
    return animationComponents[activeAnimationSection.value]
  }

  if (activeRoute.value === 'appeals') {
    if (activeAppealSection.value === 'moderation') {
      return AppealsModeration
    }

    if (activeAppealSection.value === 'statistics') {
      return AppealsStatistics
    }

    return AppealsOverview
  }

  if (activeRoute.value === 'miniGames') {
    return AnimationOther
  }

  if (activeRoute.value === 'shop' && activeShopSection.value === 'home') {
    return ShopHome
  }

  if (activeRoute.value === 'shop' && activeShopSection.value === 'topUp') {
    return ShopTopUp
  }

  if (activeRoute.value === 'shop' && activeShopSection.value === 'character') {
    return ShopCharacter
  }

  if (activeRoute.value === 'shop' && activeShopSection.value === 'cases') {
    return ShopCases
  }

  if (activeRoute.value === 'shop' && activeShopSection.value === 'inventory') {
    return ShopInventory
  }

  if (activeRoute.value === 'shop' && activeShopSection.value === 'currency') {
    return ShopCurrency
  }

  if (activeRoute.value === 'shop' && activeShopSection.value === 'starterPack') {
    return ShopStarterPack
  }

  if (activeRoute.value === 'shop' && activeShopSection.value === 'animations') {
    return ShopAnimations
  }

  if (activeRoute.value === 'settings') {
    return SettingsPage
  }

  return F2MenuSection
})

const activeViewKey = computed(() => {
  if (activeRoute.value === 'character') {
    return `${activeRoute.value}:${activeCharacterSection.value}`
  }

  if (activeRoute.value === 'animations') {
    return `${activeRoute.value}:${activeAnimationSection.value}`
  }

  if (activeRoute.value === 'appeals') {
    return `${activeRoute.value}:${activeAppealSection.value}`
  }

  if (activeRoute.value === 'miniGames') {
    return `${activeRoute.value}:${activeMiniGameSection.value}`
  }

  if (activeRoute.value === 'shop') {
    return `${activeRoute.value}:${activeShopSection.value}`
  }

  return activeRoute.value
})

function isCharacterSectionActive(section: CharacterSection) {
  return activeRoute.value === 'character' && activeCharacterSection.value === section
}

function isAnimationSectionActive(section: AnimationSection) {
  return activeRoute.value === 'animations' && activeAnimationSection.value === section
}

function isAppealSectionActive(section: AppealSection) {
  return activeRoute.value === 'appeals' && activeAppealSection.value === section
}

function isMiniGameSectionActive(section: MiniGameSection) {
  return activeRoute.value === 'miniGames' && activeMiniGameSection.value === section
}

function isShopSectionActive(section: ShopSection) {
  return activeRoute.value === 'shop' && activeShopSection.value === section
}

function setRoute(route: F2Route, query: F2Query = {}) {
  activeRoute.value = route
  activeQuery.value = route === 'character'
    ? { section: query.section ?? 'overview' }
    : route === 'animations'
      ? { animation: query.animation ?? 'actions' }
      : route === 'appeals'
        ? { appeal: query.appeal ?? 'overview' }
        : route === 'shop'
          ? { shop: query.shop ?? 'home' }
          : route === 'miniGames'
            ? { miniGame: query.miniGame ?? 'roulette' }
            : {}
}

function toggleAnimationFavorite(animationId: string) {
  const nextEnabled = !favoriteAnimationIds.value.includes(animationId)

  localFavoriteAnimationIds.value = nextEnabled
    ? [...localFavoriteAnimationIds.value, animationId]
    : localFavoriteAnimationIds.value.filter((id) => id !== animationId)

  triggerClient('f2:animation:favorite', animationId, nextEnabled)
}

function playAnimation(animationId: string) {
  triggerClient('f2:animation:play', animationId)
  closeF2Menu()
}

function triggerClient(eventName: string, ...args: unknown[]) {
  const mp = (window as any).mp
  if (!mp?.trigger) return

  mp.trigger(eventName, ...args)
}

function closeF2Menu() {
  const mp = (window as any).mp

  if (mp?.trigger) {
    mp.trigger('c:f2menu:close')
    return
  }

  ;(window as any).twinkleBrowser?.pages?.close?.('f2Menu')
}
</script>

<style scoped>
.f2-menu {
  width: 100vw;
  height: 100vh;
  min-height: 100vh;
  display: grid;
  place-items: stretch;
  padding: 0;
  color: #ffffff;
  font-family: "SF Pro Display", "Segoe UI", sans-serif;
  font-size: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

.f2-menu__content {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 33.6vh 1fr;
  background:
    linear-gradient(90deg, rgb(0 0 0 / 62%) 0 33.6vh, rgb(12 12 12 / 88%) 33.6vh 100%),
    radial-gradient(70vh 44vh at 42% 62%, rgb(255 255 255 / 5%), transparent 70%),
    linear-gradient(180deg, rgb(255 255 255 / 5%), transparent 28%),
    rgb(16 16 16 / 98%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 2%);
  overflow: hidden;
}



.f2-menu__sidebar,
.f2-menu__main {
  position: relative;
  z-index: 1;
}

.f2-menu__sidebar {
  padding: 1.55vh 1.55vh 0;
}

.f2-menu__profile {
  display: grid;
  grid-template-columns: 4.2vh 1fr 2.4vh;
  align-items: center;
  gap: 0.6vh;
  min-height: 4.4vh;
}

.f2-menu__logo {
  width: 3.7vh;
  height: 3.7vh;
  object-fit: contain;
}

.f2-menu__profile-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.05;
}

.f2-menu__profile-text strong {
  font-size: 1.15vh;
}

.f2-menu__profile-text span {
  margin-top: 0.15vh;
  font-size: 1.05vh;
}

.f2-menu__level {
  width: 2.4vh;
  height: 2.4vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.45vh;
  background: #ac2ecd;
  color: #ffffff;
  font-size: 1.25vh;
  font-weight: 600;
}

.f2-menu__nav {
  display: grid;
  gap: 0.45vh;
  margin-top: 1.25vh;
}

.f2-menu__group {
  display: grid;
  gap: 0.45vh;
}

.f2-menu__subnav {
  position: relative;
  display: grid;
  gap: 0.45vh;
  padding-left: 1.35vh;
}

.f2-menu__subnav::before {
  position: absolute;
  left: 0.75vh;
  top: 0;
  width: 0.28vh;
  height: var(--subnav-height, 13.4vh);
  border-radius: 999px;
  background: rgb(255 255 255 / 13%);
  content: "";
}

.f2-menu__subnav::after {
  position: absolute;
  left: 0.75vh;
  top: calc(var(--active-section-index, 0) * 3.55vh);
  width: 0.28vh;
  height: 3.1vh;
  border-radius: 999px;
  background: #ffffff;
  content: "";
  transition: top 180ms ease;
}

.f2-menu__nav-button {
  width: 100%;
  min-height: 3.1vh;
  display: flex;
  align-items: center;
  gap: 0.75vh;
  padding: 0 1.05vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.45vh;
  background: rgb(0 0 0 / 42%);
  color: #ffffff;
  cursor: pointer;
  font-size: 1.05vh;
  text-align: left;
  box-sizing: border-box;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}

.f2-menu__nav-button:hover {
  background: rgb(255 255 255 / 6%);
  border-color: rgb(255 255 255 / 12%);
}

.f2-menu__nav-image {
  width: 1.25vh;
  height: 1.25vh;
  flex: 0 0 auto;
  object-fit: contain;
  opacity: 0.88;
}

.f2-menu__nav-icon {
  position: relative;
  width: 1.35vh;
  height: 1.35vh;
  flex: 0 0 auto;
  color: rgb(255 255 255 / 88%);
}

.f2-menu__nav-icon::before,
.f2-menu__nav-icon::after {
  position: absolute;
  content: "";
  box-sizing: border-box;
}

.f2-menu__nav-icon--character-person::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-chel.png") center / contain no-repeat;
}

.f2-menu__nav-icon--overview-home::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-dom-2.png") center / contain no-repeat;
}

.f2-menu__nav-icon--x3::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-52.png") center / contain no-repeat;
}

.f2-menu__nav-icon--x3::after {
  content: none;
}

.f2-menu__nav-icon--statistics-tru::before {
  inset: 0.08vh;
  background: currentColor;
  content: "";
  mask: url("/icon-tru.png") center / contain no-repeat;
}

.f2-menu__nav-icon--skill-tree-false::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-false.png") center / contain no-repeat;
}

.f2-menu__nav-icon--shop::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-7.png") center / contain no-repeat;
}

.f2-menu__nav-icon--shop::after {
  content: none;
}

.f2-menu__nav-icon--property-house::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/Vector (55).png") center / contain no-repeat;
}

.f2-menu__nav-icon--animations::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-20.png") center / contain no-repeat;
}

.f2-menu__nav-icon--animations::after {
  content: none;
}

.f2-menu__nav-icon--animation-actions::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/Vector (54).png") center / contain no-repeat;
}

.f2-menu__nav-icon--animation-actions::after {
  content: none;
}

.f2-menu__nav-icon--animation-poses::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/Vector (53).png") center / contain no-repeat;
}

.f2-menu__nav-icon--animation-poses::after {
  content: none;
}

.f2-menu__nav-icon--animation-positive::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-sticer.png") center / contain no-repeat;
}

.f2-menu__nav-icon--animation-positive::after {
  content: none;
}

.f2-menu__nav-icon--animation-negative::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-24.png") center / contain no-repeat;
}

.f2-menu__nav-icon--animation-negative::after {
  content: none;
}

.f2-menu__nav-icon--animation-dances::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-25.png") center / contain no-repeat;
}

.f2-menu__nav-icon--animation-dances::after {
  content: none;
}

.f2-menu__nav-icon--animation-other::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-3.png") center / contain no-repeat;
}

.f2-menu__nav-icon--animation-exclusive::before {
  inset: 0.08vh;
  background: currentColor;
  clip-path: polygon(50% 0, 62% 35%, 100% 35%, 69% 56%, 82% 100%, 50% 73%, 18% 100%, 31% 56%, 0 35%, 38% 35%);
}

.f2-menu__nav-icon--animation-favorite::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-4.png") center / contain no-repeat;
}

.f2-menu__nav-icon--animation-favorite::after {
  content: none;
}

.f2-menu__nav-icon--animation-circle-menu::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-5.png") center / contain no-repeat;
}

.f2-menu__nav-icon--appeals::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/Vector (57).png") center / contain no-repeat;
}

.f2-menu__nav-icon--appeals::after {
  content: none;
}

.f2-menu__nav-icon--appeals-moderation::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-18.png") center / contain no-repeat;
}

.f2-menu__nav-icon--appeals-moderation::after {
  content: none;
}

.f2-menu__nav-icon--appeals-statistics::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-1.png") center / contain no-repeat;
}

.f2-menu__nav-icon--miniGames::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-8.png") center / contain no-repeat;
}

.f2-menu__nav-icon--miniGames::after {
  content: none;
}

.f2-menu__nav-icon--roulette::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-50.png") center / contain no-repeat;
}

.f2-menu__nav-icon--roulette::after {
  content: none;
}

.f2-menu__nav-icon--circleMenu::before {
  inset: 0.14vh;
  border: 0.18vh solid currentColor;
  border-radius: 50%;
}

.f2-menu__nav-icon--circleMenu::after {
  left: 50%;
  top: 50%;
  width: 0.18vh;
  height: 0.18vh;
  border-radius: 50%;
  background: currentColor;
  box-shadow:
    0 -0.36vh 0 currentColor,
    0.31vh 0.18vh 0 currentColor,
    -0.31vh 0.18vh 0 currentColor;
  transform: translate(-50%, -50%);
}

.f2-menu__nav-icon--settings::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-9.png") center / contain no-repeat;
}

.f2-menu__nav-icon--settings::after {
  content: none;
}

.f2-menu__nav-icon--settingsTab::before {
  inset: 0.13vh;
  border: 0.22vh dotted currentColor;
  border-radius: 50%;
}

.f2-menu__nav-icon--settingsTab::after {
  left: 50%;
  top: 50%;
  width: 0.34vh;
  height: 0.34vh;
  border-radius: 50%;
  background: currentColor;
  transform: translate(-50%, -50%);
}

.f2-menu__nav-icon--shop-home::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-dom-1.png") center / contain no-repeat;
}

.f2-menu__nav-icon--shop-top-up::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-17.png") center / contain no-repeat;
}

.f2-menu__nav-icon--shop-top-up::after {
  content: none;
}

.f2-menu__nav-icon--shop-character::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/Vector (56).png") center / contain no-repeat;
}

.f2-menu__nav-icon--shop-character::after {
  content: none;
}

.f2-menu__nav-icon--shop-cases::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-35.png") center / contain no-repeat;
}

.f2-menu__nav-icon--shop-cases::after {
  content: none;
}

.f2-menu__nav-icon--shop-currency::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-37.png") center / contain no-repeat;
}

.f2-menu__nav-icon--shop-currency::after {
  content: none;
}

.f2-menu__nav-icon--shop-starter-pack::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-45.png") center / contain no-repeat;
}

.f2-menu__nav-icon--shop-starter-pack::after {
  content: none;
}

.f2-menu__nav-icon--shop-items::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-41.png") center / contain no-repeat;
}

.f2-menu__nav-icon--shop-items::after {
  content: none;
}

.f2-menu__nav-icon--shop-animations::before {
  inset: 0.08vh;
  background: currentColor;
  mask: url("/icon-33.png") center / contain no-repeat;
}

.f2-menu__nav-icon--actions::before,
.f2-menu__nav-icon--interface::before,
.f2-menu__nav-icon--starterPack::before,
.f2-menu__nav-icon--moderation::before,
.f2-menu__nav-icon--home::before,
.f2-menu__nav-icon--topUp::before {
  inset: 0.18vh;
  border-radius: 0.25vh;
  background: currentColor;
}

.f2-menu__nav-icon--actions::after {
  left: 0.58vh;
  top: 0.04vh;
  width: 0.2vh;
  height: 1.26vh;
  border-radius: 999px;
  background: #000000;
  transform: rotate(45deg);
}

.f2-menu__nav-icon--interface::after,
.f2-menu__nav-icon--starterPack::after,
.f2-menu__nav-icon--moderation::after,
.f2-menu__nav-icon--topUp::after {
  left: 50%;
  top: 50%;
  width: 0.42vh;
  height: 0.42vh;
  border-radius: 50%;
  background: #000000;
  transform: translate(-50%, -50%);
}

.f2-menu__nav-icon--home::before {
  clip-path: polygon(50% 0, 100% 45%, 82% 45%, 82% 100%, 18% 100%, 18% 45%, 0 45%);
}

.f2-menu__nav-symbol {
  width: 1.25vh;
  height: 1.25vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: rgb(255 255 255 / 88%);
  font-size: 1.08vh;
  line-height: 1;
}

.f2-menu__nav-button--active {
  background: rgb(255 255 255 / 8%);
  border-color: rgb(255 255 255 / 10%);
}

.f2-menu__nav-button--section {
  min-height: 3.15vh;
}

.f2-menu__nav-button--plain {
  justify-content: flex-start;
}

.f2-menu__main {
  padding: 2.1vh 2.8vh 0;
  overflow: hidden;
}

.f2-menu__loading {
  height: 100%;
  display: grid;
  place-items: center;
  color: rgb(255 255 255 / 78%);
  font-size: 1.6vh;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

:deep(.f2-menu__title) {
  margin: 0;
  color: #ffffff;
  font-size: 1.45vh;
  line-height: 1;
  text-align: center;
}

:deep(.f2-menu__cards) {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 27.5vh));
  gap: 1.15vh;
  margin-top: 4.3vh;
}



:deep(.f2-menu-card) {
  min-height: 9.8vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.7vh;
  padding: 1.35vh 1.25vh;
  border: 1px solid rgb(255 255 255 / 3%);
  border-radius: 1.25vh;
  background: rgb(0 0 0 / 72%);
  box-sizing: border-box;
}

:deep(.f2-menu-card--stat) {
  justify-content: flex-start;
}

:deep(.f2-menu-card h2),
:deep(.f2-menu-card strong),
:deep(.f2-menu-card span),
:deep(.f2-menu-card p),
:deep(.f2-menu-card button) {
  margin: 0;
}

:deep(.f2-menu-card h2) {
  color: #ffffff;
  font-size: 1.25vh;
  line-height: 1.1;
}

:deep(.f2-menu-card strong) {
  color: #ffffff;
  font-size: 1.35vh;
  line-height: 1.15;
}

:deep(.f2-menu-card span),
:deep(.f2-menu-card p) {
  color: rgb(255 255 255 / 76%);
  font-size: 1.15vh;
  line-height: 1.2;
}

:deep(.f2-menu-card__money) {
  display: flex;
  align-items: center;
  gap: 0.35vh;
  white-space: nowrap;
}

:deep(.f2-menu-card__money-icon) {
  width: 1.25vh;
  height: 1.25vh;
  object-fit: contain;
  opacity: 0.8;
}

:deep(.f2-menu-card__select) {
  width: fit-content;
  min-width: 7.35vh;
  min-height: 3.05vh;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.1vh;
  padding: 0 1.05vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.8vh;
  background: rgb(255 255 255 / 3%);
  color: rgb(255 255 255 / 62%);
  cursor: pointer;
  font: inherit;
  font-size: 1.35vh;
  font-weight: 600;
  line-height: 1;
}

:deep(.f2-menu-card__select::after) {
  width: 0.55vh;
  height: 0.55vh;
  flex: 0 0 auto;
  border-right: 0.18vh solid rgb(255 255 255 / 62%);
  border-bottom: 0.18vh solid rgb(255 255 255 / 62%);
  content: "";
  transform: translateY(-0.2vh) rotate(45deg);
}

:deep(.f2-menu-card__history) {
  width: fit-content;
  min-height: 3.65vh;
  padding: 0 1.1vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.95vh;
  background: rgb(255 255 255 / 3%);
  color: rgb(255 255 255 / 62%);
  cursor: pointer;
  font: inherit;
  font-size: 1.45vh;
  font-weight: 600;
  line-height: 1;
}

:deep(.f2-menu-card__promo) {
  color: rgb(255 255 255 / 78%);
  font-size: 1.45vh;
  font-weight: 600;
  line-height: 1.1;
}

:deep(.f2-menu-card__promo b) {
  color: #ffffff;
  font-weight: 600;
}

:deep(.f2-menu-list) {
  display: grid;
  gap: 0.7vh;
  margin-top: 4.3vh;
  max-width: 86vh;
}

:deep(.f2-menu-row) {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 1.2vh;
  min-height: 5.1vh;
  padding: 0 1.35vh;
  border: 1px solid rgb(255 255 255 / 3%);
  border-radius: 0.8vh;
  background: rgb(0 0 0 / 62%);
}

:deep(.f2-menu-row strong) {
  color: #ffffff;
  font-size: 1.22vh;
}

:deep(.f2-menu-row span) {
  color: rgb(255 255 255 / 62%);
  font-size: 1.05vh;
}

:deep(.f2-menu-row__value) {
  color: #ffffff;
  font-size: 1.15vh;
}

:deep(.animations-grid) {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 10.8vh));
  gap: 0.85vh;
  margin-top: 3.65vh;
}

:deep(.animations-slot) {
  position: relative;
  height: 10.8vh;
  border: 1px solid rgb(255 255 255 / 3%);
  border-radius: 0.9vh;
  background: rgb(0 0 0 / 70%);
  cursor: pointer;
}

:deep(.animations-slot__favorite) {
  position: absolute;
  left: 0.95vh;
  top: 0.7vh;
  color: rgb(255 255 255 / 74%);
  font-size: 1.05vh;
  line-height: 1;
}

:deep(.appeals-layout) {
  display: grid;
  grid-template-columns: 30vh minmax(0, 1fr);
  gap: 1vh;
  margin-top: 3.65vh;
}

:deep(.appeals-list) {
  display: grid;
  align-content: start;
  gap: 0.65vh;
}

:deep(.appeals-list__item) {
  min-height: 7vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.35vh;
  padding: 1vh 1.55vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 2vh;
  background: rgb(255 255 255 / 4%);
  box-sizing: border-box;
}

:deep(.appeals-list__item strong) {
  display: flex;
  align-items: center;
  gap: 0.35vh;
  color: #ffffff;
  font-size: 1.05vh;
  line-height: 1.1;
}

:deep(.appeals-list__icon) {
  position: relative;
  width: 1.05vh;
  height: 0.82vh;
  flex: 0 0 auto;
  border-radius: 0.16vh;
  background: #ffffff;
}

:deep(.appeals-list__icon::after) {
  position: absolute;
  left: 0.18vh;
  bottom: -0.28vh;
  width: 0;
  height: 0;
  border-top: 0.34vh solid #ffffff;
  border-right: 0.34vh solid transparent;
  content: "";
}

:deep(.appeals-list__item span) {
  color: rgb(255 255 255 / 68%);
  font-size: 0.86vh;
  line-height: 1.15;
}

:deep(.appeals-list__item b) {
  color: #37d353;
  font-weight: 600;
}

:deep(.appeal-chat) {
  height: 80vh;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 2.25vh 3.2vh 1.9vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 2.7vh;
  background: rgb(255 255 255 / 4%);
  box-sizing: border-box;
}

:deep(.appeal-chat h2) {
  margin: 0;
  color: #ffffff;
  font-size: 1.25vh;
  line-height: 1;
}

:deep(.appeal-chat__messages) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1.55vh;
  margin-top: 1.6vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

:deep(.appeal-chat__messages::-webkit-scrollbar) {
  display: none;
}

:deep(.appeal-chat__messages .appeal-message:first-child) {
  margin-top: auto;
}

:deep(.appeal-message) {
  max-width: 68%;
  display: grid;
  gap: 0.62vh;
}

:deep(.appeal-message--player) {
  align-self: flex-end;
}

:deep(.appeal-message--admin) {
  align-self: flex-start;
}

:deep(.appeal-message__author) {
  display: flex;
  align-items: center;
  gap: 0.8vh;
}

:deep(.appeal-message--player .appeal-message__author) {
  justify-content: flex-end;
}

:deep(.appeal-message--admin .appeal-message__author) {
  justify-content: flex-start;
}

:deep(.appeal-message__author strong) {
  color: #ffffff;
  font-size: 1.72vh;
  font-weight: 600;
  line-height: 1;
}

:deep(.appeal-message__role) {
  min-height: 3.9vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 1.35vh;
  border-radius: 0.85vh;
  color: #ffffff;
  font-size: 1.42vh;
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
}

:deep(.appeal-message__role--player) {
  order: 2;
  background: #9c18bd;
}

:deep(.appeal-message__role--admin) {
  background: #d21010;
}

:deep(.appeal-message p) {
  min-height: 5.25vh;
  display: flex;
  align-items: center;
  margin: 0;
  padding: 1.15vh 1.35vh;
  border-radius: 0.85vh;
  background: #242424;
  color: rgb(255 255 255 / 92%);
  font-size: 1.28vh;
  line-height: 1.2;
}

:deep(.appeal-message--player p) {
  border-bottom-right-radius: 0.25vh;
  background: #33213a;
}

:deep(.appeal-message--admin p) {
  border-bottom-left-radius: 0.25vh;
}

:deep(.appeal-chat__actions) {
  display: flex;
  flex-wrap: wrap;
  gap: 0.95vh;
  margin-top: 1vh;
}

:deep(.appeal-chat__actions button) {
  min-height: 4vh;
  padding: 0 1.2vh;
  border: 0;
  border-radius: 0.7vh;
  background: #111111;
  color: rgb(255 255 255 / 78%);
  cursor: pointer;
  font: inherit;
  font-size: 1.18vh;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

:deep(.appeal-chat__input) {
  min-height: 6vh;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.9vh;
  margin-top: 1.2vh;
  padding: 0.65vh 0.75vh 0.65vh 1.85vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 44%),
    rgb(12 12 13 / 92%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
}

:deep(.appeal-chat__input input) {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #ffffff;
  font: inherit;
  font-size: 1.55vh;
  font-weight: 600;
}

:deep(.appeal-chat__input input::placeholder) {
  color: rgb(255 255 255 / 34%);
  font-weight: 600;
}

:deep(.appeal-chat__attach) {
  width: 4.55vh;
  height: 4.55vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 50%;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 5%)),
    rgb(20 20 22 / 94%);
  color: rgb(255 255 255 / 86%);
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease;
}

:deep(.appeal-chat__attach:hover) {
  border-color: rgb(255 255 255 / 14%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 14%), rgb(255 255 255 / 7%)),
    rgb(26 26 28 / 98%);
  color: #ffffff;
  transform: translateY(-0.08vh);
}

:deep(.appeal-chat__attach svg) {
  width: 1.65vh;
  height: 1.65vh;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.2;
}

:deep(.moderation-layout) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 31vh));
  gap: 3vh;
  margin-top: 3.65vh;
}

:deep(.moderation-column) {
  min-height: 75vh;
  padding: 1.55vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 2.1vh;
  background: rgb(255 255 255 / 4%);
  box-sizing: border-box;
}

:deep(.moderation-column h2) {
  margin: 0 0 1.35vh;
  color: #ffffff;
  font-size: 1.25vh;
  font-weight: 600;
  line-height: 1;
  text-align: center;
}

:deep(.moderation-card) {
  min-height: 9.35vh;
  padding: 1.25vh 1.45vh;
  border-radius: 1vh;
  background: rgb(255 255 255 / 7%);
  box-sizing: border-box;
}

:deep(.moderation-card p) {
  margin: 0;
  color: #ffffff;
  font-size: 1vh;
  line-height: 1.22;
}

:deep(.moderation-card span) {
  color: rgb(255 255 255 / 52%);
}

:deep(.moderation-card__actions) {
  display: flex;
  justify-content: center;
  gap: 0.85vh;
  margin-top: 0.7vh;
}

:deep(.moderation-card__actions button) {
  min-height: 2vh;
  min-width: 5.8vh;
  border: 0;
  border-radius: 0.35vh;
  background: rgb(0 0 0 / 32%);
  color: rgb(255 255 255 / 78%);
  cursor: pointer;
  font: inherit;
  font-size: 0.75vh;
  font-weight: 600;
}

:deep(.moderation-card--graffiti) {
  min-height: 14.8vh;
  display: grid;
  place-items: center;
}

:deep(.moderation-graffiti) {
  width: 19.8vh;
  height: 7.8vh;
  display: block;
  object-fit: contain;
}

:deep(.moderation-card__meta) {
  display: flex;
  gap: 0.2vh;
  margin-top: 0.25vh !important;
}

:deep(.moderation-card__meta b) {
  margin-left: auto;
  color: rgb(255 255 255 / 58%);
  font-weight: 600;
}

:deep(.moderation-card__meta i) {
  color: #ff1d1d;
  font-style: normal;
}

:deep(.property-grid) {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 26.9vh));
  gap: 1.1vh;
  margin-top: 3.85vh;
}

:deep(.property-card) {
  min-height: 17.55vh;
  display: flex;
  flex-direction: column; 
  border: 1px solid rgb(255 255 255 / 3%);
  border-radius: 1.12vh;
  background: rgb(0 0 0 / 72%);
  overflow: hidden;
  box-sizing: border-box;
}

:deep(.property-card--empty) {
  background: rgb(0 0 0 / 62%);
}

:deep(.property-card__media) {
  height: 11.25vh;
  display: grid;
  place-items: center;
  margin: 1.05vh 1.05vh 0;
  border-radius: 0.6vh;
  overflow: hidden;
}

:deep(.property-card__media--house) {
  background: rgb(0 0 0 / 30%);
}

:deep(.property-card__media--vehicle) {
  background:
    radial-gradient(13vh 4vh at 52% 78%, rgb(255 255 255 / 12%), transparent 72%),
    linear-gradient(180deg, rgb(4 5 7 / 12%), rgb(7 8 10 / 18%));
}

:deep(.property-card__image) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

:deep(.property-card__image--house) {
  object-fit: cover;
}

:deep(.property-card__image--vehicle) {
  width: 21.5vh;
  height: auto;
}

:deep(.property-card__info) {
  display: flex;
  flex-direction: column;
  gap: 0.1vh;
  padding: 0.5vh 1.25vh 0.9vh;
}

:deep(.property-card__info--house) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: start;
  column-gap: 1.2vh;
  padding-left: 1.25vh;
}

:deep(.property-card__info strong),
:deep(.property-card__info span) {
  display: block;
  margin: 0;
  color: #ffffff;
  line-height: 1.12;
}

:deep(.property-card__info strong) {
  font-size: 0.9vh;
  font-weight: 600;
}

:deep(.property-card__info span) {
  color: rgb(255 255 255 / 88%);
  font-size: 0.82vh;
  font-weight: 600;
}

:deep(.property-card__info b) {
  color: #ffffff;
  font-weight: 600;
}

:deep(.property-card__info:not(.property-card__info--house) span) {
  color: rgb(255 255 255 / 58%);
}

:deep(.property-card__info--house > div:last-child) {
  padding-top: 0.05vh;
  text-align: right;
}

:deep(.property-card__info--house > div:last-child span) {
  color: rgb(255 255 255 / 58%);
  font-size: 0.82vh;
  white-space: nowrap;
}

.f2-menu-page-enter-active,
.f2-menu-page-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.f2-menu-page-enter-from,
.f2-menu-page-leave-to {
  opacity: 0;
  transform: translateY(0.8vh);
}

@media (max-width: 1100px) {
  .f2-menu__content {
    grid-template-columns: 28vh 1fr;
  }

  :deep(.f2-menu__cards),
  :deep(.f2-menu__cards--wide) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
