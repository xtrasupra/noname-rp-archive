<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import { fallbackCharacterSelectionSlots } from '@/shared/fixtures/character-selection.fixture'
import type {
  CharacterSelectionCharacter,
  CharacterSelectionRole,
  CharacterSelectionSlot,
  InterfacePayloadMap,
} from '@/shared/contracts/ui'

const props = defineProps<{
  payload?: InterfacePayloadMap['characterSelection']
}>()

const selectedSlotId = ref<number | null>(null)
const isPending = computed(() => Boolean(props.payload?.pending))
let componentMounted = false

function acknowledgeMountedPayload() {
  callClientEvent('characterSelection:mountedFromBrowser', props.payload?.uiRevision ?? 0)
}
const slots = computed<CharacterSelectionSlot[]>(() => {
  const incomingSlots = props.payload?.slots?.slice(0, 3) ?? fallbackCharacterSelectionSlots

  return Array.from({ length: 3 }, (_, index) => (
    incomingSlots[index] ?? {
      id: index + 1,
      state: index === 2 ? 'notPurchased' : 'empty',
    }
  ))
})
const characterSlots = computed(() => slots.value.filter((slot) => slot.state === 'character' && slot.character))
const selectedSlot = computed(() => {
  const selected = slots.value.find((slot) => slot.id === selectedSlotId.value)

  return selected ?? characterSlots.value[0] ?? slots.value[0]
})
const selectedCharacter = computed(() => selectedSlot.value?.character ?? null)
const organizationLabel = computed(() => selectedCharacter.value?.organization || 'Нет')
const totalOnlineLabel = computed(() => formatOnlineTime(selectedCharacter.value?.totalOnlineTime ?? 0))

function formatCurrency(value: number) {
  return value.toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  })
}

function formatOnlineTime(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60

  return `${hours} ч. ${restMinutes} м.`
}

function getCharacterName(character: CharacterSelectionCharacter) {
  return character.name ?? `${character.firstName} ${character.lastName}`
}

function getRoleLabel(role: CharacterSelectionRole) {
  const labelByRole: Record<string, string> = {
    administrator: 'Администратор',
    leader: 'Лидер',
    player: 'Игрок',
  }

  return labelByRole[role] ?? role
}

function getSlotTitle(slot: CharacterSelectionSlot) {
  if (slot.title) {
    return slot.title
  }

  switch (slot.state) {
    case 'empty':
      return 'Персонаж не создан'
    case 'locked':
      return 'Персонаж заблокирован'
    case 'notPurchased':
      return 'Слот не куплен'
    case 'character':
      return slot.character ? getCharacterName(slot.character) : 'Персонаж'
  }
}

function getSlotDescription(slot: CharacterSelectionSlot) {
  if (slot.description) {
    return slot.description
  }

  switch (slot.state) {
    case 'empty':
      return 'Создайте нового персонажа'
    case 'locked':
      return 'Персонаж заблокирован администрацией'
    case 'notPurchased':
      return 'Купите дополнительный слот'
    case 'character':
      return slot.character ? getRoleLabel(slot.character.role) : 'Игрок'
  }
}

function getLockReason(slot: CharacterSelectionSlot) {
  return slot.lockReason || slot.description || 'Причина не указана'
}

function getLockDuration(slot: CharacterSelectionSlot) {
  return slot.lockedFor || slot.lockedUntil || 'до решения администрации'
}

function getLockAdmin(slot: CharacterSelectionSlot) {
  const fullName = [slot.lockedByFirstName, slot.lockedByLastName].filter(Boolean).join(' ')

  return slot.lockedBy || fullName || 'Администратор не указан'
}

function selectSlot(slot: CharacterSelectionSlot) {
  if (isPending.value) return

  selectedSlotId.value = slot.id

  if (slot.state === 'character' && slot.character) {
    callClientEvent('characterSelection:previewFromBrowser', slot.character.id, slot.id)
  }
}

function handleSlotAction(slot: CharacterSelectionSlot) {
  if (isPending.value) return

  selectSlot(slot)

  switch (slot.state) {
    case 'character':
      if (slot.character) {
        callClientEvent('characterSelection:selectFromBrowser', slot.character.id, slot.id)
      }
      break
    case 'empty':
      callClientEvent('characterSelection:createFromBrowser', slot.id)
      break
    case 'locked':
      callClientEvent('characterSelection:lockedSlotFromBrowser', slot.id)
      break
    case 'notPurchased':
      callClientEvent('characterSelection:purchaseSlotFromBrowser', slot.id)
      break
  }
}

function playSelected() {
  if (!selectedSlot.value || isPending.value) {
    return
  }

  handleSlotAction(selectedSlot.value)
}

watch(
  [
    () => props.payload?.selectedSlotId,
    () => props.payload?.uiRevision,
  ],
  () => {
    selectedSlotId.value = props.payload?.selectedSlotId ?? characterSlots.value[0]?.id ?? slots.value[0]?.id ?? null
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

<template>
  <main class="character-selection">
    <section class="character-selection__shell">
      <div class="character-selection__content">
        <div class="character-selection__slots">
          <button
            v-for="slot in slots"
            :key="slot.id"
            class="character-slot"
            :class="[
              `character-slot--${slot.state}`,
              { 'character-slot--active': selectedSlot?.id === slot.id },
            ]"
            type="button"
            :disabled="isPending"
            @click="selectSlot(slot)"
            @dblclick="handleSlotAction(slot)"
          >
            <template v-if="slot.state === 'character' && slot.character">
              <div class="character-slot__image-panel">
                <span class="character-slot__badge">{{ getRoleLabel(slot.character.role) }}</span>
              </div>

              <div class="character-slot__info-panel">
                <span class="character-slot__id">#{{ slot.character.id }}</span>
                <strong class="character-slot__name">{{ getCharacterName(slot.character) }}</strong>

                <div class="character-slot__balance">
                  <span>
                    <small>Наличные</small>
                    ${{ formatCurrency(slot.character.cash) }}
                  </span>
                  <span>
                    <small>Банк</small>
                    ${{ formatCurrency(slot.character.bank) }}
                  </span>
                </div>
              </div>
            </template>

            <template v-else>
              <span
                class="character-slot__state-icon"
                :class="{
                  'character-slot__state-icon--plus': slot.state === 'empty',
                  'character-slot__state-icon--lock': slot.state !== 'empty',
                }"
                aria-hidden="true"
              ></span>
              <strong class="character-slot__empty-title">{{ getSlotTitle(slot) }}</strong>
              <span class="character-slot__empty-copy">{{ getSlotDescription(slot) }}</span>

              <span v-if="slot.state === 'locked'" class="character-slot__lock-popover">
                <span class="character-slot__lock-label">Блокировка</span>
                <strong>{{ getLockReason(slot) }}</strong>
                <small>{{ getLockDuration(slot) }}</small>
                <span class="character-slot__lock-admin">{{ getLockAdmin(slot) }}</span>
              </span>
            </template>
          </button>
        </div>

        <footer class="character-selection__account">
          <div class="character-selection__avatar"></div>
          <div>
            <span class="character-selection__account-muted">Выбранный слот</span>
            <strong>{{ getSlotTitle(selectedSlot) }}</strong>
          </div>
          <div class="character-selection__metric">
            <strong>{{ selectedCharacter ? getRoleLabel(selectedCharacter.role) : 'Нет' }}</strong>
            <small>Статус</small>
          </div>
          <div class="character-selection__metric">
            <strong>{{ selectedCharacter ? `$${formatCurrency(selectedCharacter.cash)}` : '-' }}</strong>
            <small>Наличные</small>
          </div>
          <div class="character-selection__metric">
            <strong>{{ selectedCharacter ? `$${formatCurrency(selectedCharacter.bank)}` : '-' }}</strong>
            <small>Банк</small>
          </div>
        </footer>
      </div>

      <aside class="character-selection__details">
        <template v-if="selectedCharacter">
          <div class="character-selection__details-top">
            <div>
              <strong>{{ selectedCharacter.lastOnline ?? '-' }}</strong>
              <span>Последний вход</span>
            </div>
            <div class="character-selection__level">
              <strong>{{ selectedCharacter.level ?? 1 }}</strong>
              <span>Уровень</span>
            </div>
          </div>

          <div class="character-selection__details-portrait" aria-hidden="true"></div>

          <h2>{{ getCharacterName(selectedCharacter) }}</h2>

          <dl class="character-selection__info">
            <div>
              <dt>Статус</dt>
              <dd>{{ getRoleLabel(selectedCharacter.role) }}</dd>
            </div>
            <div>
              <dt>Организация</dt>
              <dd>{{ organizationLabel }}</dd>
            </div>
            <div>
              <dt>ID персонажа</dt>
              <dd>#{{ selectedCharacter.id }}</dd>
            </div>
            <div>
              <dt>Наличные / банк</dt>
              <dd>${{ formatCurrency(selectedCharacter.cash) }} / ${{ formatCurrency(selectedCharacter.bank) }}</dd>
            </div>
          </dl>

          <div class="character-selection__online">
            <span>Онлайн:</span>
            <strong>{{ totalOnlineLabel }}</strong>
          </div>
        </template>

        <template v-else>
          <div class="character-selection__empty-details">
            <span
              class="character-slot__state-icon"
              :class="{
                'character-slot__state-icon--plus': selectedSlot?.state === 'empty',
                'character-slot__state-icon--lock': selectedSlot?.state !== 'empty',
              }"
              aria-hidden="true"
            ></span>
            <h2>{{ getSlotTitle(selectedSlot) }}</h2>
            <p>{{ getSlotDescription(selectedSlot) }}</p>
          </div>
        </template>

        <button class="character-selection__action" type="button" :disabled="isPending" @click="playSelected">
          {{ isPending ? 'Загрузка...' : selectedCharacter ? 'Играть' : selectedSlot?.state === 'empty' ? 'Создать' : 'Подробнее' }}
        </button>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.character-selection {
  min-height: 100vh;
  display: grid;
  place-items: stretch;
  padding: 2.4vh;
  background:
    radial-gradient(70vh 42vh at 88% 14%, rgb(92 51 170 / 20%), transparent 72%),
    radial-gradient(64vh 38vh at 18% 88%, rgb(60 34 130 / 18%), transparent 76%),
    linear-gradient(180deg, #07070b 0%, #0a0a10 52%, #090711 100%);
  color: #f7f7fb;
  font-family: "SF Pro Display", "Segoe UI", sans-serif;
  box-sizing: border-box;
}

.character-selection::before {
  position: fixed;
  inset: 0;
  background:
    linear-gradient(90deg, rgb(255 255 255 / 2%) 1px, transparent 1px),
    linear-gradient(180deg, rgb(255 255 255 / 2%) 1px, transparent 1px);
  background-size: 4.6vh 4.6vh;
  content: "";
  opacity: 0.16;
  pointer-events: none;
}

.character-slot:disabled,
.character-selection__action:disabled {
  cursor: wait;
  opacity: 0.68;
}

.character-selection__shell {
  position: relative;
  z-index: 1;
  display: grid;
  width: 100%;
  min-height: calc(100vh - 4.8vh);
  padding: 2.5vh;
  gap: 1.8vh;
  grid-template-columns: minmax(0, 1fr) 32vh;
  border-radius: 3.6vh;
  background:
    radial-gradient(58vh 30vh at 18% 0%, rgb(120 50 255 / 18%), transparent 70%),
    radial-gradient(48vh 26vh at 92% 92%, rgb(80 30 180 / 16%), transparent 76%),
    rgb(9 9 9 / 90%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 4%), 0 2.6vh 7vh rgb(0 0 0 / 42%);
  box-sizing: border-box;
}

.character-selection__content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1.4vh;
}

.character-selection__slots {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8vh;
}

.character-slot {
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: stretch;
  align-items: stretch;
  padding: 0;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 1.4vh;
  background: rgb(16 16 16 / 90%);
  color: #ffffff;
  cursor: pointer;
  overflow: hidden;
  text-align: left;
  transition: border-color 0.18s ease, filter 0.18s ease;
}

.character-slot:hover {
  border-color: rgb(255 255 255 / 14%);
  filter: brightness(1.06);
}

.character-slot--active {
  border-color: rgb(255 255 255 / 40%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%);
}

.character-slot--locked {
  border-color: rgb(255 156 62 / 14%);
}

.character-slot--locked:hover {
  border-color: rgb(255 156 62 / 54%);
}

.character-slot--empty,
.character-slot--locked,
.character-slot--notPurchased {
  align-items: center;
  justify-content: center;
  gap: 0.8vh;
  padding: 2vh;
  text-align: center;
}

.character-slot__image-panel {
  position: relative;
  min-height: 22vh;
  flex: 1 1 auto;
  overflow: hidden;
  background:
    radial-gradient(22vh 14vh at 50% 100%, rgb(80 38 160 / 28%), transparent 74%),
    linear-gradient(180deg, rgb(31 31 36 / 92%) 0%, rgb(20 20 24 / 94%) 100%);
}

.character-slot--active .character-slot__image-panel {
  background:
    radial-gradient(26vh 16vh at 50% 100%, rgb(105 68 196 / 44%), transparent 74%),
    linear-gradient(180deg, rgb(42 42 48 / 95%) 0%, rgb(18 18 22 / 96%) 100%);
}

.character-selection__details-portrait {
  position: absolute;
  inset: 2vh 1.2vh 0;
  background:
    radial-gradient(circle at 50% 12%, #c89575 0 9%, transparent 10%),
    linear-gradient(75deg, transparent 0 39%, #2f3340 40% 58%, transparent 59% 100%),
    linear-gradient(105deg, transparent 0 36%, #3d4251 37% 58%, transparent 59% 100%),
    linear-gradient(180deg, transparent 0 24%, #262935 25% 100%);
  clip-path: polygon(40% 0, 60% 0, 72% 22%, 85% 85%, 15% 85%, 28% 22%);
  opacity: 0.92;
}

.character-slot__badge {
  position: absolute;
  top: 1.2vh;
  right: 1.2vh;
  padding: 0.45vh 0.8vh;
  border-radius: 999px;
  background: rgb(0 0 0 / 48%);
  color: rgb(255 255 255 / 82%);
  font-size: 1.1vh;
}

.character-slot__info-panel {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 12vh;
  flex-direction: column;
  justify-content: center;
  gap: 0.7vh;
  padding: 1.3vh 1.5vh;
  border-top: 1px solid rgb(255 255 255 / 4%);
  background: rgb(13 16 22 / 72%);
}

.character-slot__id {
  color: rgb(255 255 255 / 68%);
  font-size: 1.25vh;
}

.character-slot__name {
  font-size: 2vh;
  line-height: 1.05;
}

.character-slot__balance {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7vh;
}

.character-slot__balance span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 0.8vh;
  border-radius: 0.8vh;
  background: rgb(0 0 0 / 28%);
  font-size: 1.25vh;
  font-weight: 700;
}

.character-slot__balance small,
.character-slot__empty-copy {
  color: rgb(255 255 255 / 58%);
  font-size: 1.15vh;
  font-weight: 500;
}

.character-slot__state-icon {
  position: relative;
  display: grid;
  place-items: center;
}

.character-slot__state-icon--plus {
  width: 5.6vh;
  height: 5.6vh;
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: 50%;
  background: rgb(0 0 0 / 30%);
}

.character-slot__state-icon--plus::before,
.character-slot__state-icon--plus::after {
  position: absolute;
  width: 2.2vh;
  height: 0.22vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 62%);
  content: "";
}

.character-slot__state-icon--plus::after {
  transform: rotate(90deg);
}

.character-slot__state-icon--lock {
  width: 4.4vh;
  height: 3.2vh;
  margin-top: 1.8vh;
  border-radius: 0.8vh;
  background: rgb(255 255 255 / 24%);
}

.character-slot__state-icon--lock::before {
  position: absolute;
  left: 50%;
  bottom: 2.2vh;
  width: 3.2vh;
  height: 3.2vh;
  border: 0.7vh solid rgb(255 255 255 / 24%);
  border-bottom: 0;
  border-radius: 2vh 2vh 0 0;
  content: "";
  transform: translateX(-50%);
}

.character-slot__state-icon--lock::after {
  position: absolute;
  left: 50%;
  top: 1vh;
  width: 0.55vh;
  height: 1.1vh;
  border-radius: 999px;
  background: rgb(16 16 16 / 90%);
  content: "";
  transform: translateX(-50%);
}

.character-slot__empty-title {
  font-size: 1.8vh;
}

.character-slot__lock-popover {
  position: absolute;
  align-items: start;
  left: 1.2vh;
  right: 1.2vh;
  bottom: 1.2vh;
  display: flex;
  flex-direction: column;
  gap: 0.35vh;
  padding: 1vh 1.1vh;
  border: 1px solid rgb(255 172 72 / 32%);
  border-radius: 1.1vh;
  background:
    linear-gradient(135deg, rgb(255 111 46 / 22%), rgb(255 190 74 / 12%)),
    rgb(12 10 8 / 94%);
  box-shadow: 0 1.4vh 3vh rgb(0 0 0 / 36%);
  opacity: 0;
  pointer-events: none;
  transform: translateY(0.8vh);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.character-slot--locked:hover .character-slot__lock-popover,
.character-slot--locked:focus-visible .character-slot__lock-popover {
  opacity: 1;
  transform: translateY(0);
}

.character-slot__lock-label {
  width: max-content;
  padding: 0.25vh 0.65vh;
  border-radius: 999px;
  background: rgb(255 161 55 / 16%);
  color: #ffb25f;
  font-size: 1vh;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.character-slot__lock-popover strong {
  color: #ffffff;
  font-size: 1.35vh;
  line-height: 1.2;
}

.character-slot__lock-popover small {
  color: #ffd29a;
  font-size: 1.2vh;
  font-weight: 700;
}

.character-slot__lock-admin {
  margin-top: 0.2vh;
  color: rgb(255 255 255 / 72%);
  font-size: 1.15vh;
  font-weight: 700;
}

.character-slot__lock-admin::before {
  color: rgb(255 178 95 / 88%);
  content: "Администратор: ";
}

.character-selection__account {
  min-height: 10.4vh;
  display: grid;
  grid-template-columns: 5.8vh minmax(17vh, 1fr) repeat(3, 12vh);
  align-items: center;
  gap: 1.8vh;
  padding: 1.8vh 2.2vh;
  border-radius: 1.8vh;
  background: rgb(16 16 16 / 90%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 4%);
}

.character-selection__avatar {
  width: 5.8vh;
  height: 4.4vh;
  border-radius: 0.8vh;
  background:
    radial-gradient(circle at 72% 32%, rgb(255 255 255 / 78%) 0 8%, transparent 9%),
    linear-gradient(135deg, #d5e3ed, #507f58 45%, #292d34 100%);
}

.character-selection__account-muted,
.character-selection__account strong {
  display: block;
  font-size: 1.4vh;
}

.character-selection__account-muted {
  color: rgb(255 255 255 / 52%);
}

.character-selection__metric {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
}

.character-selection__metric strong {
  max-width: 100%;
  overflow: hidden;
  font-size: 1.9vh;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.character-selection__metric small {
  color: rgb(255 255 255 / 48%);
  font-size: 1.25vh;
}

.character-selection__details {
  position: relative;
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 2vh 1.8vh 0;
  border-radius: 2.4vh;
  background:
    radial-gradient(32vh 20vh at 50% 0%, rgb(80 38 160 / 20%), transparent 70%),
    rgb(16 16 16 / 90%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 4%);
  overflow: hidden;
}

.character-selection__details-top {
  display: flex;
  justify-content: space-between;
  gap: 2vh;
}

.character-selection__details-top strong,
.character-selection__details-top span,
.character-selection__level strong,
.character-selection__level span {
  display: block;
}

.character-selection__details-top strong {
  font-size: 1.75vh;
}

.character-selection__details-top span {
  color: rgb(255 255 255 / 48%);
  font-size: 1.2vh;
}

.character-selection__level {
  text-align: right;
}

.character-selection__level strong {
  font-size: 4.4vh;
  line-height: 0.9;
}

.character-selection__details-portrait {
  position: relative;
  inset: auto;
  width: 12vh;
  height: 13vh;
  margin-top: 0.6vh;
  align-self: center;
}

.character-selection__details h2,
.character-selection__empty-details h2 {
  margin: 0.8vh 0 2.4vh;
  font-size: 2.8vh;
  line-height: 1.1;
}

.character-selection__info {
  display: grid;
  gap: 1vh;
  margin: 0;
}

.character-selection__info dt {
  color: rgb(255 255 255 / 45%);
  font-size: 1.35vh;
}

.character-selection__info dd {
  margin: 0;
  color: #ffffff;
  font-size: 1.6vh;
  font-weight: 700;
}

.character-selection__online {
  margin-top: 2vh;
}

.character-selection__online span,
.character-selection__empty-details p {
  color: rgb(255 255 255 / 45%);
  font-size: 1.55vh;
}

.character-selection__online strong {
  display: block;
  margin-top: 0.4vh;
  font-size: 3.4vh;
  line-height: 1;
}

.character-selection__empty-details {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.character-selection__empty-details p {
  max-width: 22vh;
  margin: 0;
  line-height: 1.45;
}

.character-selection__action {
  width: 100%;
  min-height: 5.8vh;
  margin: auto 0 1.8vh;
  border: 0;
  border-radius: 1.5vh;
  background: #101010;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%);
  color: #ffffff;
  cursor: pointer;
  font-size: 1.8vh;
  font-weight: 700;
  transition: background 0.18s ease, transform 0.18s ease;
}

.character-selection__action:hover {
  background: #ffffff;
  color: #101010;
  transform: translateY(-1px);
}

@media (max-width: 980px) {
  .character-selection {
    padding: 2vh;
  }

  .character-selection__shell {
    grid-template-columns: 1fr;
  }

  .character-selection__slots {
    grid-template-columns: 1fr;
  }

  .character-selection__account {
    grid-template-columns: 5.8vh 1fr;
  }
}
</style>
