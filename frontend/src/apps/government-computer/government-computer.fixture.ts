import type { GovernmentComputerPayload } from '@/shared/contracts/ui'

export const governmentComputerFixture: GovernmentComputerPayload = {
  permissions: { canOrderMaterials: true, canManageDecrees: true },
  documentStorage: { ready: true, reasons: [] },
  actor: { name: 'Datt Datt', fractionName: 'Government' },
  material: {
    treasury: 300000, unitPrice: 5, minAmount: 100, maxAmount: 100000,
    fractions: [{ id: 1, name: 'Los Santos Police Department', shortName: 'LSPD' }, { id: 2, name: 'Emergency Medical Services', shortName: 'EMS' }],
    orders: [],
  },
  decrees: [{ id: 1, documentNumber: '2026-001', title: 'О порядке работы государственных учреждений', summary: 'Настоящий указ устанавливает единый порядок взаимодействия государственных организаций.', body: '1. Руководителям государственных организаций обеспечить соблюдение служебной дисциплины.\n\n2. Контроль исполнения настоящего указа возложить на Правительство штата.', effectiveAt: '2026-08-10', authorName: 'Datt Datt', authorPosition: 'Губернатор', version: 1, createdAt: '2026-08-10T12:00:00.000Z' }],
}
