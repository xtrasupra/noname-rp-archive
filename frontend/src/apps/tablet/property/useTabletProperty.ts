import { computed, ref, type Ref } from 'vue'

import type { TabletApartment, TabletHouse, TabletPropertyTab } from '@/shared/contracts/ui'

export type PropertyTab = TabletPropertyTab
export type HouseTab = 'residents' | 'upgrades'

const hiddenPropertyTabs = new Set<PropertyTab>(['settings'])

type TabletPropertyPayload = {
  activeApartmentId?: string | number | null
  activeHouseId?: string | number | null
}

type UseTabletPropertyOptions = {
  apartments: Ref<TabletApartment[]>
  emit: (eventName: string, ...args: unknown[]) => void
  houses: Ref<TabletHouse[]>
  setApartmentInterior: (apartmentId: string | number, interiorId: string | number) => void
  setHouseInterior: (houseId: string | number, interiorId: string | number) => void
  toggleApartmentLock: (apartmentId: string | number) => void
  toggleHouseLock: (houseId: string | number) => void
}

type GarageActionPayload = {
  plate?: string
  slotId?: string | number
  vehicleName?: string
}

type StorageActionPayload = {
  category?: string
  itemId?: string | number
  title?: string
}

export function useTabletProperty(options: UseTabletPropertyOptions) {
  const activeHouseId = ref<string | number | null>(null)
  const activeApartmentId = ref<string | number | null>(null)
  const activePropertyTab = ref<PropertyTab>('overview')

  const selectedHouse = computed(() =>
    options.houses.value.find((house) => house.id === activeHouseId.value) ?? null,
  )
  const selectedApartment = computed(() =>
    options.apartments.value.find((apartment) => apartment.id === activeApartmentId.value) ?? null,
  )
  const houseTitle = computed(() => selectedHouse.value ? `Дом #${selectedHouse.value.number}` : 'Мой дом')
  const apartmentTitle = computed(() => selectedApartment.value ? `Квартира #${selectedApartment.value.number}` : 'Моя квартира')

  function resetTab() {
    activePropertyTab.value = 'overview'
  }

  function openHouseApp() {
    activeApartmentId.value = null
    activeHouseId.value = options.houses.value.length === 1 ? options.houses.value[0].id : null
    resetTab()
  }

  function openApartmentApp() {
    activeHouseId.value = null
    activeApartmentId.value = options.apartments.value.length === 1 ? options.apartments.value[0].id : null
    resetTab()
  }

  function resetPropertySelection() {
    activeHouseId.value = null
    activeApartmentId.value = null
    resetTab()
  }

  function applyActivePropertyPayload(payload: TabletPropertyPayload, setActiveApp: (app: 'house' | 'apartment') => void) {
    if (payload.activeHouseId !== undefined) {
      activeHouseId.value = payload.activeHouseId
      resetTab()

      if (payload.activeHouseId != null) {
        setActiveApp('house')
      }
    }

    if (payload.activeApartmentId !== undefined) {
      activeApartmentId.value = payload.activeApartmentId
      resetTab()

      if (payload.activeApartmentId != null) {
        setActiveApp('apartment')
      }
    }
  }

  function selectHouse(house: TabletHouse) {
    activeHouseId.value = house.id
    resetTab()
    options.emit('tablet:houseSelectFromBrowser', house.id)
  }

  function selectApartment(apartment: TabletApartment) {
    activeApartmentId.value = apartment.id
    resetTab()
    options.emit('tablet:apartmentSelectFromBrowser', apartment.id)
  }

  function backFromHouseDetails() {
    activeHouseId.value = null
    resetTab()
  }

  function backFromApartmentDetails() {
    activeApartmentId.value = null
    resetTab()
  }

  function setPropertyTab(tab: PropertyTab) {
    activePropertyTab.value = hiddenPropertyTabs.has(tab) ? 'overview' : tab

    if (selectedHouse.value) {
      options.emit('tablet:houseTabFromBrowser', selectedHouse.value.id, activePropertyTab.value)
      return
    }

    if (selectedApartment.value) {
      options.emit('tablet:apartmentTabFromBrowser', selectedApartment.value.id, activePropertyTab.value)
    }
  }

  function toggleHouseLock() {
    const house = selectedHouse.value

    if (!house) {
      return
    }

    options.toggleHouseLock(house.id)
    options.emit('tablet:houseLockToggleFromBrowser', house.id, !house.locked)
  }

  function toggleApartmentLock() {
    const apartment = selectedApartment.value

    if (!apartment) {
      return
    }

    const targetLocked = !apartment.locked
    options.emit('tablet:apartmentLockToggleFromBrowser', apartment.id, targetLocked)
  }

  function routeToHouse() {
    const house = selectedHouse.value

    if (!house) {
      return
    }

    options.emit('tablet:houseRouteFromBrowser', house.id)
  }

  function routeToApartment() {
    const apartment = selectedApartment.value

    if (!apartment) {
      return
    }

    options.emit('tablet:apartmentRouteFromBrowser', apartment.id)
  }

  function evictHouseResident(residentId: string | number) {
    const house = selectedHouse.value

    if (!house) {
      return
    }

    options.emit('tablet:houseResidentEvictFromBrowser', house.id, residentId)
  }

  function evictApartmentResident(residentId: string | number) {
    const apartment = selectedApartment.value

    if (!apartment) {
      return
    }

    options.emit('tablet:apartmentResidentEvictFromBrowser', apartment.id, residentId)
  }

  function applyHouseInterior(interiorId: string | number) {
    const house = selectedHouse.value

    if (!house) {
      return
    }

    options.setHouseInterior(house.id, interiorId)
    options.emit('tablet:houseInteriorApplyFromBrowser', house.id, interiorId)
  }

  function applyApartmentInterior(interiorId: string | number) {
    const apartment = selectedApartment.value

    if (!apartment) {
      return
    }

    options.setApartmentInterior(apartment.id, interiorId)
    options.emit('tablet:apartmentInteriorApplyFromBrowser', apartment.id, interiorId)
  }

  function handleHouseAction(action: string, payload?: unknown) {
    const house = selectedHouse.value

    if (!house) {
      return
    }

    if (action === 'garage:park') {
      options.emit('tablet:houseGarageParkFromBrowser', house.id)
      return
    }

    if (action === 'garage:enter') {
      options.emit('tablet:houseGarageEnterFromBrowser', house.id)
      return
    }

    if (action === 'garage:take') {
      options.emit('tablet:houseGarageTakeFromBrowser', house.id, payload as GarageActionPayload | undefined)
      return
    }

    if (action === 'garage:access') {
      options.emit('tablet:houseGarageAccessFromBrowser', house.id, payload as GarageActionPayload | undefined)
      return
    }

    if (action === 'storage:put') {
      options.emit('tablet:houseStoragePutFromBrowser', house.id, payload as StorageActionPayload | undefined)
      return
    }

    if (action === 'storage:take') {
      options.emit('tablet:houseStorageTakeFromBrowser', house.id, payload as StorageActionPayload | undefined)
      return
    }

    if (action === 'storage:access') {
      options.emit('tablet:houseStorageAccessFromBrowser', house.id)
      return
    }

    options.emit('tablet:houseActionFromBrowser', house.id, action, payload)
  }

  function handleApartmentAction(action: string, payload?: unknown) {
    const apartment = selectedApartment.value

    if (!apartment) {
      return
    }

    if (action === 'garage:park') {
      options.emit('tablet:apartmentGarageParkFromBrowser', apartment.id)
      return
    }

    if (action === 'garage:enter') {
      options.emit('tablet:apartmentGarageEnterFromBrowser', apartment.id)
      return
    }

    if (action === 'garage:take') {
      options.emit('tablet:apartmentGarageTakeFromBrowser', apartment.id, payload as GarageActionPayload | undefined)
      return
    }

    if (action === 'garage:access') {
      options.emit('tablet:apartmentGarageAccessFromBrowser', apartment.id, payload as GarageActionPayload | undefined)
      return
    }

    if (action === 'storage:put') {
      options.emit('tablet:apartmentStoragePutFromBrowser', apartment.id, payload as StorageActionPayload | undefined)
      return
    }

    if (action === 'storage:take') {
      options.emit('tablet:apartmentStorageTakeFromBrowser', apartment.id, payload as StorageActionPayload | undefined)
      return
    }

    if (action === 'storage:access') {
      options.emit('tablet:apartmentStorageAccessFromBrowser', apartment.id)
      return
    }

    options.emit('tablet:apartmentActionFromBrowser', apartment.id, action, payload)
  }

  return {
    activeApartmentId,
    activeHouseId,
    activePropertyTab,
    apartmentTitle,
    applyApartmentInterior,
    applyActivePropertyPayload,
    applyHouseInterior,
    backFromApartmentDetails,
    backFromHouseDetails,
    evictApartmentResident,
    evictHouseResident,
    handleApartmentAction,
    handleHouseAction,
    houseTitle,
    openApartmentApp,
    openHouseApp,
    resetPropertySelection,
    routeToApartment,
    routeToHouse,
    selectedApartment,
    selectedHouse,
    selectApartment,
    selectHouse,
    setPropertyTab,
    toggleApartmentLock,
    toggleHouseLock,
  }
}
