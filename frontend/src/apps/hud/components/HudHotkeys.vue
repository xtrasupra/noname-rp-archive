<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

type Hotkeys = NonNullable<InterfacePayloadMap['hud']['hotkeys']>

defineProps<{ hotkeys?: Hotkeys }>()

const pressedKeys = ref(new Set<string>())
const normalizeKey = (key: string) => key.toLowerCase()
const isPressed = (key: string) => pressedKeys.value.has(normalizeKey(key))

function setPressed(event: KeyboardEvent, pressed: boolean) {
  const keys = new Set(pressedKeys.value)
  const key = normalizeKey(event.key)

  if (pressed) keys.add(key)
  else keys.delete(key)

  pressedKeys.value = keys
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Tab') event.preventDefault()
  setPressed(event, true)
}
const handleKeyUp = (event: KeyboardEvent) => setPressed(event, false)
const releaseAll = () => {
  pressedKeys.value = new Set()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', releaseAll)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', releaseAll)
})
</script>

<template>
  <section
    v-if="hotkeys?.isVisible && hotkeys.items.length"
    class="hud-hotkeys"
  >
    <div
      v-for="item in hotkeys.items"
      :key="`${item.key}-${item.name}`"
      class="hud-hotkeys__item"
    >
      <div class="hud-hotkeys__key-wrap">
        <div class="hud-hotkeys__key-shadow" aria-hidden="true"></div>
        <kbd
          class="hud-hotkeys__key"
          :class="{ 'hud-hotkeys__key--pressed': isPressed(item.key) }"
          >{{ item.key }}</kbd
        >
      </div>
      <span class="hud-hotkeys__label">{{ item.name }}</span>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.hud-hotkeys,
.hud-hotkeys *,
.hud-hotkeys *::before,
.hud-hotkeys *::after {
  box-sizing: border-box;
}

.hud-hotkeys {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: px-to-vh(15);
}

.hud-hotkeys__item {
  display: flex;
  align-items: center;
  gap: px-to-vh(10);
  font-size: px-to-vh(13);
}

.hud-hotkeys__key-wrap {
  position: relative;
  display: inline-grid;
  flex: none;
}

.hud-hotkeys__key-shadow {
  position: absolute;
  inset: 0;
  border-radius: px-to-vh(3);
  background: #1d1d1d;
  transform: translateY(px-to-vh(2));
}

.hud-hotkeys__key {
  position: relative;
  z-index: 1;
  display: inline-grid;
  min-width: px-to-vh(20);
  min-height: px-to-vh(20);
  padding: 0 px-to-vh(5);
  place-items: center;
  border: 0;
  border-radius: px-to-vh(3);
  background: #07090f;
  border: 0.8px solid #161616;
  color: #e000ff;
  font:
    700 px-to-vh(12) 'SF Pro',
    sans-serif;
  white-space: nowrap;
  transform: translateY(0) scale(1);
  transform-origin: center;
  transition:
    transform 80ms ease-out,
    background-color 80ms ease-out,
    box-shadow 80ms ease-out,
    color 80ms ease-out;
}

.hud-hotkeys__key--pressed {
  transform: translateY(px-to-vh(2));
}

.hud-hotkeys__label {
  overflow-wrap: anywhere;
  text-shadow: 0 px-to-vh(1.5) px-to-vh(3.6) rgba(0, 0, 0, 0.8);
}
</style>