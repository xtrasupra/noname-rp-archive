<template>
  <section class="settings-page">
    <header class="settings-page__header">
      <div>
        <h1 class="f2-menu__title">Настройки</h1>
        <p>Управление интерфейсом, звуком, чатом и игровым поведением.</p>
      </div>

      <div class="settings-page__status">
        <span :class="{ 'settings-page__status-dot--changed': hasChanges }"></span>
        {{ hasChanges ? 'Есть изменения' : 'Сохранено' }}
      </div>
    </header>

    <div class="settings-page__layout">
      <nav class="settings-menu" aria-label="Разделы настроек">
        <button
          v-for="(item, index) in settingsNavigation"
          :key="item.id"
          class="settings-menu__item"
          :class="{ 'settings-menu__item--active': activeSection === item.id }"
          type="button"
          @click="activeSection = item.id"
        >
          <span class="settings-menu__icon" aria-hidden="true">
            <BaseIcon :icon="item.icon" size="sm" :stroke-width="2.25" />
          </span>
          <span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.description }}</small>
          </span>
          <i v-if="index === recommendedIndex">Рек.</i>
        </button>
      </nav>

      <div class="settings-panel">
        <header class="settings-panel__header">
          <div>
            <span>{{ activeNavigationItem.kicker }}</span>
            <h2>{{ activeNavigationItem.label }}</h2>
          </div>
          <p>{{ activeNavigationItem.fullDescription }}</p>
        </header>

        <div v-if="activeSection === 'interface'" class="settings-panel__content">
          <section class="settings-recommendations">
            <button
              v-for="preset in presets"
              :key="preset.id"
              class="settings-preset"
              type="button"
              @click="applyPreset(preset.id)"
            >
              <span>{{ preset.label }}</span>
              <small>{{ preset.description }}</small>
            </button>
          </section>

          <section class="settings-crosshair">
            <div class="settings-crosshair__preview" aria-label="Предпросмотр прицела">
              <span
                class="settings-crosshair__target"
                :class="[
                  `settings-crosshair__target--${crosshair.type}`,
                  {
                    'settings-crosshair__target--center-dot': crosshair.centerDot !== 'no',
                    'settings-crosshair__target--outlined': crosshair.outline !== 'no',
                  },
                ]"
                :style="crosshairStyle"
              ></span>
            </div>

            <div class="settings-control-grid">
              <SettingSelect
                v-model="crosshair.type"
                label="Вид прицела"
                :options="crosshairTypeOptions"
              />
              <SettingColor v-model="crosshair.color" label="Цвет прицела" />
              <SettingSelect
                v-model="crosshair.centerDot"
                label="Точка в центре"
                :options="ternaryOptions"
              />
              <SettingColor v-model="crosshair.hoverColor" label="Цвет при наведении" />
              <SettingSelect
                v-model="crosshair.outline"
                label="Контур"
                :options="ternaryOptions"
              />
              <SettingText
                v-model="crosshair.code"
                label="Код прицела"
                placeholder="XXX-XXX-XXX"
                @input="formatCrosshairCode"
              />
              <SettingSlider v-model="crosshair.length" label="Длина" />
              <SettingSlider v-model="crosshair.width" label="Ширина" />
              <SettingSlider v-model="crosshair.outlineThickness" label="Толщина контура" />
            </div>
          </section>

          <section class="settings-card">
            <SettingToggle v-model="settings.interface.showHints" label="Подсказки взаимодействий" description="Показывать короткие подсказки рядом с игровыми действиями." />
            <SettingToggle v-model="settings.interface.compactHud" label="Компактный HUD" description="Уменьшенный режим интерфейса для чистого экрана." />
            <SettingSlider v-model="settings.interface.hudOpacity" label="Прозрачность HUD" />
          </section>
        </div>

        <div v-else-if="activeSection === 'audio'" class="settings-panel__content settings-panel__content--cards">
          <section class="settings-card">
            <SettingSlider v-model="settings.audio.master" label="Общая громкость" />
            <SettingSlider v-model="settings.audio.voice" label="Голосовой чат" />
            <SettingSlider v-model="settings.audio.interface" label="Звуки интерфейса" />
            <SettingSlider v-model="settings.audio.radio" label="Радио" />
          </section>
          <section class="settings-card">
            <SettingToggle v-model="settings.audio.muteInBackground" label="Отключать звук в фоне" description="Когда окно игры неактивно." />
            <SettingToggle v-model="settings.audio.notifications" label="Звуки уведомлений" description="Короткие сигналы F2, магазина и обращений." />
          </section>
        </div>

        <div v-else-if="activeSection === 'chat'" class="settings-panel__content settings-panel__content--cards">
          <section class="settings-card">
            <SettingSlider v-model="settings.chat.fontSize" label="Размер текста" />
            <SettingSlider v-model="settings.chat.opacity" label="Прозрачность фона" />
            <SettingToggle v-model="settings.chat.timestamps" label="Время сообщений" description="Показывать время у каждой строки чата." />
            <SettingToggle v-model="settings.chat.tradeFilter" label="Фильтр торговли" description="Скрывать частые торговые объявления." />
          </section>
          <section class="settings-chat-preview">
            <span>[20:42] Helper NoName: Добро пожаловать на сервер.</span>
            <span>[20:43] Вы получили новое уведомление.</span>
            <span>[20:44] Игрок рядом начал взаимодействие.</span>
          </section>
        </div>

        <div v-else-if="activeSection === 'controls'" class="settings-panel__content">
          <div class="settings-bind-list">
            <article v-for="bind in keyBinds" :key="bind.action" class="settings-bind">
              <div>
                <span>{{ bind.category }}</span>
                <strong>{{ bind.action }}</strong>
              </div>
              <button
                type="button"
                :class="{ 'settings-bind__key--listening': listeningBindId === bind.id }"
                @click="startKeyBinding(bind.id)"
              >
                {{ listeningBindId === bind.id ? 'Нажмите клавишу' : bind.key }}
              </button>
            </article>
          </div>
        </div>

        <div v-else-if="activeSection === 'security'" class="settings-panel__content settings-panel__content--cards">
          <section class="settings-card">
            <SettingToggle v-model="settings.security.tradeConfirm" label="Подтверждать передачу ценностей" description="Дополнительный шаг для дорогих предметов и валюты." />
            <SettingToggle v-model="settings.security.shopConfirm" label="Защита быстрых покупок" description="Подтверждение перед покупками за Coins." />
            <SettingToggle v-model="settings.security.hideBalance" label="Скрывать баланс в стриме" description="Полезно для записи и трансляций." />
          </section>
          <section class="settings-security-card">
            <strong>Последний вход</strong>
            <span>Сегодня, 20:18</span>
            <small>Москва · Windows</small>
          </section>
        </div>

        <div v-else class="settings-panel__content settings-panel__content--cards">
          <section class="settings-card">
            <SettingToggle v-model="settings.gameplay.autoBelt" label="Автопристегивание" description="Автоматически пристегивать ремень при посадке в транспорт." />
            <SettingToggle v-model="settings.gameplay.closeDoors" label="Автозакрытие дверей" description="Закрывать двери транспорта после выхода." />
            <SettingToggle v-model="settings.gameplay.quickActions" label="Быстрые действия" description="Показывать избранные действия рядом с персонажем." />
          </section>
        </div>

        <footer class="settings-actions">
          <button class="settings-actions__ghost" type="button" @click="resetSettings">Сбросить</button>
          <button class="settings-actions__primary" type="button" @click="saveSettings">Применить</button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, onMounted, reactive, ref, watch, type Component, type PropType } from 'vue'

import {
  BaseIcon,
  Crosshair,
  Gamepad2,
  Keyboard,
  MessageSquareText,
  ShieldCheck,
  Volume2,
} from '@/shared/icons'

type SettingsSection = 'interface' | 'audio' | 'chat' | 'controls' | 'security' | 'gameplay'
type CrosshairType = 'cross' | 'dot' | 'rectangle'
type TernaryOption = 'yes' | 'no' | 'default'
type SelectOption<T extends string = string> = {
  label: string
  value: T
}

const SettingSlider = defineComponent({
  props: {
    label: { required: true, type: String },
    modelValue: { required: true, type: Number },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('label', { class: 'setting-control setting-control--slider' }, [
      h('span', props.label),
      h('input', {
        max: 1,
        min: 0,
        step: 0.01,
        type: 'range',
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', Number((event.target as HTMLInputElement).value)),
      }),
      h('b', formatRatio(props.modelValue)),
    ])
  },
})

const SettingToggle = defineComponent({
  props: {
    description: { default: '', type: String },
    label: { required: true, type: String },
    modelValue: { required: true, type: Boolean },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('button', {
      class: ['setting-toggle', { 'setting-toggle--active': props.modelValue }],
      type: 'button',
      onClick: () => emit('update:modelValue', !props.modelValue),
    }, [
      h('span', [h('strong', props.label), props.description ? h('small', props.description) : null]),
      h('i'),
    ])
  },
})

const SettingSelect = defineComponent({
  props: {
    label: { required: true, type: String },
    modelValue: { required: true, type: String },
    options: { required: true, type: Array as PropType<SelectOption[]> },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const isOpen = ref(false)
    const selectRef = ref<HTMLElement | null>(null)

    const selectedLabel = computed(() => {
      return props.options.find((option) => option.value === props.modelValue)?.label ?? props.options[0]?.label ?? ''
    })

    function closeSelect(event: MouseEvent) {
      if (!selectRef.value?.contains(event.target as Node)) {
        isOpen.value = false
      }
    }

    onMounted(() => {
      document.addEventListener('click', closeSelect)
    })

    onBeforeUnmount(() => {
      document.removeEventListener('click', closeSelect)
    })

    return () => h('div', { ref: selectRef, class: 'setting-select' }, [
      h('button', {
        class: ['setting-select__trigger', { 'setting-select__trigger--open': isOpen.value }],
        type: 'button',
        onClick: (event: MouseEvent) => {
          event.stopPropagation()
          isOpen.value = !isOpen.value
        },
      }, [
        h('span', props.label),
        h('strong', selectedLabel.value),
      ]),
      isOpen.value
        ? h('div', { class: 'setting-select__menu' }, props.options.map((option) => h('button', {
          class: ['setting-select__option', { 'setting-select__option--active': option.value === props.modelValue }],
          key: option.value,
          type: 'button',
          onClick: () => {
            emit('update:modelValue', option.value)
            isOpen.value = false
          },
        }, option.label)))
        : null,
    ])
  },
})

const SettingColor = defineComponent({
  props: {
    label: { required: true, type: String },
    modelValue: { required: true, type: String },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('label', { class: 'setting-control' }, [
      h('span', props.label),
      h('input', {
        class: 'setting-control__color',
        type: 'color',
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      }),
    ])
  },
})

const SettingText = defineComponent({
  props: {
    label: { required: true, type: String },
    modelValue: { required: true, type: String },
    placeholder: { default: '', type: String },
  },
  emits: ['update:modelValue', 'input'],
  setup(props, { emit }) {
    return () => h('label', { class: 'setting-control' }, [
      h('span', props.label),
      h('input', {
        class: 'setting-control__text',
        maxlength: 11,
        placeholder: props.placeholder,
        type: 'text',
        value: props.modelValue,
        onInput: (event: Event) => {
          emit('update:modelValue', (event.target as HTMLInputElement).value)
          emit('input', event)
        },
      }),
    ])
  },
})

const settingsNavigation: Array<{
  description: string
  fullDescription: string
  icon: Component
  id: SettingsSection
  kicker: string
  label: string
}> = [
  { description: 'HUD и прицел', fullDescription: 'Настройка видимости интерфейса, прицела и подсказок.', icon: Crosshair, id: 'interface', kicker: 'Основное', label: 'Интерфейс' },
  { description: 'Громкость и voice', fullDescription: 'Баланс звука игры, уведомлений, радио и голосового чата.', icon: Volume2, id: 'audio', kicker: 'Комфорт', label: 'Звук' },
  { description: 'Каналы и вид', fullDescription: 'Фильтры, размер текста и визуальная читаемость игрового чата.', icon: MessageSquareText, id: 'chat', kicker: 'Коммуникация', label: 'Чат' },
  { description: 'Бинды действий', fullDescription: 'Назначение клавиш для транспорта, персонажа, F2 и быстрых действий.', icon: Keyboard, id: 'controls', kicker: 'Управление', label: 'Клавиши' },
  { description: 'Защита профиля', fullDescription: 'Приватность, подтверждения и защита ценных действий.', icon: ShieldCheck, id: 'security', kicker: 'Профиль', label: 'Безопасность' },
  { description: 'RP поведение', fullDescription: 'Игровые автоматизации, подсказки и быстрые сценарии.', icon: Gamepad2, id: 'gameplay', kicker: 'Игра', label: 'Игровое' },
]

const recommendedIndex = 0
const activeSection = ref<SettingsSection>('interface')
const hasChanges = ref(false)

const crosshair = reactive({
  centerDot: 'yes' as TernaryOption,
  code: '',
  color: '#d454f4',
  hoverColor: '#d454f4',
  length: 0.42,
  outline: 'yes' as TernaryOption,
  outlineThickness: 0.18,
  type: 'cross' as CrosshairType,
  width: 0.24,
})

const settings = reactive({
  audio: {
    interface: 0.58,
    master: 0.82,
    muteInBackground: true,
    notifications: true,
    radio: 0.36,
    voice: 0.74,
  },
  chat: {
    fontSize: 0.52,
    opacity: 0.62,
    timestamps: true,
    tradeFilter: false,
  },
  gameplay: {
    autoBelt: true,
    closeDoors: false,
    quickActions: true,
  },
  interface: {
    compactHud: false,
    hudOpacity: 0.72,
    showHints: true,
  },
  security: {
    hideBalance: false,
    shopConfirm: true,
    tradeConfirm: true,
  },
})

const presets = [
  { description: 'Меньше визуального шума в HUD.', id: 'minimal', label: 'Минималистичный HUD' },
  { description: 'Скрывает чувствительные элементы.', id: 'stream', label: 'Для стрима' },
  { description: 'Ярче прицел и компактнее подсказки.', id: 'pvp', label: 'Для PvP' },
]

const crosshairTypeOptions: SelectOption<CrosshairType>[] = [
  { label: 'Крестик', value: 'cross' },
  { label: 'Точка', value: 'dot' },
  { label: 'Прямоугольник', value: 'rectangle' },
]

const ternaryOptions: SelectOption<TernaryOption>[] = [
  { label: 'Да', value: 'yes' },
  { label: 'Нет', value: 'no' },
  { label: 'По умолчанию', value: 'default' },
]

const keyBinds = reactive([
  { action: 'Открыть F2 меню', category: 'Интерфейс', id: 'f2-menu', key: 'F2' },
  { action: 'Круговое меню', category: 'Анимации', id: 'radial-menu', key: 'B' },
  { action: 'Голосовой чат', category: 'Чат', id: 'voice-chat', key: 'N' },
  { action: 'Ремень безопасности', category: 'Транспорт', id: 'seatbelt', key: 'K' },
  { action: 'Инвентарь', category: 'Персонаж', id: 'inventory', key: 'I' },
])

const listeningBindId = ref<string | null>(null)

const activeNavigationItem = computed(() => {
  return settingsNavigation.find((item) => item.id === activeSection.value) ?? settingsNavigation[0]
})

const crosshairStyle = computed(() => ({
  '--crosshair-color': crosshair.color,
  '--crosshair-hover-color': crosshair.hoverColor,
  '--crosshair-length': `${1.35 + crosshair.length * 3.2}vh`,
  '--crosshair-outline-width': `${crosshair.outlineThickness * 0.55}vh`,
  '--crosshair-width': `${0.32 + crosshair.width * 1.25}vh`,
}))

watch(settings, () => {
  hasChanges.value = true
}, { deep: true })

watch(crosshair, () => {
  hasChanges.value = true
}, { deep: true })

function applyPreset(presetId: string) {
  if (presetId === 'minimal') {
    settings.interface.compactHud = true
    settings.interface.showHints = false
    settings.interface.hudOpacity = 0.54
  }

  if (presetId === 'stream') {
    settings.security.hideBalance = true
    settings.chat.tradeFilter = true
    settings.audio.notifications = false
  }

  if (presetId === 'pvp') {
    crosshair.color = '#d454f4'
    crosshair.hoverColor = '#d454f4'
    crosshair.length = 0.34
    settings.interface.compactHud = true
  }
}

function saveSettings() {
  hasChanges.value = false
}

function resetSettings() {
  crosshair.centerDot = 'yes'
  crosshair.code = ''
  crosshair.color = '#d454f4'
  crosshair.hoverColor = '#d454f4'
  crosshair.length = 0.42
  crosshair.outline = 'yes'
  crosshair.outlineThickness = 0.18
  crosshair.type = 'cross'
  crosshair.width = 0.24
  hasChanges.value = false
}

function startKeyBinding(bindId: string) {
  window.removeEventListener('keydown', handleKeyBinding)
  listeningBindId.value = bindId
  window.addEventListener('keydown', handleKeyBinding, { once: true })
}

function handleKeyBinding(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()

  if (!listeningBindId.value) {
    return
  }

  const bind = keyBinds.find((item) => item.id === listeningBindId.value)

  if (bind) {
    bind.key = formatKeyboardKey(event)
    hasChanges.value = true
  }

  listeningBindId.value = null
}

function formatKeyboardKey(event: KeyboardEvent) {
  const specialKeys: Record<string, string> = {
    ' ': 'Space',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    Control: 'Ctrl',
    Escape: 'Esc',
  }

  const key = specialKeys[event.key] ?? event.key

  if (key.length === 1) {
    return key.toUpperCase()
  }

  return key
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyBinding)
})

function formatRatio(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatCrosshairCode(event: Event) {
  const input = event.target as HTMLInputElement
  crosshair.code = input.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 9)
    .replace(/(.{3})(?=.)/g, '$1-')
}
</script>

<style scoped>
.settings-page {
  position: relative;
  min-height: 80vh;
  isolation: isolate;
}

.settings-page__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2vh;
}

.settings-page__header p {
  margin: 0.8vh 0 0;
  color: rgb(255 255 255 / 54%);
  font-size: 1.28vh;
  font-weight: 600;
}

.settings-page__status {
  min-height: 3.3vh;
  display: inline-flex;
  align-items: center;
  gap: 0.7vh;
  padding: 0 1.15vh;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 0.75vh;
  background: rgb(0 0 0 / 56%);
  color: rgb(255 255 255 / 72%);
  font-size: 1.05vh;
  font-weight: 700;
}

.settings-page__status span {
  width: 0.62vh;
  height: 0.62vh;
  border-radius: 50%;
  background: #d454f4;
  box-shadow: 0 0 1.2vh #d454f44d;
}

.settings-page__status-dot--changed {
  background: #d454f4 !important;
  box-shadow: 0 0 1.4vh #d454f475;
}

.settings-page__layout {
  display: grid;
  grid-template-columns: 34vh minmax(0, 1fr);
  gap: 2.2vh;
  margin-top: 2.1vh;
}

.settings-menu {
  display: grid;
  align-content: start;
  gap: 0.72vh;
}

.settings-menu__item {
  min-height: 5.9vh;
  display: grid;
  grid-template-columns: 3.1vh minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.9vh;
  padding: 0.95vh 1vh;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 0.75vh;
  background: rgb(6 6 8 / 78%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

.settings-menu__item:hover,
.settings-menu__item--active {
  border-color: #d454f459;
  background: #d454f426;
}

.settings-menu__icon {
  width: 3.1vh;
  height: 3.1vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.62vh;
  background: rgb(255 255 255 / 6%);
  color: rgb(255 255 255 / 86%);
}

.settings-menu__item span:last-of-type {
  min-width: 0;
  display: grid;
  gap: 0.35vh;
}

.settings-menu__item strong {
  font-size: 1.2vh;
  font-weight: 800;
  line-height: 1;
}

.settings-menu__item small {
  color: rgb(255 255 255 / 44%);
  font-size: 0.96vh;
  font-weight: 700;
  line-height: 1.1;
}

.settings-menu__item i {
  padding: 0.38vh 0.55vh;
  border-radius: 999px;
  background: #d454f4;
  color: #ffffff;
  font-size: 0.82vh;
  font-style: normal;
  font-weight: 900;
}

.settings-panel {
  min-height: 70vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 1vh;
  background: rgb(6 6 8 / 80%);
  box-shadow: 0 2vh 4vh rgb(0 0 0 / 30%);
  overflow: hidden;
}

.settings-panel__header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 3vh;
  padding: 2vh 2.2vh 1.55vh;
  border-bottom: 1px solid rgb(255 255 255 / 4%);
}

.settings-panel__header span {
  color: #d454f4;
  font-size: 0.92vh;
  font-weight: 900;
  text-transform: uppercase;
}

.settings-panel__header h2 {
  margin: 0.35vh 0 0;
  font-size: 2.35vh;
  line-height: 1;
}

.settings-panel__header p {
  max-width: 44vh;
  margin: 0;
  color: rgb(255 255 255 / 52%);
  font-size: 1.12vh;
  font-weight: 600;
  line-height: 1.35;
  text-align: right;
}

.settings-panel__content {
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 1.25vh;
  padding: 1.55vh 2.2vh;
}

.settings-panel__content--cards {
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr);
}

.settings-recommendations {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85vh;
}

.settings-preset,
.settings-card,
.settings-crosshair,
.settings-chat-preview,
.settings-security-card {
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 0.85vh;
  background: rgb(0 0 0 / 42%);
}

.settings-preset {
  min-height: 6.4vh;
  display: grid;
  align-content: center;
  gap: 0.45vh;
  padding: 0 1.15vh;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.settings-preset:hover {
  border-color: #d454f459;
  background: #d454f4;
}

.settings-preset span {
  font-size: 1.18vh;
  font-weight: 850;
}

.settings-preset small {
  color: rgb(255 255 255 / 48%);
  font-size: 0.98vh;
  font-weight: 700;
  line-height: 1.2;
}

.settings-crosshair {
  padding: 1.25vh;
}

.settings-crosshair__preview {
  position: relative;
  height: 24vh;
  border-radius: 0.65vh;
  overflow: hidden;
  background: url("/crosshair-bg.png") center / cover no-repeat;
}

.settings-crosshair__target {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: var(--crosshair-length);
  height: var(--crosshair-length);
  color: var(--crosshair-color);
  transform: translate(-50%, -50%);
}

.settings-crosshair__target::before,
.settings-crosshair__target::after {
  position: absolute;
  left: 50%;
  top: 50%;
  background: currentColor;
  content: "";
  transform: translate(-50%, -50%);
}

.settings-crosshair__preview:hover .settings-crosshair__target {
  color: var(--crosshair-hover-color);
}

.settings-crosshair__target--cross::before {
  width: 100%;
  height: var(--crosshair-width);
  border-radius: 999px;
}

.settings-crosshair__target--cross::after {
  width: var(--crosshair-width);
  height: 100%;
  border-radius: 999px;
}

.settings-crosshair__target--dot {
  width: calc(1.05vh + var(--crosshair-width));
  height: calc(1.05vh + var(--crosshair-width));
}

.settings-crosshair__target--dot::before {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.settings-crosshair__target--dot::after,
.settings-crosshair__target--rectangle::after {
  content: none;
}

.settings-crosshair__target--rectangle {
  width: calc(2.3vh + var(--crosshair-length));
  height: calc(1.15vh + var(--crosshair-width));
}

.settings-crosshair__target--rectangle::before {
  width: 100%;
  height: 100%;
  border-radius: 0.55vh;
}

.settings-crosshair__target--outlined::before,
.settings-crosshair__target--outlined::after {
  box-shadow: 0 0 0 var(--crosshair-outline-width) rgb(0 0 0 / 78%);
}

.settings-crosshair__target--center-dot {
  background: radial-gradient(circle, currentColor 0 0.32vh, transparent 0.34vh);
}

.settings-control-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75vh;
  margin-top: 1vh;
}

.settings-card {
  display: grid;
  gap: 0.7vh;
  padding: 1vh;
}

:deep(.setting-control) {
  min-height: 4.6vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1vh;
  padding: 0 1vh;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 0.65vh;
  background: rgb(255 255 255 / 4%);
}

:deep(.setting-control span) {
  color: rgb(255 255 255 / 78%);
  font-size: 1.08vh;
  font-weight: 750;
}

:deep(.setting-control__text) {
  width: 12.8vh;
  min-height: 2.65vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.45vh;
  outline: 0;
  background: rgb(0 0 0 / 36%);
  color: #ffffff;
  font: inherit;
  font-size: 1vh;
  font-weight: 700;
}

:deep(.setting-control__text) {
  padding: 0 0.8vh;
}

:deep(.setting-control--slider) {
  grid-template-columns: 12vh minmax(0, 1fr) 4vh;
}

:deep(.setting-select) {
  position: relative;
  min-height: 4.6vh;
  min-width: 0;
}

:deep(.setting-select__trigger) {
  width: 100%;
  min-height: 4.6vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1vh;
  padding: 0 1vh;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 0.65vh;
  background: rgb(255 255 255 / 4%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color 140ms ease, background 140ms ease;
}

:deep(.setting-select__trigger:hover),
:deep(.setting-select__trigger--open) {
  border-color: #d454f459;
  background: #d454f4;
}

:deep(.setting-select__trigger span) {
  min-width: 0;
  color: rgb(255 255 255 / 78%);
  font-size: 1.08vh;
  font-weight: 750;
}

:deep(.setting-select__trigger strong) {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.65vh;
  color: #ffffff;
  font-size: 1vh;
  font-weight: 850;
  line-height: 1;
  white-space: nowrap;
}

:deep(.setting-select__trigger strong::after) {
  width: 0.55vh;
  height: 0.55vh;
  border-right: 0.16vh solid currentColor;
  border-bottom: 0.16vh solid currentColor;
  content: "";
  transform: translateY(-0.12vh) rotate(45deg);
  transition: transform 140ms ease;
}

:deep(.setting-select__trigger--open strong::after) {
  transform: translateY(0.15vh) rotate(225deg);
}

:deep(.setting-select__menu) {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.45vh);
  right: 0;
  width: 100%;
  display: grid;
  gap: 0.35vh;
  padding: 0.5vh;
  border: 1px solid #d454f459;
  border-radius: 0.72vh;
  background: rgb(8 8 10 / 99%);
  box-shadow: 0 1.2vh 2.4vh rgb(0 0 0 / 42%);
}

:deep(.setting-select__option) {
  min-height: 3.35vh;
  display: flex;
  align-items: center;
  padding: 0 0.85vh;
  border: 1px solid transparent;
  border-radius: 0.52vh;
  background: transparent;
  color: rgb(255 255 255 / 72%);
  cursor: pointer;
  font: inherit;
  font-size: 1.02vh;
  font-weight: 800;
  text-align: left;
}

:deep(.setting-select__option:hover),
:deep(.setting-select__option--active) {
  border-color: #d454f459;
  background: #d454f4;
  color: #ffffff;
}

:deep(.setting-control input[type="range"]) {
  width: 100%;
  height: 0.62vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 18%);
  accent-color: #d454f4;
  appearance: none;
}

:deep(.setting-control input[type="range"]::-webkit-slider-thumb) {
  width: 1.45vh;
  height: 1.45vh;
  border: 0;
  border-radius: 50%;
  background: #d454f4;
  appearance: none;
}

:deep(.setting-control b) {
  color: #ffffff;
  font-size: 1.08vh;
  font-weight: 850;
  text-align: right;
}

:deep(.setting-control__color) {
  width: 3.4vh;
  height: 2.25vh;
  padding: 0;
  border: 0;
  border-radius: 0.45vh;
  background: transparent;
  cursor: pointer;
}

:deep(.setting-toggle) {
  min-height: 5.2vh;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2vh;
  padding: 0.85vh 1vh;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 0.65vh;
  background: rgb(255 255 255 / 4%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

:deep(.setting-toggle strong) {
  display: block;
  font-size: 1.14vh;
  font-weight: 850;
}

:deep(.setting-toggle small) {
  display: block;
  margin-top: 0.35vh;
  color: rgb(255 255 255 / 48%);
  font-size: 0.96vh;
  font-weight: 650;
  line-height: 1.2;
}

:deep(.setting-toggle i) {
  width: 3.5vh;
  height: 1.85vh;
  position: relative;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgb(255 255 255 / 14%);
}

:deep(.setting-toggle i::before) {
  position: absolute;
  left: 0.28vh;
  top: 0.25vh;
  width: 1.35vh;
  height: 1.35vh;
  border-radius: 50%;
  background: rgb(255 255 255 / 72%);
  content: "";
  transition: transform 140ms ease, background 140ms ease;
}

:deep(.setting-toggle--active) {
  border-color: #d454f459;
}

:deep(.setting-toggle--active i) {
  background: #d454f4;
}

:deep(.setting-toggle--active i::before) {
  background: #ffffff;
  transform: translateX(1.58vh);
}

.settings-chat-preview,
.settings-security-card {
  display: grid;
  align-content: start;
  gap: 1vh;
  padding: 1.35vh;
}

.settings-chat-preview span {
  min-height: 3.6vh;
  display: flex;
  align-items: center;
  padding: 0 1vh;
  border-radius: 0.5vh;
  background: rgb(255 255 255 / 4%);
  color: rgb(255 255 255 / 72%);
  font-size: 1.05vh;
  font-weight: 700;
}

.settings-security-card strong {
  font-size: 1.35vh;
}

.settings-security-card span {
  color: #ffffff;
  font-size: 2vh;
  font-weight: 850;
}

.settings-security-card small {
  color: rgb(255 255 255 / 48%);
  font-size: 1.05vh;
  font-weight: 700;
}

.settings-bind-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85vh;
}

.settings-bind {
  min-height: 6.3vh;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1vh;
  padding: 0 1.1vh;
  border: 1px solid rgb(255 255 255 / 4%);
  border-radius: 0.75vh;
  background: rgb(0 0 0 / 42%);
}

.settings-bind span {
  color: #d454f4;
  font-size: 0.9vh;
  font-weight: 900;
  text-transform: uppercase;
}

.settings-bind strong {
  display: block;
  margin-top: 0.35vh;
  font-size: 1.18vh;
}

.settings-bind button {
  min-width: 5.8vh;
  max-width: 14vh;
  min-height: 3vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 0.55vh;
  background: rgb(255 255 255 / 7%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 1.05vh;
  font-weight: 850;
  line-height: 1;
  overflow: hidden;
  padding: 0 1vh;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
}

.settings-bind button:hover,
.settings-bind__key--listening {
  border-color: #d454f459 !important;
  background: #d454f4 !important;
}

.settings-bind__key--listening {
  min-width: 12.8vh !important;
  box-shadow: 0 0 1.6vh #d454f447;
  color: #ffffff;
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.85vh;
  padding: 1.2vh 2.2vh 1.55vh;
  border-top: 1px solid rgb(255 255 255 / 4%);
}

.settings-actions button {
  min-width: 13.6vh;
  min-height: 3.65vh;
  border-radius: 0.62vh;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 1.1vh;
  font-weight: 900;
}

.settings-actions__ghost {
  border: 1px solid rgb(255 255 255 / 5%);
  background: rgb(255 255 255 / 5%);
}

.settings-actions__primary {
  border: 1px solid #d454f459;
  background: #d454f4;
  box-shadow: 0 0.9vh 2.2vh #d454f42e;
}
</style>
