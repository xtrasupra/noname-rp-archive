<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

type FishingItem = NonNullable<InterfacePayloadMap['fishingShop']['items']>[number]

const props = defineProps<{
  payload?: InterfacePayloadMap['fishingShop']
}>()

const activeCategory = ref('')
const guideOpen = ref(false)
const cart = reactive<Record<string, number>>({})
const checkoutLocked = ref(false)
let checkoutUnlockTimer: number | null = null

const categories = computed(() => props.payload?.categories ?? [])
const items = computed<FishingItem[]>(() => props.payload?.items ?? [])
const level = computed(() => Math.max(1, Number(props.payload?.level ?? 1)))
const cash = computed(() => Math.max(0, Number(props.payload?.cash ?? 0)))
const guide = computed(() => props.payload?.guide ?? [])
const purchaseRevision = computed(() => props.payload?.purchaseRevision)
const currentCategory = computed(() => activeCategory.value || categories.value[0]?.id || '')
const filteredItems = computed(() => {
  const categoryId = currentCategory.value
  return categoryId ? items.value.filter((item) => (item.category || 'starter') === categoryId) : items.value
})
const cartLines = computed(() => items.value
  .filter((item) => getQuantity(item.id) > 0)
  .map((item) => ({ item, quantity: getQuantity(item.id) })))
const cartTotal = computed(() => cartLines.value.reduce(
  (total, line) => total + Number(line.item.price || 0) * line.quantity,
  0,
))

const icons: Record<string, string> = {
  rod: '⌁',
  reel: '◎',
  line: '∿',
  hook: '⌙',
  bait: '•',
  spinner: '◇',
  net: '▱',
  cooler: '▣',
  ice: '◆',
  repair: '+',
  sonar: '◌',
  vest: '▰',
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

function addToCart(item: FishingItem) {
  if (item.locked || checkoutLocked.value) return
  setQuantity(item.id, Math.max(1, getQuantity(item.id) + 1))
}

function checkout() {
  if (checkoutLocked.value || cartLines.value.length === 0 || cash.value < cartTotal.value) return
  checkoutLocked.value = true
  callClientEvent('fishingShop:buy', JSON.stringify({
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
  guideOpen.value = false
  callClientEvent('fishingShop:close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (guideOpen.value) {
    guideOpen.value = false
    return
  }
  close()
}

watch(categories, (next) => {
  if (!activeCategory.value && next[0]?.id) activeCategory.value = next[0].id
}, { immediate: true })

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
  <main class="fishing-shop">
    <section class="fishing-shop__panel">
      <header class="shop-header">
        <div>
          <span>Рыболовное снабжение</span>
          <h1>{{ props.payload?.title || 'Магазин рыбака' }}</h1>
          <p>{{ props.payload?.seller || 'Noah Rivers' }} · уровень рыбалки {{ level }}</p>
        </div>

        <div class="shop-header__right">
          <div class="cash">
            <span>Наличные</span>
            <strong>${{ formatMoney(cash) }}</strong>
          </div>
          <button class="ghost-button" type="button" @click="guideOpen = true">Как рыбачить</button>
          <button class="ghost-button" type="button" @click="close">Закрыть</button>
        </div>
      </header>

      <div class="shop-layout">
        <nav class="category-list" aria-label="Категории магазина">
          <button
            v-for="category in categories"
            :key="category.id"
            type="button"
            :class="{ active: category.id === currentCategory }"
            @click="activeCategory = category.id"
          >
            {{ category.label }}
          </button>
        </nav>

        <section class="catalog" aria-label="Товары">
          <article v-for="item in filteredItems" :key="item.id" class="fishing-card" :class="{ locked: item.locked }">
            <div class="fishing-card__icon">{{ icons[item.icon || 'rod'] || '◇' }}</div>
            <div class="fishing-card__body">
              <div class="fishing-card__title">
                <h2>{{ item.name }}</h2>
                <span v-if="item.amount > 1">×{{ item.amount }}</span>
              </div>
              <p>{{ item.description }}</p>
              <footer>
                <strong>{{ item.price > 0 ? `$${formatMoney(item.price)}` : 'Бесплатно' }}</strong>
                <button type="button" :disabled="item.locked || checkoutLocked" @click="addToCart(item)">
                  {{ item.locked ? `${item.minLevel || 1} ур.` : getQuantity(item.id) > 0 ? `В корзине: ${getQuantity(item.id)}` : 'В корзину' }}
                </button>
              </footer>
            </div>
          </article>
        </section>

        <aside class="cart">
          <header>
            <div>
              <span>Ваш заказ</span>
              <h2>Корзина</h2>
            </div>
            <button type="button" :disabled="cartLines.length === 0 || checkoutLocked" @click="clearCart">Очистить</button>
          </header>

          <div v-if="cartLines.length === 0" class="cart__empty">Добавьте снасти из каталога</div>
          <div v-else class="cart__lines">
            <article v-for="line in cartLines" :key="line.item.id" class="cart-line">
              <div>
                <strong>{{ line.item.name }}</strong>
                <span>${{ formatMoney(line.item.price * line.quantity) }} · {{ line.item.amount * line.quantity }} шт.</span>
              </div>
              <div class="quantity">
                <button type="button" :disabled="checkoutLocked" @click="setQuantity(line.item.id, line.quantity - 1)">−</button>
                <span>{{ line.quantity }}</span>
                <button type="button" :disabled="checkoutLocked || line.quantity >= 10" @click="setQuantity(line.item.id, line.quantity + 1)">+</button>
              </div>
            </article>
          </div>

          <footer>
            <div>
              <span>Итого</span>
              <strong>${{ formatMoney(cartTotal) }}</strong>
            </div>
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
    </section>

    <section v-if="guideOpen" class="fishing-guide" role="dialog" aria-modal="true" aria-label="Как рыбачить">
      <div class="fishing-guide__panel">
        <header>
          <div>
            <span>Памятка новичка</span>
            <h2>Как рыбачить</h2>
          </div>
          <button class="ghost-button" type="button" @click="guideOpen = false">Закрыть</button>
        </header>
        <ol>
          <li v-for="(step, index) in guide" :key="`${index}:${step}`">
            <strong>{{ index + 1 }}</strong>
            <span>{{ step }}</span>
          </li>
        </ol>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.fishing-shop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 5vh 5vw;
  box-sizing: border-box;
  color: #f5fbff;
  font-family: "Montserrat", "Inter", "Segoe UI", sans-serif;
  background: transparent;
}

.fishing-shop__panel {
  width: min(142vh, 92vw);
  max-height: 88vh;
  padding: 2.4vh;
  box-sizing: border-box;
  overflow: hidden;
  border: 0.1vh solid rgb(209 75 255 / 45%);
  border-radius: 1.2vh;
  background:
    radial-gradient(circle at 20% 0%, rgb(205 41 255 / 20%), transparent 34%),
    radial-gradient(circle at 92% 72%, rgb(42 197 255 / 18%), transparent 34%),
    linear-gradient(135deg, rgb(4 8 13 / 90%), rgb(12 7 18 / 88%));
  box-shadow: 0 2.8vh 8vh rgb(0 0 0 / 45%);
}

.shop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2vh;
  padding-bottom: 1.8vh;
  border-bottom: 0.1vh solid rgb(209 75 255 / 22%);

  span {
    display: block;
    margin-bottom: 0.4vh;
    color: #d94cff;
    font-size: 1.1vh;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: 3vh;
    line-height: 1;
  }

  p {
    margin: 0.8vh 0 0;
    color: rgb(245 251 255 / 72%);
    font-size: 1.35vh;
  }
}

.shop-header__right {
  display: flex;
  align-items: center;
  gap: 1.2vh;
}

.cash,
.ghost-button,
.category-list button,
.cart header button,
.cart footer button,
.fishing-card button,
.quantity button {
  border: 0.1vh solid rgb(209 75 255 / 42%);
  background: rgb(20 7 28 / 88%);
  color: #fff;
}

.cash {
  min-width: 13vh;
  padding: 1vh 1.3vh;
  border-radius: 0.9vh;

  span {
    margin: 0;
    color: rgb(245 251 255 / 56%);
    letter-spacing: 0;
    text-transform: none;
  }

  strong {
    display: block;
    margin-top: 0.2vh;
    font-size: 1.75vh;
  }
}

button {
  cursor: pointer;
  font: inherit;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, opacity 160ms ease;

  &:hover:not(:disabled) {
    transform: translateY(-0.12vh);
    border-color: rgb(54 217 255 / 70%);
    background: linear-gradient(135deg, rgb(209 75 255 / 35%), rgb(54 217 255 / 18%));
  }

  &:active:not(:disabled) {
    transform: translateY(0.1vh) scale(0.985);
  }

  &:focus-visible {
    outline: 0.2vh solid #63e6ff;
    outline-offset: 0.2vh;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.cart > footer > button.is-pending {
  border-color: rgb(209 75 255 / 55%);
  background: linear-gradient(135deg, rgb(132 35 151 / 80%), rgb(35 120 138 / 65%));
}

.ghost-button {
  min-width: 10vh;
  padding: 1.2vh 1.5vh;
  border-radius: 0.9vh;
}

.shop-layout {
  display: grid;
  grid-template-columns: 18vh minmax(0, 1fr) 32vh;
  gap: 1.6vh;
  min-height: 58vh;
  padding-top: 1.8vh;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 0.8vh;

  button {
    height: 4.8vh;
    border-radius: 0.9vh;
    color: rgb(245 251 255 / 72%);
    text-align: left;
    padding: 0 1.3vh;

    &.active {
      color: #fff;
      border-color: rgb(54 217 255 / 70%);
      background: linear-gradient(135deg, rgb(209 75 255 / 58%), rgb(54 217 255 / 16%));
      box-shadow: inset 0 -0.2vh 0 rgb(54 217 255 / 55%);
    }
  }
}

.catalog {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.2vh;
  overflow: auto;
  padding-right: 0.8vh;
}

.fishing-card {
  display: grid;
  grid-template-columns: 6.2vh minmax(0, 1fr);
  gap: 1.2vh;
  min-height: 14vh;
  padding: 1.2vh;
  box-sizing: border-box;
  border: 0.1vh solid rgb(255 255 255 / 10%);
  border-radius: 1vh;
  background: rgb(3 6 10 / 86%);

  &.locked {
    filter: grayscale(0.7);
  }
}

.fishing-card__icon {
  display: grid;
  place-items: center;
  align-self: start;
  width: 6.2vh;
  height: 6.2vh;
  border-radius: 1vh;
  color: #63e6ff;
  font-size: 3vh;
  background: linear-gradient(145deg, rgb(209 75 255 / 22%), rgb(54 217 255 / 12%));
}

.fishing-card__body {
  min-width: 0;

  p {
    margin: 0.7vh 0 1.2vh;
    color: rgb(245 251 255 / 62%);
    font-size: 1.18vh;
    line-height: 1.35;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1vh;
  }

  button {
    min-width: 10vh;
    height: 3.6vh;
    border-radius: 0.7vh;
  }
}

.fishing-card__title {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1vh;

  h2 {
    margin: 0;
    color: #fff;
    font-size: 1.55vh;
    line-height: 1.15;
  }

  span {
    color: #63e6ff;
    font-size: 1.1vh;
  }
}

.cart {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 1.4vh;
  border: 0.1vh solid rgb(54 217 255 / 20%);
  border-radius: 1vh;
  background: rgb(0 0 0 / 58%);

  header,
  footer {
    display: flex;
    justify-content: space-between;
    gap: 1vh;
  }

  header {
    align-items: start;
    padding-bottom: 1vh;
    border-bottom: 0.1vh solid rgb(255 255 255 / 8%);
  }

  h2 {
    margin: 0.2vh 0 0;
    font-size: 2vh;
  }

  span {
    color: rgb(245 251 255 / 58%);
    font-size: 1.1vh;
  }

  header button {
    height: 3.2vh;
    padding: 0 1vh;
    border-radius: 0.7vh;
  }

  footer {
    align-items: center;
    margin-top: auto;
    padding-top: 1.2vh;
    border-top: 0.1vh solid rgb(255 255 255 / 8%);

    strong {
      display: block;
      margin-top: 0.2vh;
      font-size: 1.9vh;
    }

    button {
      height: 4vh;
      padding: 0 1.4vh;
      border-radius: 0.8vh;
      font-weight: 800;
    }
  }
}

.cart__empty {
  display: grid;
  place-items: center;
  min-height: 18vh;
  color: rgb(245 251 255 / 48%);
  font-size: 1.25vh;
}

.cart__lines {
  display: grid;
  gap: 0.8vh;
  overflow: auto;
  padding: 1vh 0;
}

.cart-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1vh;
  min-width: 0;
  padding: 0.9vh;
  border-radius: 0.8vh;
  background: rgb(255 255 255 / 5%);

  strong {
    display: block;
    overflow: hidden;
    color: #fff;
    font-size: 1.25vh;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.fishing-guide {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: 5vh 5vw;
  background: rgb(0 0 0 / 62%);
  backdrop-filter: blur(0.35vh);
  pointer-events: auto;
}

.fishing-guide__panel {
  width: min(72vh, 82vw);
  padding: 2.2vh;
  border: 0.1vh solid rgb(99 230 255 / 42%);
  border-radius: 1.2vh;
  background: linear-gradient(145deg, rgb(7 11 18 / 98%), rgb(23 8 31 / 98%));
  box-shadow: 0 2vh 8vh rgb(0 0 0 / 55%);

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2vh;
    padding-bottom: 1.4vh;
    border-bottom: 0.1vh solid rgb(255 255 255 / 10%);

    span {
      color: #d94cff;
      font-size: 1.05vh;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    h2 {
      margin: 0.35vh 0 0;
      font-size: 2.5vh;
    }
  }

  ol {
    display: grid;
    gap: 0.9vh;
    margin: 1.5vh 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 3.2vh minmax(0, 1fr);
    align-items: center;
    gap: 1vh;
    padding: 1vh 1.2vh;
    border-radius: 0.8vh;
    color: rgb(245 251 255 / 82%);
    font-size: 1.25vh;
    line-height: 1.45;
    background: rgb(255 255 255 / 5%);

    strong {
      display: grid;
      place-items: center;
      width: 3.2vh;
      height: 3.2vh;
      border-radius: 50%;
      color: #fff;
      background: linear-gradient(135deg, #d14bff, #36d9ff);
    }
  }
}

.quantity {
  display: grid;
  grid-template-columns: 2.6vh 2.6vh 2.6vh;
  align-items: center;
  gap: 0.4vh;
  text-align: center;

  button {
    width: 2.6vh;
    height: 2.6vh;
    border-radius: 0.6vh;
  }
}
</style>
