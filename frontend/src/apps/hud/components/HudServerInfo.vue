<script setup lang="ts">
import { ref, watch } from 'vue'
import { CreditCard, UserRound, Users, Wallet } from 'lucide-vue-next'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'
import AmmoIcon from './Icons/Ammo.vue'
type Hud = InterfacePayloadMap['hud']
const props = defineProps<{ server?: Hud['server']; player?: Hud['player'] }>()
const ammoAnimationKey = ref(0)

watch(
  () => props.player?.gun?.ammo,
  (current, previous) => {
    if (current != null && previous != null && current < previous)
      ammoAnimationKey.value += 1
  },
)
const money = (value?: number) =>
  value == null ? '' : value.toLocaleString('en-US').replaceAll(',', '.')
</script>

<template>
  <aside v-if="server || player" class="hud-server-info">
    <section v-if="server || player" class="hud-server-info__identity">
      <div class="hud-server-info__brand-row">
        <span v-if="server?.x2" class="hud-server-info__multiplier">X2</span>
        <div class="hud-server-info__brand">
          <div class="hud-server-info__wordmark">
            <b>TWINKLE</b><small>ROLE PLAY</small>
          </div>
          <img
            v-if="server?.logo"
            class="hud-server-info__logo"
            :src="server.logo"
            alt="Twinkle"
          />
        </div>
      </div>

      <div class="hud-server-info__chips">
        <span v-if="player?.needs?.id != null" class="hud-server-info__chip">
          <UserRound />#{{ player.needs?.id }}
        </span>
        <span v-if="server?.online != null" class="hud-server-info__chip">
          <Users />{{ server.online }}
        </span>
      </div>

      <div class="hud-server-info__balances">
        <div
          v-if="player?.finance?.cash != null"
          class="hud-server-info__balance"
        >
          <span class="hud-server-info__balance-copy"
            ><small>Кошелек</small
            ><b>$ {{ money(player.finance?.cash) }}</b></span
          ><i class="hud-server-info__icon">
            <Wallet />
          </i>
        </div>
        <div
          v-if="player?.finance?.bank != null"
          class="hud-server-info__balance"
        >
          <span class="hud-server-info__balance-copy"
            ><small>Карта</small
            ><b>$ {{ money(player.finance?.bank) }}</b></span
          ><i class="hud-server-info__icon">
            <CreditCard />
          </i>
        </div>
      </div>
    </section>

    <slot name="tasks" />

    <div v-if="player?.gun?.ammo != null" class="hud-server-info__ammo">
      <span>{{ player?.gun?.weaponName || 'Оружие' }}</span>
      <div class="hud-server-info__ammo-values">
        <div class="hud-server-info__ammo-count">
          <b>{{ player?.gun?.ammo }}</b>
          <small>{{ player?.gun?.totalAmmo ?? 0 }}</small>
        </div>
        <span
          :key="ammoAnimationKey"
          class="hud-server-info__ammo-icons"
          :class="{ 'hud-server-info__ammo-icons--shot': ammoAnimationKey > 0 }"
          aria-hidden="true"
        >
          <AmmoIcon
            v-for="index in 3"
            :key="index"
            :style="{ animationDelay: `${(index - 1) * 28}ms` }"
          />
        </span>
      </div>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.hud-server-info,
.hud-server-info *,
.hud-server-info *::before,
.hud-server-info *::after {
  box-sizing: border-box;
}

.hud-server-info {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-end;
  gap: px-to-vh(20);
  text-shadow: 0 px-to-vh(1.5) px-to-vh(3.6) rgba(0, 0, 0, 0.6);
}

.hud-server-info__identity {
  display: flex;
  width: max-content;
  flex-direction: column;
  align-items: flex-end;
  gap: px-to-vh(12);
}

.hud-server-info__brand-row {
  display: flex;
  align-items: center;
  gap: px-to-vh(12);
}

.hud-server-info__multiplier {
  display: grid;
  width: px-to-vh(22);
  height: px-to-vh(20);
  place-items: center;
  border: px-to-vh(0.3) solid #e000ff;
  border-radius: px-to-vh(2);
  background: rgba(224, 0, 255, 0.45);
  box-shadow: 0 px-to-vh(4) px-to-vh(8) rgba(224, 0, 255, 0.3);
  color: rgba(255, 255, 255, 0.97);
  font-size: px-to-vh(12);
  font-weight: 700;
}

.hud-server-info__brand {
  display: flex;
  align-items: center;
  gap: px-to-vh(10);
}

.hud-server-info__logo {
  width: px-to-vh(50);
  aspect-ratio: 1;
  flex: none;
  object-fit: contain;
}

.hud-server-info__wordmark {
  position: relative;
  width: px-to-vh(132);
  height: px-to-vh(40);
  line-height: 1;
  white-space: nowrap;
}

.hud-server-info__wordmark b,
.hud-server-info__wordmark small {
  position: absolute;
  right: 0;
  display: block;
  margin: 0;
  transform: skewX(-5deg);
  font-family: 'SF Pro', sans-serif;
  font-stretch: condensed;
  font-variation-settings: 'wdth' 60;
  text-align: right;
  white-space: nowrap;
}

.hud-server-info__wordmark b {
  top: 0;
  width: 100%;
  height: px-to-vh(24);
  color: rgba(224, 0, 255, 0.45);
  font-size: px-to-vh(22);
  font-weight: 900;
  letter-spacing: 0.3em;
  color: rgba(224, 0, 255, 0.45);
  -webkit-text-stroke: 1px #e000ff;
}

.hud-server-info__wordmark small {
  right: 0;
  bottom: 0;
  width: 100%;
  height: px-to-vh(16);
  color: #fff;
  font-size: px-to-vh(14);
  font-weight: 900;
  letter-spacing: 0.43em;
  line-height: 1;
}

.hud-server-info__wordmark b {
  color: rgba(224, 0, 255, 0.45);
  font-size: px-to-vh(20);
  font-weight: 900;
  letter-spacing: 0.3em;
  -webkit-text-stroke: 0.1px #e000ff;
  -webkit-text-fill-color: rgba(224, 0, 255, 0.45);
}

.hud-server-info__wordmark small {
  margin-top: px-to-vh(2);
  color: #fff;
  font-size: px-to-vh(14);
  font-weight: 900;
  letter-spacing: 0.43em;
}

.hud-server-info__chips {
  display: flex;
  align-items: center;
  gap: px-to-vh(10);
}

.hud-server-info__chip {
  display: inline-flex;
  min-height: px-to-vh(24);
  align-items: center;
  gap: px-to-vh(5);
  padding: px-to-vh(5);
  border-radius: px-to-vh(3);
  background: rgba(22, 22, 22, 0.45);
  font-size: px-to-vh(12);
  white-space: nowrap;
}

.hud-server-info__chip svg {
  width: px-to-vh(12);
  height: px-to-vh(12);
  flex: none;
}

.hud-server-info__balances {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: px-to-vh(10);
}

.hud-server-info__balance {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: px-to-vh(10);
}

.hud-server-info__balance-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-end;
  line-height: px-to-vh(14);
}

.hud-server-info__balance-copy small {
  color: rgba(255, 255, 255, 0.45);
  font-size: px-to-vh(12);
}

.hud-server-info__balance-copy b {
  font-size: px-to-vh(12);
  font-weight: 400;
  white-space: nowrap;
}

.hud-server-info__icon {
  display: grid;
  width: px-to-vh(30);
  aspect-ratio: 1;
  flex: none;
  place-items: center;
  border-radius: px-to-vh(3);
  background: rgba(22, 22, 22, 0.45);
  font-style: normal;
}

.hud-server-info__icon svg {
  width: px-to-vh(17);
  height: px-to-vh(17);
}

.hud-server-info__ammo {
  display: flex;
  min-height: px-to-vh(28);
  align-items: center;
  gap: px-to-vh(10);
  padding: 0 px-to-vh(10);
  border-radius: px-to-vh(3);
  background: rgba(22, 22, 22, 0.45);
  font-size: px-to-vh(12);
  white-space: nowrap;
}

.hud-server-info__ammo-values {
  display: flex;
  align-items: center;
  gap: px-to-vh(5);
}

.hud-server-info__ammo-values b {
  color: #e000ff;
  font-size: px-to-vh(17);
}

.hud-server-info__ammo-values small {
  color: rgba(242, 242, 247, 0.45);
  font-size: px-to-vh(11);
}

.hud-server-info__ammo-count {
  display: flex;
  align-items: flex-end;
  gap: px-to-vh(3);
  line-height: 1;
}

.hud-server-info__ammo-count b {
  line-height: 14px;
}

.hud-server-info__ammo-icons {
  display: inline-flex;
  align-items: center;
  gap: px-to-vh(3);
}

.hud-server-info__ammo-icons svg {
  width: px-to-vh(4);
  height: px-to-vh(12);
  flex: none;
}

.hud-server-info__ammo-icons--shot svg {
  animation: hud-ammo-shot 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

@keyframes hud-ammo-shot {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  38% {
    opacity: 0;
    transform: translateY(px-to-vh(-5)) scale(0.72);
  }
  39% {
    opacity: 0;
    transform: translateY(px-to-vh(4)) scale(0.72);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
