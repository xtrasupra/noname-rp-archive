import { ref, type Ref } from 'vue'

import type { CharacterOrganization } from '@/shared/types/game'

type BalanceAction = 'deposit' | 'withdraw'

type UseOrganizationFinanceOptions = {
  activeOrganization: Ref<CharacterOrganization | null>
  emit: (eventName: string, ...args: unknown[]) => void
}

export function useOrganizationFinance(options: UseOrganizationFinanceOptions) {
  const balanceModalOpen = ref(false)
  const balanceAction = ref<BalanceAction | null>(null)
  const balanceAmount = ref('')
  const balanceComment = ref('')
  const massBonusModalOpen = ref(false)
  const massBonusAmount = ref('')
  const massBonusComment = ref('')

  function resetOrganizationFinanceState() {
    balanceModalOpen.value = false
    balanceAction.value = null
    balanceAmount.value = ''
    balanceComment.value = ''
    massBonusModalOpen.value = false
    massBonusAmount.value = ''
    massBonusComment.value = ''
  }

  function openBalanceModal(action: BalanceAction) {
    balanceAction.value = action
    balanceAmount.value = ''
    balanceComment.value = ''
    balanceModalOpen.value = true
  }

  function closeBalanceModal(result = false) {
    if (!options.activeOrganization.value || !balanceAction.value) {
      balanceModalOpen.value = false
      return
    }

    if (!result) {
      options.emit('tablet:organizationBalanceActionFromBrowser', options.activeOrganization.value.id, balanceAction.value, false, {})
    }

    balanceModalOpen.value = false
    balanceAction.value = null
    balanceAmount.value = ''
    balanceComment.value = ''
  }

  function submitBalanceAction() {
    if (!options.activeOrganization.value || !balanceAction.value) {
      return
    }

    options.emit('tablet:organizationBalanceActionFromBrowser', options.activeOrganization.value.id, balanceAction.value, true, {
      amount: Number(balanceAmount.value) || 0,
      comment: balanceComment.value.trim(),
    })

    closeBalanceModal(true)
  }

  function openMassBonusModal() {
    massBonusAmount.value = ''
    massBonusComment.value = ''
    massBonusModalOpen.value = true
  }

  function closeMassBonusModal(result = false) {
    if (!options.activeOrganization.value) {
      massBonusModalOpen.value = false
      return
    }

    if (!result) {
      options.emit('tablet:organizationMassBonusActionFromBrowser', options.activeOrganization.value.id, false, {})
    }

    massBonusModalOpen.value = false
    massBonusAmount.value = ''
    massBonusComment.value = ''
  }

  function submitMassBonusAction() {
    if (!options.activeOrganization.value) {
      return
    }

    options.emit('tablet:organizationMassBonusActionFromBrowser', options.activeOrganization.value.id, true, {
      amount: Number(massBonusAmount.value) || 0,
      comment: massBonusComment.value.trim(),
    })

    closeMassBonusModal(true)
  }

  return {
    balanceAction,
    balanceAmount,
    balanceComment,
    balanceModalOpen,
    closeBalanceModal,
    closeMassBonusModal,
    massBonusAmount,
    massBonusComment,
    massBonusModalOpen,
    openBalanceModal,
    openMassBonusModal,
    resetOrganizationFinanceState,
    submitBalanceAction,
    submitMassBonusAction,
  }
}
