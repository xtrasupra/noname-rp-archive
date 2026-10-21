<script setup lang="ts">
import { InterfaceHost } from '@/core/interfaces'
const isArchiveDemo = import.meta.env.MODE === 'demo'
</script>

<template>
  <div class="browser-shell" :class="{ 'archive-demo': isArchiveDemo }">
    <InterfaceHost />
    <a v-if="isArchiveDemo" class="archive-back" href="../index.html">← Обзор Twinkle · Архивное демо</a>
  </div>
</template>

<style>
.browser-shell.archive-demo{min-height:100svh;background:#10141e!important;background-color:#10141e!important;background-image:radial-gradient(ellipse at 45% 45%,#293345 0%,#10141e 75%)!important}
.archive-back{position:fixed;bottom:12px;left:12px;z-index:2147483647;padding:9px 14px;border:1px solid #ffffff30;border-radius:10px;background:#111722ed;color:#e6ecf5;font:12px system-ui,sans-serif;text-decoration:none}
</style>
