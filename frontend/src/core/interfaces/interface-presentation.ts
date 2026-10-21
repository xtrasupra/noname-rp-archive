export interface InterfacePresentationEntry {
  id: string
  definition: {
    alwaysVisible?: boolean
    gameplayChrome?: boolean
  }
}

export function hasForegroundInterface(
  entries: readonly InterfacePresentationEntry[],
) {
  return entries.some((entry) => (
    entry.definition.gameplayChrome !== true && entry.definition.alwaysVisible !== true
  ))
}

export function getPresentedInterfaces<Entry extends InterfacePresentationEntry>(
  entries: readonly Entry[],
) {
  if (!hasForegroundInterface(entries)) return [...entries]

  return entries.filter((entry) => (
    entry.definition.gameplayChrome !== true || entry.definition.alwaysVisible === true
  ))
}
