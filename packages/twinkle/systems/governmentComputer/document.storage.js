"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("./governmentComputer.config.js");

let client = null;
let bucketReady = null;
let PdfDocumentConstructor = null;
let MinioModule = null;

function getStorageReadiness() {
  const reasons = [];
  if (!config.s3.accessKey || !config.s3.secretKey) reasons.push("S3 credentials are not configured");

  for (const dependency of ["pdfkit", "minio"]) {
    try {
      require.resolve(dependency);
    } catch {
      reasons.push(`${dependency} is not installed`);
    }
  }

  return {
    ready: reasons.length === 0,
    reasons,
  };
}

function requireStorageDependency(name) {
  try {
    return require(name);
  } catch (error) {
    const dependencyError = new Error(`DOCUMENT_STORAGE_DEPENDENCY_MISSING:${name}`);
    dependencyError.cause = error;
    throw dependencyError;
  }
}

function getPdfDocumentConstructor() {
  if (!PdfDocumentConstructor) {
    PdfDocumentConstructor = requireStorageDependency("pdfkit");
  }
  return PdfDocumentConstructor;
}

function getMinioModule() {
  if (!MinioModule) {
    MinioModule = requireStorageDependency("minio");
  }
  return MinioModule;
}

function getClient() {
  if (client) return client;
  if (!config.s3.accessKey || !config.s3.secretKey) throw new Error("CDN_NOT_CONFIGURED");
  const endpoint = new URL(config.s3.endpoint);
  const Minio = getMinioModule();
  client = new Minio.Client({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80)),
    useSSL: endpoint.protocol === "https:",
    accessKey: config.s3.accessKey,
    secretKey: config.s3.secretKey,
    region: config.s3.region,
  });
  return client;
}

async function ensureBucket() {
  if (bucketReady) return bucketReady;
  bucketReady = (async () => {
    const s3 = getClient();
    if (!(await s3.bucketExists(config.s3.bucket))) await s3.makeBucket(config.s3.bucket, config.s3.region);
    const publicReadPolicy = {
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Principal: { AWS: ["*"] }, Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${config.s3.bucket}/decrees/*`] }],
    };
    await s3.setBucketPolicy(config.s3.bucket, JSON.stringify(publicReadPolicy));
    return true;
  })().catch((error) => {
    bucketReady = null;
    throw error;
  });
  return bucketReady;
}

function findFont() {
  const candidates = [
    path.resolve(__dirname, "../../../../client_packages/cef/fonts/Gilroy-Medium_0.ttf"),
    path.resolve(__dirname, "../../../../frontend/public/fonts/Gilroy-Medium_0.ttf"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function createPdf(data) {
  return new Promise((resolve, reject) => {
    let PDFDocument;
    try {
      PDFDocument = getPdfDocumentConstructor();
    } catch (error) {
      reject(error);
      return;
    }
    const document = new PDFDocument({ size: "A4", margins: { top: 58, left: 62, right: 62, bottom: 58 }, info: { Title: data.title, Author: data.authorName } });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    const font = findFont();
    if (font) document.font(font);
    document.fontSize(10).fillColor("#555555").text("GOVERNMENT OF SAN ANDREAS", { align: "center", characterSpacing: 1.2 });
    document.moveDown(0.5).fontSize(18).fillColor("#111111").text("УКАЗ ПРАВИТЕЛЬСТВА", { align: "center" });
    document.moveDown(0.5).fontSize(10).text(`№ ${data.documentNumber}  •  ${data.publishedAt}`, { align: "center" });
    document.moveDown(1.5).fontSize(16).text(data.title, { align: "center" });
    if (data.summary) document.moveDown().fontSize(11).fillColor("#444444").text(data.summary, { align: "justify" });
    document.moveDown(1.2).fontSize(11).fillColor("#111111").text(data.body, { align: "justify", lineGap: 4, paragraphGap: 9 });
    document.moveDown(2).fontSize(10).text(`Вступает в силу: ${data.effectiveAt || data.publishedAt}`);
    document.moveDown(2).text(`${data.authorPosition || "Член Правительства"}\n${data.authorName}`, { align: "right" });
    document.end();
  });
}

async function uploadDecreePdf(data) {
  const buffer = await createPdf(data);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const key = `decrees/${data.decreeId}/v${data.version}-${checksum.slice(0, 12)}.pdf`;
  await ensureBucket();
  await getClient().putObject(config.s3.bucket, key, buffer, buffer.length, { "Content-Type": "application/pdf", "Cache-Control": "public, max-age=31536000, immutable" });
  return {
    key,
    url: `${String(config.s3.publicBaseUrl).replace(/\/$/, "")}/${config.s3.bucket}/${key}`,
    checksum,
    size: buffer.length,
  };
}

async function deleteDecreePdf(key) {
  const objectKey = String(key || "").trim();
  if (!objectKey) return false;
  await getClient().removeObject(config.s3.bucket, objectKey);
  return true;
}

module.exports = { createPdf, uploadDecreePdf, deleteDecreePdf, getStorageReadiness };
