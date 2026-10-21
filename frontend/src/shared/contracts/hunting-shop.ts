import { z } from 'zod'

const huntingShopItemSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(96),
  description: z.string().max(240).optional(),
  icon: z.string().max(32).optional(),
  amount: z.number().int().min(1).max(1_000),
  price: z.number().finite().int().min(0).max(1_000_000_000),
})

export const huntingShopPayloadSchema = z.object({
  contractVersion: z.literal(1),
  title: z.string().min(1).max(96),
  seller: z.string().min(1).max(96),
  cash: z.number().finite().min(0).max(1_000_000_000_000),
  purchaseRevision: z.number().finite().optional(),
  purchaseSucceeded: z.boolean().optional(),
  items: z.array(huntingShopItemSchema).max(100),
}).superRefine((payload, context) => {
  const itemIds = new Set(payload.items.map((item) => item.id))
  if (itemIds.size !== payload.items.length) {
    context.addIssue({ code: 'custom', message: 'Hunting items must be unique.', path: ['items'] })
  }
})

export type ValidatedHuntingShopPayload = z.infer<typeof huntingShopPayloadSchema>

export function parseHuntingShopPayload(value: unknown): ValidatedHuntingShopPayload | null {
  const parsed = huntingShopPayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
