import "server-only";

import { anthropic as anthropicProvider } from "@ai-sdk/anthropic";
import { openai as openaiProvider } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  tool,
  type LanguageModel,
  type ToolSet,
  type UIMessage,
} from "ai";
import { after as runAfter } from "next/server";
import { z } from "zod";

import { config } from "@/lib/config";
import { compact } from "@/lib/context";
import {
  extractMemories,
  listMemories,
  memoryNote,
  remember,
  type Exchange,
} from "@/lib/memory";
import { ANTHROPIC_MODELS, OPENAI_MODELS } from "@/lib/providers";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { createTools } from "@/lib/tools";

/** The rounds the terminal has allowed since Day 7. */
export const MAX_STEPS = 8;

/** The provider the web chat is configured to use. */
export function chatProvider(): "anthropic" | "openai" {
  if (config.chatProvider === "anthropic" || config.chatProvider === "openai") {
    return config.chatProvider;
  }

  throw new Error(
    `Unknown CHAT_PROVIDER "${config.chatProvider}". Use "anthropic" or "openai".`,
  );
}

/**
 * The configured provider's default model, or the id in CHAT_MODEL, through
 * that provider's AI SDK adapter. The list prices and ids come from the Day 6
 * provider list, so the terminal and the web agree on the default.
 *
 * `"small"` picks the provider's small model, the last and cheapest in its
 * list, for work such as memory extraction and summarization.
 */
export function chatModel(modelId?: string): LanguageModel {
  const provider = chatProvider();
  const models = provider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS;
  const id =
    modelId === "small"
      ? models[models.length - 1].id
      : modelId || config.chatModel || models[0].id;

  if (provider === "openai") {
    return openaiProvider.languageModel(id);
  }

  return anthropicProvider.languageModel(id);
}

/** The Day 7 registry in the SDK's tool shape, so both clients share one set. */
export const chatTools: ToolSet = Object.fromEntries(
  createTools({ braveSearchKey: config.braveSearchKey }).map((entry) => [
    entry.name,
    tool({
      description: entry.description,
      inputSchema: entry.input,
      execute: (input) => entry.run(input),
    }),
  ]),
);

const requestSchema = z.object({
  id: z.string().trim().min(1),
  messages: z.array(z.unknown()).min(1),
});

type ChatIssue = { path: (string | number)[]; message: string };

type InvalidChatRequest = {
  error: "invalid_request";
  issues: ChatIssue[];
};

function invalidRequest(issues: ChatIssue[]) {
  const body: InvalidChatRequest = { error: "invalid_request", issues };
  return Response.json(body, {
    status: 400,
    headers: { "Cache-Control": "no-store" },
  });
}

function pathSegments(path: PropertyKey[]) {
  return path.map((segment) =>
    typeof segment === "number" ? segment : String(segment),
  );
}

export type ChatOptions = {
  /** The browser's anonymous id. Without one there is no memory. */
  visitor?: string;
  /** The model that extracts facts and summarizes old history. */
  smallModel?: LanguageModel;
  /** Schedules work after the reply; tests pass one that runs in process. */
  after?: (task: () => Promise<void>) => void;
  /** The token budget for the conversation history. */
  contextBudget?: number;
};

function textOf(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

/** The last question and the reply it got, which is what extraction reads. */
function lastExchange(messages: readonly UIMessage[]): Exchange | undefined {
  const user = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const assistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  if (!user || !assistant) return undefined;

  const question = textOf(user);
  const reply = textOf(assistant);
  return question && reply ? { user: question, assistant: reply } : undefined;
}

/**
 * Validates a chat request and streams the reply as a UI message stream. The
 * model is a parameter so a test can run the route without a network call.
 */
export async function handleChat(
  request: Request,
  model: LanguageModel = chatModel(),
  options: ChatOptions = {},
): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return invalidRequest([
      { path: [], message: "Request body must be valid JSON." },
    ]);
  }

  const envelope = requestSchema.safeParse(input);
  if (!envelope.success) {
    return invalidRequest(
      envelope.error.issues.map(({ path, message }) => ({
        path: pathSegments(path),
        message,
      })),
    );
  }

  const messages = await safeValidateUIMessages<UIMessage>({
    messages: envelope.data.messages,
    tools: chatTools,
  });
  if (!messages.success) {
    return invalidRequest([
      { path: ["messages"], message: messages.error.message },
    ]);
  }

  const visitor = options.visitor;
  const smallModel = options.smallModel ?? chatModel("small");
  const memories = visitor ? await listMemories(visitor) : [];
  const { messages: fitted, summary } = await compact(
    smallModel,
    messages.data,
    options.contextBudget,
  );

  const result = streamText({
    model,
    system: [
      SYSTEM_PROMPT,
      memoryNote(memories),
      summary ? `Earlier in this conversation:\n${summary}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    messages: await convertToModelMessages(fitted),
    tools: chatTools,
    stopWhen: isStepCount(MAX_STEPS),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages.data,
    onEnd: ({ messages: finished, isAborted }) => {
      if (!visitor || isAborted) return;

      const exchange = lastExchange(finished);
      if (!exchange) return;

      // Learn once the reply has gone out, so extraction adds nothing to the
      // reply's latency. The next conversation sees the new facts.
      (options.after ?? runAfter)(async () => {
        try {
          const known = await listMemories(visitor);
          await remember(
            visitor,
            await extractMemories(smallModel, exchange, known),
          );
        } catch {
          // Memory must never break a reply.
        }
      });
    },
  });
}
