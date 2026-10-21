<template>
  <section>
    <h1 class="f2-menu__title">{{ section.title }}</h1>

    <div class="f2-menu__cards f2-menu__cards--wide">
      <article class="f2-menu-card">
        <h2>{{ section.title }}</h2>
        <strong>{{ section.headline }}</strong>
        <span>{{ section.description }}</span>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type SectionKey = 'animations' | 'appeals' | 'shop' | 'miniGames' | 'settings'

const props = defineProps<{
  route?: SectionKey
}>()

const sections: Record<SectionKey, { description: string, headline: string, title: string }> = {
  animations: {
    description: 'Быстрый доступ к эмоциям, походкам и игровым действиям персонажа.',
    headline: 'Список анимаций готов к подключению',
    title: 'Анимации',
  },
  appeals: {
    description: 'История обращений, статусы ответов администрации и новые заявки.',
    headline: 'Обращения игрока',
    title: 'Обращения',
  },
  shop: {
    description: 'Раздел для премиум-предметов, услуг и покупок аккаунта.',
    headline: 'Магазин Twinkle RP',
    title: 'Магазин',
  },
  miniGames: {
    description: 'Коллекция быстрых активностей и мини-игр для персонажа.',
    headline: 'Мини-игры',
    title: 'Мини-игры',
  },
  settings: {
    description: 'Настройки интерфейса, уведомлений, приватности и игрового профиля.',
    headline: 'Параметры меню',
    title: 'Настройки',
  },
}

const section = computed(() => sections[props.route ?? 'animations'])
</script>
