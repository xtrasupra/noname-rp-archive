<script setup lang="ts">
import { computed } from 'vue'

import type { InterfacePayloadMap } from '@/shared/contracts/ui'

import { useVehicleStore } from '@/stores/vehicle.store'

const props = defineProps<{
  payload?: InterfacePayloadMap['vehicle']
}>()

const vehicleStore = useVehicleStore()

const highlightedStat = computed(() => props.payload?.highlightedStat ?? 'speed')
</script>

<template>
  <section v-if="vehicleStore.inVehicle" class="vehicle-app">
    <header>
      <span>Vehicle</span>
      <strong>{{ vehicleStore.model }}</strong>
      <small>{{ vehicleStore.plate }}</small>
    </header>

    <div class="vehicle-app__stats">
      <article :class="{ 'vehicle-app__stat--highlighted': highlightedStat === 'speed' }">
        <span>Speed</span>
        <strong>{{ vehicleStore.speed }}</strong>
      </article>
      <article :class="{ 'vehicle-app__stat--highlighted': highlightedStat === 'fuel' }">
        <span>Fuel</span>
        <strong>{{ vehicleStore.fuel }}%</strong>
      </article>
      <article :class="{ 'vehicle-app__stat--highlighted': highlightedStat === 'engine' }">
        <span>Engine</span>
        <strong>{{ vehicleStore.engineHealth }}%</strong>
      </article>
    </div>
  </section>
</template>
