import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [vue()],
  build: {
    outDir: mode === 'demo' ? '../docs/demo' : '../client_packages/cef',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/shared/styles/_mixins.scss" as *;`,
      },
    },
  },
}))
