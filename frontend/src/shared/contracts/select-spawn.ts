import { z } from 'zod'

const spawnPositionSchema = z.object({
  x: z.number().finite().min(-20_000).max(20_000),
  y: z.number().finite().min(-20_000).max(20_000),
  z: z.number().finite().min(-2_000).max(5_000),
}).strict()

const spawnOptionSchema = z.object({
  type: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(96).optional(),
  icon: z.string().trim().min(1).max(32).optional(),
  kind: z.string().trim().min(1).max(32).optional(),
  npcId: z.string().trim().min(1).max(64).optional(),
  starterIndex: z.number().int().min(0).max(19).optional(),
  position: spawnPositionSchema,
  heading: z.number().finite().min(-360_000).max(360_000),
  dimension: z.number().int().min(0).max(2_147_483_647),
}).strict()

export const selectSpawnPayloadSchema = z.object({
  contractVersion: z.literal(1),
  selected: z.string().trim().min(1).max(64),
  options: z.array(spawnOptionSchema).min(1).max(20),
  pending: z.boolean().optional(),
  uiRevision: z.number().int().min(1),
}).strict().superRefine((payload, context) => {
  const optionTypes = new Set(payload.options.map((option) => option.type))

  if (optionTypes.size !== payload.options.length) {
    context.addIssue({
      code: 'custom',
      message: 'Spawn option identifiers must be unique.',
      path: ['options'],
    })
  }

  if (!optionTypes.has(payload.selected)) {
    context.addIssue({
      code: 'custom',
      message: 'Selected spawn must exist in the available options.',
      path: ['selected'],
    })
  }
})

export type ValidatedSelectSpawnPayload = z.infer<typeof selectSpawnPayloadSchema>

export function parseSelectSpawnPayload(value: unknown): ValidatedSelectSpawnPayload | null {
  const parsed = selectSpawnPayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
