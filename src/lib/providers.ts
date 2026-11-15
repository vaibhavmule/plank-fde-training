import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageParam,
  Tool as AnthropicTool,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { anthropic as anthropicProvider } from "@ai-sdk/anthropic";
import { openai as openaiProvider } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import OpenAI from "openai";
import type {
  Response as OpenAIResponse,
  ResponseFunctionToolCall,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import { z } from "zod";

import { runTool, type Tool } from "@/lib/tools";

export type Model = {
  id: string;
  /** Published list price in USD per million tokens, standard tier. */
  pricePerMillionTokens: { input: number; output: number };
};

export type TokenUsage = { input: number; output: number };

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** How much thinking a reasoning model should do. */
export type Effort = "low" | "medium" | "high";

/** One tool the model asked for, with what came back. */
export type ToolCall = {
  name: string;
  input: unknown;
  result: string;
  failed: boolean;
};

export type StreamEvents = {
  text: (delta: string) => void;
  tool: (call: ToolCall) => void;
};

export type Completion = {
  /** The conversation so far, oldest first. */
  messages: readonly ChatMessage[];
  system?: string;
  /** Defaults to the first model in the provider's list. */
  model?: string;
  maxTokens?: number;
  /** OpenAI only: the current Claude models reject temperature. */
  temperature?: number;
  effort?: Effort;
  tools?: readonly Tool[];
};

export type Provider = {
  name: string;
  /** The first model is the default. */
  models: readonly Model[];
  /** Streams text through `events.text` and resolves with the tokens it cost. */
  stream(completion: Completion, events: StreamEvents): Promise<TokenUsage>;
};

export type ProviderOptions = {
  // Passed in explicitly: this module also runs outside Next, where
  // src/lib/config.ts (server-only) cannot load.
  apiKey: string;
  // Injected by tests so no request leaves the process.
  fetch?: typeof globalThis.fetch;
  // Overrides the OpenAI-compatible endpoint, for example OpenRouter.
  baseURL?: string;
};

const DEFAULT_MAX_TOKENS = 1024;
const MAX_ROUNDS = 8;

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

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// OpenRouter serves the same OpenAI models under an openai/ prefix, at the
// same list prices.
export const OPENROUTER_MODELS: readonly Model[] = OPENAI_MODELS.map(
  (model) => ({
    ...model,
    id: `openai/${model.id}`,
  }),
);

const PRICED_MODELS: readonly Model[] = [
  ...ANTHROPIC_MODELS,
  ...OPENAI_MODELS,
  ...OPENROUTER_MODELS,
];

/** A model's published list price, or undefined when it has none. */
export function priceOf(
  modelId: string,
): Model["pricePerMillionTokens"] | undefined {
  return PRICED_MODELS.find((model) => model.id === modelId)
    ?.pricePerMillionTokens;
}

/**
 * One model id through a provider's AI SDK adapter, for callers that use the
 * SDK directly such as the agent loop. OpenRouter has no adapter here.
 */
export function sdkModel(
  provider: string,
  modelId: string,
): LanguageModel | undefined {
  if (provider === "anthropic") {
    return anthropicProvider.languageModel(modelId);
  }
  if (provider === "openai") return openaiProvider.languageModel(modelId);
  return undefined;
}

/** The JSON Schema both APIs accept, without Zod's draft marker. */
function toolSchema(tool: Tool) {
  const schema = z.toJSONSchema(tool.input) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

// OpenAI's strict mode accepts a subset of JSON Schema. Zod emits string
// lengths, formats and defaults, so this keeps only the supported keywords and
// makes every property required.
const STRICT_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "description",
  "anyOf",
  "oneOf",
  "allOf",
  "$defs",
  "$ref",
  "title",
]);

function strictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictSchema);
  if (value === null || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(source)) {
    if (key === "properties" || key === "$defs") {
      // The keys here are property names, not schema keywords.
      const entries = (entry ?? {}) as Record<string, unknown>;
      result[key] = Object.fromEntries(
        Object.entries(entries).map(([name, schema]) => [
          name,
          strictSchema(schema),
        ]),
      );
    } else if (STRICT_SCHEMA_KEYS.has(key)) {
      result[key] = strictSchema(entry);
    }
  }

  if (result.type === "object") {
    result.required = Object.keys(
      (result.properties ?? {}) as Record<string, unknown>,
    );
    result.additionalProperties = false;
  }

  return result;
}

function anthropicTools(
  tools: readonly Tool[] | undefined,
): AnthropicTool[] | undefined {
  if (!tools?.length) return undefined;

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: toolSchema(tool) as AnthropicTool["input_schema"],
  }));
}

function openaiTools(tools: readonly Tool[] | undefined) {
  if (!tools?.length) return undefined;

  return tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: strictSchema(toolSchema(tool)) as Record<string, unknown>,
    strict: true,
  }));
}

function parseJson(
  source: string,
  fallback: unknown,
): { input: unknown; error?: string } {
  if (!source.trim()) return { input: fallback ?? {} };

  try {
    return { input: JSON.parse(source) as unknown };
  } catch {
    return {
      input: {},
      error: "The model sent incomplete JSON for the tool input.",
    };
  }
}

/** Anthropic, streamed through the Messages API. */
export function anthropic(options: ProviderOptions): Provider {
  const client = new Anthropic({
    apiKey: options.apiKey,
    // Rate limits and server errors are retried for us, with backoff.
    maxRetries: 3,
    fetch: options.fetch,
  });

  return {
    name: "anthropic",
    models: ANTHROPIC_MODELS,
    async stream(completion, events) {
      const model = completion.model ?? ANTHROPIC_MODELS[0].id;
      const requests: MessageParam[] = completion.messages.map(
        ({ role, content }) => ({ role, content }),
      );
      const tools = anthropicTools(completion.tools);

      let input = 0;
      let output = 0;

      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const stream = await client.messages.create({
          model,
          max_tokens: completion.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: completion.system,
          messages: requests,
          tools,
          // Temperature is never sent: Claude models reject it. The knob that
          // shapes a reply here is output_config.effort.
          output_config: completion.effort
            ? { effort: completion.effort }
            : undefined,
          stream: true,
        });

        const blocks = new Map<
          number,
          | { type: "text"; text: string }
          | {
              type: "tool_use";
              id: string;
              name: string;
              json: string;
              fallback: unknown;
            }
        >();
        let stopReason: string | null = null;
        let roundOutput = 0;

        for await (const event of stream) {
          if (event.type === "message_start") {
            input += event.message.usage.input_tokens;
            continue;
          }

          if (event.type === "content_block_start") {
            if (event.content_block.type === "text") {
              blocks.set(event.index, {
                type: "text",
                text: event.content_block.text,
              });
            } else if (event.content_block.type === "tool_use") {
              blocks.set(event.index, {
                type: "tool_use",
                id: event.content_block.id,
                name: event.content_block.name,
                json: "",
                fallback: event.content_block.input,
              });
            }
            continue;
          }

          if (event.type === "content_block_delta") {
            const block = blocks.get(event.index);

            if (event.delta.type === "text_delta") {
              if (block?.type === "text") block.text += event.delta.text;
              events.text(event.delta.text);
            } else if (
              event.delta.type === "input_json_delta" &&
              block?.type === "tool_use"
            ) {
              block.json += event.delta.partial_json;
            }
            continue;
          }

          if (event.type === "message_delta") {
            stopReason = event.delta.stop_reason;
            roundOutput = event.usage.output_tokens;
          }
        }

        output += roundOutput;

        // A reply cut off at max_tokens must never run a partial tool call.
        if (stopReason !== "tool_use" || round === MAX_ROUNDS - 1) {
          return { input, output };
        }

        const content: ContentBlockParam[] = [];
        const calls: {
          id: string;
          name: string;
          input: unknown;
          error?: string;
        }[] = [];

        for (const [, block] of [...blocks.entries()].sort(
          ([a], [b]) => a - b,
        )) {
          if (block.type === "text") {
            if (block.text) content.push({ type: "text", text: block.text });
            continue;
          }

          const parsed = parseJson(block.json, block.fallback);
          content.push({
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: parsed.input,
          });
          calls.push({
            id: block.id,
            name: block.name,
            input: parsed.input,
            error: parsed.error,
          });
        }

        if (calls.length === 0) return { input, output };

        requests.push({ role: "assistant", content });

        const results: ToolResultBlockParam[] = await Promise.all(
          calls.map(async (call) => {
            const outcome = call.error
              ? { result: call.error, failed: true }
              : await runTool(completion.tools ?? [], call);

            events.tool({
              name: call.name,
              input: call.input,
              result: outcome.result,
              failed: outcome.failed,
            });

            return {
              type: "tool_result",
              tool_use_id: call.id,
              content: outcome.result,
              is_error: outcome.failed,
            };
          }),
        );

        // Every result goes back in one user message, in call order.
        requests.push({ role: "user", content: results });
      }

      return { input, output };
    },
  };
}

/** OpenAI and compatible APIs, streamed through the Responses API. */
function openAiCompatible(
  name: string,
  models: readonly Model[],
  options: ProviderOptions,
): Provider {
  const client = new OpenAI({
    apiKey: options.apiKey,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    maxRetries: 3,
    fetch: options.fetch,
  });

  return {
    name,
    models,
    async stream(completion, events) {
      const model = completion.model ?? models[0].id;
      const request: ResponseInputItem[] = completion.messages.map(
        ({ role, content }) => ({ role, content }),
      );
      const tools = openaiTools(completion.tools);

      let input = 0;
      let output = 0;

      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const stream = await client.responses.create({
          model,
          instructions: completion.system,
          input: request,
          max_output_tokens: completion.maxTokens ?? DEFAULT_MAX_TOKENS,
          tools,
          temperature: completion.temperature,
          reasoning: completion.effort
            ? { effort: completion.effort }
            : undefined,
          stream: true,
        });

        let response: OpenAIResponse | undefined;

        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            events.text(event.delta);
          } else if (
            event.type === "response.completed" ||
            event.type === "response.incomplete"
          ) {
            response = event.response;
          } else if (event.type === "response.failed") {
            throw new Error(
              event.response.error?.message ??
                `${name} could not complete the response.`,
            );
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }

        if (!response) {
          throw new Error(`${name} ended the stream without a response.`);
        }

        input += response.usage?.input_tokens ?? 0;
        output += response.usage?.output_tokens ?? 0;

        if (response.status === "failed") {
          throw new Error(
            response.error?.message ??
              `${name} could not complete the response.`,
          );
        }

        // An incomplete response can hold half a function call, so it runs
        // nothing.
        const calls: ResponseFunctionToolCall[] =
          response.status === "completed"
            ? response.output.filter(
                (item): item is ResponseFunctionToolCall =>
                  item.type === "function_call",
              )
            : [];

        if (calls.length === 0 || round === MAX_ROUNDS - 1) {
          return { input, output };
        }

        // Keep the reasoning and function_call items for the next request.
        request.push(...(response.output as ResponseInputItem[]));

        const outputs = await Promise.all(
          calls.map(async (call): Promise<ResponseInputItem> => {
            const parsed = parseJson(call.arguments, {});
            const outcome = parsed.error
              ? { result: parsed.error, failed: true }
              : await runTool(completion.tools ?? [], {
                  name: call.name,
                  input: parsed.input,
                });

            events.tool({
              name: call.name,
              input: parsed.input,
              result: outcome.result,
              failed: outcome.failed,
            });

            return {
              type: "function_call_output",
              call_id: call.call_id,
              output: outcome.result,
            };
          }),
        );

        request.push(...outputs);
      }

      return { input, output };
    },
  };
}

/** OpenAI, streamed through the Responses API. */
export function openai(options: ProviderOptions): Provider {
  return openAiCompatible("openai", OPENAI_MODELS, options);
}

/** OpenRouter's OpenAI-compatible Responses API. */
export function openrouter(options: ProviderOptions): Provider {
  return openAiCompatible("openrouter", OPENROUTER_MODELS, {
    ...options,
    baseURL: OPENROUTER_BASE_URL,
  });
}
