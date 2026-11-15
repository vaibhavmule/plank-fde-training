import { z } from "zod";

export const policySummarySchema = z.strictObject({
  slug: z.string(),
  title: z.string(),
  team: z.string(),
  updatedAt: z.iso.date(),
  summary: z.string(),
});

export const listPoliciesResponseSchema = z.strictObject({
  policies: z.array(policySummarySchema),
});

export type PolicySummary = z.infer<typeof policySummarySchema>;
export type ListPoliciesResponse = z.infer<typeof listPoliciesResponseSchema>;
