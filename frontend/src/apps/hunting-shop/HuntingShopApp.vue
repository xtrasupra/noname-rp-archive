<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

type HuntingItem = NonNullable<InterfacePayloadMap['huntingShop']['items']>[number]

const props = defineProps<{
  payload?: InterfacePayloadMap['huntingShop']
}>()

const cart = reactive<Record<string, number>>({})
const checkoutLocked = ref(false)
let checkoutUnlockTimer: number | null = null
const items = computed<HuntingItem[]>(() => props.payload?.items ?? [])
const cash = computed(() => Math.max(0, Number(props.payload?.cash ?? 0)))
const purchaseRevision = computed(() => props.payload?.purchaseRevision)
const cartLines = computed(() => items.value
  .filter((item) => getQuantity(item.id) > 0)
  .map((item) => ({ item, quantity: getQuantity(item.id) })))
const cartTotal = computed(() => cartLines.value.reduce(
  (total, line) => total + Number(line.item.price || 0) * line.quantity,
  0,
))

const icons: Record<string, string> = {
  rifle: '⌁',
  ammo: '•••',
  knife: '╱',
  rope: '∞',
  bag: '▱',
  flashlight: '◐',
  water: '◌',
  food: '●',
  tent: '△',
  camo: '◈',
  stimulant: '+',
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0))
}

function getQuantity(itemId: string) {
  return Math.min(10, Math.max(0, Math.floor(Number(cart[itemId] || 0))))
}

function setQuantity(itemId: string, value: number) {
  if (checkoutLocked.value) return
  const next = Math.min(10, Math.max(0, Math.floor(Number(value || 0))))
  if (next <= 0) delete cart[itemId]
  else cart[itemId] = next
}

function addToCart(item: HuntingItem) {
  if (checkoutLocked.value) return
  setQuantity(item.id, Math.max(1, getQuantity(item.id) + 1))
}

function checkout() {
  if (checkoutLocked.value || cartLines.value.length === 0 || cash.value < cartTotal.value) return
  checkoutLocked.value = true
  callClientEvent('huntingShop:buy', JSON.stringify({
    items: cartLines.value.map(({ item, quantity }) => ({ itemId: item.id, quantity })),
  }))
  checkoutUnlockTimer = window.setTimeout(() => {
    checkoutLocked.value = false
    checkoutUnlockTimer = null
  }, 30_000)
}

function clearCart() {
  if (checkoutLocked.value) return
  resetCart()
}

function resetCart() {
  Object.keys(cart).forEach((key) => delete cart[key])
}

function close() {
  callClientEvent('huntingShop:close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

watch(purchaseRevision, (next, previous) => {
  if (next === undefined || next === previous) return
  if (checkoutUnlockTimer !== null) window.clearTimeout(checkoutUnlockTimer)
  checkoutUnlockTimer = null
  if (props.payload?.purchaseSucceeded) resetCart()
  checkoutLocked.value = false
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (checkoutUnlockTimer !== null) window.clearTimeout(checkoutUnlockTimer)
})

</script>

<template>
  <main class="hunting-shop">
    <div class="hunting-shop__noise" aria-hidden="true"></div>

    <section class="hunting-shop__panel">
      <header class="hunting-shop__header">
        <div class="hunting-shop__identity">
          <span class="hunting-shop__eyebrow">Охотничье снабжение</span>
          <h1>{{ props.payload?.title || 'Магазин охотника' }}</h1>
          <p>{{ props.payload?.seller || 'Jeremy Meadows' }} · всё необходимое для выезда</p>
        </div>

        <div class="hunting-shop__header-actions">
          <div class="hunting-shop__cash">
            <span>Наличные</span>
            <strong>${{ formatMoney(cash) }}</strong>
          </div>
          <button class="hunting-shop__close" type="button" aria-label="Закрыть магазин" @click="close">
            <span>ESC</span>
            Закрыть
          </button>
        </div>
      </header>

      <div class="hunting-shop__rule"></div>

      <div class="hunting-shop__content">
        <section class="hunting-shop__catalog" aria-label="Товары охотника">
          <article v-for="item in items" :key="item.id" class="hunting-card">
            <div class="hunting-card__visual" :class="`hunting-card__visual--${item.icon || 'bag'}`">
              <span>{{ icons[item.icon || 'bag'] || '◆' }}</span>
              <small v-if="item.amount > 1">×{{ item.amount }}</small>
            </div>

            <div class="hunting-card__body">
              <div>
                <span class="hunting-card__category">Снаряжение</span>
                <h2>{{ item.name }}</h2>
                <p>{{ item.description }}</p>
              </div>

              <footer>
                <div class="hunting-card__purchase">
                  <strong>{{ item.price > 0 ? `$${formatMoney(item.price)}` : 'Бесплатно' }}</strong>
                  <span v-if="item.amount > 1">упаковка: {{ item.amount }} шт.</span>
                </div>
                <button type="button" :disabled="checkoutLocked || getQuantity(item.id) >= 10" @click="addToCart(item)">
                  {{ getQuantity(item.id) > 0 ? `В корзине: ${getQuantity(item.id)}` : 'В корзину' }}
                </button>
              </footer>
            </div>
          </article>
        </section>

        <aside class="shop-cart" aria-label="Корзина">
          <header>
            <div>
              <span class="hunting-shop__eyebrow">Ваш заказ</span>
              <h2>Корзина</h2>
            </div>
            <button type="button" :disabled="cartLines.length === 0 || checkoutLocked" @click="clearCart">Очистить</button>
          </header>
          <div v-if="cartLines.length === 0" class="shop-cart__empty">Добавьте товары из каталога</div>
          <div v-else class="shop-cart__lines">
            <article v-for="line in cartLines" :key="line.item.id" class="shop-cart__line">
              <div>
                <strong>{{ line.item.name }}</strong>
                <span>${{ formatMoney(line.item.price * line.quantity) }} · {{ line.item.amount * line.quantity }} шт.</span>
              </div>
              <div class="quantity-control">
                <button type="button" :disabled="checkoutLocked" @click="setQuantity(line.item.id, line.quantity - 1)">−</button>
                <span>{{ line.quantity }}</span>
                <button type="button" :disabled="checkoutLocked || line.quantity >= 10" @click="setQuantity(line.item.id, line.quantity + 1)">+</button>
              </div>
            </article>
          </div>
          <footer>
            <div><span>Итого</span><strong>${{ formatMoney(cartTotal) }}</strong></div>
            <button
              type="button"
              :class="{ 'is-pending': checkoutLocked }"
              :disabled="checkoutLocked || cartLines.length === 0 || cash < cartTotal"
              :aria-busy="checkoutLocked"
              @click="checkout"
            >
              {{ checkoutLocked ? 'Покупаем…' : cash < cartTotal ? 'Недостаточно средств' : 'Купить всё' }}
            </button>
          </footer>
        </aside>
      </div>

      <footer class="hunting-shop__footer">
        <span>Нож: −5% за успешную разделку. Винтовка: −2% за выстрел.</span>
        <span>Мини-игра: 1+1 расходник. Автоматически: 3+3.</span>
      </footer>
    </section>
  </main>
</template>

<style scoped lang="scss">
.hunting-shop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 5vh 5vw;
  box-sizing: border-box;
  color: #f7f3e8;
  font-family: "SF Pro Display", "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at 16% 12%, rgb(172 115 51 / 22%), transparent 32%),
    radial-gradient(circle at 88% 78%, rgb(62 86 47 / 28%), transparent 36%),
    linear-gradient(135deg, rgb(9 12 9 / 96%), rgb(21 24 17 / 94%));
}

.hunting-shop__noise {
  position: absolute;
  inset: 0;
  opacity: 0.12;
  pointer-events: none;
  background-image: repeating-linear-gradient(115deg, transparent 0 7px, rgb(255 255 255 / 5%) 8px 9px);
  mask-image: linear-gradient(to bottom, #000, transparent 80%);
}

.hunting-shop__panel {
  position: relative;
  width: min(148vh, 92vw);
  max-height: 88vh;
  overflow: auto;
  padding: 3.2vh;
  border: 1px solid rgb(223 186 120 / 22%);
  border-radius: 1.6vh;
  box-sizing: border-box;
  background: linear-gradient(145deg, rgb(25 29 21 / 96%), rgb(13 16 13 / 98%));
  box-shadow: 0 3vh 10vh rgb(0 0 0 / 58%), inset 0 1px rgb(255 255 255 / 5%);
}

.hunting-shop__header,
.hunting-shop__header-actions,
.hunting-card footer,
.hunting-shop__footer {
  display: flex;
  align-items: center;
}

.hunting-shop__header {
  justify-content: space-between;
  gap: 3vh;
}

.hunting-shop__eyebrow,
.hunting-card__category,
.hunting-shop__cash span {
  color: #d2a45d;
  font-size: 1.05vh;
  font-weight: 800;
  letter-spacing: 0.18vh;
  text-transform: uppercase;
}

.hunting-shop__identity h1 {
  margin: 0.35vh 0 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(3.4vh, 4.5vh, 5.4vh);
  font-weight: 600;
  letter-spacing: -0.12vh;
}

.hunting-shop__identity p {
  margin: 0.55vh 0 0;
  color: rgb(247 243 232 / 58%);
  font-size: 1.35vh;
}

.hunting-shop__header-actions {
  gap: 1.2vh;
}

.hunting-shop__cash {
  min-width: 13vh;
  padding: 1.05vh 1.35vh;
  border-radius: 0.8vh;
  background: rgb(255 255 255 / 5%);
}

.hunting-shop__cash span,
.hunting-shop__cash strong {
  display: block;
}

.hunting-shop__cash strong {
  margin-top: 0.25vh;
  color: #f3d397;
  font-size: 1.7vh;
}

.hunting-shop__close {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  gap: 0.7vh;
  padding: 1.15vh 1.3vh;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 0.8vh;
  color: rgb(255 255 255 / 72%);
  background: rgb(255 255 255 / 4%);
  cursor: pointer;
  font: inherit;
  font-size: 1.2vh;
}

.hunting-shop__close span {
  padding: 0.25vh 0.45vh;
  border-radius: 0.35vh;
  color: #d7b16e;
  background: rgb(255 255 255 / 8%);
  font-size: 0.9vh;
  font-weight: 800;
}

.hunting-shop__rule {
  height: 1px;
  margin: 2.4vh 0;
  background: linear-gradient(90deg, #b98a48, rgb(185 138 72 / 10%), transparent);
}

.hunting-shop__content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34vh;
  align-items: start;
  gap: 1.6vh;
}

.hunting-shop__catalog {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.4vh;
}

.shop-cart {
  position: sticky;
  top: 0;
  display: grid;
  gap: 1.2vh;
  padding: 1.5vh;
  border: 1px solid rgb(210 164 93 / 24%);
  border-radius: 1.1vh;
  background: linear-gradient(150deg, rgb(42 48 34 / 92%), rgb(15 18 14 / 98%));
}

.shop-cart > header,
.shop-cart__line,
.shop-cart > footer > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1vh;
}

.shop-cart h2 {
  margin: 0.25vh 0 0;
  font: 600 2.3vh Georgia, serif;
}

.shop-cart button {
  border: 1px solid rgb(210 164 93 / 35%);
  border-radius: 0.6vh;
  color: #ead3a6;
  background: rgb(255 255 255 / 5%);
  cursor: pointer;
  font: inherit;
}

.shop-cart button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.shop-cart button:not(:disabled) {
  transition: filter 140ms ease, transform 140ms ease, box-shadow 140ms ease;
}

.shop-cart button:not(:disabled):hover {
  filter: brightness(1.12);
  box-shadow: 0 0.6vh 1.6vh rgb(210 164 93 / 18%);
  transform: translateY(-0.1vh);
}

.shop-cart button:not(:disabled):active {
  filter: brightness(0.94);
  transform: translateY(0.1vh) scale(0.985);
}

.shop-cart button:focus-visible,
.hunting-card footer button:focus-visible {
  outline: 0.2vh solid #f3d397;
  outline-offset: 0.2vh;
}

.shop-cart > header > button {
  padding: 0.65vh 0.85vh;
  font-size: 1.05vh;
}

.shop-cart__empty {
  display: grid;
  min-height: 12vh;
  place-items: center;
  border: 1px dashed rgb(255 255 255 / 10%);
  border-radius: 0.8vh;
  color: rgb(247 243 232 / 40%);
  font-size: 1.15vh;
}

.shop-cart__lines {
  display: grid;
  gap: 0.8vh;
  max-height: 47vh;
  overflow: auto;
}

.shop-cart__line {
  padding: 1vh;
  border-radius: 0.75vh;
  background: rgb(255 255 255 / 4%);
}

.shop-cart__line > div:first-child {
  display: grid;
  gap: 0.25vh;
}

.shop-cart__line strong {
  font-size: 1.15vh;
}

.shop-cart__line > div:first-child span {
  color: rgb(247 243 232 / 45%);
  font-size: 0.95vh;
}

.shop-cart .quantity-control button {
  width: 2.6vh;
  min-width: 0;
  height: 2.8vh;
  padding: 0;
  border: 0;
  color: #f3d397;
  background: transparent;
}

.shop-cart > footer {
  display: grid;
  gap: 1vh;
  padding-top: 1.2vh;
  border-top: 1px solid rgb(255 255 255 / 8%);
}

.shop-cart > footer span {
  color: rgb(247 243 232 / 55%);
  font-size: 1.05vh;
}

.shop-cart > footer strong {
  color: #f3d397;
  font-size: 1.9vh;
}

.shop-cart > footer > button {
  padding: 1.05vh;
  color: #17130d;
  background: linear-gradient(180deg, #e8c47e, #b98848);
  font-size: 1.2vh;
  font-weight: 850;
}

.shop-cart > footer > button.is-pending {
  color: #ead3a6;
  background: linear-gradient(180deg, #594629, #3b3021);
}

.hunting-card {
  min-height: 27vh;
  display: grid;
  grid-template-rows: 11vh 1fr;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 1.1vh;
  background: rgb(255 255 255 / 3.5%);
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.hunting-card:hover {
  border-color: rgb(210 164 93 / 34%);
  background: rgb(210 164 93 / 6%);
  transform: translateY(-0.3vh);
}

.hunting-card__visual {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #e8c482;
  background:
    radial-gradient(circle at center, rgb(210 164 93 / 20%), transparent 52%),
    linear-gradient(135deg, rgb(66 78 50 / 34%), rgb(16 20 15 / 20%));
}

.hunting-card__visual::after {
  position: absolute;
  width: 18vh;
  height: 18vh;
  border: 1px solid rgb(235 208 159 / 8%);
  border-radius: 50%;
  content: "";
}

.hunting-card__visual > span {
  position: relative;
  z-index: 1;
  font-family: Georgia, serif;
  font-size: 4.6vh;
  font-weight: 700;
  letter-spacing: -0.5vh;
  text-shadow: 0 1vh 3vh rgb(0 0 0 / 60%);
}

.hunting-card__visual small {
  position: absolute;
  right: 1.1vh;
  bottom: 0.9vh;
  z-index: 2;
  padding: 0.35vh 0.6vh;
  border-radius: 0.45vh;
  color: #f3d397;
  background: rgb(6 8 6 / 70%);
  font-size: 1.05vh;
  font-weight: 800;
}

.hunting-card__body {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1.5vh;
  padding: 1.45vh;
}

.hunting-card h2,
.hunting-card p {
  margin: 0;
}

.hunting-card h2 {
  margin-top: 0.35vh;
  font-size: 1.75vh;
}

.hunting-card p {
  margin-top: 0.55vh;
  color: rgb(247 243 232 / 52%);
  font-size: 1.15vh;
  line-height: 1.4;
}

.hunting-card footer {
  justify-content: space-between;
  gap: 1vh;
}

.hunting-card__purchase {
  display: grid;
  gap: 0.2vh;
}

.hunting-card__purchase span {
  color: rgb(247 243 232 / 48%);
  font-size: 1vh;
}

.quantity-control {
  display: grid;
  grid-template-columns: 2.6vh 2.8vh 2.6vh;
  align-items: center;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 0.55vh;
  background: rgb(255 255 255 / 4%);
}

.quantity-control button {
  min-width: 0;
  height: 2.8vh;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.quantity-control span {
  text-align: center;
  font-size: 1.2vh;
  font-weight: 800;
}

.hunting-card footer strong {
  color: #e9c784;
  font-size: 1.65vh;
}

.hunting-card footer button {
  min-width: 10.5vh;
  padding: 0.8vh 1.1vh;
  border: 1px solid #b78948;
  border-radius: 0.65vh;
  color: #17130d;
  background: linear-gradient(180deg, #e8c47e, #b98848);
  cursor: pointer;
  font: inherit;
  font-size: 1.12vh;
  font-weight: 850;
  transition: filter 140ms ease, transform 140ms ease, box-shadow 140ms ease;
}

.hunting-card footer button:not(:disabled):hover {
  filter: brightness(1.12);
  box-shadow: 0 0.7vh 1.8vh rgb(210 164 93 / 22%);
  transform: translateY(-0.12vh);
}

.hunting-card footer button:not(:disabled):active {
  filter: brightness(0.94);
  transform: translateY(0.1vh) scale(0.985);
}

.hunting-card footer button:disabled {
  border-color: rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 30%);
  background: rgb(255 255 255 / 4%);
  cursor: not-allowed;
}

.hunting-card footer .quantity-control button {
  min-width: 0;
  width: 2.6vh;
  height: 2.8vh;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: #f3d397;
  background: transparent;
}

.hunting-shop__footer {
  justify-content: space-between;
  gap: 2vh;
  margin-top: 2vh;
  color: rgb(247 243 232 / 38%);
  font-size: 1.05vh;
}

@media (max-width: 1100px) {
  .hunting-shop__content {
    grid-template-columns: 1fr;
  }

  .hunting-shop__catalog {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .shop-cart {
    position: static;
  }
}
</style>
