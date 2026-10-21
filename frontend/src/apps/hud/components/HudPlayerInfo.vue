<script setup lang="ts">
import { CalendarClock, Cloud, MapPin } from 'lucide-vue-next'
import type { CSSProperties } from 'vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'
import FoodIcon from './Icons/Food.vue'
import MicrophoneIcon from './Icons/Microphone.vue'
import SafeZoneIcon from './Icons/SafeZone.vue'
import WaterIcon from './Icons/Water.vue'

type Hud = InterfacePayloadMap['hud']
const props = defineProps<{
  info?: Hud['info']
  player?: Hud['player']
  microphone?: Hud['microphone']
}>()

const isMicrophoneTalking = () => {
  const microphone = props.microphone as
    | (Hud['microphone'] & { talking?: unknown; active?: unknown })
    | undefined
  const value = microphone?.isTalking ?? microphone?.talking ?? microphone?.active

  return value === true || value === 1 || value === '1' || value === 'true'
}

const needFillStyle = (
  value: number | undefined,
  color: string,
): CSSProperties => {
  const normalizedValue = Math.min(100, Math.max(0, value ?? 0))
  return {
    height: `${normalizedValue}%`,
    backgroundColor: color,
    opacity: 0.25,
  }
}
</script>

<template>
  <section v-if="info || player?.needs || microphone" class="hud-player-info">
    <div class="hud-player-info__minimap">
      <div v-if="info?.safeZone" class="hud-player-info__safe-zone">
        <SafeZoneIcon />
        <span><b>ЗЕЛЕНАЯ</b> ЗОНА</span>
      </div>
    </div>

    <div class="hud-player-info__content">
      <div v-if="player?.needs || microphone" class="hud-player-info__needs">
        <i class="hud-player-info__need hud-player-info__need--water">
          <span
            class="hud-player-info__need-fill"
            :style="needFillStyle(player?.needs?.water, '#00C3D0')"
          ></span>
          <WaterIcon />
        </i>
        <i class="hud-player-info__need hud-player-info__need--food">
          <span
            class="hud-player-info__need-fill"
            :style="needFillStyle(player?.needs?.eat, '#FF8D28')"
          ></span>
          <FoodIcon />
        </i>
        <i
          class="hud-player-info__need hud-player-info__need--microphone"
          :class="{ 'hud-player-info__need--active': isMicrophoneTalking() }"
        >
          <span class="hud-player-info__microphone-status"></span>
          <MicrophoneIcon />
        </i>
      </div>

      <div
        v-if="info?.weatherLabel || info?.temperature != null"
        class="hud-player-info__row"
      >
        <i class="hud-player-info__icon"><Cloud /></i>
        <span class="hud-player-info__copy"
          ><b>{{ info.weatherLabel }}</b
          ><small>{{ info.temperature }} °C</small></span
        >
      </div>
      <div v-if="info?.time || info?.date" class="hud-player-info__row">
        <i class="hud-player-info__icon"><CalendarClock /></i>
        <span class="hud-player-info__copy"
          ><b>{{ info.time }}</b
          ><small>{{ info.date }}</small></span
        >
      </div>
      <div v-if="info?.street || info?.zone" class="hud-player-info__row">
        <i class="hud-player-info__icon"><MapPin /></i>
        <span class="hud-player-info__copy"
          ><b>{{ info.street }}</b
          ><small>{{ info.zone }}</small></span
        >
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.hud-player-info,
.hud-player-info *,
.hud-player-info *::before,
.hud-player-info *::after {
  box-sizing: border-box;
}
.hud-player-info {
  display: flex;
  align-items: flex-end;
  gap: px-to-vh(15);
  text-shadow: 0 px-to-vh(1.5) px-to-vh(3.6) rgba(0, 0, 0, 0.6);
}

.hud-player-info__minimap {
  width: px-to-vh(288);
  height: px-to-vh(204);
  flex: none;
  border-top: px-to-vh(2) solid #40ff81;
  background: linear-gradient(180deg, rgba(64, 255, 129, 0.1), transparent 64%);
}

.hud-player-info__safe-zone {
  display: flex;
  width: max-content;
  max-width: 100%;
  margin: px-to-vh(14) auto 0;
  align-items: center;
  gap: px-to-vh(5);
  font-size: px-to-vh(14);
  font-weight: 400;
  text-transform: uppercase;
  white-space: nowrap;
}

.hud-player-info__safe-zone svg {
  width: px-to-vh(14);
  height: px-to-vh(14);
  flex: none;
}
.hud-player-info__safe-zone b {
  color: #40ff81;
  font-weight: 400;
}

.hud-player-info__content {
  display: flex;
  width: px-to-vh(170);
  flex-direction: column;
  align-items: flex-start;
  gap: px-to-vh(10);
}

.hud-player-info__needs {
  display: flex;
  gap: px-to-vh(10);
}

.hud-player-info__need,
.hud-player-info__icon {
  position: relative;
  display: grid;
  width: px-to-vh(30);
  aspect-ratio: 1;
  flex: none;
  place-items: center;
  overflow: hidden;
  border-radius: px-to-vh(3);
  background: rgba(22, 22, 22, 0.45);
  color: rgba(255, 255, 255, 0.55);
  font-style: normal;
}

.hud-player-info__need-fill {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
  transition:
    height 180ms ease,
    opacity 180ms ease;
}

.hud-player-info__need svg,
.hud-player-info__icon svg {
  position: relative;
  z-index: 1;
  flex: none;
}
.hud-player-info__need--water svg {
  width: px-to-vh(10);
  height: px-to-vh(14);
}
.hud-player-info__need--food svg {
  width: px-to-vh(14);
  height: px-to-vh(14);
}
.hud-player-info__need--microphone svg {
  width: px-to-vh(10);
  height: px-to-vh(14);
  color: #ff5959 !important;
}
.hud-player-info__need--microphone {
  background: rgba(255, 89, 89, 0.18);
}
.hud-player-info__need--microphone :deep(path) {
  fill: #ff5959 !important;
}
.hud-player-info__need--microphone.hud-player-info__need--active {
  background: rgba(64, 255, 129, 0.22);
  box-shadow: 0 0 px-to-vh(8) rgba(64, 255, 129, 0.3);
}
.hud-player-info__need--microphone.hud-player-info__need--active svg {
  color: #40ff81 !important;
}
.hud-player-info__need--microphone.hud-player-info__need--active :deep(path) {
  fill: #40ff81 !important;
}
.hud-player-info__microphone-status {
  position: absolute;
  z-index: 2;
  top: px-to-vh(5);
  left: px-to-vh(5);
  width: px-to-vh(4);
  height: px-to-vh(4);
  border-radius: 50%;
  background: #ff5959;
}
.hud-player-info__need--microphone.hud-player-info__need--active
  .hud-player-info__microphone-status {
  background: #40ff81;
}
.hud-player-info__icon svg {
  width: px-to-vh(15);
  aspect-ratio: 1;
}

.hud-player-info__row {
  display: flex;
  min-height: px-to-vh(30);
  align-items: center;
  gap: px-to-vh(10);
}

.hud-player-info__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  line-height: px-to-vh(14);
}

.hud-player-info__copy b,
.hud-player-info__copy small {
  max-width: px-to-vh(92);
  overflow-wrap: anywhere;
  font-size: px-to-vh(12);
  font-weight: 400;
}

.hud-player-info__copy small {
  color: rgba(255, 255, 255, 0.45);
}
</style>
