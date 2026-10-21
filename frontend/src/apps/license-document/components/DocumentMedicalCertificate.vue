<script setup lang="ts">
import { computed } from 'vue'
import { Check, HeartPulse } from 'lucide-vue-next'
import type { LicenseDocumentPayload } from '@/shared/contracts/ui'

const props = defineProps<{ document: LicenseDocumentPayload }>()
const holderName = computed(() => props.document.fullName || `${props.document.firstName || ''} ${props.document.lastName || ''}`.trim())
const checks = computed(() => [
  { label: 'Физическое здоровье', value: props.document.physicalHealthy === true },
  { label: 'Психическое здоровье', value: props.document.mentalHealthy === true },
])
</script>

<template>
  <section class="medical-certificate">
    <header><div class="medical-certificate__logo"><HeartPulse :size="35" :stroke-width="2.4" /></div><div><strong>ДЕПАРТАМЕНТ ЗДРАВООХРАНЕНИЯ</strong><span>{{ document.issuedAt }} · №{{ document.number }}</span></div></header>
    <div class="medical-certificate__watermark" aria-hidden="true"><HeartPulse :size="160" :stroke-width="1" /></div>
    <h1>{{ document.title || 'Врачебное свидетельство о здоровье' }}</h1>
    <div class="medical-certificate__patient"><span>Пациент</span><strong>{{ holderName || '—' }}</strong></div>
    <div class="medical-certificate__checks">
      <div v-for="check in checks" :key="check.label"><span>Врач: <b>{{ document.issuerName || 'Департамент здравоохранения' }}</b></span><strong :class="{ negative: !check.value }"><Check v-if="check.value" :size="19" />{{ check.value ? check.label : `Не подтверждено: ${check.label}` }}</strong></div>
    </div>
    <p v-if="document.notes" class="medical-certificate__notes">{{ document.notes }}</p>
    <p class="medical-certificate__validity">Свидетельство действительно до {{ document.expiresAt || 'отзыва' }}</p>
    <footer><span>{{ document.issuerName || 'Главный врач' }}</span><b>SA<br>EMS</b></footer>
  </section>
</template>

<style scoped>
.medical-certificate{position:relative;box-sizing:border-box;min-height:500px;padding:28px 30px 24px;overflow:hidden;border-radius:18px;color:#333;background:#fff}.medical-certificate header{position:relative;z-index:1;display:flex;align-items:center;gap:18px;padding-right:42px}.medical-certificate__logo{display:grid;width:66px;height:66px;place-items:center;border-radius:16px;color:#fff;background:#d33137}.medical-certificate header div:last-child{display:grid;gap:6px}.medical-certificate header strong{font-size:18px}.medical-certificate header span{color:#555;font-size:14px}
.medical-certificate__watermark{position:absolute;top:30px;left:50%;color:#d7d7d7;opacity:.36;transform:translateX(-50%)}.medical-certificate h1{position:relative;z-index:1;margin:42px 0 14px;text-align:center;font-size:22px}.medical-certificate__patient{position:relative;z-index:1;display:grid;gap:5px;text-align:center}.medical-certificate__patient span{color:#999}.medical-certificate__patient strong{color:#d33137;font-size:22px}
.medical-certificate__checks{position:relative;z-index:1;display:grid;gap:10px;margin:25px -30px 0}.medical-certificate__checks>div{display:grid;grid-template-columns:1fr 280px;align-items:center;gap:12px;padding:12px 30px;background:#f6f6f6}.medical-certificate__checks span{color:#929292}.medical-certificate__checks span b{color:#444}.medical-certificate__checks strong{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border-radius:6px;color:#fff;background:#d33137}.medical-certificate__checks strong.negative{background:#787878}
.medical-certificate__notes{position:relative;z-index:1;margin:15px 0 0;padding:10px 14px;border-left:3px solid #d33137;color:#555;background:#fafafa}.medical-certificate__validity{position:relative;z-index:1;margin:22px 0;text-align:center;color:#999}.medical-certificate footer{position:relative;z-index:1;display:flex;align-items:end;justify-content:space-between;padding-top:10px;border-top:1px solid #ddd}.medical-certificate footer span{font-family:"Segoe Script",cursive;color:#d33137;font-size:19px;font-style:italic}.medical-certificate footer b{display:grid;width:62px;height:62px;place-items:center;border:4px double #d33137;border-radius:50%;color:#d33137;text-align:center;font-size:12px;transform:rotate(-8deg)}
@media(max-width:650px){.medical-certificate{min-height:450px;padding:22px}.medical-certificate__checks{margin-inline:-22px}.medical-certificate__checks>div{grid-template-columns:1fr 230px;padding-inline:22px}.medical-certificate h1{margin-top:28px}}
</style>
