<script setup lang="ts">
import { InterfaceHost } from '@/core/interfaces'
const isArchiveDemo = import.meta.env.MODE === 'demo'
</script>

<template>
  <div class="browser-shell" :class="{ 'archive-demo': isArchiveDemo }">
    <InterfaceHost />
    <a v-if="isArchiveDemo" class="archive-back" href="../index.html" aria-label="К обзору Twinkle" title="К обзору Twinkle">↩</a>
  </div>
</template>

<style>
.browser-shell.archive-demo{min-height:100svh;background:#10141e!important;background-color:#10141e!important;background-image:radial-gradient(ellipse at 45% 45%,#293345 0%,#10141e 75%)!important}
.archive-back{position:fixed;bottom:8px;left:8px;z-index:2147483647;display:grid;place-items:center;width:28px;height:28px;border:1px solid #ffffff24;border-radius:50%;background:#111722b3;color:#c4cbd7;font:18px system-ui,sans-serif;text-decoration:none;opacity:.45}.archive-back:hover,.archive-back:focus-visible{opacity:1}
</style>
