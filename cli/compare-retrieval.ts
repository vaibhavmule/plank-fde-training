import { stdout } from "node:process";
import { parseArgs } from "node:util";

import { generateText } from "ai";

import { closeDatabase } from "@/lib/db";
import { investigate } from "@/lib/investigate";
import { ensureIndexed, find, type FindMode } from "@/lib/knowledge";
import {
  ANTHROPIC_MODELS,
  priceOf,
  sdkModel,
  type Model,
} from "@/lib/providers";

/** The 10 questions the comparison answers both ways. */
export const QUESTIONS = [
  "Can a support agent approve a $250 refund alone, and what has to happen first?",
  "How long does a refund take to reach a customer's card after it is approved?",
  "What is the nightly hotel limit for business travel, and who approves more?",
  "How much holiday does everyone receive, and how many days carry over?",
  "What does a new starter claim in their first month, and without a cost centre?",
  "Which data is kept for 90 days, and what is kept for a year instead?",
  "When does a request waiting for approval get returned to the requester?",
  "How much does a team lead approve, and where does finance take over?",
  "What happens when an issue affects more than one customer?",
  "Can I work from another country for six weeks, and what decides it?",
] as const;

const CHUNKS = 5;
const MAX_TOKENS = 700;

const BASELINE_SYSTEM = `You answer WorkBot customer and staff questions from the retrieved passages you are given.

Use only those passages. Quote any limit, deadline or entitlement exactly, and name the document each fact came from. If the passages do not answer the question, say what is missing and name the team to ask. Reply in at most 120 words.`;

export type Answer = {
  question: string;
  /** The top-5 answer, and what it cost. */
  baseline: { text: string; input: number; output: number };
  /** The agent's answer, and what it cost. */
  agent: { text: string; input: number; output: number; steps: number };
  mode: FindMode;
};

/** The 5 nearest chunks pasted into one call: the retrieval most RAG uses. */
async function baseline(
  question: string,
  modelId: string,
): Promise<Answer["baseline"]> {
  const model = sdkModel("anthropic", modelId);
  if (!model) throw new Error(`No adapter for ${modelId}.`);

  const { results, mode } = await find(question, { limit: CHUNKS });
  const passages = results
    .map(
      (result, index) =>
        `[${index + 1}] ${result.path}#${result.heading || "(document)"}\n${result.text}`,
    )
    .join("\n\n");

  const result = await generateText({
    model,
    system: BASELINE_SYSTEM,
    prompt: `Question: ${question}\n\nRetrieved passages (${mode} search):\n\n${passages || "(no passage matched)"}`,
    maxOutputTokens: MAX_TOKENS,
  });

  return {
    text: result.text.trim(),
    input: result.usage.inputTokens ?? 0,
    output: result.usage.outputTokens ?? 0,
  };
}

function dollars(modelId: string, usage: { input: number; output: number }) {
  const prices = priceOf(modelId);
  if (!prices) return "unpriced";

  const cost =
    (usage.input / 1_000_000) * prices.input +
    (usage.output / 1_000_000) * prices.output;
  return `$${cost.toFixed(6)}`;
}

function rule(title: string) {
  return `\n${title}\n${"-".repeat(title.length)}`;
}

async function main() {
  const { values } = parseArgs({
    options: { model: { type: "string", short: "m" } },
  });

  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey)
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local.");

  // Both runs use the same model, so the comparison measures retrieval.
  const modelId =
    values.model ?? ANTHROPIC_MODELS[ANTHROPIC_MODELS.length - 1].id;
  const known: readonly Model[] = ANTHROPIC_MODELS;
  if (!known.some((model) => model.id === modelId)) {
    throw new Error(
      `Unknown model "${modelId}". Try ${known.map((model) => model.id).join(", ")}.`,
    );
  }

  const embedder = process.env.VOYAGE_API_KEY
    ? (await import("@/lib/embeddings")).voyageEmbedder({
        apiKey: process.env.VOYAGE_API_KEY,
      })
    : undefined;
  await ensureIndexed(embedder);

  const agentModel = sdkModel("anthropic", modelId);
  const specialistModel = sdkModel(
    "anthropic",
    ANTHROPIC_MODELS[ANTHROPIC_MODELS.length - 1].id,
  );
  if (!agentModel || !specialistModel) {
    throw new Error(`No adapter for ${modelId}.`);
  }

  console.log(
    `Comparing retrieval on ${QUESTIONS.length} questions with ${modelId}.`,
  );

  let baselineInput = 0;
  let baselineOutput = 0;
  let agentInput = 0;
  let agentOutput = 0;

  for (const [index, question] of QUESTIONS.entries()) {
    console.log(rule(`${index + 1}/${QUESTIONS.length} ${question}`));

    const fromChunks = await baseline(question, modelId);
    baselineInput += fromChunks.input;
    baselineOutput += fromChunks.output;

    const investigation = await investigate(question, {
      analyst: agentModel,
      specialist: specialistModel,
    });

    agentInput += investigation.usage.input;
    agentOutput += investigation.usage.output;

    stdout.write(
      `\nTop-${CHUNKS} retrieval\n${fromChunks.text}\n\n(${fromChunks.input} in, ${fromChunks.output} out, ${dollars(modelId, fromChunks)})\n`,
    );
    stdout.write(
      `\nAgent with ask_knowledge_base and ask_web\n${investigation.report}\n\n(${investigation.usage.input} in, ${investigation.usage.output} out, $${investigation.total.toFixed(6)}, ${investigation.steps} steps, stopped: ${investigation.stopped})\n`,
    );
  }

  const baselineUsage = { input: baselineInput, output: baselineOutput };
  const agentUsage = { input: agentInput, output: agentOutput };

  console.log(rule("Totals"));
  console.log(
    `Top-${CHUNKS}: ${baselineUsage.input} in, ${baselineUsage.output} out, ${dollars(modelId, baselineUsage)}`,
  );
  console.log(
    `Agent: ${agentUsage.input} in, ${agentUsage.output} out, ${dollars(modelId, agentUsage)}`,
  );

  const ratio =
    baselineUsage.input + baselineUsage.output === 0
      ? "n/a"
      : (
          (agentUsage.input + agentUsage.output) /
          (baselineUsage.input + baselineUsage.output)
        ).toFixed(1);
  console.log(`The agent spent ${ratio} times the tokens.`);
  await closeDatabase();
}

void main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  await closeDatabase().catch(() => {});
  process.exitCode = 1;
});
