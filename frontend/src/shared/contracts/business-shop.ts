import { z } from 'zod'

const previewFocusSchema = z.enum(['full', 'torso', 'legs', 'feet', 'head'])

const componentPreviewSchema = z.object({
  type: z.literal('component'),
  focus: previewFocusSchema.optional(),
  component: z.number().int().min(0).max(11),
  drawable: z.number().int().min(0).max(1024),
  texture: z.number().int().min(0).max(255),
  palette: z.number().int().min(0).max(3),
})

const propPreviewSchema = z.object({
  type: z.literal('prop'),
  focus: previewFocusSchema.optional(),
  prop: z.number().int().min(0).max(7),
  drawable: z.number().int().min(-1).max(1024),
  texture: z.number().int().min(0).max(255),
})

const hairPreviewSchema = z.object({
  type: z.literal('hair'),
  focus: previewFocusSchema.optional(),
  hairId: z.number().int().min(0).max(1024),
  color1: z.number().int().min(0).max(63),
  color2: z.number().int().min(0).max(63),
})

const tattooPreviewSchema = z.object({
  type: z.literal('tattoo'),
  focus: previewFocusSchema.optional(),
  collection: z.string().min(1).max(64),
  overlay: z.string().min(1).max(64),
})

export const businessProductPreviewSchema = z.discriminatedUnion('type', [
  componentPreviewSchema,
  propPreviewSchema,
  hairPreviewSchema,
  tattooPreviewSchema,
])

export const businessProductSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(96),
  description: z.string().max(240).optional(),
  category: z.string().min(1).max(48),
  kind: z.string().min(1).max(32),
  price: z.number().finite().min(0).max(1_000_000_000),
  stock: z.number().int().min(0).max(1_000_000),
  preview: businessProductPreviewSchema.nullable().optional(),
})

const businessPreviewSessionSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1).max(64),
  dimension: z.number().int().min(0),
  heading: z.number().finite(),
  initialFrame: z.enum(['full', 'torso', 'legs', 'feet', 'head']),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
  }),
})

const fuelStationSchema = z.object({
  canRefuel: z.boolean(),
  reason: z.enum(['ready', 'no_vehicle', 'not_driver', 'not_owner', 'engine_on', 'full']),
  recommendedProductId: z.string().min(1).max(64),
  vehicle: z.object({
    name: z.string().min(1).max(96),
    plate: z.string().max(8),
    fuel: z.number().finite().min(0).max(10_000),
    capacity: z.number().finite().min(1).max(10_000),
    percent: z.number().finite().min(0).max(100),
    engineOn: z.boolean(),
  }).nullable(),
})

export const businessShopPayloadSchema = z.object({
  contractVersion: z.literal(5),
  sessionId: z.string().min(1).max(64),
  business: z.object({
    id: z.string().min(1).max(64),
    type: z.string().min(1).max(32),
    name: z.string().min(1).max(128),
    isOpen: z.boolean(),
    ownerUuid: z.number().int().positive().nullable().optional(),
    ownerName: z.string().min(1).max(128),
    purchasePrice: z.number().finite().min(0).max(1_000_000_000),
    description: z.string().max(240),
    district: z.string().min(1).max(96),
    controlLabel: z.string().min(1).max(96),
    interfaceMode: z.enum(['catalog', 'appearance', 'fuel']),
    blip: z.object({
      color: z.number().int().min(0).max(255),
      label: z.string().min(1).max(96),
      sprite: z.number().int().min(0).max(2048),
    }),
  }),
  balances: z.object({
    cash: z.number().finite().min(0).max(1_000_000_000_000),
    card: z.number().finite().min(0).max(1_000_000_000_000),
  }),
  appearance: z.object({
    gender: z.enum(['male', 'female']),
    hair: z.object({
      hairId: z.number().int().min(0).max(1024),
      color1: z.number().int().min(0).max(63),
      color2: z.number().int().min(0).max(63),
    }),
    decorations: z.array(z.object({
      collection: z.string().min(1).max(64),
      overlay: z.string().min(1).max(64),
    })).max(32),
  }),
  products: z.array(businessProductSchema).max(80),
  previewSession: businessPreviewSessionSchema.nullable().optional(),
  fuelStation: fuelStationSchema.nullable().optional(),
}).superRefine((payload, context) => {
  if (payload.business.interfaceMode === 'appearance' && !payload.previewSession) {
    context.addIssue({
      code: 'custom',
      message: 'Appearance shops require a preview session.',
      path: ['previewSession'],
    })
  }
  if (payload.business.interfaceMode === 'fuel' && !payload.fuelStation) {
    context.addIssue({
      code: 'custom',
      message: 'Fuel shops require fuel-station state.',
      path: ['fuelStation'],
    })
  }
  if (payload.previewSession && payload.previewSession.sessionId !== payload.sessionId) {
    context.addIssue({
      code: 'custom',
      message: 'Preview and customer session identifiers must match.',
      path: ['previewSession', 'sessionId'],
    })
  }
})

export type ValidatedBusinessShopPayload = z.infer<typeof businessShopPayloadSchema>
export type ValidatedBusinessProduct = z.infer<typeof businessProductSchema>

export const businessPurchaseResultSchema = z.object({
  contractVersion: z.literal(1),
  businessId: z.string().min(1).max(64),
  productId: z.string().min(1).max(64),
  success: z.boolean(),
  reason: z.string().max(64),
})

export type BusinessPurchaseResult = z.infer<typeof businessPurchaseResultSchema>

export const businessPurchaseProgressSchema = z.object({
  contractVersion: z.literal(1),
  businessId: z.string().min(1).max(64),
  productId: z.string().min(1).max(64),
  state: z.enum(['retrying', 'retry_available']),
})

export type BusinessPurchaseProgress = z.infer<typeof businessPurchaseProgressSchema>

export function parseBusinessShopPayload(value: unknown): ValidatedBusinessShopPayload | null {
  const parsed = businessShopPayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseBusinessPurchaseResult(value: unknown): BusinessPurchaseResult | null {
  const parsed = businessPurchaseResultSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseBusinessPurchaseProgress(value: unknown): BusinessPurchaseProgress | null {
  const parsed = businessPurchaseProgressSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
