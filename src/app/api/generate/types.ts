import { z } from "zod";

export const specSchema = z.object({
  root: z.string(),
  elements: z.record(z.string(), z.unknown()),
  state: z.record(z.string(), z.unknown()).optional(),
});

export const generateRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  currentSpec: specSchema.nullish(),
});

export const invalidGenerateResponseSchema = z.strictObject({
  error: z.literal("invalid_request"),
  issues: z.array(
    z.strictObject({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type GenerateSpec = z.infer<typeof specSchema>;
export type InvalidGenerateResponse = z.infer<
  typeof invalidGenerateResponseSchema
>;
