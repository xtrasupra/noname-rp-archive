<script setup lang="ts">
import { computed } from 'vue'

import type { InterfacePayloadMap } from '@/shared/contracts/ui'

import { useInterfaceManagerStore } from '@/core/interfaces/interface-manager.store'
import { useCharacterStore } from '@/stores/character.store'

const props = defineProps<{
  payload?: InterfacePayloadMap['character']
}>()

const interfaceManager = useInterfaceManagerStore()
const characterStore = useCharacterStore()

const currentSection = computed(() => props.payload?.section ?? 'overview')
</script>

<template>
  <section class="character-app">
    <header class="character-app__header">
      <div>
        <span class="character-app__eyebrow">Character Page</span>
        <h2>{{ characterStore.name }}</h2>
        <small>{{ currentSection }}</small>
      </div>

      <button type="button" class="character-app__close" @click="interfaceManager.close('character')">
        Скрыть
      </button>
    </header>

    <div class="character-app__stats">
      <article>
        <span>Level</span>
        <strong>{{ characterStore.level }}</strong>
      </article>
      <article>
        <span>Cash</span>
        <strong>${{ characterStore.cash.toLocaleString('ru-RU') }}</strong>
      </article>
      <article>
        <span>Bank</span>
        <strong>${{ characterStore.bank.toLocaleString('ru-RU') }}</strong>
      </article>
      <article>
        <span>Job</span>
        <strong>{{ characterStore.job }}</strong>
      </article>
      <article>
        <span>Health</span>
        <strong>{{ characterStore.health }}%</strong>
      </article>
      <article>
        <span>Armor</span>
        <strong>{{ characterStore.armor }}%</strong>
      </article>
    </div>
  </section>
</template>
