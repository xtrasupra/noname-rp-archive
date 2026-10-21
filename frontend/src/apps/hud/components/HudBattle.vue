<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { UsersRound } from 'lucide-vue-next'
import DeathsIcon from './Icons/Deaths.vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

type Battle = NonNullable<InterfacePayloadMap['hud']['battle']>

const props = defineProps<{ battle?: Battle }>()

function teamStyle(gangColor: string) {
  return { '--gang-color': gangColor }
}

function splitTeamName(name: string, shortName: string) {
  const normalizedShortName = shortName.trim().toLocaleLowerCase()

  if (!normalizedShortName) {
    return [{ text: name, highlighted: false }]
  }

  const index = name.toLocaleLowerCase().indexOf(normalizedShortName)

  if (index === -1) {
    return [{ text: name, highlighted: false }]
  }

  const end = index + normalizedShortName.length

  return [
    { text: name.slice(0, index), highlighted: false },
    { text: name.slice(index, end), highlighted: true },
    { text: name.slice(end), highlighted: false },
  ].filter((part) => part.text)
}

const remainingMs = ref(0)
const initialDurationMs = ref(1)

let clientSyncedAt = 0
let serverSyncedAt = 0
let expiresAt = 0
let timerId = 0

const timer = computed(
  () => props.battle?.attackers.timer ?? props.battle?.protecting.timer,
)

const timeLeft = computed(() => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs.value / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

const progress = computed(() =>
  Math.min(100, Math.max(0, (remainingMs.value / initialDurationMs.value) * 100)),
)

function updateTimer() {
  const elapsedClientTime = Date.now() - clientSyncedAt
  const estimatedServerTime = serverSyncedAt + elapsedClientTime
  remainingMs.value = Math.max(0, expiresAt - estimatedServerTime)
}

function syncTimer() {
  const nextTimer = timer.value

  if (!nextTimer) {
    remainingMs.value = 0
    initialDurationMs.value = 1
    return
  }

  clientSyncedAt = Date.now()
  serverSyncedAt = Date.parse(nextTimer.serverTime)
  expiresAt = Date.parse(nextTimer.expiredAt)

  if (!Number.isFinite(serverSyncedAt) || !Number.isFinite(expiresAt)) {
    remainingMs.value = 0
    initialDurationMs.value = 1
    return
  }

  initialDurationMs.value = Math.max(1, expiresAt - serverSyncedAt)
  updateTimer()
}

watch(
  () => [timer.value?.serverTime, timer.value?.expiredAt],
  syncTimer,
  { immediate: true },
)

onMounted(() => {
  timerId = window.setInterval(updateTimer, 250)
})

onBeforeUnmount(() => {
  window.clearInterval(timerId)
})
</script>

<template>
  <section v-if="battle" class="hud-battle">
    <header class="hud-battle__bar">
      <div
        class="hud-battle__team hud-battle__team--attacker"
        :style="teamStyle(battle.attackers.gangColor)"
      >
        <span class="hud-battle__team-logo">{{ battle.attackers.logoSymbol }}</span>
        <div class="hud-battle__team-info">
          <b>
            <span
              v-for="(part, index) in splitTeamName(
                battle.attackers.name,
                battle.attackers.shortName,
              )"
              :key="index"
              :class="{ 'hud-battle__team-name-highlight': part.highlighted }"
            >{{ part.text }}</span>
          </b>
          <small>
            <span class="hud-battle__stat hud-battle__stat--deaths">
              <DeathsIcon class="hud-battle__deaths-icon" :color="battle.attackers.gangColor" />
              {{ battle.attackers.dies }}
            </span>
            <span class="hud-battle__stat hud-battle__stat--participants">
              <UsersRound />
              {{ battle.attackers.alive }}
            </span>
          </small>
        </div>
      </div>

      <div class="hud-battle__timer">
        <b>До конца</b>
        <small>{{ timeLeft }}</small>
      </div>

      <div
        class="hud-battle__team hud-battle__team--defender"
        :style="teamStyle(battle.protecting.gangColor)"
      >
        <div class="hud-battle__team-info">
          <b>
            <span
              v-for="(part, index) in splitTeamName(
                battle.protecting.name,
                battle.protecting.shortName,
              )"
              :key="index"
              :class="{ 'hud-battle__team-name-highlight': part.highlighted }"
            >{{ part.text }}</span>
          </b>
          <small>
            <span class="hud-battle__stat hud-battle__stat--participants">
              <UsersRound />
              {{ battle.protecting.alive }}
            </span>
            <span class="hud-battle__stat hud-battle__stat--deaths">
              <DeathsIcon class="hud-battle__deaths-icon" :color="battle.protecting.gangColor" />
              {{ battle.protecting.dies }}
            </span>
          </small>
        </div>
        <span class="hud-battle__team-logo">{{ battle.protecting.logoSymbol }}</span>
      </div>
    </header>

    <div class="hud-battle__progress">
      <span :style="{ width: `${progress}%` }"></span>
    </div>

    <div class="hud-battle__intro">
      <article
        class="hud-battle__intro-team hud-battle__intro-team--attacker"
        :style="teamStyle(battle.attackers.gangColor)"
      >
        <span class="hud-battle__intro-watermark">{{ battle.attackers.logoSymbol }}</span>
        <span class="hud-battle__intro-logo">{{ battle.attackers.logoSymbol }}</span>
        <b>{{ battle.attackers.name }}</b>
        <small>Сторона атаки</small>
      </article>

      <strong class="hud-battle__versus">VS</strong>

      <article
        class="hud-battle__intro-team hud-battle__intro-team--defender"
        :style="teamStyle(battle.protecting.gangColor)"
      >
        <span class="hud-battle__intro-watermark">{{ battle.protecting.logoSymbol }}</span>
        <span class="hud-battle__intro-logo">{{ battle.protecting.logoSymbol }}</span>
        <b>{{ battle.protecting.name }}</b>
        <small>Сторона защиты</small>
      </article>
    </div>
  </section>
</template>
<style lang="scss" scoped>
.hud-battle,
.hud-battle *,
.hud-battle *::before,
.hud-battle *::after {
  box-sizing: border-box;
}

.hud-battle {
  position: absolute;
  top: px-to-vh(30);
  left: 50%;
  width: px-to-vh(545);
  color: #fff;
  transform: translateX(-50%);
}

.hud-battle__bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) px-to-vh(100) minmax(0, 1fr);
  align-items: start;
}

.hud-battle__team {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: px-to-vh(10);
}

.hud-battle__team-logo {
  display: grid;
  width: px-to-vh(45);
  height: px-to-vh(45);
  flex: none;
  place-items: center;
  color: var(--gang-color);
  font-family: 'Street Graffity', sans-serif;
  font-size: px-to-vh(38);
  font-weight: 400;
  line-height: 1;
}

.hud-battle__team--defender {
  justify-content: flex-end;
  text-align: right;
}

.hud-battle__team-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: px-to-vh(7);
}

.hud-battle__team-info b {
  overflow: hidden;
  font-size: px-to-vh(17);
  font-weight: 700;
  text-overflow: ellipsis;
  text-shadow: 0 px-to-vh(1.5) px-to-vh(3.6) rgba(0, 0, 0, 0.6);
  white-space: nowrap;
}

.hud-battle__team-name-highlight {
  color: var(--gang-color);
}

.hud-battle__team-info small {
  display: flex;
  align-items: center;
  gap: px-to-vh(10);
  font-size: px-to-vh(14);
  font-weight: 500;
  text-shadow: 0 px-to-vh(1.5) px-to-vh(3.6) rgba(0, 0, 0, 0.6);
}

.hud-battle__team--defender small {
  justify-content: flex-end;
}

.hud-battle__stat {
  display: inline-flex;
  align-items: center;
  gap: px-to-vh(5);
}

.hud-battle__team-info svg {
  width: px-to-vh(15);
  height: px-to-vh(15);
  color: #fff !important;
}

.hud-battle__team-info svg.hud-battle__deaths-icon {
  display: block;
  flex: none;
  overflow: visible;
  color: var(--gang-color) !important;
}

.hud-battle__timer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: px-to-vh(5);
  font-size: px-to-vh(17);
  text-align: center;
  text-shadow: 0 px-to-vh(1.5) px-to-vh(3.6) rgba(0, 0, 0, 0.6);
}

.hud-battle__timer b {
  font-weight: 700;
}

.hud-battle__timer small {
  color: rgba(255, 255, 255, 0.45);
  font-weight: 300;
}

.hud-battle__progress {
  height: px-to-vh(4);
  margin-top: px-to-vh(20);
  background: #07090f;
}

.hud-battle__progress span {
  display: block;
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 px-to-vh(7) rgba(255, 255, 255, 0.8);
}

.hud-battle__intro {
  position: absolute;
  top: px-to-vh(109);
  left: 50%;
  width: px-to-vh(516);
  height: px-to-vh(157);
  overflow: hidden;
  transform: translateX(-50%);
}

.hud-battle__intro-team {
  position: absolute;
  top: 0;
  z-index: 2;
  display: flex;
  width: px-to-vh(269.5);
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: px-to-vh(7);
  overflow: hidden;
  text-align: center;
}

.hud-battle__intro-team::after {
  position: absolute;
  top: px-to-vh(-18);
  bottom: px-to-vh(-18);
  z-index: -1;
  width: px-to-vh(7);
  content: '';
  transform: skewX(-15deg);
}

.hud-battle__intro-team--attacker {
  left: 0;
  padding-right: px-to-vh(28);
  background:
    linear-gradient(90deg, #0a0a0a 0%, rgba(39, 39, 39, 0) 100%),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--gang-color) 5%, transparent),
      color-mix(in srgb, var(--gang-color) 34%, transparent)
    );
  clip-path: polygon(0 0, 100% 0, 82% 100%, 0 100%);
  -webkit-mask-image: linear-gradient(
    90deg,
    transparent 0%,
    #000 28%,
    #000 100%
  );
  mask-image: linear-gradient(
    90deg,
    transparent 0%,
    #000 28%,
    #000 100%
  );
}

.hud-battle__intro-team--attacker::after {
  right: px-to-vh(27);
  background: var(--gang-color);
  box-shadow: 0 0 px-to-vh(12) color-mix(in srgb, var(--gang-color) 55%, transparent);
}

.hud-battle__intro-team--defender {
  right: 0;
  padding-left: px-to-vh(28);
  background:
    linear-gradient(270deg, #0a0a0a 0%, rgba(39, 39, 39, 0) 100%),
    linear-gradient(
      270deg,
      color-mix(in srgb, var(--gang-color) 5%, transparent),
      color-mix(in srgb, var(--gang-color) 34%, transparent)
    );
  clip-path: polygon(18% 0, 100% 0, 100% 100%, 0 100%);
  -webkit-mask-image: linear-gradient(
    270deg,
    transparent 0%,
    #000 28%,
    #000 100%
  );
  mask-image: linear-gradient(
    270deg,
    transparent 0%,
    #000 28%,
    #000 100%
  );
}

.hud-battle__intro-team--defender::after {
  left: px-to-vh(27);
  background: var(--gang-color);
  box-shadow: 0 0 px-to-vh(12) color-mix(in srgb, var(--gang-color) 55%, transparent);
}

.hud-battle__intro-logo {
  display: block;
  width: px-to-vh(68);
  height: px-to-vh(68);
  margin-bottom: px-to-vh(24);
  color: var(--gang-color);
  font-family: 'Street Graffity', sans-serif;
  font-size: px-to-vh(68);
  font-weight: 400;
  line-height: 1;
}

.hud-battle__intro-watermark {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: -2;
  color: var(--gang-color);
  font-family: 'Street Graffity', sans-serif;
  font-size: px-to-vh(205);
  font-weight: 400;
  line-height: 1;
  opacity: 0.2;
  transform: translate(-50%, -50%);
}

.hud-battle__intro-team b {
  width: px-to-vh(155);
  overflow: hidden;
  font-family: 'Gilroy', 'SF Pro', sans-serif;
  font-size: px-to-vh(18);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hud-battle__intro-team--attacker b {
  color: var(--gang-color);
}

.hud-battle__intro-team--defender b {
  color: color-mix(in srgb, var(--gang-color) 78%, #000);
}

.hud-battle__intro-team small {
  color: #fff;
  font-family: 'Gilroy', 'SF Pro', sans-serif;
  font-size: px-to-vh(14);
  font-weight: 600;
}

.hud-battle__versus {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 4;
  color: #fff;
  font-size: px-to-vh(68);
  font-style: italic;
  font-weight: 900;
  line-height: 1;
  text-align: center;
  text-shadow: 0 0 px-to-vh(18) rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%) skew(-8deg);
}
.battle-intro-enter-active,
.battle-intro-leave-active {
  transition: 250ms ease;
}

.battle-intro-enter-from,
.battle-intro-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.92);
}
</style>
