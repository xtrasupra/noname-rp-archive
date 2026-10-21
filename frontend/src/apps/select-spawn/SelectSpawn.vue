<template>
  <div class="select-spawn">
    <div class="select-spawn__container">

      <div class="select-spawn-bottom__name">
        <button
          v-if="selectedType"
          class="select-spawn__btn-check"
          type="button"
          :disabled="isPending"
          @click="confirmSpawn"
        >
          <img src="/check.png" alt="icon-check">
          {{ isPending ? 'Загрузка...' : 'Подтвердить' }}
        </button>

        <div class="select-spawn-list">
          <div class="select-spawn-list__item">
            <button
              v-for="option in options"
              :key="option.type"
              class="select-spawn__button"
              :class="{ 'select-spawn__button--active': selectedType === option.type }"
              type="button"
              :disabled="isPending"
              @click="selectOption(option.type)"
            >
              <img :src="getIconSrc(option)" alt="icon">
              {{ getLabel(option) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap, SpawnOption, SpawnOptionType } from '@/shared/contracts/ui'

const props = defineProps<{
  payload?: InterfacePayloadMap['selectSpawn']
}>()

const iconByName: Record<string, string> = {
  airport: './wifi.png',
  briefcase: './bag.png',
  building: './icon.png',
  city: './icon.png',
  clothing: './bag.png',
  default: './wifi.png',
  documents: './icon.png',
  fraction: './bag.png',
  home: './dom.png',
  house: './dom.png',
  job: './bag.png',
  last: './wifi.png',
  location: './wifi.png',
  office: './icon.png',
  radar: './wifi.png',
}

const labelByType: Record<string, string> = {
  apartment: 'Квартира',
  default: 'Начальный спавн',
  fraction: 'Фракция',
  house: 'Дом',
  last: 'Последняя точка',
  office: 'Офис',
}

const selectedType = ref<SpawnOptionType | null>(null)
const options = computed(() => props.payload?.options ?? [])
const isPending = computed(() => Boolean(props.payload?.pending))
let componentMounted = false

function acknowledgeMountedPayload() {
  callClientEvent('spawnSelector:mountedFromBrowser', props.payload?.uiRevision ?? 0)
}

function callPreview(type: SpawnOptionType) {
  callClientEvent('spawnSelector:previewFromBrowser', type)
}

function getLabel(option: SpawnOption) {
  return option.title || labelByType[option.type] || 'Спавн'
}

function getIconSrc(option: SpawnOption) {
  return iconByName[option.icon ?? option.type] ?? './wifi.png'
}

function selectOption(type: SpawnOptionType) {
  if (isPending.value) return

  selectedType.value = type
  callPreview(type)
}

function confirmSpawn() {
  if (!selectedType.value || isPending.value) {
    return
  }

  callClientEvent('spawnSelector:selectFromBrowser', selectedType.value)
}

watch(
  [
    () => props.payload?.selected,
    () => props.payload?.uiRevision,
  ],
  () => {
    selectedType.value = props.payload?.selected ?? null
  },
  { immediate: true },
)

onMounted(() => {
  componentMounted = true
  acknowledgeMountedPayload()
})

watch(
  () => props.payload?.uiRevision,
  () => {
    if (componentMounted) acknowledgeMountedPayload()
  },
)

</script>

<style lang="scss" scoped>
.select-spawn {
  height: 100vh;
}

.select-spawn__container {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
}
.select-spawn-list__item {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: px-to-vh(15);
}
.select-spawn-list {
  max-width: 92vw;
  max-height: 28vh;
  overflow-y: auto;
  padding: px-to-vh(4);
}
.select-spawn__button {
  display: flex;
  align-items: center;
  padding: px-to-vh(16) px-to-vh(15);
  border-radius: px-to-vh(30);
  border: none;
  background: rgba(0,0,0,0.4);
  gap: px-to-vh(11);
  font-size: px-to-vh(15);
  color: #FFFFFF;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.18s ease;
}

.select-spawn__button:hover {
  background: rgba(0,0,0,0.72);
  transform: translateY(px-to-vh(-2));
}

.select-spawn__button:disabled,
.select-spawn__btn-check:disabled {
  cursor: wait;
  opacity: 0.68;
  transform: none;
}

.select-spawn__button--active {
  background: rgba(0,0,0, 1);
}

.select-spawn__button--active:hover {
  background: rgba(0,0,0, 1);
}

.select-spawn-bottom__name {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: px-to-vh(10);
  margin-bottom: px-to-vh(21);


}
.select-spawn__btn-check{
  display: flex;
  align-items: center;
  padding: px-to-vh(12) px-to-vh(22);
  border-radius: px-to-vh(30);
  border: none;
  background: rgba(0,0,0,0.4);
  color: #ffffff;
  gap: px-to-vh(7);
  font-size: px-to-vh(15);
  cursor: pointer;
  transition: background 0.18s ease, transform 0.18s ease;
}

.select-spawn__btn-check:hover {
  background: rgba(0,0,0,0.72);
  transform: translateY(px-to-vh(-2));
}

</style>
