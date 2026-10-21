"use strict";

const APPEARANCE_PRODUCT_KINDS = new Set(["hair", "tattoo"]);

function normalizeRequestedPurchaseQuantity(businessType, productKind, rawQuantity) {
  const quantity = Math.floor(Number(rawQuantity ?? 1));
  const requiresSingleQuantity = businessType === "clothing" || APPEARANCE_PRODUCT_KINDS.has(productKind);
  return {
    quantity,
    valid: !requiresSingleQuantity || quantity === 1,
  };
}

function resolvePurchasedQuantity(productKind, requestedQuantity, fulfilledQuantity) {
  const source = productKind === "fuel"
    ? fulfilledQuantity
    : (productKind === "item" ? requestedQuantity : 1);
  const quantity = Math.floor(Number(source));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

module.exports = {
  normalizeRequestedPurchaseQuantity,
  resolvePurchasedQuantity,
};
