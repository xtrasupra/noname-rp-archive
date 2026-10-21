import { ref } from 'vue'

export type OrganizationSortDirection = 'asc' | 'desc'

export type OrganizationSortState = {
  direction: OrganizationSortDirection
  key: string
}

export type OrganizationSortOption = {
  key: string
  label: string
}

function compareOrganizationSortValues(a: unknown, b: unknown) {
  if (a == null && b == null) {
    return 0
  }

  if (a == null) {
    return 1
  }

  if (b == null) {
    return -1
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  return String(a).localeCompare(String(b), 'ru-RU', {
    numeric: true,
    sensitivity: 'base',
  })
}

export function useOrganizationSort(sortOptions: Record<string, OrganizationSortOption[]>) {
  const organizationSorts = ref<Record<string, OrganizationSortState>>({})

  function sortOrganizationRows<T>(
    rows: readonly T[],
    table: string,
    getters: Record<string, (row: T) => unknown>,
  ) {
    const sort = organizationSorts.value[table]

    if (!sort) {
      return [...rows]
    }

    const getter = getters[sort.key]

    if (!getter) {
      return [...rows]
    }

    return [...rows].sort((a, b) => {
      const result = compareOrganizationSortValues(getter(a), getter(b))

      return sort.direction === 'asc' ? result : -result
    })
  }

  function setOrganizationSort(table: string, key: string) {
    const currentSort = organizationSorts.value[table]

    organizationSorts.value = {
      ...organizationSorts.value,
      [table]: {
        key,
        direction: currentSort?.key === key && currentSort.direction === 'asc' ? 'desc' : 'asc',
      },
    }
  }

  function selectOrganizationSort(table: string, key: string, event?: MouseEvent) {
    setOrganizationSort(table, key)
    ;(event?.currentTarget as HTMLElement | null)?.closest('details')?.removeAttribute('open')
  }

  function getOrganizationSortIndicator(table: string, key: string) {
    const sort = organizationSorts.value[table]

    if (sort?.key !== key) {
      return ''
    }

    return sort.direction === 'asc' ? '↑' : '↓'
  }

  function getOrganizationSortOptions(table: string) {
    return sortOptions[table] ?? []
  }

  function getOrganizationSortLabel(table: string, fallback = 'Выберите сортировку') {
    const sort = organizationSorts.value[table]
    const option = sortOptions[table]?.find((item) => item.key === sort?.key) ?? sortOptions[table]?.[0]

    return option?.label ?? fallback
  }

  return {
    getOrganizationSortIndicator,
    getOrganizationSortLabel,
    getOrganizationSortOptions,
    organizationSorts,
    selectOrganizationSort,
    setOrganizationSort,
    sortOrganizationRows,
  }
}
