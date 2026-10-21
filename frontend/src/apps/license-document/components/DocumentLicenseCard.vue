<script setup lang="ts">
import { computed } from 'vue'
import type { LicenseDocumentPayload } from '@/shared/contracts/ui'

const props = defineProps<{ document: LicenseDocumentPayload }>()
const holderName = computed(() => props.document.fullName || `${props.document.firstName || ''} ${props.document.lastName || ''}`.trim())
const sex = computed(() => String(props.document.gender || '—').startsWith('Ж') ? 'F' : 'M')
const category = computed(() => props.document.category || props.document.title || '—')
</script>

<template>
  <section class="license-card">
    <header class="license-card__header">
      <div><small>LOS SANTOS</small><strong>DMV</strong></div><span>LICENSE CARD</span><b>N°{{ document.number || document.ownerStaticId || '000000' }}</b>
    </header>
    <div class="license-card__rule" />
    <div class="license-card__body">
      <figure class="license-card__photo"><img v-if="document.photo" :src="document.photo" alt="" draggable="false"><span v-else /></figure>
      <dl>
        <div><dt>Имя Фамилия</dt><dd>{{ holderName || '—' }}</dd></div><div><dt>Пол</dt><dd>{{ sex }}</dd></div>
        <div class="wide"><dt>Место жительства</dt><dd>{{ document.residence || 'Нет прописки' }}</dd></div>
        <div><dt>Дата выдачи</dt><dd>{{ document.issuedAt || '—' }}</dd></div><div><dt>Действует до</dt><dd>{{ document.expiresAt || '—' }}</dd></div>
      </dl>
    </div>
    <div class="license-card__barcode" aria-hidden="true" />
    <footer><strong>{{ category }}</strong><span>{{ document.signature || holderName }}</span></footer>
  </section>
</template>

<style scoped>
.license-card{position:relative;box-sizing:border-box;min-height:382px;padding:24px 28px 22px;overflow:hidden;border:1px solid rgba(43,92,148,.24);border-radius:18px;color:#24528b;background:linear-gradient(115deg,rgba(255,255,255,.96),rgba(243,249,252,.9)),repeating-linear-gradient(55deg,rgba(41,104,164,.09) 0 1px,transparent 1px 7px)}
.license-card::after{position:absolute;inset:-30%;content:"";opacity:.22;background:repeating-radial-gradient(ellipse at 72% 42%,transparent 0 13px,#5aa0c4 14px 15px);transform:rotate(-18deg);pointer-events:none}
.license-card__header,.license-card__body,.license-card__rule,.license-card__barcode,.license-card footer{position:relative;z-index:1}.license-card__header{display:grid;grid-template-columns:110px 1fr;align-items:center;padding-right:52px}.license-card__header div{display:grid;line-height:.85}.license-card__header small{font-size:12px;letter-spacing:.22em}.license-card__header strong{font-size:42px;letter-spacing:-.06em}.license-card__header>span{font-size:29px;font-weight:500}.license-card__header>b{grid-column:2;font-size:14px}
.license-card__rule{height:2px;margin:12px 0 16px;background:#6088b7}.license-card__body{display:grid;grid-template-columns:180px 1fr;gap:24px}.license-card__photo{height:185px;margin:0;overflow:hidden;border-radius:50%;background:#d9dcdf}.license-card__photo img{width:100%;height:100%;object-fit:cover}.license-card__photo span{display:block;width:100%;height:100%;background:radial-gradient(circle at 50% 34%,#96999c 0 23%,transparent 24%),radial-gradient(ellipse at 50% 98%,#96999c 0 47%,transparent 48%)}
.license-card dl{display:grid;grid-template-columns:1fr 1fr;align-content:start;gap:14px 18px;margin:0}.license-card dl .wide{grid-column:1/-1}.license-card dt{color:#9099a6;font-size:13px}.license-card dd{margin:2px 0 0;color:#285894;font-size:15px;font-weight:600}.license-card__barcode{width:54%;height:42px;margin:-42px 0 9px auto;background:repeating-linear-gradient(90deg,#1e2630 0 2px,transparent 2px 5px,#1e2630 5px 6px,transparent 6px 9px)}
.license-card footer{display:flex;align-items:end;justify-content:space-between}.license-card footer strong{padding:7px 18px;border-radius:20px;color:white;background:#295b99}.license-card footer span{font-family:"Segoe Script",cursive;font-style:italic}
@media(max-width:650px){.license-card{min-height:330px;padding:20px}.license-card__header>span{font-size:22px}.license-card__body{grid-template-columns:130px 1fr;gap:16px}.license-card__photo{height:145px}.license-card dl{gap:8px 12px}.license-card__barcode{height:31px;margin-top:-31px}}
</style>
