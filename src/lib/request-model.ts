import { z } from "zod";

export const teamSchema = z.enum(["operations", "finance", "support"]);
export const prioritySchema = z.enum(["low", "medium", "high"]);
export const statusSchema = z.enum(["open", "in_progress", "closed"]);

export const requestInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  details: z.string().trim().max(5000).default(""),
  team: teamSchema,
  priority: prioritySchema.default("medium"),
});

export type RequestInput = z.infer<typeof requestInputSchema>;

export const workRequestSchema = requestInputSchema.extend({
  id: z.uuid(),
  status: statusSchema,
  createdAt: z.iso.datetime(),
});

export type WorkRequest = z.infer<typeof workRequestSchema>;
