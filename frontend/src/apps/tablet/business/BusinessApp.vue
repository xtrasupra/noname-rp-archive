<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeft, CircleDollarSign, PackagePlus, RefreshCw, Store, UserMinus, UserPlus } from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { TabletBusiness } from '@/shared/contracts/ui'

const props = defineProps<{ businesses: TabletBusiness[] }>()
const emit = defineEmits<{ close: [] }>()
const selectedId = ref<string | null>(props.businesses[0]?.id ?? null)
const amount = ref(1000)
const supplyAmounts = ref<Record<string, number>>({})
const employeeUuid = ref<number | null>(null)
const balanceType = ref<'cash' | 'card'>('card')
const taxDays = ref(7)
const salePrice = ref<number | null>(null)

const selected = computed(() => props.businesses.find((business) => business.id === selectedId.value) ?? props.businesses[0] ?? null)

function money(value: number) {
  return new Intl.NumberFormat('ru-RU').format(Math.max(0, Number(value || 0)))
}

function hasPermission(permission: string) {
  return Boolean(selected.value?.isOwner || selected.value?.permissions.includes(permission))
}

function send(eventName: string, payload: object) {
  callClientEvent(eventName, JSON.stringify(payload))
}

function balance(action: 'deposit' | 'withdraw') {
  if (!selected.value || amount.value < 1) return
  send('tablet:businessBalanceFromBrowser', { businessId: selected.value.id, action, amount: amount.value, balanceType: balanceType.value })
}

function toggleOpen() {
  if (!selected.value) return
  send('tablet:businessToggleFromBrowser', { businessId: selected.value.id, open: !selected.value.isOpen })
}

function order(stockKey: string) {
  if (!selected.value) return
  const quantity = Math.max(1, Math.floor(Number(supplyAmounts.value[stockKey] || 10)))
  send('tablet:businessSupplyFromBrowser', { businessId: selected.value.id, stockKey, quantity, balanceType: balanceType.value })
}

function updatePrice(productId: string, price: number) {
  if (!selected.value) return
  send('tablet:businessPriceFromBrowser', { businessId: selected.value.id, productId, price })
}

function payTax() {
  if (!selected.value) return
  send('tablet:businessTaxFromBrowser', { businessId: selected.value.id, days: taxDays.value, balanceType: balanceType.value })
}

function listForSale() {
  if (!selected.value) return
  send('tablet:businessListSaleFromBrowser', { businessId: selected.value.id, price: salePrice.value })
}

function cancelSale() {
  if (!selected.value) return
  send('tablet:businessListSaleFromBrowser', { businessId: selected.value.id, price: null })
}

function sellToState() {
  if (!selected.value) return
  if (!window.confirm('Продать бизнес государству за 75% государственной стоимости? Отменить операцию будет нельзя.')) return
  send('tablet:businessSellStateFromBrowser', { businessId: selected.value.id })
}

function addEmployee() {
  if (!selected.value || !employeeUuid.value) return
  send('tablet:businessEmployeeUpsertFromBrowser', {
    businessId: selected.value.id,
    characterUuid: employeeUuid.value,
    permissions: ['view_logs', 'order_stock', 'toggle_open'],
  })
  employeeUuid.value = null
}

function removeEmployee(characterUuid: number) {
  if (!selected.value) return
  send('tablet:businessEmployeeRemoveFromBrowser', { businessId: selected.value.id, characterUuid })
}
</script>

<template>
  <section class="business-app">
    <header class="business-app__header">
      <button class="back" type="button" @click="emit('close')"><ArrowLeft /></button>
      <div><span>Управление активами</span><h1>Мой бизнес</h1></div>
      <button class="refresh" type="button" @click="callClientEvent('tablet:businessRefreshFromBrowser')"><RefreshCw /> Обновить</button>
    </header>

    <div v-if="!props.businesses.length" class="empty">
      <Store /><h2>У персонажа нет бизнеса</h2><p>Государственные и выставленные владельцами бизнесы доступны в маркетплейсе планшета.</p>
    </div>

    <div v-else class="layout">
      <nav class="business-list">
        <button v-for="business in props.businesses" :key="business.id" type="button" :class="{ active: selected?.id === business.id }" @click="selectedId = business.id">
          <strong>{{ business.name }}</strong><span>{{ business.isOpen ? 'Открыто' : 'Закрыто' }} · ${{ money(business.balances.cash + business.balances.card) }}</span>
        </button>
      </nav>

      <main v-if="selected" class="business-details">
        <section class="summary">
          <div><span>Касса</span><strong>${{ money(selected.balances.cash) }}</strong></div>
          <div><span>Счёт</span><strong>${{ money(selected.balances.card) }}</strong></div>
          <div><span>Владелец</span><strong>{{ selected.ownerName }}</strong></div>
          <button type="button" :disabled="!hasPermission('toggle_open')" @click="toggleOpen">{{ selected.isOpen ? 'Закрыть бизнес' : 'Открыть бизнес' }}</button>
        </section>

        <section class="panel">
          <header><CircleDollarSign /><div><h2>Финансы</h2><p>Пополнение и вывод наличных с бизнес-счёта.</p></div></header>
          <div class="row"><select v-model="balanceType"><option value="cash">Касса / наличные</option><option value="card">Счёт / карта</option></select><input v-model.number="amount" type="number" min="1"><button :disabled="!hasPermission('manage_balance')" @click="balance('deposit')">Пополнить</button><button :disabled="!hasPermission('manage_balance')" @click="balance('withdraw')">Вывести</button></div>
        </section>

        <section class="panel">
          <header><CircleDollarSign /><div><h2>Аналитика</h2><p>Продажи и уникальные покупатели по серверным транзакциям.</p></div></header>
          <div class="analytics-grid">
            <div><span>Сегодня</span><strong>${{ money(selected.analytics.revenueDay) }}</strong></div>
            <div><span>7 дней</span><strong>${{ money(selected.analytics.revenueWeek) }}</strong></div>
            <div><span>30 дней</span><strong>${{ money(selected.analytics.revenueMonth) }}</strong></div>
            <div><span>Покупатели / покупки</span><strong>{{ selected.analytics.buyersMonth }} / {{ selected.analytics.salesMonth }}</strong></div>
          </div>
          <div class="activity"><article v-for="product in selected.analytics.topProducts" :key="product.id"><strong>{{ product.name }}</strong><span>{{ product.quantity }} ед.</span><b>${{ money(product.revenue) }}</b></article></div>
        </section>

        <section v-if="selected.products.length" class="panel">
          <header><Store /><div><h2>Товары и цены</h2><p>Цена каждого товара настраивается в пределах 50–200% от базовой.</p></div></header>
          <div class="stock-grid">
            <article v-for="product in selected.products" :key="product.id">
              <div><strong>{{ product.name }}</strong><span>{{ product.kind === 'pricing' ? `Наценка: ${product.price}%` : `Базовая цена: $${money(product.basePrice)}` }}</span></div>
              <input :value="product.price" type="number" :disabled="!selected.priceEditingEnabled" :min="Math.floor(product.basePrice * .5)" :max="Math.ceil(product.basePrice * 2)" @change="updatePrice(product.id, Number(($event.target as HTMLInputElement).value))">
              <span>{{ selected.priceEditingEnabled ? 'Изменение сохранится после ввода' : 'Нет права менять цену' }}</span>
            </article>
          </div>
        </section>

        <section class="panel">
          <header><PackagePlus /><div><h2>Склад и поставки</h2><p>Заказы оплачиваются с баланса бизнеса и поступают на склад через один час.</p></div></header>
          <div class="stock-grid">
            <article v-for="stock in selected.stock" :key="stock.stockKey">
              <div><strong>{{ stock.label }}</strong><span>Остаток: {{ stock.quantity }} · ${{ money(stock.unitCost) }}/ед.</span></div>
              <input v-model.number="supplyAmounts[stock.stockKey]" type="number" min="1" max="5000" placeholder="10">
              <button :disabled="!hasPermission('order_stock')" @click="order(stock.stockKey)">Заказать</button>
            </article>
          </div>
        </section>

        <section class="panel">
          <header><CircleDollarSign /><div><h2>Налог и продажа</h2><p>Налог: ${{ money(selected.tax.dailyPrice) }} в день · оплачен до {{ selected.tax.paidUntil || 'не оплачен' }}.</p></div></header>
          <div class="row"><input v-model.number="taxDays" type="number" min="1" max="30"><button :disabled="!hasPermission('manage_taxes')" @click="payTax">Оплатить налог</button></div>
          <div v-if="selected.isOwner" class="row sale-row"><input v-model.number="salePrice" type="number" min="1" placeholder="Цена на маркетплейсе"><button @click="listForSale">Выставить</button><button :disabled="!selected.salePrice" @click="cancelSale">Снять</button><button class="danger-button" @click="sellToState">Продать государству (75%)</button></div>
        </section>

        <section class="panel">
          <header><UserPlus /><div><h2>Сотрудники</h2><p>Новые сотрудники получают ограниченный базовый набор прав.</p></div></header>
          <div v-if="selected.isOwner" class="row"><input v-model.number="employeeUuid" type="number" min="1" placeholder="Static ID"><button @click="addEmployee">Добавить</button></div>
          <div class="employee-list">
            <article v-for="employee in selected.employees" :key="employee.characterUuid">
              <div><strong>{{ employee.characterName }}</strong><span>#{{ employee.characterUuid }} · {{ employee.permissions.join(', ') || 'без прав' }}</span></div>
              <button v-if="selected.isOwner" class="danger" @click="removeEmployee(employee.characterUuid)"><UserMinus /></button>
            </article>
          </div>
        </section>

        <section class="panel">
          <header><PackagePlus /><div><h2>История поставок</h2><p>Статус последних заказов и ожидаемое время поступления на склад.</p></div></header>
          <div class="activity">
            <article v-for="supply in selected.supplies" :key="supply.id"><strong>{{ supply.stock_key || 'Поставка' }}</strong><span>{{ supply.status || 'pending' }} · {{ supply.available_at || supply.created_at || '' }}</span><b>{{ supply.quantity || 0 }} ед.</b></article>
            <p v-if="!selected.supplies.length">Заказов пока нет.</p>
          </div>
        </section>

        <section class="panel">
          <header><Store /><div><h2>Последние операции</h2><p>Продажи, пополнения, поставки и изменения управления.</p></div></header>
          <div class="activity">
            <article v-for="entry in selected.ledger" :key="entry.id"><strong>{{ entry.action || 'operation' }}</strong><span>{{ entry.created_at || '' }}</span><b :class="{ negative: Number(entry.amount) < 0 }">{{ Number(entry.amount) > 0 ? '+' : '' }}${{ money(Math.abs(Number(entry.amount || 0))) }}</b></article>
            <p v-if="!selected.ledger.length">Операций пока нет.</p>
          </div>
        </section>
      </main>
    </div>
  </section>
</template>

<style scoped lang="scss">
.business-app { height: 100%; padding: 24px; overflow: auto; color: #15121a; background: #f3f2f5; font-family: Inter, Arial, sans-serif; }
.business-app__header, .panel header, .row, .summary, .stock-grid article, .employee-list article, .activity article { display: flex; align-items: center; }
.business-app__header { gap: 14px; margin-bottom: 20px; } h1,h2,p { margin: 0; } .business-app__header span, .panel p, article span { color: #77717e; } .business-app__header h1 { font-size: 26px; }
button { border: 0; border-radius: 10px; padding: 10px 14px; color: #fff; font-weight: 750; background: #8d25ac; cursor: pointer; } button:disabled { opacity: .38; cursor: not-allowed; } .back { display:grid; place-items:center; padding:10px; } .back svg { width:20px; } .refresh { margin-left:auto; display:flex; align-items:center; gap:7px; } .refresh svg { width:16px; }
.empty { min-height: 420px; display:grid; place-content:center; justify-items:center; gap:10px; text-align:center; color:#7d7783; } .empty svg { width:58px; height:58px; color:#a83bc5; } .empty h2 { color:#201c24; }
.layout { display:grid; grid-template-columns: 220px minmax(0,1fr); gap:18px; } .business-list { display:grid; align-content:start; gap:8px; } .business-list button { display:grid; gap:4px; text-align:left; color:#29232e; background:#fff; border:1px solid #e3dfe6; } .business-list button.active { color:#fff; background:linear-gradient(135deg,#7e219d,#ba43c7); } .business-list span { font-size:12px; color:inherit; opacity:.72; }
.business-details { display:grid; gap:14px; } .summary, .panel { border:1px solid #e3dfe6; border-radius:16px; background:#fff; box-shadow:0 8px 28px rgba(32,21,37,.05); } .summary { gap:28px; padding:18px; } .summary div { display:grid; gap:3px; } .summary span { color:#817a85; } .summary strong { font-size:18px; } .summary button { margin-left:auto; }
.panel { padding:18px; } .panel header { gap:12px; margin-bottom:14px; } .panel header>svg { width:30px; height:30px; padding:8px; box-sizing:content-box; border-radius:12px; color:#9227ad; background:#f4e5f8; } .panel h2 { font-size:17px; }
.row { gap:8px; } input, select { min-width:0; padding:10px; border:1px solid #dcd6df; border-radius:9px; background:#faf9fb; } .sale-row { margin-top:10px; flex-wrap:wrap; } .danger-button { background:#b72f45; }
.stock-grid, .employee-list, .activity { display:grid; gap:8px; } .stock-grid article, .employee-list article, .activity article { gap:10px; padding:10px 12px; border-radius:11px; background:#f8f6f9; } .stock-grid article>div, .employee-list article>div { flex:1; display:grid; gap:3px; } .stock-grid input { width:76px; } .employee-list .danger { display:grid; place-items:center; padding:8px; background:#c7374b; } .employee-list .danger svg { width:17px; }
.activity article strong { flex:1; text-transform:capitalize; } .activity article span { margin-right:20px; font-size:12px; } .activity b { color:#22935c; } .activity b.negative { color:#c7374b; }
.analytics-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-bottom:12px; } .analytics-grid div { display:grid; gap:4px; padding:12px; border-radius:10px; background:#f8f6f9; } .analytics-grid span { color:#77717e; font-size:12px; } .analytics-grid strong { font-size:17px; }
@media (max-width: 840px) { .layout { grid-template-columns:1fr; } .business-list { grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); } .summary { align-items:stretch; flex-direction:column; gap:12px; } .summary button { margin-left:0; } }
</style>
