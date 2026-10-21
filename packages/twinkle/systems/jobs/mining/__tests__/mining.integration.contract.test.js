"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../../../../../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("client loader and CEF registries include both mining interfaces", () => {
  const loader = read("client_packages/loader.js");
  const appIndex = read("TwinkleFront-main/src/apps/index.ts");
  const uiContracts = read("TwinkleFront-main/src/shared/contracts/ui.ts");
  const interfaceLock = read("client_packages/events/interfaceLock.js");

  assert.match(loader, /\.\/events\/jobs\/mining\.js/);
  assert.match(appIndex, /miningEquipmentApp/);
  assert.match(appIndex, /miningChallengeApp/);
  assert.match(uiContracts, /'miningEquipment'/);
  assert.match(uiContracts, /'miningChallenge'/);
  assert.match(interfaceLock, /"miningEquipment"/);
  assert.match(interfaceLock, /"miningChallenge"/);
});

test("server-authoritative mining event bridges exist on both sides", () => {
  const server = read("packages/twinkle/systems/jobs/mining/mining.service.js");
  const client = read("client_packages/events/jobs/mining.js");
  assert.doesNotMatch(server, /(\|\|=|&&=|\?\?=)/);
  const remoteEvents = [
    "server:mining:shop:purchase",
    "server:mining:rock:begin",
    "server:mining:rock:input",
    "server:mining:rock:cancel",
    "server:mining:cargo:sell",
    "server:mining:cargo:spill",
    "server:mining:haul:stage",
    "server:mining:gps:toggle",
  ];
  remoteEvents.forEach((eventName) => {
    assert.ok(server.includes(`registerEvent("${eventName}"`), `missing server handler ${eventName}`);
    assert.ok(client.includes(`mp.events.callRemote("${eventName}"`), `missing client bridge ${eventName}`);
  });

  assert.match(server, /requirePassport\(player\)/);
  assert.match(server, /hasLicense\(player, vehicleConfig\.license\)/);
  assert.match(server, /requestedIndex !== challenge\.index/);
  assert.match(server, /challenge\.token/);
  assert.match(server, /damageDealt/);
  assert.match(server, /yieldDamageTotal/);
  assert.match(server, /route_integrity_failed/);
  assert.match(server, /registerEvent\("playerDamage"/);
  assert.match(server, /addInterval\(securityTick, 150\)/);
  assert.match(server, /registerEvent\("playerWeaponChange"/);
  assert.match(server, /global\.__twinkleMiningCombatGuard/);
  assert.match(read("packages/twinkle/systems/inventory/inventory.events.js"), /weaponShotBlockedBySafeZone/);
});

test("mining refresh announcements are private to active shifts", () => {
  const server = read("packages/twinkle/systems/jobs/mining/mining.service.js");

  assert.match(server, /function announceToWorkingMiners\(/);
  assert.match(server, /hasActiveMiningShift\(state\?\.player, state\)/);
  assert.match(server, /chat\.sendToPlayer\(state\.player/);
  assert.doesNotMatch(server, /chat\.sendGlobal\(/);
});

test("mining requires a real inventory tool and keeps its hand prop attached", () => {
  const server = read("packages/twinkle/systems/jobs/mining/mining.service.js");
  const repository = read("packages/twinkle/systems/jobs/mining/mining.repository.js");
  const items = read("packages/twinkle/systems/inventory/inventory.items.js");
  const client = read("client_packages/events/jobs/mining.js");

  assert.match(items, /mining_basic_pickaxe:[\s\S]*documentKey: "mining:job:basic_pickaxe"/);
  assert.match(repository, /async function reconcileBasicTool[\s\S]*inventory\.reconcileBoundItemInstances/);
  assert.match(server, /async function requireOwnedMiningTool/);
  assert.match(server, /inventory\.getOwnedItemByUid\(state\.player, entitlement\.itemUid, definition\.itemId\)/);
  assert.match(server, /const tool = await requireOwnedMiningTool\(state\)/);
  assert.match(server, /Для добычи нужна рабочая кирка или арендованный бур в инвентаре/);
  assert.doesNotMatch(server, /return \{ id: "basic_pickaxe"/);
  assert.match(client, /function attachMiningTool/);
  assert.match(client, /for \(let frameIndex = 0; frameIndex < 180; frameIndex \+= 1\)/);
  assert.match(client, /function keepMiningToolAlive/);
  assert.match(client, /lastToolAttachCheckAt < 500/);
});

test("startup helpers remain compatible with the embedded RAGE runtime", () => {
  const adminDuty = read("packages/twinkle/systems/admin/admin.duty.js");
  const loader = read("packages/twinkle/clientLoaderGenerator.js");
  assert.match(adminDuty, /ensureDefaultOutfit\("male", DEFAULT_MALE_OUTFIT\)/);
  assert.doesNotMatch(adminDuty, /FROM DUAL/i);
  assert.match(loader, /writeLoaderIfChanged\(content\)/);
});

test("canonical twinkledb dump contains only the three mining tables", () => {
  const schema = read("db/twinkledb.sql");
  const names = [...schema.matchAll(/CREATE TABLE `?(mining_[a-z_]+)`?/g)].map((match) => match[1]);
  assert.deepEqual(names.sort(), ["mining_cargo", "mining_entitlements", "mining_profiles"]);
  assert.match(schema, /UNIQUE KEY `uq_mining_cargo_key`/);
  assert.match(schema, /UNIQUE KEY `uq_mining_one_active_cargo`/);
  assert.match(schema, /GENERATED ALWAYS AS \(CASE WHEN `status` IN \('carried','loaded'\)/);

  const dockerSchema = read("docker/mysql/init/02-schema.sql");
  assert.doesNotMatch(dockerSchema, /mining_(profiles|entitlements|cargo)/);
});

test("ore sale and haul delivery use locked transactional settlements", () => {
  const repository = read("packages/twinkle/systems/jobs/mining/mining.repository.js");
  assert.match(repository, /SELECT \* FROM mining_cargo WHERE id = \? AND character_uuid = \? LIMIT 1 FOR UPDATE/);
  assert.match(repository, /UPDATE mining_cargo SET status = \?, settled_at = NOW\(\), updated_at = NOW\(\).*status = \?/s);
  assert.match(repository, /await connection\.beginTransaction\(\)/);
  assert.match(repository, /await connection\.commit\(\)/);
  assert.match(repository, /await connection\.rollback\(\)/);
  assert.match(repository, /function sellOre[\s\S]*"carried", "sold"/);
  assert.match(repository, /function deliverHaul[\s\S]*"loaded", "delivered"/);
});

test("QTE secrecy, cargo continuity and rental ownership stay server authoritative", () => {
  const server = read("packages/twinkle/systems/jobs/mining/mining.service.js");
  const repository = read("packages/twinkle/systems/jobs/mining/mining.repository.js");
  const client = read("client_packages/events/jobs/mining.js");

  assert.match(server, /function challengeSequencePayload\(challenge\)/);
  assert.match(server, /sequence: challengeSequencePayload\(state\.challenge\)/);
  assert.match(server, /sequence: challengeSequencePayload\(challenge\)/);
  assert.match(server, /registerEvent\("playerEnterVehicle"/);
  assert.match(server, /state\?\.cargo\?\.kind === "ore"[\s\S]*player\.removeFromVehicle/);
  assert.doesNotMatch(server, /requestOreSpill|oreSpillPending/);
  assert.doesNotMatch(server, /jumpEnvelope|verticalSpeed >|isFalling/);
  assert.match(client, /isControlJustPressed\(0, 22\)/);
  assert.doesNotMatch(client, /\.isJumping\(\)/);
  assert.match(server, /spawnAreaFree\(vehicleConfig\)/);
  assert.match(server, /config\.trailerSpawn/);
  assert.match(server, /setVariable\("ownerType", "player"\)/);
  assert.match(server, /state\.trailerAttached/);
  assert.match(repository, /origin:\s*\{[\s\S]*stone\.position/);
  assert.match(repository, /status IN \('carried','loaded'\).*FOR UPDATE/s);
  assert.match(repository, /UPDATE mining_cargo SET kg = kg - \? WHERE cargo_key = \? AND kg >= \?/);
  assert.match(repository, /async function activateEffectFromInventory/);
  assert.match(repository, /inventory\.stageConsumeItemByUid\(connection/);
  assert.match(server, /repository\.activateEffectFromInventory\(/);
  assert.match(server, /const selected = \[\][\s\S]*selected\.every\(\(other\) => distance\(spot, other\) >= config\.activeRockMinDistance\)/);
});

test("warehouse, transferable rentals and rebuilt QTE keep their anti-dup contracts", () => {
  const config = read("packages/twinkle/systems/jobs/mining/mining.config.js");
  const repository = read("packages/twinkle/systems/jobs/mining/mining.repository.js");
  const server = read("packages/twinkle/systems/jobs/mining/mining.service.js");
  const inventory = read("packages/twinkle/systems/inventory/inventory.service.js");
  const inventoryEvents = read("packages/twinkle/systems/inventory/inventory.events.js");
  const uiLoader = read("client_packages/events/ui/ui.loader.js");
  const challengeSource = read("TwinkleFront-main/src/apps/mining-challenge/MiningChallengeApp.vue");
  const builtFiles = fs.readdirSync(path.join(root, "client_packages/cef/assets"));
  const builtChallengeJs = builtFiles.find((name) => /^MiningChallengeApp-.*\.js$/.test(name));
  const builtChallengeCss = builtFiles.find((name) => /^MiningChallengeApp-.*\.css$/.test(name));

  assert.match(config, /"A", "B", "C"/);
  assert.match(config, /"0", "1", "2"/);
  assert.match(config, /"SPACE", "SHIFT", "MOUSE1", "MOUSE2"/);
  assert.match(challengeSource, /ShiftLeft/);
  assert.match(challengeSource, /Numpad\[0-9\]/);
  assert.match(challengeSource, /legacyCode >= 65 && legacyCode <= 90/);
  assert.match(challengeSource, /cyrillicPhysicalKey\[fallback\]/);
  assert.match(challengeSource, /authoritativeIndex > localIndex\.value && pendingInput/);
  assert.doesNotMatch(challengeSource, /keyLabel\(sequence\[localIndex \+ 1\]/);
  assert.match(challengeSource, /<div class="next" aria-hidden="true"><\/div>/);
  assert.match(challengeSource, /\.overlay \{[\s\S]*background: transparent !important;[\s\S]*\}/);
  assert.match(challengeSource, /awaitingServer/);
  assert.match(challengeSource, /inputId/);
  assert.match(challengeSource, /totalDeadline/);
  assert.match(challengeSource, /stopImmediatePropagation/);
  assert.match(challengeSource, /authoritativeIndex <= acknowledgedIndex\.value/);
  assert.doesNotMatch(challengeSource, /currentKey[^\n]+\?['"]/);
  assert.doesNotMatch(challengeSource, /localIndex\.value \+= 1/);
  assert.match(server, /index <= challenge\.index \? key : ""/);
  assert.match(server, /challenge\.lastAck\?\.inputId === inputId/);
  assert.match(server, /damageDealt > 0 && entry\.correct > 0/);
  assert.match(server, /activateRockCompetition/);
  assert.match(server, /competitiveAttemptedUuids/);
  assert.match(server, /extracted \/ Math\.max\(1, Number\(rock\.resource\.hp\)\)/);
  assert.doesNotMatch(server, /Math\.max\(0\.65, config\.challenge\.humanMinimumFraction\)/);
  const miningClient = read("client_packages/events/jobs/mining.js");
  const interfaceLock = read("client_packages/events/interfaceLock.js");
  assert.doesNotMatch(miningClient, /drawMarker\(1, rock\.position/);
  assert.match(miningClient, /retryDelays: \[0\]/);
  assert.match(miningClient, /bone: 28422/);
  assert.match(miningClient, /CARGO_ATTACH = Object\.freeze\(\{ bone: 28422, position: \[-0\.4, -1\.8, -0\.6\], rotation: \[0, 20, 90\] \}\)/);
  assert.match(miningClient, /CARGO_ANIM_NAME = "pushcar_offcliff_f"/);
  assert.match(miningClient, /object\.handle !== 0[\s\S]*0xEFBE71898A993728/);
  assert.match(miningClient, /for \(let frameIndex = 0; frameIndex < 180; frameIndex \+= 1\)/);
  assert.match(miningClient, /lastWheelbarrowAttachCheckAt >= 500/);
  assert.match(miningClient, /rawChallengeBind\(keyCode, false/);
  assert.match(miningClient, /queueChallengeKeyboardFallback\(label\)/);
  const wheelbarrowSource = miningClient.slice(miningClient.indexOf("async function createWheelbarrow"), miningClient.indexOf("function clearCargoVisuals"));
  assert.doesNotMatch(wheelbarrowSource, /freezePosition\(true\)/);
  assert.doesNotMatch(wheelbarrowSource, /setVisible\(false/);
  assert.match(wheelbarrowSource, /Never[\s\S]*delete a player's barrow/);
  assert.match(miningClient, /\[3, 41, 0\]/);
  assert.match(miningClient, /disableAllControlActions\(0\)/);
  assert.match(interfaceLock, /__TWINKLE_GUARDED_KEY_BIND__/);
  assert.match(interfaceLock, /__TWINKLE_MINING_CHALLENGE_ACTIVE__/);
  assert.match(uiLoader, /activeInterfaces\.includes\(pageId\)/);
  assert.match(uiLoader, /window\.twinkleBrowser\.interfaces\.open\(pageId, payload\)/);
  assert.ok(builtChallengeJs && read(`client_packages/cef/assets/${builtChallengeJs}`).includes("ShiftLeft"));
  assert.ok(builtChallengeCss);
  const builtChallengeStyles = read(`client_packages/cef/assets/${builtChallengeCss}`);
  assert.ok(builtChallengeStyles.includes("align-items:flex-end"));
  assert.match(builtChallengeStyles, /background:(?:0 0|transparent)!important/);

  assert.match(server, /function spawnScheduledWave\(\)/);
  assert.match(server, /stock: \{ totalKg:/);
  assert.doesNotMatch(server, /stock: \{ totalKg:[^\n]*coalKg/);
  assert.match(repository, /WAREHOUSE_TOTAL_KEY/);
  assert.match(repository, /if \(cargo\.kind === "ore" && finalStatus === "sold"\)[\s\S]*\[depositedKg, WAREHOUSE_TOTAL_KEY\]/);
  assert.match(repository, /async function createHaul[\s\S]*SELECT cargo_key, kg FROM mining_cargo WHERE cargo_key = \? FOR UPDATE[\s\S]*\[WAREHOUSE_TOTAL_KEY\]/);
  assert.match(repository, /async function createHaul[\s\S]*resource_id: "mixed_ore"/);
  assert.match(repository, /WHERE cargo_key = \? AND kg >= \?/);
  assert.match(repository, /async function cancelActiveHaul[\s\S]*FOR UPDATE[\s\S]*\[returnedKg, WAREHOUSE_TOTAL_KEY\]/);
  const createHaulSource = repository.slice(repository.indexOf("async function createHaul"), repository.indexOf("function deliverHaul"));
  const cancelHaulSource = repository.slice(repository.indexOf("async function cancelActiveHaul"), repository.indexOf("async function releaseEntitlementToVoucher"));
  assert.doesNotMatch(createHaulSource, /WAREHOUSE_COAL_KEY|coalKg/);
  assert.doesNotMatch(cancelHaulSource, /WAREHOUSE_COAL_KEY|coalKg/);
  assert.match(repository, /releaseEntitlementToVoucher/);
  assert.match(repository, /redeemRentalVoucher/);
  assert.match(inventory, /runPlayersExclusive/);
  assert.match(inventoryEvents, /case "give"/);
});
