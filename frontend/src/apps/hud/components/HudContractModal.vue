<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { HudContractAction, HudContractModalPayload } from '@/shared/contracts/ui'

const props = defineProps<{
  contract?: HudContractModalPayload
}>()

const contractId = computed(() => props.contract?.id ?? `${props.contract?.title ?? ''}:${props.contract?.description ?? ''}`)
const visible = computed(() => Boolean(props.contract && (props.contract.enabled ?? true)))
const title = computed(() => props.contract?.title ?? '')
const description = computed(() => props.contract?.description ?? '')
const trueLabel = computed(() => props.contract?.trueAction?.label ?? 'Да')
const falseLabel = computed(() => props.contract?.falseAction?.label ?? 'Нет')
const pending = ref(false)
let pendingTimer: ReturnType<typeof setTimeout> | null = null

function clearPending() {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = null
  pending.value = false
}

function triggerClient(eventName: string, payload: unknown) {
  callClientEvent(eventName, JSON.stringify(payload))
}

function submitAction(type: 'true' | 'false', action?: HudContractAction) {
  if (pending.value) return

  const eventName = action?.event ?? (type === 'true' ? 'contract:accept' : 'contract:decline')
  const payload = action?.payload ?? {
    contractId: props.contract?.id ?? null,
    action: type,
  }

  pending.value = true
  triggerClient(eventName, payload)
  pendingTimer = setTimeout(clearPending, 5_000)
}

watch(
  () => contractId.value,
  clearPending,
)

watch(() => props.contract?.enabled, (enabled) => {
  if (enabled === false) clearPending()
})

onBeforeUnmount(clearPending)
</script>

<template>
  <Transition name="contract-modal">
    <section v-if="visible" class="contract-modal" aria-modal="true" role="dialog" :aria-label="title">
      <div class="contract-modal__backdrop"></div>

      <div class="contract-modal__panel">
        <div class="contract-modal__shine"></div>

        <div class="contract-modal__header">
          <div class="contract-modal__mark">
            <span></span>
          </div>

          <div class="contract-modal__copy">
            <p class="contract-modal__eyebrow">Договор</p>
            <h2 class="contract-modal__title">{{ title }}</h2>
          </div>
        </div>

        <p v-if="description" class="contract-modal__description">
          {{ description }}
        </p>

        <div class="contract-modal__actions">
          <button
            class="contract-modal__button contract-modal__button--true"
            type="button"
            :disabled="pending"
            @click="submitAction('true', contract?.trueAction)"
          >
            {{ trueLabel }}
          </button>

          <button
            class="contract-modal__button contract-modal__button--false"
            type="button"
            :disabled="pending"
            @click="submitAction('false', contract?.falseAction)"
          >
            {{ falseLabel }}
          </button>
        </div>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.contract-modal {
  --modal-scale: min(1vh, 1vw);
  --modal-width: min(calc(var(--modal-scale) * 52), calc(100vw - 4vh));
  --modal-radius: 1.2vh;
  --modal-text: #ffffff;
  --modal-muted: rgb(255 255 255 / 62%);
  --modal-border: rgb(255 255 255 / 10%);
  --modal-panel: linear-gradient(145deg, rgb(16 18 23 / 96%) 0%, rgb(28 18 29 / 96%) 55%, rgb(18 12 24 / 96%) 100%);

  position: absolute;
  inset: 0;
  z-index: 900;
  display: grid;
  place-items: center;
  color: var(--modal-text);
  font-family: "SF Pro Display", "Segoe UI", sans-serif;
  pointer-events: auto;
}

.contract-modal__backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at center, rgb(255 255 255 / 8%) 0, transparent 35%),
    rgb(0 0 0 / 42%);
}

.contract-modal__panel {
  position: relative;
  isolation: isolate;
  width: var(--modal-width);
  overflow: hidden;
  padding: 2.2vh;
  border: 0.1vh solid var(--modal-border);
  border-radius: var(--modal-radius);
  background: var(--modal-panel);
  box-shadow:
    0 2.6vh 8vh rgb(0 0 0 / 48%),
    inset 0 0 0 0.1vh rgb(255 255 255 / 4%);
}

.contract-modal__shine {
  position: absolute;
  top: -18vh;
  right: -15vh;
  z-index: -1;
  width: 34vh;
  height: 34vh;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(44 210 130 / 20%) 0, transparent 62%);
  pointer-events: none;
}

.contract-modal__header {
  display: grid;
  grid-template-columns: 4.8vh minmax(0, 1fr);
  align-items: center;
  gap: 1.4vh;
}

.contract-modal__mark {
  display: grid;
  width: 4.8vh;
  height: 4.8vh;
  place-items: center;
  border: 0.1vh solid rgb(255 255 255 / 10%);
  border-radius: 0.9vh;
  background: linear-gradient(145deg, rgb(255 255 255 / 14%), rgb(255 255 255 / 4%));
}

.contract-modal__mark span {
  position: relative;
  width: 2.2vh;
  height: 2.8vh;
  border: 0.22vh solid rgb(255 255 255 / 86%);
  border-radius: 0.35vh;
}

.contract-modal__mark span::before,
.contract-modal__mark span::after {
  position: absolute;
  left: 0.35vh;
  width: 1.05vh;
  height: 0.16vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 72%);
  content: "";
}

.contract-modal__mark span::before {
  top: 0.72vh;
}

.contract-modal__mark span::after {
  top: 1.32vh;
}

.contract-modal__copy {
  min-width: 0;
}

.contract-modal__eyebrow {
  margin: 0 0 0.35vh;
  color: rgb(92 234 151 / 92%);
  font-size: 1.15vh;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.2;
  text-transform: uppercase;
}

.contract-modal__title {
  margin: 0;
  color: #ffffff;
  font-size: 2vh;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.16;
  overflow-wrap: anywhere;
}

.contract-modal__description {
  margin: 1.6vh 0 0;
  color: var(--modal-muted);
  font-size: 1.35vh;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.contract-modal__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1vh;
  margin-top: 2.2vh;
}

.contract-modal__button {
  min-width: 0;
  height: 4.2vh;
  border: 0;
  border-radius: 0.7vh;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 1.35vh;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
  outline: none;
  transition:
    filter 150ms ease,
    transform 150ms ease,
    box-shadow 150ms ease;
}

.contract-modal__button--true {
  background: linear-gradient(180deg, #32d583 0%, #15924e 100%);
  box-shadow: 0 1vh 2.4vh rgb(28 180 96 / 28%);
}

.contract-modal__button--false {
  background: linear-gradient(180deg, #ff5d66 0%, #b8202a 100%);
  box-shadow: 0 1vh 2.4vh rgb(215 48 60 / 28%);
}

.contract-modal__button:hover,
.contract-modal__button:focus-visible {
  filter: brightness(1.08);
  transform: translateY(-0.18vh);
}

.contract-modal__button:active {
  filter: brightness(0.96);
  transform: translateY(0);
}

.contract-modal__button:disabled {
  cursor: wait;
  filter: grayscale(0.2) brightness(0.72);
  transform: none;
}

.contract-modal-enter-active,
.contract-modal-leave-active {
  transition: opacity 180ms ease;
}

.contract-modal-enter-active .contract-modal__panel,
.contract-modal-leave-active .contract-modal__panel {
  transition: transform 180ms ease, opacity 180ms ease;
}

.contract-modal-enter-from,
.contract-modal-leave-to {
  opacity: 0;
}

.contract-modal-enter-from .contract-modal__panel,
.contract-modal-leave-to .contract-modal__panel {
  opacity: 0;
  transform: translateY(1.6vh) scale(0.96);
}
</style>
