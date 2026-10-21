import type { Pinia } from 'pinia'

import { normalizePayload } from '@/core/browser-api/payload'
import { useBrowserRuntimeStore } from '@/core/browser/runtime.store'
import { useVehicleStore } from '@/stores/vehicle.store'
import type { VehicleState } from '@/shared/types/game'

export function patchVehicleState(pinia: Pinia, payload?: Partial<VehicleState> | string | null) {
  const normalizedPayload = normalizePayload<Partial<VehicleState>>(payload)

  if (!normalizedPayload) {
    return
  }

  useVehicleStore(pinia).patch(normalizedPayload)
  useBrowserRuntimeStore(pinia).appendLog('patchVehicle', JSON.stringify(normalizedPayload))
}
