<script setup lang="ts">
import { computed, ref } from 'vue'

import type { InterfacePayloadMap } from '@/shared/contracts/ui'

type PhoneTab = 'calls' | 'sms' | 'contacts' | 'operator'
type PhoneSection = 'favorites' | 'recents' | 'contacts' | 'keypad'
type HomeAppId = PhoneTab | 'notes' | 'apps' | 'reddit' | 'tiktok' | 'reminders' | 'clock' | 'vpn' | 'ai' | 'youtube' | 'spotify' | 'maps' | 'store' | 'photos' | 'wallet' | 'music'

type HomeApp = {
  id: HomeAppId
  label: string
  icon: string
  tone: string
  badge?: number
  disabled?: boolean
}

const props = defineProps<{
  payload?: InterfacePayloadMap['phone']
}>()

const activeTab = ref<PhoneTab | null>(null)
const dialNumber = ref('')
const phoneSection = ref<PhoneSection>('keypad')
const selectedContactId = ref<number | null>(null)

const operatorName = computed(() => props.payload?.operator ?? 'NoName Mobile')
const tariffName = computed(() => props.payload?.tariff ?? 'Pro Max')
const balance = computed(() => props.payload?.balance ?? 12850)
const formattedBalance = computed(() => new Intl.NumberFormat('ru-RU').format(balance.value))
const selectedPhoneContact = computed(() => phoneContacts.find((contact) => contact.id === selectedContactId.value) ?? null)

const dialKeys = [
  { value: '1', letters: '' },
  { value: '2', letters: 'ABC' },
  { value: '3', letters: 'DEF' },
  { value: '4', letters: 'GHI' },
  { value: '5', letters: 'JKL' },
  { value: '6', letters: 'MNO' },
  { value: '7', letters: 'PQRS' },
  { value: '8', letters: 'TUV' },
  { value: '9', letters: 'WXYZ' },
  { value: '*', letters: '' },
  { value: '0', letters: '+' },
  { value: '#', letters: '' },
]

const phoneSections: Array<{ id: PhoneSection; label: string }> = [
  { id: 'favorites', label: 'Избранное' },
  { id: 'recents', label: 'Недавние' },
  { id: 'contacts', label: 'Контакты' },
  { id: 'keypad', label: 'Клавиши' },
]

const favoriteContacts = [
  { id: 1, name: 'Алекс Картер', subtitle: 'мобильный', accent: 'blue' },
  { id: 2, name: 'Механик', subtitle: 'сервис', accent: 'orange' },
  { id: 3, name: 'Диспетчер', subtitle: 'работа', accent: 'green' },
]

const recentCalls = [
  { id: 1, name: 'Максим Ривер', meta: 'мобильный', time: '12:42', type: 'incoming' },
  { id: 2, name: 'Такси Premium', meta: 'мобильный', time: '11:08', type: 'outgoing' },
  { id: 3, name: 'Служба города', meta: 'пропущенный', time: 'Вчера', type: 'missed' },
]

const phoneContacts = [
  { id: 1, name: 'Алекс Картер', phone: '+7 900 120-30-40', accent: 'blue' },
  { id: 2, name: 'Механик', phone: '+7 900 555-12-34', accent: 'orange' },
  { id: 3, name: 'Диспетчер', phone: '+7 900 777-81-81', accent: 'purple' },
  { id: 4, name: 'NoName Mobile', phone: '+7 900 000-00-00', accent: 'green' },
]

const messageThreads = [
  { id: 1, name: 'Банк', preview: 'Пополнение счета выполнено', time: '12:21', unread: 2, accent: 'green' },
  { id: 2, name: 'NoName Mobile', preview: 'Баланс обновлен, пакет услуг активен', time: '10:04', unread: 0, accent: 'blue' },
  { id: 3, name: 'Алекс', preview: 'Встречаемся у парковки', time: 'Вчера', unread: 0, accent: 'orange' },
  { id: 4, name: 'Такси Premium', preview: 'Водитель ожидает у входа', time: 'Пн', unread: 1, accent: 'purple' },
]

const homeApps: HomeApp[] = [
  { id: 'notes', label: 'Заметки', icon: 'notes', tone: 'notes', disabled: true },
  { id: 'clock', label: 'Часы', icon: 'clock', tone: 'clock', disabled: true },
  { id: 'vpn', label: 'VPN', icon: 'vpn', tone: 'vpn', disabled: true },
  { id: 'store', label: 'App Store', icon: 'store', tone: 'store', disabled: true },
  { id: 'sms', label: 'Сообщения', icon: 'sms', tone: 'sms' },
  { id: 'calls', label: 'Телефон', icon: 'phone', tone: 'phone' },
  { id: 'photos', label: 'Фото', icon: 'photos', tone: 'photos', disabled: true },
]

const dockApps: HomeApp[] = [
  { id: 'calls', label: 'Телефон', icon: 'phone', tone: 'phone' },
  { id: 'apps', label: 'Apps', icon: 'apps', tone: 'apps', disabled: true },
  { id: 'store', label: 'Safari', icon: 'safari', tone: 'safari', disabled: true },
  { id: 'music', label: 'Музыка', icon: 'music', tone: 'music', disabled: true },
]

function openHomeApp(app: HomeApp) {
  if (app.disabled) {
    return
  }

  activeTab.value = app.id as PhoneTab
}

function closePanel() {
  activeTab.value = null
}

function appendDialDigit(value: string) {
  if (dialNumber.value.length >= 18) {
    return
  }

  dialNumber.value += value
}

function removeDialDigit() {
  dialNumber.value = dialNumber.value.slice(0, -1)
}

function setPhoneSection(section: PhoneSection) {
  phoneSection.value = section
  selectedContactId.value = null
}

function openPhoneContact(contactId: number) {
  selectedContactId.value = contactId
}

function closePhoneContact() {
  selectedContactId.value = null
}
</script>

<template>
  <main class="phone-app">
    <section class="iphone" aria-label="iPhone 17 Pro Max">
      <div class="iphone__frame">
        <div class="iphone__side iphone__side--left"></div>
        <div class="iphone__side iphone__side--right"></div>

        <div class="iphone__screen">
          <div class="dynamic-island" aria-hidden="true"></div>

          <header class="phone-status">
            <span>13:19</span>
            <div class="phone-status__right">
              <span class="phone-signal" aria-hidden="true">
                <i></i>
                <i></i>
                <i></i>
                <i></i>
              </span>
              <span class="phone-battery">58</span>
            </div>
          </header>

          <section class="home-screen" aria-label="Главный экран">
            <div class="calendar-widget">
              <strong>СУББОТА</strong>
              <span>11</span>
              <p>Нет событий</p>
              <small>Календарь</small>
            </div>

            <button
              v-for="app in homeApps"
              :key="app.id"
              class="app-icon"
              type="button"
              @click="openHomeApp(app)"
            >
              <span class="app-icon__tile" :class="[`app-icon__tile--${app.tone}`, `app-icon__tile--${app.icon}`]">
                <img v-if="app.icon === 'clock'" class="app-icon__image" src="/icon-chas.jpg" alt="">
                <img v-if="app.icon === 'sms'" class="app-icon__image" src="/apps-icon.png" alt="">
                <img v-if="app.icon === 'phone'" class="app-icon__image" src="/icon-tel.jpg" alt="">
                <img v-if="app.icon === 'photos'" class="app-icon__image" src="/iphone-icon.jpg" alt="">
                <img v-if="app.icon === 'store'" class="app-icon__image" src="/iOS 17_ icon.jpg" alt="">
                <i v-if="app.badge" class="app-icon__badge">{{ app.badge }}</i>
              
              </span>
              <span class="app-icon__label">{{ app.label }}</span>
            </button>

            <div class="page-dots" aria-hidden="true">
              <span class="page-dots__item page-dots__item--active"></span>
              <span class="page-dots__item"></span>
            </div>
          </section>

          <nav class="phone-dock" aria-label="Быстрый доступ">
            <button
              v-for="app in dockApps"
              :key="`dock-${app.id}`"
              class="dock-icon"
              type="button"
              @click="openHomeApp(app)"
            >
              <span class="app-icon__tile" :class="[`app-icon__tile--${app.tone}`, `app-icon__tile--${app.icon}`]">
                <img v-if="app.icon === 'phone'" class="app-icon__image" src="/icon-tel.jpg" alt="">
                <img v-if="app.icon === 'apps'" class="app-icon__image" src="/apps-icon.png" alt="">
                <img v-if="app.icon === 'safari'" class="app-icon__image" src="/icon-safari.png" alt="">
                <img v-if="app.icon === 'music'" class="app-icon__image" src="/icon-music.jpg" alt="">
              </span>
            </button>
          </nav>

          <Transition name="app-panel">
            <section v-if="activeTab" class="phone-panel" aria-live="polite">
              <header class="phone-panel__head">
                <button type="button" @click="closePanel">Назад</button>
                <h2 v-if="activeTab === 'calls'">Телефон</h2>
                <h2 v-else-if="activeTab === 'sms'">Сообщения</h2>
                <h2 v-else-if="activeTab === 'contacts'">Контакты</h2>
                <h2 v-else>Оператор</h2>
              </header>

              <div v-if="activeTab === 'calls'" class="phone-view phone-view--dialer">
                <section v-if="phoneSection === 'favorites'" class="phone-section phone-section--list">
                  <h3>Избранное</h3>
                  <ul class="phone-app-list">
                    <li v-for="contact in favoriteContacts" :key="contact.id" class="phone-app-row">
                      <span class="phone-app-avatar" :class="`phone-app-avatar--${contact.accent}`">{{ contact.name.slice(0, 1) }}</span>
                      <div>
                        <strong>{{ contact.name }}</strong>
                        <span>{{ contact.subtitle }}</span>
                      </div>
                      <button type="button" aria-label="Позвонить"></button>
                    </li>
                  </ul>
                </section>

                <section v-else-if="phoneSection === 'recents'" class="phone-section phone-section--list">
                  <h3>Недавние</h3>
                  <ul class="phone-app-list">
                    <li v-for="call in recentCalls" :key="call.id" class="phone-app-row">
                      <span class="phone-call-type" :class="`phone-call-type--${call.type}`"></span>
                      <div>
                        <strong>{{ call.name }}</strong>
                        <span>{{ call.meta }}</span>
                      </div>
                      <time>{{ call.time }}</time>
                    </li>
                  </ul>
                </section>

                <section v-else-if="phoneSection === 'contacts'" class="phone-section phone-section--list">
                  <template v-if="selectedPhoneContact">
                    <button class="phone-contact-back" type="button" @click="closePhoneContact">Контакты</button>
                    <article class="phone-contact-card">
                      <span class="phone-contact-card__avatar" :class="`phone-app-avatar--${selectedPhoneContact.accent}`">
                        {{ selectedPhoneContact.name.slice(0, 1) }}
                      </span>
                      <h3>{{ selectedPhoneContact.name }}</h3>
                      <p>{{ selectedPhoneContact.phone }}</p>

                      <div class="phone-contact-actions">
                        <button type="button">
                          <span class="phone-contact-actions__icon phone-contact-actions__icon--call"></span>
                          <b>Позвонить</b>
                        </button>
                        <button type="button">
                          <span class="phone-contact-actions__icon phone-contact-actions__icon--message"></span>
                          <b>Сообщение</b>
                        </button>
                      </div>

                      <dl class="phone-contact-info">
                        <div>
                          <dt>мобильный</dt>
                          <dd>{{ selectedPhoneContact.phone }}</dd>
                        </div>
                        <div>
                          <dt>заметки</dt>
                          <dd>Нет заметок</dd>
                        </div>
                      </dl>
                    </article>
                  </template>

                  <template v-else>
                    <h3>Контакты</h3>
                    <label class="phone-contact-search">
                      <span></span>
                      <input type="text" placeholder="Поиск" autocomplete="off">
                    </label>
                    <ul class="phone-app-list">
                      <li
                        v-for="contact in phoneContacts"
                        :key="contact.id"
                        class="phone-app-row phone-app-row--button"
                        @click="openPhoneContact(contact.id)"
                      >
                        <span class="phone-app-avatar" :class="`phone-app-avatar--${contact.accent}`">{{ contact.name.slice(0, 1) }}</span>
                        <div>
                          <strong>{{ contact.name }}</strong>
                          <span>{{ contact.phone }}</span>
                        </div>
                      </li>
                    </ul>
                  </template>
                </section>

                <section v-else class="phone-section phone-section--keypad">
                  <div class="dialer-display" aria-live="polite">
                  <span v-if="dialNumber">{{ dialNumber }}</span>
                  <span v-else class="dialer-display__placeholder">Введите номер</span>
                  </div>

                  <div class="dialer-keypad" aria-label="Клавиатура набора номера">
                  <button
                    v-for="key in dialKeys"
                    :key="key.value"
                    class="dialer-key"
                    type="button"
                    @click="appendDialDigit(key.value)"
                  >
                    <strong>{{ key.value }}</strong>
                    <span>{{ key.letters }}</span>
                  </button>
                  </div>

                  <div class="dialer-actions">
                  <span></span>
                  <button class="dialer-call" type="button" aria-label="Позвонить">
                    <img src="/icon-tel.jpg" alt="">
                  </button>
                  <button
                    class="dialer-delete"
                    type="button"
                    aria-label="Удалить цифру"
                    :disabled="!dialNumber"
                    @click="removeDialDigit"
                  ></button>
                  </div>
                </section>

                <nav class="phone-app-tabs" aria-label="Разделы телефона">
                  <button
                    v-for="section in phoneSections"
                    :key="section.id"
                    type="button"
                    :class="{ 'phone-app-tabs__item--active': phoneSection === section.id }"
                    @click="setPhoneSection(section.id)"
                  >
                    <span :class="`phone-app-tabs__icon phone-app-tabs__icon--${section.id}`"></span>
                    <b>{{ section.label }}</b>
                  </button>
                </nav>
                <ul class="phone-list">
                  <li class="phone-row">
                    <span class="phone-avatar phone-avatar--incoming"></span>
                    <div>
                      <strong>Максим Ривер</strong>
                      <span>Мобильный</span>
                    </div>
                    <time>12:42</time>
                  </li>
                  <li class="phone-row">
                    <span class="phone-avatar phone-avatar--outgoing"></span>
                    <div>
                      <strong>Такси Premium</strong>
                      <span>Мобильный</span>
                    </div>
                    <time>11:08</time>
                  </li>
                  <li class="phone-row">
                    <span class="phone-avatar phone-avatar--missed"></span>
                    <div>
                      <strong>Служба города</strong>
                      <span>Пропущенный вызов</span>
                    </div>
                    <time>Вчера</time>
                  </li>
                </ul>
              </div>

              <div v-else-if="activeTab === 'sms'" class="phone-view phone-view--messages">
                <div class="messages-toolbar">
                  <h3>Сообщения</h3>
                  <button type="button" aria-label="Новое сообщение"></button>
                </div>

                <label class="messages-search">
                  <span></span>
                  <input type="text" placeholder="Поиск" autocomplete="off">
                </label>

                <ul class="message-threads">
                  <li v-for="thread in messageThreads" :key="thread.id" class="message-thread">
                    <span class="message-thread__avatar" :class="`message-thread__avatar--${thread.accent}`">
                      {{ thread.name.slice(0, 1) }}
                    </span>
                    <div class="message-thread__body">
                      <div class="message-thread__meta">
                        <strong>{{ thread.name }}</strong>
                        <time>{{ thread.time }}</time>
                      </div>
                      <p>{{ thread.preview }}</p>
                    </div>
                    <span v-if="thread.unread" class="message-thread__badge">{{ thread.unread }}</span>
                  </li>
                </ul>
                <ul class="phone-list">
                  <li class="phone-row">
                    <span class="phone-avatar phone-avatar--message"><i></i></span>
                    <div>
                      <strong>Банк</strong>
                      <span>Пополнение счета выполнено</span>
                    </div>
                    <time>12:21</time>
                  </li>
                  <li class="phone-row">
                    <span class="phone-avatar phone-avatar--message"></span>
                    <div>
                      <strong>NoName Mobile</strong>
                      <span>Баланс обновлен, пакет услуг активен</span>
                    </div>
                    <time>10:04</time>
                  </li>
                </ul>
              </div>

              <div v-else-if="activeTab === 'contacts'" class="phone-view">
                <ul class="phone-list">
                  <li class="phone-row phone-row--contact">
                    <span class="contact-initial">А</span>
                    <div>
                      <strong>Алекс Картер</strong>
                      <span>Друг · +7 900 120-30-40</span>
                    </div>
                  </li>
                  <li class="phone-row phone-row--contact">
                    <span class="contact-initial">М</span>
                    <div>
                      <strong>Механик</strong>
                      <span>Сервис · +7 900 555-12-34</span>
                    </div>
                  </li>
                </ul>
              </div>

              <div v-else class="phone-view phone-view--operator">
                <div class="operator-card">
                  <span>{{ operatorName }}</span>
                  <strong>{{ formattedBalance }} ₽</strong>
                  <p>Баланс телефона</p>
                </div>
                <div class="operator-details">
                  <span>Тариф</span>
                  <strong>{{ tariffName }}</strong>
                  <span>Интернет</span>
                  <strong>48.5 ГБ</strong>
                  <span>Минуты</span>
                  <strong>Безлимит</strong>
                </div>
              </div>
            </section>
          </Transition>

          <div class="phone-home-indicator" aria-hidden="true"></div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.phone-app {
  min-height: 100vh;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0 20px 20px 0;
  background: transparent;
  color: #ffffff;
  font-family: "SF Pro Display", "Segoe UI", sans-serif;
  box-sizing: border-box;
}

.iphone {
  width: 270px;
  height: 517px;
  min-width: 0;
  flex: 0 0 auto;
}

.iphone__frame {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 6px;
  border-radius: 32px;
  background: linear-gradient(90deg, #7b2024, #ff9a93 9%, #581419 18%, #1c1014 50%, #b9444d 86%, #4b1014);
  box-shadow: inset 0 0 0 2px rgb(255 255 255 / 18%), inset 0 0 0 4px #210b0e;
  box-sizing: border-box;
}

.iphone__side {
  position: absolute;
  width: 3px;
  border-radius: 999px;
  background: #c64d52;
}

.iphone__side--left {
  left: -2px;
  top: 14%;
  height: 50px;
  box-shadow: 0 72px 0 #c64d52;
}

.iphone__side--right {
  right: -2px;
  top: 24%;
  height: 66px;
}

.iphone__screen {
  position: relative;
  height: 100%;
  overflow: hidden;
  border-radius: 27px;
  background: black;
  box-shadow: inset 0 0 0 2px #050506;
}

.iphone__screen::before {
  position: absolute;
  inset: 0;
  background: linear-gradient(150deg, rgb(255 255 255 / 28%), transparent 23%), radial-gradient(420px 220px at 50% 88%, rgb(0 105 126 / 18%), transparent 68%);
  content: "";
  pointer-events: none;
}

.dynamic-island {
  position: absolute;
  left: 50%;
  top: 10px;
  z-index: 5;
  width: 82px;
  height: 20px;
  border-radius: 999px;
  background: #050506;
  transform: translateX(-50%);
  box-shadow: inset 0 0 5px rgb(255 255 255 / 7%);
}

.phone-status {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 13px 20px 0;
  color: rgb(255 255 255 / 92%);
  font-size: 10px;
  font-weight: 800;
}

.phone-status__right {
  display: flex;
  align-items: center;
  gap: 0.55vh;
}

.phone-signal {
  display: flex;
  align-items: flex-end;
  gap: 0.15vh;
  height: calc(0.95vh + 3px);
}

.phone-signal i {
  width: 0.25vh;
  border-radius: 999px;
  background: currentColor;
}

.phone-signal i:nth-child(1) {
  height: 0.34vh;
}

.phone-signal i:nth-child(2) {
  height: 0.5vh;
}

.phone-signal i:nth-child(3) {
  height: 0.7vh;
}

.phone-signal i:nth-child(4) {
  height: 0.9vh;
}

.phone-battery {
  position: relative;
  min-width: 2.25vh;
  height: 1.08vh;
  display: grid;
  place-items: center;
  border: 0.12vh solid currentColor;
  border-radius: 0.32vh;
  color: #1d1d1d;
  background: #ffffff;
  font-size: 0.72vh;
}

.phone-battery::after {
  position: absolute;
  top: 50%;
  right: -0.36vh;
  width: 0.2vh;
  height: 0.42vh;
  border-radius: 0 999px 999px 0;
  background: currentColor;
  content: "";
  transform: translateY(-50%);
}

.home-screen {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: 49px;
  column-gap: 7px;
  row-gap: 10px;
  padding: 34px 18px 74px;
  box-sizing: border-box;
}

.calendar-widget {
  grid-column: span 2;
  grid-row: span 2;
  min-width: 0;
  padding: 10px;
  border-radius: 11px;
  background: rgb(22 22 28 / 92%);
  box-shadow: 0 10px 18px rgb(0 0 0 / 18%);
  box-sizing: border-box;
}

.calendar-widget strong,
.calendar-widget small,
.calendar-widget p,
.calendar-widget span {
  display: block;
}

.calendar-widget strong {
  color: #ff453a;
  font-size: 7px;
  line-height: 1;
}

.calendar-widget span {
  margin-top: 2px;
  font-size: 18px;
  line-height: 1;
}

.calendar-widget p {
  margin: 18px 0 0;
  color: rgb(255 255 255 / 74%);
  font-size: 10px;
  font-weight: 600;
}

.calendar-widget small {
  margin-top: 6px;
  color: rgb(255 255 255 / 32%);
  font-size: 7px;
  text-align: center;
}

.app-icon,
.dock-icon,
.phone-panel__head button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.app-icon {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 0;
}

.app-icon__tile {
  position: relative;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  background: #17171b;
  box-shadow: 0 5px 9px rgb(0 0 0 / 20%);
}

.app-icon__label {
  max-width: 100%;
  overflow: hidden;
 color: #ffffff;
  font-size: 7px;
  line-height: 1.1;
  text-shadow: 0 1px 3px rgb(0 0 0 / 34%);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-icon__image {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.app-icon__badge {
  position: absolute;
  top: -0.55vh;
  right: -0.55vh;
  display: grid;
  width: 1.75vh;
  height: 1.75vh;
  place-items: center;
  border-radius: 50%;
  background: #ff3b30;
  color: #ffffff;
  font-size: calc(0.95vh + 3px);
  font-style: normal;
  font-weight: 800;
}

.app-icon__tile::before,
.app-icon__tile::after {
  position: absolute;
  content: "";
}

.app-icon__tile--notes {
  background: linear-gradient(#f5c542 0 22%, transparent 22%), repeating-linear-gradient(#25252a 0 0.6vh, #34343a 0.68vh 0.76vh);
}

.app-icon__tile--reddit::before {
  width: 2.6vh;
  height: 2.25vh;
  border-radius: 50%;
  background: #ffffff;
}

.app-icon__tile--reddit::after {
  width: 0.42vh;
  height: 0.42vh;
  border-radius: 50%;
  background: #ff4500;
  box-shadow: 1vh 0 0 #ff4500, 0.5vh 0.9vh 0 -0.02vh #ff4500;
}

.app-icon__tile--operator {
  background: linear-gradient(145deg, #fb1339, #a80020);
}

.app-icon__tile--operator::before {
  width: 2.35vh;
  height: 2.35vh;
  border: 0.36vh solid #19191e;
  border-radius: 0.5vh;
  transform: rotate(45deg);
}

.app-icon__tile--operator::after {
  width: 1vh;
  height: 1vh;
  border-radius: 50%;
  background: #19191e;
}

.app-icon__tile--clock,
.app-icon__tile--tiktok,
.app-icon__tile--youtube,
.app-icon__tile--telegram {
  background: #111115;
}

.app-icon__tile--clock {
  overflow: hidden;
}

.app-icon__tile--clock::before {
  display: none;
}

.app-icon__tile--clock::after {
  display: none;
}

.app-icon__tile--tiktok::before {
  width: 1.35vh;
  height: 2.75vh;
  border-right: 0.65vh solid #ffffff;
  border-bottom: 0.65vh solid #ffffff;
  border-radius: 0 0 1vh 1vh;
  box-shadow: -0.35vh -0.1vh 0 #25f4ee, 0.35vh 0.2vh 0 #fe2c55;
}

.app-icon__tile--reminders::before {
  left: 1vh;
  width: 0.45vh;
  height: 0.45vh;
  border-radius: 50%;
  background: #ff9f0a;
  box-shadow: 0 1vh 0 #0a84ff, 0 2vh 0 #ff453a;
}

.app-icon__tile--reminders::after {
  right: 0.9vh;
  width: 2vh;
  height: 0.2vh;
  border-radius: 999px;
  background: #77777e;
  box-shadow: 0 1vh 0 #77777e, 0 2vh 0 #77777e;
}

.app-icon__tile--youtube::before {
  width: 3.2vh;
  height: 2.15vh;
  border-radius: 0.55vh;
  background: #ff0000;
}

.app-icon__tile--youtube::after {
  border-top: 0.48vh solid transparent;
  border-bottom: 0.48vh solid transparent;
  border-left: 0.78vh solid #ffffff;
}

.app-icon__tile--spotify {
  background: #1db954;
}

.app-icon__tile--spotify::before {
  width: 3vh;
  height: 2vh;
  border-top: 0.25vh solid #101010;
  border-radius: 50%;
  box-shadow: 0 0.6vh 0 -0.06vh #101010, 0 1.15vh 0 -0.1vh #101010;
}

.app-icon__tile--vpn {
  background: #f3f7f1;
}

.app-icon__tile--vpn::before {
  width: 2.55vh;
  height: 1.7vh;
  border: 0.38vh solid #303030;
  border-top: 0;
  border-radius: 0.25vh 0.25vh 0.8vh 0.8vh;
}

.app-icon__tile--vpn::after {
  top: 1vh;
  width: 1.7vh;
  height: 1.35vh;
  border: 0.38vh solid #303030;
  border-bottom: 0;
  border-radius: 1vh 1vh 0 0;
}

.app-icon__tile--store,
.app-icon__tile--safari {
  background: linear-gradient(145deg, #2da8ff, #006ee6);
}

.app-icon__tile--store {
  overflow: hidden;
  background: #0a84ff;
}

.app-icon__tile--store::before {
  display: none;
}

.app-icon__tile--store::after {
  display: none;
}

.app-icon__tile--sms {
  overflow: hidden;
  background: #34c759;
}

.app-icon__tile--sms::before,
.app-icon__tile--sms::after {
  display: none;
}

.app-icon__tile--phone {
  overflow: hidden;
  background: #34c759;
}

.app-icon__tile--phone::before,
.app-icon__tile--phone::after {
  display: none;
}

.app-icon__tile--photos {
  overflow: hidden;
  background: #ffffff;
}

.app-icon__tile--photos::before,
.app-icon__tile--photos::after {
  display: none;
}

.app-icon__tile--wallet {
  background: linear-gradient(145deg, #f7d569, #d99b19);
}

.app-icon__tile--wallet::before {
  width: 2.7vh;
  height: 2.2vh;
  border-radius: 50%;
  background: rgb(255 255 255 / 40%);
}

.app-icon__tile--safari::before {
  width: 2.85vh;
  height: 2.85vh;
  border: 0.18vh solid #ffffff;
  border-radius: 50%;
}

.app-icon__tile--safari::after {
  width: 0.42vh;
  height: 1.75vh;
  background: #ff3b30;
  transform: rotate(35deg);
}

.app-icon__tile--mail {
  background-image: url(/app-logo.png);
}

.app-icon__tile--music {
  overflow: hidden;
  background: #ffffff;
}

.app-icon__tile--music::before {
  display: none;
}

.app-icon__tile--music::after {
  display: none;
}

.app-icon__tile--telegram::before {
  border-top: 1.1vh solid transparent;
  border-bottom: 1.1vh solid transparent;
  border-left: 2.9vh solid #ffffff;
  transform: rotate(-17deg);
}

.app-icon__tile--camera {
  background: radial-gradient(circle at 64% 48%, #3147a7, #06060b 48%, #22242c 58%);
}

.app-icon__tile--camera::before {
  width: 3.2vh;
  height: 3.2vh;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 38%, #74b5ff, #111827 54%, #05050a 64%);
}

.page-dots {
  position: absolute;
  left: 50%;
  bottom: 11.25vh;
  display: flex;
  gap: 0.55vh;
  transform: translateX(-50%);
}

.page-dots__item {
  width: 0.55vh;
  height: 0.55vh;
  border-radius: 50%;
  background: rgb(255 255 255 / 44%);
}

.page-dots__item--active {
  background: #ffffff;
}

.phone-dock {
  position: absolute;
  left: 50%;
  bottom: 20px;
  z-index: 3;
  display: grid;
  grid-template-columns: repeat(4, 38px);
  gap: 10px;
  padding: 10px 10px;
  border-radius: 16px;
  background: rgb(255 255 255 / 22%);
  transform: translateX(-50%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 22%);
}

.dock-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  padding: 0;
}

.dock-icon .app-icon__tile {
  width: 38px;
  height: 38px;
  border-radius: 10px;
}

.phone-panel {
  position: absolute;
  inset: 44px 9px 15px;
  z-index: 4;
  overflow: hidden;
  border-radius: 20px;
  box-shadow: 0 12px 20px rgb(0 0 0 / 28%), inset 0 0 0 1px rgb(255 255 255 / 14%);
}

.phone-panel__head {
  display: grid;
  grid-template-columns: 45px 1fr 45px;
  align-items: center;
  padding: 10px 10px;
}

.phone-panel__head button {
  color: #7ab7ff;
  font-size: 9px;
  font-weight: 700;
  text-align: left;
}

.phone-panel__head h2 {
  margin: 0;
  font-size: 12px;
  text-align: center;
}

.phone-view {
  padding: 0 10px 10px;
}

.phone-view--dialer {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  justify-items: stretch;
  min-height: 410px;
  padding: 3px 9px 10px;
}

.phone-view--dialer .phone-list {
  display: none;
}

.phone-section {
  min-height: 0;
  overflow: hidden;
}

.phone-section--keypad {
  display: grid;
  justify-items: center;
  align-content: start;
  padding: 0 0.65vh;
}

.phone-section--list {
  display: grid;
  align-content: start;
  padding: 0 0.1vh;
}

.phone-section h3 {
  margin: 0 0 9px;
  color: #ffffff;
  font-size: 17px;
  font-weight: 800;
  line-height: 1;
}

.phone-app-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.phone-app-row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  border-bottom: 0.1vh solid rgb(255 255 255 / 10%);
}

.phone-app-row--button {
  cursor: pointer;
}

.phone-app-row--button::after {
  color: rgb(255 255 255 / 32%);
  content: "›";
  font-size: 2.2vh;
  line-height: 1;
}

.phone-app-row strong,
.phone-app-row div > span,
.phone-app-row time {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.phone-app-row strong {
  color: #ffffff;
  font-size: 11px;
  line-height: 1.2;
}

.phone-app-row div > span,
.phone-app-row time {
  color: rgb(255 255 255 / 56%);
  font-size: 9px;
}

.phone-app-row button {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: #34c759;
  cursor: pointer;
}

.phone-app-row button::before {
  display: block;
  width: 9px;
  height: 12px;
  margin: 5px auto 0;
  border: 2px solid #ffffff;
  border-left-color: transparent;
  border-bottom-color: transparent;
  border-radius: 1.2vh;
  content: "";
  transform: rotate(135deg);
}

.phone-app-avatar {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 50%;
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  text-align: center;
  padding: 0;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

.phone-app-avatar--blue {
  background: linear-gradient(145deg, #5ac8fa, #0a84ff);
}

.phone-app-avatar--orange {
  background: linear-gradient(145deg, #ffd166, #ff9f0a);
}

.phone-app-avatar--green {
  background: linear-gradient(145deg, #37d46f, #159447);
}

.phone-app-avatar--purple {
  background: linear-gradient(145deg, #bf8cff, #6f45d8);
}

.phone-call-type {
  position: relative;
  display: grid;
  width: 3.9vh;
  height: 3.9vh;
  place-items: center;
  border-radius: 50%;
  background: rgb(255 255 255 / 12%);
}

.phone-call-type::before {
  width: 1.35vh;
  height: 1.35vh;
  border-top: 0.28vh solid #ffffff;
  border-right: 0.28vh solid #ffffff;
  content: "";
}

.phone-call-type--incoming::before {
  transform: rotate(135deg);
}

.phone-call-type--outgoing::before {
  transform: rotate(-45deg);
}

.phone-call-type--missed::before {
  border-color: #ff453a;
  transform: rotate(225deg);
}

.phone-contact-search {
  height: 3.05vh;
  display: grid;
  grid-template-columns: 1.55vh minmax(0, 1fr);
  align-items: center;
  gap: 0.55vh;
  margin-bottom: 0.8vh;
  padding: 0 calc(0.95vh + 3px);
  border-radius: 1.08vh;
  background: rgb(255 255 255 / 12%);
}

.phone-contact-search span {
  position: relative;
  width: 1.15vh;
  height: 1.15vh;
  border: 0.16vh solid rgb(255 255 255 / 48%);
  border-radius: 50%;
}

.phone-contact-search span::after {
  position: absolute;
  right: -0.38vh;
  bottom: -0.18vh;
  width: 0.55vh;
  height: 0.16vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 48%);
  content: "";
  transform: rotate(45deg);
}

.phone-contact-search input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #ffffff;
  font: inherit;
  font-size: 1.15vh;
}

.phone-contact-search input::placeholder {
  color: rgb(255 255 255 / 46%);
}

.phone-contact-back {
  width: max-content;
  margin: 0 0 1.1vh;
  border: 0;
  background: transparent;
  color: #0a84ff;
  cursor: pointer;
  font: inherit;
  font-size: 1.18vh;
  font-weight: 700;
}

.phone-contact-back::before {
  content: "‹ ";
}

.phone-contact-card {
  display: grid;
  justify-items: center;
}

.phone-contact-card__avatar {
  display: grid;
  width: 8.2vh;
  height: 8.2vh;
  place-items: center;
  border-radius: 50%;
  color: #ffffff;
  font-size: 3vh;
  font-weight: 800;
}

.phone-contact-card h3 {
  margin: 1vh 0 0;
  max-width: 100%;
  overflow: hidden;
  font-size: 2.15vh;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.phone-contact-card p {
  margin: 0.25vh 0 1.35vh;
  color: rgb(255 255 255 / 58%);
  font-size: 1.15vh;
}

.phone-contact-actions {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7vh;
}

.phone-contact-actions button {
  display: grid;
  justify-items: center;
  gap: 0.4vh;
  min-height: 5.6vh;
  padding: 0.75vh;
  border: 0;
  border-radius: 1.25vh;
  background: rgb(255 255 255 / 10%);
  color: #0a84ff;
  cursor: pointer;
  font: inherit;
}

.phone-contact-actions button b {
  font-size: 1vh;
  font-weight: 700;
}

.phone-contact-actions__icon {
  position: relative;
  width: 2.1vh;
  height: 2.1vh;
}

.phone-contact-actions__icon--call::before {
  position: absolute;
  left: 0.38vh;
  top: 0.1vh;
  width: 1vh;
  height: 1.45vh;
  border: 0.32vh solid currentColor;
  border-left-color: transparent;
  border-bottom-color: transparent;
  border-radius: 1.2vh;
  content: "";
  transform: rotate(135deg);
}

.phone-contact-actions__icon--message::before {
  position: absolute;
  left: 0.2vh;
  top: 0.38vh;
  width: 1.72vh;
  height: 1.15vh;
  border-radius: 0.72vh;
  background: currentColor;
  content: "";
}

.phone-contact-actions__icon--message::after {
  position: absolute;
  left: 0.54vh;
  bottom: 0.18vh;
  width: 0.68vh;
  height: 0.48vh;
  background: currentColor;
  clip-path: polygon(100% 0, 50% 100%, 0 72%, 26% 38%, 18% 0);
  content: "";
}

.phone-contact-info {
  width: 100%;
  display: grid;
  gap: 0.75vh;
  margin: 1.2vh 0 0;
}

.phone-contact-info div {
  padding: 1vh 1.05vh;
  border-radius: 1.2vh;
  background: rgb(255 255 255 / 10%);
}

.phone-contact-info dt,
.phone-contact-info dd {
  margin: 0;
}

.phone-contact-info dt {
  color: rgb(255 255 255 / 50%);
  font-size: 1vh;
}

.phone-contact-info dd {
  margin-top: 0.25vh;
  color: #ffffff;
  font-size: 1.22vh;
}

.phone-app-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2px;
  padding-top: 6px;
  border-top: 1px solid rgb(255 255 255 / 10%);
}

.phone-app-tabs button {
  display: grid;
  justify-items: center;
  gap: 3px;
  min-width: 0;
  min-height: 34px;
  border: 0;
  background: transparent;
  color: rgb(255 255 255 / 62%);
  cursor: pointer;
  font: inherit;
}

.phone-app-tabs button b {
  overflow: hidden;
  max-width: 100%;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.phone-app-tabs__item--active {
  color: #0a84ff !important;
}

.phone-app-tabs__icon {
  position: relative;
  width: 16px;
  height: 16px;
}

.phone-app-tabs__icon::before,
.phone-app-tabs__icon::after {
  position: absolute;
  content: "";
}

.phone-app-tabs__icon--favorites::before {
  inset: 3px 2px;
  background: currentColor;
  clip-path: polygon(50% 0, 62% 34%, 100% 34%, 69% 55%, 82% 100%, 50% 72%, 18% 100%, 31% 55%, 0 34%, 38% 34%);
}

.phone-app-tabs__icon--recents::before {
  inset: 2px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
}

.phone-app-tabs__icon--recents::after {
  left: 7px;
  top: 4px;
  width: 2px;
  height: 6px;
  background: currentColor;
  box-shadow: 3px 5px 0 currentColor;
  transform-origin: bottom center;
}

.phone-app-tabs__icon--contacts::before {
  left: 5px;
  top: 2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.phone-app-tabs__icon--contacts::after {
  left: 3px;
  bottom: 2px;
  width: 11px;
  height: 6px;
  border-radius: 9px 9px 3px 3px;
  background: currentColor;
}

.phone-app-tabs__icon--keypad::before {
  left: 3px;
  top: 3px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  box-shadow:
    5px 0 0 currentColor,
    10px 0 0 currentColor,
    0 5px 0 currentColor,
    5px 5px 0 currentColor,
    10px 5px 0 currentColor,
    0 10px 0 currentColor,
    5px 10px 0 currentColor,
    10px 10px 0 currentColor;
}

.dialer-display {
  width: 100%;
  min-height: 38px;
  display: grid;
  place-items: center;
  color: #ffffff;
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1;
}

.dialer-display__placeholder {
  color: rgb(255 255 255 / 36%);
  font-size: 10px;
  font-weight: 600;
}

.dialer-keypad {
  width: min(178px, 100%);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px 10px;
  margin-top: 3px;
}

.dialer-key,
.dialer-call,
.dialer-delete {
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.dialer-key {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  padding: 4px 0 3px;
  border-radius: 50%;
  background: rgb(255 255 255 / 16%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 10%);
}

.dialer-key strong,
.dialer-key span {
  display: block;
  line-height: 1;
}

.dialer-key strong {
  font-size: 20px;
  font-weight: 500;
}

.dialer-key span {
  min-height: 7px;
  margin-top: 2px;
  color: rgb(255 255 255 / 62%);
  font-size: 6px;
  font-weight: 800;
  letter-spacing: 0.6px;
}

.dialer-actions {
  width: min(178px, 100%);
  display: grid;
  grid-template-columns: 1fr 48px 1fr;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.dialer-call {
  position: relative;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  overflow: hidden;
  background: #34c759;
}

.dialer-call img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: 18px;
}

.dialer-delete {
  position: relative;
  justify-self: center;
  width: 22px;
  height: 13px;
  border-radius: 5px;
  background: transparent;
  opacity: 0.86;
}

.dialer-delete:disabled {
  cursor: default;
  opacity: 0.24;
}

.dialer-delete::before {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: #e5e5e8;
  content: "";
}

.dialer-delete::after {
  position: absolute;
  left: 50%;
  top: 50%;
  color: #111111;
  content: "×";
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  transform: translate(-50%, -54%);
}

.phone-list {
  display: grid;
  gap: 0.7vh;
  margin: 0;
  padding: 0;
  list-style: none;
}

.phone-view--messages {
  padding: 0.1vh 1.45vh 1.4vh;
}

.phone-view--messages > .phone-list {
  display: none;
}

.messages-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35vh 0.2vh 1vh;
}

.messages-toolbar h3 {
  margin: 0;
  color: #ffffff;
  font-size: 2.5vh;
  font-weight: 800;
  line-height: 1;
}

.messages-toolbar button {
  position: relative;
  width: 2.65vh;
  height: 2.65vh;
  border: 0;
  border-radius: 50%;
  background: rgb(10 132 255 / 20%);
  cursor: pointer;
}

.messages-toolbar button::before {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1.18vh;
  height: 1.18vh;
  border: 0.18vh solid #0a84ff;
  border-left: 0;
  border-bottom: 0;
  content: "";
  transform: translate(-45%, -56%) rotate(-45deg);
}

.messages-toolbar button::after {
  position: absolute;
  right: 0.72vh;
  top: 0.62vh;
  width: 0.7vh;
  height: 0.18vh;
  border-radius: 999px;
  background: #0a84ff;
  content: "";
  transform: rotate(-45deg);
}

.messages-search {
  height: 3.15vh;
  display: grid;
  grid-template-columns: 1.7vh minmax(0, 1fr);
  align-items: center;
  gap: 0.55vh;
  padding: 0 1vh;
  border-radius: 1.15vh;
  background: rgb(255 255 255 / 12%);
}

.messages-search span {
  position: relative;
  width: 1.25vh;
  height: 1.25vh;
  border: 0.18vh solid rgb(255 255 255 / 48%);
  border-radius: 50%;
}

.messages-search span::after {
  position: absolute;
  right: -0.45vh;
  bottom: -0.22vh;
  width: 0.62vh;
  height: 0.18vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 48%);
  content: "";
  transform: rotate(45deg);
}

.messages-search input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #ffffff;
  font: inherit;
  font-size: 1.22vh;
}

.messages-search input::placeholder {
  color: rgb(255 255 255 / 46%);
}

.message-threads {
  display: grid;
  margin: 1.05vh 0 0;
  padding: 0;
  list-style: none;
}

.message-thread {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  border-bottom: 0.1vh solid rgb(255 255 255 / 10%);
}

.message-thread__avatar {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 50%;
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

.message-thread__avatar--green {
  background: linear-gradient(145deg, #37d46f, #159447);
}

.message-thread__avatar--blue {
  background: linear-gradient(145deg, #5ac8fa, #0a84ff);
}

.message-thread__avatar--orange {
  background: linear-gradient(145deg, #ffd166, #ff9f0a);
}

.message-thread__avatar--purple {
  background: linear-gradient(145deg, #bf8cff, #6f45d8);
}

.message-thread__body {
  min-width: 0;
}

.message-thread__meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.8vh;
}

.message-thread__meta strong {
  min-width: 0;
  overflow: hidden;
  font-size: 1.35vh;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-thread__meta time {
  color: rgb(255 255 255 / 45%);
  font-size: 1vh;
}

.message-thread p {
  min-width: 0;
  overflow: hidden;
  margin: 0.24vh 0 0;
  color: rgb(255 255 255 / 56%);
  font-size: 1.08vh;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-thread__badge {
  display: grid;
  min-width: 1.55vh;
  height: 1.55vh;
  place-items: center;
  border-radius: 999px;
  background: #0a84ff;
  color: #ffffff;
  font-size: 0.9vh;
  font-weight: 800;
}

.phone-row {
  display: grid;
  grid-template-columns: 3.9vh minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.9vh;
  min-height: 5.15vh;
  padding: 0.55vh 0;
}

.phone-row--contact {
  grid-template-columns: 3.9vh minmax(0, 1fr);
}

.phone-row strong,
.phone-row span {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.phone-row strong {
  font-size: 1.32vh;
}

.phone-row span,
.phone-row time {
  color: rgb(255 255 255 / 64%);
  font-size: 1.12vh;
}

.phone-avatar,
.contact-initial {
  position: relative;
  display: grid;
  width: 3.75vh;
  height: 3.75vh;
  place-items: center;
  border-radius: 50%;
  background: rgb(255 255 255 / 14%);
}

.phone-avatar::before {
  position: absolute;
  content: "";
}

.phone-avatar--incoming::before,
.phone-avatar--outgoing::before,
.phone-avatar--missed::before {
  width: 1.5vh;
  height: 1.5vh;
  border-top: 0.32vh solid #ffffff;
  border-right: 0.32vh solid #ffffff;
}

.phone-avatar--incoming::before {
  transform: rotate(135deg);
}

.phone-avatar--outgoing::before {
  transform: rotate(-45deg);
}

.phone-avatar--missed::before {
  border-color: #ff5b5b;
  transform: rotate(225deg);
}

.phone-avatar--message::before {
  width: 2.1vh;
  height: 1.55vh;
  border-radius: 0.55vh;
  background: #ffffff;
}

.phone-avatar--message i {
  position: absolute;
  top: 0.25vh;
  right: 0.25vh;
  width: 0.9vh;
  height: 0.9vh;
  border: 0.16vh solid rgb(20 21 25 / 92%);
  border-radius: 50%;
  background: #34c759;
}

.contact-initial {
  background: linear-gradient(145deg, #ffd266, #c97825);
  color: #1a1007;
  font-size: 1.55vh;
  font-weight: 900;
}

.phone-view--operator {
  display: grid;
  gap: 1.2vh;
}

.operator-card {
  min-height: 14vh;
  padding: 1.55vh;
  border-radius: 2.1vh;
  background: radial-gradient(12vh 10vh at 100% 0, rgb(255 255 255 / 20%), transparent 62%), linear-gradient(145deg, #ff5b60, #9d263c);
  box-sizing: border-box;
}

.operator-card span,
.operator-card p {
  color: rgb(255 255 255 / 76%);
  font-size: 1.18vh;
  font-weight: 700;
}

.operator-card strong {
  display: block;
  margin-top: 2.3vh;
  font-size: 3.3vh;
  line-height: 1;
}

.operator-card p {
  margin: 0.25vh 0 0;
}

.operator-details {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75vh 1vh;
  padding: 1.2vh;
  border-radius: 1.7vh;
  background: rgb(255 255 255 / 10%);
}

.operator-details span {
  color: rgb(255 255 255 / 62%);
}

.operator-details span,
.operator-details strong {
  font-size: 1.15vh;
}

.phone-home-indicator {
  position: absolute;
  left: 50%;
  bottom: 10px;
  z-index: 5;
  width: 82px;
  height: 4px;
  border-radius: 999px;
  background: #111111;
  transform: translateX(-50%);
}

.app-panel-enter-active,
.app-panel-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.app-panel-enter-from,
.app-panel-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(10px);
}

@media (max-width: 460px) {
  .phone-app {
    padding: 0 20px 20px 0;
  }

  .iphone {
    min-width: 0;
    width: min(270px, calc(100vw - 40px));
    height: min(517px, calc(100vh - 40px));
  }
}
</style>
