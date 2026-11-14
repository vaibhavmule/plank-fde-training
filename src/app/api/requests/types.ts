import { z } from "zod";

import { requestInputSchema, workRequestSchema } from "@/lib/request-model";

export const createRequestSchema = requestInputSchema;

const requestResponseSchema = workRequestSchema.required().strict();

export const listRequestsResponseSchema = z.strictObject({
  requests: z.array(requestResponseSchema),
});

export const createRequestResponseSchema = z.strictObject({
  request: requestResponseSchema,
});

export const invalidRequestResponseSchema = z.strictObject({
  error: z.literal("invalid_request"),
  issues: z.array(
    z.strictObject({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ListRequestsResponse = z.infer<typeof listRequestsResponseSchema>;
export type CreateRequestResponse = z.infer<typeof createRequestResponseSchema>;
export type InvalidRequestResponse = z.infer<
  typeof invalidRequestResponseSchema
>;
