<template>
  <div class="hud-bottom-features">
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.hud-bottom-features {
  position: absolute;
  bottom: px-to-vh(30);
  left: 50%;
  display: flex;
  max-width: calc(100vw - px-to-vh(60));
  flex-direction: column;
  align-items: center;
  gap: px-to-vh(30);
  transform: translateX(-50%);
}
</style>
