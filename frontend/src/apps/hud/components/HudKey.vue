<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    pressed?: boolean
    variant?: 'default' | 'danger'
  }>(),
  {
    pressed: false,
    variant: 'default',
  },
)
</script>

<template>
  <span class="hud-key">
    <span class="hud-key__shadow" aria-hidden="true"></span>
    <kbd
      class="hud-key__face"
      :class="[
        { 'hud-key__face--pressed': pressed },
        `hud-key__face--${variant}`,
      ]"
    >
      {{ label }}
    </kbd>
  </span>
</template>

<style lang="scss" scoped>
.hud-key,
.hud-key *,
.hud-key *::before,
.hud-key *::after {
  box-sizing: border-box;
}

.hud-key {
  position: relative;
  display: inline-grid;
  flex: none;
}

.hud-key__shadow {
  position: absolute;
  inset: 0;
  border-radius: px-to-vh(3);
  background: #1d1d1d;
  transform: translateY(px-to-vh(2));
}

.hud-key__face {
  position: relative;
  z-index: 1;
  display: inline-grid;
  min-width: px-to-vh(20);
  min-height: px-to-vh(20);
  padding: 0 px-to-vh(5);
  place-items: center;
  border: px-to-vh(0.8) solid #161616;
  border-radius: px-to-vh(3);
  background: #07090f;
  color: #e000ff;
  font:
    700 px-to-vh(12) 'SF Pro',
    sans-serif;
  white-space: nowrap;
  transform: translateY(0);
  transition:
    transform 80ms ease-out,
    background-color 80ms ease-out,
    box-shadow 80ms ease-out,
    color 80ms ease-out;
}

.hud-key__face--pressed {
  transform: translateY(px-to-vh(2));
}

.hud-key__face--danger {
  color: #ff5959;
}
</style>
