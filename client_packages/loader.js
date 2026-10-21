// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.

const files = [
  "./events/hud/hudSnapshot.js",
  "./events/interfaceLock.js",
  "./events/ui/ui.loader.js",
  "./events/ui/ui.state.js",
  "./events/admin/adminCuffs.js",
  "./events/admin/adminFly.js",
  "./events/admin/cord.js",
  "./events/admin/jail.client.js",
  "./events/admin/reports.client.js",
  "./events/animations/animations.js",
  "./events/auth/auth.js",
  "./events/autoService/autoService.js",
  "./events/business/business.js",
  "./events/character/characterSelection.js",
  "./events/condos/condos.js",
  "./events/createchar/char.js",
  "./events/drivingSchool/drivingSchool.js",
  "./events/f2/f2menu.js",
  "./events/f2/roulette.js",
  "./events/fishing/fishing.js",
  "./events/fractions/contracts.js",
  "./events/fractions/crimeCuffs.js",
  "./events/fractions/forceCuffs.js",
  "./events/fractions/ghetto.js",
  "./events/fractions/tablet.js",
  "./events/governmentComputer/governmentComputer.js",
  "./events/house/houses.js",
  "./events/hud/hud-chat.js",
  "./events/hud/hud.js",
  "./events/hud/vehicleHud.js",
  "./events/hunting/hunting.js",
  "./events/inventory/inventory.js",
  "./events/inventory/inventory.weapon.js",
  "./events/jobs/armoredCollector.js",
  "./events/jobs/cargoLoader.js",
  "./events/jobs/delivery.js",
  "./events/jobs/forestry.js",
  "./events/jobs/mining.js",
  "./events/jobs/systemFactory.jobs.js",
  "./events/jobs/taxi.js",
  "./events/jobs/trucker.js",
  "./events/licenses/licenses.js",
  "./events/lsc/lsc.js",
  "./events/map/blipLegend.js",
  "./events/nametags.js",
  "./events/npcDialog/npcDialog.js",
  "./events/objectEditor/objectEditor.js",
  "./events/phone/phone.js",
  "./events/quests/quests.js",
  "./events/radialMenu/radialMenu.js",
  "./events/rentcar/rentCar.js",
  "./events/spawn/spawn.js",
  "./events/vehicle/vehicle.scrapyard.js",
  "./events/vehicleDealership/vehicleDealership.js"
];

const loaded = [];
const failed = [];

for (const file of files) {
  try {
    require(file);

    loaded.push(file);

    if (typeof mp !== 'undefined' && mp.console) {
      mp.console.logInfo(`[CLIENT LOADED] ${file}`);
    }
  } catch (e) {
    failed.push({
      file,
      error: e && e.message ? e.message : String(e),
    });

    if (typeof mp !== 'undefined' && mp.console) {
      mp.console.logError(`[CLIENT ERROR] ${file}: ${e.message}`);
    }
  }
}

if (typeof mp !== 'undefined' && mp.console) {
  mp.console.logInfo(
    `[CLIENT LOADER] Loaded: ${loaded.length}, Failed: ${failed.length}`
  );
}

global.clientLoaderStatus = {
  loaded,
  failed,
};
