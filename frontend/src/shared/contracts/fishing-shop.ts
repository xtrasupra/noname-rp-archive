import { z } from 'zod'

const fishingShopCategorySchema = z.object({
  id: z.string().min(1).max(32),
  label: z.string().min(1).max(64),
})

const fishingShopItemSchema = z.object({
  id: z.string().min(1).max(64),
  category: z.string().min(1).max(32),
  name: z.string().min(1).max(96),
  description: z.string().max(240).optional(),
  icon: z.string().max(32).optional(),
  amount: z.number().int().min(1).max(1_000),
  price: z.number().finite().int().min(0).max(1_000_000_000),
  minLevel: z.number().int().min(1).max(1_000),
  locked: z.boolean(),
})

export const fishingShopPayloadSchema = z.object({
  contractVersion: z.literal(1),
  title: z.string().min(1).max(96),
  seller: z.string().min(1).max(96),
  cash: z.number().finite().min(0).max(1_000_000_000_000),
  purchaseRevision: z.number().finite().optional(),
  purchaseSucceeded: z.boolean().optional(),
  level: z.number().int().min(1).max(1_000),
  guide: z.array(z.string().min(1).max(240)).min(1).max(12),
  categories: z.array(fishingShopCategorySchema).min(1).max(20),
  items: z.array(fishingShopItemSchema).max(100),
}).superRefine((payload, context) => {
  const categoryIds = new Set(payload.categories.map((category) => category.id))
  if (categoryIds.size !== payload.categories.length) {
    context.addIssue({ code: 'custom', message: 'Fishing categories must be unique.', path: ['categories'] })
  }

  const itemIds = new Set(payload.items.map((item) => item.id))
  if (itemIds.size !== payload.items.length) {
    context.addIssue({ code: 'custom', message: 'Fishing items must be unique.', path: ['items'] })
  }

  payload.items.forEach((item, index) => {
    if (!categoryIds.has(item.category)) {
      context.addIssue({ code: 'custom', message: 'Fishing item category is unknown.', path: ['items', index, 'category'] })
    }
  })
})

export type ValidatedFishingShopPayload = z.infer<typeof fishingShopPayloadSchema>

export function parseFishingShopPayload(value: unknown): ValidatedFishingShopPayload | null {
  const parsed = fishingShopPayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
