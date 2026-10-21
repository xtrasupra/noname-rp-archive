<script setup lang="ts">
withDefaults(defineProps<{
  ariaLabel?: string
  iconOnly?: boolean
  type?: 'button' | 'submit' | 'reset'
  variant?: 'ghost' | 'compact'
}>(), {
  iconOnly: false,
  type: 'button',
  variant: 'ghost',
})
</script>

<template>
  <button
    class="twinkle-button"
    :class="[
      `twinkle-button--${variant}`,
      { 'twinkle-button--icon-only': iconOnly },
    ]"
    :aria-label="ariaLabel"
    :type="type"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
.twinkle-button {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.45vh;
  background: rgb(255 255 255 / 6%);
  color: rgb(255 255 255 / 76%);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  line-height: 1;
  text-align: center;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
}

.twinkle-button:hover,
.twinkle-button:focus-visible {
  border-color: rgb(172 46 205 / 34%);
  background: rgb(172 46 205 / 12%);
  color: #ffffff;
  outline: 0;
}

.twinkle-button--compact {
  min-height: 2.45vh;
  padding: 0 0.82vh;
  font-size: calc(0.95vh + 3px);
}

.twinkle-button--icon-only {
  width: 2.45vh;
  min-width: 2.45vh;
  padding: 0;
}

.twinkle-button--icon-only :deep(svg) {
  width: 1.12vh;
  height: 1.12vh;
}
</style>
