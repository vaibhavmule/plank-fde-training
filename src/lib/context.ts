import "server-only";

import { generateText, type LanguageModel, type UIMessage } from "ai";

/**
 * The history budget in tokens. It sits under the reply model's context
 * window, so the summary controls cost before the window is ever a limit.
 */
export const CONTEXT_BUDGET = 24_000;

/** The summarizer reads no more than this many tokens of transcript. */
export const SUMMARY_INPUT_BUDGET = 24_000;

/** English runs at roughly four characters per token, without a tokenizer. */
const CHARS_PER_TOKEN = 4;

/** A single tool result keeps this much text in the summary transcript. */
const TOOL_RESULT_PREVIEW = 500;

type MessagePart = UIMessage["parts"][number];

function isToolPart(part: MessagePart) {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function lengthOf(value: unknown): number {
  if (value === undefined || value === null) return 0;
  return typeof value === "string"
    ? value.length
    : (JSON.stringify(value)?.length ?? 0);
}

/**
 * Roughly how many tokens a message costs, counting every part: text,
 * reasoning, and each tool call's input and result.
 */
export function sizeOf(message: UIMessage): number {
  let characters = 0;

  for (const part of message.parts) {
    if (part.type === "text" || part.type === "reasoning") {
      characters += part.text.length;
    } else if (isToolPart(part)) {
      const tool = part as { input?: unknown; output?: unknown };
      characters += lengthOf(tool.input) + lengthOf(tool.output);
    }
  }

  return Math.ceil(characters / CHARS_PER_TOKEN);
}

export type FittedContext = { kept: UIMessage[]; dropped: UIMessage[] };

/**
 * Keeps the first message, which holds the intent, and the newest messages
 * that fit, and hands back the middle. It walks back from the newest message,
 * so the cut falls between turns and never opens on a reply whose question was
 * dropped.
 */
export function fitContext(
  messages: readonly UIMessage[],
  budget = CONTEXT_BUDGET,
): FittedContext {
  if (messages.length === 0) return { kept: [], dropped: [] };

  const total = messages.reduce((sum, message) => sum + sizeOf(message), 0);
  if (total <= budget) return { kept: [...messages], dropped: [] };

  const first = messages[0];
  let used = sizeOf(first);
  let start = messages.length;

  for (let index = messages.length - 1; index >= 1; index -= 1) {
    const size = sizeOf(messages[index]);
    if (used + size > budget) break;
    used += size;
    start = index;
  }

  // Open on a question, never on a reply or a tool part left behind.
  while (start < messages.length && messages[start].role !== "user") {
    start += 1;
  }

  return {
    kept: [first, ...messages.slice(start)],
    dropped: messages.slice(1, start),
  };
}

function toolName(part: MessagePart): string {
  return part.type === "dynamic-tool"
    ? part.toolName
    : part.type.slice("tool-".length);
}

function preview(value: unknown, limit = Number.POSITIVE_INFINITY): string {
  const text =
    typeof value === "string"
      ? value
      : value === undefined
        ? ""
        : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function transcriptLine(message: UIMessage): string {
  const speaker = message.role === "user" ? "The person" : "WorkBot";
  const parts: string[] = [];

  for (const part of message.parts) {
    if (part.type === "text" && part.text.trim()) {
      parts.push(part.text.trim());
    } else if (isToolPart(part)) {
      const tool = part as { input?: unknown; output?: unknown };
      // The result is cut, so a fact a tool returned survives the summary.
      parts.push(
        `[${toolName(part)}(${preview(tool.input)}) → ${preview(tool.output, TOOL_RESULT_PREVIEW)}]`,
      );
    }
  }

  return parts.length > 0 ? `${speaker}: ${parts.join(" ")}` : "";
}

/** The dropped turn as text, with the newest part kept when it is over budget. */
export function transcript(messages: readonly UIMessage[]): string {
  const lines = messages.map(transcriptLine).filter(Boolean);
  const full = lines.join("\n\n");
  const maxCharacters = SUMMARY_INPUT_BUDGET * CHARS_PER_TOKEN;

  if (full.length <= maxCharacters) return full;

  const omitted =
    "The earlier messages were omitted to fit the summary model's context.";
  const kept: string[] = [];
  let used = 0;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (used + line.length > maxCharacters) break;
    kept.unshift(line);
    used += line.length + 2;
  }

  if (kept.length === 0) {
    const newest = lines[lines.length - 1] ?? "";
    return `${omitted}\n\n${newest.slice(-maxCharacters)}`;
  }

  return `${omitted}\n\n${kept.join("\n\n")}`;
}

/**
 * Asks the small model to compress the dropped turn into under 150 words. The
 * summary is the model's account of the messages, not the messages themselves.
 */
export async function summarize(
  model: LanguageModel,
  dropped: readonly UIMessage[],
): Promise<string> {
  if (dropped.length === 0) return "";

  const result = await generateText({
    model,
    system:
      "You summarize the earlier part of a conversation in under 150 words, in the third person. Keep the person's requests, decisions, facts and the names of people, teams and systems. This summary stands in for the messages, so state what happened and invent nothing. Reply with the summary only.",
    prompt: transcript(dropped),
  });

  return result.text.trim();
}

export type Compaction = { messages: UIMessage[]; summary?: string };

/** Fits the history to the budget and summarizes the part it drops. */
export async function compact(
  model: LanguageModel,
  messages: readonly UIMessage[],
  budget = CONTEXT_BUDGET,
): Promise<Compaction> {
  const { kept, dropped } = fitContext(messages, budget);
  if (dropped.length === 0) return { messages: kept };

  const summary = await summarize(model, dropped);
  return summary ? { messages: kept, summary } : { messages: kept };
}
