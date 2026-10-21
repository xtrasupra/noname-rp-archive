import { z } from 'zod'

export const questTargetKindSchema = z.enum([
  'location',
  'npc',
  'business',
  'job',
  'vehicle',
])

export const questVector3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
})

export const questTargetSchema = z.object({
  kind: questTargetKindSchema,
  label: z.string().min(1).max(96),
  position: questVector3Schema,
  dimension: z.number().int().min(0),
})

export const questProgressSchema = z.object({
  current: z.number().finite().min(0),
  target: z.number().finite().positive(),
})

export const activeQuestSchema = z.object({
  questId: z.string().min(1).max(64),
  questVersion: z.number().int().positive(),
  title: z.string().min(1).max(96),
  stepId: z.string().min(1).max(64),
  objective: z.string().min(1).max(240),
  progress: questProgressSchema.nullable(),
  target: questTargetSchema.nullable(),
})

export const availableQuestSchema = z.object({
  questId: z.string().min(1).max(64),
  title: z.string().min(1).max(96),
  status: z.string().min(1).max(32),
})

export const questStateV1Schema = z.object({
  version: z.literal(1),
  characterUuid: z.number().int().positive().optional(),
  sessionEpoch: z.number().int().positive().optional(),
  revision: z.number().int().min(0),
  active: activeQuestSchema.nullable(),
  available: z.array(availableQuestSchema).max(50),
})

export type QuestStateV1 = z.infer<typeof questStateV1Schema>
export type ActiveQuestV1 = z.infer<typeof activeQuestSchema>

export const emptyQuestState: QuestStateV1 = {
  version: 1,
  revision: 0,
  active: null,
  available: [],
}

export function parseQuestState(value: unknown): QuestStateV1 {
  const parsed = questStateV1Schema.safeParse(value)
  return parsed.success ? parsed.data : emptyQuestState
}
