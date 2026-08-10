import { z } from "zod";

export const updateSettingsSchema = z
  .object({
    timezone: z.string().min(1).max(64),
    defaultCurrency: z.string().length(3),
    defaultPaymentCommission: z.number().min(0).max(1),
    deliveryCutoffTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:mm")
      .nullable(),
    orderNumberPrefix: z.string().min(1).max(10),
  })
  .partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const setFeatureFlagSchema = z.object({
  key: z.string().min(2).max(80),
  enabled: z.boolean(),
});
export type SetFeatureFlagInput = z.infer<typeof setFeatureFlagSchema>;
