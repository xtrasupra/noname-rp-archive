<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { FishingGearEntry, InterfacePayloadMap } from '@/shared/contracts/ui'

type GearItem = FishingGearEntry['items'][number]

const props = defineProps<{
  payload?: InterfacePayloadMap['fishingCast']
}>()

const form = reactive({
  rodUid: '',
  reelUid: '',
  lineUid: '',
  hookItemId: '',
  baitItemId: '',
  supportUid: '',
  power: 0.65,
})

const emptyGear: NonNullable<InterfacePayloadMap['fishingCast']['gear']> = {}
const gear = computed<NonNullable<InterfacePayloadMap['fishingCast']['gear']>>(() => props.payload?.gear ?? emptyGear)
const point = computed(() => props.payload?.point ?? null)
const canCast = computed(() => Boolean(
  props.payload?.active &&
  point.value &&
  form.rodUid &&
  form.reelUid &&
  form.lineUid &&
  form.hookItemId &&
  form.baitItemId,
))

function allItems(entries?: FishingGearEntry[]) {
  return (entries ?? []).flatMap((entry) => entry.items.map((item) => ({
    ...item,
    itemId: item.itemId || item.id || entry.itemId,
  })))
}

function firstItem(entries?: FishingGearEntry[]) {
  return allItems(entries)[0] || null
}

function firstEntryId(entries?: FishingGearEntry[]) {
  return entries?.[0]?.itemId || ''
}

function labelForItem(item?: GearItem | null) {
  if (!item) return 'Не выбрано'
  const condition = Number(item.maxDurability || 0) > 0
    ? ` · ${Math.max(0, Math.round(Number(item.durability ?? item.maxDurability ?? 0)))}%`
    : ''
  return `${item.name || item.itemId || item.id}${condition}`
}

function entryLabel(entry: FishingGearEntry) {
  const amount = entry.items.reduce((total, item) => total + Math.max(1, Number(item.amount || 1)), 0)
  return `${entry.items[0]?.name || entry.itemId} · ${amount} шт.`
}

function syncDefaults() {
  const preferredRodUid = props.payload?.preferred?.rodUid || ''
  const rods = allItems(gear.value.rods)
  if (!form.rodUid || !rods.some((item) => item.uid === form.rodUid)) {
    form.rodUid = preferredRodUid && rods.some((item) => item.uid === preferredRodUid)
      ? preferredRodUid
      : (firstItem(gear.value.rods)?.uid || '')
  }
  if (!form.reelUid || !allItems(gear.value.reels).some((item) => item.uid === form.reelUid)) {
    form.reelUid = firstItem(gear.value.reels)?.uid || ''
  }
  if (!form.lineUid || !allItems(gear.value.lines).some((item) => item.uid === form.lineUid)) {
    form.lineUid = firstItem(gear.value.lines)?.uid || ''
  }
  if (!form.hookItemId || !gear.value.hooks?.some((entry) => entry.itemId === form.hookItemId)) {
    form.hookItemId = firstEntryId(gear.value.hooks)
  }
  if (!form.baitItemId || !gear.value.baits?.some((entry) => entry.itemId === form.baitItemId)) {
    form.baitItemId = firstEntryId(gear.value.baits)
  }
  if (!form.supportUid || !allItems(gear.value.support).some((item) => item.uid === form.supportUid)) {
    form.supportUid = ''
  }
}

function startCast() {
  if (!canCast.value) return
  callClientEvent('fishingCast:start', JSON.stringify({
    pointId: point.value?.id || '',
    rodUid: form.rodUid,
    reelUid: form.reelUid,
    lineUid: form.lineUid,
    hookItemId: form.hookItemId,
    baitItemId: form.baitItemId,
    supportUids: form.supportUid ? [form.supportUid] : [],
    power: form.power,
  }))
}

function close() {
  callClientEvent('fishingCast:close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
  if (event.key === 'Enter') startCast()
}

watch(() => props.payload, syncDefaults, { immediate: true, deep: true })
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <main class="fishing-cast">
    <section class="cast-panel">
      <header>
        <div>
          <span>Рыбалка</span>
          <h1>{{ props.payload?.title || 'Подготовка рыбалки' }}</h1>
          <p>{{ point ? point.name : 'Подойдите к точке ловли' }}</p>
        </div>
        <button type="button" @click="close">ESC</button>
      </header>

      <div class="cast-grid">
        <label>
          <span>Удочка</span>
          <select v-model="form.rodUid">
            <option v-for="item in allItems(gear.rods)" :key="item.uid" :value="item.uid">{{ labelForItem(item) }}</option>
          </select>
        </label>

        <label>
          <span>Катушка</span>
          <select v-model="form.reelUid">
            <option v-for="item in allItems(gear.reels)" :key="item.uid" :value="item.uid">{{ labelForItem(item) }}</option>
          </select>
        </label>

        <label>
          <span>Леска</span>
          <select v-model="form.lineUid">
            <option v-for="item in allItems(gear.lines)" :key="item.uid" :value="item.uid">{{ labelForItem(item) }}</option>
          </select>
        </label>

        <label>
          <span>Крючок</span>
          <select v-model="form.hookItemId">
            <option v-for="entry in gear.hooks" :key="entry.itemId" :value="entry.itemId">{{ entryLabel(entry) }}</option>
          </select>
        </label>

        <label>
          <span>Наживка</span>
          <select v-model="form.baitItemId">
            <option v-for="entry in gear.baits" :key="entry.itemId" :value="entry.itemId">{{ entryLabel(entry) }}</option>
          </select>
        </label>

        <label>
          <span>Снаряжение</span>
          <select v-model="form.supportUid">
            <option value="">Без доп. снаряжения</option>
            <option v-for="item in allItems(gear.support)" :key="item.uid" :value="item.uid">{{ labelForItem(item) }}</option>
          </select>
        </label>
      </div>

      <label class="power">
        <span>Сила заброса: {{ Math.round(form.power * 100) }}%</span>
        <input v-model.number="form.power" type="range" min="0.15" max="1" step="0.01">
      </label>

      <footer>
        <p v-if="!props.payload?.active">Сначала начните рыбалку у NPC.</p>
        <p v-else-if="!point">Вы не рядом с точкой ловли.</p>
        <p v-else-if="!canCast">Не хватает выбранного снаряжения.</p>
        <p v-else>Крючок и наживка спишутся при старте рыбалки.</p>
        <button type="button" :disabled="!canCast" @click="startCast">Начать рыбачить</button>
      </footer>
    </section>
  </main>
</template>

<style scoped lang="scss">
.fishing-cast {
  display: contents;
  color: #f8fbff;
  font-family: "Montserrat", "Inter", "Segoe UI", sans-serif;
  pointer-events: none;
  background: transparent;
}

.cast-panel {
  position: fixed;
  top: 50%;
  right: 4vw;
  transform: translateY(-50%);
  width: min(44vh, 36vw);
  padding: 1.8vh;
  box-sizing: border-box;
  border: 0.1vh solid rgb(214 76 255 / 50%);
  border-radius: 1.2vh;
  color: #f8fbff;
  font-family: "Montserrat", "Inter", "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at 16% 0%, rgb(214 76 255 / 22%), transparent 38%),
    linear-gradient(150deg, rgb(5 8 14 / 88%), rgb(15 6 23 / 86%));
  box-shadow: 0 2.4vh 6vh rgb(0 0 0 / 45%);
  pointer-events: auto;
}

header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1vh;
  margin-bottom: 1.6vh;

  span {
    color: #d94cff;
    font-size: 1.05vh;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.4vh 0 0;
    font-size: 2.3vh;
  }

  p {
    margin: 0.6vh 0 0;
    color: rgb(248 251 255 / 62%);
    font-size: 1.2vh;
  }

  button {
    min-width: 5.2vh;
    height: 3.2vh;
    border-radius: 0.7vh;
  }
}

.cast-grid {
  display: grid;
  gap: 0.9vh;
}

label {
  display: grid;
  gap: 0.45vh;

  span {
    color: rgb(248 251 255 / 68%);
    font-size: 1.1vh;
  }
}

select,
button {
  height: 3.8vh;
  border: 0.1vh solid rgb(214 76 255 / 38%);
  border-radius: 0.75vh;
  color: #fff;
  background: rgb(13 6 20 / 91%);
  font: inherit;
  font-size: 1.2vh;
  outline: none;
}

select {
  width: 100%;
  padding: 0 1vh;
}

button {
  cursor: pointer;
  transition: transform 150ms ease, background 150ms ease, border-color 150ms ease;

  &:hover:not(:disabled) {
    transform: translateY(-0.1vh);
    border-color: rgb(73 218 255 / 72%);
    background: linear-gradient(135deg, rgb(214 76 255 / 48%), rgb(73 218 255 / 18%));
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.power {
  margin: 1.5vh 0;

  input {
    width: 100%;
    accent-color: #d94cff;
  }
}

footer {
  display: grid;
  gap: 1vh;

  p {
    min-height: 2.8vh;
    margin: 0;
    color: rgb(248 251 255 / 62%);
    font-size: 1.1vh;
    line-height: 1.3;
  }

  button {
    height: 4.4vh;
    font-weight: 900;
  }
}
</style>
