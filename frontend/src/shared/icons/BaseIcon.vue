<script setup lang="ts">
import { computed } from 'vue'

import type { Component } from 'vue'

const props = withDefaults(defineProps<{
  icon: Component
  label?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | number
  strokeWidth?: number
}>(), {
  label: undefined,
  size: 'md',
  strokeWidth: 2,
})

const pixelSize = computed(() => {
  if (typeof props.size === 'number') {
    return props.size
  }

  return {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
  }[props.size]
})
</script>

<template>
  <component
    :is="icon"
    class="twinkle-icon"
    :aria-hidden="label ? undefined : 'true'"
    :aria-label="label"
    :size="pixelSize"
    :stroke-width="strokeWidth"
  />
</template>

<style scoped>
.twinkle-icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  flex: 0 0 auto;
  color: currentColor;
  stroke: currentColor;
  vertical-align: middle;
}
</style>
