import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages/messages";
import type { ChatCompletionChunk } from "openai/resources/chat/completions/completions";
import { describe, expect, test, vi } from "vitest";

import { anthropic, openai, type ChatMessage } from "./providers";

vi.mock("server-only", () => ({}));

type Call = { url: string; headers: Headers; body: Record<string, unknown> };

/** A fetch that answers with a canned event stream and records the request. */
function streamFetch(sse: string) {
  const calls: Call[] = [];

  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      headers,
      body: JSON.parse(String(init?.body ?? "{}")),
    });

    return new Response(sse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }) as typeof globalThis.fetch;

  return { fetch, calls };
}

function anthropicSse(events: MessageStreamEvent[]) {
  return events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
}

function openAiSse(chunks: ChatCompletionChunk[]) {
  return (
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

function delta(chunk: ChatCompletionChunk) {
  return chunk.choices[0]?.delta?.content;
}

// The SDK's own shapes, so the fixtures stay honest when it changes.
type StartUsage = Extract<
  MessageStreamEvent,
  { type: "message_start" }
>["message"]["usage"];
type DeltaEvent = Extract<MessageStreamEvent, { type: "message_delta" }>;

const usage = (input: number, output: number): StartUsage => ({
  cache_creation: null,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  inference_geo: null,
  input_tokens: input,
  output_tokens: output,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: null,
  speed: null,
});

const deltaUsage = (output: number): DeltaEvent["usage"] => ({
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  input_tokens: null,
  output_tokens: output,
  output_tokens_details: null,
  server_tool_use: null,
});

const stop = (
  stopReason: DeltaEvent["delta"]["stop_reason"],
): DeltaEvent["delta"] => ({
  container: null,
  stop_details: null,
  stop_reason: stopReason,
  stop_sequence: null,
});

const messageStart: MessageStreamEvent = {
  type: "message_start",
  message: {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [],
    stop_reason: null,
    stop_sequence: null,
    container: null,
    diagnostics: null,
    stop_details: null,
    usage: usage(12, 1),
  },
};

const anthropicEvents: MessageStreamEvent[] = [
  messageStart,
  {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "", citations: null },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Hello" },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: " there" },
  },
  { type: "content_block_stop", index: 0 },
  // Two usage reports: the last one is the one that counts.
  {
    type: "message_delta",
    delta: stop(null),
    usage: deltaUsage(3),
  },
  {
    type: "message_delta",
    delta: stop("end_turn"),
    usage: deltaUsage(7),
  },
  { type: "message_stop" },
];

function openAiChunk(
  content: string | null,
  usage?: ChatCompletionChunk["usage"],
): ChatCompletionChunk {
  return {
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    created: 1_760_000_000,
    model: "gpt-6.1-sol",
    choices: content
      ? [
          {
            index: 0,
            delta: { content },
            finish_reason: null,
            logprobs: null,
          },
        ]
      : [],
    usage,
  };
}

const openAiChunks = [
  openAiChunk("Hello"),
  openAiChunk(" there"),
  openAiChunk(null, {
    prompt_tokens: 9,
    completion_tokens: 4,
    total_tokens: 13,
  } as ChatCompletionChunk["usage"]),
];

const conversation: ChatMessage[] = [{ role: "user", content: "Say hello" }];

describe("anthropic provider", () => {
  test("streams text deltas in order and resolves with the final usage", async () => {
    const api = streamFetch(anthropicSse(anthropicEvents));
    const provider = anthropic({ apiKey: "test-key", fetch: api.fetch });

    const deltas: string[] = [];
    const used = await provider.stream(
      { messages: conversation, system: "Be brief." },
      (text) => deltas.push(text),
    );

    expect(deltas).toEqual(["Hello", " there"]);
    expect(used).toEqual({ input: 12, output: 7 });
  });

  test("sends the model, the conversation, the system prompt and the flags", async () => {
    const api = streamFetch(anthropicSse(anthropicEvents));
    const provider = anthropic({ apiKey: "test-key", fetch: api.fetch });

    await provider.stream(
      {
        messages: [
          { role: "user", content: "Say hello" },
          { role: "assistant", content: "Hello" },
          { role: "user", content: "Again" },
        ],
        system: "Be brief.",
        maxTokens: 64,
        effort: "low",
      },
      () => {},
    );

    const [call] = api.calls;
    expect(call.url).toContain("/v1/messages");
    // v1 of the SDK sends the key as a bearer token, not x-api-key.
    expect(call.headers.get("authorization")).toBe("Bearer test-key");
    expect(call.body).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 64,
      system: "Be brief.",
      stream: true,
      output_config: { effort: "low" },
      messages: [
        { role: "user", content: "Say hello" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "Again" },
      ],
    });
    // Claude models reject temperature, so it is never sent.
    expect(call.body).not.toHaveProperty("temperature");
  });

  test("uses the model it is given instead of the default", async () => {
    const api = streamFetch(anthropicSse(anthropicEvents));
    const provider = anthropic({ apiKey: "test-key", fetch: api.fetch });

    await provider.stream(
      { messages: conversation, model: "claude-opus-5-5" },
      () => {},
    );

    expect(api.calls[0].body.model).toBe("claude-opus-5-5");
    expect(provider.models[0].id).toBe("claude-sonnet-5-5");
  });
});

describe("openai provider", () => {
  test("streams text deltas in order and resolves with the final usage", async () => {
    const api = streamFetch(openAiSse(openAiChunks));
    const provider = openai({ apiKey: "test-key", fetch: api.fetch });

    const deltas: string[] = [];
    const used = await provider.stream(
      { messages: conversation, system: "Be brief." },
      (text) => deltas.push(text),
    );

    expect(deltas).toEqual(openAiChunks.map(delta).filter(Boolean));
    expect(used).toEqual({ input: 9, output: 4 });
  });

  test("sends the conversation, the sampling flags and asks for usage", async () => {
    const api = streamFetch(openAiSse(openAiChunks));
    const provider = openai({ apiKey: "test-key", fetch: api.fetch });

    await provider.stream(
      {
        messages: [
          { role: "user", content: "Say hello" },
          { role: "assistant", content: "Hello" },
          { role: "user", content: "Again" },
        ],
        system: "Be brief.",
        maxTokens: 64,
        temperature: 0.2,
        effort: "high",
      },
      () => {},
    );

    const [call] = api.calls;
    expect(call.url).toContain("/chat/completions");
    expect(call.headers.get("authorization")).toBe("Bearer test-key");
    expect(call.body).toMatchObject({
      model: "gpt-6.1-sol",
      max_completion_tokens: 64,
      temperature: 0.2,
      reasoning_effort: "high",
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Say hello" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "Again" },
      ],
    });
  });

  test("omits the system message when there is no system prompt", async () => {
    const api = streamFetch(openAiSse(openAiChunks));
    const provider = openai({ apiKey: "test-key", fetch: api.fetch });

    await provider.stream({ messages: conversation }, () => {});

    expect(api.calls[0].body.messages).toEqual([
      { role: "user", content: "Say hello" },
    ]);
  });
});

describe("provider shape", () => {
  test("each provider names its models and prices the first as the default", () => {
    for (const provider of [
      anthropic({ apiKey: "k" }),
      openai({ apiKey: "k" }),
    ]) {
      expect(provider.name).toBeTruthy();
      expect(provider.models.length).toBeGreaterThan(1);
      for (const model of provider.models) {
        expect(model.id).toBeTruthy();
        expect(model.pricePerMillionTokens.input).toBeGreaterThan(0);
        expect(model.pricePerMillionTokens.output).toBeGreaterThan(0);
      }
    }
  });
});
