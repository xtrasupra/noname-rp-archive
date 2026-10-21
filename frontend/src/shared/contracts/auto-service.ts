import { z } from 'zod'

const autoServiceVehicleSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  model: z.string().min(1).max(64),
  name: z.string().min(1).max(96),
  plate: z.string().max(8),
  fuel: z.number().finite().min(0).max(10_000),
  mileage: z.number().finite().min(0).max(1_000_000_000),
  location: z.enum(['stored', 'outside', 'unavailable']),
  spawnable: z.boolean(),
  disabledReason: z.string().max(160).nullable(),
})

export const autoServicePayloadSchema = z.object({
  contractVersion: z.literal(1),
  sessionId: z.string().regex(/^[0-9a-f]{32}$/),
  serviceFee: z.number().int().positive().max(1_000_000),
  cash: z.number().finite().min(0).max(1_000_000_000_000),
  vehicles: z.array(autoServiceVehicleSchema).max(100),
}).superRefine((payload, context) => {
  const ids = new Set(payload.vehicles.map((vehicle) => vehicle.id))
  if (ids.size !== payload.vehicles.length) {
    context.addIssue({
      code: 'custom',
      message: 'Vehicle identifiers must be unique.',
      path: ['vehicles'],
    })
  }
})

export type AutoServicePayload = z.infer<typeof autoServicePayloadSchema>
export type AutoServiceVehicle = AutoServicePayload['vehicles'][number]

export function parseAutoServicePayload(value: unknown): AutoServicePayload | null {
  const parsed = autoServicePayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
