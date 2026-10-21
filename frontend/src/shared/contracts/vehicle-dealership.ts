import { z } from 'zod'

const vehicleDealershipColorSchema = z.object({
  id: z.number().int().min(0).max(255),
  name: z.string().min(1).max(48),
  hex: z.string().regex(/^#[0-9a-f]{6}$/i),
})

const vehicleDealershipVehicleSchema = z.object({
  id: z.string().min(1).max(64),
  model: z.string().min(1).max(64),
  name: z.string().min(1).max(96),
  className: z.string().min(1).max(48),
  price: z.number().finite().int().min(0).max(1_000_000_000),
  image: z.string().url().max(512).optional(),
  colors: z.array(vehicleDealershipColorSchema).min(1).max(64),
})

export const vehicleDealershipPayloadSchema = z.object({
  contractVersion: z.literal(1),
  selectedVehicleId: z.string().min(1).max(64).optional(),
  balances: z.object({
    cash: z.number().finite().min(0).max(1_000_000_000_000),
    bank: z.number().finite().min(0).max(1_000_000_000_000),
  }),
  maxOwnedVehicles: z.number().int().min(1).max(1_000),
  vehicles: z.array(vehicleDealershipVehicleSchema).min(1).max(100),
  interiorIpl: z.string().min(1).max(160).optional(),
  camera: z.object({
    target: z.object({
      x: z.number().finite(),
      y: z.number().finite(),
      z: z.number().finite(),
    }),
    radius: z.number().finite().min(1).max(100),
    height: z.number().finite().min(-20).max(100),
    angle: z.number().finite(),
    fov: z.number().finite().min(10).max(120),
  }).optional(),
}).superRefine((payload, context) => {
  const vehicleIds = new Set(payload.vehicles.map((vehicle) => vehicle.id))
  if (vehicleIds.size !== payload.vehicles.length) {
    context.addIssue({
      code: 'custom',
      message: 'Vehicle identifiers must be unique.',
      path: ['vehicles'],
    })
  }

  if (payload.selectedVehicleId && !vehicleIds.has(payload.selectedVehicleId)) {
    context.addIssue({
      code: 'custom',
      message: 'Selected vehicle must exist in the catalog.',
      path: ['selectedVehicleId'],
    })
  }
})

export type ValidatedVehicleDealershipPayload = z.infer<typeof vehicleDealershipPayloadSchema>

export function parseVehicleDealershipPayload(value: unknown): ValidatedVehicleDealershipPayload | null {
  const parsed = vehicleDealershipPayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
