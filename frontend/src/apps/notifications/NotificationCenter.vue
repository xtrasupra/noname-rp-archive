<script setup lang="ts">
import { computed } from 'vue'

import type { NotificationVariant } from '@/shared/contracts/notifications'

import { useInterfaceManagerStore } from '@/core/interfaces/interface-manager.store'

import { useNotificationStore } from '@/stores/notification.store'

const notificationStore = useNotificationStore()
const interfaceManager = useInterfaceManagerStore()

const icons: Record<NotificationVariant, string> = {
  error: '',
  info: 'i',
  success: '',
  warning: '!',
}

const notifications = computed(() => notificationStore.items)
const isLsCustomsActive = computed(() => interfaceManager.isActive('ls-customs'))
</script>

<template>
  <div class="notification-center" :class="{ 'notification-center--top': isLsCustomsActive }" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="notification-mirror" tag="div" class="notification-center__stack">
      <article
        v-for="item in notifications"
        :key="item.id"
        class="notification-card"
        :class="`notification-card--${item.variant}`"
        :style="{ '--notification-duration': `${item.duration}ms` }"
      >
        <div class="notification-card__glow"></div>

        <div class="notification-card__icon" aria-hidden="true">
          <svg
            v-if="item.variant === 'error'"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0.316468 0.316468C0.495989 0.137338 0.732664 0.026867 0.985262 0.00429944C1.23786 -0.0182681 1.49037 0.0484994 1.6988 0.192969L1.85047 0.316468L4.87513 3.3433L7.8998 0.316468C8.07932 0.137338 8.316 0.026867 8.56859 0.00429944C8.82119 -0.0182681 9.0737 0.0484994 9.28214 0.192969L9.4338 0.316468C9.61293 0.495989 9.7234 0.732664 9.74597 0.985262C9.76854 1.23786 9.70177 1.49037 9.5573 1.6988L9.4338 1.85047L6.40697 4.87513L9.4338 7.8998C9.61293 8.07932 9.7234 8.316 9.74597 8.56859C9.76854 8.82119 9.70177 9.0737 9.5573 9.28214L9.4338 9.4338C9.25428 9.61293 9.01761 9.7234 8.76501 9.74597C8.51241 9.76854 8.2599 9.70177 8.05147 9.5573L7.8998 9.4338L4.87513 6.40697L1.85047 9.4338C1.67095 9.61293 1.43427 9.7234 1.18167 9.74597C0.929076 9.76854 0.676566 9.70177 0.468135 9.5573L0.316468 9.4338C0.137338 9.25428 0.026867 9.01761 0.00429944 8.76501C-0.0182681 8.51241 0.0484994 8.2599 0.192969 8.05147L0.316468 7.8998L3.3433 4.87513L0.316468 1.85047C0.137338 1.67095 0.026867 1.43427 0.00429944 1.18167C-0.0182681 0.929076 0.0484994 0.676566 0.192969 0.468135L0.316468 0.316468Z"
              fill="url(#notification-error-gradient)"
            />
            <defs>
              <linearGradient
                id="notification-error-gradient"
                x1="0.565635"
                y1="5.3063"
                x2="5.64213"
                y2="10.5843"
                gradientUnits="userSpaceOnUse"
              >
                <stop stop-color="#FDFDFD" />
                <stop offset="1" stop-color="#FECBE6" />
              </linearGradient>
            </defs>
          </svg>
          <template v-else>{{ icons[item.variant] }}</template>
        </div>

        <div class="notification-card__content">
          <p class="notification-card__message">{{ item.message }}</p>
        </div>

        <button
          v-if="item.closable"
          type="button"
          class="notification-card__close"
          aria-label="Закрыть уведомление"
          @click="notificationStore.dismiss(item.id)"
        >
          x
        </button>

        <div v-if="item.duration > 0" class="notification-card__progress" aria-hidden="true"></div>
      </article>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-center {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding: 34px 34px 42px;
  pointer-events: none;
}

.notification-center--top {
  align-items: flex-start;
  padding: 34px;
}

.notification-center__stack {
  width: min(480px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification-card {
  --accent: #79b8ff;
  --accent-soft: rgba(121, 184, 255, 0.28);
  --accent-core: rgba(121, 184, 255, 0.9);
  --notification-duration: 4500ms;

  position: relative;
  min-height: 58px;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 26px;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  padding: 11px 14px 12px 15px;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 14px;
  color: #ffffff;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.1) 34%, rgba(0, 0, 0, 0.5)),
    radial-gradient(circle at 15% 0%, var(--accent-soft), transparent 40%),
    rgba(8, 10, 14, 0.82);
  box-shadow:
    0 14px 34px rgba(0, 0, 0, 0.46),
    0 0 0 1px rgba(255, 255, 255, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.42),
    inset 0 -18px 30px rgba(255, 255, 255, 0.05);
  pointer-events: auto;
}

.notification-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(115deg, transparent 0%, rgba(255, 255, 255, 0.4) 17%, transparent 31%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.2), transparent 38%);
  opacity: 0.72;
  transform: translateX(-38%);
  pointer-events: none;
}

.notification-card::after {
  content: '';
  position: absolute;
  left: 15px;
  right: 15px;
  bottom: 4px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.62), transparent);
  box-shadow: 0 12px 18px var(--accent-soft);
  opacity: 0.82;
}

.notification-card__progress {
  position: absolute;
  left: 15px;
  right: 15px;
  bottom: 0;
  height: 3px;
  overflow: hidden;
  border-radius: 999px 999px 0 0;
  background: rgba(255, 255, 255, 0.08);
}

.notification-card__progress::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.55), var(--accent-core)),
    var(--accent-core);
  box-shadow: 0 0 18px var(--accent-soft);
  transform-origin: left center;
  animation: notification-progress var(--notification-duration) linear forwards;
}

.notification-card--success {
  --accent: #53e6a2;
  --accent-soft: rgba(83, 230, 162, 0.28);
  --accent-core: rgba(83, 230, 162, 0.95);
}

.notification-card--warning {
  --accent: #ffd166;
  --accent-soft: rgba(255, 209, 102, 0.3);
  --accent-core: rgba(255, 209, 102, 0.95);
}

.notification-card--error {
  --accent: #ff6b7a;
  --accent-soft: rgba(255, 107, 122, 0.32);
  --accent-core: rgba(255, 107, 122, 0.96);
}

.notification-card--info {
  --accent: #7cc7ff;
  --accent-soft: rgba(124, 199, 255, 0.28);
  --accent-core: rgba(124, 199, 255, 0.95);
}

.notification-card__glow {
  position: absolute;
  top: -42px;
  right: -34px;
  width: 118px;
  height: 118px;
  border-radius: 999px;
  background: var(--accent-soft);
  opacity: 0.9;
  pointer-events: none;
}

.notification-card__icon {
  position: relative;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  color: #061014;
  font-size: 19px;
  font-weight: 800;
  line-height: 1;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.95), var(--accent)),
    var(--accent);
  box-shadow:
    0 10px 24px var(--accent-soft),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.notification-card--success .notification-card__icon::before {
  content: '';
  width: 7px;
  height: 12px;
  margin-top: -3px;
  border-right: 2px solid #061014;
  border-bottom: 2px solid #061014;
  transform: rotate(45deg);
}

.notification-card__content {
  position: relative;
  min-width: 0;
}

.notification-card__message {
  margin: 0;
  color: rgba(255, 255, 255, 0.88);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.notification-card__close {
  position: relative;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  transition:
    background 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;
}

.notification-card__close:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}

.notification-mirror-enter-active,
.notification-mirror-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s ease,
    filter 0.24s ease;
}

.notification-mirror-enter-from,
.notification-mirror-leave-to {
  opacity: 0;
  transform: translateY(24px) scale(0.96);
}

.notification-center--top .notification-mirror-enter-from,
.notification-center--top .notification-mirror-leave-to {
  transform: translateY(-24px) scale(0.96);
}

.notification-mirror-move {
  transition: transform 0.24s ease;
}

@keyframes notification-progress {
  from {
    transform: scaleX(1);
  }

  to {
    transform: scaleX(0);
  }
}

@media (max-width: 640px) {
  .notification-center {
    padding: 16px 16px 22px;
  }

  .notification-card {
    grid-template-columns: 34px minmax(0, 1fr) 26px;
    min-height: 56px;
    padding: 10px 13px 12px;
    border-radius: 13px;
  }

  .notification-card__icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }
}
</style>
