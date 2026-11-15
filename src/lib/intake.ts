import "server-only";

import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

import {
  prioritySchema,
  requestInputSchema,
  teamSchema,
  type WorkRequest,
} from "@/lib/request-model";
import { createRequest } from "@/lib/requests";

/**
 * What a small model reads out of a message. The `describe` strings are the
 * only place the routing rules live, so changing who owns a kind of question
 * is a one-line edit here.
 */
export const triageSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      "A short title that names the issue in the sender's own words, at most 120 characters. Leave out greetings, sign-offs and the sender's name.",
    ),
  body: z
    .string()
    .trim()
    .min(1)
    .describe(
      "The message as the sender wrote it, without the greeting and sign-off. Keep the facts, the names and the dates they gave.",
    ),
  team: teamSchema.describe(
    "The team that owns the work. support: customers, refunds, complaints, accounts and orders. finance: invoices, payments, budgets, pricing and vendor bills. operations: equipment, facilities, office supplies, shipping and access, or anything that does not clearly belong above.",
  ),
  priority: prioritySchema.describe(
    "How urgent the work is. high: a customer is blocked, money or data is at risk, or a deadline is today. medium: normal work with a real impact. low: a question, a request or an improvement that can wait.",
  ),
});

export type Triage = z.infer<typeof triageSchema>;

const TRIAGE_RULES = `You triage messages that arrive for Fieldstone Supply's internal teams. Read the message, keep the sender's own words in the body, and fill every field of the triage. The field descriptions carry the routing rules. Never invent a fact, a name or a deadline that the sender did not give.`;

/** Reads one message into a title, a body, a team and a priority. */
export async function triage(
  message: string,
  model: LanguageModel,
): Promise<Triage> {
  const text = message.trim();
  if (!text) throw new Error("Give the intake a message to triage.");

  const result = await generateText({
    model,
    output: Output.object({ schema: triageSchema }),
    system: TRIAGE_RULES,
    prompt: text,
  });

  return result.output;
}

/**
 * Turns a message into a request for a team to review. The triage decides the
 * title, team and priority; the request schema validates them before the
 * database sees anything.
 */
export async function intake(
  message: string,
  model: LanguageModel,
): Promise<WorkRequest> {
  const read = await triage(message, model);

  return createRequest(
    requestInputSchema.parse({
      title: read.title,
      details: read.body,
      team: read.team,
      priority: read.priority,
    }),
  );
}
