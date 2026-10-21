<template>
  <article
    class="card"
    :class="{ selected }"
    tabindex="0"
    @click="$emit('select', item.id)"
    @keydown.enter.prevent="$emit('select', item.id)"
    @keydown.space.prevent="$emit('select', item.id)"
  >
    <span class="title">{{ item.name }}</span>

    <span class="preview">
      <img :src="item.image" :alt="item.name" />
    </span>

    <span v-if="item.inRoom" class="overlay">
      <span class="buttons">
        <button class="btn" type="button" @click.stop="$emit('move', item.id)">
          Переместить
        </button>
        <button class="btn" type="button" @click.stop="$emit('find', item.id)">
          Найти
        </button>
        <button class="btn danger" type="button" @click.stop="$emit('delete', item.id)">
          Удалить
        </button>
      </span>
    </span>

    <span v-else class="price-overlay">
      <button class="price" type="button" @click.stop="$emit('buy', item.id)">
        {{ formatPrice(item.price) }}
      </button>
    </span>

    <span class="hover-line" />
  </article>
</template>

<script setup lang="ts">
import type { FurnitureEditorItem } from '@/shared/contracts/ui'

defineProps<{
  item: FurnitureEditorItem
  selected: boolean
}>()

defineEmits<{
  buy: [id: string | number]
  delete: [id: string | number]
  find: [id: string | number]
  move: [id: string | number]
  select: [id: string | number]
}>()

function formatPrice(price: number) {
  return `${new Intl.NumberFormat('ru-RU').format(price).replace(/\s/g, '.')}$`
}
</script>

<style scoped>
.card {
  position: relative;
  width: 120px;
  min-width: 120px;
  height: 120px;
  display: block;
  overflow: hidden;
  border: 0.1px solid #3c3c4399;
  border-radius: 6px;
  background: linear-gradient(180deg, rgb(255 255 255 / 1.2%) 0%, rgb(26 26 26 / 3%) 100%);
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 0;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 150ms ease;
}

.card:hover,
.card:focus-visible,
.card.selected {
  border-color: #3c3c4399;
  box-shadow: 0 -1px 0 0 #d454f4 inset;
  outline: none;
}

.card:hover {
  transform: none;
}

.title {
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  overflow: hidden;
  color: #808080;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview {
  height: 78px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview img {
  max-width: 92px;
  max-height: 62px;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.price-overlay,
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.overlay {
  align-items: center;
  justify-content: center;
  border-radius: 5px;
}

.overlay::before {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgb(0 0 0 / 50%);
  content: "";
}

.card:hover .overlay,
.card:focus-within .overlay,
.card:hover .price-overlay,
.card:focus-within .price-overlay {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.buttons {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 10px;
}

.btn {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0.1px solid #d454f4;
  border-radius: 3px;
  background: rgb(212 84 244 / 4%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  transition:
    background 150ms ease,
    box-shadow 150ms ease,
    color 150ms ease,
    transform 150ms ease;
}

.btn:hover,
.btn:focus-visible {
  background: rgb(212 84 244 / 38%);
  box-shadow: 0 0 10px rgb(212 84 244 / 14%) inset;
  outline: none;
}

.danger {
  background: rgb(212 84 244 / 4%);
}

.danger:hover,
.danger:focus-visible {
  background: rgb(212 84 244 / 38%);
}

.price-overlay {
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 9px;
}

.price {
  width: 80px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
  border: 0.1px solid #d454f4;
  border-radius: 2px;
  background: rgb(212 84 244 / 4%);
  color: #efb1ff;
  cursor: pointer;
  font: inherit;
  font-size: 8px;
  letter-spacing: 1.6px;
  transition:
    background 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.price:hover,
.price:focus-visible {
  background: rgb(212 84 244 / 18%);
  outline: none;
}

.hover-line {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: #d454f4;
  opacity: 0;
  transform: scaleX(0.72);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.card:hover .hover-line,
.card:focus-within .hover-line {
  opacity: 1;
  transform: scaleX(1);
}
</style>
