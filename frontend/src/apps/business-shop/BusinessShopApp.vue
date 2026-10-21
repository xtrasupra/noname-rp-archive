<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Banknote,
  Building2,
  CreditCard,
  Info,
  LockKeyhole,
  MapPin,
  Scissors,
  Shirt,
  ShoppingBasket,
  Sparkles,
  Store,
  Tag,
  UserRound,
  X,
} from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { BusinessProduct, InterfacePayloadMap } from '@/shared/contracts/ui'
import FuelStationView from './FuelStationView.vue'
import { isPurchaseControlDisabled } from './purchase-control'
import { useBusinessPurchaseFeedback } from './useBusinessPurchaseFeedback'

const props = defineProps<{ payload?: InterfacePayloadMap['businessShop'] }>()
const quantities = ref<Record<string, number>>({})
const paymentType = ref<'cash' | 'card'>('cash')
const activeCategory = ref('')
const selectedProductId = ref<string | null>(null)
const infoOpen = ref(false)

const businessTypeLabels: Record<string, string> = {
  grocery: 'Продуктовый магазин',
  gunstore: 'Оружейный магазин',
  barber: 'Парикмахерская',
  tattoo: 'Тату-салон',
  clothing: 'Магазин одежды',
  lsc: 'Автомастерская',
  gas: 'Автозаправка',
  hunting: 'Охотничий магазин',
  fishing: 'Рыболовный магазин',
}

const business = computed(() => props.payload?.business)
const businessId = computed(() => business.value?.id)
const {
  beginPurchase,
  hasPendingPurchase,
  isPurchasePending,
  isPurchaseRetryAvailable,
  isPurchaseRetrying,
} = useBusinessPurchaseFeedback(businessId)
const products = computed(() => props.payload?.products ?? [])
const cash = computed(() => Math.max(0, Number(props.payload?.balances?.cash || 0)))
const card = computed(() => Math.max(0, Number(props.payload?.balances?.card || 0)))
const appearanceMode = computed(() => business.value?.interfaceMode === 'appearance')
const fuelMode = computed(() => business.value?.interfaceMode === 'fuel')
const categories = computed(() => [...new Set(products.value.map((product) => product.category).filter(Boolean))])
const filteredProducts = computed(() => products.value.filter((product) => !activeCategory.value || product.category === activeCategory.value))
const selectedProduct = computed(() => products.value.find((product) => product.id === selectedProductId.value) ?? null)
const businessTypeLabel = computed(() => businessTypeLabels[business.value?.type || ''] || 'Бизнес')
const appearanceTitle = computed(() => {
  if (business.value?.type === 'barber') return 'Предпросмотр причёски'
  if (business.value?.type === 'tattoo') return 'Предпросмотр татуировки'
  return 'Примерочная'
})
const appearanceHint = computed(() => {
  if (business.value?.type === 'barber') {
    return 'Выберите причёску слева. Ракурс автоматически приблизится к голове, а изменение сохранится только после оплаты.'
  }
  if (business.value?.type === 'tattoo') {
    return 'Одежда временно снята для осмотра тела и вернётся при выходе. Татуировка станет постоянной только после оплаты.'
  }
  return 'Выберите одежду слева. Камера сама подберёт ракурс, покупка попадёт в инвентарь, а выбранная вещь будет надета автоматически.'
})

const shopIcon = computed(() => {
  if (business.value?.type === 'clothing') return Shirt
  if (business.value?.type === 'barber') return Scissors
  if (business.value?.type === 'tattoo') return Sparkles
  return Store
})

function money(value: number) {
  return new Intl.NumberFormat('ru-RU').format(Math.max(0, Number(value || 0)))
}

function quantity(productId: string) {
  return Math.min(20, Math.max(1, Math.floor(Number(quantities.value[productId] || 1))))
}

function updateQuantity(productId: string, rawValue: string) {
  quantities.value = {
    ...quantities.value,
    [productId]: Math.min(20, Math.max(1, Math.floor(Number(rawValue || 1)))),
  }
}

function selectProduct(product: BusinessProduct) {
  selectedProductId.value = product.id
  if (product.preview) {
    callClientEvent('businessShop:previewFromBrowser', JSON.stringify({ productId: product.id }))
  }
}

function buy(productId: string) {
  if (!business.value) return
  if (isPurchaseRetryAvailable(productId)) {
    callClientEvent('businessShop:retryPurchaseFromBrowser', JSON.stringify({
      businessId: business.value.id,
      productId,
    }))
    return
  }
  if (!beginPurchase(productId)) return
  callClientEvent('businessShop:buyFromBrowser', JSON.stringify({
    businessId: business.value.id,
    productId,
    quantity: appearanceMode.value ? 1 : quantity(productId),
    paymentType: paymentType.value,
  }))
}

function close() {
  callClientEvent('businessShop:closeFromBrowser')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (infoOpen.value) infoOpen.value = false
  else close()
}

watch(categories, (nextCategories) => {
  if (!nextCategories.includes(activeCategory.value)) activeCategory.value = nextCategories[0] ?? ''
}, { immediate: true })

watch(filteredProducts, (nextProducts) => {
  const currentExists = nextProducts.some((product) => product.id === selectedProductId.value)
  if (!currentExists && nextProducts[0]) selectProduct(nextProducts[0])
}, { immediate: true })

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <FuelStationView v-if="fuelMode && props.payload" :payload="props.payload" />
  <main v-else class="business-shop" :class="{ 'appearance-layout': appearanceMode }">
    <section class="shop-shell">
      <aside class="shop-sidebar">
        <div class="brand-card">
          <span class="brand-card__icon"><component :is="shopIcon" /></span>
          <div>
            <span class="eyebrow">{{ businessTypeLabel }}</span>
            <h1>{{ business?.name || 'Магазин NoName' }}</h1>
            <p>{{ business?.district || 'Лос-Сантос' }}</p>
          </div>
        </div>

        <div class="welcome-copy">
          <strong>Добро пожаловать</strong>
          <span>{{ appearanceMode ? 'Выберите категорию и примерьте вариант' : 'Выберите категорию товаров' }}</span>
        </div>

        <nav class="category-list" aria-label="Категории магазина">
          <button
            v-for="category in categories"
            :key="category"
            type="button"
            :class="{ active: activeCategory === category }"
            @click="activeCategory = category"
          >
            {{ category }}
          </button>
        </nav>

        <div class="sidebar-balance">
          <button type="button" :class="{ active: paymentType === 'cash' }" @click="paymentType = 'cash'">
            <Banknote /> <span>Наличные</span> <strong>${{ money(cash) }}</strong>
          </button>
          <button type="button" :class="{ active: paymentType === 'card' }" @click="paymentType = 'card'">
            <CreditCard /> <span>Карта</span> <strong>${{ money(card) }}</strong>
          </button>
        </div>
      </aside>

      <section class="shop-content">
        <header class="shop-toolbar">
          <div>
            <span class="eyebrow">{{ activeCategory || 'Каталог' }}</span>
            <h2>{{ appearanceMode ? appearanceTitle : 'Каталог магазина' }}</h2>
          </div>
          <div class="toolbar-actions">
            <button class="icon-button" type="button" aria-label="Информация о бизнесе" @click="infoOpen = true"><Info /></button>
            <button class="icon-button" type="button" aria-label="Закрыть" @click="close"><X /></button>
          </div>
        </header>

        <section v-if="!business?.isOpen" class="empty-state">
          <LockKeyhole />
          <h2>Бизнес сейчас закрыт</h2>
          <p>Владелец или сотрудник может открыть его через планшет.</p>
        </section>

        <template v-else-if="filteredProducts.length">
          <div v-if="appearanceMode" class="preview-hint">
            <component :is="shopIcon" />
            <span>{{ appearanceHint }}</span>
          </div>

          <section class="catalog" :class="{ 'catalog--appearance': appearanceMode }">
            <article
              v-for="product in filteredProducts"
              :key="product.id"
              class="product-card"
              :class="{ selected: selectedProduct?.id === product.id }"
              @click="selectProduct(product)"
            >
              <span class="product-card__icon"><ShoppingBasket /></span>
              <div class="product-card__body">
                <span class="product-card__kind">{{ product.category }}</span>
                <h3>{{ product.name }}</h3>
                <p>{{ product.description || 'Товар доступен для покупки.' }}</p>
                <div class="product-card__meta">
                  <strong>${{ money(product.price) }}</strong>
                  <span>На складе: {{ product.stock }}</span>
                </div>
              </div>
              <div class="product-card__actions" @click.stop>
                <input
                  v-if="!appearanceMode && (product.kind === 'item' || product.kind === 'fuel')"
                  :value="quantity(product.id)"
                  min="1"
                  :max="Math.min(20, product.stock)"
                  type="number"
                  :disabled="hasPendingPurchase"
                  @input="updateQuantity(product.id, ($event.target as HTMLInputElement).value)"
                >
                <button
                  type="button"
                  :class="{ 'is-pending': isPurchasePending(product.id) }"
                  :disabled="isPurchaseControlDisabled(product.stock < 1, hasPendingPurchase, isPurchaseRetryAvailable(product.id))"
                  :aria-busy="isPurchasePending(product.id) && !isPurchaseRetryAvailable(product.id)"
                  @click="buy(product.id)"
                >
                  {{ isPurchaseRetryAvailable(product.id) ? 'Проверить оплату' : isPurchaseRetrying(product.id) ? 'Проверяем покупку…' : isPurchasePending(product.id) ? 'Покупаем…' : (appearanceMode ? 'Купить выбранное' : 'Купить') }}
                </button>
              </div>
            </article>
          </section>
        </template>

        <section v-else class="empty-state">
          <Building2 />
          <h2>Каталог пока пуст</h2>
          <p>В этой категории сейчас нет доступных товаров или услуг.</p>
        </section>
      </section>
    </section>

    <div v-if="infoOpen" class="info-backdrop" @click.self="infoOpen = false">
      <article class="business-info-card">
        <button class="info-close" type="button" aria-label="Закрыть информацию" @click="infoOpen = false"><X /></button>
        <div class="business-info-card__visual">
          <component :is="shopIcon" />
          <span>{{ business?.blip.label || business?.name }}</span>
        </div>
        <div class="business-info-card__body">
          <span class="eyebrow">Информация с бизнес-блипа</span>
          <h2>{{ business?.name }}</h2>
          <p>{{ business?.description }}</p>
          <dl>
            <div><dt><MapPin /> Район</dt><dd>{{ business?.district }}</dd></div>
            <div><dt><UserRound /> Владелец</dt><dd>{{ business?.ownerName || 'Государство' }}</dd></div>
            <div><dt><Building2 /> Контроль</dt><dd>{{ business?.controlLabel }}</dd></div>
            <div><dt><Tag /> Стоимость</dt><dd>${{ money(business?.purchasePrice || 0) }}</dd></div>
          </dl>
        </div>
      </article>
    </div>
  </main>
</template>

<style scoped lang="scss">
.business-shop { min-height: 100vh; padding: 18px; color: #f8f8ff; background: radial-gradient(circle at 58% 12%, rgba(174, 43, 209, .19), transparent 38%), rgba(5, 5, 10, .74); font-family: Inter, Arial, sans-serif; }
.business-shop.appearance-layout { background: transparent; }
.shop-shell { min-height: calc(100vh - 36px); display: grid; grid-template-columns: 310px minmax(0, 1fr); overflow: hidden; border: 1px solid rgba(255,255,255,.11); border-radius: 22px; background: rgba(8, 8, 12, .82); box-shadow: 0 28px 90px rgba(0,0,0,.5); }
.appearance-layout .shop-shell { border-color: transparent; background: transparent; box-shadow: none; }
.shop-sidebar { position: relative; z-index: 2; display: flex; flex-direction: column; gap: 24px; padding: 28px 22px; background: linear-gradient(180deg, rgba(25,24,29,.98), rgba(9,9,12,.96)); box-shadow: 18px 0 48px rgba(0,0,0,.28); }
.brand-card { display: flex; align-items: center; gap: 13px; padding: 15px; border: 1px solid rgba(222,91,240,.34); border-radius: 15px; background: rgba(255,255,255,.035); }
.brand-card__icon { width: 46px; height: 46px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 13px; color: #fff; background: linear-gradient(135deg,#8d22b5,#e247cc); }
.brand-card__icon svg { width: 24px; }
h1,h2,h3,p { margin: 0; }
h1 { margin-top: 2px; font-size: 18px; }
.brand-card p, .welcome-copy span { color: #96919e; font-size: 12px; }
.eyebrow { color: #aaa5b5; font-size: 10px; font-weight: 850; letter-spacing: .16em; text-transform: uppercase; }
.welcome-copy { display: grid; gap: 5px; padding: 0 8px; }
.welcome-copy strong { font-size: 14px; }
.category-list { display: grid; gap: 5px; }
.category-list button { min-height: 40px; padding: 0 13px; border: 0; border-left: 2px solid transparent; color: #c9c6cf; text-align: left; background: transparent; }
.category-list button:hover, .category-list button.active { color: #fff; border-left-color: #df42e5; background: linear-gradient(90deg, rgba(184,48,203,.19), transparent); }
.sidebar-balance { display: grid; gap: 7px; margin-top: auto; }
.sidebar-balance button { display: grid; grid-template-columns: 19px 1fr auto; align-items: center; gap: 8px; padding: 11px; border: 1px solid rgba(255,255,255,.07); border-radius: 11px; color: #aaa5b5; background: rgba(255,255,255,.035); }
.sidebar-balance button.active { color: #fff; border-color: rgba(213,65,224,.5); background: rgba(174,43,209,.18); }
.sidebar-balance svg { width: 17px; }
.shop-content { position: relative; min-width: 0; max-height: calc(100vh - 36px); overflow: auto; }
.appearance-layout .shop-content { overflow: hidden; background: transparent; }
.shop-toolbar { position: sticky; top: 0; z-index: 3; display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 24px 28px; border-bottom: 1px solid rgba(255,255,255,.07); background: rgba(12,11,17,.9); }
.appearance-layout .shop-toolbar { position: relative; width: min(520px, calc(100% - 36px)); margin: 0 18px 0 auto; border: 1px solid rgba(255,255,255,.08); border-radius: 0 0 16px 16px; background: rgba(12,11,17,.78); }
.shop-toolbar h2 { margin-top: 3px; font-size: 21px; }
.toolbar-actions { display: flex; gap: 8px; }
.icon-button, .info-close { width: 42px; height: 42px; display: grid; place-items: center; border: 0; border-radius: 12px; color: #fff; background: rgba(255,255,255,.08); }
.icon-button:hover, .info-close:hover { background: rgba(204,64,220,.28); }
button { font: inherit; font-weight: 720; cursor: pointer; }
button:disabled { opacity: .42; cursor: not-allowed; }
.preview-hint { position: relative; z-index: 2; width: min(520px, calc(100% - 36px)); display: flex; align-items: center; gap: 11px; margin: 18px 18px 0 auto; padding: 13px 16px; border: 1px solid rgba(255,255,255,.1); border-radius: 14px; color: #d0cad5; background: rgba(7,7,10,.68); }
.preview-hint svg { width: 22px; color: #df67ef; }
.preview-hint span { font-size: 12px; line-height: 1.45; }
.catalog { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 12px; padding: 24px 28px 32px; }
.catalog--appearance { position: relative; z-index: 2; width: min(556px, calc(100% - 18px)); max-height: calc(100vh - 244px); grid-template-columns: 1fr; margin: 0 0 0 auto; padding: 18px; overflow: auto; }
.product-card { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 14px; padding: 16px; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; background: rgba(18,17,23,.89); transition: border-color .16s ease, transform .16s ease; }
.product-card:hover, .product-card.selected { border-color: rgba(220,74,232,.58); transform: translateY(-1px); }
.product-card__icon { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 13px; color: #df67ef; background: rgba(174,43,209,.16); }
.product-card__body h3 { margin: 3px 0 5px; font-size: 17px; }
.product-card__body p { min-height: 34px; color: #aaa5b5; font-size: 12px; line-height: 1.42; }
.product-card__kind { color: #a39da9; font-size: 9px; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
.product-card__meta { display: flex; gap: 14px; align-items: center; margin-top: 9px; }
.product-card__meta strong { color: #74e397; }
.product-card__meta span { color: #8f8998; font-size: 11px; }
.product-card__actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
.product-card__actions input { width: 66px; padding: 10px; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; color: #fff; background: #15141c; }
.product-card__actions button { min-width: 126px; padding: 11px 17px; border: 0; border-radius: 10px; color: #fff; background: linear-gradient(135deg,#8d22b5,#d93cc4); box-shadow: 0 8px 20px rgba(181,42,198,.22); transition: filter 140ms ease, transform 140ms ease, box-shadow 140ms ease; }
.product-card__actions button:not(:disabled):hover { filter: brightness(1.13); box-shadow: 0 10px 26px rgba(213,55,214,.38); transform: translateY(-1px); }
.product-card__actions button:not(:disabled):active { filter: brightness(.94); box-shadow: 0 4px 12px rgba(181,42,198,.25); transform: translateY(1px) scale(.985); }
.product-card__actions button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.product-card__actions button.is-pending { background: linear-gradient(135deg,#69217f,#a6309b); }
.empty-state { min-height: 440px; display: grid; place-content: center; justify-items: center; gap: 10px; padding: 30px; text-align: center; color: #aaa5b5; }
.empty-state svg { width: 48px; height: 48px; color: #ba4fce; }
.empty-state h2 { color: #fff; }
.info-backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 30px; background: rgba(0,0,0,.62); }
.business-info-card { position: relative; width: min(580px, 92vw); overflow: hidden; border: 1px solid rgba(255,255,255,.12); border-radius: 20px; background: #111116; box-shadow: 0 28px 90px rgba(0,0,0,.62); }
.business-info-card__visual { min-height: 180px; display: grid; place-content: center; justify-items: center; gap: 12px; color: #fff; background: radial-gradient(circle at 50% 20%, rgba(219,74,230,.4), transparent 48%), linear-gradient(145deg,#282032,#0d0d12); }
.business-info-card__visual svg { width: 54px; height: 54px; color: #e377ef; }
.business-info-card__visual span { font-size: 14px; font-weight: 850; letter-spacing: .14em; text-transform: uppercase; }
.business-info-card__body { padding: 24px; }
.business-info-card__body h2 { margin: 4px 0 7px; font-size: 24px; }
.business-info-card__body > p { color: #a9a4b0; line-height: 1.5; }
.business-info-card dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 22px 0 0; }
.business-info-card dl div { padding: 13px; border: 1px solid rgba(255,255,255,.07); border-radius: 12px; background: rgba(255,255,255,.035); }
.business-info-card dt { display: flex; align-items: center; gap: 7px; color: #8f8997; font-size: 11px; }
.business-info-card dt svg { width: 15px; }
.business-info-card dd { margin: 6px 0 0; color: #fff; font-size: 14px; font-weight: 750; }
.info-close { position: absolute; top: 14px; right: 14px; z-index: 2; }

@media (max-width: 900px) {
  .business-shop { padding: 8px; }
  .shop-shell { min-height: calc(100vh - 16px); grid-template-columns: 240px minmax(0, 1fr); }
  .shop-sidebar { padding: 18px 14px; }
  .catalog, .catalog--appearance { width: auto; grid-template-columns: 1fr; padding: 16px; }
  .appearance-layout .shop-toolbar { margin-left: 0; }
  .preview-hint { width: auto; margin: 16px; }
  .appearance-layout .shop-content { overflow: auto; }
}
</style>
