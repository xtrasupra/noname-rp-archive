import type {
  ClientPagePropsMap,
  InterfaceId,
  InterfacePayloadMap,
  OverlayInterfaceId,
  PageInterfaceId,
  TabletApartment,
  TabletHouse,
  TabletPayload,
} from '@/shared/contracts/ui'
import type { NotificationOptions } from '@/shared/contracts/notifications'
import type { CharacterOrganization, CharacterState, PlayerState, VehicleState } from '@/shared/types/game'

export interface BrowserApiSnapshot {
  activeInterfaces: InterfaceId[]
  currentPage: PageInterfaceId | null
  character: CharacterState
  property: {
    apartments: TabletApartment[]
    houses: TabletHouse[]
  }
  player: PlayerState
  vehicle: VehicleState
}

export interface BrowserApiPages {
  close(page?: PageInterfaceId): void
  closeAll(): void
  set<Id extends InterfaceId>(
    page: Id,
    props?: Id extends PageInterfaceId ? ClientPagePropsMap[Id] | string : InterfacePayloadMap[Id] | string,
    payload?: InterfacePayloadMap[Id] | string,
  ): void
}

export interface BrowserApiInterfaces {
  close(id: InterfaceId): void
  closeAll(): void
  open<Id extends OverlayInterfaceId>(id: Id, payload?: InterfacePayloadMap[Id] | string): void
}

export interface BrowserApiState {
  getSnapshot(): BrowserApiSnapshot
  patchCharacter(payload?: Partial<CharacterState> | string | null): void
  patchPlayer(payload?: Partial<PlayerState> | string | null): void
  patchTablet(payload?: TabletPayload | string | null): void
  patchVehicle(payload?: Partial<VehicleState> | string | null): void
  reset(): void
}

export interface BrowserApiTablet {
  patch(payload?: TabletPayload | string | null): void
  patchOrganization(payload?: CharacterOrganization | string | null): void
  set(payload?: TabletPayload | string | null): void
  setOrganizations(payload?: CharacterOrganization[] | string | null): void
}

export interface TwinkleBrowserApi {
  closeAllInterfaces(): void
  closeAllPages(): void
  closeInterface(id: InterfaceId): void
  closePage(page?: PageInterfaceId): void
  getSnapshot(): BrowserApiSnapshot
  notify(message: string, options?: NotificationOptions | string): string
  clearNotifications(): void
  interfaces: BrowserApiInterfaces
  openInterface<Id extends OverlayInterfaceId>(id: Id, payload?: InterfacePayloadMap[Id] | string): void
  pages: BrowserApiPages
  patchCharacter(payload?: Partial<CharacterState> | string | null): void
  patchPlayer(payload?: Partial<PlayerState> | string | null): void
  patchTablet(payload?: TabletPayload | string | null): void
  patchVehicle(payload?: Partial<VehicleState> | string | null): void
  setPage<Id extends InterfaceId>(
    page: Id,
    props?: Id extends PageInterfaceId ? ClientPagePropsMap[Id] | string : InterfacePayloadMap[Id] | string,
    payload?: InterfacePayloadMap[Id] | string,
  ): void
  state: BrowserApiState
  tablet: BrowserApiTablet
  version: string
}

declare global {
  interface Window {
    twinkleBrowser?: TwinkleBrowserApi
  }
}

export {}
