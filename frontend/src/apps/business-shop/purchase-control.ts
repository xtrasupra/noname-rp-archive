export function isPurchaseControlDisabled(
  unavailable: boolean,
  hasPendingPurchase: boolean,
  retryAvailable: boolean,
) {
  return (unavailable || hasPendingPurchase) && !retryAvailable
}
