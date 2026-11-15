import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages/messages";
import { describe, expect, test, vi } from "vitest";

import {
  anthropic,
  openai,
  openrouter,
  type ChatMessage,
  type ToolCall,
} from "./providers";
import { calculatorTool } from "./tools";

vi.mock("server-only", () => ({}));

type Call = { url: string; headers: Headers; body: Record<string, unknown> };

/** A fetch that answers with canned SSE streams, one per request. */
function fetchQueue(responses: (string | Response)[]) {
  const calls: Call[] = [];
  let index = 0;

  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      headers,
      body: JSON.parse(String(init?.body ?? "{}")),
    });

    const response = responses[index++];
    if (response === undefined) throw new Error("Unexpected request");

    return typeof response === "string"
      ? new Response(response, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        })
      : response;
  }) as typeof globalThis.fetch;

  return { fetch, calls };
}

function anthropicSse(events: MessageStreamEvent[]) {
  return events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
}

function openAiSse(events: unknown[]) {
  return (
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

// The SDK's own shapes, so the Anthropic fixtures stay honest when it changes.
type StartUsage = Extract<
  MessageStreamEvent,
  { type: "message_start" }
>["message"]["usage"];
type DeltaEvent = Extract<MessageStreamEvent, { type: "message_delta" }>;

const usage = (input: number): StartUsage => ({
  cache_creation: null,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  inference_geo: null,
  input_tokens: input,
  output_tokens: 1,
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

function messageStart(input: number): MessageStreamEvent {
  return {
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
      usage: usage(input),
    },
  };
}

function anthropicText(
  input: number,
  text: string,
  output: number,
): MessageStreamEvent[] {
  return [
    messageStart(input),
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "", citations: null },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: stop("end_turn"),
      usage: deltaUsage(output),
    },
    { type: "message_stop" },
  ];
}

function anthropicCalculator(
  input: number,
  expression: string,
  output: number,
  stopReason: DeltaEvent["delta"]["stop_reason"] = "tool_use",
): MessageStreamEvent[] {
  return [
    messageStart(input),
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "", citations: null },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Let me calculate. " },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "content_block_start",
      index: 1,
      content_block: {
        type: "tool_use",
        id: "toolu_1",
        name: "calculator",
        input: {},
        caller: { type: "direct" },
      },
    },
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '{"expression":' },
    },
    {
      type: "content_block_delta",
      index: 1,
      delta: {
        type: "input_json_delta",
        partial_json: JSON.stringify(expression) + "}",
      },
    },
    { type: "content_block_stop", index: 1 },
    {
      type: "message_delta",
      delta: stop(stopReason),
      usage: deltaUsage(output),
    },
    { type: "message_stop" },
  ];
}

function outputText(delta: string) {
  return {
    type: "response.output_text.delta",
    delta,
    item_id: "msg_1",
    output_index: 0,
    content_index: 0,
    sequence_number: 1,
  };
}

function messageItem(text: string) {
  return {
    type: "message",
    id: "msg_1",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
  };
}

function functionCall(
  name: string,
  args: string,
  callId = "call_1",
): Record<string, unknown> {
  return {
    type: "function_call",
    id: "fc_1",
    call_id: callId,
    name,
    arguments: args,
    status: "completed",
  };
}

function responseCompleted(
  output: unknown[],
  {
    input = 10,
    outputTokens = 5,
  }: { input?: number; outputTokens?: number } = {},
) {
  return {
    type: "response.completed",
    sequence_number: 2,
    response: {
      id: "resp_test",
      status: "completed",
      error: null,
      output,
      usage: {
        input_tokens: input,
        output_tokens: outputTokens,
        total_tokens: input + outputTokens,
      },
    },
  };
}

function responseIncomplete(output: unknown[]) {
  return {
    type: "response.incomplete",
    sequence_number: 2,
    response: {
      id: "resp_test",
      status: "incomplete",
      error: null,
      incomplete_details: { reason: "max_output_tokens" },
      output,
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    },
  };
}

const conversation: ChatMessage[] = [{ role: "user", content: "Say hello" }];

describe("anthropic provider", () => {
  test("streams text deltas in order and resolves with the final usage", async () => {
    const api = fetchQueue([anthropicSse(anthropicText(12, "Hello there", 7))]);
    const provider = anthropic({ apiKey: "test-key", fetch: api.fetch });

    const deltas: string[] = [];
    const used = await provider.stream(
      { messages: conversation, system: "Be brief." },
      { text: (chunk) => deltas.push(chunk), tool: () => {} },
    );

    expect(deltas).toEqual(["Hello there"]);
    expect(used).toEqual({ input: 12, output: 7 });
  });

  test("sends the model, conversation, system prompt and flags", async () => {
    const api = fetchQueue([anthropicSse(anthropicText(12, "Hello", 3))]);
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
      { text: () => {}, tool: () => {} },
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
    const api = fetchQueue([anthropicSse(anthropicText(12, "Hi", 1))]);
    const provider = anthropic({ apiKey: "test-key", fetch: api.fetch });

    await provider.stream(
      { messages: conversation, model: "claude-opus-5-5" },
      { text: () => {}, tool: () => {} },
    );

    expect(api.calls[0].body.model).toBe("claude-opus-5-5");
    expect(provider.models[0].id).toBe("claude-sonnet-5-5");
  });

  test("runs a tool and returns the exact tool_result block", async () => {
    const api = fetchQueue([
      anthropicSse(anthropicCalculator(10, "2 + 2", 5)),
      anthropicSse(anthropicText(20, "4", 2)),
    ]);
    const provider = anthropic({ apiKey: "test-key", fetch: api.fetch });

    const deltas: string[] = [];
    const toolCalls: ToolCall[] = [];
    const used = await provider.stream(
      {
        messages: [{ role: "user", content: "What is 2 + 2?" }],
        tools: [calculatorTool],
      },
      {
        text: (chunk) => deltas.push(chunk),
        tool: (call) => toolCalls.push(call),
      },
    );

    expect(deltas).toEqual(["Let me calculate. ", "4"]);
    expect(toolCalls).toEqual([
      {
        name: "calculator",
        input: { expression: "2 + 2" },
        result: "4",
        failed: false,
      },
    ]);
    expect(used).toEqual({ input: 30, output: 7 });

    expect(api.calls[0].body).toMatchObject({
      tools: [
        {
          name: "calculator",
          description: expect.stringContaining("Call this"),
          input_schema: {
            type: "object",
            properties: { expression: { type: "string" } },
            required: ["expression"],
          },
        },
      ],
    });

    const messages = api.calls[1].body.messages as unknown[];
    expect(messages[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Let me calculate. " },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "calculator",
          input: { expression: "2 + 2" },
        },
      ],
    });
    expect(messages[2]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: "4",
          is_error: false,
        },
      ],
    });
  });

  test("a reply cut off inside a tool call runs nothing", async () => {
    const api = fetchQueue([
      anthropicSse(anthropicCalculator(10, "2 + ", 5, "max_tokens")),
    ]);
    const provider = anthropic({ apiKey: "test-key", fetch: api.fetch });

    const toolCalls: ToolCall[] = [];
    const used = await provider.stream(
      {
        messages: [{ role: "user", content: "What is 2 + 2?" }],
        tools: [calculatorTool],
      },
      { text: () => {}, tool: (call) => toolCalls.push(call) },
    );

    expect(toolCalls).toEqual([]);
    expect(used).toEqual({ input: 10, output: 5 });
    expect(api.calls).toHaveLength(1);
  });
});

describe("openai provider", () => {
  test("streams text deltas in order and resolves with the final usage", async () => {
    const api = fetchQueue([
      openAiSse([
        outputText("Hello"),
        outputText(" there"),
        responseCompleted([messageItem("Hello there")], {
          input: 9,
          outputTokens: 4,
        }),
      ]),
    ]);
    const provider = openai({ apiKey: "test-key", fetch: api.fetch });

    const deltas: string[] = [];
    const used = await provider.stream(
      { messages: conversation, system: "Be brief." },
      { text: (chunk) => deltas.push(chunk), tool: () => {} },
    );

    expect(deltas).toEqual(["Hello", " there"]);
    expect(used).toEqual({ input: 9, output: 4 });
  });

  test("sends the conversation, sampling flags and asks for usage", async () => {
    const api = fetchQueue([
      openAiSse([
        outputText("Hello"),
        responseCompleted([messageItem("Hello")], {
          input: 9,
          outputTokens: 4,
        }),
      ]),
    ]);
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
      { text: () => {}, tool: () => {} },
    );

    const [call] = api.calls;
    expect(call.url).toContain("/v1/responses");
    expect(call.headers.get("authorization")).toBe("Bearer test-key");
    expect(call.body).toMatchObject({
      model: "gpt-6.1-sol",
      max_output_tokens: 64,
      temperature: 0.2,
      reasoning: { effort: "high" },
      stream: true,
      instructions: "Be brief.",
      input: [
        { role: "user", content: "Say hello" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "Again" },
      ],
    });
  });

  test("omits instructions when there is no system prompt", async () => {
    const api = fetchQueue([
      openAiSse([
        outputText("Hi"),
        responseCompleted([messageItem("Hi")], { input: 4, outputTokens: 1 }),
      ]),
    ]);
    const provider = openai({ apiKey: "test-key", fetch: api.fetch });

    await provider.stream(
      { messages: conversation },
      { text: () => {}, tool: () => {} },
    );

    expect(api.calls[0].body).not.toHaveProperty("instructions");
    expect(api.calls[0].body.input).toEqual([
      { role: "user", content: "Say hello" },
    ]);
  });

  test("runs a function call and returns the exact function_call_output item", async () => {
    const api = fetchQueue([
      openAiSse([
        responseCompleted(
          [functionCall("calculator", '{"expression":"1234 * 5678"}')],
          { input: 12, outputTokens: 5 },
        ),
      ]),
      openAiSse([
        outputText("7006652"),
        responseCompleted([messageItem("7006652")], {
          input: 30,
          outputTokens: 4,
        }),
      ]),
    ]);
    const provider = openai({ apiKey: "test-key", fetch: api.fetch });

    const deltas: string[] = [];
    const toolCalls: ToolCall[] = [];
    const used = await provider.stream(
      {
        messages: [{ role: "user", content: "What is 1234 * 5678?" }],
        tools: [calculatorTool],
      },
      {
        text: (chunk) => deltas.push(chunk),
        tool: (call) => toolCalls.push(call),
      },
    );

    expect(deltas).toEqual(["7006652"]);
    expect(toolCalls).toEqual([
      {
        name: "calculator",
        input: { expression: "1234 * 5678" },
        result: "7006652",
        failed: false,
      },
    ]);
    expect(used).toEqual({ input: 42, output: 9 });

    expect(api.calls[0].body.tools).toEqual([
      {
        type: "function",
        name: "calculator",
        description: expect.stringContaining("Call this"),
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description:
                "The expression to evaluate, for example (1234 * 5678) / 3",
            },
          },
          required: ["expression"],
          additionalProperties: false,
        },
        strict: true,
      },
    ]);

    const input = api.calls[1].body.input as unknown[];
    expect(input[0]).toEqual({
      role: "user",
      content: "What is 1234 * 5678?",
    });
    expect(input[1]).toEqual(
      functionCall("calculator", '{"expression":"1234 * 5678"}'),
    );
    expect(input[2]).toEqual({
      type: "function_call_output",
      call_id: "call_1",
      output: "7006652",
    });
  });

  test("a reply cut off inside a function call runs nothing", async () => {
    const api = fetchQueue([
      openAiSse([
        responseIncomplete([functionCall("calculator", '{"expression":"2 +')]),
      ]),
    ]);
    const provider = openai({ apiKey: "test-key", fetch: api.fetch });

    const toolCalls: ToolCall[] = [];
    const used = await provider.stream(
      {
        messages: [{ role: "user", content: "What is 2 + 2?" }],
        tools: [calculatorTool],
      },
      { text: () => {}, tool: (call) => toolCalls.push(call) },
    );

    expect(toolCalls).toEqual([]);
    expect(used).toEqual({ input: 10, output: 5 });
    expect(api.calls).toHaveLength(1);
  });
});

describe("openrouter provider", () => {
  test("uses the OpenRouter endpoint and openai-prefixed models", async () => {
    const api = fetchQueue([
      openAiSse([
        outputText("Hi"),
        responseCompleted([messageItem("Hi")], { input: 4, outputTokens: 1 }),
      ]),
    ]);
    const provider = openrouter({ apiKey: "or-key", fetch: api.fetch });

    await provider.stream(
      { messages: conversation },
      { text: () => {}, tool: () => {} },
    );

    expect(provider.name).toBe("openrouter");
    expect(provider.models[0].id).toBe("openai/gpt-6.1-sol");
    expect(api.calls[0].url).toContain(
      "https://openrouter.ai/api/v1/responses",
    );
    expect(api.calls[0].body.model).toBe("openai/gpt-6.1-sol");
    expect(api.calls[0].headers.get("authorization")).toBe("Bearer or-key");
  });
});

describe("provider shape", () => {
  test("each provider names its models and prices the first as the default", () => {
    for (const provider of [
      anthropic({ apiKey: "k" }),
      openai({ apiKey: "k" }),
      openrouter({ apiKey: "k" }),
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
