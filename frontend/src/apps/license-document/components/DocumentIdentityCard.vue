<script setup lang="ts">
import { computed } from 'vue'
import type { LicenseDocumentPayload } from '@/shared/contracts/ui'

const props = defineProps<{ document: LicenseDocumentPayload }>()
const holderName = computed(() => props.document.fullName || `${props.document.firstName || ''} ${props.document.lastName || ''}`.trim())
const staticId = computed(() => String(props.document.ownerStaticId || props.document.number || '0'))
const sex = computed(() => String(props.document.gender || '—').startsWith('Ж') ? 'F' : 'M')
</script>

<template>
  <section class="identity-card">
    <div class="identity-card__seal" aria-hidden="true">SA</div>
    <header class="identity-card__header">
      <div class="identity-card__brand"><span>SAN ANDREAS</span><strong>IDENTIFICATION CARD</strong></div>
      <b>LOS SANTOS</b>
    </header>
    <div class="identity-card__rule" />
    <div class="identity-card__body">
      <figure class="identity-card__photo">
        <img v-if="document.photo" :src="document.photo" alt="" draggable="false">
        <span v-else aria-hidden="true" />
      </figure>
      <dl class="identity-card__fields">
        <div class="identity-card__field"><dt>Имя Фамилия</dt><dd>{{ holderName || '—' }}</dd></div>
        <div class="identity-card__field"><dt>Возраст</dt><dd>{{ document.age || '—' }}</dd></div>
        <div class="identity-card__field"><dt>Static ID</dt><dd>{{ staticId }}</dd></div>
        <div class="identity-card__field"><dt>Пол</dt><dd>{{ sex }}</dd></div>
        <div class="identity-card__field"><dt>Место жительства</dt><dd>{{ document.residence || 'Нет прописки' }}</dd></div>
        <div class="identity-card__field"><dt>Дата выдачи</dt><dd>{{ document.issuedAt || '—' }}</dd></div>
        <div class="identity-card__field"><dt>Семейное положение</dt><dd>{{ document.maritalStatus || 'Не состоит в браке' }}</dd></div>
        <div class="identity-card__field"><dt>Подпись</dt><dd class="identity-card__signature">{{ document.signature || '—' }}</dd></div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.identity-card { position: relative; box-sizing: border-box; min-height: 382px; padding: 25px 28px 27px; overflow: hidden; border: 1px solid rgba(55,103,159,.24); border-radius: 18px; color: #244f87; background: linear-gradient(104deg,rgba(255,255,255,.94),rgba(245,248,252,.88)),repeating-linear-gradient(18deg,rgba(55,105,170,.07) 0 1px,transparent 1px 6px); }
.identity-card::after { position: absolute; inset: 0; content: ""; opacity: .45; background: radial-gradient(circle at 86% 45%,rgba(210,70,55,.13),transparent 30%),repeating-radial-gradient(ellipse at 70% 48%,transparent 0 9px,rgba(42,92,151,.08) 10px 11px); pointer-events: none; }
.identity-card__seal { position: absolute; z-index: 1; top: 23px; left: 27px; display: grid; width: 58px; height: 58px; place-items: center; border: 4px double #caa541; border-radius: 50%; color: #fff; background: #24518a; font-size: 14px; font-weight: 900; }
.identity-card__header { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; min-height: 62px; padding: 0 50px 0 76px; }
.identity-card__brand { display: grid; gap: 3px; }.identity-card__brand span { font-size: 28px; font-weight: 500; letter-spacing: .02em; }.identity-card__brand strong { font-size: 15px; letter-spacing: .04em; }.identity-card__header b { font-size: 15px; }
.identity-card__rule { position: relative; z-index: 1; height: 2px; margin: 8px 0 20px; background: #5d83bb; }
.identity-card__body { position: relative; z-index: 1; display: grid; grid-template-columns: 180px 1fr; gap: 25px; }
.identity-card__photo { display: grid; height: 190px; margin: 0; place-items: center; overflow: hidden; border-radius: 50%; background: #d9dce0; }.identity-card__photo img { width: 100%; height: 100%; object-fit: cover; }.identity-card__photo span { width: 100%; height: 100%; background: radial-gradient(circle at 50% 35%,#95989b 0 23%,transparent 24%),radial-gradient(ellipse at 50% 97%,#95989b 0 47%,transparent 48%); }
.identity-card__fields { display: grid; grid-template-columns: minmax(0,1fr) 105px; gap: 11px 22px; margin: 0; }.identity-card__field { min-width: 0; }.identity-card__field dt { color: #9299a6; font-size: 13px; }.identity-card__field dd { margin: 2px 0 0; overflow: hidden; color: #285595; font-size: 15px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }.identity-card__signature { font-family: "Segoe Script",cursive; font-style: italic; }
@media(max-width:650px){.identity-card{min-height:330px;padding:20px}.identity-card__brand span{font-size:21px}.identity-card__body{grid-template-columns:130px 1fr;gap:16px}.identity-card__photo{height:145px}.identity-card__fields{gap:7px 12px}.identity-card__header{padding-left:70px}.identity-card__seal{left:20px;width:48px;height:48px}}
</style>
