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
import { z } from "zod";

import { config } from "@/lib/config";
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
 */
export function chatModel(modelId?: string): LanguageModel {
  const id = modelId || config.chatModel;

  if (chatProvider() === "openai") {
    return openaiProvider.languageModel(id || OPENAI_MODELS[0].id);
  }

  return anthropicProvider.languageModel(id || ANTHROPIC_MODELS[0].id);
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

/**
 * Validates a chat request and streams the reply as a UI message stream. The
 * model is a parameter so a test can run the route without a network call.
 */
export async function handleChat(
  request: Request,
  model: LanguageModel = chatModel(),
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

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages.data),
    tools: chatTools,
    stopWhen: isStepCount(MAX_STEPS),
  });

  return result.toUIMessageStreamResponse();
}
