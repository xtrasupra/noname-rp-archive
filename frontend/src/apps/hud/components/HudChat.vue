<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Component, CSSProperties } from 'vue'
import { BadgeCheck, ShieldCheck } from 'lucide-vue-next'
import { callClientEvent } from '@/core/client-events/client-event'
import type { HudChatMessage, InterfacePayloadMap } from '@/shared/contracts/ui'
import AdminIcon from './Icons/Admin.vue'
import AwardIcon from './Icons/Award.vue'
import DepartmentIcon from './Icons/Department.vue'
import EventIcon from './Icons/Event.vue'
import FamilyIcon from './Icons/Family.vue'
import GlobalIcon from './Icons/Global.vue'
import GovermentIcon from './Icons/Goverment.vue'
import LotteryIcon from './Icons/Lottery.vue'
import LoudspeakerIcon from './Icons/Loudspeaker.vue'
import NewsIcon from './Icons/News.vue'
import PhoneIcon from './Icons/Phone.vue'
import PoliceIcon from './Icons/Police.vue'
import PunishmentIcon from './Icons/Punishment.vue'
import QuestIcon from './Icons/Quest.vue'
import RadioIcon from './Icons/Radio.vue'
import ReportIcon from './Icons/Report.vue'
import ServerIcon from './Icons/Server.vue'
import SendIcon from './Icons/Send.vue'
import TaxiIcon from './Icons/Taxi.vue'
import VipIcon from './Icons/Vip.vue'

interface ChannelBadge {
  label: string
  icon: Component
  color: string
  verified?: boolean
}

const channelBadges: Record<string, ChannelBadge> = {
  global: { label: 'Глобальный чат', icon: GlobalIcon, color: '#00C3D0' },
  admin: {
    label: 'Админ чат',
    icon: AdminIcon,
    color: '#FF5959',
    verified: true,
  },
  goverment: { label: 'Правительство', icon: GovermentIcon, color: '#27D7DF' },
  government: { label: 'Правительство', icon: GovermentIcon, color: '#27D7DF' },
  quest: { label: 'Квест', icon: QuestIcon, color: '#E000FF' },
  event: { label: 'Ивент', icon: EventIcon, color: '#40FF81' },
  family: { label: 'Семейный чат', icon: FamilyIcon, color: '#767BFF' },
  news: { label: 'Weazel News', icon: NewsIcon, color: '#FF5959' },
  report: { label: 'Репорт', icon: ReportIcon, color: '#FF5959' },
  lottery: { label: 'Лотерея', icon: LotteryIcon, color: '#E000FF' },
  award: { label: 'Достижение', icon: AwardIcon, color: '#70FF8D' },
  phone: { label: 'Телефон', icon: PhoneIcon, color: '#716CFF' },
  department: { label: 'Департамент', icon: DepartmentIcon, color: '#FF5959' },
  loudspeaker: { label: 'Мегафон', icon: LoudspeakerIcon, color: '#FFC909' },
  taxi: { label: 'Такси', icon: TaxiIcon, color: '#FFC909' },
  vip: { label: 'VIP чат', icon: VipIcon, color: '#FFC909' },
  radio: { label: 'Радио', icon: RadioIcon, color: '#FF6969' },
  punishment: { label: 'Наказание', icon: PunishmentIcon, color: '#E000FF' },
  server: { label: 'Сервер', icon: ServerIcon, color: '#E000FF' },
  police: { label: 'Полиция', icon: PoliceIcon, color: '#3CA8FF' },
}

const fallbackChannelBadge: ChannelBadge = {
  label: 'Канал',
  icon: ServerIcon,
  color: '#E000FF',
}
type Chat = NonNullable<InterfacePayloadMap['hud']['chat']>
const props = defineProps<{ chat?: Chat }>()
const messages = ref<HudChatMessage[]>([])
const input = ref('')
const active = ref(false)
const channel = ref(props.chat?.activeChannel ?? 'IC')
const inputEl = ref<HTMLInputElement | null>(null)
const messagesEl = ref<HTMLElement | null>(null)
const channelsEl = ref<HTMLElement | null>(null)
const indicator = ref({ left: '0px', width: '0px' })
let scrollAnimationFrame: number | undefined
const enabled = computed(() => props.chat?.isVisible ?? false)
const channels = computed(
  () =>
    props.chat?.channels ?? ['OOC', 'FAM', 'IC', 'DO', 'ME', 'TRY', 'FRACTION'],
)
const commandChannels: Record<string, string> = {
  do: 'DO',
  fam: 'FAM',
  fraction: 'FRACTION',
  me: 'ME',
  ooc: 'OOC',
  try: 'TRY',
}
const messageType = (message: HudChatMessage) => message.type?.toLowerCase()
const usesCleanChannelStyle = (message: HudChatMessage) =>
  ['global', 'phone', 'radio', 'server'].includes(
    message.channelType?.toLowerCase() ?? '',
  )
const messageClass = (message: HudChatMessage) => {
  const type = messageType(message)
  return type ? 'hud-chat__message--' + type : undefined
}
const getChannelBadge = (message: HudChatMessage): ChannelBadge => {
  const type = message.channelType?.toLowerCase()
  if (!type) return fallbackChannelBadge
  return (
    channelBadges[type] ?? {
      ...fallbackChannelBadge,
      label: message.channelType,
    }
  )
}
const channelStyle = (message: HudChatMessage): CSSProperties =>
  ({
    '--hud-chat-channel-color': getChannelBadge(message).color,
    '--hud-chat-channel-text-color':
      message.channelType?.toLowerCase() === 'admin' ? '#FF5959' : '#fff',
  }) as CSSProperties
const channelIconStyle = (
  message: HudChatMessage,
): CSSProperties | undefined => {
  if (!usesCleanChannelStyle(message)) return undefined

  const color = getChannelBadge(message).color
  const background =
    message.channelType?.toLowerCase() === 'global'
      ? 'radial-gradient(circle, #00c3d0 0%, #00636a 100%)'
      : `radial-gradient(circle, ${color} 0%, color-mix(in srgb, ${color} 50%, #000) 100%)`

  return { borderColor: color, background, boxShadow: 'none' }
}
const channelLabelStyle = (
  message: HudChatMessage,
): CSSProperties | undefined =>
  usesCleanChannelStyle(message) ? { boxShadow: 'none' } : undefined

function getPersistedChatHistory() {
  const globalWindow = window as Window & {
    __TWINKLE_HUD_CHAT_HISTORY__?: HudChatMessage[]
  }

  if (!Array.isArray(globalWindow.__TWINKLE_HUD_CHAT_HISTORY__)) {
    globalWindow.__TWINKLE_HUD_CHAT_HISTORY__ = []
  }

  return globalWindow.__TWINKLE_HUD_CHAT_HISTORY__
}

function persistChatHistory(list: HudChatMessage[]) {
  const globalWindow = window as Window & {
    __TWINKLE_HUD_CHAT_HISTORY__?: HudChatMessage[]
  }

  globalWindow.__TWINKLE_HUD_CHAT_HISTORY__ = list.slice(
    -(props.chat?.maxMessages ?? 80),
  )
}

function scrollToLatest() {
  const element = messagesEl.value
  if (element) element.scrollTop = element.scrollHeight
}
function keepScrolledToLatest(duration = 300) {
  if (scrollAnimationFrame) cancelAnimationFrame(scrollAnimationFrame)
  const startedAt = performance.now()
  const update = (now: number) => {
    scrollToLatest()
    if (now - startedAt < duration)
      scrollAnimationFrame = requestAnimationFrame(update)
    else scrollAnimationFrame = undefined
  }
  scrollAnimationFrame = requestAnimationFrame(update)
}
function sync() {
  if (props.chat?.messages?.length) {
    messages.value = props.chat.messages.slice(-(props.chat.maxMessages ?? 80))
    persistChatHistory(messages.value)
  }
  if (props.chat?.activeChannel) channel.value = props.chat.activeChannel
  if (props.chat?.isActive === true) void open()
  else if (props.chat?.isActive === false) {
    active.value = false
    input.value = ''
    inputEl.value?.blur()
  }
  void nextTick(scrollToLatest)
}
async function open() {
  active.value = true
  await nextTick()
  inputEl.value?.focus()
  keepScrolledToLatest()
}
function close() {
  active.value = false
  input.value = ''
  inputEl.value?.blur()
  callClientEvent('chat:closed', '{}')
}
function normalizeIncomingMessage(raw: unknown): HudChatMessage | null {
  if (!raw) return null

  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return null
    try {
      return normalizeIncomingMessage(JSON.parse(text))
    } catch {
      return { text, createdAt: Date.now() }
    }
  }

  if (typeof raw !== 'object') return null

  const message = raw as Record<string, unknown>
  const text = String(message.text ?? message.message ?? '').trim()
  if (!text) return null

  return {
    id: String(message.id ?? `msg-${Date.now()}-${Math.random()}`),
    text,
    type: message.type ? String(message.type) : undefined,
    channelType: message.channelType ? String(message.channelType) : undefined,
    isSuccessfully:
      typeof message.isSuccessfully === 'boolean'
        ? message.isSuccessfully
        : undefined,
    createdAt:
      typeof message.createdAt === 'number'
        ? message.createdAt
        : Date.now(),
    author: message.author ? String(message.author) : undefined,
    badge: message.badge ? String(message.badge) : undefined,
  }
}
function send() {
  const text = input.value.trim()
  if (!text) return close()

  input.value = ''
  void nextTick(() => {
    scrollToLatest()
    inputEl.value?.focus()
  })
  callClientEvent(
    'chat:send',
    JSON.stringify({ message: text, channel: channel.value }),
  )
}
function moveIndicator() {
  const button =
    channelsEl.value?.querySelector<HTMLButtonElement>('button.active')
  if (button)
    indicator.value = {
      left: button.offsetLeft + 'px',
      width: button.offsetWidth + 'px',
    }
}
function key(event: KeyboardEvent) {
  if (!enabled.value) return
  if (!active.value && event.key.toLowerCase() === 't') {
    event.preventDefault()
    void open()
  } else if (active.value && event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}
watch(() => props.chat, sync, { deep: true, immediate: true })
watch(channel, () => nextTick(moveIndicator))
watch(channels, () => nextTick(moveIndicator))
watch(input, (value) => {
  const command = value
    .match(/^\/(do|me|try|fraction|fam|ooc)(?=\s|$)/i)?.[1]
    ?.toLowerCase()
  const target = command ? commandChannels[command] : undefined
  if (target && channels.value.includes(target)) channel.value = target
})
onMounted(() => {
  messages.value = getPersistedChatHistory().slice(
    -(props.chat?.maxMessages ?? 80),
  )
  window.addEventListener('keydown', key)
  window.addEventListener('resize', moveIndicator)
  window.addEventListener('twinkle:chat:add', onChatAdd as EventListener)
  window.addEventListener('twinkle:chat:history', onChatHistory as EventListener)
  window.addEventListener('twinkle:chat:open', onChatOpen as EventListener)
  window.addEventListener('twinkle:chat:close', onChatClose as EventListener)
  window.addEventListener('twinkle:chat:force-close', onChatForceClose as EventListener)
  void nextTick(moveIndicator)
  ;(window as Window & { TWINKLE_HUD_CHAT?: unknown }).TWINKLE_HUD_CHAT = {
    closeInput: close,
    openInput: open,
  }
})
onUnmounted(() => {
  window.removeEventListener('keydown', key)
  window.removeEventListener('resize', moveIndicator)
  window.removeEventListener('twinkle:chat:add', onChatAdd as EventListener)
  window.removeEventListener('twinkle:chat:history', onChatHistory as EventListener)
  window.removeEventListener('twinkle:chat:open', onChatOpen as EventListener)
  window.removeEventListener('twinkle:chat:close', onChatClose as EventListener)
  window.removeEventListener('twinkle:chat:force-close', onChatForceClose as EventListener)
  if (scrollAnimationFrame) cancelAnimationFrame(scrollAnimationFrame)
  const globalWindow = window as Window & { TWINKLE_HUD_CHAT?: unknown }
  if (globalWindow.TWINKLE_HUD_CHAT) delete globalWindow.TWINKLE_HUD_CHAT
})

function onChatAdd(event: Event) {
  const detail = normalizeIncomingMessage((event as CustomEvent<unknown>).detail)
  if (!detail) return
  if (
    messages.value.some(
      (item) =>
        item.id === detail.id ||
        (item.text === detail.text &&
          item.createdAt === detail.createdAt &&
          item.author === detail.author),
    )
  ) {
    return
  }
  messages.value = [...messages.value, detail].slice(
    -(props.chat?.maxMessages ?? 80),
  )
  persistChatHistory(messages.value)
  void nextTick(scrollToLatest)
}

function onChatHistory(event: Event) {
  const detail = (event as CustomEvent<unknown>).detail
  if (!Array.isArray(detail)) return
  messages.value = detail
    .map((item) => normalizeIncomingMessage(item))
    .filter(Boolean)
    .slice(-(props.chat?.maxMessages ?? 80)) as HudChatMessage[]
  persistChatHistory(messages.value)
  void nextTick(scrollToLatest)
}

function onChatOpen() {
  void open()
}

function onChatClose() {
  close()
}

function onChatForceClose() {
  close()
}
</script>

<template>
  <section
    v-if="enabled"
    class="hud-chat"
    :class="{ 'hud-chat--active': active }"
  >
    <div ref="messagesEl" class="hud-chat__messages">
      <div
        v-for="(message, index) in messages"
        :key="message.id ?? index"
        class="hud-chat__message"
        :class="messageClass(message)"
        :style="
          messageType(message) === 'channel' ? channelStyle(message) : undefined
        "
      >
        <span
          v-if="messageType(message) === 'channel'"
          class="hud-chat__channel-badge"
        >
          <span
            class="hud-chat__channel-icon"
            :style="channelIconStyle(message)"
            ><component :is="getChannelBadge(message).icon"
          /></span>
          <span
            class="hud-chat__channel-label"
            :style="channelLabelStyle(message)"
            >{{ getChannelBadge(message).label }}</span
          >
        </span>
        <span v-else-if="message.badge" class="hud-chat__badge">
          <ShieldCheck />{{ message.badge }}
        </span>

        <template v-if="messageType(message) === 'channel'">
          <BadgeCheck
            v-if="getChannelBadge(message).verified"
            class="hud-chat__channel-verified"
          />
          <b v-if="message.author" class="hud-chat__author"
            >{{ message.author }}:</b
          >
          <span class="hud-chat__text">{{ message.text }}</span>
        </template>

        <template v-else-if="messageType(message) === 'do'">
          <span class="hud-chat__text">{{ message.text }}</span>
          <b v-if="message.author" class="hud-chat__author">{{
            message.author
          }}</b>
        </template>

        <template v-else>
          <b v-if="message.author" class="hud-chat__author"
            >{{ message.author }}:</b
          >
          <span v-if="messageType(message) === 'ooc'" class="hud-chat__text"
            >(( {{ message.text }} ))</span
          >
          <span v-else class="hud-chat__text">{{ message.text }}</span>
          <span
            v-if="messageType(message) === 'try'"
            class="hud-chat__try-result"
            :class="
              message.isSuccessfully
                ? 'hud-chat__try-result--success'
                : 'hud-chat__try-result--failure'
            "
            >| {{ message.isSuccessfully ? 'Удачно' : 'Неудачно' }}</span
          >
        </template>
      </div>
    </div>
    <Transition name="hud-chat-controls">
      <div v-if="active" class="hud-chat__controls">
        <form class="hud-chat__form" @submit.prevent="send">
          <input
            ref="inputEl"
            v-model="input"
            placeholder="Привет как дела?"
          /><button>
            <SendIcon />
          </button>
        </form>
        <nav ref="channelsEl" class="hud-chat__channels">
          <button
            v-for="item in channels"
            :key="item"
            :class="{ active: item === channel }"
            type="button"
            @click="channel = item"
          >
            {{ item }}</button
          ><span class="hud-chat__channel-indicator" :style="indicator"></span>
        </nav>
      </div>
    </Transition>
  </section>
</template>

<style lang="scss" scoped>
.hud-chat,
.hud-chat *,
.hud-chat *::before,
.hud-chat *::after {
  box-sizing: border-box;
}

.hud-chat {
  position: relative;
  width: 100%;
  height: px-to-vh(400);
  color: #fff;
  font-size: px-to-vh(14);
  pointer-events: auto;
  text-shadow: 0 px-to-vh(1.5) px-to-vh(3.6) rgba(0, 0, 0, 0.6);
}

.hud-chat__messages {
  display: flex;
  flex-direction: column;
  max-height: px-to-vh(400);
  padding-left: px-to-vh(4);
  justify-content: flex-start;
  gap: px-to-vh(15);
  overflow-y: scroll;
  scrollbar-width: 0;
  transition: max-height 260ms cubic-bezier(0.22, 1, 0.36, 1);

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
}

.hud-chat--active .hud-chat__messages {
  max-height: px-to-vh(302);
}

.hud-chat__message {
  min-width: 0;
  line-height: px-to-vh(17);
  overflow-wrap: anywhere;
}

.hud-chat__message b {
  margin-right: px-to-vh(5);
  font-weight: 500;
}

.hud-chat__message--me,
.hud-chat__message--ooc,
.hud-chat__message--try,
.hud-chat__message--do {
  color: #e5b1ff;
}

.hud-chat__message--do .hud-chat__text {
  margin-right: px-to-vh(5);
}

.hud-chat__try-result {
  margin-left: px-to-vh(5);
  font-weight: 500;
}

.hud-chat__try-result--success {
  color: #40ff81;
}

.hud-chat__try-result--failure {
  color: #ff5959;
}

.hud-chat__message--channel {
  color: var(--hud-chat-channel-text-color, #fff);
  line-height: px-to-vh(20);
}

.hud-chat__channel-badge {
  display: inline-flex;
  height: px-to-vh(25);
  margin-right: px-to-vh(7);
  vertical-align: middle;
  align-items: stretch;
  gap: px-to-vh(5);
  white-space: nowrap;
}

.hud-chat__channel-icon,
.hud-chat__channel-label {
  border-radius: px-to-vh(3);
  box-shadow: 0 0 px-to-vh(4) #ff0000;
}

.hud-chat__channel-icon {
  display: inline-grid;
  width: px-to-vh(25);
  flex: none;
  color: #fff;
  place-items: center;
  border: px-to-vh(0.1) solid
    color-mix(in srgb, var(--hud-chat-channel-color) 30%, transparent);
  box-shadow: 0 0 px-to-vh(4) #ff0000;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--hud-chat-channel-color) 72%, #262626),
    color-mix(in srgb, var(--hud-chat-channel-color) 24%, #181818)
  );
}

.hud-chat__channel-icon svg {
  width: px-to-vh(15);
  height: px-to-vh(15);
  color: #fff !important;
}

.hud-chat__channel-label {
  display: inline-flex;
  align-items: center;
  padding: 0 px-to-vh(10);
  border: px-to-vh(0.1) solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 0 px-to-vh(4) #ff0000;
  background: linear-gradient(
    180deg,
    rgba(56, 56, 56, 0.92),
    rgba(28, 28, 28, 0.92)
  );
  color: #fff;
  font-weight: 500;
  text-shadow: 0 px-to-vh(1) px-to-vh(2) rgba(0, 0, 0, 0.75);
}

.hud-chat__channel-verified {
  width: px-to-vh(16);
  height: px-to-vh(16);
  margin-right: px-to-vh(6);
  vertical-align: px-to-vh(-3);
  color: var(--hud-chat-channel-color) !important;
  fill: var(--hud-chat-channel-color);
  stroke: #161616;
  stroke-width: 2.5;
}

.hud-chat__message--channel .hud-chat__author {
  color: inherit;
}
.hud-chat__badge {
  display: inline-flex;
  min-height: px-to-vh(25);
  margin-right: px-to-vh(5);
  vertical-align: middle;
  align-items: center;
  gap: px-to-vh(5);
  padding: 0 px-to-vh(10);
  border-radius: px-to-vh(3);
  background: rgba(22, 22, 22, 0.45);
  white-space: nowrap;
}

.hud-chat__badge svg {
  width: px-to-vh(13);
  aspect-ratio: 1;
  flex: none;
}

.hud-chat__controls {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  max-height: px-to-vh(93);
  overflow: hidden;
  transform-origin: top center;
}

.hud-chat-controls-enter-active,
.hud-chat-controls-leave-active {
  transition:
    max-height 260ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 180ms ease;
}

.hud-chat-controls-enter-from,
.hud-chat-controls-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(px-to-vh(-8)) scaleY(0.94);
}

.hud-chat-controls-enter-to,
.hud-chat-controls-leave-from {
  max-height: px-to-vh(93);
  opacity: 1;
  transform: translateY(0) scaleY(1);
}

.hud-chat__form {
  display: grid;
  height: px-to-vh(40);
  grid-template-columns: minmax(0, 1fr) auto;
  padding: px-to-vh(5) px-to-vh(14);
  margin-top: px-to-vh(15);
  overflow: hidden;
  border: px-to-vh(0.3) solid rgba(255, 255, 255, 0.25);
  border-radius: px-to-vh(3);
  background: rgba(22, 22, 22, 0.15);
}

.hud-chat__form input,
.hud-chat__form button {
  min-width: 0;
  border: 0;
  background: transparent;
  color: #fff;
}

.hud-chat__form input {
  padding: 0;
  outline: none;
  font: 400 px-to-vh(14) 'SF Pro';
}

.hud-chat__form button {
  display: grid;
  width: px-to-vh(28);
  height: px-to-vh(28);
  place-items: center;
  cursor: pointer;
  border: px-to-vh(0.1) solid rgba(255, 255, 255, 0.5);
  border-radius: px-to-vh(3);
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.35) 0%,
    rgba(153, 153, 153, 0.35) 100%
  );
}

.hud-chat__form svg {
  width: px-to-vh(10);
  height: px-to-vh(9);
}

.hud-chat__channels {
  position: relative;
  display: flex;
  min-height: px-to-vh(43);
  align-items: flex-end;
  justify-content: space-between;
  gap: px-to-vh(8);
  border-bottom: px-to-vh(1) solid rgba(255, 255, 255, 0.25);
}

.hud-chat__channels button {
  min-width: 0;
  min-height: px-to-vh(28);
  padding: 0;
  overflow: hidden;
  border: 0;
  background: none;
  color: rgba(255, 255, 255, 0.45);
  font: 400 px-to-vh(12) 'SF Pro';
  text-overflow: ellipsis;
}

.hud-chat__channels button.active {
  color: #e000ff;
}

.hud-chat__channel-indicator {
  position: absolute;
  bottom: px-to-vh(-1);
  height: px-to-vh(1);
  border-radius: px-to-vh(1);
  background: #e000ff;
  box-shadow: 0 0 px-to-vh(5) rgba(224, 0, 255, 0.45);
  transition:
    left 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
</style>
