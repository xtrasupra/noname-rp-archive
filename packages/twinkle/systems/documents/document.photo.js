"use strict";

const MAX_PHOTO_URL_LENGTH = 512;
const SAFE_RELATIVE_IMAGE = /^(?:\.\/|\/)?(?:assets|images|img)\/[a-z0-9][a-z0-9._/-]*\.(?:png|jpe?g|webp|gif)$/i;
const SAFE_PACKAGE_IMAGE = /^package:\/\/cef\/(?:assets|images|img)\/[a-z0-9][a-z0-9._/-]*\.(?:png|jpe?g|webp|gif)$/i;

function getAllowedOrigins() {
  return new Set(
    String(process.env.TWINKLE_DOCUMENT_PHOTO_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  );
}

function normalizeDocumentPhoto(value) {
  const source = String(value || "").trim();
  if (!source || source.length > MAX_PHOTO_URL_LENGTH) return "";
  if (SAFE_RELATIVE_IMAGE.test(source) || SAFE_PACKAGE_IMAGE.test(source)) return source;

  try {
    const url = new URL(source);
    const isImagePath = /\.(?:png|jpe?g|webp|gif)$/i.test(url.pathname);

    if (url.protocol === "https:" && isImagePath && getAllowedOrigins().has(url.origin)) {
      return url.toString();
    }
  } catch {}

  return "";
}

module.exports = { MAX_PHOTO_URL_LENGTH, normalizeDocumentPhoto };
