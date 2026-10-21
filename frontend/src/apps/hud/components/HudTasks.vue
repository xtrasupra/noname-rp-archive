<script setup lang="ts">
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

type Tasks = NonNullable<InterfacePayloadMap['hud']['tasks']>

defineProps<{ tasks?: Tasks }>()

const progressSteps = (value?: number) =>
  Math.min(50, Math.max(0, Math.floor(value ?? 0)))
const progressActiveStep = (active?: number, steps?: number) =>
  Math.min(progressSteps(steps), Math.max(0, Math.floor(active ?? 0)))
</script>

<template>
  <section v-if="tasks?.isVisible && tasks.items.length" class="hud-tasks">
    <article
      v-for="task in tasks.items"
      :key="task.id"
      class="hud-tasks__card"
      :class="[
        `hud-tasks__card--${task.type}`,
        {
          'hud-tasks__card--with-progress':
            progressSteps(task.progress?.steps) > 0,
        },
      ]"
    >
      <div class="hud-tasks__copy">
        <b>{{ task.title }}</b>
        <p>{{ task.description }}</p>
      </div>
      <img v-if="task.image" class="hud-tasks__image" :src="task.image" alt="" />

      <div
        v-if="progressSteps(task.progress?.steps)"
        class="hud-tasks__progress"
        aria-hidden="true"
      >
        <svg
          v-for="step in progressSteps(task.progress?.steps)"
          :key="step"
          class="hud-tasks__progress-step"
          :class="{
            'hud-tasks__progress-step--active':
              step <=
              progressActiveStep(
                task.progress?.activeStep,
                task.progress?.steps,
              ),
          }"
          viewBox="0 0 119 20"
          preserveAspectRatio="none"
        >
          <path
            d="M118.621 0.150391L112.237 19.8496H0.206055L6.58984 0.150391H118.621Z"
          />
        </svg>
      </div>
    </article>
  </section>
</template>

<style lang="scss" scoped>
.hud-tasks,
.hud-tasks *,
.hud-tasks *::before,
.hud-tasks *::after {
  box-sizing: border-box;
}

.hud-tasks {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: px-to-vh(10);
}

.hud-tasks__card {
  position: relative;
  display: grid;
  min-height: px-to-vh(80);
  overflow: hidden;
  align-content: center;
  padding: px-to-vh(14) px-to-vh(20);
  border: px-to-vh(0.1) solid rgba(255, 201, 9, 0.5);
  border-radius: px-to-vh(3);
  background: linear-gradient(90deg, rgba(7, 9, 15, 0.24), rgba(7, 9, 15, 0.4));
  box-shadow: inset 0 0 px-to-vh(50) px-to-vh(2) rgba(255, 201, 9, 0.03);
}

.hud-tasks__card--with-progress {
  min-height: px-to-vh(90);
}

.hud-tasks__copy {
  z-index: 2;
  width: 72%;
  min-width: 0;
}

.hud-tasks__copy b,
.hud-tasks__copy p {
  overflow-wrap: anywhere;
}

.hud-tasks__copy b {
  color: #ffc909;
  font-size: px-to-vh(14);
  text-shadow: 0 px-to-vh(2) px-to-vh(5) rgba(255, 201, 9, 0.3);
}

.hud-tasks__copy p {
  margin: 0;
  font-size: px-to-vh(13);
  line-height: 1.2;
}

.hud-tasks__image {
  position: absolute;
  z-index: 1;
  inset: 0 0 0 auto;
  width: 44%;
  height: 100%;
  object-fit: cover;
  opacity: 0.75;
  mask-image: linear-gradient(90deg, transparent, #000 45%);
}

.hud-tasks__card::after {
  position: absolute;
  z-index: 1;
  top: 0;
  right: px-to-vh(-40);
  width: px-to-vh(80);
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(255, 201, 9, 0.2);
  pointer-events: none;
  content: '';
}

.hud-tasks__card--red {
  border-color: rgba(255, 89, 89, 0.5);
  box-shadow: inset 0 0 px-to-vh(50) px-to-vh(2) rgba(255, 89, 89, 0.03);
}

.hud-tasks__card--red::after {
  background: rgba(255, 89, 89, 0.2);
}

.hud-tasks__card--red .hud-tasks__copy b {
  color: #ff5959;
  text-shadow: 0 px-to-vh(2) px-to-vh(5) rgba(255, 89, 89, 0.3);
}

.hud-tasks__progress {
  position: absolute;
  z-index: 2;
  right: px-to-vh(-15);
  bottom: px-to-vh(-10);
  left: px-to-vh(-15);
  display: flex;
  height: px-to-vh(20);
  overflow: hidden;
}

.hud-tasks__progress-step {
  height: 100%;
  min-width: 0;
  flex: 1 1 0;
  margin-right: px-to-vh(-3.2);
  overflow: visible;
}

.hud-tasks__progress-step:last-child {
  margin-right: 0;
}

.hud-tasks__progress-step path {
  fill: rgba(255, 201, 9, 0.04);
  stroke: rgba(255, 201, 9, 0.12);
  stroke-width: 0.3;
  transition:
    fill 0.2s ease,
    stroke 0.2s ease,
    filter 0.2s ease;
}

.hud-tasks__progress-step--active path {
  fill: rgba(255, 201, 9, 0.25);
  stroke: #ffc909;
}

.hud-tasks__card--red .hud-tasks__progress-step path {
  fill: rgba(255, 89, 89, 0.04);
  stroke: rgba(255, 89, 89, 0.12);
}

.hud-tasks__card--red .hud-tasks__progress-step--active path {
  fill: rgba(255, 89, 89, 0.25);
  stroke: #ff5959;
}
</style>
