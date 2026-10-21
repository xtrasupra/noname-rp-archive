import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

import {
  parseBusinessPurchaseProgress,
  parseBusinessPurchaseResult,
} from '@/shared/contracts/business-shop'

const PURCHASE_RESULT_EVENT = 'twinkle:business-shop:purchase-result'
const PURCHASE_PROGRESS_EVENT = 'twinkle:business-shop:purchase-progress'

export function useBusinessPurchaseFeedback(businessId: Ref<string | undefined>) {
  const pendingProductId = ref<string | null>(null)
  const retryingProductId = ref<string | null>(null)
  const retryAvailableProductId = ref<string | null>(null)

  function beginPurchase(productId: string) {
    if (pendingProductId.value) return false
    pendingProductId.value = productId
    retryingProductId.value = null
    retryAvailableProductId.value = null
    return true
  }

  function handlePurchaseResult(event: Event) {
    if (!(event instanceof CustomEvent)) return
    const result = parseBusinessPurchaseResult(event.detail)
    if (!result || result.businessId !== businessId.value) return
    if (result.productId !== pendingProductId.value) return
    pendingProductId.value = null
    retryingProductId.value = null
    retryAvailableProductId.value = null
  }

  function handlePurchaseProgress(event: Event) {
    if (!(event instanceof CustomEvent)) return
    const progress = parseBusinessPurchaseProgress(event.detail)
    if (!progress || progress.businessId !== businessId.value) return
    if (progress.productId !== pendingProductId.value) return
    retryingProductId.value = progress.state === 'retrying' ? progress.productId : null
    retryAvailableProductId.value = progress.state === 'retry_available' ? progress.productId : null
  }

  onMounted(() => {
    window.addEventListener(PURCHASE_RESULT_EVENT, handlePurchaseResult)
    window.addEventListener(PURCHASE_PROGRESS_EVENT, handlePurchaseProgress)
  })
  onBeforeUnmount(() => {
    window.removeEventListener(PURCHASE_RESULT_EVENT, handlePurchaseResult)
    window.removeEventListener(PURCHASE_PROGRESS_EVENT, handlePurchaseProgress)
  })

  return {
    beginPurchase,
    hasPendingPurchase: computed(() => pendingProductId.value !== null),
    isPurchasePending: (productId: string | undefined) => Boolean(productId && pendingProductId.value === productId),
    isPurchaseRetryAvailable: (productId: string | undefined) => Boolean(productId && retryAvailableProductId.value === productId),
    isPurchaseRetrying: (productId: string | undefined) => Boolean(productId && retryingProductId.value === productId),
  }
}
