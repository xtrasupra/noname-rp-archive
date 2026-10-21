"use strict";

module.exports = {
  governmentFractionId: Number(process.env.GOVERNMENT_FRACTION_ID || 3),
  materialUnitPrice: Number(process.env.GOVERNMENT_MATERIAL_UNIT_PRICE || 5),
  minMaterialAmount: 100,
  maxMaterialAmount: 100000,
  point: {
    position: { x: -1034.49, y: -2726.83, z: 20.18 },
    radius: 1.6,
    dimension: 0,
    marker: { type: 1, scale: 1.2, zOffset: -1, color: [224, 0, 255, 170] },
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || "http://83.217.193.115:9000",
    accessKey: process.env.S3_ACCESS_KEY || "",
    secretKey: process.env.S3_SECRET_KEY || "",
    bucket: process.env.S3_BUCKET_DOCUMENTS || "government-documents",
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || "http://83.217.193.115:9000",
    region: process.env.S3_REGION || "us-east-1",
  },
};
