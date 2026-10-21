"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/generate-trucker-routes.js <legacy-source> <output-json>");
}

const source = fs.readFileSync(path.resolve(inputPath), "utf8");

function readArray(name, nextName) {
  const marker = `trucker.${name} =`;
  const start = source.indexOf(marker);
  const endMarker = `trucker.${nextName} =`;
  const end = source.indexOf(endMarker, start + marker.length);

  if (start < 0 || end < 0) {
    throw new Error(`Legacy route array ${name} was not found.`);
  }

  const literalStart = source.indexOf("[", start + marker.length);
  const terminator = source.lastIndexOf("];", end);
  const literal = source.slice(literalStart, terminator + 1);
  return vm.runInNewContext(`(${literal})`, Object.create(null), {
    timeout: 1000,
    codeGeneration: { strings: false, wasm: false },
  });
}

const valuableWords = /ювел|бренд|электрон|компьют|сервер|объектив|микрофон|золото|драгоц|картины|антиквар|автомобил/i;
const fragileWords = /стекл|посуда|телевиз|холодиль|кондиционер|монитор|медикамент|лекарств|оборудован|машинк/i;
const perishableWords = /мяс|овощ|фрукт|яйц|молок|сливк|рыб|куриц|провиз|продукт/i;
const hazmatWords = /топлив|бензин|дизел|химик|порох|газ|керосин|кислот/i;

function classify(cargo, vehicleType, rarity) {
  const masterContract = vehicleType === "truck" && rarity >= 2;
  if (hazmatWords.test(cargo)) {
    return { kind: "hazmat", minRank: masterContract ? 10 : vehicleType === "truck" ? 6 : 5, skill: masterContract ? "master_logistics" : "hazmat" };
  }
  if (perishableWords.test(cargo)) {
    return { kind: "perishable", minRank: masterContract ? 10 : vehicleType === "truck" ? 7 : 4, skill: masterContract ? "master_logistics" : "cold_chain" };
  }
  if (fragileWords.test(cargo)) {
    return { kind: "fragile", minRank: masterContract ? 10 : vehicleType === "truck" ? 5 : 4, skill: masterContract ? "master_logistics" : "fragile_cargo" };
  }
  if (valuableWords.test(cargo) || rarity >= 2) {
    return { kind: "valuable", minRank: masterContract ? 10 : vehicleType === "truck" ? 8 : 2 + rarity, skill: masterContract ? "master_logistics" : "valuable_cargo" };
  }

  return {
    kind: "standard",
    minRank: vehicleType === "pickup" ? 1 + Math.min(1, rarity) : vehicleType === "van" ? 2 + Math.min(2, rarity) : 5 + Math.min(2, rarity),
    skill: vehicleType === "truck" ? "long_haul" : null,
  };
}

function normalizeTrailerModel(model) {
  return String(model || "").toLowerCase() === "treilers4" ? "trailers4" : String(model || "");
}

function lightRoute(row, index, vehicleType, prefix) {
  const cargo = String(row[0]);
  const rarity = Number(row[10]) || 0;
  const rules = classify(cargo, vehicleType, rarity);
  return {
    id: `${prefix}${String(index + 1).padStart(4, "0")}`,
    vehicleType,
    cargo,
    company: String(row[1]),
    kind: rules.kind,
    minRank: rules.minRank,
    ...(rules.skill ? { skill: rules.skill } : {}),
    // The legacy light-vehicle data has no heading. -1 explicitly disables
    // the angular check while keeping the tight radius/speed alignment test.
    origin: { x: Number(row[2]), y: Number(row[3]), z: Number(row[4]), heading: -1 },
    destination: { x: Number(row[5]), y: Number(row[6]), z: Number(row[7]), heading: -1 },
    legacyPayRange: [Number(row[8]), Number(row[9])],
    legacyRarity: rarity,
  };
}

function truckRoute(row, index) {
  const cargo = String(row[0]);
  const rarity = Number(row[15]) || 0;
  const rules = classify(cargo, "truck", rarity);
  return {
    id: `t${String(index + 1).padStart(4, "0")}`,
    vehicleType: "truck",
    cargo,
    company: String(row[1]),
    kind: rules.kind,
    minRank: rules.minRank,
    ...(rules.skill ? { skill: rules.skill } : {}),
    trailerModel: normalizeTrailerModel(row[2]),
    trailerLivery: Number(row[3]),
    trailerColors: [Number(row[4]), Number(row[5])],
    origin: { x: Number(row[6]), y: Number(row[7]), z: Number(row[8]), heading: Number(row[9]) },
    destination: { x: Number(row[10]), y: Number(row[11]), z: Number(row[12]), heading: -1 },
    legacyPayRange: [Number(row[13]), Number(row[14])],
    legacyRarity: rarity,
  };
}

const pickups = readArray("w1", "w2").map((row, index) => lightRoute(row, index, "pickup", "p"));
const vans = readArray("w2", "w3").map((row, index) => lightRoute(row, index, "van", "v"));
const trucks = readArray("w3", "w4").map(truckRoute);
const routes = [...pickups, ...vans, ...trucks];

for (const route of routes) {
  for (const point of [route.origin, route.destination]) {
    if (![point.x, point.y, point.z, point.heading].every(Number.isFinite)) {
      throw new Error(`Invalid coordinates in ${route.id}.`);
    }
  }
}

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(routes, null, 2)}\n`, "utf8");

const trailerModels = [...new Set(trucks.map((route) => route.trailerModel))].sort();
process.stdout.write(JSON.stringify({ pickups: pickups.length, vans: vans.length, trucks: trucks.length, total: routes.length, trailerModels }));
