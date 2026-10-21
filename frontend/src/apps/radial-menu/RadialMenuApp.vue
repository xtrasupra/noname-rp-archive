<template>
  <main v-if="visible" class="radial-menu" :class="menuClasses" data-interface="radialMenu" @contextmenu.prevent>
    <section class="radial-menu__stage" :aria-label="title">
      <svg
        v-if="currentActionLayer && expandedActionId"
        class="radial-menu__svg radial-menu__svg--nested"
        viewBox="0 0 700 350"
        role="presentation"
      >
        <g
          :key="`nested-segments-${currentActionLayer.key}-${expandedActionId}`"
          class="radial-menu__nested-segments"
        >
          <template
            v-for="(parent, parentIndex) in currentActionLayer.items"
            :key="`nested-parent-${currentActionLayer.key}-${parent.id}`"
          >
            <template v-if="isActionExpanded(parent)">
              <template
                v-for="(child, childIndex) in getVisibleChildren(parent)"
                :key="`nested-segment-${currentActionLayer.key}-${parent.id}-${child.id}`"
              >
                <path
                  class="radial-menu__segment-base radial-menu__segment-base--nested"
                  :class="{ 'radial-menu__segment-base--disabled': child.disabled }"
                  :d="
                    getNestedSegmentPath(
                      parentIndex,
                      currentActionLayer.items.length,
                      childIndex,
                      getVisibleChildren(parent).length,
                    )
                  "
                  :style="getNestedSequentialStyle(childIndex, getVisibleChildren(parent).length)"
                />
                <path
                  class="radial-menu__segment-highlight radial-menu__segment-highlight--nested"
                  :class="getActionHighlightClass(currentActionLayer, child)"
                  :d="
                    getNestedSegmentPath(
                      parentIndex,
                      currentActionLayer.items.length,
                      childIndex,
                      getVisibleChildren(parent).length,
                    )
                  "
                />
                <path
                  class="radial-menu__segment-sheen radial-menu__segment-sheen--nested"
                  :class="getActionHighlightClass(currentActionLayer, child)"
                  :d="
                    getNestedSegmentPath(
                      parentIndex,
                      currentActionLayer.items.length,
                      childIndex,
                      getVisibleChildren(parent).length,
                    )
                  "
                />
                <path
                  class="radial-menu__segment-rings radial-menu__segment-rings--nested"
                  :class="getActionHighlightClass(currentActionLayer, child)"
                  :d="
                    getNestedSegmentPath(
                      parentIndex,
                      currentActionLayer.items.length,
                      childIndex,
                      getVisibleChildren(parent).length,
                    )
                  "
                />
                <path
                  class="radial-menu__segment-hit"
                  :class="{ 'radial-menu__segment-hit--disabled': child.disabled }"
                  :d="
                    getNestedSegmentPath(
                      parentIndex,
                      currentActionLayer.items.length,
                      childIndex,
                      getVisibleChildren(parent).length,
                    )
                  "
                  @click="selectActionFromLayer(currentActionLayer, child)"
                  @pointerdown="pressAction(currentActionLayer, child)"
                  @pointerup="clearPressedAction"
                  @pointercancel="clearPressedAction"
                  @mouseenter="hoverAction(currentActionLayer, child)"
                  @mouseleave="leaveAction(child)"
                />
              </template>
            </template>
          </template>
        </g>
      </svg>

      <svg class="radial-menu__svg radial-menu__svg--main" viewBox="0 0 700 350" role="presentation">
        <defs>
          <radialGradient :id="centerGradientId" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="var(--radial-center-core)" stop-opacity="0.96" />
            <stop offset="56%" stop-color="var(--radial-center-mid)" stop-opacity="0.92" />
            <stop offset="100%" stop-color="var(--radial-center-edge)" stop-opacity="0.98" />
          </radialGradient>

          <radialGradient
            id="radialSegmentGradientInner"
            gradientUnits="userSpaceOnUse"
            :cx="stage.centerX"
            :cy="stage.centerY"
            :r="innerRing.outerRadius"
          >
            <stop
              :offset="`${(innerRing.innerRadius / innerRing.outerRadius) * 100}%`"
              stop-color="var(--radial-highlight-inner)"
              stop-opacity="var(--radial-highlight-inner-opacity)"
            />
            <stop
              offset="100%"
              stop-color="var(--radial-highlight-outer)"
              stop-opacity="var(--radial-highlight-outer-opacity)"
            />
          </radialGradient>

          <radialGradient
            :id="segmentGradientId"
            gradientUnits="userSpaceOnUse"
            :cx="stage.centerX"
            :cy="stage.centerY"
            :r="outerRing.outerRadius"
          >
            <stop
              :offset="`${(outerRing.innerRadius / outerRing.outerRadius) * 100}%`"
              stop-color="var(--radial-highlight-inner)"
              stop-opacity="var(--radial-highlight-inner-opacity)"
            />
            <stop
              offset="100%"
              stop-color="var(--radial-highlight-outer)"
              stop-opacity="var(--radial-highlight-outer-opacity)"
            />
          </radialGradient>

          <radialGradient
            id="radialSegmentGradientNested"
            gradientUnits="userSpaceOnUse"
            :cx="stage.centerX"
            :cy="stage.centerY"
            :r="nestedRing.outerRadius"
          >
            <stop
              :offset="`${(nestedRing.innerRadius / nestedRing.outerRadius) * 100}%`"
              stop-color="var(--radial-highlight-inner)"
              stop-opacity="var(--radial-highlight-inner-opacity)"
            />
            <stop
              offset="100%"
              stop-color="var(--radial-highlight-outer)"
              stop-opacity="var(--radial-highlight-outer-opacity)"
            />
          </radialGradient>

          <radialGradient :id="segmentSheenId" cx="50%" cy="4%" r="82%" fx="50%" fy="-8%">
            <stop offset="0%" stop-color="var(--radial-highlight-sheen)" stop-opacity="0.16" />
            <stop offset="42%" stop-color="var(--radial-highlight-sheen)" stop-opacity="0.08" />
            <stop offset="100%" stop-color="var(--radial-highlight-sheen)" stop-opacity="0" />
          </radialGradient>

          <linearGradient :id="segmentRippleGradientId" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stop-color="var(--radial-highlight-outer)" stop-opacity="0" />
            <stop offset="100%" stop-color="var(--radial-highlight-inner)" stop-opacity="var(--radial-ripple-opacity)" />
          </linearGradient>

          <pattern
            :id="segmentRingsId"
            patternUnits="objectBoundingBox"
            patternContentUnits="objectBoundingBox"
            width="1"
            height="1"
          >
            <ellipse
              cx="0.5"
              cy="-0.16"
              rx="0.62"
              ry="0.3"
              fill="url(#radialSegmentRippleGradient)"
              opacity="0.84"
            />
            <ellipse
              cx="0.54"
              cy="-0.08"
              rx="0.78"
              ry="0.34"
              fill="url(#radialSegmentRippleGradient)"
              opacity="0.56"
            />
          </pattern>

        </defs>

        <g
          v-if="currentActionLayer"
          :key="`segments-${currentActionLayer.key}`"
          class="radial-menu__action-segments"
          :class="getActionSegmentsClass(currentActionLayer)"
        >
          <template v-for="(item, index) in currentActionLayer.items" :key="`${currentActionLayer.key}-${item.id}`">
            <path
              class="radial-menu__segment-base radial-menu__segment-base--outer"
              :class="{ 'radial-menu__segment-base--disabled': item.disabled }"
              :d="getSegmentPath(index, currentActionLayer.items.length, outerRing)"
              :style="getSequentialStyle(index, currentActionLayer.items.length)"
            />
            <path
              class="radial-menu__segment-highlight radial-menu__segment-highlight--outer"
              :class="getActionHighlightClass(currentActionLayer, item)"
              :d="getSegmentPath(index, currentActionLayer.items.length, outerRing)"
            />
            <path
              class="radial-menu__segment-sheen radial-menu__segment-sheen--outer"
              :class="getActionHighlightClass(currentActionLayer, item)"
              :d="getSegmentPath(index, currentActionLayer.items.length, outerRing)"
            />
            <path
              class="radial-menu__segment-rings radial-menu__segment-rings--outer"
              :class="getActionHighlightClass(currentActionLayer, item)"
              :d="getSegmentPath(index, currentActionLayer.items.length, outerRing)"
            />
            <path
              class="radial-menu__segment-hit"
              :class="{ 'radial-menu__segment-hit--disabled': item.disabled }"
              :d="getSegmentPath(index, currentActionLayer.items.length, outerRing)"
              @click="selectActionFromLayer(currentActionLayer, item)"
              @pointerdown="pressAction(currentActionLayer, item)"
              @pointerup="clearPressedAction"
              @pointercancel="clearPressedAction"
              @mouseenter="hoverAction(currentActionLayer, item)"
              @mouseleave="leaveAction(item)"
            />
          </template>
        </g>

        <g class="radial-menu__main-segments">
          <template v-for="(group, index) in groups" :key="group.id">
            <path
              class="radial-menu__segment-base radial-menu__segment-base--inner"
              :d="getSegmentPath(index, groups.length, innerRing)"
              :style="getSequentialStyle(index, groups.length)"
            />
            <path
              class="radial-menu__segment-highlight radial-menu__segment-highlight--inner"
              :class="getMainHighlightClass(group)"
              :d="getSegmentPath(index, groups.length, innerRing)"
            />
            <path
              class="radial-menu__segment-sheen radial-menu__segment-sheen--inner"
              :class="getMainHighlightClass(group)"
              :d="getSegmentPath(index, groups.length, innerRing)"
            />
            <path
              class="radial-menu__segment-rings radial-menu__segment-rings--inner"
              :class="getMainHighlightClass(group)"
              :d="getSegmentPath(index, groups.length, innerRing)"
            />
            <path
              class="radial-menu__segment-hit"
              :d="getSegmentPath(index, groups.length, innerRing)"
              @click="selectGroup(group)"
              @mouseenter="hoveredGroupId = group.id"
              @mouseleave="hoveredGroupId = null"
            />
          </template>
        </g>

        <circle class="radial-menu__center-orb" :cx="stage.centerX" :cy="stage.centerY" :r="centerRadius" />
      </svg>

      <div
        v-for="layer in actionLayers"
        :key="`items-${layer.key}`"
        class="radial-menu__action-layer radial-menu__action-layer--items"
        :class="getActionLayerClass(layer)"
      >
        <button
          v-for="(item, index) in layer.items"
          :key="`action-${layer.key}-${item.id}`"
          class="radial-menu__item radial-menu__item--outer"
          :class="{
            'radial-menu__item--active':
              isActionLayerInteractive(layer) && (pressedActionId === item.id || expandedActionId === item.id),
            'radial-menu__item--hovered':
              isActionLayerInteractive(layer) &&
              hoveredActionId === item.id &&
              pressedActionId !== item.id &&
              expandedActionId !== item.id,
            'radial-menu__item--disabled': item.disabled,
          }"
          :style="getItemStyle(index, layer.items.length, outerRing.labelRadius)"
          type="button"
          :aria-disabled="item.disabled ? 'true' : 'false'"
          :title="item.disabledReason || item.description || item.label"
          @click="selectActionFromLayer(layer, item)"
          @pointerdown="pressAction(layer, item)"
          @pointerup="clearPressedAction"
          @pointercancel="clearPressedAction"
          @mouseenter="hoverAction(layer, item)"
          @mouseleave="leaveAction(item)"
        >
          <span class="radial-menu__item-content">
            <component :is="iconComponent(item.icon)" class="radial-menu__icon" :size="25" :stroke-width="2.2" />
            <span class="radial-menu__label">{{ item.shortLabel || item.label }}</span>
          </span>
        </button>
      </div>

      <div
        v-if="currentActionLayer && expandedActionId"
        :key="`nested-items-${currentActionLayer.key}-${expandedActionId}`"
        class="radial-menu__nested-layer"
      >
        <template
          v-for="(parent, parentIndex) in currentActionLayer.items"
          :key="`nested-item-parent-${currentActionLayer.key}-${parent.id}`"
        >
          <template v-if="isActionExpanded(parent)">
            <button
              v-for="(child, childIndex) in getVisibleChildren(parent)"
              :key="`nested-action-${currentActionLayer.key}-${parent.id}-${child.id}`"
              class="radial-menu__item radial-menu__item--nested"
              :class="{
                'radial-menu__item--active': isActionLayerInteractive(currentActionLayer) && pressedActionId === child.id,
                'radial-menu__item--hovered':
                  isActionLayerInteractive(currentActionLayer) && hoveredActionId === child.id && pressedActionId !== child.id,
                'radial-menu__item--disabled': child.disabled,
              }"
              :style="
                getNestedItemStyle(
                  parentIndex,
                  currentActionLayer.items.length,
                  childIndex,
                  getVisibleChildren(parent).length,
                )
              "
              type="button"
              :aria-disabled="child.disabled ? 'true' : 'false'"
              :title="child.disabledReason || child.description || child.label"
              @click="selectActionFromLayer(currentActionLayer, child)"
              @pointerdown="pressAction(currentActionLayer, child)"
              @pointerup="clearPressedAction"
              @pointercancel="clearPressedAction"
              @mouseenter="hoverAction(currentActionLayer, child)"
              @mouseleave="leaveAction(child)"
            >
              <span class="radial-menu__item-content">
                <component :is="iconComponent(child.icon)" class="radial-menu__icon" :size="19" :stroke-width="2.2" />
                <span class="radial-menu__label">{{ child.shortLabel || child.label }}</span>
              </span>
            </button>
          </template>
        </template>
      </div>

      <div class="radial-menu__main-items">
        <button
          v-for="(group, index) in groups"
          :key="`group-${group.id}`"
          class="radial-menu__item radial-menu__item--inner"
          :class="{
            'radial-menu__item--active': selectedGroupId === group.id,
            'radial-menu__item--hovered': hoveredGroupId === group.id && selectedGroupId !== group.id,
          }"
          :style="getItemStyle(index, groups.length, innerRing.labelRadius)"
          type="button"
          aria-disabled="false"
          :title="group.disabledReason || group.description || group.label"
          @click="selectGroup(group)"
          @mouseenter="hoveredGroupId = group.id"
          @mouseleave="hoveredGroupId = null"
        >
          <span class="radial-menu__item-content">
            <component :is="iconComponent(group.icon)" class="radial-menu__icon" :size="25" :stroke-width="2.2" />
            <span class="radial-menu__label">{{ group.label }}</span>
          </span>
        </button>
      </div>

      <button class="radial-menu__center" type="button" @click="closeMenu">
        <span>{{ centerHint[0] }}</span>
        <span>{{ centerHint[1] }}</span>
      </button>
    </section>
  </main>

</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Armchair,
  Badge,
  BadgeCheck,
  Banknote,
  Bike,
  BriefcaseBusiness,
  Building2,
  Car,
  CarFront,
  Circle,
  CirclePower,
  ClipboardCheck,
  CreditCard,
  Crosshair,
  DoorClosed,
  DoorOpen,
  Drama,
  FileBadge,
  FileCheck,
  FileText,
  FileUser,
  Fish,
  Footprints,
  Hand,
  HandCoins,
  Handshake,
  HeartPulse,
  House,
  IdCard,
  KeyRound,
  Landmark,
  LockOpen,
  PackageOpen,
  Plane,
  Sailboat,
  ScanSearch,
  Scale,
  ScrollText,
  Shield,
  ShieldCheck,
  Store,
  Truck,
  UserRound,
  Users,
  VenetianMask,
  Wallet,
  Wrench,
  Cannabis,
} from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import { useInterfaceManagerStore } from '@/core/interfaces/interface-manager.store'
import type { RadialMenuAction, RadialMenuGroup, RadialMenuPayload } from '@/shared/contracts/ui'

const props = defineProps<{
  payload?: RadialMenuPayload
}>()

interface Point {
  x: number
  y: number
}

interface RingGeometry {
  innerRadius: number
  outerRadius: number
  labelRadius: number
}

type ActionLayerMode = 'pop' | 'active' | 'switch-enter' | 'switch-leave'

interface ActionLayer {
  groupId: string
  items: RadialMenuAction[]
  key: string
  mode: ActionLayerMode
}

type RadialMenuWindowApi = {
  close: () => void
  open: (payload?: RadialMenuPayload | string | null) => void
  setPayload: (payload?: RadialMenuPayload | string | null) => void
}

type RadialMenuWindow = Window & {
  TWINKLE_RADIAL_MENU?: RadialMenuWindowApi
  __TWINKLE_RADIAL_MENU_PAYLOAD__?: RadialMenuPayload
}

const stage = {
  width: 700,
  height: 350,
  centerX: 350,
  centerY: 350,
}

const arcStart = 180
const arcEnd = 360
const segmentOverlapDegrees = 0.5
const centerRadius = 100
const actionLayerStaggerMs = 27
const closeLayerStaggerMs = 14
const actionSwitchLeaveMs = 87
const actionSwitchEnterMs = 150
const actionSwitchMs = actionSwitchLeaveMs + actionSwitchEnterMs
const closeAnimationMs = 410
const closeAnimationWithoutActionsMs = 260
const centerGradientId = 'radialCenterGradient'
const segmentGradientId = 'radialSegmentGradient'
const segmentSheenId = 'radialSegmentSheen'
const segmentRippleGradientId = 'radialSegmentRippleGradient'
const segmentRingsId = 'radialSegmentRings'
const interfaceManager = useInterfaceManagerStore()
const hoveredActionId = ref<string | null>(null)
const hoveredGroupId = ref<string | null>(null)
const expandedActionId = ref<string | null>(null)
const payloadState = ref<RadialMenuPayload>(parsePayload(props.payload))
const selectedGroupId = ref<string | null>(null)
const pressedActionId = ref<string | null>(null)
const currentActionLayer = ref<ActionLayer | null>(null)
const leavingActionLayers = ref<ActionLayer[]>([])
const actionLeaveTimers: number[] = []
const closeTimers: number[] = []
const isClosed = ref(false)
const isClosing = ref(false)

const outerRing: RingGeometry = {
  innerRadius: 250,
  outerRadius: 350,
  labelRadius: 302,
}

const nestedRing: RingGeometry = {
  innerRadius: 360,
  outerRadius: 432,
  labelRadius: 397,
}

const innerRing: RingGeometry = {
  innerRadius: 112,
  outerRadius: 225,
  labelRadius: 170,
}

const iconComponents: Record<string, Component> = {
  armchair: Armchair,
  badge: Badge,
  'badge-check': BadgeCheck,
  banknote: Banknote,
  bike: Bike,
  briefcase: BriefcaseBusiness,
  building: Building2,
  car: Car,
  cannabis: Cannabis,
  'car-front': CarFront,
  'circle-power': CirclePower,
  'clipboard-check': ClipboardCheck,
  'credit-card': CreditCard,
  crosshair: Crosshair,
  'door-closed': DoorClosed,
  'door-open': DoorOpen,
  drama: Drama,
  'file-badge': FileBadge,
  'file-check': FileCheck,
  'file-text': FileText,
  'file-user': FileUser,
  fish: Fish,
  footprints: Footprints,
  hand: Hand,
  'hand-coins': HandCoins,
  handshake: Handshake,
  'heart-pulse': HeartPulse,
  house: House,
  'id-card': IdCard,
  key: KeyRound,
  landmark: Landmark,
  'lock-open': LockOpen,
  'package-open': PackageOpen,
  plane: Plane,
  sailboat: Sailboat,
  'scan-search': ScanSearch,
  scale: Scale,
  'scroll-text': ScrollText,
  shield: Shield,
  'shield-check': ShieldCheck,
  store: Store,
  truck: Truck,
  user: UserRound,
  users: Users,
  'venetian-mask': VenetianMask,
  wallet: Wallet,
  wrench: Wrench,
}

const defaultGroups: RadialMenuGroup[] = [
  {
    id: 'vehicle',
    label: 'Авто',
    icon: 'car',
    items: [
      { id: 'vehicle:door:toggle', label: 'Дверь', icon: 'door-open' },
      { id: 'vehicle:lock:toggle', label: 'Замок', icon: 'lock-open' },
      { id: 'vehicle:engine:toggle', label: 'Двигатель', icon: 'circle-power' },
      { id: 'vehicle:seat:0', label: 'Место 1', icon: 'armchair' },
      { id: 'vehicle:seat:1', label: 'Место 2', icon: 'armchair' },
      { id: 'vehicle:trunk:toggle', label: 'Багажник', icon: 'package-open' },
      { id: 'vehicle:repair', label: 'Ремонт', icon: 'wrench' },
    ],
  },
  {
    id: 'player',
    label: 'Игрок',
    icon: 'user',
    items: [
      { id: 'player:passport', label: 'Паспорт', icon: 'id-card' },
      { id: 'player:cash:1000', label: '$ 1000', icon: 'hand-coins' },
      { id: 'player:greet', label: 'Привет', icon: 'handshake' },
      { id: 'player:search', label: 'Обыскать', icon: 'scan-search' },
    ],
  },
  {
    id: 'documents',
    label: 'Документы',
    icon: 'id-card',
    items: [
      { id: 'docs:card-id', label: 'Card ID', icon: 'id-card' },
      { id: 'docs:work-id', label: 'Work ID', icon: 'briefcase' },
      {
        id: 'docs:certificate',
        label: 'Удостоверение',
        shortLabel: 'Удостов.',
        icon: 'badge-check',
      },
      {
        id: 'docs:transport',
        label: 'Транспорт',
        icon: 'car-front',
        closeOnSelect: false,
        children: [
          {
            id: 'docs:transport:a',
            label: 'Лицензия категории А',
            shortLabel: 'Кат. A',
            icon: 'bike',
          },
          {
            id: 'docs:transport:b',
            label: 'Лицензия категории B',
            shortLabel: 'Кат. B',
            icon: 'car-front',
          },
          {
            id: 'docs:transport:c',
            label: 'Лицензия категории C',
            shortLabel: 'Кат. C',
            icon: 'truck',
          },
          {
            id: 'docs:transport:air',
            label: 'Лицензия на авиатранспорт',
            shortLabel: 'Авиа',
            icon: 'plane',
          },
          {
            id: 'docs:transport:water',
            label: 'Лицензия на водный транспорт',
            shortLabel: 'Вода',
            icon: 'sailboat',
          },
        ],
      },
      {
        id: 'docs:permits',
        label: 'Разрешения',
        icon: 'shield-check',
        closeOnSelect: false,
        children: [
          {
            id: 'docs:permits:weapon',
            label: 'Лицензия на оружие',
            shortLabel: 'Оружие',
            icon: 'crosshair',
          },
          {
            id: 'docs:permits:fishing',
            label: 'Рыболовство',
            shortLabel: 'Рыболовство',
            icon: 'fish',
          },
          {
            id: 'docs:permits:hunting',
            label: 'Охота',
            shortLabel: 'Охота',
            icon: 'crosshair',
          },
        ],
      },
      {
        id: 'docs:misc',
        label: 'Прочее',
        icon: 'scroll-text',
        closeOnSelect: false,
        children: [
          {
            id: 'docs:misc:passengers',
            label: 'Лицензия на перевозку пассажиров',
            shortLabel: 'Пассаж.',
            icon: 'users',
          },
          {
            id: 'docs:misc:lawyer',
            label: 'Лицензия юриста',
            shortLabel: 'Юрист',
            icon: 'scale',
          },
          {
            id: 'docs:misc:business',
            label: 'Лицензия на предпринимательство',
            shortLabel: 'Бизнес',
            icon: 'store',
          },
          {
            id: 'docs:misc:insurance',
            label: 'Мед. страховка',
            shortLabel: 'Мед.',
            icon: 'heart-pulse',
          },
          {
            id: 'docs:misc:marijuana',
            label: 'Разрешение на употребление марихуаны',
            shortLabel: 'Марих.',
            icon: 'cannabis',
          },
        ],
      },
    ],
  },
  {
    id: 'property',
    label: 'Имущество',
    icon: 'house',
    items: [
      { id: 'property:house:register', label: 'Дом', icon: 'house' },
      { id: 'property:apartment:register', label: 'Квартира', icon: 'building' },
      { id: 'property:business:sell', label: 'Бизнес', icon: 'briefcase' },
      { id: 'property:vehicle:sell', label: 'Авто', icon: 'car' },
    ],
  },
  {
    id: 'crime',
    label: 'Крайм',
    icon: 'venetian-mask',
    items: [
      { id: 'crime:invite', label: 'Группировка', icon: 'shield' },
      { id: 'crime:rob', label: 'Ограбить', icon: 'wallet' },
      { id: 'crime:ties', label: 'Стяжки', icon: 'badge' },
      { id: 'crime:hostage', label: 'Заложник', icon: 'user' },
      { id: 'crime:bag', label: 'Мешок', icon: 'package-open' },
    ],
  },
  {
    id: 'animations',
    label: 'Анимации',
    icon: 'drama',
    items: [
      { id: 'animation:greet', label: 'Привет', icon: 'handshake' },
      { id: 'animation:stop', label: 'Стоп', icon: 'hand' },
    ],
  },
]

const groups = computed(() => {
  const source = payloadState.value.groups?.length ? payloadState.value.groups : defaultGroups

  return source
    .filter((group) => !group.hidden)
    .map((group) => ({
      ...group,
      icon: group.icon || 'circle',
      items: group.items
        .filter((item) => !item.hidden)
        .map((item) => ({
          ...item,
          children: item.children?.filter((child) => !child.hidden),
        })),
    }))
    .filter((group) => group.items.length > 0)
})

const activeGroup = computed(() => {
  if (!selectedGroupId.value) {
    return null
  }

  return groups.value.find((group) => group.id === selectedGroupId.value) ?? null
})

const actionLayers = computed(() => [
  ...leavingActionLayers.value,
  ...(currentActionLayer.value ? [currentActionLayer.value] : []),
])
const visible = computed(() => !isClosed.value && payloadState.value.visible !== false && groups.value.length > 0)
const title = computed(() => payloadState.value.title || 'Радиальное меню')
const menuClasses = computed(() => ({
  'radial-menu--closing': isClosing.value,
  'radial-menu--has-actions': Boolean(currentActionLayer.value),
}))
const centerHint = computed(() => {
  const hint = payloadState.value.hint || 'Нажмите, чтобы закрыть'
  const parts = hint.split(/\s+/)

  if (parts.length <= 2) {
    return [hint, '']
  }

  return [parts.slice(0, 1).join(' '), parts.slice(1).join(' ')]
})

watch(
  () => props.payload,
  (payload) => {
    openMenu(payload)
  },
)

watch(groups, (nextGroups) => {
  if (!selectedGroupId.value) {
    return
  }

  const nextGroup = nextGroups.find((group) => group.id === selectedGroupId.value)

  if (!nextGroup) {
    resetActionLayers()
    return
  }

  if (currentActionLayer.value) {
    currentActionLayer.value = {
      ...currentActionLayer.value,
      items: nextGroup.items,
    }
  }
})

function parsePayload(payload?: RadialMenuPayload | string | null): RadialMenuPayload {
  if (!payload) {
    return {}
  }

  if (typeof payload === 'object') {
    return payload
  }

  try {
    return JSON.parse(payload) as RadialMenuPayload
  } catch {
    return {}
  }
}

function openMenu(payload?: RadialMenuPayload | string | null) {
  closeTimers.splice(0).forEach((timer) => window.clearTimeout(timer))
  isClosed.value = false
  isClosing.value = false
  payloadState.value = payload ? parsePayload(payload) : {}
  resetActionLayers()
  hoveredGroupId.value = null
}

function resetActionLayers() {
  actionLeaveTimers.splice(0).forEach((timer) => window.clearTimeout(timer))
  leavingActionLayers.value = []
  currentActionLayer.value = null
  selectedGroupId.value = null
  expandedActionId.value = null
  hoveredActionId.value = null
  pressedActionId.value = null
}

function iconComponent(name?: string) {
  return iconComponents[name || ''] || Circle
}

function getVisibleChildren(action: RadialMenuAction) {
  return action.children?.filter((child) => !child.hidden) || []
}

function isActionExpanded(action: RadialMenuAction) {
  return expandedActionId.value === action.id && getVisibleChildren(action).length > 0
}

function getSequentialStyle(index: number, total: number) {
  return {
    '--delay': `${index * actionLayerStaggerMs}ms`,
    '--reverse-delay': `${Math.max(total - 1 - index, 0) * actionLayerStaggerMs}ms`,
    '--close-reverse-delay': `${Math.max(total - 1 - index, 0) * closeLayerStaggerMs}ms`,
  }
}

function getActionLayerClass(layer: ActionLayer) {
  return {
    'radial-menu__action-layer--pop': layer.mode === 'pop',
    'radial-menu__action-layer--switch-enter': layer.mode === 'switch-enter',
    'radial-menu__action-layer--switch-leave': layer.mode === 'switch-leave',
  }
}

function getActionSegmentsClass(layer: ActionLayer) {
  return {
    'radial-menu__action-segments--pop': layer.mode === 'pop',
  }
}

function getMainHighlightClass(group: RadialMenuGroup) {
  const active = selectedGroupId.value === group.id

  return {
    'radial-menu__segment-highlight--active': active,
    'radial-menu__segment-highlight--hovered': !active && hoveredGroupId.value === group.id,
  }
}

function getActionHighlightClass(layer: ActionLayer, item: RadialMenuAction) {
  const interactive = isActionLayerInteractive(layer)
  const active = interactive && (pressedActionId.value === item.id || expandedActionId.value === item.id)
  const hovered = interactive && !active && hoveredActionId.value === item.id

  return {
    'radial-menu__segment-highlight--active': active,
    'radial-menu__segment-highlight--hovered': hovered,
  }
}

function isActionLayerInteractive(layer: ActionLayer) {
  return (
    currentActionLayer.value?.key === layer.key &&
    layer.mode !== 'switch-leave' &&
    layer.mode !== 'switch-enter' &&
    !isClosing.value
  )
}

function getSegmentPath(index: number, total: number, geometry: RingGeometry) {
  if (total <= 0) {
    return ''
  }

  const step = (arcEnd - arcStart) / total
  const startAngle = arcStart + index * step - segmentOverlapDegrees
  const endAngle = arcStart + (index + 1) * step + segmentOverlapDegrees
  return getSegmentPathByAngles(startAngle, endAngle, geometry)
}

function getSegmentPathByAngles(startAngle: number, endAngle: number, geometry: RingGeometry) {
  const outerStart = polarToCartesian(startAngle, geometry.outerRadius)
  const outerEnd = polarToCartesian(endAngle, geometry.outerRadius)
  const innerEnd = polarToCartesian(endAngle, geometry.innerRadius)
  const innerStart = polarToCartesian(startAngle, geometry.innerRadius)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${geometry.outerRadius} ${geometry.outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${geometry.innerRadius} ${geometry.innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function getNestedArc(parentIndex: number, parentTotal: number, childTotal: number) {
  const parentStep = (arcEnd - arcStart) / Math.max(parentTotal, 1)
  const parentCenter = arcStart + parentIndex * parentStep + parentStep / 2
  const span = Math.min(76, Math.max(48, childTotal * 12 + 16))
  const halfSpan = span / 2
  const center = Math.min(arcEnd - halfSpan, Math.max(arcStart + halfSpan, parentCenter))

  return {
    start: center - halfSpan,
    step: span / Math.max(childTotal, 1),
  }
}

function getNestedSegmentPath(parentIndex: number, parentTotal: number, childIndex: number, childTotal: number) {
  const arc = getNestedArc(parentIndex, parentTotal, childTotal)
  const startAngle = arc.start + childIndex * arc.step - 0.35
  const endAngle = arc.start + (childIndex + 1) * arc.step + 0.35

  return getSegmentPathByAngles(startAngle, endAngle, nestedRing)
}

function getItemStyle(index: number, total: number, radius: number) {
  const point = getItemPosition(index, total, radius)
  const shift = getCenterShift(point, 28)

  return {
    '--delay': `${index * actionLayerStaggerMs}ms`,
    '--reverse-delay': `${Math.max(total - 1 - index, 0) * actionLayerStaggerMs}ms`,
    '--close-reverse-delay': `${Math.max(total - 1 - index, 0) * closeLayerStaggerMs}ms`,
    '--shift-x': `${shift.x}px`,
    '--shift-y': `${shift.y}px`,
    left: `${(point.x / stage.width) * 100}%`,
    top: `${(point.y / stage.height) * 100}%`,
  }
}

function getNestedSequentialStyle(index: number, total: number) {
  return {
    '--delay': `${index * actionLayerStaggerMs}ms`,
    '--reverse-delay': `${Math.max(total - 1 - index, 0) * actionLayerStaggerMs}ms`,
    '--close-reverse-delay': `${Math.max(total - 1 - index, 0) * closeLayerStaggerMs}ms`,
  }
}

function getNestedItemStyle(parentIndex: number, parentTotal: number, childIndex: number, childTotal: number) {
  const arc = getNestedArc(parentIndex, parentTotal, childTotal)
  const angle = arc.start + childIndex * arc.step + arc.step / 2
  const point = polarToCartesian(angle, nestedRing.labelRadius)
  const shift = getCenterShift(point, 22)

  return {
    ...getNestedSequentialStyle(childIndex, childTotal),
    '--shift-x': `${shift.x}px`,
    '--shift-y': `${shift.y}px`,
    left: `${(point.x / stage.width) * 100}%`,
    top: `${(point.y / stage.height) * 100}%`,
  }
}

function getItemPosition(index: number, total: number, radius: number) {
  const step = (arcEnd - arcStart) / Math.max(total, 1)
  const angle = arcStart + index * step + step / 2

  return polarToCartesian(angle, radius)
}

function polarToCartesian(angleInDegrees: number, radius: number): Point {
  const angle = (angleInDegrees * Math.PI) / 180

  return {
    x: stage.centerX + radius * Math.cos(angle),
    y: stage.centerY + radius * Math.sin(angle),
  }
}

function getCenterShift(point: Point, distance: number): Point {
  const dx = stage.centerX - point.x
  const dy = stage.centerY - point.y
  const length = Math.hypot(dx, dy) || 1

  return {
    x: (dx / length) * distance,
    y: (dy / length) * distance,
  }
}

function createActionLayer(group: RadialMenuGroup, mode: ActionLayerMode): ActionLayer {
  return {
    groupId: group.id,
    items: group.items,
    key: `${group.id}-${mode}-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    mode,
  }
}

function selectGroup(group: RadialMenuGroup) {
  if (isClosing.value || selectedGroupId.value === group.id) {
    return
  }

  actionLeaveTimers.splice(0).forEach((timer) => window.clearTimeout(timer))
  const previousLayer = currentActionLayer.value

  if (previousLayer) {
    const leavingLayer = {
      ...previousLayer,
      mode: 'switch-leave' as const,
    }

    leavingActionLayers.value = [leavingLayer]

    const timer = window.setTimeout(() => {
      leavingActionLayers.value = leavingActionLayers.value.filter((layer) => layer.key !== leavingLayer.key)
    }, actionSwitchLeaveMs + 40)

    actionLeaveTimers.push(timer)
  } else {
    leavingActionLayers.value = []
  }

  const nextLayer = createActionLayer(group, previousLayer ? 'switch-enter' : 'pop')

  currentActionLayer.value = nextLayer
  selectedGroupId.value = group.id
  expandedActionId.value = null
  hoveredActionId.value = null
  pressedActionId.value = null

  if (previousLayer) {
    const nextKey = nextLayer.key
    const timer = window.setTimeout(() => {
      currentActionLayer.value =
        currentActionLayer.value?.key === nextKey
          ? { ...currentActionLayer.value, mode: 'active' }
          : currentActionLayer.value
    }, actionSwitchMs + 40)

    actionLeaveTimers.push(timer)
  }
}

function pressAction(layer: ActionLayer, action: RadialMenuAction) {
  if (isClosing.value || action.disabled || !isActionLayerInteractive(layer)) {
    return
  }

  pressedActionId.value = action.id
}

function clearPressedAction() {
  pressedActionId.value = null
}

function hoverAction(layer: ActionLayer, action: RadialMenuAction) {
  if (isClosing.value || action.disabled || !isActionLayerInteractive(layer)) {
    return
  }

  hoveredActionId.value = action.id
}

function leaveAction(action: RadialMenuAction) {
  if (hoveredActionId.value === action.id) {
    hoveredActionId.value = null
  }

  if (pressedActionId.value === action.id) {
    pressedActionId.value = null
  }
}

function selectActionFromLayer(layer: ActionLayer, action: RadialMenuAction) {
  if (isClosing.value || !isActionLayerInteractive(layer)) {
    return
  }

  if (action.disabled) {
    showUnavailable(action.disabledReason)
    return
  }

  if (getVisibleChildren(action).length > 0) {
    toggleActionChildren(action)
    return
  }

  selectAction(action)
}

function toggleActionChildren(action: RadialMenuAction) {
  if (action.disabled) {
    return
  }

  pressedActionId.value = action.id
  expandedActionId.value = expandedActionId.value === action.id ? null : action.id

  window.setTimeout(() => {
    if (pressedActionId.value === action.id) {
      pressedActionId.value = null
    }
  }, 110)
}

function selectAction(action: RadialMenuAction) {
  if (isClosing.value || action.disabled) {
    return
  }

  pressedActionId.value = action.id
  window.setTimeout(() => {
    if (pressedActionId.value === action.id) {
      pressedActionId.value = null
    }
  }, 160)

  callClientEvent('radialMenu:selectFromBrowser', JSON.stringify({
    action,
    actionId: action.id,
    groupId: activeGroup.value?.id ?? null,
    payload: action.payload ?? null,
  }))

  if (action.closeOnSelect !== false) {
    window.setTimeout(closeMenu, 120)
  }
}

function showUnavailable(message?: string) {
  const reason = message || 'Пункт сейчас недоступен.'

  callClientEvent('radialMenu:disabledFromBrowser', reason)
}

function closeMenu() {
  if (isClosing.value) {
    return
  }

  actionLeaveTimers.splice(0).forEach((timer) => window.clearTimeout(timer))
  leavingActionLayers.value = []
  hoveredActionId.value = null
  hoveredGroupId.value = null
  pressedActionId.value = null
  isClosing.value = true
  const closeDelay = currentActionLayer.value ? closeAnimationMs : closeAnimationWithoutActionsMs

  const timer = window.setTimeout(() => {
    callClientEvent('radialMenu:closeFromBrowser')
    interfaceManager.close('radialMenu')
  }, closeDelay)

  closeTimers.push(timer)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' || event.key.toLowerCase() === 'g') {
    closeMenu()
  }
}

function handlePayloadEvent(event: Event) {
  openMenu((event as CustomEvent<RadialMenuPayload>).detail)
}

onMounted(() => {
  const radialWindow = window as RadialMenuWindow

  if (radialWindow.__TWINKLE_RADIAL_MENU_PAYLOAD__) {
    openMenu(radialWindow.__TWINKLE_RADIAL_MENU_PAYLOAD__)
  }

  radialWindow.TWINKLE_RADIAL_MENU = {
    close: closeMenu,
    open: openMenu,
    setPayload: openMenu,
  }

  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('twinkle:radialMenu:update', handlePayloadEvent)
  callClientEvent('radialMenu:readyFromBrowser')
})

onBeforeUnmount(() => {
  const radialWindow = window as RadialMenuWindow

  if (radialWindow.TWINKLE_RADIAL_MENU) {
    delete radialWindow.TWINKLE_RADIAL_MENU
  }

  actionLeaveTimers.splice(0).forEach((timer) => window.clearTimeout(timer))
  closeTimers.splice(0).forEach((timer) => window.clearTimeout(timer))
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('twinkle:radialMenu:update', handlePayloadEvent)
})
</script>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(html),
:global(body),
:global(#app) {
  min-width: 100%;
  min-height: 100%;
  margin: 0;
  background: transparent !important;
}

:global(body) {
  overflow: hidden;
  background: transparent !important;
}

:global(.browser-shell),
:global(.interface-host),
:global(.interface-host__layer) {
  background: transparent !important;
}

:global(:root) {
  --radial-font-family: "SF Pro", "SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial,
    sans-serif;
  --radial-center-core: #c34ad0;
  --radial-center-mid: #871090;
  --radial-center-edge: #220026;
  --radial-glow-color: #e42fff;
  --radial-glow-drop: rgba(228, 47, 255, 0.36);
  --radial-highlight-inner: #e000ff;
  --radial-highlight-outer: #860099;
  --radial-highlight-inner-opacity: 1;
  --radial-highlight-outer-opacity: 0.6;
  --radial-highlight-sheen: #e000ff;
  --radial-ripple-opacity: 0.1;
  --radial-highlight-hover-opacity: 0.5;
  --radial-highlight-active-opacity: 1;
  --radial-highlight-sheen-hover-opacity: 0.18;
  --radial-highlight-sheen-active-opacity: 0.3;
  --radial-highlight-ripple-hover-opacity: 0.44;
  --radial-highlight-ripple-active-opacity: 0.76;
  --radial-highlight-border: #e000ff;
  --radial-highlight-border-opacity: 0.65;
  --radial-highlight-stroke: 0.6;
  --radial-segment-bg: rgba(3, 6, 10, 0.995);
  --radial-segment-inner-bg: rgba(8, 7, 14, 0.995);
  --radial-segment-border: rgba(38, 20, 43, 0.62);
  --radial-nested-bg: rgba(4, 5, 9, 0.995);
  --radial-text: #ffffff;
  --radial-text-muted: rgba(255, 255, 255, 0.74);
  --radial-text-hover: rgba(255, 255, 255, 0.9);
  --radial-center-text: rgba(255, 255, 255, 0.45);
  --radial-reopen-bg: rgba(14, 5, 19, 0.94);
  --radial-reopen-hover-bg: rgba(98, 16, 110, 0.96);
  --radial-reopen-border: rgba(229, 68, 255, 0.72);
  --radial-shadow-strong: rgba(0, 0, 0, 0.76);
  --radial-icon-shadow: rgba(255, 255, 255, 0.12);
  --radial-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --radial-ease-in: cubic-bezier(0.45, 0, 0.9, 0.48);
  --radial-motion-hover: 210ms;
}

.radial-menu {
  position: fixed;
  inset: 0;
  z-index: 40;
  overflow: hidden;
  color: var(--radial-text);
  font-family: var(--radial-font-family);
  font-variation-settings: "wdth" 100;
  font-weight: 400;
  pointer-events: auto;
}

.radial-menu__reopen {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 20;
  min-width: 142px;
  height: 40px;
  transform: translateX(-50%);
  border: 1px solid var(--radial-reopen-border);
  border-radius: 6px;
  background: var(--radial-reopen-bg);
  color: var(--radial-text);
  cursor: pointer;
  font-family: var(--radial-font-family);
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0;
  transition:
    background var(--radial-motion-hover) ease,
    transform var(--radial-motion-hover) ease;
}

.radial-menu__reopen:hover {
  background: var(--radial-reopen-hover-bg);
  transform: translateX(-50%) translateY(-1px);
}

.radial-menu__stage {
  position: fixed;
  left: 50%;
  bottom: 0;
  width: min(700px, calc(100vw - 24px), calc((100vh - 4px) * 2));
  aspect-ratio: 700 / 350;
  overflow: visible;
  transform: translateX(-50%);
  pointer-events: auto;
}

.radial-menu__svg,
.radial-menu__action-layer--items,
.radial-menu__main-items {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.radial-menu__action-layer--items,
.radial-menu__main-items {
  pointer-events: none;
}

.radial-menu__svg {
  overflow: visible;
  pointer-events: none;
}

.radial-menu__svg--nested {
  z-index: 1;
}

.radial-menu__svg--main {
  z-index: 3;
}

.radial-menu__action-layer {
  transform-origin: 50% 100%;
}

.radial-menu__segment-base,
.radial-menu__segment-highlight,
.radial-menu__segment-sheen,
.radial-menu__segment-rings,
.radial-menu__segment-hit {
  transform-box: view-box;
  transform-origin: 50% 100%;
  vector-effect: non-scaling-stroke;
}

.radial-menu--closing {
  pointer-events: none;
}

.radial-menu__action-layer--switch-leave {
  pointer-events: none;
}

.radial-menu__segment-base {
  fill: var(--radial-segment-bg);
  stroke: var(--radial-segment-border);
  stroke-width: 0.9;
  stroke-linejoin: round;
}

.radial-menu__segment-base--inner {
  fill: var(--radial-segment-inner-bg);
  stroke: var(--radial-segment-border);
}

.radial-menu__segment-base--nested {
  fill: var(--radial-nested-bg);
  stroke: var(--radial-segment-border);
}

.radial-menu__segment-base--disabled {
  opacity: 0.6;
}

.radial-menu__segment-highlight {
  fill: url(#radialSegmentGradient);
  stroke: var(--radial-highlight-border);
  stroke-opacity: var(--radial-highlight-border-opacity);
  stroke-width: var(--radial-highlight-stroke);
  opacity: 0;
  filter: none;
  pointer-events: none;
  transition:
    opacity var(--radial-motion-hover) var(--radial-ease-out),
    filter var(--radial-motion-hover) var(--radial-ease-out);
}

.radial-menu__segment-highlight--inner {
  fill: url(#radialSegmentGradientInner);
}

.radial-menu__segment-highlight--outer {
  fill: url(#radialSegmentGradient);
}

.radial-menu__segment-highlight--nested {
  fill: url(#radialSegmentGradientNested);
}

.radial-menu__segment-sheen {
  fill: url(#radialSegmentSheen);
  opacity: 0;
  pointer-events: none;
  mix-blend-mode: screen;
  transition: opacity var(--radial-motion-hover) var(--radial-ease-out);
}

.radial-menu__segment-rings {
  fill: url(#radialSegmentRings);
  opacity: 0;
  pointer-events: none;
  mix-blend-mode: normal;
  transition: opacity var(--radial-motion-hover) var(--radial-ease-out);
}

.radial-menu__segment-highlight.radial-menu__segment-highlight--hovered {
  opacity: var(--radial-highlight-hover-opacity);
}

.radial-menu__segment-highlight.radial-menu__segment-highlight--active {
  opacity: var(--radial-highlight-active-opacity);
}

.radial-menu__segment-sheen.radial-menu__segment-highlight--hovered {
  opacity: var(--radial-highlight-sheen-hover-opacity);
}

.radial-menu__segment-sheen.radial-menu__segment-highlight--active {
  opacity: var(--radial-highlight-sheen-active-opacity);
}

.radial-menu__segment-rings.radial-menu__segment-highlight--hovered {
  opacity: var(--radial-highlight-ripple-hover-opacity);
}

.radial-menu__segment-rings.radial-menu__segment-highlight--active {
  opacity: var(--radial-highlight-ripple-active-opacity);
}

.radial-menu__segment-hit {
  fill: transparent;
  cursor: pointer;
  pointer-events: all;
}

.radial-menu__segment-hit--disabled {
  cursor: default;
}

.radial-menu__center-orb {
  fill: url(#radialCenterGradient);
  transform-box: fill-box;
  transform-origin: center;
  animation: radial-center-pop 215ms var(--radial-ease-out) both;
}

.radial-menu__main-segments .radial-menu__segment-base {
  animation: radial-segment-pop 240ms var(--radial-ease-out) both;
  animation-delay: calc(130ms + var(--delay, 0ms));
}

.radial-menu__action-segments--pop .radial-menu__segment-base {
  animation: radial-segment-pop 240ms var(--radial-ease-out) both;
  animation-delay: var(--delay, 0ms);
}

.radial-menu__nested-segments .radial-menu__segment-base {
  animation: radial-segment-pop 210ms var(--radial-ease-out) both;
  animation-delay: calc(30ms + var(--delay, 0ms));
}

.radial-menu__item {
  position: absolute;
  display: flex;
  transform: translate3d(-50%, -50%, 0);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 0;
  overflow: hidden;
  background: transparent;
  color: var(--radial-text-muted);
  font-family: var(--radial-font-family);
  font-weight: 400;
  text-align: center;
  cursor: pointer;
  outline: none;
  backface-visibility: visible;
  pointer-events: auto;
  transition:
    color var(--radial-motion-hover) var(--radial-ease-out),
    opacity var(--radial-motion-hover) var(--radial-ease-out),
    transform var(--radial-motion-hover) var(--radial-ease-out),
    filter var(--radial-motion-hover) var(--radial-ease-out);
}

.radial-menu__item-content {
  display: flex;
  width: 100%;
  height: 100%;
  contain: layout paint style;
  transform: translate3d(0, 0, 0);
  transform-origin: 50% 50%;
  transform-style: preserve-3d;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  backface-visibility: visible;
  will-change: transform, opacity;
}

.radial-menu__item--inner {
  width: 86px;
  height: 54px;
}

.radial-menu__item--outer {
  width: 96px;
  height: 58px;
}

.radial-menu__item--nested {
  width: 64px;
  height: 45px;
}

.radial-menu__main-items .radial-menu__item {
  animation: radial-item-pop 210ms var(--radial-ease-out) both;
  animation-delay: calc(170ms + var(--delay, 0ms));
}

.radial-menu__action-layer--pop .radial-menu__item {
  animation: radial-item-pop 210ms var(--radial-ease-out) both;
  animation-delay: calc(40ms + var(--delay, 0ms));
}

.radial-menu__nested-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  contain: layout style;
  isolation: isolate;
  overflow: visible;
  pointer-events: none;
}

.radial-menu__nested-layer .radial-menu__item {
  animation: radial-item-pop 190ms var(--radial-ease-out) both;
  animation-delay: calc(42ms + var(--delay, 0ms));
}

.radial-menu__action-layer--switch-enter .radial-menu__item {
  animation: radial-action-item-enter-center 150ms var(--radial-ease-out) both;
  animation-delay: 87ms;
}

.radial-menu__action-layer--switch-leave .radial-menu__item {
  animation: radial-action-item-leave-center 87ms var(--radial-ease-in) both;
}

.radial-menu__item--hovered {
  color: var(--radial-text-hover);
  filter: none;
  transform: translate3d(-50%, -50%, 0) scale(1.02);
}

.radial-menu__item--active {
  color: var(--radial-text);
  filter: none;
  transform: translate3d(-50%, -50%, 0) scale(1.045);
}

.radial-menu__action-layer--items {
  z-index: 4;
  contain: layout paint style;
  isolation: isolate;
  perspective: 760px;
  transform: translate3d(0, 0, 0);
  transform-style: preserve-3d;
  will-change: transform;
}

.radial-menu__main-items {
  z-index: 5;
}

.radial-menu__item--disabled {
  cursor: default;
  opacity: 0.58;
}

.radial-menu__icon {
  flex: 0 0 auto;
  width: 25px;
  height: 25px;
  color: currentColor;
}

.radial-menu__item--nested .radial-menu__icon {
  width: 18px;
  height: 18px;
}

.radial-menu__label {
  display: -webkit-box;
  max-width: 100%;
  min-height: 14px;
  overflow: hidden;
  color: currentColor;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.12;
  letter-spacing: 0;
  overflow-wrap: break-word;
  text-shadow: 0 1px 11px var(--radial-shadow-strong);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.radial-menu__item--nested .radial-menu__label {
  min-height: 11px;
  font-size: 9.5px;
  font-weight: 400;
  line-height: 1.05;
}

.radial-menu__center {
  position: absolute;
  left: 50%;
  top: 85.714%;
  z-index: 6;
  display: grid;
  width: 28.571%;
  height: 28.571%;
  transform: translate(-50%, -50%);
  place-items: center;
  align-content: center;
  border: 0;
  background: transparent;
  color: var(--radial-center-text);
  cursor: pointer;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.12;
  letter-spacing: 0;
  text-align: center;
  animation: radial-center-text 150ms ease both;
  animation-delay: 90ms;
  transition:
    color var(--radial-motion-hover) var(--radial-ease-out),
    transform var(--radial-motion-hover) var(--radial-ease-out);
}

.radial-menu__center:hover {
  color: var(--radial-text-hover);
  transform: translate(-50%, -50%) scale(1.025);
}

.radial-menu__center:active {
  transform: translate(-50%, -50%) scale(0.98);
}

.radial-menu--closing .radial-menu__segment-hit {
  pointer-events: none;
}

.radial-menu--closing .radial-menu__action-layer--items .radial-menu__item {
  animation: radial-action-item-leave-center 44ms var(--radial-ease-in) both;
  animation-delay: var(--close-reverse-delay, 0ms);
}

.radial-menu--closing .radial-menu__nested-layer .radial-menu__item {
  animation: radial-action-item-leave-center 44ms var(--radial-ease-in) both;
  animation-delay: var(--close-reverse-delay, 0ms);
}

.radial-menu--closing .radial-menu__action-segments .radial-menu__segment-base {
  animation: radial-segment-fold 75ms var(--radial-ease-in) both;
  animation-delay: var(--close-reverse-delay, 0ms);
}

.radial-menu--closing .radial-menu__nested-segments .radial-menu__segment-base {
  animation: radial-segment-fold 75ms var(--radial-ease-in) both;
  animation-delay: var(--close-reverse-delay, 0ms);
}

.radial-menu--closing .radial-menu__action-segments .radial-menu__segment-highlight,
.radial-menu--closing .radial-menu__action-segments .radial-menu__segment-sheen,
.radial-menu--closing .radial-menu__action-segments .radial-menu__segment-rings {
  transition: none;
  animation: radial-highlight-hide 40ms ease both;
}

.radial-menu--closing .radial-menu__nested-segments .radial-menu__segment-highlight,
.radial-menu--closing .radial-menu__nested-segments .radial-menu__segment-sheen,
.radial-menu--closing .radial-menu__nested-segments .radial-menu__segment-rings {
  transition: none;
  animation: radial-highlight-hide 40ms ease both;
}

.radial-menu--closing .radial-menu__main-items .radial-menu__item {
  animation: radial-item-fold 75ms var(--radial-ease-in) both;
  animation-delay: var(--close-reverse-delay, 0ms);
}

.radial-menu--closing.radial-menu--has-actions .radial-menu__main-items .radial-menu__item {
  animation-delay: calc(160ms + var(--close-reverse-delay, 0ms));
}

.radial-menu--closing .radial-menu__main-segments .radial-menu__segment-base {
  animation: radial-segment-fold 75ms var(--radial-ease-in) both;
  animation-delay: var(--close-reverse-delay, 0ms);
}

.radial-menu--closing.radial-menu--has-actions .radial-menu__main-segments .radial-menu__segment-base {
  animation-delay: calc(160ms + var(--close-reverse-delay, 0ms));
}

.radial-menu--closing .radial-menu__main-segments .radial-menu__segment-highlight,
.radial-menu--closing .radial-menu__main-segments .radial-menu__segment-sheen,
.radial-menu--closing .radial-menu__main-segments .radial-menu__segment-rings {
  transition: none;
  animation: radial-highlight-hide 45ms ease both;
  animation-delay: 30ms;
}

.radial-menu--closing.radial-menu--has-actions .radial-menu__main-segments .radial-menu__segment-highlight,
.radial-menu--closing.radial-menu--has-actions .radial-menu__main-segments .radial-menu__segment-sheen,
.radial-menu--closing.radial-menu--has-actions .radial-menu__main-segments .radial-menu__segment-rings {
  animation-delay: 190ms;
}

.radial-menu--closing .radial-menu__center-orb {
  animation: radial-center-fold 75ms var(--radial-ease-in) both;
  animation-delay: 160ms;
}

.radial-menu--closing.radial-menu--has-actions .radial-menu__center-orb {
  animation-delay: 320ms;
}

.radial-menu--closing .radial-menu__center {
  animation: radial-center-text-fold 55ms ease both;
  animation-delay: 155ms;
}

.radial-menu--closing.radial-menu--has-actions .radial-menu__center {
  animation-delay: 315ms;
}

@keyframes radial-center-pop {
  0% {
    opacity: 0;
    transform: scale(0);
  }

  78% {
    opacity: 1;
    transform: scale(1.045);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes radial-center-fold {
  0% {
    opacity: 1;
    transform: scale(1);
  }

  100% {
    opacity: 0;
    transform: scale(0);
  }
}

@keyframes radial-center-text {
  from {
    opacity: 0;
    transform: translate3d(-50%, -50%, 0) scale(0.92);
  }

  to {
    opacity: 1;
    transform: translate3d(-50%, -50%, 0) scale(1);
  }
}

@keyframes radial-center-text-fold {
  from {
    opacity: 1;
    transform: translate3d(-50%, -50%, 0) scale(1);
  }

  to {
    opacity: 0;
    transform: translate3d(-50%, -50%, 0) scale(0.88);
  }
}

@keyframes radial-segment-pop {
  0% {
    opacity: 0;
    transform: scale(0);
  }

  72% {
    opacity: 1;
    transform: scale(1.035);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes radial-segment-fold {
  0% {
    opacity: 1;
    transform: scale(1);
  }

  100% {
    opacity: 0;
    transform: scale(0);
  }
}

@keyframes radial-highlight-hide {
  to {
    opacity: 0;
  }
}

@keyframes radial-item-pop {
  0% {
    opacity: 0;
    transform: translate3d(-50%, -50%, 0) scale(0);
  }

  72% {
    opacity: 1;
    transform: translate3d(-50%, -50%, 0) scale(1.08);
  }

  100% {
    opacity: 1;
    transform: translate3d(-50%, -50%, 0) scale(1);
  }
}

@keyframes radial-item-fold {
  0% {
    opacity: 1;
    transform: translate3d(-50%, -50%, 0) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate3d(
      calc(-50% + var(--shift-x, 0px)),
      calc(-50% + var(--shift-y, 24px)),
      0
    ) scale(0.72);
  }
}

@keyframes radial-action-item-enter-center {
  0% {
    opacity: 0;
    transform: translate3d(
      calc(-50% + var(--shift-x, 0px)),
      calc(-50% + var(--shift-y, 24px)),
      0
    ) scale(0.92);
  }

  100% {
    opacity: 1;
    transform: translate3d(-50%, -50%, 0) scale(1);
  }
}

@keyframes radial-action-item-leave-center {
  0% {
    opacity: 1;
    transform: translate3d(-50%, -50%, 0) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate3d(
      calc(-50% + var(--shift-x, 0px)),
      calc(-50% + var(--shift-y, 24px)),
      0
    ) scale(0.92);
  }
}

@media (max-width: 720px) {
  .radial-menu__item--inner {
    width: 74px;
    height: 50px;
  }

  .radial-menu__item--outer {
    width: 82px;
    height: 52px;
  }

  .radial-menu__item--nested {
    width: 56px;
    height: 40px;
  }

  .radial-menu__icon {
    width: 21px;
    height: 21px;
  }

  .radial-menu__item--nested .radial-menu__icon {
    width: 16px;
    height: 16px;
  }

  .radial-menu__label,
  .radial-menu__center {
    font-size: 11px;
  }

  .radial-menu__item--nested .radial-menu__label {
    font-size: 8.5px;
  }
}
</style>
