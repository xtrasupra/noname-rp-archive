<template>
  <AccountRecovery
    v-if="isRecoveryMode"
    :payload="payload?.recovery"
    @back="setMode('login')"
  />

  <div v-else class="auth-page">
    <div class="auth-card">
      <div class="auth-card__head">
        <img class="auth-card__logo" src="/tw.png" alt="Twinkle RP">

        <h1 class="auth-card__title">{{ title }}</h1>

        <p class="auth-card__subtitle">
          {{ subtitle }}
        </p>
      </div>

      <form class="auth-form" @submit.prevent="handleSubmit">
        <div class="auth-form__fields">
          <label class="auth-form__field">
            <img class="auth-form__icon" src="/icon-chel.png" alt="Логин">
            <input
              v-model.trim="form.login"
              class="auth-form__input"
              type="text"
              :placeholder="isLoginMode ? 'Введите логин' : 'Придумайте логин'"
            >
            <span v-if="shouldShowErrors && errors.login" class="auth-form__error">
              {{ errors.login }}
            </span>
          </label>

          <label v-if="isRegisterMode" class="auth-form__field">
            <img class="auth-form__icon" src="/gmail.png" alt="Почта">
            <input
              v-model.trim="form.email"
              class="auth-form__input"
              type="email"
              placeholder="Введите вашу почту"
            >
            <span v-if="shouldShowErrors && errors.email" class="auth-form__error">
              {{ errors.email }}
            </span>
          </label>

          <label class="auth-form__field">
            <img class="auth-form__icon" src="/password.png" alt="Пароль">
            <input
              v-model="form.password"
              class="auth-form__input"
              type="password"
              :placeholder="isLoginMode ? 'Введите пароль' : 'Придумайте пароль'"
            >
            <span v-if="shouldShowErrors && errors.password" class="auth-form__error">
              {{ errors.password }}
            </span>
          </label>

          <label v-if="isRegisterMode" class="auth-form__field">
            <img class="auth-form__icon" src="/password.png" alt="Повтор пароля">
            <input
              v-model="form.confirmPassword"
              class="auth-form__input"
              type="password"
              placeholder="Повторите пароль"
            >
            <span v-if="shouldShowErrors && errors.confirmPassword" class="auth-form__error">
              {{ errors.confirmPassword }}
            </span>
          </label>

          <label v-if="isRegisterMode" class="auth-form__field">
            <img class="auth-form__icon" src="/password.png" alt="Промокод">
            <input
              v-model.trim="form.promocode"
              class="auth-form__input"
              type="text"
              placeholder="Промокод"
            >
          </label>
        </div>

        <div class="auth-form__options">
          <label v-if="isLoginMode" class="auth-checkbox">
            <input
              v-model="form.rememberMe"
              class="auth-checkbox__input"
              type="checkbox"
            >
            <span class="auth-checkbox__box"></span>
            <span class="auth-checkbox__text">
              Запомнить мои данные на этом устройстве
            </span>
          </label>

          <template v-else>
            <label class="auth-checkbox auth-checkbox--top">
              <input
                v-model="form.acceptPersonalData"
                class="auth-checkbox__input"
                type="checkbox"
              >
              <span class="auth-checkbox__box"></span>
              <span class="auth-checkbox__text auth-checkbox__text--multiline">
                Даю согласие на обработку персональных данных.
              </span>
            </label>
            <span v-if="shouldShowErrors && errors.acceptPersonalData" class="auth-form__error auth-form__error--checkbox">
              {{ errors.acceptPersonalData }}
            </span>

            <label class="auth-checkbox">
              <input
                v-model="form.acceptPrivacyPolicy"
                class="auth-checkbox__input"
                type="checkbox"
              >
              <span class="auth-checkbox__box"></span>
              <span class="auth-checkbox__text">
                Я соглашаюсь с политикой конфиденциальности
              </span>
            </label>
            <span v-if="shouldShowErrors && errors.acceptPrivacyPolicy" class="auth-form__error auth-form__error--checkbox">
              {{ errors.acceptPrivacyPolicy }}
            </span>
          </template>
        </div>

        <div class="auth-card__actions">
          <button
            type="button"
            class="auth-card__button auth-card__button--secondary"
            @click="toggleMode"
          >
            {{ isLoginMode ? 'Нету аккаунта?' : 'Уже есть аккаунт?' }}
          </button>

          <button
            type="submit"
            class="auth-card__button auth-card__button--primary"
          >
            {{ isLoginMode ? 'Войти' : 'Зарегистрироваться' }}
          </button>
        </div>
      </form>

      <div v-if="isLoginMode" class="auth-card__recovery">
        <span class="auth-card__recovery-title">Забыли пароль?</span>
        <button class="auth-card__recovery-link" type="button" @click="setMode('recovery')">
          Восстановить
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

import AccountRecovery from './AccountRecovery.vue'

const props = defineProps<{
  payload?: InterfacePayloadMap['auth']
}>()

type AuthMode = 'login' | 'register' | 'recovery'
const submitAttempted = reactive({
  login: false,
  register: false,
})
const mode = ref<AuthMode>('login')
const isLoginMode = computed(() => mode.value === 'login')
const isRegisterMode = computed(() => mode.value === 'register')
const isRecoveryMode = computed(() => mode.value === 'recovery')
const shouldShowErrors = computed(() => (isLoginMode.value ? submitAttempted.login : submitAttempted.register))
const title = computed(() => {
  if (isRecoveryMode.value) {
    return 'Восстановление аккаунта'
  }

  return isLoginMode.value ? 'Вход в аккаунт' : 'Регистрация'
})
const subtitle = computed(() => {
  if (isRecoveryMode.value) {
    return 'Введите логин или почту, чтобы запросить восстановление доступа.'
  }

  return isLoginMode.value
    ? 'Добро пожаловать на Twinkle RP. Перед началом войдите в аккаунт.'
    : 'Добро пожаловать на Twinkle RP. Перед началом создайте аккаунт.'
})

const createInitialForm = () => ({
  acceptPersonalData: false,
  acceptPrivacyPolicy: false,
  confirmPassword: '',
  email: '',
  login: '',
  password: '',
  promocode: '',
  rememberMe: false,
})

const form = reactive(createInitialForm())
const errors = reactive({
  acceptPersonalData: '',
  acceptPrivacyPolicy: '',
  confirmPassword: '',
  email: '',
  login: '',
  password: '',
})

const loginSchema = z.object({
  login: z.string().min(3, 'Логин должен содержать минимум 3 символа').max(32, 'Логин должен содержать не более 32 символов'),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов').max(64, 'Пароль должен содержать не более 64 символов'),
  rememberMe: z.boolean().optional(),
})
const registerSchema = z
  .object({
    acceptPersonalData: z.literal(true, { error: 'Необходимо дать согласие на обработку данных' }),
    acceptPrivacyPolicy: z.literal(true, { error: 'Необходимо согласиться с политикой конфиденциальности' }),
    confirmPassword: z.string().min(1, 'Повторите пароль'),
    email: z.string().min(1, 'Введите email').email('Введите корректный email'),
    login: z.string().min(3, 'Логин должен содержать минимум 3 символа').max(32, 'Логин должен содержать не более 32 символов'),
    password: z.string().min(6, 'Пароль должен содержать минимум 6 символов').max(64, 'Пароль должен содержать не более 64 символов'),
    promocode: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  })

function clearErrors() {
  Object.keys(errors).forEach((key) => {
    errors[key as keyof typeof errors] = ''
  })
}

function mapZodErrors(zodError: z.ZodError) {
  clearErrors()

  const fieldErrors = zodError.flatten().fieldErrors as Record<string, string[] | undefined>

  Object.keys(errors).forEach((key) => {
    const message = fieldErrors[key]?.[0]

    if (message) {
      errors[key as keyof typeof errors] = message
    }
  })
}

function resetForm() {
  Object.assign(form, createInitialForm())
  clearErrors()
}

function setMode(nextMode: AuthMode) {
  mode.value = nextMode
  resetForm()
}

function toggleMode() {
  setMode(isLoginMode.value ? 'register' : 'login')
}

function getPayload() {
  if (isLoginMode.value) {
    return {
      login: form.login,
      password: form.password,
      rememberMe: form.rememberMe,
    }
  }

  return {
    acceptPersonalData: form.acceptPersonalData,
    acceptPrivacyPolicy: form.acceptPrivacyPolicy,
    confirmPassword: form.confirmPassword,
    email: form.email,
    login: form.login,
    password: form.password,
    promocode: form.promocode || undefined,
  }
}

function validateForm() {
  const result = (isLoginMode.value ? loginSchema : registerSchema).safeParse(getPayload())

  if (!result.success) {
    mapZodErrors(result.error)
    return false
  }

  clearErrors()
  return true
}

function handleSubmit() {
  if (isLoginMode.value) {
    submitAttempted.login = true
  } else {
    submitAttempted.register = true
  }

  if (!validateForm()) {
    return
  }

  if (isLoginMode.value) {
    callClientEvent('auth:tryLogin', form.login, form.password, form.rememberMe)
    return
  }

  callClientEvent('auth:tryRegister', form.login, form.email, form.password, form.promocode || null)
}

watch(
  () => props.payload?.mode,
  (nextMode) => {
    setMode(nextMode ?? 'login')
  },
  { immediate: true },
)
</script>

<style lang="scss" scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  padding: px-to-vh(24);
  box-sizing: border-box;
}

.auth-card {
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

.auth-card__head {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: px-to-vh(14);
}

.auth-card__logo {
  display: block;
  max-width: 100%;
  height: auto;
}

.auth-card__title {
  margin: 0;
  color: #ffffff;
  font-size: px-to-vh(24);
  font-weight: 400;
  line-height: 1.2;
  text-align: center;
}

.auth-card__subtitle {
  margin: 0 0 px-to-vh(20);
  color: #cccccc;
  text-align: center;
  font-size: px-to-vh(20);
  line-height: 1.4;
}

.auth-form {
  width: 100%;
}

.auth-form__fields {
  display: flex;
  flex-direction: column;
  gap: px-to-vh(8);
}

.auth-form__field {
  --auth-input-height: #{px-to-vh(50)};

  position: relative;
  display: flex;
  flex-direction: column;
}

.auth-form__icon {
  position: absolute;
  top: calc(var(--auth-input-height) / 2);
  transform: translateY(-50%);
  left: px-to-vh(20);
  width: px-to-vh(20);
  height: px-to-vh(20);
  object-fit: contain;
  pointer-events: none;
}

.auth-form__input {
  width: 100%;
  height: var(--auth-input-height);
  padding: 0 px-to-vh(16) 0 px-to-vh(55);
  border: none;
  outline: none;
  border-radius: px-to-vh(13);
  background: #000000;
  color: #ffffff;
  font-size: px-to-vh(15);
  font-weight: 500;
  box-sizing: border-box;
}

.auth-form__input::placeholder {
  color: rgba(255, 255, 255, 0.72);
}

.auth-form__input:focus {
  box-shadow: 0 0 0 px-to-vh(1) rgba(255, 255, 255, 0.16);
}

.auth-form__options {
  margin-top: px-to-vh(8);
  display: flex;
  flex-direction: column;
  gap: px-to-vh(8);
}

.auth-form__error {
  margin-top: px-to-vh(6);
  padding-left: px-to-vh(2);
  color: #ff7b7b;
  font-size: px-to-vh(13);
  line-height: 1.35;
}

.auth-form__error--checkbox {
  margin-top: px-to-vh(-2);
  margin-bottom: px-to-vh(2);
}

.auth-checkbox {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: px-to-vh(10);
  color: #ffffff;
  font-size: px-to-vh(16);
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  user-select: none;
}

.auth-checkbox--top {
  margin-top: px-to-vh(4);
}

.auth-checkbox__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.auth-checkbox__box {
  position: relative;
  flex: 0 0 px-to-vh(18);
  width: px-to-vh(18);
  height: px-to-vh(18);
  margin-top: px-to-vh(2);
  border-radius: px-to-vh(5);
  background: #000000;
  border: px-to-vh(1) solid rgba(255, 255, 255, 0.18);
  box-sizing: border-box;
}

.auth-checkbox__input:checked + .auth-checkbox__box::after {
  content: '';
  position: absolute;
  left: px-to-vh(5);
  top: px-to-vh(1);
  width: px-to-vh(5);
  height: px-to-vh(9);
  border-right: px-to-vh(2) solid #ffffff;
  border-bottom: px-to-vh(2) solid #ffffff;
  transform: rotate(45deg);
}

.auth-checkbox__text {
  color: #ffffff;
  font-size: px-to-vh(16);
  font-weight: 500;
}

.auth-checkbox__text--multiline {
  line-height: 1.45;
}

.auth-card__actions {
  display: flex;
  width: 100%;
  gap: px-to-vh(8);
  margin-top: px-to-vh(16);
}

.auth-card__button {
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
  box-sizing: border-box;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.auth-card__button:hover {
  opacity: 0.95;
}

.auth-card__button:active {
  transform: translateY(px-to-vh(1));
}

.auth-card__recovery {
  display: flex;
  align-items: center;
  gap: px-to-vh(5);
  margin-top: px-to-vh(27);
  color: #ffffff;
  font-size: 13px;
  line-height: 1.2;
  flex-wrap: wrap;
  justify-content: center;
}

.auth-card__recovery-title,
.auth-card__recovery-link {
  color: #ffffff;
  font-size: 13px;
}

.auth-card__recovery-link {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-decoration: underline;
}

@media (max-width: px-to-vh(640)) {
  .auth-page {
    padding: px-to-vh(16);
  }

  .auth-card {
    padding: px-to-vh(24) px-to-vh(20);
    border-radius: px-to-vh(24);
  }

  .auth-card__subtitle {
    font-size: px-to-vh(16);
  }

  .auth-checkbox__text {
    font-size: px-to-vh(14);
  }

  .auth-card__actions {
    flex-direction: column;
  }

  .auth-card__recovery,
  .auth-card__recovery-title,
  .auth-card__recovery-link {
    font-size: 13px;
  }
}
</style>
