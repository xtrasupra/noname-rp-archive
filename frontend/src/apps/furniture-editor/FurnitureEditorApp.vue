<template>
  <div v-if="visible" class="furniture-editor" data-interface="furnitureEditor">
    <LeftHint />

    <FurnitureList
      :categories="categories"
      :collapsed="uiHidden"
      :current-category="currentCategory"
      :items="filteredItems"
      :selected-id="selectedItem?.id ?? null"
      :title="title"
      @buy="buyFurniture"
      @change-category="changeCategory"
      @close="closeEditor"
      @delete="deleteFurniture"
      @delete-all="deleteAllFurniture"
      @find="findFurniture"
      @move="moveFurniture"
      @select="selectItem"
      @toggle-hidden="toggleInterfaceHidden"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { FurnitureEditorItem, FurnitureEditorPayload } from '@/shared/contracts/ui'

import fallbackSofa from './assets/images/sofa.png'
import FurnitureList from './components/FurnitureList.vue'
import LeftHint from './components/LeftHint.vue'

const props = defineProps<{
  payload?: FurnitureEditorPayload
}>()

type FurnitureEditorWindowApi = {
  close: () => void
  open: (payload?: FurnitureEditorPayload | string | null) => void
  setHidden: (hidden: boolean) => void
  setPayload: (payload?: FurnitureEditorPayload | string | null) => void
  toggleHidden: () => void
}

type FurnitureEditorWindow = Window & {
  TWINKLE_FURNITURE_EDITOR?: FurnitureEditorWindowApi
}

const defaultCategories = [
  'Диваны',
  'Кровати',
  'Столы',
  'Стулья',
  'Шкафы',
  'Техника',
  'Декор',
  'Освещение',
  'Картины',
  'Растения',
  'Кухня',
  'Ванная',
  'Хранилища',
  'Премиум-мебель',
]

const mockFurniture: FurnitureEditorItem[] = [
  {
    id: 1,
    category: 'Диваны',
    image: fallbackSofa,
    inRoom: true,
    model: 'prop_couch_lg_02',
    name: 'Диван',
    price: 10000000,
  },
  {
    id: 2,
    category: 'Диваны',
    image: fallbackSofa,
    inRoom: false,
    model: 'prop_couch_03',
    name: 'Диван Modern',
    price: 250000,
  },
  {
    id: 3,
    category: 'Диваны',
    image: fallbackSofa,
    inRoom: true,
    model: 'prop_couch_lg_05',
    name: 'Luxury',
    price: 420000,
  },
  {
    id: 4,
    category: 'Диваны',
    image: fallbackSofa,
    inRoom: false,
    model: 'prop_couch_lg_06',
    name: 'Classic',
    price: 150000,
  },
  {
    id: 5,
    category: 'Диваны',
    image: fallbackSofa,
    inRoom: false,
    model: 'prop_couch_lg_07',
    name: 'Loft',
    price: 190000,
  },
  {
    id: 6,
    category: 'Диваны',
    image: fallbackSofa,
    inRoom: true,
    model: 'prop_couch_lg_08',
    name: 'Premium',
    price: 900000,
  },
]

const visible = ref(true)
const uiHidden = ref(false)
const currentCategory = ref(defaultCategories[0])
const selectedItem = ref<FurnitureEditorItem | null>(null)
const title = ref('Редактор мебели')
const propertyKind = ref<FurnitureEditorPayload['propertyKind']>('apartment')
const propertyId = ref<string | number | null>(null)
const furniture = ref<FurnitureEditorItem[]>(mockFurniture)
const payloadCategories = ref<string[]>([])

const categories = computed(() => {
  const known = new Set<string>()

  for (const category of defaultCategories) {
    known.add(category)
  }

  for (const category of payloadCategories.value) {
    known.add(category)
  }

  for (const item of furniture.value) {
    if (item.category) {
      known.add(item.category)
    }
  }

  return [...known]
})

const filteredItems = computed(() =>
  furniture.value.filter((item) => item.category === currentCategory.value),
)

function parsePayload(payload?: FurnitureEditorPayload | string | null): FurnitureEditorPayload {
  if (!payload) {
    return {}
  }

  if (typeof payload === 'object') {
    return payload
  }

  try {
    return JSON.parse(payload) as FurnitureEditorPayload
  } catch {
    return {}
  }
}

function normalizeItem(item: FurnitureEditorItem): FurnitureEditorItem {
  return {
    ...item,
    image: item.image || fallbackSofa,
    inRoom: Boolean(item.inRoom),
    price: Number(item.price || 0),
  }
}

function applyPayload(payload?: FurnitureEditorPayload | string | null) {
  const nextPayload = parsePayload(payload)
  const nextItems = nextPayload.items?.map(normalizeItem)

  visible.value = nextPayload.visible ?? true
  title.value = nextPayload.title || 'Редактор мебели'
  propertyKind.value = nextPayload.propertyKind ?? propertyKind.value
  propertyId.value = nextPayload.propertyId ?? propertyId.value
  payloadCategories.value = nextPayload.categories ?? []
  furniture.value = nextItems?.length ? nextItems : mockFurniture

  const nextCategory = nextPayload.currentCategory
    ?? furniture.value.find((item) => item.category === currentCategory.value)?.category
    ?? furniture.value[0]?.category
    ?? defaultCategories[0]

  currentCategory.value = nextCategory
  selectedItem.value = furniture.value.find((item) => item.id === nextPayload.selectedId) ?? null
}

function buildActionPayload(id?: string | number) {
  const item = id == null ? null : furniture.value.find((entry) => entry.id === id) ?? null

  return JSON.stringify({
    furnitureId: id ?? null,
    item,
    propertyId: propertyId.value,
    propertyKind: propertyKind.value,
  })
}

function emitEditorAction(eventName: string, id?: string | number) {
  callClientEvent(eventName, buildActionPayload(id))
}

function changeCategory(category: string) {
  currentCategory.value = category
  selectedItem.value = null
}

function selectItem(id: string | number) {
  selectedItem.value = furniture.value.find((item) => item.id === id) ?? null
}

function closeEditor() {
  visible.value = false
  callClientEvent('furnitureEditor:closeFromBrowser')
}

function setInterfaceHidden(hidden: boolean) {
  uiHidden.value = Boolean(hidden)
}

function toggleInterfaceHidden() {
  uiHidden.value = !uiHidden.value
  callClientEvent('furnitureEditor:toggleHiddenFromBrowser')
}

function moveFurniture(id: string | number) {
  emitEditorAction('furnitureEditor:moveFromBrowser', id)
}

function findFurniture(id: string | number) {
  emitEditorAction('furnitureEditor:findFromBrowser', id)
}

function deleteFurniture(id: string | number) {
  emitEditorAction('furnitureEditor:deleteFromBrowser', id)
}

function deleteAllFurniture() {
  emitEditorAction('furnitureEditor:deleteAllFromBrowser')
}

function buyFurniture(id: string | number) {
  emitEditorAction('furnitureEditor:buyFromBrowser', id)
}

function handleUpdate(event: Event) {
  applyPayload((event as CustomEvent<FurnitureEditorPayload | string>).detail)
}

function handleClose() {
  visible.value = false
  uiHidden.value = false
}

function handleHidden(event: Event) {
  const detail = (event as CustomEvent<{ hidden?: boolean }>).detail
  uiHidden.value = Boolean(detail?.hidden)
}

watch(
  () => props.payload,
  (payload) => applyPayload(payload),
  { deep: true, immediate: true },
)

onMounted(() => {
  const api: FurnitureEditorWindowApi = {
    close: handleClose,
    open(payload) {
      applyPayload(payload)
      visible.value = true
      uiHidden.value = false
    },
    setHidden: setInterfaceHidden,
    setPayload: applyPayload,
    toggleHidden() {
      setInterfaceHidden(!uiHidden.value)
    },
  }

  ;(window as FurnitureEditorWindow).TWINKLE_FURNITURE_EDITOR = api
  window.addEventListener('twinkle:furnitureEditor:update', handleUpdate)
  window.addEventListener('twinkle:furnitureEditor:close', handleClose)
  window.addEventListener('twinkle:furnitureEditor:hidden', handleHidden)
  callClientEvent('furnitureEditor:readyFromBrowser')
})

onBeforeUnmount(() => {
  window.removeEventListener('twinkle:furnitureEditor:update', handleUpdate)
  window.removeEventListener('twinkle:furnitureEditor:close', handleClose)
  window.removeEventListener('twinkle:furnitureEditor:hidden', handleHidden)
  delete (window as FurnitureEditorWindow).TWINKLE_FURNITURE_EDITOR
})
</script>

<style scoped>
.furniture-editor {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: transparent;
  color: #ffffff;
  font-family: "SF Pro Display", "SF Pro", "Segoe UI", sans-serif;
  font-size: 11px;
  line-height: 1.19;
  user-select: none;
}
</style>
