import type { StyleValue } from 'vue'

import type { CharacterOrganization } from '@/shared/types/game'

const defaultOrganizationAccentColor = '#ac2ecd'

export function formatOrganizationBadge(organization?: CharacterOrganization) {
  if (!organization) {
    return ''
  }

  return organization.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function normalizeOrganizationColor(value?: string | null) {
  const color = value?.trim()

  if (!color) {
    return null
  }

  const normalizedColor = color.startsWith('#') ? color : `#${color}`

  if (/^#[0-9a-f]{3}$/i.test(normalizedColor)) {
    return `#${[...normalizedColor.slice(1)].map((part) => `${part}${part}`).join('')}`
  }

  if (/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
    return normalizedColor
  }

  return null
}

export function getOrganizationAccentColor(organization?: CharacterOrganization | null) {
  return normalizeOrganizationColor(
    organization?.accentColor
    ?? organization?.color
    ?? organization?.tabColor,
  ) ?? defaultOrganizationAccentColor
}

export function getOrganizationTileStyle(organization?: CharacterOrganization): StyleValue | undefined {
  if (!organization) {
    return undefined
  }

  const color = normalizeOrganizationColor(organization.tabColor ?? organization.accentColor ?? organization.color)
    ?? defaultOrganizationAccentColor

  return {
    '--organization-app-color': color,
  }
}

export function getHexColorRgb(color: string) {
  const hex = normalizeOrganizationColor(color) ?? defaultOrganizationAccentColor
  const value = Number.parseInt(hex.slice(1), 16)

  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`
}

export function darkenHexColor(color: string, factor: number) {
  const hex = normalizeOrganizationColor(color) ?? defaultOrganizationAccentColor
  const value = Number.parseInt(hex.slice(1), 16)
  const red = Math.round(((value >> 16) & 255) * factor)
  const green = Math.round(((value >> 8) & 255) * factor)
  const blue = Math.round((value & 255) * factor)
  const darkenedValue = (red << 16) + (green << 8) + blue

  return `#${darkenedValue.toString(16).padStart(6, '0')}`
}
