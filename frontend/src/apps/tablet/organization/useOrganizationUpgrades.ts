import { computed, ref, type ComponentPublicInstance, type Ref } from 'vue'

import type {
  CharacterOrganization,
  CharacterOrganizationUpgrade,
  CharacterOrganizationUpgradeCategory,
} from '@/shared/types/game'

export type RenderedOrganizationUpgrade = CharacterOrganizationUpgrade & {
  categoryId: string
  categoryTitle: string
  x: number
  y: number
}

export type RenderedOrganizationUpgradeCategory = CharacterOrganizationUpgradeCategory & {
  lineEndX: number
  lineEndY: number
  upgrades: RenderedOrganizationUpgrade[]
}

type UseOrganizationUpgradesOptions = {
  activeOrganization: Ref<CharacterOrganization | null>
  emit: (eventName: string, ...args: unknown[]) => void
  organizationUpgrades: Ref<CharacterOrganization['upgrades'] | undefined>
}

export function useOrganizationUpgrades(options: UseOrganizationUpgradesOptions) {
  const hoveredUpgrade = ref<RenderedOrganizationUpgrade | null>(null)
  const upgradeAction = ref<RenderedOrganizationUpgrade | null>(null)
  const organizationUpgradeMapScale = ref(1)
  const unlockedUpgradeIds = ref<string[]>([])
  const organizationUpgradesViewport = ref<HTMLElement | null>(null)
  const isOrganizationUpgradesDragging = ref(false)
  const organizationUpgradesDragState: {
    active: boolean
    dragged: boolean
    pointerId: number | null
    scrollLeft: number
    scrollTop: number
    x: number
    y: number
  } = {
    active: false,
    dragged: false,
    pointerId: null,
    scrollLeft: 0,
    scrollTop: 0,
    x: 0,
    y: 0,
  }

  const organizationUpgradeMapCenterX = 520
  const organizationUpgradeMapCenterY = 390
  const organizationUpgradeMapDefaultScale = 1
  const organizationUpgradeMapViewBox = '-60 -80 1160 940'
  const organizationUpgradeGridBounds = {
    height: 940,
    width: 1160,
    x: -60,
    y: -80,
  }

  const organizationUpgradeMapTransform = computed(() =>
    `translate(${organizationUpgradeMapCenterX} ${organizationUpgradeMapCenterY}) scale(${organizationUpgradeMapScale.value}) translate(${-organizationUpgradeMapCenterX} ${-organizationUpgradeMapCenterY})`,
  )

  const renderedOrganizationUpgradeCategories = computed<RenderedOrganizationUpgradeCategory[]>(() => {
    const branchLength = 475
    const upgradeStartDistance = 137
    const upgradeSpacing = 97

    return (options.organizationUpgrades.value?.categories ?? []).map((category) => {
      const radians = (category.angle - 90) * Math.PI / 180
      const lineEndX = organizationUpgradeMapCenterX + Math.cos(radians) * branchLength
      const lineEndY = organizationUpgradeMapCenterY + Math.sin(radians) * branchLength

      return {
        ...category,
        lineEndX,
        lineEndY,
        upgrades: category.upgrades.map((upgrade, index) => {
          const distance = upgradeStartDistance + index * upgradeSpacing

          return {
            ...upgrade,
            categoryId: category.id,
            categoryTitle: category.title,
            unlocked: upgrade.unlocked || unlockedUpgradeIds.value.includes(upgrade.id),
            x: organizationUpgradeMapCenterX + Math.cos(radians) * distance,
            y: organizationUpgradeMapCenterY + Math.sin(radians) * distance,
          }
        }),
      }
    })
  })

  function selectOrganizationUpgrade(upgrade: RenderedOrganizationUpgrade) {
    upgradeAction.value = upgrade
    options.emit('tablet:organizationUpgradeSelectFromBrowser', options.activeOrganization.value?.id, upgrade.id)
  }

  function setOrganizationUpgradesViewport(element: Element | ComponentPublicInstance | null) {
    organizationUpgradesViewport.value = element instanceof HTMLElement ? element : null
  }

  function unlockOrganizationUpgrade(upgrade: RenderedOrganizationUpgrade) {
    if (!options.activeOrganization.value || upgrade.unlocked) {
      return
    }

    unlockedUpgradeIds.value = [...unlockedUpgradeIds.value, upgrade.id]
    upgradeAction.value = {
      ...upgrade,
      unlocked: true,
    }
    options.emit('tablet:organizationUpgradeActionFromBrowser', options.activeOrganization.value.id, upgrade.id, true)
  }

  function centerOrganizationUpgradesMap() {
    const viewport = organizationUpgradesViewport.value

    if (!viewport) {
      return
    }

    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2)
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2)
  }

  function handleOrganizationUpgradesWheel(event: WheelEvent) {
    const viewport = organizationUpgradesViewport.value

    if (!viewport || !event.shiftKey) {
      return
    }

    viewport.scrollLeft += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  }

  function startOrganizationUpgradesDrag(event: PointerEvent) {
    if (event.button !== 0 || !organizationUpgradesViewport.value) {
      return
    }

    const viewport = organizationUpgradesViewport.value
    organizationUpgradesDragState.active = true
    organizationUpgradesDragState.dragged = false
    organizationUpgradesDragState.pointerId = event.pointerId
    organizationUpgradesDragState.scrollLeft = viewport.scrollLeft
    organizationUpgradesDragState.scrollTop = viewport.scrollTop
    organizationUpgradesDragState.x = event.clientX
    organizationUpgradesDragState.y = event.clientY
    isOrganizationUpgradesDragging.value = true
    viewport.setPointerCapture(event.pointerId)
  }

  function dragOrganizationUpgradesMap(event: PointerEvent) {
    const viewport = organizationUpgradesViewport.value
    const dragState = organizationUpgradesDragState

    if (!viewport || !dragState.active || dragState.pointerId !== event.pointerId) {
      return
    }

    const deltaX = event.clientX - dragState.x
    const deltaY = event.clientY - dragState.y

    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      dragState.dragged = true
    }

    viewport.scrollLeft = dragState.scrollLeft - deltaX
    viewport.scrollTop = dragState.scrollTop - deltaY
  }

  function stopOrganizationUpgradesDrag(event: PointerEvent) {
    const viewport = organizationUpgradesViewport.value
    const dragState = organizationUpgradesDragState

    if (!dragState.active || dragState.pointerId !== event.pointerId) {
      return
    }

    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId)
    }

    dragState.active = false
    dragState.pointerId = null
    isOrganizationUpgradesDragging.value = false
  }

  function suppressOrganizationUpgradeClickAfterDrag(event: MouseEvent) {
    if (!organizationUpgradesDragState.dragged) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    organizationUpgradesDragState.dragged = false
  }

  function setOrganizationUpgradeMapScale(nextScale: number) {
    organizationUpgradeMapScale.value = Math.min(1.25, Math.max(0.7, Number(nextScale.toFixed(2))))
  }

  function changeOrganizationUpgradeMapScale(delta: number) {
    setOrganizationUpgradeMapScale(organizationUpgradeMapScale.value + delta)
  }

  function splitUpgradeName(name: string) {
    const parts = name.trim().split(/\s+/)

    if (parts.length < 2 || name.length <= 10) {
      return [name]
    }

    const midpoint = Math.ceil(parts.length / 2)

    return [
      parts.slice(0, midpoint).join(' '),
      parts.slice(midpoint).join(' '),
    ]
  }

  return {
    centerOrganizationUpgradesMap,
    changeOrganizationUpgradeMapScale,
    dragOrganizationUpgradesMap,
    handleOrganizationUpgradesWheel,
    hoveredUpgrade,
    isOrganizationUpgradesDragging,
    organizationUpgradeGridBounds,
    organizationUpgradeMapCenterX,
    organizationUpgradeMapCenterY,
    organizationUpgradeMapDefaultScale,
    organizationUpgradeMapScale,
    organizationUpgradeMapTransform,
    organizationUpgradeMapViewBox,
    renderedOrganizationUpgradeCategories,
    selectOrganizationUpgrade,
    setOrganizationUpgradeMapScale,
    setOrganizationUpgradesViewport,
    splitUpgradeName,
    startOrganizationUpgradesDrag,
    stopOrganizationUpgradesDrag,
    suppressOrganizationUpgradeClickAfterDrag,
    unlockOrganizationUpgrade,
    upgradeAction,
  }
}
