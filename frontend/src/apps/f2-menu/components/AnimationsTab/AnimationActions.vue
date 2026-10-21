<template>
  <section class="animation-actions">
    <h1 class="f2-menu__title">{{ title }}</h1>

    <div v-if="visibleActions.length" class="action-animation-grid">
      <button
        v-for="action in visibleActions"
        :key="action.id"
        class="action-animation-card"
        :class="{ 'action-animation-card--favorite': isFavorite(action.id) }"
        type="button"
        :aria-label="action.name"
        @click="emit('playAnimation', action.id)"
      >
        <button
          class="action-animation-card__favorite"
          type="button"
          :aria-label="isFavorite(action.id) ? 'Убрать из избранного' : 'Добавить в избранное'"
          @click.stop="emit('toggleAnimationFavorite', action.id)"
        >
          <BaseIcon :icon="Star" size="xs" :stroke-width="2.45" />
        </button>

        <span class="action-animation-card__mock" aria-hidden="true">
          <span>GIF</span>
        </span>

        <strong>{{ action.name }}</strong>
      </button>
    </div>

    <div v-else class="animation-actions__empty">
      Избранные анимации не выбраны
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { BaseIcon, Star } from '@/shared/icons'

import { animationCatalog, type AnimationCatalogItem } from './animationCatalog'

type AnimationSection = 'actions' | 'poses' | 'positive' | 'negative' | 'dances' | 'other' | 'exclusive' | 'favorite' | 'circleMenu'

const props = withDefaults(defineProps<{
  animationItems?: AnimationCatalogItem[]
  animationSection?: AnimationSection
  favoriteAnimationIds?: string[]
  title?: string
}>(), {
  animationItems: () => animationCatalog,
  animationSection: 'actions',
  favoriteAnimationIds: () => [],
  title: 'Действия',
})

const emit = defineEmits<{
  playAnimation: [animationId: string]
  toggleAnimationFavorite: [animationId: string]
}>()

const sectionCategoryMap: Partial<Record<AnimationSection, string>> = {
  actions: 'Действия',
  poses: 'Позы',
  positive: 'Позитивные',
  other: 'Прочие',
  exclusive: 'Эксклюзивные',
}

const visibleActions = computed(() => {
  if (props.animationSection === 'favorite') {
    return props.animationItems.filter((action) => props.favoriteAnimationIds.includes(action.id))
  }

  const category = sectionCategoryMap[props.animationSection]

  if (!category) {
    return props.animationItems
  }

  return props.animationItems.filter((action) => action.category === category)
})

function isFavorite(animationId: string) {
  return props.favoriteAnimationIds.includes(animationId)
}
</script>

<style scoped>
.animation-actions {
  height: calc(100vh - 4.2vh);
  min-height: 0;
  padding-bottom: 2vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 18%) transparent;
}

.animation-actions::-webkit-scrollbar {
  width: 0.45vh;
}

.animation-actions::-webkit-scrollbar-track {
  background: transparent;
}

.animation-actions::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgb(255 255 255 / 18%);
}

.action-animation-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1vh;
  margin-top: 1.35vh;
  padding-right: 0.4vh;
  padding-bottom: 3vh;
}

.action-animation-card {
  position: relative;
  min-height: 18.2vh;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 1vh;
  padding: 1.05vh 1.15vh;
  border: 0;
  border-radius: 0.6vh;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 30%),
    rgb(8 8 9 / 92%);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 6%);
  color: #ffffff;
  cursor: pointer;
  overflow: hidden;
}

.action-animation-card:hover {
  box-shadow:
    inset 0 0 0 0.1vh rgb(255 255 255 / 12%),
    0 1vh 2vh rgb(0 0 0 / 24%);
}

.action-animation-card__favorite {
  position: absolute;
  right: 0.75vh;
  top: 0.75vh;
  z-index: 3;
  width: 2.5vh;
  height: 2.5vh;
  display: inline-grid;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.48vh;
  background: rgb(0 0 0 / 42%);
  color: rgb(255 255 255 / 58%);
  cursor: pointer;
  opacity: 0;
  transition: opacity 140ms ease, color 140ms ease, border-color 140ms ease, background 140ms ease;
}

.action-animation-card:hover .action-animation-card__favorite,
.action-animation-card--favorite .action-animation-card__favorite {
  opacity: 1;
}

.action-animation-card__favorite:hover,
.action-animation-card--favorite .action-animation-card__favorite {
  border-color: rgb(172 46 205 / 42%);
  background: rgb(172 46 205 / 14%);
  color: #d46bff;
}

.action-animation-card strong {
  position: relative;
  z-index: 2;
  overflow: hidden;
  max-width: 100%;
  color: #ffffff;
  font-size: 1.02vh;
  font-weight: 600;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-animation-card__mock {
  min-width: 0;
  min-height: 13vh;
  display: grid;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.45vh;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 4%) 25%, transparent 25% 50%, rgb(255 255 255 / 4%) 50% 75%, transparent 75%),
    rgb(255 255 255 / 3%);
  background-size: 1.4vh 1.4vh;
}

.action-animation-card__mock span {
  padding: 0.42vh 0.68vh;
  border-radius: 0.35vh;
  background: rgb(0 0 0 / 38%);
  color: rgb(255 255 255 / 48%);
  font-size: 0.82vh;
  font-weight: 800;
  line-height: 1;
}

.animation-actions__empty {
  min-height: 28vh;
  display: grid;
  place-items: center;
  margin-top: 1.35vh;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 0.65vh;
  background: rgb(8 8 9 / 72%);
  color: rgb(255 255 255 / 48%);
  font-size: 1.05vh;
  font-weight: 800;
}
</style>
