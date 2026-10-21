<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import doorsInactive from '../assets/speedometer/doors-icon.svg'
import doorsActive from '../assets/speedometer/doors-icon-active.svg'
import engineActive from '../assets/speedometer/engine-icon.svg'
import engineInactive from '../assets/speedometer/engine-icon-inactive.svg'
import fuelIcon from '../assets/speedometer/fuel-icon.svg'
import innerRing from '../assets/speedometer/inner-ring.svg'
import outerBase from '../assets/speedometer/outer-base.svg'
import seatMask from '../assets/speedometer/seat-mask.png'
import { useVehicleStore } from '@/stores/vehicle.store'

const vehicle = useVehicleStore()
const clamp = (value: number) => Math.min(100, Math.max(0, value))
const animatedSpeed = ref(0)
let speedAnimationFrame: number | null = null
let previousFrameTime = 0

const animateSpeed = (frameTime: number) => {
  const targetSpeed = Math.max(0, Number(vehicle.speed) || 0)
  const delta = targetSpeed - animatedSpeed.value
  const elapsed = previousFrameTime > 0 ? Math.min(frameTime - previousFrameTime, 50) : 16
  const smoothingTime = delta >= 0 ? 150 : 240
  const interpolation = 1 - Math.exp(-elapsed / smoothingTime)

  previousFrameTime = frameTime
  animatedSpeed.value += delta * interpolation

  if (Math.abs(delta) < 0.05) {
    animatedSpeed.value = targetSpeed
    speedAnimationFrame = null
    previousFrameTime = 0
    return
  }

  speedAnimationFrame = requestAnimationFrame(animateSpeed)
}

watch(
  () => vehicle.speed,
  () => {
    if (speedAnimationFrame === null) {
      speedAnimationFrame = requestAnimationFrame(animateSpeed)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (speedAnimationFrame !== null) cancelAnimationFrame(speedAnimationFrame)
})

const speed = computed(() => Math.max(0, Math.round(animatedSpeed.value)))
const speedDigits = computed(() => String(speed.value).padStart(3, '0'))
const speedLeadingLength = computed(() => Math.max(0, 3 - String(speed.value).length))
const mileageDigits = computed(() => String(Math.max(0, Math.round(vehicle.mileage))).padStart(6, '0'))
const mileageLeadingLength = computed(() => Math.max(0, 6 - String(Math.max(0, Math.round(vehicle.mileage))).length))
const speedProgress = computed(() => clamp((animatedSpeed.value / Math.max(1, vehicle.maxSpeed)) * 100))
const fuelProgress = computed(() => clamp((vehicle.fuel / Math.max(1, vehicle.fuelMax)) * 100))
const healthProgress = computed(() => clamp(vehicle.engineHealth))
const speedPath = computed(() => {
  const radius = 109.25
  const startAngle = 135
  const sweep = speedProgress.value * 2.7
  const endAngle = startAngle + sweep
  const point = (angle: number) => {
    const radians = (angle * Math.PI) / 180
    return {
      x: 130 + radius * Math.cos(radians),
      y: 115 + radius * Math.sin(radians),
    }
  }
  const start = point(startAngle)
  const end = point(endAngle)
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y}`
})
const fuelDash = computed(() => `${fuelProgress.value} 100`)
const healthDash = computed(() => `${healthProgress.value} 100`)
const gear = computed(() => {
  if (vehicle.gear === 'R') return 'R'
  if (vehicle.gear === 'N' || vehicle.gear === 0) return 'N'
  return 'D'
})
</script>

<template>
  <section v-if="vehicle.inVehicle" class="hud-speedometer">
    <img class="hud-speedometer__outer" :src="outerBase" alt="" />
    <img class="hud-speedometer__inner" :src="innerRing" alt="" />

    <svg class="hud-speedometer__arcs" viewBox="0 0 245 230" aria-hidden="true">
      <defs>
        <linearGradient id="speedometer-progress" x1="50" y1="195" x2="211" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#b400d0" />
          <stop offset="0.55" stop-color="#d600f2" />
          <stop offset="1" stop-color="#e000ff" />
        </linearGradient>

      </defs>
      <path v-if="speedProgress > 0.1" class="speed-glow" :d="speedPath" />
      <path v-if="speedProgress > 0.1" class="speed-fill" :d="speedPath" />
      <path class="fuel-fill" pathLength="100" d="M58.582 186.418 A101 101 0 0 1 58.582 43.582" :stroke-dasharray="fuelDash" />
      <path class="health-fill" pathLength="100" d="M201.418 186.418 A101 101 0 0 0 201.418 43.582" :stroke-dasharray="healthDash" />
    </svg>

    <div class="hud-speedometer__gears">
      <span v-for="item in ['R', 'N', 'D']" :key="item" :class="{ active: gear === item }">{{ item }}</span>
    </div>

    <div class="hud-speedometer__speed">
      <strong>
        <i>{{ speedDigits.slice(0, speedLeadingLength) }}</i>{{ speedDigits.slice(speedLeadingLength) }}
      </strong>
      <span>KM/H</span>
    </div>

    <div class="hud-speedometer__mileage">
      <i>{{ mileageDigits.slice(0, mileageLeadingLength) }}</i>{{ mileageDigits.slice(mileageLeadingLength) }}
    </div>

    <div class="hud-speedometer__fuel">
      <img :src="fuelIcon" alt="" />
      <span>{{ Number(vehicle.fuel).toFixed(1) }}л</span>
    </div>
    <div class="hud-speedometer__health">{{ Math.round(healthProgress) }}%</div>

    <div class="hud-speedometer__statuses">
      <img :src="vehicle.doorsLocked ? doorsActive : doorsInactive" alt="Двери" />
      <img :src="vehicle.engineOn ? engineActive : engineInactive" alt="Двигатель" />
      <span :class="{ active: vehicle.seatbeltOn }" title="Ремень">
        <i :style="{ maskImage: `url(${seatMask})` }"></i>
      </span>
    </div>
  </section>
</template>

<style scoped lang="scss">
.hud-speedometer,
.hud-speedometer * { box-sizing: border-box; }

.hud-speedometer {
  position: absolute;
  width: px-to-vh(245);
  height: px-to-vh(230);
  color: #fff;
  font-family: 'SF Pro', sans-serif;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 px-to-vh(1.5) px-to-vh(3.6) rgb(0 0 0 / 60%);
}

.hud-speedometer__outer,
.hud-speedometer__arcs {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.hud-speedometer__inner {
  position: absolute;
  top: px-to-vh(14);
  left: px-to-vh(29);
  width: px-to-vh(202);
  height: px-to-vh(202);
}

.hud-speedometer__arcs { overflow: visible; }
.hud-speedometer__arcs circle,
.hud-speedometer__arcs path { fill: none; vector-effect: non-scaling-stroke; }

.speed-fill,
.speed-glow {
  stroke: url('#speedometer-progress');
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 10.5;
}
.speed-fill { opacity: 0.38; }
.speed-glow {
  opacity: 0.1;
  stroke-width: 15;
}
.fuel-fill { stroke: #ffc909; stroke-width: 2.02; }
.health-fill { stroke: #ff5959; stroke-width: 2.02; }

.hud-speedometer__gears {
  position: absolute;
  top: px-to-vh(65.5);
  left: px-to-vh(102.5);
  display: flex;
  gap: px-to-vh(5);
}
.hud-speedometer__gears span {
  display: grid;
  width: px-to-vh(15);
  height: px-to-vh(15);
  place-items: center;
  border-radius: px-to-vh(1);
  color: rgb(255 255 255 / 45%);
  background: rgb(22 22 22 / 45%);
  font-size: px-to-vh(12);
  font-weight: 510;
  line-height: 1;
}
.hud-speedometer__gears span.active { color: #fff; background: rgb(255 255 255 / 45%); }

.hud-speedometer__speed {
  position: absolute;
  top: px-to-vh(90);
  left: px-to-vh(100.5);
  display: flex;
  width: px-to-vh(59);
  flex-direction: column;
  align-items: center;
  gap: px-to-vh(5);
  text-align: center;
}
.hud-speedometer__speed strong,
.hud-speedometer__mileage {
  display: block;
  font-stretch: condensed;
  font-weight: 650;
  transform: scaleX(0.68);
  white-space: nowrap;
}
.hud-speedometer__speed strong { font-size: px-to-vh(48); line-height: .72; }
.hud-speedometer__speed strong i,
.hud-speedometer__mileage i { color: rgb(255 255 255 / 45%); font-style: normal; }
.hud-speedometer__speed span { color: rgb(255 255 255 / 45%); font-size: px-to-vh(14); font-stretch: condensed; font-weight: 650; line-height: 1; }

.hud-speedometer__mileage {
  position: absolute;
  top: px-to-vh(160);
  left: px-to-vh(100.5);
  width: px-to-vh(59);
  font-size: px-to-vh(14);
  line-height: 1;
  text-align: center;
}

.hud-speedometer__fuel {
  position: absolute;
  top: px-to-vh(191);
  left: px-to-vh(65.5);
  display: flex;
  align-items: center;
  gap: px-to-vh(3);
  font-size: px-to-vh(8);
  font-weight: 590;
  line-height: 1;
}
.hud-speedometer__fuel img { width: px-to-vh(10); height: px-to-vh(10); }
.hud-speedometer__health { position: absolute; top: px-to-vh(191); left: px-to-vh(176); font-size: px-to-vh(8); font-weight: 590; line-height: 1; }

.hud-speedometer__statuses {
  position: absolute;
  top: px-to-vh(210);
  left: px-to-vh(95);
  display: flex;
  gap: px-to-vh(5);
}
.hud-speedometer__statuses > img,
.hud-speedometer__statuses > span { width: px-to-vh(20); height: px-to-vh(20); border-radius: px-to-vh(3); }
.hud-speedometer__statuses > span { display: grid; place-items: center; background: rgb(22 22 22 / 45%); }
.hud-speedometer__statuses > span.active { background: rgb(64 255 129 / 45%); }
.hud-speedometer__statuses > span i {
  width: px-to-vh(13);
  height: px-to-vh(13);
  background: rgb(255 255 255 / 45%);
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
}
.hud-speedometer__statuses > span.active i { background: #40ff81; }
</style>