<template>
  <section class="shop-top-up">
    <h1 class="f2-menu__title">Пополнение</h1>

    <div class="shop-top-up__layout">
      <aside class="shop-top-up__methods-panel">
        <button class="shop-top-up-country" type="button">
          <span>Показаны способы оплаты для:</span>
          <strong>Россия</strong>
          <BaseIcon :icon="ChevronDown" size="xs" :stroke-width="2.4" />
        </button>

        <div class="shop-top-up-methods-list">
          <button
            v-for="method in paymentMethods"
            :key="method.id"
            class="shop-top-up-method"
            :class="{ 'shop-top-up-method--active': selectedPaymentMethod === method.id }"
            type="button"
            @click="selectedPaymentMethod = method.id"
          >
            <span class="shop-top-up-method__logo">{{ method.logo }}</span>
            <strong>{{ method.title }}</strong>
            <small>{{ method.caption }}</small>
            <BaseIcon v-if="selectedPaymentMethod === method.id" :icon="Check" size="xs" :stroke-width="2.8" />
          </button>
        </div>
      </aside>

      <form class="shop-top-up-payment" novalidate @submit.prevent="submitPayment">
        <header class="shop-top-up-payment__header">
          <div>
            <span>Выбранный способ оплаты</span>
            <h2>{{ selectedMethod.title }}</h2>
          </div>
          <div class="shop-top-up-payment__balance">
            <span>Актуальный донат</span>
            <strong>{{ currentDonate.toLocaleString('ru-RU') }} Coins</strong>
          </div>
        </header>

        <div class="shop-top-up-payment__body">
          <label class="shop-top-up-field" :class="{ 'shop-top-up-field--error': emailError }">
            <span>Email для получения чека</span>
            <input v-model.trim="email" type="email" placeholder="example@mail.com">
            <small v-if="emailError">{{ emailError }}</small>
          </label>

          <div class="shop-top-up-payment__amount-row">
            <label class="shop-top-up-field" :class="{ 'shop-top-up-field--error': amountError }">
              <span>Введите сумму</span>
              <input v-model="depositAmount" inputmode="numeric" type="text" placeholder="0" @input="sanitizeAmount">
              <small v-if="amountError">{{ amountError }}</small>
            </label>

            <div class="shop-top-up-receive">
              <span>
                Получите на баланс
                <b>x{{ selectedMethod.multiplier }}</b>
              </span>
              <strong>{{ receiveAmount.toLocaleString('ru-RU') }} Coins</strong>
            </div>
          </div>

          <div class="shop-top-up__presets" aria-label="Быстрый выбор суммы">
            <button
              v-for="preset in amountPresets"
              :key="preset"
              type="button"
              :class="{ 'shop-top-up__preset--active': amountValue === preset }"
              @click="selectPreset(preset)"
            >
              {{ preset.toLocaleString('ru-RU') }}
            </button>
          </div>

          <div class="shop-top-up__agreements">
            <label>
              <input v-model="acceptedOffer" type="checkbox">
              <span>Я принимаю условия пользовательского соглашения.</span>
            </label>

            <label>
              <input v-model="acceptedActivation" type="checkbox">
              <span>Подтверждаю активацию контента в учетной записи и понимаю условия возврата.</span>
            </label>
          </div>
        </div>

        <button class="shop-top-up__submit" type="submit" :disabled="!canSubmit">
          Пополнить счет
        </button>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

import { BaseIcon, Check, ChevronDown } from '@/shared/icons'
import { useInterfaceManagerStore } from '@/core/interfaces/interface-manager.store'
import { useNotificationStore } from '@/stores/notification.store'

type PaymentMethodId = 'mir' | 'card' | 'wallet'

type PaymentMethod = {
  caption: string
  id: PaymentMethodId
  logo: string
  minAmount: number
  multiplier: number
  title: string
}

const amountPresets = [150, 300, 500, 1000, 2500]
const paymentMethods: PaymentMethod[] = [
  { id: 'mir', title: 'Российские банки от 15 RUB', caption: 'МИР, СБП, карты банков', logo: 'МИР', minAmount: 15, multiplier: 2 },
  { id: 'card', title: 'Банковская карта', caption: 'Visa, Mastercard, Мир', logo: 'CARD', minAmount: 50, multiplier: 1 },
  { id: 'wallet', title: 'Электронный кошелек', caption: 'Быстрый онлайн платеж', logo: 'PAY', minAmount: 100, multiplier: 1 },
]

const interfaceManager = useInterfaceManagerStore()
const notificationStore = useNotificationStore()
const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()
const depositAmount = ref('')
const email = ref('')
const selectedPaymentMethod = ref<PaymentMethodId>('mir')
const acceptedActivation = ref(false)
const acceptedOffer = ref(false)
const hasSubmitted = ref(false)

const selectedMethod = computed(() => paymentMethods.find((method) => method.id === selectedPaymentMethod.value) ?? paymentMethods[0])
const amountValue = computed(() => Number(depositAmount.value.replace(/\D/g, '')) || 0)
const receiveAmount = computed(() => amountValue.value * selectedMethod.value.multiplier)
const currentDonate = computed(() => Number((props.payload as any)?.donate ?? (props.payload as any)?.account?.donate ?? 0))
const emailError = computed(() => {
  if (!hasSubmitted.value && !email.value) {
    return ''
  }

  if (!email.value) {
    return 'Укажите email для чека'
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value) ? '' : 'Введите корректный email'
})
const amountError = computed(() => {
  if (!hasSubmitted.value && !depositAmount.value) {
    return ''
  }

  if (amountValue.value <= 0) {
    return 'Введите сумму пополнения'
  }

  return amountValue.value >= selectedMethod.value.minAmount
    ? ''
    : `Минимальная сумма ${selectedMethod.value.minAmount}`
})
const canSubmit = computed(() =>
  !emailError.value
  && !amountError.value
  && email.value
  && amountValue.value >= selectedMethod.value.minAmount
  && acceptedOffer.value
  && acceptedActivation.value,
)

function sanitizeAmount() {
  depositAmount.value = depositAmount.value.replace(/\D/g, '')
}

function selectPreset(preset: number) {
  depositAmount.value = String(preset)
}

function submitPayment() {
  hasSubmitted.value = true

  if (!canSubmit.value) {
    notificationStore.notify('Проверьте данные и подтвердите условия оплаты', {
      title: 'Пополнение',
      variant: 'warning',
    })

    if (!interfaceManager.isActive('notifications')) {
      interfaceManager.open('notifications')
    }

    return
  }

  notificationStore.notify(`Переходим к оплате: ${receiveAmount.value.toLocaleString('ru-RU')} Coins`, {
    title: 'Пополнение',
    variant: 'success',
  })

  if (!interfaceManager.isActive('notifications')) {
    interfaceManager.open('notifications')
  }
}
</script>

<style scoped>
.shop-top-up {
  position: relative;
  min-height: 80vh;
  padding-bottom: 2vh;
  isolation: isolate;
}

.shop-top-up__layout {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.95fr);
  gap: 3vh;
  margin-top: 3.2vh;
}

.shop-top-up__methods-panel {
  display: grid;
  order: 2;
  align-content: start;
  gap: 1.45vh;
}

.shop-top-up-country,
.shop-top-up-payment__header,
.shop-top-up-payment__body,
.shop-top-up__submit {
  border: 1px solid rgb(255 255 255 / 6%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 48%),
    rgb(8 8 9 / 88%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
}

.shop-top-up-country {
  min-height: 5.2vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.7vh;
  padding: 0 1.25vh;
  border-radius: 0.65vh;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.shop-top-up-country span {
  color: rgb(255 255 255 / 45%);
  font-size: 1.06vh;
  font-weight: 600;
}

.shop-top-up-country strong {
  color: #ffffff;
  font-size: 1.12vh;
  font-weight: 800;
}

.shop-top-up-methods-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1vh;
}

.shop-top-up-method {
  position: relative;
  width: 100%;
  height: 10.1vh;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.45vh;
  padding: 0.8vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 0.85vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 46%),
    rgb(8 8 9 / 86%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  text-align: center;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.shop-top-up-method:hover,
.shop-top-up-method--active {
  border-color: rgb(172 46 205 / 64%);
  background:
    radial-gradient(9vh 6vh at 50% 45%, rgb(172 46 205 / 16%), transparent 72%),
    rgb(15 10 18 / 88%);
  box-shadow: inset 0 0 0 0.1vh rgb(172 46 205 / 14%);
}

.shop-top-up-method > .twinkle-icon {
  position: absolute;
  right: 0.7vh;
  top: 0.65vh;
  color: #d46bff;
}

.shop-top-up-method__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.65vh;
  background: #ffffff;
  color: #1b8f45;
  font-weight: 900;
  line-height: 1;
}

.shop-top-up-method__logo {
  width: 5.4vh;
  height: 5.4vh;
  font-size: 1.55vh;
}

.shop-top-up-method strong,
.shop-top-up-method small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-top-up-method strong {
  color: #ffffff;
  font-size: 0.9vh;
  font-weight: 800;
}

.shop-top-up-method small {
  color: rgb(255 255 255 / 42%);
  font-size: 0.76vh;
  font-weight: 700;
}

.shop-top-up-payment {
  min-width: 0;
  display: grid;
  order: 1;
  width: 100%;
  gap: 1.35vh;
}

.shop-top-up-payment__header {
  min-height: 7vh;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.4vh;
  padding: 1.2vh 1.45vh;
  border-radius: 0.65vh;
}

.shop-top-up-payment__header span {
  color: rgb(255 255 255 / 42%);
  font-size: 0.92vh;
  font-weight: 700;
  line-height: 1;
}

.shop-top-up-payment__header h2 {
  margin: 0.55vh 0 0;
  color: #ffffff;
  font-size: 1.42vh;
  font-weight: 800;
  line-height: 1;
}

.shop-top-up-payment__body {
  display: grid;
  gap: 1.55vh;
  padding: 2.4vh;
  border-radius: 0.85vh;
}

.shop-top-up-field {
  display: grid;
  gap: 0.75vh;
}

.shop-top-up-field span,
.shop-top-up-receive > span {
  color: #ffffff;
  font-size: 1.02vh;
  font-weight: 700;
  line-height: 1;
}

.shop-top-up-field input,
.shop-top-up-receive {
  min-height: 4.6vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 0.58vh;
  background: rgb(255 255 255 / 4%);
  color: #ffffff;
  box-sizing: border-box;
}

.shop-top-up-field input {
  width: 100%;
  outline: 0;
  padding: 0 1.25vh;
  font: inherit;
  font-size: 1.08vh;
  font-weight: 700;
}

.shop-top-up-field input::placeholder {
  color: rgb(255 255 255 / 34%);
}

.shop-top-up-field--error span,
.shop-top-up-field small {
  color: #ff5757;
}

.shop-top-up-field--error input {
  border-color: rgb(255 71 71 / 76%);
}

.shop-top-up-field small {
  font-size: 0.88vh;
  font-weight: 700;
  line-height: 1;
}

.shop-top-up-payment__amount-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(24vh, 1fr);
  align-items: start;
  gap: 1.15vh;
}

.shop-top-up-receive {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  align-content: center;
  gap: 0.72vh;
  padding: 1.05vh 1.25vh;
}

.shop-top-up-receive span {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.45vh;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-top-up-receive b {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  min-height: 1.5vh;
  padding: 0 0.42vh;
  border-radius: 999px;
  background: rgb(172 46 205 / 18%);
  color: #d46bff;
  font-size: 0.74vh;
}

.shop-top-up-receive strong {
  min-width: 0;
  overflow: hidden;
  color: #ffffff;
  font-size: 1.45vh;
  font-weight: 900;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-top-up__presets {
  display: flex;
  gap: 0.65vh;
}

.shop-top-up__presets button {
  min-width: 6.2vh;
  min-height: 2.75vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 0.5vh;
  background: rgb(255 255 255 / 4%);
  color: rgb(255 255 255 / 64%);
  cursor: pointer;
  font: inherit;
  font-size: 0.9vh;
  font-weight: 800;
}

.shop-top-up__presets button:hover,
.shop-top-up__preset--active {
  border-color: rgb(172 46 205 / 48%);
  background: rgb(172 46 205 / 14%);
  color: #f0c6ff;
}

.shop-top-up__agreements {
  display: grid;
  gap: 1vh;
  padding-top: 1.45vh;
  border-top: 1px solid rgb(255 255 255 / 6%);
}

.shop-top-up__agreements label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8vh;
  color: rgb(255 255 255 / 54%);
  font-size: 0.98vh;
  font-weight: 600;
  line-height: 1.35;
}

.shop-top-up__agreements input {
  width: 1.1vh;
  height: 1.1vh;
  margin: 0.14vh 0 0;
  accent-color: #ac2ecd;
}

.shop-top-up__submit {
  min-height: 5.2vh;
  border-radius: 0.85vh;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 1.12vh;
  font-weight: 900;
  text-shadow: 0 0.12vh 0.35vh rgb(0 0 0 / 24%);
  background:
    linear-gradient(180deg, rgb(214 107 255), rgb(137 37 165)),
    #ac2ecd;
  border-color: rgb(172 46 205 / 52%);
  transition: opacity 150ms ease, filter 150ms ease, transform 150ms ease;
}

.shop-top-up__submit:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-0.08vh);
}

.shop-top-up__submit:disabled {
  cursor: default;
  filter: grayscale(1);
  opacity: 0.48;
}

.shop-top-up :is(p, small, [class*="__meta"], [class*="__description"], [class*="__caption"]) {
  line-height: 1.35;
}
</style>
