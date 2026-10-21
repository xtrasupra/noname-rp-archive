<template>
  <section class="character-property">
    <h1 class="f2-menu__title">Имущество</h1>

    <div v-if="hasAnyProperty" class="character-property__layout">
      <section
        v-if="estateItemsView.length"
        class="character-property__section character-property__section--estate"
      >
        <h2>Недвижимость</h2>

        <div class="character-property__cards character-property__cards--estate">
          <article
            v-for="item in estateItemsView"
            :key="item.id"
            class="property-card"
          >
            <div class="property-card__content">
              <strong>{{ item.title }}<span v-if="item.number"> №{{ item.number }}</span></strong>

              <button
                v-if="hasMapPoint(item)"
                class="property-card__map"
                type="button"
                @click="handleMapClick(item)"
              >
                Метка на карте
                <BaseIcon :icon="MapPin" size="xs" :stroke-width="2.8" />
              </button>

              <small>Гос. стоимость</small>
              <b>{{ item.price }}</b>
            </div>

            <img
              class="property-card__image"
              :class="`property-card__image--${item.imageSize}`"
              :src="item.image"
              alt=""
            >
          </article>
        </div>
      </section>

      <section v-if="businessItemsView.length" class="character-property__section">
        <h2>Бизнес</h2>

        <div class="character-property__cards">
          <article
            v-for="item in businessItemsView"
            :key="item.id"
            class="property-card"
          >
            <div class="property-card__content">
              <strong>{{ item.title }}<span v-if="item.number"> №{{ item.number }}</span></strong>

              <button
                v-if="hasMapPoint(item)"
                class="property-card__map"
                type="button"
                @click="handleMapClick(item)"
              >
                Метка на карте
                <BaseIcon :icon="MapPin" size="xs" :stroke-width="2.8" />
              </button>

              <small>Гос. стоимость</small>
              <b>{{ item.price }}</b>
            </div>

            <img
              class="property-card__image property-card__image--business"
              :src="item.image"
              alt=""
            >
          </article>
        </div>
      </section>

      <section v-if="vehicleItemsView.length" class="character-property__section">
        <header class="character-property__section-header">
          <h2>Автомобили</h2>
        </header>

        <div class="character-property__cards">
          <article
            v-for="item in vehicleItemsView"
            :key="item.id"
            class="property-card"
          >
            <div class="property-card__content">
              <strong>{{ item.title }}<span v-if="item.number"> №{{ item.number }}</span></strong>

              <small>Гос. стоимость</small>
              <b>{{ item.price }}</b>
            </div>

            <img
              class="property-card__image property-card__image--vehicle"
              :src="item.image"
              alt=""
            >
          </article>
        </div>
      </section>
    </div>

    <div v-else class="character-property__empty">
      <strong>Имущество отсутствует</strong>
      <span>У персонажа нет дома, квартиры, бизнеса или транспорта.</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { BaseIcon, MapPin } from '@/shared/icons'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()

type PropertyImageSize = 'house' | 'apartment' | 'business' | 'vehicle'

type RawPropertyCard = {
  id?: string | number
  image?: string
  imageSize?: PropertyImageSize
  kind?: string
  number?: string | number
  price?: string | number
  title?: string
  x?: string | number
  y?: string | number
  z?: string | number
}

type PropertyCard = {
  id: string
  image: string
  imageSize: PropertyImageSize
  number: string
  price: string
  title: string
  x: number
  y: number
  z: number
}

const propertyPayload = computed(() => (props.payload as any)?.property ?? {})

const estateItemsView = computed(() => normalizeItems(propertyPayload.value.estate, 'house'))
const businessItemsView = computed(() => {
  const items = [
    ...asArray(propertyPayload.value.businesses),
    propertyPayload.value.business,
  ]

  return normalizeItems(items, 'business')
})
const vehicleItemsView = computed(() => {
  const items = [
    ...asArray(propertyPayload.value.vehicles),
    propertyPayload.value.vehicle,
  ]

  return normalizeItems(items, 'vehicle')
})

const hasAnyProperty = computed(() =>
  estateItemsView.value.length > 0 ||
  businessItemsView.value.length > 0 ||
  vehicleItemsView.value.length > 0
)

function asArray(value: unknown): RawPropertyCard[] {
  return Array.isArray(value) ? value : []
}

function normalizeItems(value: unknown, fallbackSize: PropertyImageSize): PropertyCard[] {
  return asArray(value)
    .filter(Boolean)
    .map((item, index) => normalizeItem(item, fallbackSize, index))
    .filter((item): item is PropertyCard => Boolean(item))
}

function normalizeItem(item: RawPropertyCard, fallbackSize: PropertyImageSize, index: number): PropertyCard | null {
  const title = String(item.title || '').trim()

  if (!title || title === 'Нет') return null

  const imageSize = item.imageSize || fallbackSize

  return {
    id: String(item.id || `${imageSize}-${index}`),
    image: item.image || getFallbackImage(imageSize),
    imageSize,
    number: String(item.number || '').trim(),
    price: formatPrice(item.price),
    title,
    x: Number(item.x || 0),
    y: Number(item.y || 0),
    z: Number(item.z || 0),
  }
}

function formatPrice(value: string | number | undefined) {
  if (typeof value === 'string' && value.trim().startsWith('$')) return value
  return `$ ${Number(value || 0).toLocaleString('ru-RU')}`
}

function getFallbackImage(size: PropertyImageSize) {
  if (size === 'apartment') return './property/apartment.png'
  if (size === 'business') return './property/business.png'
  if (size === 'vehicle') return './property/mercedes-g63.png'
  return './property/house.png'
}

function hasMapPoint(item: PropertyCard) {
  return Boolean(item.x || item.y || item.z)
}

function handleMapClick(item: PropertyCard) {
  const mp = (window as any).mp

  if (mp?.trigger) {
    mp.trigger('client:property:setWaypoint', item.x, item.y)
    mp.trigger('c:f2menu:close')
    return
  }

  ;(window as any).twinkleBrowser?.pages?.close?.('f2Menu')
}
</script>

<style scoped>
.character-property {
  min-height: 80vh;
  padding-bottom: 2vh;
}

.character-property__layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2vh 1.4vh;
  margin-top: 1.4vh;
}

.character-property__section {
  min-width: 0;
  display: grid;
  gap: 0.9vh;
}

.character-property__section--estate {
  grid-column: 1 / -1;
}

.character-property__section h2 {
  margin: 0;
  color: #ffffff;
  font-size: 1.75vh;
  font-weight: 850;
  line-height: 1;
}

.character-property__section-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1vh;
}

.character-property__cards {
  display: grid;
  gap: 1.4vh;
}

.character-property__cards--estate {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.property-card {
  position: relative;
  min-width: 0;
  min-height: 14.7vh;
  display: grid;
  align-items: stretch;
  padding: 1.55vh 1.65vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.74vh;
  background:
    linear-gradient(90deg, rgb(12 12 13 / 94%), rgb(23 23 24 / 88%)),
    rgb(8 8 9 / 92%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
  overflow: hidden;
}

.property-card__content {
  position: relative;
  z-index: 2;
  min-width: 0;
  display: grid;
  align-content: start;
  justify-items: start;
}

.property-card__content strong {
  min-width: 0;
  max-width: 24vh;
  overflow: hidden;
  color: #ffffff;
  font-size: 2.1vh;
  font-weight: 760;
  line-height: 1.06;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.property-card__content strong span,
.property-card__content b,
.property-card__content p :deep(svg) {
  color: #d454f4;
}

.property-card__map {
  display: inline-flex;
  align-items: center;
  gap: 0.45vh;
  margin: 1.15vh 0 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(255 255 255 / 36%);
  cursor: pointer;
  font: inherit;
  font-size: 1.28vh;
  font-weight: 760;
  line-height: 1;
  transition: color 140ms ease, text-shadow 140ms ease;
}

.property-card__map:hover {
  color: #d454f4;
  text-shadow: 0 0 1.2vh #d454f447;
}

.property-card__content small {
  margin-top: 1.15vh;
  color: rgb(255 255 255 / 31%);
  font-size: 1.18vh;
  font-weight: 760;
  line-height: 1;
}

.property-card__content b {
  margin-top: 0.36vh;
  font-size: 1.58vh;
  font-weight: 850;
  line-height: 1;
}

.property-card__image {
  position: absolute;
  z-index: 1;
  right: -0.2vh;
  bottom: -0.45vh;
  object-fit: contain;
  object-position: right bottom;
  pointer-events: none;
  user-select: none;
}

.property-card__image--house {
  right: -0.9vh;
  width: 21.5vh;
  max-height: 14.4vh;
}

.property-card__image--apartment {
  right: -0.45vh;
  width: 20.3vh;
  max-height: 14.8vh;
}

.property-card__image--business {
  right: -1.1vh;
  width: 17.8vh;
  max-height: 14.9vh;
}

.property-card__image--vehicle {
  right: -1.6vh;
  bottom: -0.75vh;
  width: 22.5vh;
  max-height: 14.4vh;
}

.character-property__empty {
  min-height: 30vh;
  margin-top: 1.4vh;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.9vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.74vh;
  background: rgb(8 8 9 / 62%);
  color: rgb(255 255 255 / 42%);
}

.character-property__empty strong {
  color: #ffffff;
  font-size: 2vh;
  font-weight: 850;
}

.character-property__empty span {
  font-size: 1.3vh;
  font-weight: 700;
}
</style>
