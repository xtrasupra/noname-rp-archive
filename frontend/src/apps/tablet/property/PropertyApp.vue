<script setup lang="ts">
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Armchair,
  Boxes,
  Building2,
  Car,
  Check,
  CircleSlash,
  ClipboardList,
  DoorOpen,
  Hammer,
  House,
  KeyRound,
  MapPin,
  Package,
  Search,
  Trash2,
  UserPlus,
  UserRound,
  Wrench,
  X,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'

import TwinkleSelect, { type TwinkleSelectOption } from '@/shared/components/TwinkleSelect.vue'

import type {
  TabletApartment,
  TabletHouse,
  TabletPropertyGarageSlot,
  TabletPropertyKind,
  TabletPropertyLogEntry,
  TabletPropertyStorageItem,
  TabletPropertyTab,
} from '@/shared/contracts/ui'

type TabletProperty = TabletHouse | TabletApartment

const props = defineProps<{
  activeTab: TabletPropertyTab
  kind: TabletPropertyKind
  properties: TabletProperty[]
  selectedProperty: TabletProperty | null
  title: string
}>()

const emit = defineEmits<{
  action: [action: string, payload?: unknown]
  applyInterior: [interiorId: string | number]
  back: []
  close: []
  evictResident: [residentId: string | number]
  route: []
  select: [property: TabletProperty]
  setTab: [tab: TabletPropertyTab]
  toggleLock: []
}>()

const furnitureSearch = ref('')
const furnitureCategory = ref('all')
const furnitureView = ref<'catalog' | 'installed'>('catalog')
const storageCategory = ref('all')
const pendingInteriorId = ref<string | number | null>(null)

const propertyLabel = computed(() => props.kind === 'house' ? 'дом' : 'квартира')
const propertyTitle = computed(() => props.kind === 'house' ? 'Мой дом' : 'Моя квартира')
const listLabel = computed(() => props.kind === 'house' ? 'Список домов' : 'Список квартир')
const emptyLabel = computed(() => props.kind === 'house' ? 'У вас нет дома' : 'У вас нет квартиры')
const propertyIcon = computed(() => props.kind === 'house' ? House : Building2)
const selected = computed(() => props.selectedProperty)
const currentInterior = computed(() =>
  selected.value?.interiors?.find((interior) => interior.current || interior.id === selected.value?.currentInteriorId) ?? null,
)
const installedFurniture = computed(() => selected.value?.furniture?.filter((item) => item.installed) ?? [])
const catalogFurniture = computed(() => selected.value?.furniture?.filter((item) => !item.installed) ?? [])
const furnitureCategories = computed(() => {
  const categories = new Set(selected.value?.furniture?.map((item) => item.category) ?? [])
  return ['all', ...categories]
})
const furnitureCategoryOptions = computed<TwinkleSelectOption[]>(() =>
  furnitureCategories.value.map((category) => ({
    label: category === 'all' ? 'Все категории' : category,
    value: category,
  })),
)
const filteredCatalogFurniture = computed(() => {
  const query = furnitureSearch.value.trim().toLowerCase()

  return catalogFurniture.value.filter((item) => {
    const matchesCategory = furnitureCategory.value === 'all' || item.category === furnitureCategory.value
    const matchesSearch = query.length === 0 || item.title.toLowerCase().includes(query)
    return matchesCategory && matchesSearch
  })
})
const filteredInstalledFurniture = computed(() => {
  const query = furnitureSearch.value.trim().toLowerCase()

  return installedFurniture.value.filter((item) => {
    const matchesCategory = furnitureCategory.value === 'all' || item.category === furnitureCategory.value
    const matchesSearch = query.length === 0 || item.title.toLowerCase().includes(query)
    return matchesCategory && matchesSearch
  })
})
const storageCategories = computed(() => {
  const categories = new Set(selected.value?.storage?.map((item) => item.category) ?? [])
  return ['all', ...categories]
})
const storageCategoryOptions = computed<TwinkleSelectOption[]>(() =>
  storageCategories.value.map((category) => ({
    label: category === 'all' ? 'Все категории' : category,
    value: category,
  })),
)
const filteredStorage = computed(() =>
  (selected.value?.storage ?? []).filter((item) => storageCategory.value === 'all' || item.category === storageCategory.value),
)
const garageSlots = computed(() => selected.value?.garage ?? [])
const garageSlotsUsed = computed(() => selected.value?.garageSlotsUsed ?? garageSlots.value.length)
const garageSlotsTotal = computed(() => selected.value?.garageSlotsTotal ?? garageSlots.value.length)
const garageSlotsFree = computed(() => Math.max(garageSlotsTotal.value - garageSlotsUsed.value, 0))
const hasGarage = computed(() => garageSlotsTotal.value > 0 || garageSlots.value.length > 0)
const storageItems = computed(() => selected.value?.storage ?? [])
const hasStorage = computed(() => (selected.value?.storageMaxWeight ?? 0) > 0 || storageItems.value.length > 0)
const storageWeightLabel = computed(() => `${formatNumber(selected.value?.storageWeight ?? 0)} / ${formatNumber(selected.value?.storageMaxWeight ?? 0)} кг`)
const storageLogs = computed(() =>
  (selected.value?.logs ?? []).filter((entry) => entry.type.includes('storage')),
)
const propertyLogs = computed(() => selected.value?.logs ?? [])
const visiblePropertyActions = computed(() => {
  const property = selected.value

  if (!property) {
    return []
  }

  const actions = (property.actions ?? []).filter((item) => item.id !== 'toggleDoor')
  const canSell = property.saleStatus !== 'forSale' && getOwnerLabel(property) !== 'Государство'

  if (canSell && !actions.some((item) => item.id === 'sell')) {
    return [...actions, { id: 'sell', label: 'Продать', danger: true }]
  }

  return actions
})
const furnitureLimit = computed(() => currentInterior.value?.furnitureLimit ?? selected.value?.interiors?.[0]?.furnitureLimit ?? 0)
const furnitureLimitReached = computed(() => furnitureLimit.value > 0 && installedFurniture.value.length >= furnitureLimit.value)
const furnitureInstallBlockReason = computed(() => {
  const property = selected.value

  if (!property) {
    return 'Объект не выбран'
  }

  if (!currentInterior.value) {
    return 'Нельзя установить мебель вне интерьера'
  }

  if (furnitureLimitReached.value) {
    return 'Превышен лимит мебели'
  }

  if (property.settings?.canInstallFurniture === false) {
    return property.settings.blockedReason ?? 'Установка мебели запрещена'
  }

  if ((property.settings?.furnitureInstallCooldownRemaining ?? 0) > 0) {
    return `Подождите ${property.settings?.furnitureInstallCooldownRemaining} сек. перед следующей установкой`
  }

  return ''
})
const enterBlockReason = computed(() => {
  if (!selected.value) {
    return 'Объект не выбран'
  }

  return ''
})
const storageBlockReason = computed(() => {
  const property = selected.value

  if (!property) {
    return 'Объект не выбран'
  }

  if (property.settings?.canUseStorage === false) {
    return property.settings.blockedReason ?? 'Нет доступа к складу'
  }

  return ''
})
const garageBlockReason = computed(() => {
  const property = selected.value

  if (!property) {
    return 'Объект не выбран'
  }

  if (property.settings?.canUseGarage === false) {
    return property.settings.blockedReason ?? 'Нет доступа к гаражу'
  }

  return ''
})
const garageParkBlockReason = computed(() => {
  if (garageBlockReason.value) {
    return garageBlockReason.value
  }

  if (!hasGarage.value) {
    return 'Гараж для объекта не подключен'
  }

  if (garageSlotsFree.value <= 0) {
    return 'Нет свободных мест в гараже'
  }

  return ''
})

const tabs: Array<{ id: TabletPropertyTab; label: string; icon: typeof ClipboardList }> = [
  { id: 'overview', label: 'Обзор', icon: ClipboardList },
  { id: 'interior', label: 'Интерьер', icon: DoorOpen },
  { id: 'furniture', label: 'Мебель', icon: Armchair },
  { id: 'garage', label: 'Гараж', icon: Car },
  { id: 'storage', label: 'Склад', icon: Package },
  { id: 'access', label: 'Доступы', icon: KeyRound },
  { id: 'logs', label: 'Логи', icon: Boxes },
]

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value)
}

function formatMoney(value?: number) {
  return `$${formatNumber(value ?? 0)}`
}

function getPropertyTypeLabel(property: TabletProperty) {
  const type = property.propertyType ?? props.kind
  return type === 'house' ? 'Дом' : 'Квартира'
}

function getOwnerLabel(property: TabletProperty) {
  return property.owner || 'Государство'
}

function getDoorLabel(property: TabletProperty) {
  return property.doorStatus === 'open' || !property.locked ? 'Открыта' : 'Закрыта'
}

function getSaleStatusLabel(property: TabletProperty) {
  if (property.saleStatus === 'forSale' || getOwnerLabel(property) === 'Государство') {
    return 'Продаётся'
  }

  return getDoorLabel(property)
}

function getPrimaryActionLabel(property: TabletProperty) {
  return property.saleStatus === 'forSale' || getOwnerLabel(property) === 'Государство' ? 'Купить' : 'Войти'
}

function getFurnitureCountLabel(property: TabletProperty) {
  const currentInterior = property.interiors?.find((interior) => interior.current || interior.id === property.currentInteriorId)
  const furnitureLimit = currentInterior?.furnitureLimit ?? property.interiors?.[0]?.furnitureLimit ?? 0
  const installedCount = property.furniture?.filter((item) => item.installed).length ?? 0

  return `${installedCount} / ${furnitureLimit || '∞'}`
}

function getResidentsCountLabel(property: TabletProperty) {
  return `${property.residents.length} / ${property.residentLimit}`
}

function getVectorLabel(vector?: { x: number; y: number; z: number }) {
  if (!vector) {
    return 'Не задано'
  }

  return `${vector.x}, ${vector.y}, ${vector.z}`
}

function getGarageLabel(property: TabletProperty) {
  const total = property.garageSlotsTotal ?? property.garage?.length ?? 0
  return total > 0 ? `${total} мест` : 'Нет'
}

function getStorageLabel(property: TabletProperty) {
  return (property.storageMaxWeight ?? 0) > 0 ? `${formatNumber(property.storageMaxWeight ?? 0)} кг` : 'Нет'
}


function getGarageStatusLabel(status: string) {
  const labels: Record<string, string> = {
    blocked: 'Заблокирован',
    outside: 'Вне гаража',
    stored: 'В гараже',
  }

  return labels[status] ?? status
}

function getLogTitle(entry: TabletPropertyLogEntry) {
  const titles: Record<string, string> = {
    'access-grant': 'Выдача доступа',
    'access-revoke': 'Отзыв доступа',
    'door-close': 'Закрытие двери',
    'door-open': 'Открытие двери',
    exit: 'Выход',
    'furniture-install': 'Установка мебели',
    'furniture-move': 'Перемещение мебели',
    'furniture-remove': 'Удаление мебели',
    'garage-park': 'Действие с гаражом',
    'garage-take': 'Действие с гаражом',
    'interior-change': 'Смена интерьера',
    'storage-put': 'Действие со складом',
    'storage-take': 'Действие со складом',
  }

  return titles[entry.type] ?? entry.title
}

function getLogDetails(entry: TabletPropertyLogEntry) {
  return entry.details ?? entry.type
}

function getGarageOwnerLabel(slot: TabletPropertyGarageSlot) {
  return slot.owner || 'Не указан'
}

function getGarageAccessLabel(slot: TabletPropertyGarageSlot) {
  return slot.access || 'Не настроен'
}

function getGaragePreviewImage(slot: TabletPropertyGarageSlot) {
  return slot.image ?? slot.preview ?? ''
}

function getGarageTakeBlockReason(slot: TabletPropertyGarageSlot) {
  if (garageBlockReason.value) {
    return garageBlockReason.value
  }

  if (slot.status !== 'stored') {
    return 'Транспорт не находится в гараже'
  }

  return ''
}

function canTakeGarageVehicle(slot: TabletPropertyGarageSlot) {
  return getGarageTakeBlockReason(slot).length === 0
}

function selectProperty(property: TabletProperty) {
  emit('select', property)
}

function getActionBlockReason(actionName: string) {
  if (actionName === 'enter') {
    return enterBlockReason.value
  }

  if (actionName === 'furniture:install') {
    return furnitureInstallBlockReason.value
  }

  if (actionName.startsWith('storage:')) {
    return storageBlockReason.value
  }

  if (actionName === 'garage:park') {
    return garageParkBlockReason.value
  }

  if (actionName.startsWith('garage:')) {
    return garageBlockReason.value
  }

  return ''
}

function isActionBlocked(actionName: string) {
  return getActionBlockReason(actionName).length > 0
}

function action(actionName: string, payload?: unknown) {
  if (isActionBlocked(actionName)) {
    return
  }

  emit('action', actionName, payload)
}

function requestInteriorApply(interiorId: string | number) {
  pendingInteriorId.value = interiorId
}

function cancelInteriorApply() {
  pendingInteriorId.value = null
}

function confirmInteriorApply() {
  if (pendingInteriorId.value == null) {
    return
  }

  emit('applyInterior', pendingInteriorId.value)
  pendingInteriorId.value = null
}

function enterGarage() {
  if (garageBlockReason.value || !hasGarage.value) {
    return
  }

  emit('action', 'garage:enter')
}

function parkGarageVehicle() {
  if (garageParkBlockReason.value) {
    return
  }

  emit('action', 'garage:park')
}

function takeGarageVehicle(slot: TabletPropertyGarageSlot) {
  if (!canTakeGarageVehicle(slot)) {
    return
  }

  emit('action', 'garage:take', { slotId: slot.id, vehicleName: slot.vehicleName, plate: slot.plate })
}

function openGarageAccessSettings(slot: TabletPropertyGarageSlot) {
  if (garageBlockReason.value) {
    return
  }

  emit('action', 'garage:access', { slotId: slot.id, vehicleName: slot.vehicleName, plate: slot.plate })
}

function putStorageItem(item: TabletPropertyStorageItem) {
  if (storageBlockReason.value) {
    return
  }

  emit('action', 'storage:put', { itemId: item.id, title: item.title, category: item.category })
}

function takeStorageItem(item: TabletPropertyStorageItem) {
  if (storageBlockReason.value) {
    return
  }

  emit('action', 'storage:take', { itemId: item.id, title: item.title, category: item.category })
}

function canInstallFurniture() {
  return furnitureInstallBlockReason.value.length === 0
}
</script>

<template>
  <section class="property-app" :class="`property-app--${kind}`" :aria-label="propertyTitle">
    <header class="property-app__header">
      <div class="property-app__title">
        <button
          v-if="selected"
          class="property-app__icon-button"
          type="button"
          aria-label="Назад"
          @click="emit('back')"
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <h1>{{ title }}</h1>
          <p>{{ selected ? selected.address : `Выберите ${propertyLabel}` }}</p>
        </div>
      </div>

      <button class="property-app__icon-button" type="button" aria-label="Закрыть" @click="emit('close')">
        <X aria-hidden="true" />
      </button>
    </header>

    <div v-if="!selected" class="property-app__list" :aria-label="listLabel">
      <section v-if="properties.length === 0" class="property-empty">
        <component :is="propertyIcon" aria-hidden="true" />
        <strong>{{ emptyLabel }}</strong>
        <p>Когда недвижимость появится у персонажа, она будет отображаться в этом приложении.</p>
      </section>

      <button
        v-for="property in properties"
        v-else
        :key="property.id"
        class="property-card"
        type="button"
        @click="selectProperty(property)"
      >
        <span class="property-card__media" :style="property.image ? { '--property-image': `url(${property.image})` } : undefined">
          <strong>#{{ property.number }}</strong>
          <small>{{ getPropertyTypeLabel(property) }}</small>
        </span>
        <span class="property-card__body">
          <span class="property-card__heading">
            <strong>{{ property.title }}</strong>
            <b>{{ getPrimaryActionLabel(property) }}</b>
          </span>
          <span class="property-card__address"><MapPin aria-hidden="true" />{{ property.address }}</span>
          <span class="property-card__facts">
            <span><b>Владелец</b>{{ getOwnerLabel(property) }}</span>
            <span><b>Оплачено до</b>{{ property.paidUntil }}</span>
            <span><b>Дверь</b>{{ getDoorLabel(property) }}</span>
            <span><b>Статус</b>{{ getSaleStatusLabel(property) }}</span>
            <span><b>Мебель</b>{{ getFurnitureCountLabel(property) }}</span>
            <span><b>Жильцы</b>{{ getResidentsCountLabel(property) }}</span>
            <span><b>Гараж</b>{{ getGarageLabel(property) }}</span>
            <span><b>Склад</b>{{ getStorageLabel(property) }}</span>
          </span>
        </span>
      </button>
    </div>

    <div v-else class="property-details">
      <aside class="property-sidebar">
        <div class="property-sidebar__media" :style="selected.image ? { '--property-image': `url(${selected.image})` } : undefined">
          <strong>#{{ selected.number }}</strong>
          <span>{{ getPropertyTypeLabel(selected) }}</span>
        </div>

        <div class="property-sidebar__facts">
          <article>
            <span>Владелец</span>
            <strong>{{ getOwnerLabel(selected) }}</strong>
          </article>
          <article>
            <span>Дверь</span>
            <strong>{{ getDoorLabel(selected) }}</strong>
          </article>
          <article>
            <span>Оплачено до</span>
            <strong>{{ selected.paidUntil }}</strong>
          </article>
        </div>

        <div class="property-sidebar__actions">
          <button
            type="button"
            :class="{ 'property-sidebar__lock-button--locked': selected.locked }"
            @click="emit('toggleLock')"
          >
            <component :is="selected.locked ? Check : CircleSlash" aria-hidden="true" />
            <span>{{ selected.locked ? 'Закрыто' : 'Закрыть' }}</span>
          </button>
          <button type="button" @click="emit('route')">
            <MapPin aria-hidden="true" />
            <span>Маршрут</span>
          </button>
        </div>
      </aside>

      <section class="property-panel">
        <nav class="property-tabs" aria-label="Разделы недвижимости">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="property-tabs__tab"
            :class="{ 'property-tabs__tab--active': activeTab === tab.id }"
            type="button"
            @click="emit('setTab', tab.id)"
          >
            <component :is="tab.icon" aria-hidden="true" />
            <span>{{ tab.label }}</span>
          </button>
        </nav>

        <div class="property-panel__content">
          <section v-if="activeTab === 'overview'" class="property-section">
            <div class="property-stats">
              <article><span>ID объекта</span><strong>{{ selected.id }}</strong></article>
              <article><span>Тип объекта</span><strong>{{ getPropertyTypeLabel(selected) }}</strong></article>
              <article><span>Владелец</span><strong>{{ getOwnerLabel(selected) }}</strong></article>
              <article><span>Гос цена</span><strong>{{ formatMoney(selected.price) }}</strong></article>
              <article><span>Статус</span><strong>{{ getSaleStatusLabel(selected) }}</strong></article>
              <article><span>Статус двери</span><strong>{{ getDoorLabel(selected) }}</strong></article>
              <article><span>Интерьер</span><strong>{{ currentInterior?.title ?? 'Не выбран' }}</strong></article>
              <article><span>Количество мебели</span><strong>{{ installedFurniture.length }} / {{ furnitureLimit || '∞' }}</strong></article>
              <article><span>Подселённые игроки</span><strong>{{ selected.residents.length }} / {{ selected.residentLimit }}</strong></article>
              <article><span>Наличие гаража</span><strong>{{ getGarageLabel(selected) }}</strong></article>
              <article><span>Наличие склада</span><strong>{{ hasStorage ? `${storageWeightLabel} / ${getStorageLabel(selected)}` : 'Нет' }}</strong></article>
            </div>

            <div class="property-actions">
              <h2>Доступные действия</h2>
              <button
                v-for="item in visiblePropertyActions"
                :key="item.id"
                type="button"
                :class="{ 'property-actions__button--danger': item.danger }"
                :disabled="item.disabled || isActionBlocked(item.id)"
                :title="item.disabledReason ?? getActionBlockReason(item.id)"
                @click="action(item.id)"
              >
                {{ item.label }}
              </button>
              <p v-if="visiblePropertyActions.length === 0" class="property-empty-row">Нет доступных действий.</p>
            </div>
          </section>

          <section v-else-if="activeTab === 'interior'" class="property-section property-section--interior">
            <header class="interior-hero">
              <div class="interior-hero__preview" :style="currentInterior?.preview ? { '--property-image': `url(${currentInterior.preview})` } : undefined">
                <span>Текущий интерьер</span>
              </div>
              <div class="interior-hero__body">
                <span>Текущий интерьер</span>
                <strong>{{ currentInterior?.title ?? 'Не выбран' }}</strong>
                <p>{{ currentInterior ? `Лимит мебели ${currentInterior.furnitureLimit}. Установлено ${installedFurniture.length}.` : 'Выберите интерьер, чтобы открыть установку мебели.' }}</p>
              </div>
              <b>{{ installedFurniture.length }} / {{ furnitureLimit || 0 }} мебели</b>
            </header>

            <div class="interior-section-title">
              <div>
                <span>Каталог интерьеров</span>
                <strong>Доступные интерьеры</strong>
              </div>
              <small>{{ selected.interiors?.length ?? 0 }} вариантов</small>
            </div>
            <div class="interior-grid">
              <article v-for="interior in selected.interiors ?? []" :key="interior.id" class="interior-card">
                <span class="interior-card__preview" :style="interior.preview ? { '--property-image': `url(${interior.preview})` } : undefined">
                  <small>Превью интерьера</small>
                </span>
                <div>
                  <strong>{{ interior.title }}</strong>
                  <span>Цена смены: {{ formatMoney(interior.price) }}</span>
                  <span>Лимит мебели: {{ interior.furnitureLimit }}</span>
                </div>
                <button
                  type="button"
                  :disabled="interior.current || interior.available === false"
                  @click="requestInteriorApply(interior.id)"
                >
                  {{ interior.current ? 'Выбран' : 'Применить' }}
                </button>
              </article>
              <p v-if="!selected.interiors?.length" class="property-empty-row">Интерьеры недоступны.</p>
            </div>
          </section>

          <section v-else-if="activeTab === 'furniture'" class="property-section">
            <div class="property-toolbar">
              <label>
                <Search aria-hidden="true" />
                <input v-model="furnitureSearch" type="search" placeholder="Поиск мебели" />
              </label>
              <div class="property-select property-select--twinkle">
                <span>Категории</span>
                <TwinkleSelect v-model="furnitureCategory" :options="furnitureCategoryOptions" aria-label="Категории мебели" />
              </div>
              <div class="furniture-toggle" role="tablist" aria-label="Раздел мебели">
                <button
                  type="button"
                  role="tab"
                  :class="{ 'furniture-toggle__button--active': furnitureView === 'catalog' }"
                  :aria-selected="furnitureView === 'catalog'"
                  @click="furnitureView = 'catalog'"
                >
                  Каталог
                </button>
                <button
                  type="button"
                  role="tab"
                  :class="{ 'furniture-toggle__button--active': furnitureView === 'installed' }"
                  :aria-selected="furnitureView === 'installed'"
                  @click="furnitureView = 'installed'"
                >
                  Моя мебель
                </button>
              </div>
            </div>

            <div class="furniture-layout">
              <section v-if="furnitureView === 'catalog'" class="furniture-block">
                <h2>Каталог мебели</h2>
                <div class="furniture-grid">
                  <article v-for="item in filteredCatalogFurniture" :key="item.id" class="furniture-card">
                    <div class="furniture-card__preview" :style="item.image ? { '--furniture-image': `url(${item.image})` } : undefined">
                      <Armchair aria-hidden="true" />
                      <span>{{ item.category }}</span>
                    </div>
                    <div class="furniture-card__body">
                      <header>
                        <strong>{{ item.title }}</strong>
                        <span>{{ formatMoney(item.price) }}</span>
                      </header>
                      <div class="furniture-card__details furniture-card__details--compact">
                        <span><b>Категория</b>{{ item.category }}</span>
                        <span><b>Модель</b>{{ item.model ?? 'Не задана' }}</span>
                      </div>
                    </div>
                    <div class="furniture-card__actions">
                      <button
                        type="button"
                        :disabled="!canInstallFurniture() || item.canInstall === false"
                        :title="item.canInstall === false ? 'Этот предмет нельзя установить' : furnitureInstallBlockReason"
                        @click="action('furniture:install', { furnitureId: item.id })"
                      >
                        <Hammer aria-hidden="true" />
                        Установить
                      </button>
                    </div>
                  </article>
                </div>
                <p v-if="filteredCatalogFurniture.length === 0" class="property-empty-row">В каталоге ничего не найдено.</p>
              </section>

              <section v-else class="furniture-block">
                <h2>Моя мебель</h2>
                <div class="furniture-grid">
                  <article v-for="item in filteredInstalledFurniture" :key="item.id" class="furniture-card">
                    <div class="furniture-card__preview" :style="item.image ? { '--furniture-image': `url(${item.image})` } : undefined">
                      <Armchair aria-hidden="true" />
                      <span>{{ item.room ?? item.category }}</span>
                    </div>
                    <div class="furniture-card__body">
                      <header>
                        <strong>{{ item.title }}</strong>
                        <span :class="{ 'furniture-card__status--inactive': item.active === false }">{{ item.active === false ? 'Неактивна' : 'Активна' }}</span>
                      </header>
                      <div class="furniture-card__details">
                        <span><b>Комната</b>{{ item.room ?? item.category }}</span>
                        <span><b>Модель</b>{{ item.model ?? 'Не задана' }}</span>
                        <span><b>Координаты</b>{{ getVectorLabel(item.position) }}</span>
                        <span><b>Поворот</b>{{ getVectorLabel(item.rotation) }}</span>
                        <span><b>Установил</b>{{ item.installedBy ?? 'Не указано' }}</span>
                        <span><b>Дата</b>{{ item.installedAt ?? 'Не указана' }}</span>
                      </div>
                    </div>
                    <div class="furniture-card__actions">
                      <button type="button" @click="action('furniture:move', { furnitureId: item.id })">
                        <Wrench aria-hidden="true" />
                        Переместить
                      </button>
                      <button type="button" class="row-card__danger" @click="action('furniture:remove', { furnitureId: item.id })">
                        <Trash2 aria-hidden="true" />
                        Удалить
                      </button>
                    </div>
                  </article>
                </div>
                <p v-if="filteredInstalledFurniture.length === 0" class="property-empty-row">Мебель пока не установлена.</p>
              </section>
            </div>
          </section>

          <section v-else-if="activeTab === 'garage'" class="property-section">
            <header class="property-section__header">
              <div>
                <span>Количество мест</span>
                <strong>{{ garageSlotsUsed }} / {{ garageSlotsTotal }}</strong>
              </div>
              <div>
                <span>Свободно</span>
                <strong>{{ garageSlotsFree }}</strong>
              </div>
              <button type="button" :disabled="Boolean(garageBlockReason) || !hasGarage" :title="garageBlockReason" @click="enterGarage">Войти в гараж</button>
              <button type="button" :disabled="Boolean(garageParkBlockReason)" :title="garageParkBlockReason" @click="parkGarageVehicle">Поставить транспорт</button>
            </header>

            <h2>Список транспорта</h2>
            <article v-for="slot in garageSlots" :key="slot.id" class="garage-card">
              <div class="garage-card__preview">
                <img v-if="getGaragePreviewImage(slot)" :src="getGaragePreviewImage(slot)" :alt="slot.vehicleName" />
                <span v-else class="garage-card__vehicle-mock" aria-hidden="true"></span>
                <b>{{ getGarageStatusLabel(slot.status) }}</b>
              </div>

              <div class="garage-card__content">
                <header>
                  <div>
                    <strong>{{ slot.vehicleName }}</strong>
                    <span>{{ slot.plate }}</span>
                  </div>
                  <b>{{ getGarageStatusLabel(slot.status) }}</b>
                </header>

                <div class="garage-card__facts">
                  <span><b>Владелец</b>{{ getGarageOwnerLabel(slot) }}</span>
                  <span><b>Доступ</b>{{ getGarageAccessLabel(slot) }}</span>
                  <span><b>Место</b>{{ slot.id }}</span>
                </div>
              </div>

              <div class="garage-card__actions">
                <button
                  type="button"
                  :disabled="!canTakeGarageVehicle(slot)"
                  :title="getGarageTakeBlockReason(slot)"
                  @click="takeGarageVehicle(slot)"
                >
                  Достать
                </button>
                <button type="button" :disabled="Boolean(garageBlockReason)" :title="garageBlockReason" @click="openGarageAccessSettings(slot)">Доступ</button>
              </div>
            </article>
            <p v-if="garageSlots.length === 0" class="property-empty-row">Гараж для объекта не подключен.</p>
          </section>

          <section v-else-if="activeTab === 'storage'" class="property-section">
            <header class="property-section__header">
              <div>
                <span>Текущий вес</span>
                <strong>{{ formatNumber(selected.storageWeight ?? 0) }} кг</strong>
              </div>
              <div>
                <span>Максимальный вес</span>
                <strong>{{ formatNumber(selected.storageMaxWeight ?? 0) }} кг</strong>
              </div>
              <div class="property-select property-select--twinkle">
                <span>Категории предметов</span>
                <TwinkleSelect v-model="storageCategory" :options="storageCategoryOptions" aria-label="Категории предметов" />
              </div>
              <button type="button" :disabled="Boolean(storageBlockReason)" :title="storageBlockReason" @click="action('storage:access')">Настроить доступ</button>
            </header>

            <div class="storage-layout">
              <section class="storage-items-block">
                <h2>Список предметов</h2>
                <article v-for="item in filteredStorage" :key="item.id" class="row-card storage-item-row">
                  <span class="storage-item-row__preview"><img src="/cube-icon.png" :alt="item.title" /></span>
                  <div class="storage-item-row__content">
                    <header>
                      <strong>{{ item.title }} x{{ item.amount }}</strong>
                      <span>{{ item.category }}</span>
                    </header>
                    <div class="storage-item-row__facts">
                      <span><b>Категория</b>{{ item.category }}</span>
                      <span><b>Вес</b>{{ formatNumber(item.weight * item.amount) }} кг</span>
                      <span><b>Кол-во</b>{{ item.amount }}</span>
                    </div>
                  </div>
                  <div class="storage-item-row__actions">
                    <button type="button" :disabled="Boolean(storageBlockReason)" :title="storageBlockReason" @click="putStorageItem(item)">
                      <ArrowDownLeft aria-hidden="true" />
                      Положить
                    </button>
                    <button type="button" :disabled="Boolean(storageBlockReason)" :title="storageBlockReason" @click="takeStorageItem(item)">
                      <ArrowUpRight aria-hidden="true" />
                      Забрать
                    </button>
                  </div>
                </article>
                <p v-if="filteredStorage.length === 0" class="property-empty-row">Склад пуст или недоступен.</p>
              </section>

              <section class="storage-history-table">
                <h2>История действий</h2>
                <div v-if="storageLogs.length" class="storage-history-table__grid" role="table">
                  <div class="storage-history-table__head" role="row">
                    <span>Дата</span>
                    <span>Действие</span>
                    <span>Игрок</span>
                    <span>Детали</span>
                  </div>
                  <article v-for="entry in storageLogs" :key="entry.id" class="storage-history-table__row" role="row">
                    <span>{{ entry.createdAt }}</span>
                    <strong>{{ entry.title }}</strong>
                    <span>{{ entry.actor ?? 'Система' }}</span>
                    <p>{{ getLogDetails(entry) }}</p>
                  </article>
                </div>
                <p v-else class="property-empty-row">История склада пока пустая.</p>
              </section>
            </div>
          </section>

          <section v-else-if="activeTab === 'access'" class="property-section">
            <header class="property-section__header">
              <div>
                <span>Список игроков с доступом</span>
                <strong>{{ selected.access?.length ?? 0 }}</strong>
              </div>
              <button type="button" @click="action('access:add')">
                <UserPlus aria-hidden="true" />
                Выдать доступ
              </button>
            </header>

            <article v-for="entry in selected.access ?? []" :key="entry.id" class="row-card">
              <UserRound aria-hidden="true" />
              <div>
                <strong>{{ entry.name }} · Static {{ entry.static }}</strong>
                <span>Роль: {{ entry.role }}</span>
                <span>Права: {{ entry.rights.join(', ') }}</span>
              </div>
              <button type="button" @click="action('access:edit', { accessId: entry.id })">Изменить доступ</button>
              <button type="button" class="row-card__danger" @click="action('access:remove', { accessId: entry.id })">Удалить доступ</button>
            </article>
            <p v-if="!selected.access?.length" class="property-empty-row">Дополнительные доступы не выданы.</p>
          </section>

          <section v-else-if="activeTab === 'logs'" class="property-section property-logs">
            <article v-for="entry in propertyLogs" :key="entry.id" class="log-row">
              <span>{{ entry.createdAt }}</span>
              <div>
                <strong>{{ getLogTitle(entry) }}</strong>
                <p>{{ entry.actor ? `${entry.actor}: ` : '' }}{{ getLogDetails(entry) }}</p>
              </div>
            </article>
            <p v-if="propertyLogs.length === 0" class="property-empty-row">Логи пока пустые.</p>
          </section>
        </div>
      </section>
    </div>

    <div v-if="pendingInteriorId != null" class="property-confirm-modal" role="dialog" aria-modal="true" aria-label="Подтверждение смены интерьера">
      <section class="property-confirm-modal__panel">
        <strong>Сменить интерьер?</strong>
        <p>Старая мебель будет убрана из помещения и сохранена в хранилище. После подтверждения интерьер будет обновлён, а помещение пересоздано.</p>
        <div>
          <button type="button" @click="cancelInteriorApply">Отмена</button>
          <button type="button" @click="confirmInteriorApply">Подтвердить</button>
        </div>
      </section>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.property-app {
  --property-accent: #ac2ecd;
  --property-accent-soft: rgb(172 46 205 / 14%);

  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: px-to-vh(18);
  padding: px-to-vh(24) px-to-vh(28);
  background:
    radial-gradient(56vh 34vh at 84% 4%, rgb(172 46 205 / 12%), transparent 72%),
    linear-gradient(145deg, #080a0f 0%, #111622 48%, #08090e 100%);
  color: #ffffff;
  box-sizing: border-box;
}

.property-app__header,
.property-app__title,
.property-sidebar__actions,
.property-tabs,
.property-toolbar,
.property-section__header,
.row-card {
  display: flex;
  align-items: center;
}

.property-app__header {
  justify-content: space-between;
  gap: px-to-vh(18);
}

.property-app__title {
  min-width: 0;
  gap: px-to-vh(12);
}

.property-app__title h1,
.property-app__title p,
.property-card__body strong,
.property-card__body span,
.property-section h2,
.property-logs p {
  margin: 0;
}

.property-app__title h1 {
  overflow: hidden;
  font-size: px-to-vh(27);
  font-weight: 900;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.property-app__title p {
  margin-top: px-to-vh(5);
  color: rgb(255 255 255 / 58%);
  font-size: px-to-vh(13);
  font-weight: 650;
}

.property-app__icon-button {
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

.property-app__icon-button:hover,
.property-app__icon-button:focus-visible,
.property-sidebar__actions button:hover,
.property-tabs__tab:hover,
.property-tabs__tab--active,
.property-actions button:hover,
.row-card button:hover,
.property-section__header > button:hover {
  border-color: rgb(172 46 205 / 42%);
  background: var(--property-accent-soft);
  outline: none;
}

.property-app__icon-button svg,
.property-sidebar svg,
.property-tabs svg,
.row-card svg,
.property-section__header button svg,
.property-toolbar svg {
  width: px-to-vh(18);
  height: px-to-vh(18);
  flex: 0 0 auto;
}

.property-app__list {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: px-to-vh(16);
  overflow-y: auto;
  padding-right: px-to-vh(4);
}

.property-building-list {
  min-height: 0;
  display: grid;
  align-content: start;
  gap: px-to-vh(14);
  overflow-y: auto;
  padding-right: px-to-vh(4);
}

.property-building {
  min-width: 0;
  display: grid;
  gap: px-to-vh(12);
  padding: px-to-vh(14);
  border: px-to-vh(1) solid rgb(255 255 255 / 9%);
  border-radius: px-to-vh(10);
  background: rgb(255 255 255 / 5%);
}

.property-building__header,
.property-building__row {
  min-width: 0;
  display: grid;
  grid-template-columns: 1.1fr 1.4fr 0.8fr 0.8fr 0.9fr 0.8fr;
  align-items: center;
  gap: px-to-vh(10);
}

.property-building__header {
  grid-template-columns: minmax(0, 1fr) auto;
}

.property-building__header span,
.property-building__row--head span {
  color: rgb(255 255 255 / 52%);
  font-size: px-to-vh(11);
  font-weight: 850;
}

.property-building__header strong {
  display: block;
  margin-top: px-to-vh(4);
  color: #ffffff;
  font-size: px-to-vh(19);
  font-weight: 950;
}

.property-building__header b {
  padding: px-to-vh(8) px-to-vh(11);
  border-radius: px-to-vh(999);
  background: var(--property-accent-soft);
  color: var(--property-accent);
  font-size: px-to-vh(12);
}

.property-building__table {
  display: grid;
  gap: px-to-vh(7);
}

.property-building__row {
  width: 100%;
  min-height: px-to-vh(44);
  padding: 0 px-to-vh(11);
  border: px-to-vh(1) solid rgb(255 255 255 / 8%);
  border-radius: px-to-vh(8);
  background: rgb(0 0 0 / 16%);
  color: #ffffff;
  font: inherit;
  text-align: left;
}

.property-building__row:not(.property-building__row--head) {
  cursor: pointer;
}

.property-building__row:not(.property-building__row--head):hover,
.property-building__row:not(.property-building__row--head):focus-visible {
  border-color: rgb(172 46 205 / 42%);
  background: var(--property-accent-soft);
  outline: none;
}

.property-building__row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.property-building__row--head {
  min-height: px-to-vh(34);
  background: transparent;
  border-color: rgb(255 255 255 / 5%);
}

.property-card {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, px-to-vh(220)) minmax(0, 1fr);
  padding: 0;
  border: px-to-vh(1) solid rgb(255 255 255 / 10%);
  border-radius: px-to-vh(8);
  overflow: hidden;
  background: rgb(255 255 255 / 6%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.property-card:hover,
.property-card:focus-visible {
  border-color: rgb(172 46 205 / 42%);
  background: var(--property-accent-soft);
  outline: none;
}

.property-card__media,
.property-sidebar__media,
.interior-card__preview {
  background:
    linear-gradient(180deg, rgb(0 0 0 / 12%), rgb(0 0 0 / 76%)),
    var(--property-image, url('/property/house.png')) center / cover no-repeat;
}

.property-card__media {
  min-height: px-to-vh(150);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: px-to-vh(14);
}

.property-card__media strong,
.property-sidebar__media strong {
  font-size: px-to-vh(36);
  font-weight: 950;
  line-height: 0.95;
  text-shadow: 0 px-to-vh(4) px-to-vh(16) rgb(0 0 0 / 48%);
}

.property-card__media small,
.property-sidebar__media span {
  width: fit-content;
  padding: px-to-vh(7) px-to-vh(9);
  border-radius: px-to-vh(6);
  background: rgb(3 8 14 / 74%);
  color: rgb(255 255 255 / 84%);
  font-size: px-to-vh(12);
  font-weight: 850;
}

.property-card__body {
  min-width: 0;
  display: grid;
  gap: px-to-vh(11);
  padding: px-to-vh(15);
}

.property-card__body strong,
.row-card strong,
.property-logs strong {
  overflow: hidden;
  color: #ffffff;
  font-size: px-to-vh(14);
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.property-card__body > span {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: px-to-vh(7);
  color: rgb(255 255 255 / 62%);
  font-size: px-to-vh(12);
  font-weight: 700;
}

.property-card__meta {
  flex-wrap: wrap;
}

.property-card__meta b,
.property-section__header b {
  padding: px-to-vh(7) px-to-vh(10);
  border: px-to-vh(1) solid rgb(172 46 205 / 18%);
  border-radius: px-to-vh(999);
  background: var(--property-accent-soft);
  color: var(--property-accent);
  font-size: px-to-vh(12);
  font-weight: 900;
}

.property-empty,
.property-empty-row {
  min-height: px-to-vh(160);
  display: grid;
  place-items: center;
  align-content: center;
  gap: px-to-vh(10);
  border: px-to-vh(1) dashed rgb(172 46 205 / 24%);
  border-radius: px-to-vh(10);
  background:
    linear-gradient(135deg, rgb(172 46 205 / 8%), transparent 55%),
    rgb(0 0 0 / 12%);
  color: rgb(255 255 255 / 58%);
  text-align: center;
}

.property-empty {
  grid-column: 1 / -1;
  min-height: px-to-vh(420);
}

.property-empty svg {
  width: px-to-vh(44);
  height: px-to-vh(44);
  color: var(--property-accent);
}

.property-empty strong {
  color: #ffffff;
  font-size: px-to-vh(20);
  font-weight: 900;
}

.property-empty p,
.property-empty-row {
  margin: 0;
  font-size: px-to-vh(13);
  font-weight: 750;
}

.property-details {
  min-height: 0;
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(0, px-to-vh(330)) minmax(0, 1fr);
  gap: px-to-vh(16);
}

.property-sidebar,
.property-panel {
  min-width: 0;
  min-height: 0;
  border: px-to-vh(1) solid rgb(255 255 255 / 9%);
  border-radius: px-to-vh(10);
  background: rgb(255 255 255 / 5%);
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 3%);
}

.property-sidebar {
  overflow: hidden;
}

.property-sidebar__media {
  min-height: px-to-vh(210);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: px-to-vh(16);
}

.property-sidebar__facts {
  display: grid;
  gap: px-to-vh(8);
  padding: px-to-vh(14);
}

.property-sidebar__facts article {
  display: grid;
  gap: px-to-vh(4);
  padding: px-to-vh(10);
  border-radius: px-to-vh(8);
  background: rgb(0 0 0 / 18%);
}

.property-sidebar__facts span,
.row-card span,
.property-section__header span,
.property-logs span {
  color: rgb(255 255 255 / 52%);
  font-size: px-to-vh(12);
  font-weight: 750;
}

.property-sidebar__facts strong,
.property-section__header strong {
  overflow: hidden;
  color: #ffffff;
  font-size: px-to-vh(14);
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.property-sidebar__actions {
  display: grid;
  gap: px-to-vh(8);
  padding: 0 px-to-vh(14) px-to-vh(14);
}

.property-sidebar__actions button,
.property-tabs__tab,
.property-actions button,
.row-card button,
.property-section__header > button,
.property-select,
.property-section__header select,
.property-toolbar select,
.property-toolbar label {
  min-width: 0;
  min-height: px-to-vh(38);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: px-to-vh(8);
  border: px-to-vh(1) solid rgb(255 255 255 / 10%);
  border-radius: px-to-vh(8);
  background: linear-gradient(180deg, rgb(255 255 255 / 8%), rgb(255 255 255 / 5%));
  color: #ffffff;
  font: inherit;
  font-size: px-to-vh(12);
  font-weight: 900;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease, transform 140ms ease;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
  transform: none !important;
}

.property-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgb(172 46 205 / 7%), transparent 34%),
    rgb(255 255 255 / 4%);
}

.property-tabs {
  gap: px-to-vh(6);
  padding: px-to-vh(12);
  border-bottom: px-to-vh(1) solid rgb(255 255 255 / 8%);
  overflow-x: auto;
  scrollbar-width: none;
}

.property-tabs::-webkit-scrollbar {
  display: none;
}

.property-tabs__tab {
  flex: 0 0 auto;
  padding: 0 px-to-vh(11);
}

.property-tabs__tab--active {
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(172 46 205 / 22%), 0 px-to-vh(8) px-to-vh(18) rgb(172 46 205 / 10%);
}

.property-tabs__tab--active svg,
.property-sidebar__actions svg,
.property-card svg {
  color: var(--property-accent);
}

.property-panel__content {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: px-to-vh(16);
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.property-panel__content::-webkit-scrollbar {
  display: none;
}

.property-section {
  display: grid;
  align-content: start;
  gap: px-to-vh(14);
}

.property-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: px-to-vh(12);
}

.property-stats article {
  min-width: 0;
  display: grid;
  gap: px-to-vh(7);
  padding: px-to-vh(13);
  border: px-to-vh(1) solid rgb(255 255 255 / 9%);
  border-radius: px-to-vh(10);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 7%), rgb(0 0 0 / 14%)),
    rgb(255 255 255 / 4%);
  box-shadow: inset px-to-vh(3) 0 0 rgb(172 46 205 / 54%);
}

.property-stats span {
  color: rgb(255 255 255 / 50%);
  font-size: px-to-vh(11);
  font-weight: 850;
}

.property-stats strong {
  overflow: hidden;
  color: #ffffff;
  font-size: px-to-vh(15);
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.property-actions,
.interior-grid,
.furniture-layout {
  display: grid;
  gap: px-to-vh(10);
}

.property-actions {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: px-to-vh(12);
  padding: px-to-vh(12);
  border: px-to-vh(1) solid rgb(255 255 255 / 8%);
  border-radius: px-to-vh(10);
  background: rgb(0 0 0 / 16%);
}

.property-actions button {
  min-height: px-to-vh(44);
  padding: 0 px-to-vh(14);
  font-size: px-to-vh(13);
}

.property-actions h2,
.property-actions .property-empty-row {
  grid-column: 1 / -1;
}

.property-actions h2,
.furniture-layout h2,
.storage-layout h2,
.property-section > h2 {
  margin: 0;
  color: #ffffff;
  font-size: px-to-vh(15);
  font-weight: 950;
}

.property-actions__button--danger,
.row-card__danger {
  border-color: rgb(255 89 116 / 34%) !important;
  background: rgb(255 89 116 / 10%) !important;
  color: #ff8aa0 !important;
}

.property-section__header {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: px-to-vh(12);
  padding: px-to-vh(12);
  border: px-to-vh(1) solid rgb(255 255 255 / 8%);
  border-radius: px-to-vh(10);
  background:
    linear-gradient(135deg, rgb(172 46 205 / 10%), transparent 48%),
    rgb(0 0 0 / 16%);
}

.property-section__header > div {
  flex: 1 1 px-to-vh(150);
  min-width: 0;
  display: grid;
  gap: px-to-vh(4);
}

.property-section__header > button {
  flex: 0 0 auto;
  min-width: max-content;
  padding: 0 px-to-vh(14);
  white-space: nowrap;
}

.property-section--interior {
  gap: px-to-vh(14);
}

.interior-hero {
  min-height: px-to-vh(158);
  display: grid;
  grid-template-columns: minmax(0, px-to-vh(245)) minmax(0, 1fr) auto;
  align-items: stretch;
  gap: px-to-vh(14);
  padding: px-to-vh(12);
  border: px-to-vh(1) solid rgb(172 46 205 / 30%);
  border-radius: px-to-vh(10);
  background:
    linear-gradient(135deg, rgb(172 46 205 / 18%), rgb(172 46 205 / 5%) 48%, rgb(0 0 0 / 20%)),
    rgb(255 255 255 / 5%);
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 4%);
}

.interior-hero__preview {
  min-width: 0;
  min-height: px-to-vh(134);
  display: flex;
  align-items: flex-end;
  padding: px-to-vh(12);
  border-radius: px-to-vh(8);
  background:
    linear-gradient(180deg, rgb(0 0 0 / 8%), rgb(0 0 0 / 72%)),
    var(--property-image, url('/property/house.png')) center / cover no-repeat;
  box-sizing: border-box;
}

.interior-hero__preview span {
  padding: px-to-vh(7) px-to-vh(9);
  border: px-to-vh(1) solid rgb(172 46 205 / 28%);
  border-radius: px-to-vh(7);
  background: rgb(3 8 14 / 72%);
  color: #ffffff;
  font-size: px-to-vh(11);
  font-weight: 850;
}

.interior-hero__body {
  min-width: 0;
  display: grid;
  align-content: center;
  gap: px-to-vh(7);
}

.interior-hero__body span,
.interior-section-title span {
  color: var(--property-accent);
  font-size: px-to-vh(12);
  font-weight: 900;
}

.interior-hero__body strong {
  overflow: hidden;
  color: #ffffff;
  font-size: px-to-vh(24);
  font-weight: 950;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.interior-hero__body p {
  max-width: px-to-vh(390);
  margin: 0;
  color: rgb(255 255 255 / 62%);
  font-size: px-to-vh(13);
  font-weight: 700;
  line-height: 1.35;
}

.interior-hero b,
.interior-section-title small {
  align-self: start;
  padding: px-to-vh(8) px-to-vh(11);
  border: px-to-vh(1) solid rgb(172 46 205 / 34%);
  border-radius: px-to-vh(999);
  background: var(--property-accent-soft);
  color: var(--property-accent);
  font-size: px-to-vh(12);
  font-weight: 950;
  white-space: nowrap;
}

.interior-section-title {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: px-to-vh(12);
}

.interior-section-title div {
  min-width: 0;
  display: grid;
  gap: px-to-vh(4);
}

.interior-section-title strong {
  color: #ffffff;
  font-size: px-to-vh(17);
  font-weight: 950;
}

.interior-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: px-to-vh(12);
}

.interior-card {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, px-to-vh(190)) minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: px-to-vh(12);
  padding: px-to-vh(12);
  border: px-to-vh(1) solid rgb(255 255 255 / 9%);
  border-radius: px-to-vh(10);
  background: linear-gradient(180deg, rgb(255 255 255 / 7%), rgb(0 0 0 / 14%));
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 3%);
}

.interior-card:hover,
.interior-card:focus-within {
  border-color: rgb(172 46 205 / 42%);
  background: linear-gradient(180deg, rgb(172 46 205 / 12%), rgb(0 0 0 / 14%));
}

.interior-card__preview {
  grid-row: 1 / 3;
  min-height: px-to-vh(128);
  display: flex;
  align-items: flex-end;
  padding: px-to-vh(9);
  border-radius: px-to-vh(8);
  box-sizing: border-box;
}

.interior-card__preview small {
  padding: px-to-vh(5) px-to-vh(7);
  border-radius: px-to-vh(5);
  background: rgb(3 8 14 / 76%);
  color: rgb(255 255 255 / 78%);
  font-size: px-to-vh(10);
  font-weight: 850;
}

.interior-card div,
.row-card div,
.property-logs div {
  min-width: 0;
  display: grid;
  gap: px-to-vh(4);
}

.interior-card strong {
  color: #ffffff;
  font-size: px-to-vh(17);
  font-weight: 950;
  line-height: 1.08;
}

.interior-card span {
  color: rgb(255 255 255 / 54%);
  font-size: px-to-vh(12);
  font-weight: 700;
}

.interior-card button {
  justify-self: start;
  min-height: px-to-vh(36);
  padding: 0 px-to-vh(15);
  border: px-to-vh(1) solid rgb(172 46 205 / 44%);
  border-radius: px-to-vh(7);
  background: linear-gradient(180deg, rgb(172 46 205 / 34%), rgb(172 46 205 / 18%));
  color: #ffffff;
  font: inherit;
  font-size: px-to-vh(12);
  font-weight: 950;
  box-shadow: 0 px-to-vh(8) px-to-vh(20) rgb(172 46 205 / 12%);
}

.interior-card button:hover,
.interior-card button:focus-visible {
  border-color: rgb(172 46 205 / 70%);
  background: linear-gradient(180deg, rgb(172 46 205 / 48%), rgb(172 46 205 / 24%));
  outline: none;
}

.property-toolbar {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: px-to-vh(12);
  padding: px-to-vh(11);
  border: px-to-vh(1) solid rgb(255 255 255 / 8%);
  border-radius: px-to-vh(10);
  background: rgb(0 0 0 / 16%);
}

.property-toolbar label {
  flex: 1 1 auto;
  justify-content: flex-start;
  padding: 0 px-to-vh(12);
  background: rgb(255 255 255 / 6%);
}

.property-toolbar label:has(select) {
  flex: 0 0 auto;
}

.furniture-toggle {
  flex: 0 0 100%;
  display: inline-flex;
  gap: px-to-vh(4);
  justify-content: flex-start;
  padding: px-to-vh(5);
  border: px-to-vh(1) solid rgb(255 255 255 / 8%);
  border-radius: px-to-vh(8);
  background: rgb(0 0 0 / 20%);
}

.furniture-toggle button {
  position: relative;
  min-height: px-to-vh(46);
  padding: 0 px-to-vh(30);
  border: px-to-vh(1) solid transparent;
  border-radius: px-to-vh(6);
  background: transparent;
  color: rgb(255 255 255 / 58%);
  font: inherit;
  font-size: px-to-vh(14);
  font-weight: 900;
  white-space: nowrap;
}

.furniture-toggle button:hover,
.furniture-toggle button:focus-visible {
  border-color: rgb(172 46 205 / 44%);
  background: linear-gradient(180deg, rgb(172 46 205 / 36%), rgb(172 46 205 / 18%));
  color: #ffffff;
  outline: none;
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 7%);
}

.furniture-toggle__button--active,
.furniture-toggle button[aria-selected='true'] {
  border-color: rgb(172 46 205 / 62%);
  background: linear-gradient(180deg, rgb(172 46 205 / 48%), rgb(172 46 205 / 24%));
  color: #ffffff;
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 10%), 0 px-to-vh(6) px-to-vh(14) rgb(172 46 205 / 16%);
  text-shadow: 0 0 px-to-vh(10) rgb(172 46 205 / 42%);
}

.property-toolbar label > span,
.property-select > span {
  color: rgb(255 255 255 / 52%);
  font-size: px-to-vh(11);
  font-weight: 800;
  white-space: nowrap;
}

.property-toolbar input,
.property-toolbar select,
.property-section__header select {
  min-width: 0;
  border: 0;
  background: transparent;
  color: #ffffff;
  font: inherit;
  outline: 0;
}

.property-select {
  flex: 1 1 px-to-vh(230);
  justify-content: space-between;
  padding: 0 px-to-vh(11);
}

.property-toolbar input {
  flex: 1 1 auto;
}

.property-toolbar input::placeholder {
  color: rgb(255 255 255 / 46%);
}

.furniture-layout {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: px-to-vh(12);
}

.storage-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(px-to-vh(300), 0.9fr);
  gap: px-to-vh(12);
  align-items: start;
}

.furniture-layout section,
.storage-layout section {
  min-width: 0;
  display: grid;
  gap: px-to-vh(10);
  padding: px-to-vh(12);
  border: px-to-vh(1) solid rgb(255 255 255 / 8%);
  border-radius: px-to-vh(10);
  background: rgb(0 0 0 / 14%);
}

.furniture-block {
  min-height: px-to-vh(240);
}

.furniture-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: px-to-vh(12);
}

.property-section h2 {
  margin: 0;
  color: #ffffff;
  font-size: px-to-vh(15);
  font-weight: 950;
}

.row-card,
.log-row {
  min-width: 0;
  gap: px-to-vh(12);
  padding: px-to-vh(12);
  border: px-to-vh(1) solid rgb(255 255 255 / 9%);
  border-radius: px-to-vh(10);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 6%), rgb(0 0 0 / 14%)),
    rgb(255 255 255 / 4%);
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 3%);
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

.row-card:hover,
.log-row:hover {
  border-color: rgb(172 46 205 / 34%);
  background:
    linear-gradient(180deg, rgb(172 46 205 / 10%), rgb(0 0 0 / 14%)),
    rgb(255 255 255 / 4%);
  transform: translateY(px-to-vh(-1));
}

.row-card > svg {
  width: px-to-vh(34);
  height: px-to-vh(34);
  padding: px-to-vh(8);
  border: px-to-vh(1) solid rgb(172 46 205 / 26%);
  border-radius: px-to-vh(8);
  background: var(--property-accent-soft);
  color: var(--property-accent);
  box-sizing: border-box;
}

.row-card--garage {
  align-items: stretch;
}

.garage-preview {
  position: relative;
  flex: 0 0 px-to-vh(126);
  min-height: px-to-vh(78);
  display: flex !important;
  align-items: flex-end !important;
  justify-content: space-between;
  gap: px-to-vh(8) !important;
  padding: px-to-vh(9);
  border: px-to-vh(1) solid rgb(172 46 205 / 18%);
  border-radius: px-to-vh(8);
  background:
    linear-gradient(180deg, rgb(3 5 10 / 0%) 22%, rgb(3 5 10 / 68%) 100%),
    radial-gradient(circle at 24% 18%, rgb(255 255 255 / 12%), transparent 34%),
    linear-gradient(135deg, rgb(172 46 205 / 16%), rgb(37 45 61 / 48%)),
    var(--garage-preview-image, linear-gradient(135deg, rgb(18 22 31), rgb(8 9 14)));
  background-position: center;
  background-size: cover;
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 4%);
  overflow: hidden;
  box-sizing: border-box;
}

.garage-preview::before {
  content: '';
  position: absolute;
  right: px-to-vh(10);
  bottom: px-to-vh(17);
  width: px-to-vh(68);
  height: px-to-vh(22);
  border-radius: px-to-vh(999) px-to-vh(999) px-to-vh(6) px-to-vh(6);
  background: linear-gradient(135deg, rgb(255 255 255 / 30%), rgb(172 46 205 / 20%));
  clip-path: polygon(7% 66%, 18% 35%, 36% 20%, 67% 22%, 84% 44%, 96% 66%, 90% 84%, 14% 84%);
  opacity: var(--garage-preview-mock-opacity, .85);
}

.garage-preview::after {
  content: '';
  position: absolute;
  right: px-to-vh(18);
  bottom: px-to-vh(12);
  width: px-to-vh(48);
  height: px-to-vh(8);
  border-radius: px-to-vh(999);
  background:
    radial-gradient(circle at 12% 50%, rgb(255 255 255 / 58%) 0 px-to-vh(4), transparent px-to-vh(4)),
    radial-gradient(circle at 88% 50%, rgb(255 255 255 / 58%) 0 px-to-vh(4), transparent px-to-vh(4));
  opacity: var(--garage-preview-mock-opacity, .85);
}

.garage-preview[style] {
  --garage-preview-mock-opacity: 0;
}

.garage-preview svg {
  position: relative;
  z-index: 1;
  width: px-to-vh(28);
  height: px-to-vh(28);
  padding: px-to-vh(7);
  border-radius: px-to-vh(8);
  background: rgb(0 0 0 / 42%);
  color: var(--property-accent);
  box-sizing: border-box;
}

.garage-preview span {
  position: relative;
  z-index: 1;
  min-width: 0;
  padding: px-to-vh(5) px-to-vh(7);
  border-radius: px-to-vh(6);
  background: rgb(0 0 0 / 48%);
  color: rgb(255 255 255 / 82%);
  font-size: px-to-vh(10);
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.garage-card__body {
  align-self: center;
}

.row-card div {
  flex: 1 1 auto;
}

.row-card .garage-preview {
  flex: 0 0 px-to-vh(126);
}

.row-card .garage-card__body {
  flex: 1 1 auto;
}

.row-card button {
  flex: 0 0 auto;
  min-height: px-to-vh(34);
  max-width: px-to-vh(150);
  padding: 0 px-to-vh(12);
  border-color: rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 8%);
}

.row-card button:hover,
.row-card button:focus-visible {
  border-color: rgb(172 46 205 / 42%);
  background: var(--property-accent-soft);
  outline: none;
}

.row-card--furniture {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: px-to-vh(12);
  align-items: stretch;
}

.furniture-card {
  min-width: 0;
  display: grid;
  grid-template-rows: px-to-vh(120) minmax(0, 1fr) auto;
  gap: px-to-vh(11);
  padding: px-to-vh(12);
  border: px-to-vh(1) solid rgb(255 255 255 / 9%);
  border-radius: px-to-vh(10);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 6%), rgb(0 0 0 / 14%)),
    rgb(255 255 255 / 4%);
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 3%);
}

.furniture-card:hover,
.furniture-card:focus-within {
  border-color: rgb(172 46 205 / 34%);
  background:
    linear-gradient(180deg, rgb(172 46 205 / 10%), rgb(0 0 0 / 14%)),
    rgb(255 255 255 / 4%);
}

.furniture-card__preview {
  min-width: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: px-to-vh(8);
  padding: px-to-vh(10);
  border: px-to-vh(1) solid rgb(172 46 205 / 18%);
  border-radius: px-to-vh(8);
  background:
    linear-gradient(135deg, rgb(172 46 205 / 18%), rgb(255 255 255 / 4%)),
    var(--furniture-image, linear-gradient(135deg, rgb(18 22 31), rgb(8 9 14)));
  background-size: cover;
  background-position: center;
  overflow: hidden;
}

.furniture-card__preview svg {
  width: px-to-vh(34);
  height: px-to-vh(34);
  padding: px-to-vh(8);
  border-radius: px-to-vh(8);
  background: rgb(0 0 0 / 34%);
  color: var(--property-accent);
  box-sizing: border-box;
}

.furniture-card__preview span {
  min-width: 0;
  padding: px-to-vh(5) px-to-vh(7);
  border-radius: px-to-vh(6);
  background: rgb(0 0 0 / 46%);
  color: rgb(255 255 255 / 78%);
  font-size: px-to-vh(10);
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.furniture-card__body {
  min-width: 0;
  display: grid;
  gap: px-to-vh(10);
}

.furniture-card__body header {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: px-to-vh(10);
}

.furniture-card__body header strong {
  white-space: normal;
  line-height: 1.2;
}

.furniture-card__body header span {
  flex: 0 0 auto;
  padding: px-to-vh(5) px-to-vh(8);
  border: px-to-vh(1) solid rgb(172 46 205 / 28%);
  border-radius: px-to-vh(999);
  background: var(--property-accent-soft);
  color: var(--property-accent);
  font-size: px-to-vh(10);
  font-weight: 900;
}

.furniture-card__details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: px-to-vh(7);
}

.furniture-card__details--compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.furniture-card__details span {
  min-width: 0;
  display: grid;
  gap: px-to-vh(2);
  padding: px-to-vh(7);
  border-radius: px-to-vh(7);
  background: rgb(0 0 0 / 16%);
  color: rgb(255 255 255 / 76%);
  font-size: px-to-vh(11);
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.furniture-card__details b {
  color: rgb(255 255 255 / 44%);
  font-size: px-to-vh(10);
  font-weight: 850;
}

.furniture-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: px-to-vh(8);
  min-width: 0;
}

.furniture-card__actions button {
  max-width: none;
  min-width: px-to-vh(112);
  min-height: px-to-vh(34);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: px-to-vh(8);
  padding: 0 px-to-vh(12);
  border: px-to-vh(1) solid rgb(255 255 255 / 12%);
  border-radius: px-to-vh(8);
  background: rgb(255 255 255 / 8%);
  color: #ffffff;
  font: inherit;
  font-size: px-to-vh(12);
  font-weight: 900;
}

.furniture-card__actions button:hover,
.furniture-card__actions button:focus-visible {
  border-color: rgb(172 46 205 / 42%);
  background: var(--property-accent-soft);
  outline: none;
}

.furniture-card__actions svg {
  width: px-to-vh(16);
  height: px-to-vh(16);
}

.property-logs {
  gap: px-to-vh(10);
  contain: layout paint;
}

.log-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: px-to-vh(6);
  position: relative;
  padding-left: px-to-vh(30);
  background: rgb(255 255 255 / 5%);
  box-shadow: none;
  contain: layout paint;
  content-visibility: auto;
  contain-intrinsic-size: px-to-vh(72);
  transition: none;
}

.log-row:hover {
  border-color: rgb(172 46 205 / 34%);
  background: rgb(172 46 205 / 10%);
  transform: none;
}

.log-row > span {
  color: rgb(255 255 255 / 58%);
  font-size: px-to-vh(10);
  font-weight: 800;
  line-height: 1.2;
  white-space: normal;
}

.log-row strong {
  font-size: px-to-vh(13);
  white-space: normal;
  line-height: 1.18;
  overflow-wrap: anywhere;
}

.log-row p {
  font-size: px-to-vh(12);
  line-height: 1.3;
}

.log-row::before {
  content: '';
  position: absolute;
  left: px-to-vh(13);
  top: px-to-vh(17);
  width: px-to-vh(8);
  height: px-to-vh(8);
  border-radius: 999px;
  background: var(--property-accent);
}

.property-logs p {
  color: rgb(255 255 255 / 58%);
  font-size: px-to-vh(12);
  font-weight: 650;
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: normal;
}


.property-app__icon-button,
.property-sidebar__actions button,
.property-tabs__tab,
.property-actions button,
.row-card button,
.property-section__header > button,
.property-select,
.property-section__header select,
.property-toolbar select,
.property-toolbar label {
  background: #1a1f2b;
}

.property-card {
  grid-template-columns: minmax(0, px-to-vh(238)) minmax(0, 1fr);
  min-height: px-to-vh(236);
  border-color: #2b3140;
  background: #121722;
  box-shadow: 0 px-to-vh(12) px-to-vh(26) rgb(0 0 0 / 20%), inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 3%);
}

.property-card:hover,
.property-card:focus-visible {
  border-color: rgb(172 46 205 / 58%);
  background: #171d2a;
  transform: translateY(px-to-vh(-1));
}

.property-card__media {
  min-height: 100%;
  padding: px-to-vh(16);
}

.property-card__media,
.property-sidebar__media,
.interior-card__preview {
  background:
    linear-gradient(180deg, rgb(0 0 0 / 4%), rgb(0 0 0 / 64%)),
    var(--property-image, url('/property/house.png')) center / cover no-repeat;
}

.property-card__media small,
.property-sidebar__media span,
.interior-card__preview small {
  background: #111722;
}

.property-card__body {
  align-content: start;
  gap: px-to-vh(12);
  padding: px-to-vh(16);
}

.property-card__body > .property-card__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: px-to-vh(12);
  color: #ffffff;
}

.property-card__heading strong {
  min-width: 0;
  font-size: px-to-vh(16);
  line-height: 1.2;
  white-space: normal;
}

.property-card__heading b {
  flex: 0 0 auto;
  padding: px-to-vh(6) px-to-vh(8);
  border: px-to-vh(1) solid rgb(172 46 205 / 34%);
  border-radius: px-to-vh(7);
  background: rgb(172 46 205 / 18%);
  color: #f0b9ff;
  font-size: px-to-vh(10);
  font-weight: 950;
  white-space: nowrap;
}

.property-card__body > .property-card__address {
  display: flex;
  align-items: center;
  color: rgb(255 255 255 / 70%);
  line-height: 1.25;
}

.property-card__body > .property-card__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: px-to-vh(8);
  color: #ffffff;
}

.property-card__facts > span {
  min-width: 0;
  display: grid;
  gap: px-to-vh(3);
  padding: px-to-vh(8);
  border: px-to-vh(1) solid #252b38;
  border-radius: px-to-vh(7);
  background: #0e131d;
  color: rgb(255 255 255 / 82%);
  font-size: px-to-vh(11);
  font-weight: 800;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
}

.property-card__facts b {
  color: rgb(255 255 255 / 48%);
  font-size: px-to-vh(10);
  font-weight: 850;
  white-space: nowrap;
}

.property-sidebar,
.property-panel,
.property-building,
.property-section__header,
.property-toolbar,
.property-stats article,
.row-card,
.log-row,
.furniture-card,
.interior-card,
.property-empty,
.property-empty-row {
  background: #101620;
}

.property-panel {
  background: #0f141e;
}

.property-sidebar__facts article,
.furniture-toggle,
.property-card__facts > span,
.property-toolbar {
  background: #0c111a;
}.property-confirm-modal {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: px-to-vh(24);
  background: rgb(0 0 0 / 62%);
}

.property-confirm-modal__panel {
  width: min(px-to-vh(460), 100%);
  display: grid;
  gap: px-to-vh(12);
  padding: px-to-vh(18);
  border: px-to-vh(1) solid rgb(172 46 205 / 34%);
  border-radius: px-to-vh(10);
  background: linear-gradient(180deg, #17111d, #0a0c12);
  box-shadow: 0 px-to-vh(18) px-to-vh(42) rgb(0 0 0 / 42%);
}

.property-confirm-modal__panel strong {
  color: #ffffff;
  font-size: px-to-vh(20);
  font-weight: 950;
}

.property-confirm-modal__panel p {
  margin: 0;
  color: rgb(255 255 255 / 66%);
  font-size: px-to-vh(13);
  font-weight: 700;
  line-height: 1.45;
}

.property-confirm-modal__panel div {
  display: flex;
  justify-content: flex-end;
  gap: px-to-vh(10);
}

.property-confirm-modal__panel button {
  min-height: px-to-vh(38);
  padding: 0 px-to-vh(14);
  border: px-to-vh(1) solid rgb(255 255 255 / 10%);
  border-radius: px-to-vh(8);
  background: rgb(255 255 255 / 8%);
  color: #ffffff;
  font: inherit;
  font-size: px-to-vh(12);
  font-weight: 900;
}

.property-confirm-modal__panel button:last-child {
  border-color: rgb(172 46 205 / 44%);
  background: rgb(172 46 205 / 22%);
}

.property-app {
  --property-accent: #b936e6;
  --property-accent-soft: rgb(185 54 230 / 14%);
  background:
    radial-gradient(42vh 28vh at 82% 6%, rgb(185 54 230 / 14%), transparent 76%),
    #050506;
}

.property-app__header {
  padding: px-to-vh(2) px-to-vh(2) 0;
}

.property-app__title h1 {
  color: #ffffff;
}

.property-app__title p,
.property-sidebar__facts span,
.row-card span,
.property-section__header span,
.property-logs span,
.property-stats span,
.property-card__body > .property-card__address {
  color: rgb(255 255 255 / 68%);
}

.property-sidebar,
.property-panel,
.property-card,
.property-section__header,
.property-toolbar,
.property-stats article,
.row-card,
.log-row,
.furniture-card,
.interior-card,
.property-empty,
.property-empty-row {
  border-color: #232326;
  background: #0b0b0d;
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 4%), 0 px-to-vh(14) px-to-vh(34) rgb(0 0 0 / 28%);
}

.property-panel,
.property-sidebar__facts article,
.property-card__facts > span,
.furniture-toggle {
  background: #080809;
}

.property-card {
  border-color: #2b2b30;
  background: #0a0a0c;
}

.property-card:hover,
.property-card:focus-visible,
.row-card:hover,
.log-row:hover,
.furniture-card:hover,
.furniture-card:focus-within,
.interior-card:hover,
.interior-card:focus-within {
  border-color: rgb(185 54 230 / 62%);
  background: #101012;
}

.property-card__media,
.property-sidebar__media,
.interior-card__preview {
  background:
    linear-gradient(180deg, rgb(0 0 0 / 2%), rgb(0 0 0 / 70%)),
    var(--property-image, url('/property/house.png')) center / cover no-repeat;
}

.property-card__media small,
.property-sidebar__media span,
.interior-card__preview small,
.furniture-card__preview span,
.garage-preview span {
  border: px-to-vh(1) solid rgb(255 255 255 / 10%);
  background: #050506;
  color: #ffffff;
}

.property-app__icon-button,
.property-sidebar__actions button,
.property-tabs__tab,
.property-actions button,
.row-card button,
.property-section__header > button,
.property-select,
.property-section__header select,
.property-toolbar select,
.property-toolbar label,
.furniture-card__actions button,
.interior-card button {
  border-color: #ffffff;
  background: #ffffff;
  color: #050506;
  box-shadow: none;
}

.property-app__icon-button svg,
.property-sidebar__actions button svg,
.property-tabs__tab svg,
.row-card button svg,
.property-section__header button svg,
.property-toolbar svg,
.furniture-card__actions svg,
.interior-card button svg {
  color: currentColor;
}

.property-app__icon-button:hover,
.property-app__icon-button:focus-visible,
.property-sidebar__actions button:hover,
.property-sidebar__actions button:focus-visible,
.property-tabs__tab:hover,
.property-tabs__tab--active,
.property-actions button:hover,
.property-actions button:focus-visible,
.row-card button:hover,
.row-card button:focus-visible,
.property-section__header > button:hover,
.property-section__header > button:focus-visible,
.furniture-card__actions button:hover,
.furniture-card__actions button:focus-visible,
.interior-card button:hover,
.interior-card button:focus-visible {
  border-color: var(--property-accent);
  background: var(--property-accent);
  color: #ffffff;
  outline: none;
}

.property-tabs__tab--active {
  box-shadow: 0 px-to-vh(8) px-to-vh(18) rgb(185 54 230 / 18%);
}

.property-card__heading b,
.property-card__meta b,
.property-section__header b,
.interior-hero > b,
.interior-section-title small {
  border-color: rgb(185 54 230 / 42%);
  background: rgb(185 54 230 / 16%);
  color: #e6b7ff;
}

.property-card__facts > span,
.furniture-card__details span {
  border-color: #1f1f23;
  background: #070708;
}

.property-card__facts b,
.furniture-card__details b {
  color: rgb(255 255 255 / 46%);
}

.property-stats article {
  box-shadow: inset px-to-vh(3) 0 0 var(--property-accent), inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 4%);
}

.property-actions__button--danger,
.row-card__danger {
  border-color: #ff5b77 !important;
  background: #ffffff !important;
  color: #b8002a !important;
}

button:disabled {
  border-color: rgb(255 255 255 / 24%) !important;
  background: #303035 !important;
  color: rgb(255 255 255 / 48%) !important;
}

.property-confirm-modal__panel {
  border-color: rgb(185 54 230 / 42%);
  background: #080809;
}
.garage-card {
  min-width: 0;
  display: grid;
  grid-template-columns: px-to-vh(190) minmax(0, 1fr) auto;
  align-items: stretch;
  gap: px-to-vh(14);
  padding: px-to-vh(12);
  border: px-to-vh(1) solid #292932;
  border-radius: px-to-vh(10);
  background: #0a0a0c;
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 4%), 0 px-to-vh(12) px-to-vh(30) rgb(0 0 0 / 26%);
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

.garage-card:hover,
.garage-card:focus-within {
  border-color: rgb(185 54 230 / 62%);
  background: #101012;
  transform: translateY(px-to-vh(-1));
}

.garage-card__preview {
  position: relative;
  min-width: 0;
  min-height: px-to-vh(112);
  display: grid;
  place-items: center;
  padding: px-to-vh(10);
  border: px-to-vh(1) solid #252530;
  border-radius: px-to-vh(8);
  background:
    radial-gradient(circle at 78% 20%, rgb(185 54 230 / 28%), transparent 28%),
    radial-gradient(circle at 18% 18%, rgb(255 255 255 / 10%), transparent 26%),
    linear-gradient(180deg, #17131f 0%, #0b0b0e 46%, #050506 100%);
  overflow: hidden;
  box-sizing: border-box;
}

.garage-card__preview::before {
  content: '';
  position: absolute;
  inset: auto px-to-vh(-10) 0;
  height: 46%;
  background:
    linear-gradient(90deg, transparent 0 12%, rgb(185 54 230 / 36%) 12% 14%, transparent 14% 48%, rgb(255 255 255 / 12%) 48% 52%, transparent 52% 86%, rgb(185 54 230 / 28%) 86% 88%, transparent 88%),
    linear-gradient(180deg, rgb(255 255 255 / 7%), rgb(0 0 0 / 34%));
  clip-path: polygon(12% 22%, 88% 22%, 100% 100%, 0 100%);
}

.garage-card__preview::after {
  content: '';
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: px-to-vh(10);
  height: px-to-vh(16);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgb(0 0 0 / 72%), transparent 72%);
}

.garage-card__preview img {
  position: relative;
  z-index: 1;
  width: 92%;
  height: px-to-vh(74);
  object-fit: contain;
  object-position: center bottom;
}

.garage-card__vehicle-mock {
  position: relative;
  z-index: 1;
  width: 78%;
  height: px-to-vh(42);
  margin-top: px-to-vh(14);
  border-radius: px-to-vh(26) px-to-vh(30) px-to-vh(10) px-to-vh(10);
  background:
    radial-gradient(circle at 16% 88%, #050506 0 px-to-vh(8), #dcdce4 px-to-vh(8) px-to-vh(10), transparent px-to-vh(10)),
    radial-gradient(circle at 82% 88%, #050506 0 px-to-vh(8), #dcdce4 px-to-vh(8) px-to-vh(10), transparent px-to-vh(10)),
    linear-gradient(135deg, #2c2d36 0 34%, #555765 34% 52%, #20212a 52% 100%);
  clip-path: polygon(4% 70%, 13% 42%, 31% 18%, 68% 18%, 88% 44%, 97% 70%, 92% 88%, 8% 88%);
}

.garage-card__preview > b {
  position: absolute;
  z-index: 2;
  left: px-to-vh(9);
  bottom: px-to-vh(8);
  padding: px-to-vh(5) px-to-vh(7);
  border: px-to-vh(1) solid rgb(255 255 255 / 12%);
  border-radius: px-to-vh(6);
  background: #050506;
  color: #ffffff;
  font-size: px-to-vh(10);
  font-weight: 950;
}

.garage-card__content {
  min-width: 0;
  display: grid;
  align-content: center;
  gap: px-to-vh(12);
}

.garage-card__content header {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: px-to-vh(12);
}

.garage-card__content header div {
  min-width: 0;
  display: grid;
  gap: px-to-vh(5);
}

.garage-card__content strong {
  overflow: hidden;
  color: #ffffff;
  font-size: px-to-vh(16);
  font-weight: 950;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.garage-card__content header span {
  color: rgb(255 255 255 / 62%);
  font-size: px-to-vh(12);
  font-weight: 900;
}

.garage-card__content header > b {
  flex: 0 0 auto;
  padding: px-to-vh(6) px-to-vh(8);
  border: px-to-vh(1) solid rgb(185 54 230 / 42%);
  border-radius: px-to-vh(7);
  background: rgb(185 54 230 / 16%);
  color: #e6b7ff;
  font-size: px-to-vh(10);
  font-weight: 950;
  white-space: nowrap;
}

.garage-card__facts {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: px-to-vh(8);
}

.garage-card__facts span {
  min-width: 0;
  display: grid;
  gap: px-to-vh(3);
  padding: px-to-vh(8);
  border: px-to-vh(1) solid #1f1f23;
  border-radius: px-to-vh(7);
  background: #070708;
  color: rgb(255 255 255 / 82%);
  font-size: px-to-vh(11);
  font-weight: 850;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
}

.garage-card__facts b {
  color: rgb(255 255 255 / 46%);
  font-size: px-to-vh(10);
  font-weight: 850;
  white-space: nowrap;
}

.garage-card__actions {
  min-width: px-to-vh(132);
  display: grid;
  align-content: center;
  gap: px-to-vh(8);
}

.garage-card__actions button {
  min-width: px-to-vh(132);
  min-height: px-to-vh(38);
  padding: 0 px-to-vh(12);
  border: px-to-vh(1) solid #ffffff;
  border-radius: px-to-vh(8);
  background: #ffffff;
  color: #050506;
  font: inherit;
  font-size: px-to-vh(12);
  font-weight: 950;
  white-space: nowrap;
}

.garage-card__actions button:hover,
.garage-card__actions button:focus-visible {
  border-color: var(--property-accent);
  background: var(--property-accent);
  color: #ffffff;
  outline: none;
}
.garage-card__actions button:disabled {
  border-color: rgb(255 255 255 / 24%);
  background: #303035;
  color: rgb(255 255 255 / 48%);
}
.furniture-card__status--inactive {
  border-color: #555862 !important;
  background: #2b2d33 !important;
  color: #b8bac3 !important;
}

.property-actions__button--danger,
.row-card__danger,
.furniture-card__actions .row-card__danger {
  border-color: #ff4d64 !important;
  background: #ff4d64 !important;
  color: #ffffff !important;
}

.property-actions__button--danger:hover,
.property-actions__button--danger:focus-visible,
.row-card__danger:hover,
.row-card__danger:focus-visible,
.furniture-card__actions .row-card__danger:hover,
.furniture-card__actions .row-card__danger:focus-visible {
  border-color: #ff7487 !important;
  background: #ff304d !important;
  color: #ffffff !important;
}
.property-tabs {
  background: #080809;
}

.property-tabs__tab {
  border-color: #2a2a31 !important;
  background: #131318 !important;
  color: rgb(255 255 255 / 78%) !important;
  box-shadow: none !important;
}

.property-tabs__tab svg {
  color: rgb(255 255 255 / 68%) !important;
}

.property-tabs__tab:hover,
.property-tabs__tab:focus-visible {
  border-color: rgb(185 54 230 / 44%) !important;
  background: #1b1b22 !important;
  color: #ffffff !important;
}

.property-tabs__tab--active,
.property-tabs__tab--active:hover,
.property-tabs__tab--active:focus-visible {
  border-color: rgb(185 54 230 / 64%) !important;
  background: rgb(185 54 230 / 18%) !important;
  color: #ffffff !important;
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(185 54 230 / 24%), 0 px-to-vh(8) px-to-vh(18) rgb(185 54 230 / 16%) !important;
}

.property-tabs__tab--active svg {
  color: #e6b7ff !important;
}
.property-toolbar label,
.property-toolbar select,
.property-toolbar input,
.property-select,
.property-section__header select {
  background: #131318 !important;
  color: #ffffff !important;
}

.property-toolbar label {
  border-color: #2a2a31 !important;
}

.property-toolbar input::placeholder {
  color: rgb(255 255 255 / 48%) !important;
}
.garage-card {
  grid-template-columns: px-to-vh(168) minmax(0, 1fr) px-to-vh(116);
  gap: px-to-vh(12);
  align-items: center;
  min-height: px-to-vh(96);
  padding: px-to-vh(11);
  border-color: #2a2a31;
  border-radius: px-to-vh(8);
  background: #09090b;
}

.garage-card__preview {
  min-height: px-to-vh(76);
  aspect-ratio: 16 / 9;
  padding: px-to-vh(8);
  border-color: #2b2135;
  background:
    radial-gradient(circle at 17% 18%, rgb(255 255 255 / 16%), transparent 22%),
    radial-gradient(circle at 82% 19%, rgb(185 54 230 / 40%), transparent 30%),
    linear-gradient(180deg, #19141d 0%, #111016 48%, #060607 100%);
}

.garage-card__preview::before {
  inset: auto px-to-vh(12) 0;
  height: px-to-vh(30);
  background:
    linear-gradient(90deg, rgb(185 54 230 / 68%) 0 px-to-vh(4), transparent px-to-vh(4) calc(100% - px-to-vh(4)), rgb(185 54 230 / 68%) calc(100% - px-to-vh(4)) 100%),
    linear-gradient(180deg, transparent, rgb(185 54 230 / 14%));
  clip-path: none;
}

.garage-card__preview::after {
  left: 18%;
  right: 18%;
  bottom: px-to-vh(9);
  height: px-to-vh(12);
  background: radial-gradient(ellipse at center, rgb(0 0 0 / 74%), transparent 72%);
}

.garage-card__preview img {
  width: 94%;
  height: px-to-vh(62);
  object-position: center bottom;
}

.garage-card__preview > b {
  left: px-to-vh(9);
  bottom: px-to-vh(8);
  padding: px-to-vh(4) px-to-vh(7);
  border-color: rgb(185 54 230 / 38%);
  background: #070708;
  color: #ffffff;
  font-size: px-to-vh(9);
}

.garage-card__content {
  align-content: stretch;
  gap: px-to-vh(10);
}

.garage-card__content header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: px-to-vh(12);
}

.garage-card__content strong {
  font-size: px-to-vh(15);
}

.garage-card__content header span {
  color: #ffffff;
  font-size: px-to-vh(12);
}

.garage-card__content header > b {
  align-self: start;
  padding: px-to-vh(5) px-to-vh(8);
  border-color: rgb(185 54 230 / 54%);
  background: rgb(185 54 230 / 22%);
  color: #f0d2ff;
  font-size: px-to-vh(9);
}

.garage-card__facts {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: px-to-vh(8);
}

.garage-card__facts span {
  min-height: px-to-vh(36);
  padding: px-to-vh(7) px-to-vh(8);
  border-color: #222228;
  border-radius: px-to-vh(6);
  background: #070708;
  font-size: px-to-vh(10);
}

.garage-card__facts b {
  font-size: px-to-vh(9);
}

.garage-card__actions {
  min-width: 0;
  align-content: stretch;
  gap: px-to-vh(8);
}

.garage-card__actions button {
  width: px-to-vh(116);
  min-width: 0;
  min-height: px-to-vh(33);
  border-radius: px-to-vh(6);
  font-size: px-to-vh(11);
}
.property-select--twinkle {
  min-width: px-to-vh(220);
  display: grid;
  grid-template-columns: auto minmax(px-to-vh(150), 1fr);
  align-items: center;
  gap: px-to-vh(10);
  padding: px-to-vh(5) px-to-vh(6) px-to-vh(5) px-to-vh(11);
  border-color: #2a2a31 !important;
  background: #131318 !important;
}

.property-select--twinkle > span {
  color: rgb(255 255 255 / 64%);
  font-size: px-to-vh(11);
  font-weight: 850;
  white-space: nowrap;
}

.property-select--twinkle :deep(.twinkle-select) {
  min-width: 0;
}

.property-select--twinkle :deep(.twinkle-select__trigger) {
  min-height: px-to-vh(30);
  padding: 0 px-to-vh(8);
  border-color: #2a2a31;
  border-radius: px-to-vh(6);
  background: #131318;
  box-shadow: none;
}

.property-select--twinkle :deep(.twinkle-select__trigger:hover),
.property-select--twinkle :deep(.twinkle-select__trigger--open) {
  border-color: rgb(185 54 230 / 44%);
  background: #1b1b22;
}

.property-select--twinkle :deep(.twinkle-select__value) {
  font-size: px-to-vh(12);
  font-weight: 850;
}

.property-select--twinkle :deep(.twinkle-select__menu) {
  z-index: 120;
  border-color: #2a2a31;
  background: #080809;
}

.property-select--twinkle :deep(.twinkle-select__option:hover),
.property-select--twinkle :deep(.twinkle-select__option--active) {
  border-color: rgb(185 54 230 / 34%);
  background: rgb(185 54 230 / 14%);
}
.property-section:has(.garage-card) {
  grid-template-columns: repeat(2, minmax(px-to-vh(260), px-to-vh(320)));
  align-items: start;
}

.property-section:has(.garage-card) > .property-section__header,
.property-section:has(.garage-card) > h2,
.property-section:has(.garage-card) > .property-empty-row {
  grid-column: 1 / -1;
}

.garage-card {
  width: 100%;
  min-height: px-to-vh(318);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: px-to-vh(142) auto minmax(px-to-vh(42), auto);
  align-items: stretch;
  gap: px-to-vh(12);
  padding: px-to-vh(12);
  border-color: #2a2a31;
  border-radius: px-to-vh(10);
  background: #09090b;
}

.garage-card__preview {
  width: 100%;
  min-height: 0;
  height: px-to-vh(142);
  aspect-ratio: auto;
  padding: px-to-vh(14);
  border-radius: px-to-vh(8);
}

.garage-card__preview img {
  width: 96%;
  height: px-to-vh(106);
}

.garage-card__vehicle-mock {
  width: 82%;
  height: px-to-vh(62);
}

.garage-card__preview > b {
  left: px-to-vh(12);
  bottom: px-to-vh(11);
  padding: px-to-vh(5) px-to-vh(8);
}

.garage-card__content {
  align-content: start;
  gap: px-to-vh(11);
}

.garage-card__content header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.garage-card__content strong {
  font-size: px-to-vh(17);
  white-space: normal;
}

.garage-card__content header span {
  margin-top: px-to-vh(2);
  color: rgb(255 255 255 / 72%);
}

.garage-card__facts {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: px-to-vh(8);
}

.garage-card__facts span {
  min-height: px-to-vh(48);
  padding: px-to-vh(8);
}

.garage-card__actions {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: end;
  gap: px-to-vh(10);
}

.garage-card__actions button {
  width: 100%;
  min-height: px-to-vh(40);
}
.property-section__header > .property-select--twinkle {
  flex: 0 1 px-to-vh(290);
  width: px-to-vh(290);
  max-width: 100%;
  grid-template-columns: minmax(0, px-to-vh(118)) minmax(0, 1fr);
  padding-right: px-to-vh(5);
  box-sizing: border-box;
}

.property-section__header > .property-select--twinkle :deep(.twinkle-select) {
  width: 100%;
  min-width: 0;
}

.property-section__header > .property-select--twinkle :deep(.twinkle-select__trigger) {
  width: 100%;
  min-width: 0;
}

.property-section__header > .property-select--twinkle > span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.property-section__header > button {
  flex-shrink: 0;
}
.garage-card__facts {
  display: flex;
  flex-wrap: wrap;
}

.garage-card__facts span {
  flex: 1 1 px-to-vh(92);
  min-width: px-to-vh(86);
}
.property-section__header:has(.property-select--twinkle) {
  display: grid;
  grid-template-columns: repeat(2, minmax(10.8888888889vh, 1fr)) minmax(26.8518518519vh, auto) auto;
  align-items: center;
}

.property-section__header:has(.property-select--twinkle) > div:not(.property-select--twinkle) {
  flex: initial;
}

.property-section__header:has(.property-select--twinkle) > .property-select--twinkle {
  justify-self: end;
}

.property-section__header:has(.property-select--twinkle) > button {
  justify-self: end;
}
.garage-card__facts {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: stretch;
}

.garage-card__facts span {
  flex: 1 1 px-to-vh(118) !important;
  min-width: px-to-vh(112) !important;
  height: auto;
  min-height: px-to-vh(48);
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}

.garage-card__facts span b {
  min-width: 0;
  white-space: nowrap;
}
.storage-layout {
  grid-template-columns: minmax(0, 1fr) !important;
  align-items: stretch;
}

.storage-items-block,
.storage-history-table {
  width: 100%;
  background: #080809 !important;
}

.storage-item-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
}

.storage-item-row {
  min-height: px-to-vh(58);
  grid-template-columns: px-to-vh(40) minmax(0, 1fr) auto auto;
  gap: px-to-vh(12);
  padding: px-to-vh(10) px-to-vh(12);
  border-radius: px-to-vh(8);
  background: #09090b !important;
}

.storage-item-row__preview {
  width: px-to-vh(30);
  height: px-to-vh(30);
  display: grid;
  place-items: center;
  border: px-to-vh(1) solid rgb(185 54 230 / 42%);
  border-radius: px-to-vh(7);
  background:
    radial-gradient(circle at 28% 22%, rgb(255 255 255 / 10%), transparent 34%),
    rgb(185 54 230 / 18%);
  color: #d56cff;
  box-sizing: border-box;
}

.storage-item-row__preview span {
  width: px-to-vh(15);
  height: px-to-vh(15);
  border: px-to-vh(1.5) solid currentColor;
  border-radius: px-to-vh(3);
  transform: rotate(30deg) skew(-10deg, -10deg);
  box-shadow: inset px-to-vh(4) px-to-vh(4) 0 rgb(185 54 230 / 18%);
}

.storage-item-row > div {
  min-width: 0;
  display: grid;
  gap: px-to-vh(2);
}

.storage-item-row strong {
  overflow: hidden;
  color: #ffffff;
  font-size: px-to-vh(13);
  font-weight: 950;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.storage-item-row > div > span {
  color: rgb(255 255 255 / 70%);
  font-size: px-to-vh(11);
  font-weight: 800;
  line-height: 1.15;
}

.storage-item-row button {
  min-width: px-to-vh(104);
  min-height: px-to-vh(34);
  border-radius: px-to-vh(7);
}
.storage-history-table__grid {
  display: grid;
  gap: px-to-vh(6);
  min-width: 0;
}

.storage-history-table__head,
.storage-history-table__row {
  display: grid;
  grid-template-columns: minmax(px-to-vh(124), 0.7fr) minmax(px-to-vh(150), 0.9fr) minmax(px-to-vh(130), 0.75fr) minmax(0, 1.4fr);
  gap: px-to-vh(10);
  align-items: center;
  min-width: 0;
}

.storage-history-table__head {
  padding: 0 px-to-vh(12) px-to-vh(2);
  color: rgb(255 255 255 / 48%);
  font-size: px-to-vh(10);
  font-weight: 900;
}

.storage-history-table__row {
  min-height: px-to-vh(48);
  padding: px-to-vh(10) px-to-vh(12);
  border: px-to-vh(1) solid #232326;
  border-radius: px-to-vh(8);
  background: #0b0b0d;
  box-shadow: inset 0 0 0 px-to-vh(1) rgb(255 255 255 / 4%);
}

.storage-history-table__row:hover {
  border-color: rgb(185 54 230 / 48%);
  background: #101012;
}

.storage-history-table__row span,
.storage-history-table__row strong,
.storage-history-table__row p {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  line-height: 1.25;
}

.storage-history-table__row span {
  color: rgb(255 255 255 / 64%);
  font-size: px-to-vh(11);
  font-weight: 800;
}

.storage-history-table__row strong {
  color: #ffffff;
  font-size: px-to-vh(12);
  font-weight: 950;
}

.storage-history-table__row p {
  color: rgb(255 255 255 / 76%);
  font-size: px-to-vh(11);
  font-weight: 750;
}

@media (max-width: 900px) {
  .storage-item-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .storage-item-row button {
    width: 100%;
  }

  .storage-history-table__head {
    display: none;
  }

  .storage-history-table__row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.storage-items-block {
  grid-template-columns: repeat(2, minmax(px-to-vh(240), 1fr));
  align-items: start;
}

.storage-items-block > h2,
.storage-items-block > .property-empty-row {
  grid-column: 1 / -1;
}

.storage-item-row {
  width: 100%;
  min-height: px-to-vh(272);
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  grid-template-rows: px-to-vh(122) auto minmax(px-to-vh(40), auto);
  align-items: stretch;
  gap: px-to-vh(12);
  padding: px-to-vh(12);
  border-color: #2a2a31;
  border-radius: px-to-vh(10);
  background: #09090b !important;
}

.storage-item-row__preview {
  position: relative;
  width: 100%;
  height: px-to-vh(122);
  display: grid;
  place-items: center;
  border: px-to-vh(1) solid #2b2135;
  border-radius: px-to-vh(8);
  background:
    radial-gradient(circle at 18% 18%, rgb(255 255 255 / 12%), transparent 25%),
    radial-gradient(circle at 78% 20%, rgb(185 54 230 / 34%), transparent 30%),
    linear-gradient(180deg, #19141d 0%, #111016 48%, #060607 100%);
  color: #d56cff;
  overflow: hidden;
  box-sizing: border-box;
}

.storage-item-row__preview::before {
  content: '';
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: px-to-vh(18);
  height: px-to-vh(18);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgb(0 0 0 / 72%), transparent 72%);
}

.storage-item-row__preview > span {
  position: relative;
  z-index: 1;
  width: px-to-vh(72);
  height: px-to-vh(42);
  border: px-to-vh(2) solid currentColor;
  border-radius: px-to-vh(8);
  background:
    linear-gradient(135deg, rgb(255 255 255 / 16%), transparent 46%),
    rgb(185 54 230 / 16%);
  transform: rotate(-12deg) skew(-8deg, -4deg);
  box-shadow: inset px-to-vh(8) px-to-vh(8) 0 rgb(185 54 230 / 18%), 0 px-to-vh(10) px-to-vh(18) rgb(0 0 0 / 46%);
}

.storage-item-row__content {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: px-to-vh(10);
}

.storage-item-row__content header {
  min-width: 0;
  display: grid;
  gap: px-to-vh(4);
}

.storage-item-row__content strong {
  overflow: hidden;
  color: #ffffff;
  font-size: px-to-vh(16);
  font-weight: 950;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.storage-item-row__content header > span {
  color: rgb(255 255 255 / 68%);
  font-size: px-to-vh(11);
  font-weight: 850;
  line-height: 1.15;
}

.storage-item-row__facts {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: px-to-vh(8);
}

.storage-item-row__facts span {
  flex: 1 1 px-to-vh(92);
  min-width: px-to-vh(86);
  min-height: px-to-vh(44);
  display: grid;
  gap: px-to-vh(3);
  padding: px-to-vh(8);
  border: px-to-vh(1) solid #222228;
  border-radius: px-to-vh(7);
  background: #070708;
  color: rgb(255 255 255 / 82%);
  font-size: px-to-vh(11);
  font-weight: 850;
  line-height: 1.15;
  overflow-wrap: anywhere;
  box-sizing: border-box;
}

.storage-item-row__facts b {
  color: rgb(255 255 255 / 46%);
  font-size: px-to-vh(9);
  font-weight: 850;
  white-space: nowrap;
}

.storage-item-row__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: end;
  gap: px-to-vh(10);
}

.storage-item-row__actions button {
  width: 100%;
  min-width: 0;
  min-height: px-to-vh(40);
  border-radius: px-to-vh(7);
}

@media (max-width: 900px) {
  .storage-items-block {
    grid-template-columns: minmax(0, 1fr);
  }
}

.storage-item-row__preview img {
  position: relative;
  z-index: 1;
  width: min(72%, px-to-vh(92));
  height: min(72%, px-to-vh(92));
  object-fit: contain;
  object-position: center;
}

.property-details {
  height: 100%;
  min-height: 0;
  align-items: stretch;
  overflow: hidden;
}

.property-panel {
  height: 100%;
  min-height: 0;
  display: grid !important;
  grid-template-rows: px-to-vh(58) minmax(0, 1fr);
  overflow: hidden;
}

.property-tabs {
  height: px-to-vh(58);
  min-height: px-to-vh(58);
  max-height: px-to-vh(58);
  flex: 0 0 px-to-vh(58);
  display: flex;
  align-items: center;
  align-self: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  box-sizing: border-box;
}

.property-tabs__tab {
  flex: 0 0 auto;
  height: px-to-vh(34);
  min-height: px-to-vh(34);
  max-height: px-to-vh(34);
  box-sizing: border-box;
}

.property-panel__content {
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.property-sidebar__actions .property-sidebar__lock-button--locked {
  border-color: #ff4d64;
  background: #ff4d64;
  color: #ffffff;
}

.property-sidebar__actions .property-sidebar__lock-button--locked:hover,
.property-sidebar__actions .property-sidebar__lock-button--locked:focus-visible {
  border-color: #ff7487;
  background: #ff304d;
  color: #ffffff;
}
</style>
