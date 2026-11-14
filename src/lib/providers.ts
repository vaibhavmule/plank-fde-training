import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import { config } from "@/lib/config";

export type Model = {
  id: string;
  /** Published list price in USD per million tokens, standard tier. */
  pricePerMillionTokens: { input: number; output: number };
};

export type TokenUsage = { input: number; output: number };

export type Completion = {
  prompt: string;
  system?: string;
  /** Defaults to the first model in the provider's list. */
  model?: string;
  maxTokens?: number;
};

export type Provider = {
  name: string;
  /** The first model is the default. */
  models: readonly Model[];
  /** Streams text through `onText` and resolves with the tokens it cost. */
  stream(
    completion: Completion,
    onText: (text: string) => void,
  ): Promise<TokenUsage>;
};

export type ProviderOptions = {
  apiKey?: string;
  // Injected by tests so no request leaves the process.
  fetch?: typeof globalThis.fetch;
};

const DEFAULT_MAX_TOKENS = 1024;

// List prices from the Claude rate card effective 2026-10-07, standard tier.
// Haiku's price is the one for contexts up to 100K tokens.
export const ANTHROPIC_MODELS: readonly Model[] = [
  {
    id: "claude-sonnet-5-5",
    pricePerMillionTokens: { input: 2, output: 10 },
  },
  { id: "claude-opus-5-5", pricePerMillionTokens: { input: 4, output: 20 } },
  {
    id: "claude-haiku-5-5",
    pricePerMillionTokens: { input: 0.1, output: 0.5 },
  },
];

// List prices from OpenAI's pricing page, standard tier.
export const OPENAI_MODELS: readonly Model[] = [
  { id: "gpt-6.1-sol", pricePerMillionTokens: { input: 2, output: 10 } },
  { id: "gpt-6-astra", pricePerMillionTokens: { input: 10, output: 50 } },
  { id: "gpt-6.1-terra", pricePerMillionTokens: { input: 1, output: 5 } },
  { id: "gpt-6-luna", pricePerMillionTokens: { input: 0.1, output: 0.5 } },
];

/** Anthropic, streamed through the Messages API. */
export function anthropic(options: ProviderOptions = {}): Provider {
  const client = new Anthropic({
    apiKey: options.apiKey ?? config.anthropicApiKey,
    // Rate limits and server errors are retried for us, with backoff.
    maxRetries: 3,
    fetch: options.fetch,
  });

  return {
    name: "anthropic",
    models: ANTHROPIC_MODELS,
    async stream(completion, onText) {
      const events = await client.messages.create({
        model: completion.model ?? ANTHROPIC_MODELS[0].id,
        max_tokens: completion.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: completion.system,
        messages: [{ role: "user", content: completion.prompt }],
        stream: true,
      });

      let input = 0;
      let output = 0;

      for await (const event of events) {
        if (event.type === "message_start") {
          input = event.message.usage.input_tokens;
        } else if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          onText(event.delta.text);
        } else if (event.type === "message_delta") {
          // The last usage the stream reports.
          output = event.usage.output_tokens;
        }
      }

      return { input, output };
    },
  };
}

/** OpenAI, streamed through Chat Completions. */
export function openai(options: ProviderOptions = {}): Provider {
  const client = new OpenAI({
    apiKey: options.apiKey ?? config.openaiApiKey,
    maxRetries: 3,
    fetch: options.fetch,
  });

  return {
    name: "openai",
    models: OPENAI_MODELS,
    async stream(completion, onText) {
      const stream = await client.chat.completions.create({
        model: completion.model ?? OPENAI_MODELS[0].id,
        max_completion_tokens: completion.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: [
          ...(completion.system
            ? [{ role: "system" as const, content: completion.system }]
            : []),
          { role: "user" as const, content: completion.prompt },
        ],
        stream: true,
        // Without this the final chunk carries no usage at all.
        stream_options: { include_usage: true },
      });

      let input = 0;
      let output = 0;

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) onText(text);
        if (chunk.usage) {
          input = chunk.usage.prompt_tokens;
          output = chunk.usage.completion_tokens;
        }
      }

      return { input, output };
    },
  };
}
