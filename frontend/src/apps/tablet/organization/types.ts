import type { Component } from 'vue'

export type OrganizationSection =
  | 'home'
  | 'members'
  | 'memberDetails'
  | 'storage'
  | 'balance'
  | 'settings'
  | 'bonus'
  | 'territories'
  | 'blacklist'
  | 'info'
  | 'upgrades'

export type OrganizationMemberAction = {
  id: string
  label: string
  icon: Component
}

export type OrganizationAction = {
  id: string
  label: string
  icon: Component
}
