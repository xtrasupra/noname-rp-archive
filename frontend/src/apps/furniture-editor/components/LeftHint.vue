<template>
  <aside class="hint" aria-label="Управление редактором мебели">
    <div class="container">
      <div class="row">
        <div class="column">
          <div class="frame-h">
            <div class="state-button" :class="{ pressed: isPressed('Escape') }">Esc</div>
            <p>Отмена</p>
          </div>

          <div class="frame-v frame-v--move">
            <p>Двигать</p>
            <div class="buttons buttons--arrows">
              <div class="row-1">
                <div class="state-button" :class="{ pressed: isPressed('ArrowUp') }">
                  <img :src="up" alt="" />
                </div>
              </div>
              <div class="row-2">
                <div class="state-button" :class="{ pressed: isPressed('ArrowLeft') }">
                  <img :src="left" alt="" />
                </div>
                <div class="state-button" :class="{ pressed: isPressed('ArrowDown') }">
                  <img :src="down" alt="" />
                </div>
                <div class="state-button" :class="{ pressed: isPressed('ArrowRight') }">
                  <img :src="right" alt="" />
                </div>
              </div>
            </div>
          </div>

          <div class="frame-v">
            <p>Поставить объект</p>
            <div class="buttons">
              <div class="row-2">
                <div class="custom-button custom-button--enter" :class="{ pressed: isPressed('Enter') }">
                  Enter
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="column">
          <div class="frame-h">
            <div class="state-button" :class="{ pressed: isPressed('Backquote') }">Ё</div>
            <p>Курсор</p>
          </div>

          <div class="frame-v">
            <p>Поднять / опустить</p>
            <div class="buttons">
              <div class="row-2">
                <div class="state-button" :class="{ pressed: isPressed('AltLeft', 'AltRight') }">Alt</div>
                <img :src="plus" alt="" width="12" height="12" />
                <div class="state-button" :class="{ pressed: isPressed('ArrowDown') }">
                  <img :src="down" alt="" />
                </div>
                <div class="state-button" :class="{ pressed: isPressed('ArrowUp') }">
                  <img :src="up" alt="" />
                </div>
              </div>
            </div>
          </div>

          <div class="frame-v">
            <p>Поворот</p>
            <div class="buttons">
              <div class="row-2">
                <div class="state-button" :class="{ pressed: isPressed('AltLeft', 'AltRight') }">Alt</div>
                <img :src="plus" alt="" width="12" height="12" />
                <div class="state-button" :class="{ pressed: isPressed('ArrowLeft') }">
                  <img :src="left" alt="" />
                </div>
                <div class="state-button" :class="{ pressed: isPressed('ArrowRight') }">
                  <img :src="right" alt="" />
                </div>
              </div>
            </div>
          </div>

          <div class="frame-v">
            <p>Прилипание</p>
            <div class="custom-button custom-button--space" :class="{ pressed: isPressed('Space') }">
              Space
            </div>
          </div>
        </div>
      </div>

    </div>
  </aside>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import down from '../assets/images/row-down.svg'
import left from '../assets/images/row-left.svg'
// import mouse from '../assets/images/mouse.svg'
import plus from '../assets/images/plus.svg'
import right from '../assets/images/row-right.svg'
import up from '../assets/images/row-up.svg'

const pressedKeys = ref<Set<string>>(new Set())
const pulseTimers = new Map<string, number>()

function setPressed(code: string, pressed: boolean) {
  const next = new Set(pressedKeys.value)

  if (pressed) {
    next.add(code)
  } else {
    next.delete(code)
  }

  pressedKeys.value = next
}

function handleKeyDown(event: KeyboardEvent) {
  setPressed(event.code, true)
}

function handleKeyUp(event: KeyboardEvent) {
  setPressed(event.code, false)
}

function pulsePressed(code: string, duration = 150) {
  setPressed(code, true)

  const previousTimer = pulseTimers.get(code)

  if (previousTimer) {
    window.clearTimeout(previousTimer)
  }

  const timer = window.setTimeout(() => {
    setPressed(code, false)
    pulseTimers.delete(code)
  }, duration)

  pulseTimers.set(code, timer)
}

function handleEditorKey(event: Event) {
  const detail = (event as CustomEvent<{ code?: string, duration?: number, pressed?: boolean }>).detail

  if (!detail?.code) {
    return
  }

  if (detail.pressed === false) {
    setPressed(detail.code, false)
    return
  }

  pulsePressed(detail.code, detail.duration ?? 150)
}

function isPressed(...codes: string[]) {
  return codes.some((code) => pressedKeys.value.has(code))
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('twinkle:furnitureEditor:key', handleEditorKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('twinkle:furnitureEditor:key', handleEditorKey)

  for (const timer of pulseTimers.values()) {
    window.clearTimeout(timer)
  }

  pulseTimers.clear()
})
</script>

<style scoped>
.hint {
  display: flex;
  align-items: center;
  height: 100%;
}

.container {
  width: 350px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-left: 40px;
  padding: 20px;
  border: 1px solid #5f238f;
  border-radius: 6px;
  background: #090909;
  color: #d9d9d9;
  font-size: 11px;
}

.row {
  width: 100%;
  display: flex;
  justify-content: space-around;
  gap: 10px;
}

.column {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  gap: 10px;
}

.frame-h,
.frame-v {
  width: 150px;
  border: 0.1px solid #3c3c4399;
  border-radius: 6px;
  background: linear-gradient(180deg, rgb(255 255 255 / 1.2%) 0%, rgb(26 26 26 / 3%) 100%);
}

.frame-h {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
}

button.frame-h {
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.frame-v {
  height: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 10px;
}

.frame-v--move {
  height: 156px;
}

.buttons {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.buttons--arrows {
  margin-top: 2px;
}

.row-1,
.row-2 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.frame-h p,
.frame-v p,
.row-2 p {
  margin: 0;
}

.state-button,
.custom-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  border-radius: 3px;
  background: linear-gradient(180deg, rgb(7 7 7 / 80%) 0%, #070707 100%);
  box-shadow:
    0 -1px 0 0 #d454f4 inset,
    0 -1px 9px 0 rgb(212 84 244 / 5%) inset;
  color: #eea9ff;
  font-size: 11px;
  transition:
    background 90ms ease,
    box-shadow 90ms ease,
    transform 90ms ease;
}

.state-button {
  width: 30px;
}

.state-button img {
  max-width: 12px;
  max-height: 12px;
}

.custom-button--enter {
  width: 70px;
}

.custom-button--space {
  width: 120px;
}

.state-button.pressed,
.custom-button.pressed {
  background: linear-gradient(180deg, #070707 0%, rgb(7 7 7 / 90%) 100%);
  box-shadow: 0 0 9px 0 rgb(212 84 244 / 5%) inset;
  transform: translateY(1px);
}
</style>
