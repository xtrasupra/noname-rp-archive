<template>
  <main class="inventory-page" @click="closeContextMenu">
    <section class="inventory-window" aria-label="Инвентарь">
      <section class="inventory-panel inventory-panel--environment">
        <header class="inventory-header">
          <strong>{{ environmentTitle }}</strong>
          <span v-if="environmentType === 'world'">Перетащите предмет, чтобы выбросить</span>
        </header>

        <div class="inventory-grid inventory-grid--environment">
          <button
            v-for="(uid, slot) in environmentSlots"
            :key="slot"
            class="inventory-slot"
            type="button"
            :disabled="!environmentActive"
            :draggable="Boolean(uid)"
            :class="getDropSlotClass('environment', slot)"
            @dragstart="startDrag('environment', slot)"
            @dragend="clearDragState"
            @dragenter.prevent="setDragOverTarget('environment', slot)"
            @dragover.prevent="setDragOverTarget('environment', slot)"
            @dragleave="clearDragOverTarget('environment', slot)"
            @drop="dropToEnvironment(slot)"
            @contextmenu.prevent="openContextMenu($event, uid, 'environment', slot)"
          >
            <InventoryItemView v-if="uid && items[uid]" :item="items[uid]" />
          </button>
        </div>
      </section>

      <section class="inventory-character-panel">
        <header class="inventory-center__title">Инвентарь</header>

        <div class="inventory-equipment">
          <div class="inventory-equipment__column">
            <button
              v-for="slot in leftEquipment"
              :key="slot"
              class="inventory-slot inventory-slot--equipment"
              type="button"
              draggable="true"
              :title="equipmentLabels[slot]"
              :class="getDropSlotClass('equipment', slot)"
              @dragstart="startDrag('equipment', slot)"
              @dragend="clearDragState"
              @dragenter.prevent="setDragOverTarget('equipment', slot)"
              @dragover.prevent="setDragOverTarget('equipment', slot)"
              @dragleave="clearDragOverTarget('equipment', slot)"
              @drop="dropToEquipment(slot)"
              @contextmenu.prevent="openContextMenu($event, equipment[slot], 'equipment', slot)"
            >
              <span class="inventory-slot__hint">{{ equipmentLabels[slot] }}</span>
              <InventoryItemView v-if="equipment[slot]" :item="items[equipment[slot]]" />
            </button>
          </div>

          <img
            class="inventory-character"
            src="/Gemini_Generated_Image_xc8n7ixc8n7ixc8n%202.png"
            alt=""
            aria-hidden="true"
          >

          <div class="inventory-equipment__column">
            <button
              v-for="slot in rightEquipment"
              :key="slot"
              class="inventory-slot inventory-slot--equipment"
              type="button"
              draggable="true"
              :title="equipmentLabels[slot]"
              :class="getDropSlotClass('equipment', slot)"
              @dragstart="startDrag('equipment', slot)"
              @dragend="clearDragState"
              @dragenter.prevent="setDragOverTarget('equipment', slot)"
              @dragover.prevent="setDragOverTarget('equipment', slot)"
              @dragleave="clearDragOverTarget('equipment', slot)"
              @drop="dropToEquipment(slot)"
              @contextmenu.prevent="openContextMenu($event, equipment[slot], 'equipment', slot)"
            >
              <span class="inventory-slot__hint">{{ equipmentLabels[slot] }}</span>
              <InventoryItemView v-if="equipment[slot]" :item="items[equipment[slot]]" />
            </button>
          </div>
        </div>

        <div class="inventory-player">
          <strong>{{ playerName }}</strong>
          <span>#{{ playerStatic }}</span>
        </div>

        <div class="inventory-vitals">
          <div class="inventory-vital inventory-vital--health">
            <img class="inventory-vital__icon" src="/icon-chel.png" alt="">
            <i><span :style="{ width: `${vitals.health}%` }"></span></i>
            <small>{{ Math.round(vitals.health) }}</small>
          </div>
          <div class="inventory-vital inventory-vital--food">
            <img class="inventory-vital__icon" src="/icon-sticer.png" alt="">
            <i><span :style="{ width: `${vitals.food}%` }"></span></i>
            <small>{{ Math.round(vitals.food) }}</small>
          </div>
          <div class="inventory-vital inventory-vital--water">
            <img class="inventory-vital__icon" src="/wifi.png" alt="">
            <i><span :style="{ width: `${vitals.water}%` }"></span></i>
            <small>{{ Math.round(vitals.water) }}</small>
          </div>
        </div>

        <section class="inventory-quick-section">
          <header class="inventory-header inventory-header--quick">
            <strong>Быстрые слоты</strong>
            <span>Только предметы с быстрым использованием</span>
          </header>

          <div class="inventory-quick">
            <button
              v-for="(_, index) in quickSlots"
              :key="index"
              class="inventory-slot inventory-slot--quick"
              type="button"
              draggable="true"
              :title="`Быстрый слот ${index + 1}`"
              :class="[
                getDropSlotClass('quick', index),
                { 'inventory-slot--quick-active': Boolean(quickSlots[index] && quickSlots[index] === activeQuickUid) },
              ]"
              @dragstart="startDrag('quick', index)"
              @dragend="clearDragState"
              @dragenter.prevent="setDragOverTarget('quick', index)"
              @dragover.prevent="setDragOverTarget('quick', index)"
              @dragleave="clearDragOverTarget('quick', index)"
              @drop="dropToQuick(index)"
              @contextmenu.prevent="openContextMenu($event, quickSlots[index], 'quick', index)"
            >
              <span class="inventory-slot__key">{{ index + 1 }}</span>
              <InventoryItemView v-if="quickSlots[index]" :item="items[quickSlots[index]]" />
            </button>
          </div>
        </section>
      </section>

      <section class="inventory-panel inventory-panel--player">
        <header class="inventory-header">
          <strong>Предметы игрока</strong>
          <span :class="{ 'inventory-header__weight--danger': isOverweight }">
            {{ currentWeight.toFixed(1) }}/{{ maxWeight }} kg
          </span>
        </header>

        <div class="inventory-weight" :class="{ 'inventory-weight--danger': isOverweight }">
          <i :style="{ width: `${weightPercent}%` }"></i>
        </div>

        <div class="inventory-grid inventory-grid--player">
          <button
            v-for="(_, index) in inventorySlots"
            :key="index"
            class="inventory-slot"
            type="button"
            draggable="true"
            :class="getDropSlotClass('inventory', index)"
            @dragstart="startDrag('inventory', index)"
            @dragend="clearDragState"
            @dragenter.prevent="setDragOverTarget('inventory', index)"
            @dragover.prevent="setDragOverTarget('inventory', index)"
            @dragleave="clearDragOverTarget('inventory', index)"
            @drop="dropToInventory(index)"
            @contextmenu.prevent="openContextMenu($event, inventorySlots[index], 'inventory', index)"
          >
            <InventoryItemView v-if="inventorySlots[index]" :item="items[inventorySlots[index]]" />
          </button>
        </div>
      </section>
    </section>

    <div
      v-if="contextMenu.visible && contextItem"
      class="inventory-context"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button
        v-for="action in contextActions"
        :key="action"
        type="button"
        @click="runAction(action)"
      >
        {{ action === 'use' && contextItem?.itemId === 'hunting_mask_suit' ? 'Надеть / снять' : actionLabels[action] }}
      </button>
    </div>

    <section v-if="splitState.visible && splitItem" class="inventory-modal" @click.self="closeSplitModal">
      <form class="inventory-split" @submit.prevent="splitStack">
        <h2>Разделить предмет</h2>
        <p>{{ splitItem.name }}: {{ splitItem.amount }} шт.</p>

        <label>
          Количество
          <input v-model.number="splitState.amount" type="number" min="1" :max="splitItem.amount - 1">
        </label>

        <div class="inventory-split__actions">
          <button type="button" @click="closeSplitModal">Отмена</button>
          <button type="submit">Разделить</button>
        </div>
      </form>
    </section>

    <section v-if="infoState.visible && infoItem" class="inventory-modal" @click.self="closeInfoModal">
      <article class="inventory-info">
        <header class="inventory-info__header">
          <span class="inventory-info__icon">{{ infoItem.icon }}</span>
          <div>
            <h2>{{ infoItem.name }}</h2>
            <p>{{ infoItem.type }}</p>
          </div>
        </header>

        <dl class="inventory-info__stats">
          <div v-for="row in infoRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>

        <button type="button" class="inventory-info__close" @click="closeInfoModal">Закрыть</button>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'

type EquipmentSlot =
  | 'hat'
  | 'mask'
  | 'glasses'
  | 'ears'
  | 'clothes'
  | 'undershirt'
  | 'gloves'
  | 'armor'
  | 'bag'
  | 'accessory'
  | 'chain'
  | 'legs'
  | 'shoes'
  | 'decals'
  | 'watch'
  | 'bracelet'
type ServerEquipmentSlot = EquipmentSlot | 'top' | 'weaponPrimary' | 'weaponSecondary'
type InventorySource = 'inventory' | 'equipment' | 'quick' | 'environment'
type ItemAction = 'use' | 'quick' | 'give' | 'drop' | 'split' | 'equip' | 'unequip' | 'info'

type InventoryItem = {
  actions: ItemAction[]
  amount: number
  equipSlot?: ServerEquipmentSlot
  icon: string
  id: string
  name: string
  quick: boolean
  stackable: boolean
  type: string
  usable: boolean
  weight: number
  uid?: string
  itemId?: string
  durability?: number
  maxDurability?: number
  maskRemainingMs?: number
  maskActivatedAt?: number
}

type InventoryPayload = {
  player?: {
    name?: string
    static?: number | string
  }
  maxWeight?: number
  currentWeight?: number
  activeQuickUid?: string | null
  slots?: Array<string | null>
  quick?: Array<string | null>
  equipment?: Record<string, string | null>
  items?: Record<string, InventoryItem>
  vitalsState?: unknown
  environment?: {
    type?: string
    title?: string
    ownerStaticId?: number
    slots?: Array<string | null>
    items?: Record<string, InventoryItem>
  } | null
}

type InventoryVitalsPayload = {
  contractVersion: 1
  revision: number
  vitals: {
    health: number
    food: number
    water: number
  }
}

const props = defineProps<{
  payload?: InventoryPayload
}>()

type DragState = {
  from: InventorySource
  index: number | EquipmentSlot
} | null

type DropTarget = {
  source: InventorySource
  index: number | EquipmentSlot
} | null

const InventoryItemView = defineComponent({
  props: {
    item: {
      required: true,
      type: Object as () => InventoryItem,
    },
  },
  setup(props) {
    return () => {
      const maximum = Math.max(0, Number(props.item.maxDurability || 0))
      const durability = maximum > 0
        ? Math.max(0, Math.min(maximum, Number(props.item.durability ?? maximum)))
        : 0
      const durabilityText = maximum > 0 ? `\nПрочность: ${durability}/${maximum}` : ''

      return h('span', {
        class: 'inventory-item',
        title: `${props.item.name}\n${props.item.type}\nВес: ${(props.item.weight * props.item.amount).toFixed(1)} kg${durabilityText}`,
      }, [
        h('span', { class: 'inventory-item__icon' }, props.item.icon),
        h('span', { class: 'inventory-item__name' }, props.item.name),
        props.item.amount > 1
          ? h('span', { class: 'inventory-item__amount' }, props.item.amount)
          : null,
        maximum > 0
          ? h('span', { class: 'inventory-item__durability' }, `${Math.round((durability / maximum) * 100)}%`)
          : null,
      ])
    }
  },
})

const maxWeight = ref(75)
const payloadWeight = ref(0)
const playerName = ref('Игрок')
const playerStatic = ref<number | string>(0)
const activeQuickUid = ref<string | null>(null)
const vitals = reactive({ health: 100, food: 100, water: 100 })
let latestVitalsRevision = -1
const environmentSlots = ref<(string | null)[]>(Array.from({ length: 50 }, () => null))
const environmentTitle = ref('Окружение')
const environmentActive = ref(false)
const environmentType = ref('')
const inventorySlots = ref<(string | null)[]>(Array.from({ length: 40 }, () => null))
const quickSlots = ref<(string | null)[]>(Array.from({ length: 5 }, () => null))

const leftEquipment: EquipmentSlot[] = [
  'hat', 'mask', 'glasses', 'ears', 'clothes', 'undershirt', 'gloves', 'armor',
]
const rightEquipment: EquipmentSlot[] = [
  'bag', 'accessory', 'chain', 'legs', 'shoes', 'decals', 'watch', 'bracelet',
]
const equipment = reactive<Record<EquipmentSlot, string | null>>({
  hat: null,
  mask: null,
  glasses: null,
  ears: null,
  clothes: null,
  undershirt: null,
  gloves: null,
  armor: null,
  bag: null,
  accessory: null,
  chain: null,
  legs: null,
  shoes: null,
  decals: null,
  watch: null,
  bracelet: null,
})

const equipmentLabels: Record<EquipmentSlot, string> = {
  accessory: 'Аксессуар',
  armor: 'Бронежилет',
  bag: 'Рюкзак',
  bracelet: 'Браслет',
  chain: 'Цепочка',
  clothes: 'Верхняя одежда',
  decals: 'Нашивки',
  ears: 'Украшения',
  glasses: 'Очки',
  gloves: 'Перчатки',
  hat: 'Головной убор',
  legs: 'Низ',
  mask: 'Маска',
  shoes: 'Обувь',
  undershirt: 'Майка',
  watch: 'Часы',
}

const items = reactive<Record<string, InventoryItem>>({
  ammo: {
    actions: ['split', 'give', 'drop', 'info'],
    amount: 90,
    icon: '▦',
    id: 'ammo',
    name: 'Патроны',
    quick: false,
    stackable: true,
    type: 'Боеприпасы',
    usable: false,
    weight: 0.03,
  },
  armor: {
    actions: ['equip', 'give', 'drop', 'info'],
    amount: 1,
    equipSlot: 'armor',
    icon: '▣',
    id: 'armor',
    name: 'Бронежилет',
    quick: false,
    stackable: false,
    type: 'Экипировка',
    usable: false,
    weight: 6,
  },
  burger: {
    actions: ['use', 'quick', 'split', 'give', 'drop', 'info'],
    amount: 4,
    icon: '◉',
    id: 'burger',
    name: 'Бургер',
    quick: true,
    stackable: true,
    type: 'Еда',
    usable: true,
    weight: 0.35,
  },
  cash: {
    actions: ['give', 'drop', 'split', 'info'],
    amount: 1250,
    icon: '$',
    id: 'cash',
    name: 'Наличные',
    quick: false,
    stackable: true,
    type: 'Деньги',
    usable: false,
    weight: 0,
  },
  medkit: {
    actions: ['use', 'quick', 'give', 'drop', 'info'],
    amount: 2,
    icon: '+',
    id: 'medkit',
    name: 'Аптечка',
    quick: true,
    stackable: true,
    type: 'Медицина',
    usable: true,
    weight: 0.8,
  },
  phone: {
    actions: ['use', 'give', 'drop', 'info'],
    amount: 1,
    icon: '▯',
    id: 'phone',
    name: 'Телефон',
    quick: false,
    stackable: false,
    type: 'Предмет',
    usable: true,
    weight: 0.2,
  },
  rifle: {
    actions: ['equip', 'give', 'drop', 'info'],
    amount: 1,
    equipSlot: 'weaponPrimary',
    icon: '⌁',
    id: 'rifle',
    name: 'Карабин',
    quick: false,
    stackable: false,
    type: 'Оружие',
    usable: false,
    weight: 3.4,
  },
  water: {
    actions: ['use', 'quick', 'split', 'give', 'drop', 'info'],
    amount: 6,
    icon: '◌',
    id: 'water',
    name: 'Вода',
    quick: true,
    stackable: true,
    type: 'Напиток',
    usable: true,
    weight: 0.5,
  },
})

const visibleEquipmentSlots: EquipmentSlot[] = [
  'hat',
  'mask',
  'glasses',
  'ears',
  'clothes',
  'undershirt',
  'gloves',
  'armor',
  'bag',
  'accessory',
  'chain',
  'legs',
  'shoes',
  'decals',
  'watch',
  'bracelet',
]

function normalizeSlots(value: Array<string | null> | undefined, size: number) {
  const slots = Array.from({ length: size }, () => null as string | null)

  if (Array.isArray(value)) {
    value.slice(0, size).forEach((uid, index) => {
      slots[index] = typeof uid === 'string' && uid ? uid : null
    })
  }

  return slots
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeVital(value: unknown, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(0, Math.min(100, numeric))
}

function applyInventoryVitals(rawPayload: unknown) {
  if (!isRecord(rawPayload)) return
  if (rawPayload.contractVersion !== 1) return

  const revision = rawPayload.revision
  if (
    typeof revision !== 'number'
    || !Number.isSafeInteger(revision)
    || revision < 0
    || revision < latestVitalsRevision
  ) return

  if (!isRecord(rawPayload.vitals)) return
  const rawVitals = rawPayload.vitals
  if (
    typeof rawVitals.health !== 'number'
    || !Number.isFinite(rawVitals.health)
    || typeof rawVitals.food !== 'number'
    || !Number.isFinite(rawVitals.food)
    || typeof rawVitals.water !== 'number'
    || !Number.isFinite(rawVitals.water)
  ) return

  vitals.health = normalizeVital(rawVitals.health, vitals.health)
  vitals.food = normalizeVital(rawVitals.food, vitals.food)
  vitals.water = normalizeVital(rawVitals.water, vitals.water)
  latestVitalsRevision = revision
}

function applyInventoryPayload(rawPayload?: InventoryPayload & { payload?: InventoryPayload }) {
  const payload = rawPayload?.payload?.slots || rawPayload?.payload?.items
    ? rawPayload.payload
    : rawPayload

  if (!payload || (!Array.isArray(payload.slots) && !payload.items)) return

  playerName.value = String(payload.player?.name || 'Игрок')
  playerStatic.value = payload.player?.static || 0
  maxWeight.value = Math.max(1, Number(payload.maxWeight || 75))
  payloadWeight.value = Math.max(0, Number(payload.currentWeight || 0))
  activeQuickUid.value = typeof payload.activeQuickUid === 'string' ? payload.activeQuickUid : null
  applyInventoryVitals(payload.vitalsState)
  inventorySlots.value = normalizeSlots(payload.slots, 40)
  quickSlots.value = normalizeSlots(payload.quick, 5)
  environmentActive.value = Boolean(payload.environment?.type)
  environmentType.value = String(payload.environment?.type || '')
  environmentTitle.value = String(payload.environment?.title || 'Окружение')
  environmentSlots.value = normalizeSlots(payload.environment?.slots, 50)

  Object.keys(items).forEach((uid) => delete items[uid])
  Object.entries(payload.items || {}).forEach(([uid, item]) => {
    if (!item) return

    items[uid] = {
      ...item,
      uid: item.uid || uid,
      itemId: item.itemId || item.id,
      id: item.id || item.itemId || uid,
      amount: Math.max(1, Number(item.amount || 1)),
      actions: Array.isArray(item.actions) ? item.actions : ['info'],
    }
  })
  Object.entries(payload.environment?.items || {}).forEach(([uid, item]) => {
    if (!item) return
    items[uid] = {
      ...item,
      uid: item.uid || uid,
      itemId: item.itemId || item.id,
      id: item.id || item.itemId || uid,
      amount: Math.max(1, Number(item.amount || 1)),
      actions: Array.isArray(item.actions) ? item.actions : ['info'],
    }
  })

  const incomingEquipment = payload.equipment || {}
  visibleEquipmentSlots.forEach((slot) => {
    if (slot === 'clothes') {
      equipment[slot] = incomingEquipment.clothes || incomingEquipment.top || null
      return
    }

    equipment[slot] = incomingEquipment[slot] || null
  })

}

function handleInventoryPayload(event: Event) {
  applyInventoryPayload((event as CustomEvent<InventoryPayload>).detail)
}

function handleInventoryVitals(event: Event) {
  applyInventoryVitals((event as CustomEvent<InventoryVitalsPayload>).detail)
}

watch(() => props.payload, (payload) => applyInventoryPayload(payload), {
  immediate: true,
  deep: true,
})

onMounted(() => {
  window.addEventListener('twinkle:inventory:open', handleInventoryPayload)
  window.addEventListener('twinkle:inventory:setPayload', handleInventoryPayload)
  window.addEventListener('twinkle:inventory:vitals', handleInventoryVitals)

  const initialPayload = (window as typeof window & {
    __INVENTORY_PAYLOAD__?: InventoryPayload
  }).__INVENTORY_PAYLOAD__

  if (initialPayload) applyInventoryPayload(initialPayload)
})

onBeforeUnmount(() => {
  window.removeEventListener('twinkle:inventory:open', handleInventoryPayload)
  window.removeEventListener('twinkle:inventory:setPayload', handleInventoryPayload)
  window.removeEventListener('twinkle:inventory:vitals', handleInventoryVitals)
})

const actionLabels: Record<ItemAction, string> = {
  drop: 'Выбросить',
  equip: 'Экипировать',
  give: 'Передать',
  info: 'Открыть информацию',
  quick: 'Добавить в быстрый слот',
  split: 'Разделить',
  unequip: 'Снять',
  use: 'Использовать',
}

const dragState = ref<DragState>(null)
const dragOverTarget = ref<DropTarget>(null)
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  itemId: null as string | null,
  source: null as InventorySource | null,
  index: null as number | EquipmentSlot | null,
})
const splitState = reactive({
  amount: 1,
  itemId: null as string | null,
  visible: false,
})
const infoState = reactive({
  itemId: null as string | null,
  visible: false,
})

const currentWeight = computed(() => payloadWeight.value)
const weightPercent = computed(() => Math.min(100, (currentWeight.value / maxWeight.value) * 100))
const isOverweight = computed(() => currentWeight.value > maxWeight.value)
const contextItem = computed(() => contextMenu.itemId ? items[contextMenu.itemId] : null)
const splitItem = computed(() => splitState.itemId ? items[splitState.itemId] : null)
const infoItem = computed(() => infoState.itemId ? items[infoState.itemId] : null)
const infoRows = computed(() => {
  const item = infoItem.value
  if (!item) {
    return []
  }

  const rows = [
    { label: 'Количество', value: `${item.amount} шт.` },
    { label: 'Вес', value: `${(item.weight * item.amount).toFixed(1)} kg` },
    { label: 'Вес за единицу', value: `${item.weight.toFixed(2)} kg` },
    { label: 'Использование', value: item.usable ? 'Можно использовать' : 'Нельзя использовать' },
    { label: 'Быстрый слот', value: canMoveToQuickSlot(item) ? 'Доступен' : 'Недоступен' },
    { label: 'Складывание', value: item.stackable ? 'Складывается' : 'Не складывается' },
  ]

  const maximum = Math.max(0, Number(item.maxDurability || 0))
  if (maximum > 0) {
    const durability = Math.max(0, Math.min(maximum, Number(item.durability ?? maximum)))
    rows.splice(1, 0, { label: 'Прочность', value: `${durability}/${maximum}` })
  }

  if (item.itemId === 'hunting_mask_suit') {
    rows.splice(1, 0, {
      label: 'Маскировка',
      value: equipment.clothes === item.uid ? 'надет' : 'снят',
    })
  }

  return rows
})
const contextActions = computed(() => {
  const item = contextItem.value
  if (!item) {
    return []
  }

  const actions = [...item.actions]
  if (
    contextMenu.source === 'equipment' &&
    item.itemId !== 'hunting_mask_suit' &&
    !actions.includes('unequip')
  ) {
    actions.unshift('unequip')
  }

  return actions.filter((action) => {
    if (
      item.itemId === 'hunting_mask_suit' &&
      contextMenu.source === 'equipment' &&
      (action === 'drop' || action === 'give')
    ) {
      return false
    }

    if (action === 'use') {
      return item.usable
    }

    if (action === 'quick') {
      return item.quick
    }

    if (action === 'split') {
      return item.stackable && item.amount > 1
    }

    if (action === 'equip') {
      return Boolean(item.equipSlot) &&
        item.equipSlot !== 'weaponPrimary' &&
        item.equipSlot !== 'weaponSecondary' &&
        contextMenu.source !== 'equipment'
    }

    if (action === 'unequip') {
      return contextMenu.source === 'equipment'
    }

    return true
  })
})

function startDrag(from: InventorySource, index: number | EquipmentSlot) {
  const itemId = getSlotValue(from, index)
  dragState.value = itemId ? { from, index } : null
  dragOverTarget.value = null
}

function dropToInventory(index: number) {
  if (dragState.value?.from === 'environment' && inventorySlots.value[index]) {
    dragOverTarget.value = null
    return
  }
  moveDraggedItem('inventory', index)
}

function dropToQuick(index: number) {
  const draggedItem = getDraggedItem()
  if (dragState.value?.from === 'environment' || !draggedItem || !canMoveToQuickSlot(draggedItem)) {
    dragOverTarget.value = null
    return
  }

  moveDraggedItem('quick', index)
}

function dropToEnvironment(index: number) {
  const draggedItem = getDraggedItem()
  const acceptsItem = dragState.value?.from !== 'environment' && (
    environmentType.value === 'world' ||
    environmentType.value === 'hunting_vehicle' ||
    draggedItem?.itemId === 'hunting_carcass_bag'
  )
  if (!environmentActive.value || !draggedItem || !acceptsItem) {
    dragOverTarget.value = null
    return
  }
  moveDraggedItem('environment', index)
}

function dropToEquipment(slot: EquipmentSlot) {
  const draggedItem = getDraggedItem()
  const compatibleSlot = slot === 'clothes' ? 'top' : slot
  if (dragState.value?.from === 'environment' || !draggedItem?.equipSlot || draggedItem.equipSlot !== compatibleSlot) {
    dragOverTarget.value = null
    return
  }

  moveDraggedItem('equipment', slot)
}

function setDragOverTarget(source: InventorySource, index: number | EquipmentSlot) {
  if (!dragState.value) {
    return
  }

  dragOverTarget.value = { source, index }
}

function clearDragOverTarget(source: InventorySource, index: number | EquipmentSlot) {
  if (!isDropTarget(source, index)) {
    return
  }

  dragOverTarget.value = null
}

function clearDragState() {
  dragState.value = null
  dragOverTarget.value = null
}

function getDropSlotClass(source: InventorySource, index: number | EquipmentSlot) {
  if (!dragState.value || !isDropTarget(source, index)) {
    return null
  }

  return canDropTo(source, index)
    ? 'inventory-slot--drop-allowed'
    : 'inventory-slot--drop-denied'
}

function isDropTarget(source: InventorySource, index: number | EquipmentSlot) {
  return dragOverTarget.value?.source === source && dragOverTarget.value.index === index
}

function canDropTo(source: InventorySource, index: number | EquipmentSlot) {
  const draggedItem = getDraggedItem()
  if (!draggedItem) {
    return false
  }

  if (dragState.value?.from === 'environment') {
    return source === 'inventory' && !inventorySlots.value[index as number]
  }

  if (source === 'quick') {
    return canMoveToQuickSlot(draggedItem)
  }

  if (source === 'equipment') {
    return draggedItem.equipSlot === (index === 'clothes' ? 'top' : index)
  }

  if (source === 'environment') {
    return environmentActive.value && (
      environmentType.value === 'world' ||
      environmentType.value === 'hunting_vehicle' ||
      draggedItem.itemId === 'hunting_carcass_bag'
    )
  }

  return true
}

function canMoveToQuickSlot(item: InventoryItem) {
  return item.quick || item.equipSlot === 'weaponPrimary' || item.equipSlot === 'weaponSecondary'
}

function moveDraggedItem(to: InventorySource, index: number | EquipmentSlot) {
  if (!dragState.value) {
    return
  }

  const origin = { ...dragState.value }
  const itemId = getSlotValue(origin.from, origin.index)
  if (!itemId) {
    return
  }

  const draggedItem = items[itemId]
  if (
    draggedItem?.itemId === 'hunting_mask_suit' &&
    (origin.from === 'equipment' || to === 'equipment')
  ) {
    callClientEvent('inventory:cef:action', JSON.stringify({
      uid: itemId,
      action: 'use',
      source: origin.from,
      index: origin.index,
    }))
    clearDragState()
    return
  }

  callClientEvent('inventory:cef:move', JSON.stringify({
    from: { source: origin.from, index: origin.index, uid: itemId },
    to: { source: to, index },
  }))
  clearDragState()
}

function getDraggedItem() {
  if (!dragState.value) {
    return null
  }

  const itemId = getSlotValue(dragState.value.from, dragState.value.index)
  return itemId ? items[itemId] : null
}

function getSlotValue(from: InventorySource, index: number | EquipmentSlot) {
  if (from === 'inventory') {
    return inventorySlots.value[index as number]
  }

  if (from === 'quick') {
    return quickSlots.value[index as number]
  }

  if (from === 'environment') {
    return environmentSlots.value[index as number]
  }

  return equipment[index as EquipmentSlot]
}

function openContextMenu(event: MouseEvent, itemId: string | null, source: InventorySource, index: number | EquipmentSlot) {
  closeContextMenu()

  if (!itemId) {
    return
  }

  contextMenu.visible = true
  contextMenu.x = Math.max(8, Math.min(event.clientX, window.innerWidth - 230))
  contextMenu.y = Math.max(8, Math.min(event.clientY, window.innerHeight - 330))
  contextMenu.itemId = itemId
  contextMenu.source = source
  contextMenu.index = index
}

function closeContextMenu() {
  contextMenu.visible = false
}

function runAction(action: ItemAction) {
  const item = contextItem.value
  const uid = contextMenu.itemId
  if (!item || !uid) {
    return
  }

  if (action === 'split') {
    splitState.itemId = uid
    splitState.amount = 1
    splitState.visible = true
    closeContextMenu()
    return
  }

  if (action === 'info') {
    infoState.itemId = uid
    infoState.visible = true
    closeContextMenu()
    return
  }

  if (action === 'quick' && contextMenu.index !== null && contextMenu.source) {
    const freeSlot = quickSlots.value.findIndex((slot) => slot === null)
    if (freeSlot >= 0) {
      callClientEvent('inventory:cef:move', JSON.stringify({
        from: { source: contextMenu.source, index: contextMenu.index },
        to: { source: 'quick', index: freeSlot },
      }))
    }
  } else {
    callClientEvent('inventory:cef:action', JSON.stringify({
      uid,
      action,
      source: contextMenu.source,
      index: contextMenu.index,
      amount: action === 'drop' ? item.amount : undefined,
    }))
  }

  closeContextMenu()
}

function splitStack() {
  const item = splitItem.value
  const uid = splitState.itemId
  if (!item || !uid || splitState.amount <= 0 || splitState.amount >= item.amount) {
    return
  }

  callClientEvent('inventory:cef:action', JSON.stringify({
    uid,
    action: 'split',
    amount: splitState.amount,
  }))
  closeSplitModal()
}

function closeSplitModal() {
  splitState.visible = false
  splitState.itemId = null
}

function closeInfoModal() {
  infoState.visible = false
  infoState.itemId = null
}
</script>

<style scoped>
.inventory-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 3vh;
  background: radial-gradient(circle at 50% 45%, rgb(16 22 28 / 12%), rgb(3 6 9 / 34%));
  color: #f4f4f4;
  font-family: "SF Pro Display", "Segoe UI", sans-serif;
  box-sizing: border-box;
}

.inventory-window {
  width: min(142vh, calc(100vw - 6vh));
  height: min(88vh, calc(100vh - 6vh));
  display: grid;
  grid-template-columns: minmax(31vh, 1fr) minmax(34vh, 0.92fr) minmax(31vh, 1fr);
  gap: 2.2vh;
  padding: 2.2vh 2.5vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 2.6vh;
  background: linear-gradient(145deg, rgb(22 23 26 / 97%), rgb(12 13 15 / 97%));
  box-shadow: 0 2.4vh 9vh rgb(0 0 0 / 52%);
  overflow: hidden;
  box-sizing: border-box;
}

.inventory-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 1.1vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 1.4vh;
  background: rgb(255 255 255 / 1.8%);
}

.inventory-header,
.inventory-center__title {
  min-height: 3.4vh;
  display: flex;
  align-items: center;
  gap: 1vh;
  color: #f7f7f7;
  font-size: 1.35vh;
  font-weight: 800;
  line-height: 1;
}

.inventory-header span {
  color: rgb(255 255 255 / 42%);
  font-size: 1.2vh;
  font-weight: 700;
}

.inventory-panel--environment .inventory-header,
.inventory-panel--player .inventory-header {
  justify-content: space-between;
}

.inventory-header__weight--danger {
  color: #f05252 !important;
}

.inventory-center__title {
  justify-content: center;
}

.inventory-grid {
  display: grid;
  gap: 0.58vh;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.35vh;
  align-content: start;
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 18%) transparent;
}

.inventory-grid--environment {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-auto-rows: 6.15vh;
  flex: 1;
}

.inventory-grid--player {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-auto-rows: 6.15vh;
  margin-top: 0.8vh;
  flex: 1;
}

.inventory-slot {
  position: relative;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 0.72vh;
  background: linear-gradient(145deg, rgb(255 255 255 / 4.6%), rgb(255 255 255 / 2.2%));
  color: #ffffff;
  cursor: pointer;
  overflow: hidden;
}

.inventory-slot:disabled {
  cursor: default;
}

.inventory-slot:hover {
  border-color: rgb(255 255 255 / 16%);
  background: rgb(255 255 255 / 6%);
}

.inventory-slot--drop-allowed,
.inventory-slot--drop-denied {
  border-color: transparent;
}

.inventory-slot--drop-allowed::after,
.inventory-slot--drop-denied::after {
  position: absolute;
  inset: 0.38vh;
  z-index: 2;
  border-radius: 0.45vh;
  content: "";
  pointer-events: none;
}

.inventory-slot--drop-allowed::after {
  background-image:
    linear-gradient(rgb(58 151 255 / 20%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(58 151 255 / 20%) 1px, transparent 1px),
    linear-gradient(rgb(58 151 255 / 16%), rgb(58 151 255 / 16%));
  background-size: 1.05vh 1.05vh;
  box-shadow:
    inset 0 0 0 1px rgb(58 151 255 / 58%),
    inset 0 0 1.6vh rgb(58 151 255 / 22%),
    0 0 1.6vh rgb(58 151 255 / 18%);
}

.inventory-slot--drop-denied::after {
  background-image:
    linear-gradient(rgb(255 64 84 / 22%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 64 84 / 22%) 1px, transparent 1px),
    linear-gradient(rgb(255 64 84 / 17%), rgb(255 64 84 / 17%));
  background-size: 1.05vh 1.05vh;
  box-shadow:
    inset 0 0 0 1px rgb(255 64 84 / 60%),
    inset 0 0 1.6vh rgb(255 64 84 / 24%),
    0 0 1.6vh rgb(255 64 84 / 18%);
}

.inventory-slot--equipment {
  width: 5.45vh;
  height: 5.45vh;
}

.inventory-slot__hint {
  position: absolute;
  inset: auto 0.4vh 0.45vh;
  color: rgb(255 255 255 / 28%);
  font-size: 0.72vh;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  text-align: center;
}

.inventory-slot__key {
  position: absolute;
  top: 0.8vh;
  left: 0.85vh;
  color: rgb(255 255 255 / 46%);
  font-size: 1.25vh;
  font-weight: 800;
}

.inventory-item {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}

.inventory-item__icon {
  color: rgb(255 255 255 / 72%);
  font-size: 2.35vh;
  font-weight: 800;
}

.inventory-item__name {
  position: absolute;
  left: 0.5vh;
  right: 0.5vh;
  bottom: 0.45vh;
  color: rgb(255 255 255 / 58%);
  font-size: 0.72vh;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inventory-item__amount {
  position: absolute;
  right: 0.55vh;
  top: 0.45vh;
  color: #ffffff;
  font-size: 1.05vh;
  font-weight: 800;
}

.inventory-item__durability {
  position: absolute;
  left: 0.55vh;
  top: 0.45vh;
  color: #77ed91;
  font-size: 0.82vh;
  font-weight: 900;
}

.inventory-character-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.inventory-equipment {
  width: 100%;
  display: grid;
  grid-template-columns: 5.45vh 1fr 5.45vh;
  gap: 1.15vh;
  align-items: start;
}

.inventory-equipment__column {
  display: grid;
  gap: 0.5vh;
}

.inventory-character {
  width: 11.5vh;
  height: 31vh;
  display: block;
  justify-self: center;
  object-fit: contain;
  align-self: center;
  opacity: 0.86;
}

.inventory-player {
  margin-top: 0.5vh;
  font-size: 1.35vh;
  line-height: 1;
  display: flex;
  gap: 10px;
}

.inventory-player strong {
  color: #ffffff;
  font-weight: 900;
}

.inventory-player span {
  color: rgb(255 255 255 / 42%);
  font-weight: 800;
}

.inventory-vitals {
  width: min(25vh, 86%);
  display: grid;
  gap: 0.8vh;
  margin-top: 1.4vh;
}

.inventory-vital {
  display: grid;
  grid-template-columns: 2.2vh 1fr 2.5vh;
  align-items: center;
  gap: 0.6vh;
}

.inventory-vital i {
  position: relative;
  height: 0.32vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 12%);
  overflow: hidden;
}

.inventory-vital i span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.inventory-vital--health i span {
  background: #cc1d17;
}

.inventory-vital--food i span {
  background: #ffd914;
}

.inventory-vital--water i span {
  background: #2db4d7;
}

.inventory-vital small {
  color: rgb(255 255 255 / 46%);
  font-size: 0.8vh;
  font-weight: 800;
  text-align: right;
}

.inventory-vital__icon {
  width: 1.7vh;
  height: 1.7vh;
  display: block;
  object-fit: contain;
}

.inventory-quick-section {
  width: 100%;
  margin-top: auto;
  padding-top: 1.4vh;
}

.inventory-header--quick {
  justify-content: space-between;
}

.inventory-quick {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.58vh;
  margin-top: 0.7vh;
}

.inventory-slot--quick {
  height: 5.9vh;
}

.inventory-slot--quick-active {
  border-color: rgb(80 180 255 / 72%);
  background: linear-gradient(145deg, rgb(36 132 207 / 24%), rgb(255 255 255 / 3%));
  box-shadow: inset 0 0 1.2vh rgb(47 155 237 / 13%);
}

.inventory-weight {
  height: 0.55vh;
  margin-top: 0.3vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
  overflow: hidden;
}

.inventory-weight i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #ffffff;
}

.inventory-weight--danger i {
  background: #f05252;
}

.inventory-context {
  position: fixed;
  z-index: 50;
  min-width: 18vh;
  display: grid;
  gap: 0.25vh;
  padding: 0.45vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.8vh;
  background: rgb(12 12 12 / 96%);
  box-shadow: 0 1.2vh 3vh rgb(0 0 0 / 45%);
}

.inventory-context button {
  min-height: 3vh;
  padding: 0 1vh;
  border: 0;
  border-radius: 0.45vh;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 1.05vh;
  font-weight: 700;
  text-align: left;
}

.inventory-context button:hover {
  background: rgb(255 255 255 / 8%);
}

.inventory-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 45%);
}

.inventory-split {
  width: 28vh;
  display: grid;
  gap: 1.2vh;
  padding: 2vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 1.2vh;
  background: #151515;
}

.inventory-split h2,
.inventory-split p {
  margin: 0;
}

.inventory-split h2 {
  font-size: 1.65vh;
}

.inventory-split p,
.inventory-split label {
  color: rgb(255 255 255 / 72%);
  font-size: 1.15vh;
  font-weight: 700;
}

.inventory-split input {
  width: 100%;
  min-height: 3.5vh;
  margin-top: 0.55vh;
  padding: 0 1vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.6vh;
  background: #1f1f1f;
  color: #ffffff;
  box-sizing: border-box;
}

.inventory-split__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8vh;
}

.inventory-split__actions button {
  min-height: 3.4vh;
  border: 0;
  border-radius: 0.55vh;
  background: rgb(255 255 255 / 8%);
  color: #ffffff;
  cursor: pointer;
  font-weight: 800;
}

.inventory-split__actions button:last-child {
  background: #ffffff;
  color: #111111;
}

.inventory-info {
  width: 32vh;
  display: grid;
  gap: 1.4vh;
  padding: 2vh;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 1.2vh;
  background: #151515;
  box-shadow: 0 1.6vh 4vh rgb(0 0 0 / 42%);
}

.inventory-info__header {
  display: grid;
  grid-template-columns: 5.2vh 1fr;
  align-items: center;
  gap: 1vh;
}

.inventory-info__icon {
  width: 5.2vh;
  height: 5.2vh;
  display: grid;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.8vh;
  background: #1f1f1f;
  color: rgb(255 255 255 / 82%);
  font-size: 2.7vh;
  font-weight: 900;
}

.inventory-info h2,
.inventory-info p,
.inventory-info dl,
.inventory-info dd {
  margin: 0;
}

.inventory-info h2 {
  color: #ffffff;
  font-size: 1.75vh;
  font-weight: 900;
  line-height: 1.1;
}

.inventory-info p {
  margin-top: 0.35vh;
  color: rgb(255 255 255 / 48%);
  font-size: 1.05vh;
  font-weight: 800;
}

.inventory-info__stats {
  display: grid;
  gap: 0.55vh;
}

.inventory-info__stats div {
  min-height: 3.15vh;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1vh;
  padding: 0 1vh;
  border-radius: 0.55vh;
  background: rgb(255 255 255 / 5%);
}

.inventory-info dt {
  color: rgb(255 255 255 / 46%);
  font-size: 1.02vh;
  font-weight: 800;
}

.inventory-info dd {
  color: #ffffff;
  font-size: 1.05vh;
  font-weight: 850;
  text-align: right;
}

.inventory-info__close {
  min-height: 3.5vh;
  border: 0;
  border-radius: 0.55vh;
  background: #ffffff;
  color: #111111;
  cursor: pointer;
  font-weight: 900;
}

@media (max-width: 980px) {
  .inventory-page {
    padding: 2vh;
  }

  .inventory-window {
    width: calc(100vw - 4vh);
    height: calc(100vh - 4vh);
    grid-template-columns: 1fr;
    gap: 2.5vh;
    overflow: auto;
  }

  .inventory-grid--environment,
  .inventory-grid--player {
    grid-template-columns: repeat(5, minmax(4.8vh, 1fr));
  }
}
</style>
