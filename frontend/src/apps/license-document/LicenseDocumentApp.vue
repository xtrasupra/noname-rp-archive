<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap, LicenseDocumentPayload } from '@/shared/contracts/ui'

import DocumentIdentityCard from './components/DocumentIdentityCard.vue'
import DocumentLicenseCard from './components/DocumentLicenseCard.vue'
import DocumentMedicalCertificate from './components/DocumentMedicalCertificate.vue'

const props = defineProps<{ payload?: InterfacePayloadMap['licenseDocument'] }>()

const fallbackDocument: LicenseDocumentPayload = {
  contractVersion: 1,
  documentKind: 'identity',
  id: 'identity_card',
  type: 'SAN ANDREAS IDENTIFICATION CARD',
  title: 'Удостоверение личности',
  firstName: 'New',
  lastName: 'Player',
  fullName: 'New Player',
  age: 25,
  gender: 'Мужской',
  residence: 'Нет прописки',
  maritalStatus: 'Не состоит в браке',
  issuedAt: '01.01.2026',
  number: '000001',
  signature: 'N. Player',
  ownerStaticId: 1,
}

const document = computed<LicenseDocumentPayload>(() => ({
  ...fallbackDocument,
  ...(props.payload || {}),
}))

const documentKind = computed(() => {
  if (props.payload?.documentKind) return props.payload.documentKind
  if (document.value.id === 'medical_certificate') return 'medical'
  if (document.value.id === 'identity_card') return 'identity'
  return 'license'
})

const close = () => callClientEvent('document:closeFromBrowser')
</script>

<template>
  <main class="document-viewer" data-interface="licenseDocument" aria-label="Документ">
    <Transition name="document-card" appear>
      <article class="document-viewer__card">
        <button class="document-viewer__close" type="button" aria-label="Закрыть документ" @click="close">
          <X :size="20" :stroke-width="2.2" />
        </button>

        <DocumentIdentityCard v-if="documentKind === 'identity'" :document="document" />
        <DocumentMedicalCertificate v-else-if="documentKind === 'medical'" :document="document" />
        <DocumentLicenseCard v-else :document="document" />
      </article>
    </Transition>
  </main>
</template>

<style scoped>
.document-viewer { position: fixed; inset: 0; z-index: 180; pointer-events: none; font-family: "SF Pro Display", "SF Pro Text", "Segoe UI", Arial, sans-serif; }
.document-viewer__card { position: absolute; top: 50%; left: 50%; width: min(90vw, 560px); transform: translate(-50%, -50%); pointer-events: auto; }
.document-viewer__close { position: absolute; z-index: 5; top: 17px; right: 17px; display: grid; width: 32px; height: 32px; place-items: center; padding: 0; border: 1px solid rgba(25, 61, 105, .42); border-radius: 7px; color: #214b80; background: rgba(255, 255, 255, .72); cursor: pointer; transition: transform 140ms ease, background-color 140ms ease; }
.document-viewer__close:hover { transform: scale(1.05); background: #fff; }
.document-card-enter-active, .document-card-leave-active { transition: opacity 180ms ease, transform 220ms ease; }
.document-card-enter-from, .document-card-leave-to { opacity: 0; transform: translate(-50%, -47%) scale(.97); }
@media (max-width: 760px) { .document-viewer__card { width: min(92vw, 540px); } }
</style>
