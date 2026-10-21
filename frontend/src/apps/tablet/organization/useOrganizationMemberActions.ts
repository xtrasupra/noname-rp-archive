import { computed, ref, type Ref } from 'vue'

import type { CharacterOrganization, CharacterOrganizationMember, CharacterOrganizationRank } from '@/shared/types/game'
import type { OrganizationMemberAction, OrganizationSection } from './types'

type UseOrganizationMemberActionsOptions = {
  activeOrganization: Ref<CharacterOrganization | null>
  emit: (eventName: string, ...args: unknown[]) => void
  memberActions: OrganizationMemberAction[]
  organizationMembers: Ref<CharacterOrganizationMember[]>
  organizationSettingRanks: Ref<CharacterOrganizationRank[]>
  setSection: (section: OrganizationSection) => void
}

export function useOrganizationMemberActions(options: UseOrganizationMemberActionsOptions) {
  const selectedOrganizationMemberUid = ref<string | number | null>(null)
  const pendingMemberAction = ref<OrganizationMemberAction | null>(null)
  const memberRankActionTargetId = ref<string | number | null>(null)
  const memberRankActionReason = ref('')
  const memberDismissReason = ref('')
  const memberDismissToBlacklist = ref(false)
  const bonusModalOpen = ref(false)
  const bonusAmount = ref('')
  const bonusComment = ref('')

  const selectedOrganizationMember = computed(() =>
    options.organizationMembers.value.find((member) => member.uid === selectedOrganizationMemberUid.value) ?? null,
  )
  const isPendingMemberRankAction = computed(() =>
    pendingMemberAction.value?.id === 'promote' || pendingMemberAction.value?.id === 'demote',
  )
  const isPendingMemberDismissAction = computed(() => pendingMemberAction.value?.id === 'dismiss')
  const memberRankActionOptions = computed<CharacterOrganizationRank[]>(() => {
    if (!isPendingMemberRankAction.value) {
      return []
    }

    const currentRankValue = Number(selectedOrganizationMember.value?.rank)

    if (!Number.isFinite(currentRankValue)) {
      return options.organizationSettingRanks.value
    }

    return options.organizationSettingRanks.value.filter((rank) => {
      const rankValue = Number(rank.rank)

      if (!Number.isFinite(rankValue)) {
        return true
      }

      return pendingMemberAction.value?.id === 'promote'
        ? rankValue > currentRankValue
        : rankValue < currentRankValue
    })
  })
  const selectedMemberRankActionRank = computed(() =>
    memberRankActionOptions.value.find((rank) => String(rank.id) === String(memberRankActionTargetId.value)) ?? null,
  )

  function resetMemberActionState() {
    pendingMemberAction.value = null
    memberRankActionTargetId.value = null
    memberRankActionReason.value = ''
    memberDismissReason.value = ''
    memberDismissToBlacklist.value = false
    bonusModalOpen.value = false
    bonusAmount.value = ''
    bonusComment.value = ''
  }

  function resetOrganizationMemberState() {
    selectedOrganizationMemberUid.value = null
    resetMemberActionState()
  }

  function openMemberDetails(member: CharacterOrganizationMember) {
    selectedOrganizationMemberUid.value = member.uid
    options.setSection('memberDetails')
    options.emit('tablet:organizationMemberOpenFromBrowser', options.activeOrganization.value?.id, member.uid)
  }

  function handleMemberAction(action: OrganizationMemberAction) {
    if (!options.activeOrganization.value || !selectedOrganizationMember.value) {
      return
    }

    if (action.id === 'bonus') {
      bonusAmount.value = ''
      bonusComment.value = ''
      bonusModalOpen.value = true
      return
    }

    if (action.id === 'promote' || action.id === 'demote') {
      const currentRankValue = Number(selectedOrganizationMember.value.rank)
      const rankOptions = options.organizationSettingRanks.value.filter((rank) => {
        const rankValue = Number(rank.rank)

        if (!Number.isFinite(currentRankValue) || !Number.isFinite(rankValue)) {
          return true
        }

        return action.id === 'promote'
          ? rankValue > currentRankValue
          : rankValue < currentRankValue
      })

      memberRankActionTargetId.value = rankOptions[0]?.id ?? null
      memberRankActionReason.value = ''
    }

    if (action.id === 'dismiss') {
      memberDismissReason.value = ''
      memberDismissToBlacklist.value = false
    }

    pendingMemberAction.value = action
  }

  function submitMemberAction(result: boolean, action = pendingMemberAction.value, payload: Record<string, unknown> = {}) {
    if (!options.activeOrganization.value || !selectedOrganizationMember.value || !action) {
      return
    }

    options.emit(
      'tablet:organizationMemberActionFromBrowser',
      options.activeOrganization.value.id,
      selectedOrganizationMember.value.uid,
      action.id,
      result,
      payload,
    )

    resetMemberActionState()
  }

  function submitMemberRankAction() {
    const targetRank = selectedMemberRankActionRank.value

    submitMemberAction(true, pendingMemberAction.value, {
      rankId: targetRank?.id ?? memberRankActionTargetId.value,
      rank: targetRank?.rank ?? null,
      rankName: targetRank?.name ?? '',
      reason: memberRankActionReason.value.trim(),
    })
  }

  function submitMemberDismissAction() {
    submitMemberAction(true, pendingMemberAction.value, {
      reason: memberDismissReason.value.trim(),
      addToBlacklist: memberDismissToBlacklist.value,
    })
  }

  function closeBonusModal(result = false) {
    if (!result) {
      submitMemberAction(false, options.memberActions.find((action) => action.id === 'bonus'))
    }

    bonusModalOpen.value = false
    bonusAmount.value = ''
    bonusComment.value = ''
  }

  function submitBonus() {
    const bonusAction = options.memberActions.find((action) => action.id === 'bonus')

    submitMemberAction(true, bonusAction, {
      amount: Number(bonusAmount.value) || 0,
      comment: bonusComment.value.trim(),
    })
    closeBonusModal(true)
  }

  return {
    bonusAmount,
    bonusComment,
    bonusModalOpen,
    closeBonusModal,
    handleMemberAction,
    isPendingMemberDismissAction,
    isPendingMemberRankAction,
    memberDismissReason,
    memberDismissToBlacklist,
    memberRankActionOptions,
    memberRankActionReason,
    memberRankActionTargetId,
    openMemberDetails,
    pendingMemberAction,
    resetMemberActionState,
    resetOrganizationMemberState,
    selectedMemberRankActionRank,
    selectedOrganizationMember,
    selectedOrganizationMemberUid,
    submitBonus,
    submitMemberAction,
    submitMemberDismissAction,
    submitMemberRankAction,
  }
}
