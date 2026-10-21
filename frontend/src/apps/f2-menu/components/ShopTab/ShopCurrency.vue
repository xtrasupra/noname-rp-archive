<template>
  <section class="shop-currency">
    <h1 class="f2-menu__title">Валюта</h1>

    <section class="shop-currency-overview">
      <article>
        <span>Баланс Coins</span>
        <strong>{{ accountDonate.toLocaleString('ru-RU') }}</strong>
        <small>Доступно для кейсов и покупок</small>
      </article>
      <article>
        <span>Игровой курс</span>
        <strong>1 Coin = ${{ exchangeRate.toLocaleString('ru-RU') }}</strong>
        <small>Обновляется автоматически</small>
      </article>
      <article>
        <span>Бонус сегодня</span>
        <strong>x2</strong>
        <small>Активен для пополнений</small>
      </article>
    </section>

    <div class="shop-currency__layout">
      <section class="shop-currency-exchange">
        <header class="shop-currency-section-header">
          <span>
            <BaseIcon :icon="Repeat2" size="sm" :stroke-width="2.35" />
          </span>
          <div>
            <h2>Обмен валюты</h2>
            <p>$ в игровую валюту</p>
          </div>
        </header>

        <div class="shop-currency-exchange__main">
          <div class="shop-currency-exchange__rate">
            <span>Курс обмена</span>
            <strong>1 Coin = ${{ exchangeRate.toLocaleString('ru-RU') }} игровой валюты</strong>
          </div>

          <div class="shop-currency-exchange__form">
            <label class="shop-currency-field">
              <span>Отдаете $</span>
              <input
                v-model="exchangeAmount"
                inputmode="numeric"
                type="text"
                placeholder="0"
                @input="sanitizeExchangeAmount"
              >
            </label>

            <div class="shop-currency-exchange__result">
              <span>Получите</span>
              <strong>{{ receivedGameCurrency.toLocaleString('ru-RU') }}</strong>
              <small>игровой валюты</small>
            </div>
          </div>

          <div class="shop-currency-exchange__presets">
            <button
              v-for="preset in exchangePresets"
              :key="preset"
              type="button"
              :class="{ 'shop-currency-exchange__preset--active': exchangeValue === preset }"
              @click="selectExchangePreset(preset)"
            >
              {{ preset.toLocaleString('ru-RU') }}
            </button>
          </div>

          <button
            class="shop-currency-exchange__submit"
            type="button"
            :disabled="exchangeValue <= 0"
            @click="exchangeCurrency"
          >
            Обменять
          </button>
        </div>
      </section>

      <section class="shop-currency-usage">
        <header class="shop-currency-section-header">
          <span>
            <BaseIcon :icon="Package" size="sm" :stroke-width="2.35" />
          </span>
          <div>
            <h2>На что можно потратить</h2>
            <p>Основные сценарии использования валюты</p>
          </div>
        </header>

        <div class="shop-currency-usage__grid">
          <article v-for="usage in currencyUsage" :key="usage.title">
            <BaseIcon :icon="usage.icon" size="sm" :stroke-width="2.35" />
            <div>
              <strong>{{ usage.title }}</strong>
              <small>{{ usage.description }}</small>
            </div>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, type FunctionalComponent } from 'vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

import { BaseIcon, BriefcaseBusiness, Dice5, Package, Repeat2, Shirt } from '@/shared/icons'
import { useNotificationStore } from '@/stores/notification.store'

type CurrencyUsage = {
  description: string
  icon: FunctionalComponent
  title: string
}

const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()

const notificationStore = useNotificationStore()
const shopPayload = computed(() => (props.payload as any)?.shop ?? {})
const accountDonate = computed(() => Number((props.payload as any)?.donate ?? shopPayload.value.donate ?? (props.payload as any)?.account?.donate ?? 0))
const exchangeRate = computed(() => Number(shopPayload.value.exchange?.coinToCash ?? 120))

const exchangePresets = [10, 25, 50, 100, 250, 500]
const exchangeAmount = ref('')

const currencyUsage = computed<CurrencyUsage[]>(() => [
  { title: 'Открытие кейсов', description: 'Прокрутки рулетки и Premium Club', icon: Dice5 },
  { title: 'Персонаж', description: 'Одежда, услуги и снаряжение', icon: Shirt },
  { title: 'Стартовые наборы', description: 'Комплекты для быстрого старта', icon: BriefcaseBusiness },
  { title: 'Предметы', description: 'Купоны, расходники и инвентарь', icon: Package },
  { title: 'Донат аккаунта', description: `${accountDonate.value.toLocaleString('ru-RU')} Coins доступно сейчас`, icon: Repeat2 },
])

const exchangeValue = computed(() => Number(exchangeAmount.value.replace(/\D/g, '')) || 0)
const receivedGameCurrency = computed(() => exchangeValue.value * exchangeRate.value)

function sanitizeExchangeAmount() {
  exchangeAmount.value = exchangeAmount.value.replace(/\D/g, '')
}

function selectExchangePreset(value: number) {
  exchangeAmount.value = String(value)
}

function exchangeCurrency() {
  if (exchangeValue.value <= 0) {
    return
  }

  notificationStore.notify(`Обмен: $${exchangeValue.value.toLocaleString('ru-RU')} -> ${receivedGameCurrency.value.toLocaleString('ru-RU')}`, {
    title: 'Обмен валюты',
    variant: 'success',
  })
}
</script>

<style scoped>
.shop-currency {
  position: relative;
  min-height: 80vh;
  padding-bottom: 2vh;
}

.shop-currency-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1vh;
  margin-top: 3.35vh;
}

.shop-currency-overview,
.shop-currency-exchange,
.shop-currency-usage,
.shop-currency-field input,
.shop-currency-exchange__rate,
.shop-currency-exchange__result {
  border: 1px solid rgb(255 255 255 / 6%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 48%),
    rgb(7 7 8 / 88%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
}

.shop-currency-overview {
  border-radius: 0.9vh;
  padding: 1vh;
}

.shop-currency-overview article {
  min-width: 0;
  min-height: 7.2vh;
  display: grid;
  align-content: center;
  gap: 0.35vh;
  padding: 1vh 1.15vh;
  border-radius: 0.76vh;
  background: rgb(255 255 255 / 3%);
}

.shop-currency-overview span {
  color: rgb(255 255 255 / 44%);
  font-size: 0.95vh;
  font-weight: 800;
  line-height: 1;
}

.shop-currency-overview strong {
  color: #ffffff;
  font-size: 1.55vh;
  font-weight: 950;
  line-height: 1;
}

.shop-currency-overview small {
  min-width: 0;
  overflow: hidden;
  color: rgb(255 255 255 / 42%);
  font-size: 0.88vh;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-currency__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 1.35vh;
  margin-top: 1.25vh;
}

.shop-currency-exchange,
.shop-currency-usage {
  min-width: 0;
  padding: 1.25vh;
  border-radius: 0.9vh;
}

.shop-currency-exchange {
  display: grid;
  align-content: start;
  gap: 1.2vh;
}

.shop-currency-section-header {
  display: flex;
  align-items: center;
  gap: 0.9vh;
  margin-bottom: 1.2vh;
}

.shop-currency-section-header > span {
  width: 3vh;
  height: 3vh;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d454f459;
  border-radius: 0.68vh;
  background: #d454f426;
  color: #d454f4;
}

.shop-currency-section-header h2,
.shop-currency-section-header p {
  margin: 0;
}

.shop-currency-section-header h2 {
  color: #ffffff;
  font-size: 1.42vh;
  font-weight: 950;
  line-height: 1.1;
}

.shop-currency-section-header p {
  margin-top: 0.34vh;
  color: rgb(255 255 255 / 46%);
  font-size: 1vh;
  font-weight: 700;
  line-height: 1.25;
}

.shop-currency-exchange__main {
  display: grid;
  gap: 1vh;
}

.shop-currency-exchange__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr);
  gap: 1vh;
}

.shop-currency-exchange__rate,
.shop-currency-exchange__result {
  display: grid;
  gap: 0.38vh;
  padding: 1vh;
  border-radius: 0.68vh;
}

.shop-currency-exchange__rate span,
.shop-currency-exchange__result span,
.shop-currency-field span {
  color: rgb(255 255 255 / 44%);
  font-size: 0.96vh;
  font-weight: 800;
}

.shop-currency-exchange__rate strong,
.shop-currency-exchange__result strong {
  color: #ffffff;
  font-size: 1.26vh;
  font-weight: 950;
  line-height: 1;
}

.shop-currency-exchange__result strong {
  color: #d454f4;
  font-size: 1.95vh;
}

.shop-currency-exchange__result small {
  color: rgb(255 255 255 / 42%);
  font-size: 0.94vh;
  font-weight: 700;
}

.shop-currency-field {
  display: grid;
  gap: 0.65vh;
}

.shop-currency-field input {
  min-height: 5.4vh;
  padding: 0 1.05vh;
  border-radius: 0.62vh;
  color: #ffffff;
  font: inherit;
  font-size: 1.24vh;
  font-weight: 900;
  outline: none;
}

.shop-currency-field input::placeholder {
  color: rgb(255 255 255 / 32%);
}

.shop-currency-exchange__presets {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.7vh;
}

.shop-currency-exchange__presets button {
  min-height: 3.4vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 0.52vh;
  background: rgb(255 255 255 / 5%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 0.96vh;
  font-weight: 900;
}

.shop-currency-exchange__presets button:hover,
.shop-currency-exchange__preset--active {
  border-color: #d454f459 !important;
  background: #d454f426 !important;
}

.shop-currency-exchange__submit {
  min-height: 4.35vh;
  border: 1px solid #d454f459;
  border-radius: 0.68vh;
  background: #d454f4;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 1.04vh;
  font-weight: 950;
  text-shadow: 0 0.12vh 0.35vh rgb(0 0 0 / 24%);
}

.shop-currency-exchange__submit:disabled {
  cursor: default;
  filter: grayscale(1);
  opacity: 0.48;
}

.shop-currency-usage__grid {
  display: grid;
  gap: 0.85vh;
}

.shop-currency-usage__grid article {
  min-width: 0;
  min-height: 7.8vh;
  display: grid;
  grid-template-columns: 3.2vh minmax(0, 1fr);
  align-items: center;
  gap: 0.85vh;
  padding: 0.95vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.72vh;
  background: rgb(255 255 255 / 3%);
}

.shop-currency-usage__grid > article > .twinkle-icon {
  color: #d454f4;
}

.shop-currency-usage__grid div {
  min-width: 0;
  display: grid;
  gap: 0.28vh;
}

.shop-currency-usage__grid strong,
.shop-currency-usage__grid small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-currency-usage__grid strong {
  color: #ffffff;
  font-size: 1vh;
  font-weight: 950;
}

.shop-currency-usage__grid small {
  color: rgb(255 255 255 / 44%);
  font-size: 0.86vh;
  font-weight: 700;
}

.shop-currency :is(p, small, [class*="__meta"], [class*="__description"], [class*="__caption"]) {
  line-height: 1.35;
}
</style>
