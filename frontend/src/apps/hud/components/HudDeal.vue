<script setup lang="ts">
import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'
import ExchangeIcon from './Icons/Exchange.vue'

type Deal = NonNullable<InterfacePayloadMap['hud']['deal']>

defineProps<{ deal: Deal }>()

const confirmDeal = () => callClientEvent('deal:confirmed')
const cancelDeal = () => callClientEvent('deal:cancel')
</script>

<template>
  <article class="hud-deal">
    <header class="hud-deal__header">
      <ExchangeIcon class="hud-deal__icon" />
      <span>Предложение об <b>обмене</b></span>
    </header>

    <p class="hud-deal__description">
      <span><b>Гражданин</b> {{ deal.nickName }}</span>
      <span><b>предложил Вам</b> обмен</span>
    </p>

    <div class="hud-deal__actions">
      <button
        class="hud-deal__button hud-deal__button--confirm"
        type="button"
        @click="confirmDeal"
      >
        Начать обмен
      </button>
      <button
        class="hud-deal__button hud-deal__button--cancel"
        type="button"
        @click="cancelDeal"
      >
        Отменить
      </button>
    </div>
  </article>
</template>

<style lang="scss" scoped>
.hud-deal {
  width: px-to-vh(460);
  padding: px-to-vh(10);
  border: 0.0462962963vh solid #86009921;
  border-radius: px-to-vh(10);
  background: rgba(7, 9, 15, 0.45);
  pointer-events: auto;
}

.hud-deal__header {
  display: flex;
  align-items: center;
  gap: px-to-vh(14);
  color: #fff;
  font-size: px-to-vh(20);
  font-weight: 400;
}

.hud-deal__header span {
  font-family: 'SF Pro', sans-serif;
  font-weight: 300;
}

.hud-deal__header b,
.hud-deal__description b {
  color: #e000ff;
  font-weight: inherit;
}

.hud-deal__icon {
  width: px-to-vh(24);
  height: px-to-vh(24);
  flex: none;
}

.hud-deal__description {
  display: flex;
  margin: px-to-vh(20) 0;
  flex-direction: column;
  gap: px-to-vh(6);
  color: #fff;
  font-size: px-to-vh(20);
  line-height: 1.25;
}

.hud-deal__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: px-to-vh(24);
}

.hud-deal__button {
  min-width: 0;
  height: px-to-vh(65);
  border-radius: px-to-vh(10);
  color: #fff;
  font:
    500 1.6814814815vh "Gilroy", sans-serif;
  cursor: pointer;
  transition:
    filter 120ms ease,
    transform 80ms ease;
}

.hud-deal__button:hover {
  filter: brightness(1.12);
}

.hud-deal__button:active {
  transform: translateY(px-to-vh(1));
}

.hud-deal__button--confirm {
  border: px-to-vh(1) solid rgba(224, 0, 255, 0.55);
  background: radial-gradient(
    circle at center,
    rgba(224, 0, 255, 0.4) 0%,
    rgba(134, 0, 153, 0.4) 100%
  );
}

.hud-deal__button--cancel {
  border: px-to-vh(1) solid rgba(255, 255, 255, 0.06);
  background: rgba(8, 8, 13, 0.9);
  color: rgba(255, 255, 255, 0.55);
}
</style>
