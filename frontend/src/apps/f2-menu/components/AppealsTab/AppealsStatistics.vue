<template>
  <section class="appeals-statistics">
    <h1 class="f2-menu__title">Статистика</h1>

    <div class="appeals-statistics__grid">
      <article v-for="card in statisticCards" :key="card.label" class="appeals-statistics-card">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <p>{{ card.caption }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import type { InterfacePayloadMap } from '@/shared/contracts/ui'

const props = defineProps<{
  payload?: InterfacePayloadMap['f2Menu']
}>()

const liveStats = ref<any>(null)

const statisticCards = computed(() => {
  const payload = props.payload as any
  const stats = liveStats.value || payload?.appeals?.statistics

  if (Array.isArray(stats) && stats.length) {
    return stats
  }

  if (stats && typeof stats === 'object') {
    return [
      { label: 'Всего обращений', value: String(stats.total || 0), caption: 'За всё время' },
      { label: 'Открытые', value: String(stats.opened || 0), caption: 'Ожидают ответа' },
      { label: 'Рассмотрено', value: String(stats.closed || 0), caption: 'Закрыто администрацией' },
      { label: 'Среднее время ответа', value: String(stats.avgText || '0 сек.'), caption: 'За последние сутки' },
    ]
  }

  return [
    { label: 'Всего обращений', value: '0', caption: 'За все время' },
    { label: 'Открытые', value: '0', caption: 'Ожидают ответа' },
    { label: 'Рассмотрено', value: '0', caption: 'Закрыто администрацией' },
    { label: 'Среднее время ответа', value: '0 мин.', caption: 'За последние сутки' },
  ]
})

function mpTrigger(eventName: string, ...args: unknown[]) {
  try {
    const rageMp = (window as any).mp

    if (rageMp?.trigger) {
      rageMp.trigger(eventName, ...args)
    }
  } catch {}
}

function handleStatistics(event: Event) {
  liveStats.value = (event as CustomEvent).detail || null
}

onMounted(() => {
  window.addEventListener('twinkle:reports:statistics', handleStatistics)
  liveStats.value = (window as any).__TWINKLE_REPORTS_STATISTICS__ || liveStats.value
  mpTrigger('reports:statistics')
})

onUnmounted(() => {
  window.removeEventListener('twinkle:reports:statistics', handleStatistics)
})
</script>

<style scoped>
.appeals-statistics {
  min-height: 80vh;
}

.appeals-statistics__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1vh;
  margin-top: 4.2vh;
}

.appeals-statistics-card {
  min-height: 12vh;
  display: grid;
  align-content: start;
  gap: 1vh;
  padding: 1.55vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.7vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 42%),
    rgb(8 8 9 / 88%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 2%);
}

.appeals-statistics-card span {
  color: rgb(255 255 255 / 58%);
  font-size: 1.02vh;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}

.appeals-statistics-card strong {
  color: #ffffff;
  font-size: 1.8vh;
  font-weight: 700;
  line-height: 1;
}

.appeals-statistics-card p {
  margin: 0;
  color: rgb(255 255 255 / 44%);
  font-size: 1vh;
  font-weight: 600;
  line-height: 1.25;
}
</style>
