<script setup lang="ts">
import { computed } from 'vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'
import HudBattle from './components/HudBattle.vue'
import HudBottomFeatures from './components/HudBottomFeatures.vue'
import HudChat from './components/HudChat.vue'
import HudContractModal from './components/HudContractModal.vue'
import HudDeal from './components/HudDeal.vue'
import HudGreeting from './components/HudGreeting.vue'
import HudHotkeys from './components/HudHotkeys.vue'
import HudInteraction from './components/HudInteraction.vue'
import HudPlayerInfo from './components/HudPlayerInfo.vue'
import HudServerInfo from './components/HudServerInfo.vue'
import HudSpeedometer from './components/HudSpeedometer.vue'
import HudTasks from './components/HudTasks.vue'
import HudWidgets from './components/HudWidgets.vue'
const props = defineProps<{ payload?: InterfacePayloadMap['hud'] }>()
const hud = computed(() => props.payload ?? {})
const visible = computed(() => hud.value.visible ?? true)
</script>
<template>
  <section v-if="visible" class="hud">
    <div class="hud__container">
      <div class="hud__column hud__column--left">
        <div class="hud__left-top">
          <HudChat v-if="hud.chat" :chat="hud.chat" />
          <HudHotkeys :hotkeys="hud.hotkeys" />
        </div>
        <HudPlayerInfo
          :info="hud.info"
          :player="hud.player"
          :microphone="hud.microphone"
        />
      </div>

      <div class="hud__column hud__column--right">
        <HudServerInfo :server="hud.server" :player="hud.player">
          <template #tasks><HudTasks :tasks="hud.tasks" /></template>
        </HudServerInfo>
      </div>
    </div>

    <HudBattle :battle="hud.battle" />

    <HudBottomFeatures v-if="hud.interaction || hud.deal || hud.greeting">
      <HudDeal v-if="hud.deal" :deal="hud.deal" />
      <HudGreeting v-if="hud.greeting" :greeting="hud.greeting" />
      <HudInteraction v-if="hud.interaction" :interaction="hud.interaction" />
    </HudBottomFeatures>

    <HudWidgets :hud="hud" />
    <HudSpeedometer class="hud__speedometer" />
    <HudContractModal :contract="hud.contract" />
  </section>
</template>

<style lang="scss" scoped>
.hud {
  position: fixed;
  inset: 0;
  overflow: hidden;
  color: #fff;
  font-family: 'SF Pro', sans-serif;
  pointer-events: none;
  user-select: none;
}

.hud,
.hud *,
.hud *::before,
.hud *::after {
  box-sizing: border-box;
}

.hud__container {
  position: absolute;
  inset: px-to-vh(30);
  display: flex;
  align-items: stretch;
  justify-content: space-between;
}

.hud__column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: space-between;
}

.hud__column--left {
  width: px-to-vh(435);
  align-items: flex-start;
}

.hud__column--right {
  width: px-to-vh(320);
  align-items: flex-end;
}

.hud__left-top {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: px-to-vh(41);
}

.hud__speedometer {
  position: absolute;
  right: px-to-vh(30);
  bottom: px-to-vh(30);
}
.hud :deep(img) {
  display: block;
}
.hud :deep(svg) {
  color: #fff;
}
</style>
