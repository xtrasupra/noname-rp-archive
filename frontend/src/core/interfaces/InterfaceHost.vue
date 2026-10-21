<script setup lang="ts">
import { computed } from 'vue'

import { useInterfaceManagerStore } from '@/core/interfaces/interface-manager.store'
import { getPresentedInterfaces } from '@/core/interfaces/interface-presentation'

const interfaceManager = useInterfaceManagerStore()
const presentedEntries = computed(() =>
  getPresentedInterfaces(interfaceManager.activeEntries),
)
</script>

<template>
  <div class="interface-host" aria-live="polite">
    <TransitionGroup name="interface-fade">
      <div
        v-for="entry in presentedEntries"
        :key="entry.id"
        class="interface-host__layer"
        :data-interface-id="entry.id"
        :data-interaction="entry.definition.interaction ?? (entry.definition.kind === 'page' ? 'blocking' : 'passthrough')"
        :style="{ zIndex: String(entry.definition.layer) }"
      >
        <component :is="entry.definition.component" :payload="entry.payload" />
      </div>
    </TransitionGroup>
  </div>
</template>
