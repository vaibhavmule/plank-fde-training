import { z } from "zod";

import { policyMetaSchema } from "@/lib/policies";

export const policySummarySchema = policyMetaSchema.extend({
  slug: z.string(),
});

export const listPoliciesResponseSchema = z.strictObject({
  policies: z.array(policySummarySchema),
});

export type PolicySummary = z.infer<typeof policySummarySchema>;
export type ListPoliciesResponse = z.infer<typeof listPoliciesResponseSchema>;
