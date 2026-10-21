import { nextTick, onMounted, ref, watch, type ComponentPublicInstance, type Ref } from 'vue'

import type { CharacterOrganization, CharacterOrganizationTerritory } from '@/shared/types/game'
import type { OrganizationSection } from './types'

type UseOrganizationTerritoriesOptions = {
  activeSection: Ref<OrganizationSection>
  organizationTerritories: Ref<CharacterOrganization['territories'] | undefined>
}

export function useOrganizationTerritories(options: UseOrganizationTerritoriesOptions) {
  const territoriesCanvas = ref<HTMLCanvasElement | null>(null)

  function setTerritoriesCanvas(element: Element | ComponentPublicInstance | null) {
    territoriesCanvas.value = element instanceof HTMLCanvasElement ? element : null

    if (territoriesCanvas.value && options.activeSection.value === 'territories') {
      scheduleTerritoriesMapDraw()
    }
  }

  function drawStripedCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, size, size)
    ctx.clip()
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.72
    ctx.lineWidth = 3

    for (let offset = -size; offset < size * 2; offset += 10) {
      ctx.beginPath()
      ctx.moveTo(x + offset, y + size)
      ctx.lineTo(x + offset + size, y)
      ctx.stroke()
    }

    ctx.restore()
  }

  function drawTerritoryIcon(ctx: CanvasRenderingContext2D, territory: CharacterOrganizationTerritory, x: number, y: number, size: number) {
    if (!territory.striped) {
      return
    }

    ctx.save()
    ctx.translate(x + size / 2, y + size / 2)
    ctx.fillStyle = territory.ownerColor
    ctx.globalAlpha = 0.96
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.14, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = territory.ownerColor
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-size * 0.22, size * 0.12)
    ctx.lineTo(size * 0.22, -size * 0.12)
    ctx.moveTo(-size * 0.22, -size * 0.12)
    ctx.lineTo(size * 0.22, size * 0.12)
    ctx.stroke()
    ctx.restore()
  }

  function drawTerritoriesMap() {
    const canvas = territoriesCanvas.value
    const territories = options.organizationTerritories.value?.businesses ?? []

    if (!canvas || !territories.length) {
      return
    }

    const ctx = canvas.getContext('2d')

    if (!ctx) {
      return
    }

    const width = 900
    const height = 520
    const cell = 43
    const gap = 6
    const offsetX = 82
    const offsetY = 24

    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)

    const bgGradient = ctx.createRadialGradient(width * 0.5, height * 0.35, 20, width * 0.5, height * 0.45, width * 0.72)
    bgGradient.addColorStop(0, 'rgba(255, 255, 255, 0.035)')
    bgGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, width, height)

    territories.forEach((territory) => {
      const x = offsetX + territory.x * (cell + gap)
      const y = offsetY + territory.y * (cell + gap)

      ctx.save()
      ctx.globalAlpha = territory.active ? 0.96 : 0.5
      ctx.fillStyle = territory.ownerColor
      ctx.fillRect(x, y, cell, cell)
      ctx.globalAlpha = 1
      ctx.strokeStyle = territory.active ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'
      ctx.lineWidth = territory.active ? 2 : 1
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1)

      if (territory.striped) {
        drawStripedCell(ctx, x, y, cell, territory.ownerColor)
        drawTerritoryIcon(ctx, territory, x, y, cell)
      }

      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = 0.92
      ctx.font = '600 12px "Segoe UI", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(territory.businessCount), x + cell / 2, y + cell / 2)
      ctx.restore()
    })
  }

  function scheduleTerritoriesMapDraw() {
    void nextTick(() => {
      requestAnimationFrame(drawTerritoriesMap)
    })
  }

  onMounted(() => {
    scheduleTerritoriesMapDraw()
  })

  watch(
    [options.activeSection, options.organizationTerritories],
    () => {
      if (options.activeSection.value === 'territories') {
        scheduleTerritoriesMapDraw()
      }
    },
    { deep: true, flush: 'post' },
  )

  return {
    drawTerritoriesMap,
    scheduleTerritoriesMapDraw,
    setTerritoriesCanvas,
  }
}
