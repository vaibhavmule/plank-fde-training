import { z } from "zod";

import { workRequestSchema } from "@/lib/request-model";

export const intakeRequestSchema = z.object({
  message: z.string().trim().min(10).max(10_000),
});

const requestResponseSchema = workRequestSchema.required().strict();

export const intakeResponseSchema = z.strictObject({
  request: requestResponseSchema,
});

export const invalidIntakeResponseSchema = z.strictObject({
  error: z.literal("invalid_request"),
  issues: z.array(
    z.strictObject({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

export type IntakeRequest = z.infer<typeof intakeRequestSchema>;
export type IntakeResponse = z.infer<typeof intakeResponseSchema>;
export type InvalidIntakeResponse = z.infer<typeof invalidIntakeResponseSchema>;
