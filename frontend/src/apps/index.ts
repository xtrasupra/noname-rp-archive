import { registerInterfaces } from '@/core/interfaces/interface-registry'

import { authApp } from "./auth/app";
import { characterApp } from './character/app'
import { characterSelectionApp } from './character-selection/app'
import { f2MenuApp } from './f2-menu/app'
import { fishingCastApp } from './fishing-cast/app'
import { fishingReelingApp } from './fishing-reeling/app'
import { fishingShopApp } from './fishing-shop/app'
import { furnitureEditorApp } from './furniture-editor/app'
import { hudApp } from './hud/app'
import { huntingProcessingApp } from './hunting-processing/app'
import { huntingShopApp } from './hunting-shop/app'
import { inventoryApp } from './inventory/app'
import { licenseDocumentApp } from './license-document/app'
import { notificationsApp } from './notifications/app'
import { npcDialogApp } from './npc-dialog/app'
import { phoneApp } from './phone/app'
import { radialMenuApp } from './radial-menu/app'
import { rentCarApp } from './rent-car/app'
import { autoServiceApp } from './auto-service/app'
import { vehicleDealershipApp } from './vehicle-dealership/app'
import { lsCustomsApp } from './ls-customs/app'
import { governmentComputerApp } from './government-computer/app'
import { drivingSchoolApp } from './driving-school/app'
import { businessShopApp } from './business-shop/app'
import { selectSpawnApp } from './select-spawn/app';
import { tabletApp } from './tablet/app'
import { characterCustomizerApp } from './character-customizer/app';
import { vehicleApp } from './vehicle/app'
import { truckerResultApp } from './trucker-result/app'
import { truckerRentalApp } from './trucker-rental/app'
import { miningEquipmentApp } from './mining-equipment/app'
import { miningChallengeApp } from './mining-challenge/app'
import { forestryEquipmentApp } from './forestry-equipment/app'
import { forestryChallengeApp } from './forestry-challenge/app'

let initialized = false

export function registerInterfaceApps() {
  if (initialized) {
    return
  }

  registerInterfaces(
    hudApp,
    vehicleApp,
    authApp,
    selectSpawnApp,
    characterCustomizerApp,
    characterApp,
    characterSelectionApp,
    phoneApp,
    f2MenuApp,
    tabletApp,
    furnitureEditorApp,
    inventoryApp,
    huntingShopApp,
    huntingProcessingApp,
    fishingShopApp,
    fishingCastApp,
    fishingReelingApp,
    radialMenuApp,
    licenseDocumentApp,
    rentCarApp,
    truckerRentalApp,
    autoServiceApp,
    vehicleDealershipApp,
    lsCustomsApp,
    governmentComputerApp,
    drivingSchoolApp,
    businessShopApp,
    npcDialogApp,
    notificationsApp,
    truckerResultApp,
    miningEquipmentApp,
    miningChallengeApp,
    forestryEquipmentApp,
    forestryChallengeApp,
  )
  initialized = true
}
