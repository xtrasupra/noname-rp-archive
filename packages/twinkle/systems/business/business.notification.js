"use strict";

const MAX_PRODUCT_NAME_LENGTH = 128;
const MAX_DISPLAY_QUANTITY = 10000;
const MAX_DISPLAY_PRICE = 1000000000000;
const MAX_CART_NOTIFICATION_LINES = 3;

function normalizeWholeNumber(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(0, Math.floor(number)));
}

function formatCustomerPurchaseNotification(result) {
  const rawProductName = String(result?.productName || result?.productId || "").trim();
  const productName = (rawProductName || "Покупка").slice(0, MAX_PRODUCT_NAME_LENGTH);
  const quantity = Math.max(1, normalizeWholeNumber(result?.quantity, 1, MAX_DISPLAY_QUANTITY));
  const totalPrice = normalizeWholeNumber(result?.totalPrice, 0, MAX_DISPLAY_PRICE);
  const quantitySuffix = result?.productKind === "fuel"
    ? `, ${quantity.toLocaleString("ru-RU")} л`
    : (quantity > 1 ? ` × ${quantity.toLocaleString("ru-RU")}` : "");
  const priceSuffix = totalPrice > 0 ? ` за $${totalPrice.toLocaleString("ru-RU")}` : "";
  return `Куплено: ${productName}${quantitySuffix}${priceSuffix}.`;
}

function formatCartPurchaseNotification(lines, totalPrice) {
  const safeLines = (Array.isArray(lines) ? lines : [])
    .map((line) => {
      const rawName = String(line?.name || line?.productName || line?.id || "").trim();
      if (!rawName) return null;
      const name = rawName.slice(0, MAX_PRODUCT_NAME_LENGTH);
      const quantity = Math.max(1, normalizeWholeNumber(line?.quantity, 1, MAX_DISPLAY_QUANTITY));
      return quantity > 1 ? `${name} × ${quantity.toLocaleString("ru-RU")}` : name;
    })
    .filter(Boolean);
  const visibleLines = safeLines.slice(0, MAX_CART_NOTIFICATION_LINES);
  const hiddenCount = Math.max(0, safeLines.length - visibleLines.length);
  const products = visibleLines.length > 0 ? visibleLines.join(", ") : "покупка";
  const hiddenSuffix = hiddenCount > 0 ? ` и ещё ${hiddenCount}` : "";
  const normalizedPrice = normalizeWholeNumber(totalPrice, 0, MAX_DISPLAY_PRICE);
  const priceSuffix = normalizedPrice > 0 ? ` за $${normalizedPrice.toLocaleString("ru-RU")}` : "";
  return `Куплено: ${products}${hiddenSuffix}${priceSuffix}.`;
}

module.exports = { formatCartPurchaseNotification, formatCustomerPurchaseNotification };
