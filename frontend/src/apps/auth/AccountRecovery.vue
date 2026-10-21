<template>
  <div class="recovery-page">
    <div class="recovery-card">
      <div class="recovery-card__head">
        <img class="recovery-card__logo" src="/tw.png" alt="Twinkle RP">

        <h1 class="recovery-card__title">Восстановление аккаунта</h1>

        <p class="recovery-card__subtitle">
          <template v-if="step === 'code'">
            Введите код, отправленный на<br>
            вашу электронную почту.
          </template>
          <template v-else-if="step === 'password'">
            Придумайте новый пароль для<br>
            вашего аккаунта.
          </template>
          <template v-else>
            Чтобы восстановить доступ к аккаунту,<br>
            укажите адрес своей электронной почты.
          </template>
        </p>
      </div>

      <form v-if="step === 'email'" class="recovery-form" novalidate @submit.prevent="submitRecovery">
        <label class="recovery-form__field">
          <img class="recovery-form__icon" src="/gmail.png" alt="Почта">
          <input
            v-model.trim="identity"
            class="recovery-form__input"
            type="text"
            placeholder="Введите почту"
            :disabled="isPending"
            @input="clearStepError('email')"
          >
          <span v-if="error" class="recovery-form__error">{{ error }}</span>
        </label>

        <div class="recovery-card__actions">
          <button class="recovery-card__button" type="button" :disabled="isPending" @click="$emit('back')">
            Я помню пароль
          </button>
          <button class="recovery-card__button" type="submit" :disabled="isPending">
            Восстановить
          </button>
        </div>
      </form>

      <form v-else-if="step === 'code'" class="recovery-code" @submit.prevent="submitCode">
        <div class="recovery-code__fields" @paste.prevent="handleCodePaste">
          <input
            v-for="(_, index) in code"
            :key="index"
            :ref="(el) => setCodeInputRef(el, index)"
            v-model="code[index]"
            class="recovery-code__input"
            inputmode="numeric"
            maxlength="1"
            type="text"
            :disabled="isPending"
            @input="handleCodeInput(index)"
            @keydown.backspace="handleCodeBackspace(index)"
          >
        </div>

        <span v-if="codeError" class="recovery-form__error recovery-form__error--code">{{ codeError }}</span>

        <div class="recovery-card__actions recovery-card__actions--code">
          <button class="recovery-card__button recovery-card__button--back" type="button" :disabled="isPending" @click="goToEmailStep">
            ←
          </button>
          <button class="recovery-card__button recovery-card__button--continue" type="submit" :disabled="isPending">
            Продолжить
          </button>
        </div>
      </form>

      <form v-else class="recovery-form recovery-form--password" novalidate @submit.prevent="submitNewPassword">
        <label class="recovery-form__field">
          <img class="recovery-form__icon recovery-form__icon--key" src="/password.png" alt="Пароль">
          <input
            v-model="newPassword"
            class="recovery-form__input"
            type="password"
            placeholder="Введите новый пароль..."
            :disabled="isPending"
            @input="clearStepError('password')"
          >
        </label>

        <label class="recovery-form__field">
          <img class="recovery-form__icon recovery-form__icon--key" src="/password.png" alt="Повтор пароля">
          <input
            v-model="newPasswordRepeat"
            class="recovery-form__input"
            type="password"
            placeholder="Введите новый пароль..."
            :disabled="isPending"
            @input="clearStepError('password')"
          >
        </label>

        <span v-if="passwordError" class="recovery-form__error recovery-form__error--password">{{ passwordError }}</span>

        <button class="recovery-card__button recovery-card__button--password" type="submit" :disabled="isPending">
          Продолжить
        </button>

        <button class="recovery-card__link" type="button" :disabled="isPending" @click="$emit('back')">
          Вспомнили пароль? <span>Войти в аккаунт</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

type RecoveryStep = 'email' | 'code' | 'password'

defineEmits<{
  back: []
}>()

const props = defineProps<{
  payload?: InterfacePayloadMap['auth']['recovery']
}>()

const CODE_LENGTH = 10
const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 64
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const step = ref<RecoveryStep>('email')
const identity = ref('')
const error = ref('')
const codeError = ref('')
const passwordError = ref('')
const isLocalPending = ref(false)
const newPassword = ref('')
const newPasswordRepeat = ref('')
const code = ref<string[]>(Array.from({ length: CODE_LENGTH }, () => ''))
const codeInputRefs = ref<HTMLInputElement[]>([])
const codeValue = computed(() => code.value.join(''))
const isPending = computed(() => isLocalPending.value || props.payload?.pending === true)

function setCodeInputRef(element: Element | ComponentPublicInstance | null, index: number) {
  if (element instanceof HTMLInputElement) {
    codeInputRefs.value[index] = element
  }
}

function focusCodeInput(index: number) {
  codeInputRefs.value[index]?.focus()
}

function setStep(nextStep: RecoveryStep) {
  step.value = nextStep

  if (nextStep === 'code') {
    void nextTick(() => focusCodeInput(0))
  }
}

function clearStepError(targetStep = step.value) {
  if (targetStep === 'email') {
    error.value = ''
  }

  if (targetStep === 'code') {
    codeError.value = ''
  }

  if (targetStep === 'password') {
    passwordError.value = ''
  }
}

function validateEmail() {
  const normalizedEmail = identity.value.trim()

  if (!normalizedEmail) {
    error.value = 'Введите почту'
    return false
  }

  if (!emailPattern.test(normalizedEmail)) {
    error.value = 'Введите корректную почту'
    return false
  }

  identity.value = normalizedEmail
  error.value = ''
  return true
}

function validateCode() {
  const normalizedCode = codeValue.value.replace(/\D/g, '')

  if (normalizedCode.length !== CODE_LENGTH) {
    codeError.value = 'Введите код полностью'
    return false
  }

  codeError.value = ''
  return true
}

function validatePassword() {
  if (!newPassword.value || !newPasswordRepeat.value) {
    passwordError.value = 'Введите новый пароль'
    return false
  }

  if (newPassword.value.length < PASSWORD_MIN_LENGTH) {
    passwordError.value = `Пароль должен содержать минимум ${PASSWORD_MIN_LENGTH} символов`
    return false
  }

  if (newPassword.value.length > PASSWORD_MAX_LENGTH) {
    passwordError.value = `Пароль должен содержать не более ${PASSWORD_MAX_LENGTH} символов`
    return false
  }

  if (newPassword.value !== newPasswordRepeat.value) {
    passwordError.value = 'Пароли не совпадают'
    return false
  }

  passwordError.value = ''
  return true
}

function runClientEvent(eventName: string, ...args: unknown[]) {
  isLocalPending.value = true

  try {
    callClientEvent(eventName, ...args)
  } catch {
    if (step.value === 'email') {
      error.value = 'Не удалось отправить запрос. Попробуйте еще раз'
    } else if (step.value === 'code') {
      codeError.value = 'Не удалось проверить код. Попробуйте еще раз'
    } else {
      passwordError.value = 'Не удалось сохранить пароль. Попробуйте еще раз'
    }
  } finally {
    isLocalPending.value = false
  }
}

function submitRecovery() {
  if (isPending.value || !validateEmail()) {
    return
  }

  runClientEvent('auth:tryRecover', identity.value)
  setStep('code')
}

function handleCodeInput(index: number) {
  code.value[index] = code.value[index].replace(/\D/g, '').slice(0, 1)
  clearStepError('code')

  if (code.value[index] && index < CODE_LENGTH - 1) {
    focusCodeInput(index + 1)
  }
}

function handleCodeBackspace(index: number) {
  if (!code.value[index] && index > 0) {
    focusCodeInput(index - 1)
  }
}

function handleCodePaste(event: ClipboardEvent) {
  const pastedCode = event.clipboardData
    ?.getData('text')
    .replace(/\D/g, '')
    .slice(0, CODE_LENGTH)

  if (!pastedCode) {
    return
  }

  pastedCode.split('').forEach((digit, index) => {
    code.value[index] = digit
  })

  focusCodeInput(Math.min(pastedCode.length, CODE_LENGTH) - 1)
}

function goToEmailStep() {
  if (isPending.value) {
    return
  }

  setStep('email')
  clearStepError('code')
}

function submitCode() {
  if (isPending.value || !validateCode()) {
    return
  }

  runClientEvent('auth:confirmRecoverCode', identity.value, codeValue.value)
  setStep('password')
}

function submitNewPassword() {
  if (isPending.value || !validatePassword()) {
    return
  }

  runClientEvent('auth:setRecoverPassword', identity.value, codeValue.value, newPassword.value)
}

watch(
  () => props.payload,
  (payload) => {
    if (!payload) {
      return
    }

    if (payload.email != null) {
      identity.value = payload.email
    }

    if (payload.step) {
      setStep(payload.step)
    }

    error.value = payload.emailError ?? (step.value === 'email' ? payload.error ?? '' : error.value)
    codeError.value = payload.codeError ?? (step.value === 'code' ? payload.error ?? '' : codeError.value)
    passwordError.value = payload.passwordError ?? (step.value === 'password' ? payload.error ?? '' : passwordError.value)
  },
  { immediate: true },
)
</script>

<style lang="scss" scoped>
.recovery-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  padding: px-to-vh(24);
  box-sizing: border-box;
}

.recovery-card {
  width: 100%;
  max-width: px-to-vh(541);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: px-to-vh(32) px-to-vh(33);
  border-radius: px-to-vh(37);
  background: rgba(9, 9, 9, 0.9);
  box-sizing: border-box;
}

.recovery-card__head {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: px-to-vh(14);
}

.recovery-card__logo {
  display: block;
  max-width: 100%;
  height: auto;
}

.recovery-card__title {
  margin: 0;
  color: #ffffff;
  font-size: px-to-vh(24);
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}

.recovery-card__subtitle {
  margin: 0 0 px-to-vh(20);
  color: #cccccc;
  text-align: center;
  font-size: px-to-vh(20);
  line-height: 1.4;
}

.recovery-form,
.recovery-code {
  width: 100%;
}

.recovery-form {
  display: flex;
  flex-direction: column;
}

.recovery-form--password {
  gap: px-to-vh(12);
}

.recovery-form__field {
  --recovery-input-height: #{px-to-vh(82)};

  position: relative;
  display: flex;
  flex-direction: column;
}

.recovery-form__icon {
  position: absolute;
  top: calc(var(--recovery-input-height) / 2);
  left: px-to-vh(26);
  width: px-to-vh(29);
  height: px-to-vh(29);
  object-fit: contain;
  pointer-events: none;
  transform: translateY(-50%);
}

.recovery-form__icon--key {
  left: px-to-vh(18);
  width: px-to-vh(42);
  height: px-to-vh(42);
}

.recovery-form__input {
  width: 100%;
  height: var(--recovery-input-height);
  padding: 0 px-to-vh(28) 0 px-to-vh(76);
  border: none;
  border-radius: px-to-vh(13);
  outline: none;
  background: #000000;
  color: #ffffff;
  font-size: px-to-vh(25);
  font-weight: 500;
  box-sizing: border-box;
}

.recovery-form__input::placeholder {
  color: rgba(255, 255, 255, 0.72);
}

.recovery-form__input:focus,
.recovery-code__input:focus {
  box-shadow: 0 0 0 px-to-vh(1) rgba(255, 255, 255, 0.16);
}

.recovery-form__input:disabled,
.recovery-code__input:disabled {
  cursor: default;
  opacity: 0.72;
}

.recovery-form__error {
  margin-top: px-to-vh(6);
  padding-left: px-to-vh(2);
  color: #ff7b7b;
  font-size: px-to-vh(13);
  line-height: 1.35;
}

.recovery-form__error--code,
.recovery-form__error--password {
  display: block;
  padding-left: 0;
  text-align: center;
}

.recovery-card__actions {
  display: flex;
  width: 100%;
  gap: px-to-vh(8);
  margin-top: px-to-vh(16);
}

.recovery-card__actions--code {
  width: px-to-vh(270);
  margin: px-to-vh(20) auto 0;
}

.recovery-card__button {
  width: 100%;
  min-height: px-to-vh(58);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: px-to-vh(16) px-to-vh(20);
  border: none;
  border-radius: px-to-vh(15);
  background: #000000;
  color: #ffffff;
  cursor: pointer;
  font-size: px-to-vh(16);
  font-weight: 700;
  box-sizing: border-box;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.recovery-card__button--back {
  flex: 0 0 px-to-vh(58);
  padding: 0;
  font-size: px-to-vh(38);
}

.recovery-card__button--continue {
  flex: 1;
}

.recovery-card__button--password {
  width: px-to-vh(238);
  align-self: center;
  margin-top: px-to-vh(8);
}

.recovery-card__button:hover,
.recovery-card__link:hover {
  opacity: 0.95;
}

.recovery-card__button:disabled,
.recovery-card__link:disabled {
  cursor: default;
  opacity: 0.55;
  transform: none;
}

.recovery-card__button:active {
  transform: translateY(px-to-vh(1));
}

.recovery-card__link {
  align-self: center;
  margin-top: px-to-vh(2);
  padding: 0;
  border: none;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
  font-size: px-to-vh(16);
  font-weight: 500;
}

.recovery-card__link span {
  text-decoration: underline;
  text-underline-offset: px-to-vh(3);
}

.recovery-code__fields {
  display: flex;
  justify-content: center;
  gap: px-to-vh(8);
}

.recovery-code__input {
  width: px-to-vh(60);
  height: px-to-vh(60);
  border: none;
  border-radius: px-to-vh(12);
  outline: none;
  background: #000000;
  color: #ffffff;
  font-size: px-to-vh(24);
  font-weight: 700;
  text-align: center;
  box-sizing: border-box;
}

@media (max-width: px-to-vh(640)) {
  .recovery-page {
    padding: px-to-vh(16);
  }

  .recovery-card {
    padding: px-to-vh(24) px-to-vh(20);
    border-radius: px-to-vh(24);
  }

  .recovery-card__subtitle {
    font-size: px-to-vh(16);
  }

  .recovery-card__actions {
    flex-direction: column;
  }

  .recovery-card__actions--code,
  .recovery-card__button--password {
    width: 100%;
  }
}
</style>
