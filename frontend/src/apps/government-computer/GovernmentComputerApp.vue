<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Building2, FilePlus2, FileText, Landmark, PackageOpen, Pencil, Search, ShoppingCart, Trash2, X } from 'lucide-vue-next'
import { callClientEvent } from '@/core/client-events/client-event'
import TwinkleSelect from '@/shared/components/TwinkleSelect.vue'
import type { GovernmentComputerPayload, GovernmentDecree } from '@/shared/contracts/ui'

const props = defineProps<{ payload?: GovernmentComputerPayload }>()
const tab = ref<'decrees' | 'materials'>('decrees')
const editing = ref(false)
const viewingDecree = ref<GovernmentDecree | null>(null)
const search = ref('')
const selectedFraction = ref<number | null>(null)
const materialAmount = ref(100)
const decreePendingDelete = ref<GovernmentDecree | null>(null)
const form = reactive({ id: 0, documentNumber: '', title: '', summary: '', body: '', effectiveAt: new Date().toISOString().slice(0, 10), authorPosition: 'Член Правительства' })
const payload = computed(() => props.payload)
const permissions = computed(() => payload.value?.permissions ?? { canOrderMaterials: false, canManageDecrees: false })
const material = computed(() => payload.value?.material)
const decrees = computed(() => (payload.value?.decrees ?? []).filter((item) => `${item.title} ${item.documentNumber}`.toLowerCase().includes(search.value.toLowerCase())))
const totalPrice = computed(() => Math.max(0, Number(materialAmount.value) || 0) * Number(material.value?.unitPrice || 0))
const fractionOptions = computed(() => (material.value?.fractions ?? []).map((fraction) => ({
  value: String(fraction.id),
  label: fraction.shortName ? `${fraction.shortName} — ${fraction.name}` : fraction.name,
  description: `Государственная организация · ID ${fraction.id}`,
})))
const selectedFractionValue = computed({
  get: () => selectedFraction.value === null ? "" : String(selectedFraction.value),
  set: (value: string) => { selectedFraction.value = value ? Number(value) : null },
})
const money = new Intl.NumberFormat('ru-RU')

watch(() => material.value?.fractions, (list) => {
  if (selectedFraction.value === null && list?.length) selectedFraction.value = Number(list[0].id)
}, { immediate: true })

function openDecree(decree: GovernmentDecree) {
  viewingDecree.value = decree
  editing.value = false
}
function closeDecree() {
  viewingDecree.value = null
}
function resetForm(decree?: GovernmentDecree) {
  Object.assign(form, decree ? {
    id: decree.id, documentNumber: decree.documentNumber, title: decree.title, summary: decree.summary ?? '', body: decree.body,
    effectiveAt: decree.effectiveAt ?? new Date().toISOString().slice(0, 10), authorPosition: decree.authorPosition ?? 'Член Правительства',
  } : { id: 0, documentNumber: '', title: '', summary: '', body: '', effectiveAt: new Date().toISOString().slice(0, 10), authorPosition: 'Член Правительства' })
  editing.value = true
}
function saveDecree() {
  const titleLength = form.title.trim().length
  const bodyLength = form.body.trim().length
  if (titleLength < 3) {
    window.twinkleBrowser?.notify(`Название указа должно содержать минимум 3 символа. Сейчас: ${titleLength}.`, { variant: 'error' })
    return
  }
  if (bodyLength < 20) {
    window.twinkleBrowser?.notify(`Текст указа должен содержать минимум 20 символов. Сейчас: ${bodyLength}.`, { variant: 'error' })
    return
  }
  if (!form.effectiveAt) {
    window.twinkleBrowser?.notify('Укажите дату вступления указа в силу.', { variant: 'error' })
    return
  }
  callClientEvent('government-computer:saveDecreeFromBrowser', JSON.stringify(form))
}
function deleteDecree(decree: GovernmentDecree) {
  decreePendingDelete.value = decree
}
function cancelDelete() {
  decreePendingDelete.value = null
}
function confirmDelete() {
  if (!decreePendingDelete.value) return
  callClientEvent('government-computer:deleteDecreeFromBrowser', decreePendingDelete.value.id)
  decreePendingDelete.value = null
}
function orderMaterials() {
  if (!selectedFraction.value || !material.value) return
  const amount = Math.floor(Number(materialAmount.value))
  if (amount < material.value.minAmount || amount > material.value.maxAmount) {
    window.twinkleBrowser?.notify(`Количество: от ${material.value.minAmount} до ${material.value.maxAmount}.`, { variant: 'error' })
    return
  }
  callClientEvent('government-computer:orderMaterialsFromBrowser', selectedFraction.value, amount)
}
type GovernmentComputerResult = { operation?: string; success?: boolean; message?: string; decreeId?: number; title?: string }
function handleOperationResult(event: Event) {
  const result = (event as CustomEvent<GovernmentComputerResult>).detail
  if (result?.operation !== 'saveDecree') return
  window.twinkleBrowser?.notify(result.message || (result.success ? 'Указ сохранён.' : 'Не удалось сохранить указ.'), {
    variant: result.success ? 'success' : 'error',
  })
  if (result.success) {
    editing.value = false
    search.value = ''
    const saved = payload.value?.decrees.find((decree) => decree.id === Number(result.decreeId))
    viewingDecree.value = saved ?? { ...form, id: Number(result.decreeId || form.id), authorName: payload.value?.actor.name || '', version: 1, createdAt: new Date().toISOString(), pdfUrl: undefined }
  }
}
onMounted(() => window.addEventListener('twinkle:government-computer:result', handleOperationResult))
onBeforeUnmount(() => window.removeEventListener('twinkle:government-computer:result', handleOperationResult))

function date(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value))
}
</script>

<template>
  <main class="government-computer">
    <div class="monitor">
      <div class="monitor__screen">
        <section class="terminal">
      <header class="topbar">
        <div class="identity"><span><Landmark /></span><div><strong>SA GOVERNMENT</strong><small>Защищённая государственная сеть</small></div></div>
        <div class="session"><Building2 /><div><strong>{{ payload?.actor.fractionName ?? 'Государственная организация' }}</strong><small>{{ payload?.actor.name }}</small></div></div>
        <button class="close" type="button" aria-label="Закрыть" @click="callClientEvent('government-computer:closeFromBrowser')"><X /></button>
      </header>

      <div class="workspace">
        <nav class="sidebar">
          <div class="sidebar-title">Сервисы</div>
          <button :class="{ active: tab === 'decrees' }" @click="tab = 'decrees'; editing = false; viewingDecree = null"><FileText /><span>Указы</span></button>
          <button v-if="permissions.canOrderMaterials" :class="{ active: tab === 'materials' }" @click="tab = 'materials'"><PackageOpen /><span>Материалы</span></button>
          <div class="security"><i></i><span>Соединение защищено</span></div>
        </nav>

        <section v-if="tab === 'decrees' && !editing && !viewingDecree" class="content">
          <div class="content-head"><div><small>Документооборот</small><h1>Указы правительства</h1><p>Официальные нормативные документы штата San Andreas</p></div><button v-if="permissions.canManageDecrees" class="primary" @click="resetForm()"><FilePlus2 /> Новый указ</button></div>
          <div v-if="payload?.documentStorage && !payload.documentStorage.ready" class="storage-warning">
            Публикация новых PDF-документов временно отключена администратором сервера. Просмотр ранее опубликованных указов доступен.
          </div>
          <label class="search"><Search /><input v-model="search" placeholder="Поиск по названию или номеру" /></label>
          <div class="decree-list">
            <article v-for="decree in decrees" :key="decree.id" class="decree-card" role="button" tabindex="0" @click="openDecree(decree)" @keydown.enter="openDecree(decree)">
              <div class="document-icon"><FileText /></div>
              <div class="decree-copy"><div><span>Указ № {{ decree.documentNumber }}</span><time>{{ date(decree.createdAt) }}</time></div><h2>{{ decree.title }}</h2><p>{{ decree.summary || decree.body.slice(0, 170) }}</p><footer><b>{{ decree.authorName }}</b><span>Версия {{ decree.version }}</span></footer></div>
              <div class="actions"><a v-if="decree.pdfUrl" :href="decree.pdfUrl" target="_blank" @click.stop>PDF</a><button v-if="permissions.canManageDecrees" title="Изменить" @click.stop="resetForm(decree)"><Pencil /></button><button v-if="permissions.canManageDecrees" class="danger" title="Удалить" @click.stop="deleteDecree(decree)"><Trash2 /></button></div>
            </article>
            <div v-if="!decrees.length" class="empty"><FileText /><strong>Указы не найдены</strong><span>Опубликованные документы появятся здесь</span></div>
          </div>
        </section>

        <section v-else-if="tab === 'decrees' && viewingDecree && !editing" class="decree-view">
          <div class="decree-view__toolbar">
            <button class="ghost" type="button" @click="closeDecree">К списку</button>
            <div>
              <a v-if="viewingDecree.pdfUrl" class="ghost" :href="viewingDecree.pdfUrl" target="_blank">Открыть PDF</a>
              <button v-if="permissions.canManageDecrees" class="primary" type="button" @click="resetForm(viewingDecree)"><Pencil /> Редактировать</button>
            </div>
          </div>
          <div class="decree-view__canvas">
            <article class="paper paper--view">
              <header><Landmark /><small>GOVERNMENT OF SAN ANDREAS</small><h2>УКАЗ ПРАВИТЕЛЬСТВА</h2><p>№ {{ viewingDecree.documentNumber }} · {{ date(viewingDecree.createdAt) }}</p></header>
              <h1>{{ viewingDecree.title }}</h1>
              <em v-if="viewingDecree.summary">{{ viewingDecree.summary }}</em>
              <div class="paper-body">{{ viewingDecree.body }}</div>
              <footer><span>Вступает в силу: {{ date(viewingDecree.effectiveAt) }}</span><b>{{ viewingDecree.authorPosition }}<br />{{ viewingDecree.authorName }}</b></footer>
            </article>
          </div>
        </section>
        <section v-else-if="tab === 'decrees'" class="editor">
          <div class="form-panel">
            <div class="content-head compact"><div><small>Редактор документов</small><h1>{{ form.id ? 'Изменение указа' : 'Новый указ' }}</h1></div><button class="ghost" @click="editing = false; viewingDecree = form.id ? payload?.decrees.find((item) => item.id === form.id) ?? null : null">К списку</button></div>
            <div class="fields"><label><span>Номер указа</span><input v-model="form.documentNumber" placeholder="Будет присвоен автоматически" /></label><label><span>Вступает в силу</span><input v-model="form.effectiveAt" type="date" /></label><label class="wide"><span>Название <small>{{ form.title.trim().length }}/3 минимум</small></span><input v-model="form.title" maxlength="180" placeholder="О чём настоящий указ" /></label><label class="wide"><span>Краткое описание</span><textarea v-model="form.summary" rows="3" maxlength="500"></textarea></label><label class="wide grow"><span>Текст указа <small>{{ form.body.trim().length }}/20 минимум</small></span><textarea v-model="form.body" placeholder="Введите положения указа. Разделяйте абзацы пустой строкой."></textarea></label><label class="wide"><span>Должность подписанта</span><input v-model="form.authorPosition" maxlength="128" /></label></div>
            <button class="primary publish" @click="saveDecree"><FilePlus2 /> {{ form.id ? 'Сохранить новую версию' : 'Опубликовать указ' }}</button>
          </div>
          <div class="preview-wrap"><span>Предпросмотр документа</span><article class="paper"><header><Landmark /><small>GOVERNMENT OF SAN ANDREAS</small><h2>УКАЗ ПРАВИТЕЛЬСТВА</h2><p>№ {{ form.documentNumber || 'АВТО' }} · {{ date(new Date().toISOString()) }}</p></header><h1>{{ form.title || 'Название указа' }}</h1><em v-if="form.summary">{{ form.summary }}</em><div class="paper-body">{{ form.body || 'Текст документа будет отображаться здесь в процессе заполнения.' }}</div><footer><span>Вступает в силу: {{ date(form.effectiveAt) }}</span><b>{{ form.authorPosition }}<br />{{ payload?.actor.name }}</b></footer></article></div>
        </section>

        <section v-else class="content materials">
          <div class="content-head"><div><small>Государственное снабжение</small><h1>Закупка материалов</h1><p>Оплата производится из казны Government</p></div><div class="treasury"><Landmark /><span>Казна Government<small>$ {{ money.format(material?.treasury ?? 0) }}</small></span></div></div>
          <div v-if="permissions.canOrderMaterials" class="purchase-grid">
            <div class="purchase-form"><h2>Новый заказ</h2><label><span>Организация-получатель</span><TwinkleSelect v-model="selectedFractionValue" :options="fractionOptions" aria-label="Организация-получатель" variant="government" /></label><label><span>Количество материалов</span><input v-model.number="materialAmount" type="number" :min="material?.minAmount" :max="material?.maxAmount" /></label><div class="calculation"><span>Цена за единицу<b>$ {{ money.format(material?.unitPrice ?? 0) }}</b></span><span>Итого<b>$ {{ money.format(totalPrice) }}</b></span></div><button class="primary order" :disabled="totalPrice > (material?.treasury ?? 0)" @click="orderMaterials"><ShoppingCart /> Оплатить и создать заказ</button></div>
            <div class="orders"><h2>Последние заказы</h2><div v-for="order in material?.orders" :key="order.id" class="order-row"><span>#{{ order.id }}</span><div><strong>{{ order.targetName }}</strong><small>{{ money.format(order.amount) }} материалов · {{ date(order.createdAt) }}</small></div><b>$ {{ money.format(order.totalPrice) }}</b></div><div v-if="!material?.orders.length" class="empty small"><PackageOpen /><span>Заказов пока нет</span></div></div>
          </div>
          <div v-else class="empty denied"><Landmark /><strong>Только для Government</strong><span>Для закупки материалов необходимо соответствующее право ранга.</span></div>
        </section>
      </div>

          <section v-if="decreePendingDelete" class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-decree-title" @click.self="cancelDelete">
            <div class="confirm-modal__panel">
              <span class="confirm-modal__icon"><Trash2 /></span>
              <h2 id="delete-decree-title">Удалить указ?</h2>
              <p>Вы уверены, что хотите удалить указ <strong>«{{ decreePendingDelete.title }}»</strong>?</p>
              <div class="confirm-modal__actions">
                <button class="confirm-modal__delete" type="button" @click="confirmDelete"><Trash2 /> Удалить</button>
                <button class="confirm-modal__cancel" type="button" @click="cancelDelete">Отменить</button>
              </div>
            </div>
          </section>
        </section>
      </div>
      <img class="monitor__frame" src="/assets/government-computer/monitor-frame.png" alt="" draggable="false" />
    </div>
  </main>
</template>

<style scoped lang="scss">
.government-computer,.government-computer *{box-sizing:border-box}.government-computer{display:grid;width:100vw;height:100vh;place-items:center;overflow:hidden;color:#f7f8fb;background:transparent;font-family:'SF Pro Display','Segoe UI',sans-serif}.monitor{position:relative;width:min(96vw,128vh);aspect-ratio:1199/881}.monitor__screen{position:absolute;z-index:1;top:4.54%;left:3.5%;width:93%;height:69.58%;overflow:hidden;background:#080b12}.monitor__frame{position:absolute;z-index:2;inset:0;width:100%;height:100%;pointer-events:none;user-select:none}.terminal{display:flex;position:relative;width:100%;height:100%;overflow:hidden;background:#080b12}.topbar{display:flex;position:absolute;z-index:2;top:0;right:0;left:0;height:px-to-vh(72);align-items:center;padding:0 px-to-vh(22);border-bottom:px-to-vh(1) solid rgb(255 255 255 / 8%);background:#0c1019}.identity,.session{display:flex;align-items:center;gap:px-to-vh(11)}.identity>span{display:grid;width:px-to-vh(40);height:px-to-vh(40);place-items:center;border-radius:px-to-vh(8);color:#df62f0;background:rgb(224 0 255 / 13%)}.identity svg,.session svg{width:px-to-vh(20)}.identity strong,.identity small,.session strong,.session small{display:block}.identity strong{font-size:px-to-vh(13);letter-spacing:px-to-vh(1)}.identity small,.session small{margin-top:px-to-vh(3);color:rgb(255 255 255 / 40%);font-size:px-to-vh(9)}.session{margin-left:auto;margin-right:px-to-vh(18);color:rgb(255 255 255 / 65%)}.session strong{font-size:px-to-vh(11);color:#fff}.close{display:grid;width:px-to-vh(36);height:px-to-vh(36);place-items:center;border:px-to-vh(1) solid rgb(255 255 255 / 9%);border-radius:px-to-vh(6);color:#b85bc5;background:rgb(255 255 255 / 3%);cursor:pointer}.close svg{width:px-to-vh(18)}.workspace{display:flex;width:100%;padding-top:px-to-vh(72)}.sidebar{display:flex;width:px-to-vh(210);flex-direction:column;padding:px-to-vh(24) px-to-vh(14);border-right:px-to-vh(1) solid rgb(255 255 255 / 7%);background:#090c13}.sidebar-title{padding:0 px-to-vh(10) px-to-vh(10);color:rgb(255 255 255 / 28%);font-size:px-to-vh(9);letter-spacing:px-to-vh(1.1);text-transform:uppercase}.sidebar button{display:flex;height:px-to-vh(44);align-items:center;gap:px-to-vh(11);padding:0 px-to-vh(12);border:0;border-radius:px-to-vh(6);color:rgb(255 255 255 / 50%);background:transparent;cursor:pointer;font-size:px-to-vh(11);text-align:left}.sidebar button svg{width:px-to-vh(18)}.sidebar button.active,.sidebar button:hover{color:#fff;background:linear-gradient(90deg,rgb(224 0 255 / 16%),rgb(224 0 255 / 3%))}.sidebar button.active svg{color:#e000ff}.security{display:flex;align-items:center;gap:px-to-vh(7);margin-top:auto;padding:px-to-vh(10);color:rgb(255 255 255 / 28%);font-size:px-to-vh(8)}.security i{width:px-to-vh(6);height:px-to-vh(6);border-radius:50%;background:#40ff81;box-shadow:0 0 px-to-vh(10) #40ff81}.content{flex:1;min-width:0;padding:px-to-vh(28) px-to-vh(32);overflow:auto}.content-head{display:flex;align-items:center;margin-bottom:px-to-vh(22)}.content-head>div:first-child{flex:1}.content-head small{color:#c459d2;font-size:px-to-vh(9);letter-spacing:px-to-vh(1);text-transform:uppercase}.content-head h1{margin:px-to-vh(5) 0 0;font-size:px-to-vh(24)}.content-head p{margin:px-to-vh(6) 0 0;color:rgb(255 255 255 / 38%);font-size:px-to-vh(10)}button.primary{display:flex;height:px-to-vh(38);align-items:center;justify-content:center;gap:px-to-vh(7);padding:0 px-to-vh(15);border:0;border-radius:px-to-vh(5);color:#fff;background:linear-gradient(135deg,#b300cc,#77008a);cursor:pointer;font-size:px-to-vh(10);font-weight:600}button.primary svg{width:px-to-vh(15)}button.primary:disabled{opacity:.35;cursor:not-allowed}.search{display:flex;height:px-to-vh(40);align-items:center;gap:px-to-vh(9);margin-bottom:px-to-vh(16);padding:0 px-to-vh(13);border:px-to-vh(1) solid rgb(255 255 255 / 8%);border-radius:px-to-vh(6);background:rgb(255 255 255 / 3%)}.search svg{width:px-to-vh(15);color:rgb(255 255 255 / 28%)}input,textarea,select{width:100%;border:px-to-vh(1) solid rgb(255 255 255 / 9%);outline:none;color:#fff;background:#0c1019;font:inherit}.search input{border:0;background:transparent;font-size:px-to-vh(10)}.decree-list{display:flex;flex-direction:column;gap:px-to-vh(10)}.decree-card{display:flex;gap:px-to-vh(14);cursor:pointer;transition:border-color 140ms ease,background 140ms ease,transform 140ms ease;padding:px-to-vh(16);border:px-to-vh(1) solid rgb(255 255 255 / 7%);border-radius:px-to-vh(7);background:rgb(255 255 255 / 2%)}.decree-card:hover,.decree-card:focus-visible{border-color:rgb(224 0 255 / 24%);background:rgb(224 0 255 / 5%);outline:none;transform:translateY(px-to-vh(-1))}.document-icon{display:grid;width:px-to-vh(45);height:px-to-vh(45);flex:0 0 auto;place-items:center;border-radius:px-to-vh(6);color:#df62f0;background:rgb(224 0 255 / 10%)}.document-icon svg{width:px-to-vh(21)}.decree-copy{flex:1;min-width:0}.decree-copy>div{display:flex;gap:px-to-vh(12);color:#c459d2;font-size:px-to-vh(8);text-transform:uppercase}.decree-copy time{color:rgb(255 255 255 / 28%)}.decree-copy h2{margin:px-to-vh(6) 0;font-size:px-to-vh(13)}.decree-copy p{max-width:px-to-vh(720);margin:0;color:rgb(255 255 255 / 42%);font-size:px-to-vh(9);line-height:1.45}.decree-copy footer{display:flex;gap:px-to-vh(12);margin-top:px-to-vh(10);font-size:px-to-vh(8)}.decree-copy footer span{color:rgb(255 255 255 / 28%)}.actions{display:flex;align-items:flex-start;gap:px-to-vh(6)}.actions button,.actions a,.ghost{display:grid;height:px-to-vh(30);padding:0 px-to-vh(9);place-items:center;border:px-to-vh(1) solid rgb(255 255 255 / 8%);border-radius:px-to-vh(4);color:rgb(255 255 255 / 60%);background:rgb(255 255 255 / 3%);cursor:pointer;font-size:px-to-vh(8);text-decoration:none}.actions svg{width:px-to-vh(13)}.actions .danger{color:#ff6b7a}.empty{display:flex;min-height:px-to-vh(220);align-items:center;justify-content:center;flex-direction:column;gap:px-to-vh(7);color:rgb(255 255 255 / 28%)}.empty svg{width:px-to-vh(30)}.empty strong{color:rgb(255 255 255 / 65%);font-size:px-to-vh(12)}.empty span{font-size:px-to-vh(9)}.decree-view{display:flex;flex:1;min-width:0;flex-direction:column;overflow:hidden;background:#05070b}.decree-view__toolbar{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;padding:px-to-vh(14) px-to-vh(22);border-bottom:px-to-vh(1) solid rgb(255 255 255 / 7%);background:#0b0f17}.decree-view__toolbar>div{display:flex;align-items:center;gap:px-to-vh(8)}.decree-view__toolbar a.ghost{display:flex;align-items:center;text-decoration:none}.decree-view__canvas{flex:1;padding:px-to-vh(24);overflow:auto}.paper--view{min-height:px-to-vh(650)}.editor{display:grid;flex:1;min-width:0;grid-template-columns:minmax(0,1fr) minmax(px-to-vh(420),.8fr);overflow:hidden}.form-panel{display:flex;min-width:0;flex-direction:column;padding:px-to-vh(25) px-to-vh(28);overflow:auto}.compact{margin-bottom:px-to-vh(18)}.fields{display:grid;grid-template-columns:1fr 1fr;gap:px-to-vh(12)}.fields label{display:flex;flex-direction:column;gap:px-to-vh(6)}.fields label>span,.purchase-form label>span{display:flex;align-items:center;justify-content:space-between;color:rgb(255 255 255 / 42%);font-size:px-to-vh(9)}.fields label>span small{color:rgb(255 255 255 / 25%);font-size:px-to-vh(8);font-weight:400}.fields input,.fields textarea,.purchase-form input,.purchase-form select{min-height:px-to-vh(38);padding:px-to-vh(10);border-radius:px-to-vh(5);font-size:px-to-vh(10)}.fields .wide{grid-column:1/-1}.fields textarea{resize:none;line-height:1.5}.fields .grow textarea{height:px-to-vh(220)}.publish{flex:0 0 auto;margin-top:px-to-vh(15)}.preview-wrap{padding:px-to-vh(22);overflow:auto;background:#05070b}.preview-wrap>span{display:block;margin-bottom:px-to-vh(10);color:rgb(255 255 255 / 30%);font-size:px-to-vh(8);text-align:center;text-transform:uppercase}.paper{width:min(100%,px-to-vh(500));min-height:px-to-vh(690);margin:auto;padding:px-to-vh(48);color:#171717;background:#f8f7f3;box-shadow:0 px-to-vh(18) px-to-vh(55) #000}.paper header{text-align:center}.paper header svg{width:px-to-vh(28);color:#181818}.paper header small{display:block;margin-top:px-to-vh(5);font-size:px-to-vh(7);letter-spacing:px-to-vh(1)}.paper header h2{margin:px-to-vh(8) 0 px-to-vh(4);font-family:Georgia,serif;font-size:px-to-vh(14)}.paper header p{margin:0;color:#666;font-size:px-to-vh(7)}.paper>h1{margin:px-to-vh(30) 0 px-to-vh(15);font-family:Georgia,serif;font-size:px-to-vh(18);text-align:center}.paper>em{display:block;color:#555;font-family:Georgia,serif;font-size:px-to-vh(9);line-height:1.5}.paper-body{margin-top:px-to-vh(20);white-space:pre-wrap;font-family:Georgia,serif;font-size:px-to-vh(10);line-height:1.65}.paper footer{display:flex;align-items:flex-end;justify-content:space-between;margin-top:px-to-vh(45);font-family:Georgia,serif;font-size:px-to-vh(8)}.paper footer b{text-align:right}.treasury{display:flex!important;flex:0 0 auto!important;align-items:center;gap:px-to-vh(10);padding:px-to-vh(11) px-to-vh(15);border:px-to-vh(1) solid rgb(224 0 255 / 18%);border-radius:px-to-vh(6);background:rgb(224 0 255 / 6%)}.treasury svg{width:px-to-vh(21);color:#df62f0}.treasury span,.treasury small{display:block}.treasury span{color:rgb(255 255 255 / 42%);font-size:px-to-vh(8)}.treasury small{margin-top:px-to-vh(3);color:#fff;font-size:px-to-vh(14);letter-spacing:0;text-transform:none}.purchase-grid{display:grid;grid-template-columns:minmax(px-to-vh(350),.75fr) 1fr;gap:px-to-vh(16)}.purchase-form,.orders{padding:px-to-vh(20);border:px-to-vh(1) solid rgb(255 255 255 / 7%);border-radius:px-to-vh(7);background:rgb(255 255 255 / 2%)}.purchase-form h2,.orders h2{margin:0 0 px-to-vh(18);font-size:px-to-vh(13)}.purchase-form label{display:flex;flex-direction:column;gap:px-to-vh(7);margin-bottom:px-to-vh(12)}.calculation{margin:px-to-vh(18) 0;padding:px-to-vh(13);border-radius:px-to-vh(5);background:#0c1019}.calculation span{display:flex;justify-content:space-between;margin:px-to-vh(6) 0;color:rgb(255 255 255 / 38%);font-size:px-to-vh(9)}.calculation b{color:#fff}.order{width:100%}.order-row{display:grid;grid-template-columns:px-to-vh(35) 1fr auto;align-items:center;gap:px-to-vh(9);padding:px-to-vh(11) 0;border-bottom:px-to-vh(1) solid rgb(255 255 255 / 6%);font-size:px-to-vh(9)}.order-row>span{color:#c459d2}.order-row strong,.order-row small{display:block}.order-row small{margin-top:px-to-vh(3);color:rgb(255 255 255 / 32%)}.order-row>b{color:#df62f0}.empty.small{min-height:px-to-vh(130)}.denied{height:70%}.confirm-modal{display:grid;position:absolute;z-index:20;inset:0;place-items:center;padding:px-to-vh(24);background:rgb(2 4 9 / 76%);}.confirm-modal__panel{width:min(px-to-vh(390),90%);padding:px-to-vh(25);border:px-to-vh(1) solid rgb(255 255 255 / 10%);border-radius:px-to-vh(9);background:linear-gradient(145deg,#111722,#090c13);box-shadow:0 px-to-vh(22) px-to-vh(70) rgb(0 0 0 / 65%);text-align:center}.confirm-modal__icon{display:grid;width:px-to-vh(44);height:px-to-vh(44);margin:0 auto px-to-vh(14);place-items:center;border-radius:px-to-vh(8);color:#ff5b67;background:rgb(255 61 75 / 12%)}.confirm-modal__icon svg{width:px-to-vh(20)}.confirm-modal h2{margin:0;color:#fff;font-size:px-to-vh(17)}.confirm-modal p{margin:px-to-vh(10) 0 px-to-vh(22);color:rgb(255 255 255 / 52%);font-size:px-to-vh(10);line-height:1.5}.confirm-modal p strong{color:#fff;font-weight:600}.confirm-modal__actions{display:grid;grid-template-columns:1fr 1fr;gap:px-to-vh(9)}.confirm-modal__actions button{display:flex;height:px-to-vh(38);align-items:center;justify-content:center;gap:px-to-vh(6);border:0;border-radius:px-to-vh(5);color:#fff;cursor:pointer;font-size:px-to-vh(10);font-weight:600}.confirm-modal__actions svg{width:px-to-vh(14)}.confirm-modal__cancel{background:rgb(255 255 255 / 10%)}.confirm-modal__cancel:hover{background:rgb(255 255 255 / 15%)}.confirm-modal__delete{background:linear-gradient(135deg,#e54855,#a51f2a)}.confirm-modal__delete:hover{filter:brightness(1.1)}
.storage-warning {
  margin: px-to-vh(-8) 0 px-to-vh(16);
  padding: px-to-vh(10) px-to-vh(12);
  border: px-to-vh(1) solid rgb(255 184 77 / 28%);
  border-radius: px-to-vh(6);
  color: #ffd18a;
  background: rgb(255 153 0 / 8%);
  font-size: px-to-vh(9);
  line-height: 1.45;
}
</style>
