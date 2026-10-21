"use strict";

const CP1252_BYTES = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

function toCp1252Buffer(value) {
  const bytes = [];

  for (const char of String(value || "")) {
    const code = char.codePointAt(0);
    if (code <= 0xff) {
      bytes.push(code);
    } else if (CP1252_BYTES.has(code)) {
      bytes.push(CP1252_BYTES.get(code));
    } else {
      return null;
    }
  }

  return Buffer.from(bytes);
}

function hasMojibakeMarker(text) {
  for (const char of String(text || "")) {
    const code = char.codePointAt(0);
    if (code === 0x00d0 || code === 0x00d1 || code === 0x00c2 || code === 0x00e2) {
      return true;
    }
  }

  return false;
}

function fixMojibake(value) {
  const text = String(value ?? "");
  if (!hasMojibakeMarker(text)) return text;

  const buffer = toCp1252Buffer(text);
  if (!buffer) return text;

  const decoded = buffer.toString("utf8");
  return decoded.includes("\uFFFD") ? text : decoded;
}

function sanitizeText(value) {
  if (typeof value !== "string") return value;
  return fixMojibake(value);
}

function sanitizePayload(value) {
  if (typeof value === "string") return sanitizeText(value);
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizePayload);

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = sanitizePayload(entry);
  }
  return result;
}

module.exports = {
  fixMojibake,
  sanitizeText,
  sanitizePayload,
};
