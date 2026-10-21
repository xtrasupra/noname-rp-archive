"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const files = {
  truckerClient: read("client_packages/events/jobs/trucker.js"),
  truckerConfig: read("packages/twinkle/systems/jobs/trucker/trucker.config.js"),
  truckerService: read("packages/twinkle/systems/jobs/trucker/trucker.service.js"),
  truckerRepository: read("packages/twinkle/systems/jobs/trucker/trucker.repository.js"),
  schoolClient: read("client_packages/events/drivingSchool/drivingSchool.js"),
  schoolConfig: read("packages/twinkle/systems/drivingSchool/drivingSchool.config.js"),
  schoolServer: read("packages/twinkle/systems/drivingSchool/drivingSchool.server.js"),
  schoolUi: read("frontend/src/apps/driving-school/DrivingSchoolApp.vue"),
  truckerUi: read("frontend/src/apps/tablet/trucker/TruckerApp.vue"),
  rentalUi: read("frontend/src/apps/trucker-rental/TruckerRentalApp.vue"),
  npcConfig: read("packages/twinkle/systems/npcDialog/npcDialog.config.js"),
  npcServer: read("packages/twinkle/systems/npcDialog/npcDialog.server.js"),
  adminFly: read("client_packages/events/admin/adminFly.js"),
  interfaceContracts: read("frontend/src/shared/contracts/ui.ts"),
  interfaceLock: read("client_packages/events/interfaceLock.js"),
};

const checks = [];
function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}
function has(source, value) {
  return source.includes(value);
}

check("trucker never deletes global waypoint", !has(files.truckerClient, "setWaypointOff"));
check("trucker never overwrites global waypoint", !has(files.truckerClient, "setNewWaypoint"));
check("trucker owns a persistent route blip", has(files.truckerClient, "setRoute(true)") && has(files.truckerClient, "doesBlipHaveGpsRoute"));
check("trucker owns a visible route checkpoint", has(files.truckerClient, "mp.checkpoints.new"));
check("trucker GPS watchdog is enabled", has(files.truckerClient, "}, 1500)"));
check("dispatcher blip is short-range", /shortRange:\s*true/.test(files.truckerConfig));
check("F4 reads native waypoint sprite", has(files.adminFly, "getWaypointBlipEnumId"));
check("filters use DOM selects", (files.truckerUi.match(/<TwinkleSelect/g) || []).length === 3);
check("filters contain no native select", !has(files.truckerUi, "<select"));
check("skill nodes use hold gesture", has(files.truckerUi, "SKILL_HOLD_MS = 650") && has(files.truckerUi, "startSkillHold"));
check("skill branches follow prerequisites", has(files.truckerUi, "children.get(skill.prerequisite)") && has(files.truckerUi, "skillBranches"));
check("dedicated rental UI exists", has(files.rentalUi, "Аренда рабочего транспорта"));
check("rental page is registered", has(files.interfaceContracts, "truckerRental") && has(files.interfaceLock, '"truckerRental"'));
check("rental revalidates dispatcher distance", has(files.truckerService, "if (!isNearDispatcher(player))") && has(files.truckerService, "server:trucker:rentVehicle"));
check("rental blocks active order", has(files.truckerService, "Сначала завершите или отмените активный заказ"));
check("CDL actions are at driving school", has(files.npcConfig, "drivingSchoolCdl:cdl_b") && has(files.npcConfig, "drivingSchoolCdl:cdl_a"));
check("CDL action validates school NPC", has(files.npcServer, 'npc?.id !== "driving_school_instructor"'));
check("dispatcher no longer sells CDL", !has(files.npcConfig, "truckerCdl:"));
check("theory contains ten questions", (files.schoolConfig.match(/\bcorrect:\s*[0-2]/g) || []).length === 10);
check("theory UI reports ten questions", has(files.schoolUi, "все 10 вопросов") && has(files.schoolUi, "|| 10"));
check("remote player quit cannot clear exam", !has(files.schoolClient, 'mp.events.add("playerQuit"'));
check("school route carries server dimension", has(files.schoolServer, "dimension: session.dimension") && has(files.schoolClient, "payload.dimension"));
check("school route has GPS watchdog", has(files.schoolClient, "createCheckpointEntities") && has(files.schoolClient, "}, 1200)"));
check("school checkpoint requires assigned vehicle", has(files.schoolClient, "checkpoint.vehicleId") && has(files.schoolServer, "player.vehicle !== session.vehicle"));
check("school checkpoint tolerates sync lag", has(files.schoolServer, "Math.max(12, config.checkpointRadius)") && has(files.schoolClient, "> 9.5"));
check("category B is persistently issued", has(files.schoolServer, "issueDrivingExamLicense") && has(files.schoolServer, '"vehicle_b"'));
check("logout cancels active truck order", has(files.truckerService, 'reason: "player_disconnected"') && has(files.truckerService, "queueStopRuntime"));
check("logout penalty persists", has(files.truckerRepository, "cancelActiveDelivery") && has(files.truckerRepository, "chargedPenalty"));
check("order cancellation button remains available", has(files.truckerUi, "cancelOrderFromBrowser") && has(files.truckerUi, "Отменить и списать штраф"));
check("supplied dispatcher coordinates are exact", has(files.truckerConfig, "1010.4826049804688") && has(files.truckerConfig, "-2288.781982421875"));

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  console.log(`${entry.ok ? "PASS" : "FAIL"} ${entry.name}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
