<script setup lang="ts">
import { Camera, Clock3, Gift, Handshake, RefreshCw } from 'lucide-vue-next'
import { callClientEvent } from '@/core/client-events/client-event'
import type { HudAction, InterfacePayloadMap } from '@/shared/contracts/ui'
type Hud = InterfacePayloadMap['hud']
defineProps<{ hud: Hud }>()
const emitAction = (
  fallback: string,
  action?: HudAction,
  id?: string | number,
) =>
  callClientEvent(
    action?.event ?? fallback,
    JSON.stringify(action?.payload ?? { id: id ?? null }),
  )
const clamp = (value: number) => Math.min(100, Math.max(0, value))
</script>
<template>
  <article
    v-if="hud.exchange"
    class="hud-widgets__panel hud-widgets__panel--exchange"
  >
    <header><RefreshCw />{{ hud.exchange.title }}</header>
    <p>{{ hud.exchange.description }}</p>
    <div>
      <button
        @click="
          emitAction(
            'hud:exchange:accept',
            hud.exchange.accept,
            hud.exchange.id,
          )
        "
      >
        {{ hud.exchange.accept?.label ?? 'Перевести' }}</button
      ><button
        class="muted"
        @click="
          emitAction(
            'hud:exchange:decline',
            hud.exchange.decline,
            hud.exchange.id,
          )
        "
      >
        {{ hud.exchange.decline?.label ?? 'Отменить' }}
      </button>
    </div>
  </article>
  <article
    v-if="hud.request"
    class="hud-widgets__panel hud-widgets__panel--request"
  >
    <header><Handshake />{{ hud.request.title }}</header>
    <p>{{ hud.request.description }}</p>
    <div class="hud-widgets__request-actions">
      <button
        @click="
          emitAction('hud:request:accept', hud.request.accept, hud.request.id)
        "
      >
        <kbd>Y</kbd>{{ hud.request.accept?.label ?? 'Принять' }}</button
      ><button
        @click="
          emitAction('hud:request:decline', hud.request.decline, hud.request.id)
        "
      >
        <kbd>N</kbd>{{ hud.request.decline?.label ?? 'Отклонить' }}
      </button>
    </div>
  </article>
  <article
    v-if="hud.capture"
    class="hud-widgets__panel hud-widgets__panel--capture"
  >
    <header>
      <span>{{ hud.capture.title }}</span
      ><b>{{ clamp(hud.capture.progress) }}%</b>
    </header>
    <div>
      <span :style="{ width: `${clamp(hud.capture.progress)}%` }"></span>
    </div>
  </article>
  <article
    v-if="hud.actionCamera"
    class="hud-widgets__panel hud-widgets__panel--action-camera"
  >
    <header>
      <Camera />{{ hud.actionCamera.title
      }}<span><Clock3 />{{ hud.actionCamera.duration }}</span>
    </header>
    <small>{{ hud.actionCamera.startedAt }}</small>
  </article>
  <div
    v-if="hud.reward?.visible && hud.reward.enabled && hud.reward.amount > 0"
    class="hud-widgets__reward"
  >
    <div>
      <Clock3 />Осталось времени <b>{{ hud.reward.timeLeft }}</b>
    </div>
    <div>
      <Gift />Награда <b>${{ hud.reward.amount.toLocaleString('en-US') }}</b>
    </div>
  </div>
</template>
<style lang="scss" scoped>
.hud-widgets,
.hud-widgets *,
.hud-widgets *::before,
.hud-widgets *::after {
  box-sizing: border-box;
}
kbd {
  display: inline-grid;
  min-width: px-to-vh(20);
  min-height: px-to-vh(20);
  padding: 0 px-to-vh(5);
  place-items: center;
  border: 0;
  border-radius: px-to-vh(3);
  background: #120816;
  color: #e000ff;
  font:
    700 px-to-vh(12) 'SF Pro',
    sans-serif;
  white-space: nowrap;
}
.hud-widgets__panel {
  position: absolute;
  width: min(var(--panel-width), calc(100vw - px-to-vh(60)));
  padding: px-to-vh(12);
  border: px-to-vh(1) solid rgba(255, 255, 255, 0.06);
  border-radius: px-to-vh(4);
  background: rgba(20, 20, 27, 0.68);
  box-shadow: inset px-to-vh(10) 0 px-to-vh(55) px-to-vh(-8)
    rgba(224, 0, 255, 0.15);
}
.hud-widgets__panel header {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: px-to-vh(8);
  color: #e000ff;
  font-size: px-to-vh(14);
  font-weight: 600;
}
.hud-widgets__panel header svg {
  width: px-to-vh(18);
  aspect-ratio: 1;
  flex: none;
}
.hud-widgets__panel p {
  margin: px-to-vh(18) 0;
  overflow-wrap: anywhere;
  color: #fff;
  font-size: px-to-vh(13);
}
.hud-widgets__panel--exchange {
  --panel-width: px-to-vh(286);
  left: 50%;
  bottom: px-to-vh(245);
  transform: translateX(-50%);
  pointer-events: auto;
}
.exchange > div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: px-to-vh(10);
}
.hud-widgets__panel--exchange button {
  min-height: px-to-vh(45);
  padding: px-to-vh(8);
  border: 0;
  border-radius: px-to-vh(3);
  background: #e000ff;
  color: #fff;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.hud-widgets__panel--exchange button.muted {
  background: rgba(255, 255, 255, 0.04);
  color: #999;
}
.hud-widgets__panel--request {
  --panel-width: px-to-vh(246);
  left: 50%;
  bottom: px-to-vh(30);
  transform: translateX(-50%);
  pointer-events: auto;
}
.hud-widgets__request-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: px-to-vh(10);
  border-top: px-to-vh(1) solid rgba(255, 255, 255, 0.12);
  padding-top: px-to-vh(12);
}
.hud-widgets__panel--request button {
  display: flex;
  align-items: center;
  gap: px-to-vh(8);
  border: 0;
  background: none;
  color: #fff;
}
.hud-widgets__panel--capture {
  --panel-width: px-to-vh(230);
  left: 50%;
  bottom: px-to-vh(165);
  transform: translateX(-50%);
}
.hud-widgets__panel--capture header {
  justify-content: space-between;
  color: #fff;
}
.hud-widgets__panel--capture header b {
  color: #e000ff;
}
.capture > div {
  height: px-to-vh(4);
  margin-top: px-to-vh(14);
  background: rgba(255, 255, 255, 0.12);
}
.capture > div span {
  display: block;
  height: 100%;
  background: #e000ff;
}
.hud-widgets__panel--action-camera {
  --panel-width: px-to-vh(250);
  left: px-to-vh(30);
  bottom: px-to-vh(315);
}
.hud-widgets__panel--action-camera header {
  color: #fff;
}
.hud-widgets__panel--action-camera header > span {
  display: flex;
  margin-left: auto;
  gap: px-to-vh(5);
  font-size: px-to-vh(12);
}
.hud-widgets__panel--action-camera small {
  display: block;
  margin-top: px-to-vh(14);
  color: #999;
  font-size: px-to-vh(11);
}
.hud-widgets__reward {
  position: absolute;
  right: px-to-vh(30);
  bottom: px-to-vh(265);
  display: flex;
  width: min(px-to-vh(230), calc(100vw - px-to-vh(60)));
  flex-direction: column;
  gap: px-to-vh(10);
}
.hud-widgets__reward > div {
  display: flex;
  min-height: px-to-vh(45);
  align-items: center;
  gap: px-to-vh(8);
  padding: px-to-vh(8) px-to-vh(10);
  border-radius: px-to-vh(3);
  background: linear-gradient(
    90deg,
    rgba(7, 9, 15, 0.75),
    rgba(224, 0, 255, 0.25)
  );
  font-size: px-to-vh(13);
}
.hud-widgets__reward svg {
  width: px-to-vh(15);
  aspect-ratio: 1;
  flex: none;
  color: #e000ff;
}
.hud-widgets__reward b {
  margin-left: auto;
  color: #e000ff;
  white-space: nowrap;
}
</style>
