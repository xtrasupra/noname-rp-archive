<template>
  <section>
    <h1 class="f2-menu__title">Обращения</h1>

    <div class="appeals-layout">
      <div class="appeals-list">
        <form v-if="!isAdminViewer" class="appeals-create" @submit.prevent="createAppeal">
          <label>Новое обращение</label>
          <textarea
            v-model.trim="newAppealText"
            placeholder="Опишите проблему для администрации..."
            rows="4"
          ></textarea>
          <button type="submit" :disabled="!newAppealText">Отправить</button>
        </form>

        <button
          v-for="appeal in appeals"
          :key="appeal.id"
          class="appeals-list__item"
          :class="{ 'appeals-list__item--active': appeal.id === selectedAppealId }"
          type="button"
          @click="selectedAppealId = appeal.id"
        >
          <strong>
            <span class="appeals-list__icon"></span>
            Обращение №{{ appeal.id }}
          </strong>

          <span>Игрок: {{ appeal.playerName }}</span>
          <span>Вопрос: {{ appeal.question }}</span>
          <span>Статус: <b>{{ appeal.status }}</b></span>

          <span v-if="appeal.adminName">
            Админ: <b>{{ appeal.adminName }}</b>
          </span>
        </button>

        <div v-if="!appeals.length" class="appeals-empty">
          Активных обращений нет.
        </div>
      </div>

      <article v-if="selectedAppeal" class="appeal-chat">
        <h2>Обращение №{{ selectedAppeal.id }}</h2>

        <div class="appeal-chat__messages">
          <div
            v-for="message in selectedAppeal.messages"
            :key="message.id"
            class="appeal-message"
            :class="`appeal-message--${message.role}`"
          >
            <div class="appeal-message__author">
              <span
                class="appeal-message__role"
                :class="message.role === 'admin'
                  ? 'appeal-message__role--admin'
                  : 'appeal-message__role--player'"
              >
                {{ message.role === 'admin' ? 'Администратор' : 'Игрок' }}
              </span>

              <strong>{{ message.author }}</strong>
            </div>

            <p>{{ message.text }}</p>
          </div>
        </div>

        <div class="appeal-chat__actions">
          <button
            v-if="isAdminViewer && !selectedAppeal.adminId"
            type="button"
            :disabled="selectedAppeal.status === 'Закрыто'"
            @click="takeAppeal"
          >
            Взять обращение
          </button>

          <button v-if="isAdminViewer" type="button" :disabled="!canUseAdminActions" @click="teleportPlayerToMe">
            Телепортировать игрока
          </button>

          <button v-if="isAdminViewer" type="button" :disabled="!canUseAdminActions" @click="teleportToPlayer">
            Телепортироваться к игроку
          </button>

          <button v-if="isAdminViewer" type="button" :disabled="!canUseAdminActions" @click="needHelp">
            Помощь другого администратора
          </button>

          <button type="button" :disabled="!canWorkWithSelected" @click="closeAppeal">
            Закрыть обращение
          </button>
        </div>

        <form class="appeal-chat__input" @submit.prevent="sendMessage">
          <input
            v-model.trim="draftMessage"
            type="text"
            placeholder="Написать сообщение..."
            :disabled="!canWorkWithSelected"
          >

          <button
            class="appeal-chat__attach"
            type="submit"
            aria-label="Отправить сообщение"
            :disabled="!canWorkWithSelected"
          >
            <BaseIcon :icon="Send" size="sm" :stroke-width="2.4" />
          </button>
        </form>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { BaseIcon, Send } from '@/shared/icons'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()

type AppealStatus =
  | 'Открыто'
  | 'Ожидает ответа'
  | 'Рассматривается'
  | 'Рассмотрено'
  | 'Закрыто'

type AppealMessageRole = 'player' | 'admin'

type AppealMessage = {
  author: string
  createdAt?: number
  id: string
  role: AppealMessageRole
  text: string
}

type AppealItem = {
  adminId?: number | null
  adminName?: string | null
  createdAt?: number
  id: number
  messages: AppealMessage[]
  playerId: number
  playerName: string
  question: string
  status: AppealStatus
  updatedAt?: number
  viewer?: {
    id?: number
    isAdmin?: boolean
    name?: string
    role?: 'admin' | 'player'
  }
}

const appeals = ref<AppealItem[]>([])
const selectedAppealId = ref<number | null>(null)
const draftMessage = ref('')
const newAppealText = ref('')

const serverAppeals = computed(() => {
  const payload = props.payload as any
  const items = payload?.appeals?.items ?? payload?.appeals

  return normalizeAppeals(items)
})

const selectedAppeal = computed(() => {
  return appeals.value.find((appeal) => appeal.id === selectedAppealId.value) ?? null
})

const isAdminViewer = computed(() => {
  const payload = props.payload as any
  const selected = selectedAppeal.value as any

  return Boolean(
    payload?.appeals?.permissions?.isAdmin ||
    selected?.viewer?.isAdmin ||
    (window as any).__TWINKLE_REPORTS_PERMISSIONS__?.isAdmin,
  )
})

const canWorkWithSelected = computed(() => {
  if (!selectedAppeal.value) {
    return false
  }

  if (isClosedAppeal(selectedAppeal.value.status)) {
    return false
  }

  return !isAdminViewer.value || Boolean(selectedAppeal.value.adminId)
})

const canUseAdminActions = computed(() => {
  if (!selectedAppeal.value) {
    return false
  }

  if (isClosedAppeal(selectedAppeal.value.status)) {
    return false
  }

  return isAdminViewer.value && Boolean(selectedAppeal.value.adminId)
})

watch(appeals, () => {
  if (!appeals.value.length) {
    selectedAppealId.value = null
    return
  }

  const exists = appeals.value.some((appeal) => appeal.id === selectedAppealId.value)

  if (!exists) {
    selectedAppealId.value = appeals.value[0].id
  }
})

function mpTrigger(eventName: string, ...args: unknown[]) {
  try {
    const rageMp = (window as any).mp

    if (rageMp?.trigger) {
      rageMp.trigger(eventName, ...args)
    }
  } catch {}
}

function normalizeStatus(status: unknown): AppealStatus {
  const statusMap: Record<string, AppealStatus> = {
    closed: 'Закрыто',
    done: 'Рассмотрено',
    inProgress: 'Рассматривается',
    open: 'Открыто',
    pending: 'Ожидает ответа',
    'Закрыто': 'Закрыто',
    'Ожидает ответа': 'Ожидает ответа',
    'Открыто': 'Открыто',
    'Рассматривается': 'Рассматривается',
    'Рассмотрено': 'Рассмотрено',
  }

  return statusMap[String(status)] ?? 'Открыто'
}

function isClosedAppeal(status: unknown) {
  const value = String(status || '')

  return value === 'Закрыто' || value === 'Ð—Ð°ÐºÑ€Ñ‹Ñ‚Ð¾'
}
function normalizeAppeals(value: unknown): AppealItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item: any) => ({
    id: Number(item.id),
    question: String(item.question || ''),
    status: normalizeStatus(item.status),

    playerId: Number(item.playerId || 0),
    playerName: String(item.playerName || 'Unknown'),

    adminId: item.adminId ?? null,
    adminName: item.adminName ?? null,

    createdAt: Number(item.createdAt || Date.now()),
    updatedAt: Number(item.updatedAt || Date.now()),
    viewer: item.viewer,

    messages: Array.isArray(item.messages)
      ? item.messages.map((message: any) => ({
          id: String(message.id || `${item.id}-${Math.random()}`),
          author: String(message.author || 'Unknown'),
          role: message.role === 'admin' ? 'admin' : 'player',
          text: String(message.text || ''),
          createdAt: Number(message.createdAt || Date.now()),
        }))
      : [],
  }))
}

function handleReportsSet(event: Event) {
  const customEvent = event as CustomEvent
  appeals.value = normalizeAppeals(customEvent.detail)
}

function handleReportsPermissions(event: Event) {
  ;(window as any).__TWINKLE_REPORTS_PERMISSIONS__ = (event as CustomEvent).detail || null
}

watch(
  serverAppeals,
  (items) => {
    appeals.value = items
  },
  { immediate: true },
)

function requestReports() {
  mpTrigger('reports:request')
}

function createAppeal() {
  if (!newAppealText.value) {
    return
  }

  mpTrigger('reports:create', newAppealText.value)
  newAppealText.value = ''
}

function takeAppeal() {
  if (!selectedAppeal.value) {
    return
  }

  mpTrigger('reports:take', selectedAppeal.value.id)
}

function sendMessage() {
  if (!draftMessage.value || !selectedAppeal.value) {
    return
  }

  mpTrigger('reports:sendMessage', selectedAppeal.value.id, draftMessage.value)
  draftMessage.value = ''
}

function closeAppeal() {
  if (!selectedAppeal.value) {
    return
  }

  mpTrigger('reports:close', selectedAppeal.value.id)
}

function teleportToPlayer() {
  if (!selectedAppeal.value) {
    return
  }

  mpTrigger('reports:teleportToPlayer', selectedAppeal.value.id)
}

function teleportPlayerToMe() {
  if (!selectedAppeal.value) {
    return
  }

  mpTrigger('reports:teleportPlayerToMe', selectedAppeal.value.id)
}

function needHelp() {
  if (!selectedAppeal.value) {
    return
  }

  mpTrigger('reports:needHelp', selectedAppeal.value.id)
}

onMounted(() => {
  window.addEventListener('twinkle:reports:set', handleReportsSet)
  window.addEventListener('twinkle:reports:permissions', handleReportsPermissions)

  const cached = (window as any).__TWINKLE_REPORTS__ || (window as any).__TWINKLE_PLAYER_REPORTS__

  if (cached) {
    appeals.value = normalizeAppeals(cached)
  }

  requestReports()
})

onUnmounted(() => {
  window.removeEventListener('twinkle:reports:set', handleReportsSet)
  window.removeEventListener('twinkle:reports:permissions', handleReportsPermissions)
})
</script>

<style scoped>
.appeals-list__item {
  width: 100%;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.appeals-create {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.75rem;
  background: rgb(255 255 255 / 4%);
}

.appeals-create label {
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 800;
}

.appeals-create textarea {
  width: 100%;
  min-height: 5rem;
  resize: vertical;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 0.6rem;
  padding: 0.75rem;
  color: #ffffff;
  background: rgb(0 0 0 / 34%);
  font: inherit;
}

.appeals-create button {
  justify-self: start;
}

.appeals-list__item--active {
  border-color: rgb(255 255 255 / 12%) !important;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 6%), transparent 42%),
    rgb(255 255 255 / 6%) !important;
}

.appeals-empty {
  padding: 1rem;
  color: rgb(255 255 255 / 55%);
}

.appeal-chat__actions button:disabled,
.appeal-chat__input button:disabled,
.appeal-chat__input input:disabled {
  cursor: default;
  opacity: 0.48;
}
</style>
