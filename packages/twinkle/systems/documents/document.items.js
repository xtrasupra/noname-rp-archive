"use strict";

const DOCUMENT_ITEM_USE_EVENT = "inventory:item:useDocument";

const DOCUMENT_ITEM_IDS = Object.freeze({
  identity: "document_identity_card",
  medical: "document_medical_certificate",
});

const LICENSE_DOCUMENT_ITEM_IDS = Object.freeze({
  hunting: "document_license_hunting",
  fishing: "document_license_fishing",
  vehicle_a: "document_license_vehicle_a",
  vehicle_b: "document_license_vehicle_b",
  vehicle_c: "document_license_vehicle_c",
  cdl_b: "document_license_cdl_b",
  cdl_a: "document_license_cdl_a",
});

function createDocumentItem(id, name, documentKey, extra = {}) {
  return Object.freeze({
    id,
    name,
    type: "Документы",
    icon: "▤",
    weight: 0.05,
    stackable: false,
    usable: true,
    quick: false,
    bound: true,
    documentKey,
    actions: ["use", "info"],
    useEvent: DOCUMENT_ITEM_USE_EVENT,
    ...extra,
  });
}

const DOCUMENT_ITEM_CONFIGS = Object.freeze({
  [DOCUMENT_ITEM_IDS.identity]: createDocumentItem(
    DOCUMENT_ITEM_IDS.identity,
    "ID-карта",
    "identity"
  ),
  [DOCUMENT_ITEM_IDS.medical]: createDocumentItem(
    DOCUMENT_ITEM_IDS.medical,
    "Медицинское свидетельство",
    "medical"
  ),
  [LICENSE_DOCUMENT_ITEM_IDS.hunting]: createDocumentItem(
    LICENSE_DOCUMENT_ITEM_IDS.hunting,
    "Лицензия на охоту",
    "license:hunting",
    { licenseId: "hunting" }
  ),
  [LICENSE_DOCUMENT_ITEM_IDS.fishing]: createDocumentItem(
    LICENSE_DOCUMENT_ITEM_IDS.fishing,
    "Лицензия на рыболовство",
    "license:fishing",
    { licenseId: "fishing" }
  ),
  [LICENSE_DOCUMENT_ITEM_IDS.vehicle_a]: createDocumentItem(
    LICENSE_DOCUMENT_ITEM_IDS.vehicle_a,
    "Водительская лицензия · A",
    "license:vehicle_a",
    { licenseId: "vehicle_a" }
  ),
  [LICENSE_DOCUMENT_ITEM_IDS.vehicle_b]: createDocumentItem(
    LICENSE_DOCUMENT_ITEM_IDS.vehicle_b,
    "Водительская лицензия · B",
    "license:vehicle_b",
    { licenseId: "vehicle_b" }
  ),
  [LICENSE_DOCUMENT_ITEM_IDS.vehicle_c]: createDocumentItem(
    LICENSE_DOCUMENT_ITEM_IDS.vehicle_c,
    "Водительская лицензия · C",
    "license:vehicle_c",
    { licenseId: "vehicle_c" }
  ),
  [LICENSE_DOCUMENT_ITEM_IDS.cdl_b]: createDocumentItem(
    LICENSE_DOCUMENT_ITEM_IDS.cdl_b,
    "Коммерческие права · CDL B",
    "license:cdl_b",
    { licenseId: "cdl_b" }
  ),
  [LICENSE_DOCUMENT_ITEM_IDS.cdl_a]: createDocumentItem(
    LICENSE_DOCUMENT_ITEM_IDS.cdl_a,
    "Коммерческие права · CDL A",
    "license:cdl_a",
    { licenseId: "cdl_a" }
  ),
});

function getLicenseDocumentItemId(licenseId) {
  return LICENSE_DOCUMENT_ITEM_IDS[String(licenseId || "")] || "";
}

module.exports = {
  DOCUMENT_ITEM_CONFIGS,
  DOCUMENT_ITEM_IDS,
  DOCUMENT_ITEM_USE_EVENT,
  LICENSE_DOCUMENT_ITEM_IDS,
  getLicenseDocumentItemId,
};
