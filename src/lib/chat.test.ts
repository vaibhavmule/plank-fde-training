import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { handleChat, chatModel } from "./chat";
import { listMemories } from "./memory";
import { ANTHROPIC_MODELS } from "./providers";
import { resetMemories } from "./test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

beforeEach(async () => {
  await resetMemories();
});

const usage = {
  inputTokens: {
    total: 4,
    noCache: 4,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 3, text: 3, reasoning: undefined },
};

function modelId(model: ReturnType<typeof chatModel>) {
  return typeof model === "string" ? model : model.modelId;
}

function model(reply: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: reply },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: {
                total: 4,
                noCache: 4,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 3, text: 3, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}

function post(input: unknown) {
  return handleChat(chatRequest(input), model("Hello from the mock"));
}

function chatRequest(input: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** The small model's answer to extraction: one preference. */
function extractionModel() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            memories: [
              { kind: "preference", text: "The person wants short answers." },
            ],
          }),
        },
      ],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }),
  });
}

/** The small model's answer to summarization: plain text. */
function summaryModel(summary: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: summary }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }),
  });
}

const question = {
  id: "chat-1",
  messages: [
    {
      id: "message-1",
      role: "user",
      parts: [
        {
          type: "text",
          text: "I'm on the finance team and I want short answers.",
        },
      ],
    },
  ],
};

const message = {
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "What is 2 + 2?" }],
};

describe("chat route", () => {
  test("streams the reply as UI message chunks", async () => {
    const response = await post({ id: "chat-1", messages: [message] });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const stream = await response.text();
    expect(stream).toContain('"type":"text-delta"');
    expect(stream).toContain('"type":"text-end"');
    expect(stream).toContain("Hello from the mock");
  });

  test.each([
    { messages: [message] },
    { id: "chat-1" },
    { id: "", messages: [message] },
    { id: "chat-1", messages: [] },
  ])("rejects an invalid envelope: %j", async (input) => {
    const response = await post(input);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  test("rejects a message without parts and names messages", async () => {
    const response = await post({
      id: "chat-1",
      messages: [{ id: "message-1", role: "user" }],
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      issues: { path: (string | number)[]; message: string }[];
    };
    expect(body.error).toBe("invalid_request");
    expect(body.issues[0]?.path).toEqual(["messages"]);
  });

  test("rejects malformed JSON", async () => {
    const response = await handleChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: "{",
      }),
      model("unused"),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      issues: { path: (string | number)[]; message: string }[];
    };
    expect(body.issues).toEqual([
      { path: [], message: "Request body must be valid JSON." },
    ]);
  });

  test("defaults to the provider list's first model", () => {
    expect(modelId(chatModel())).toBe(ANTHROPIC_MODELS[0].id);
  });

  test("an explicit id overrides the provider default", () => {
    expect(modelId(chatModel("claude-opus-5-5"))).toBe("claude-opus-5-5");
  });

  test('"small" picks the provider list\'s last model', () => {
    expect(modelId(chatModel("small"))).toBe(
      ANTHROPIC_MODELS[ANTHROPIC_MODELS.length - 1].id,
    );
  });

  test("stores a fact after the reply and carries it into the next conversation", async () => {
    const visitor = crypto.randomUUID();
    const background: Promise<void>[] = [];
    const after = (task: () => Promise<void>) => {
      background.push(task());
    };

    const first = model("Short answer.");
    const firstResponse = await handleChat(chatRequest(question), first, {
      visitor,
      smallModel: extractionModel(),
      after,
    });

    expect(firstResponse.status).toBe(200);
    await firstResponse.text();
    await Promise.all(background);

    expect(await listMemories(visitor)).toEqual([
      expect.objectContaining({
        kind: "preference",
        text: "The person wants short answers.",
      }),
    ]);

    const second = model("Short answer.");
    const secondResponse = await handleChat(chatRequest(question), second, {
      visitor,
      smallModel: extractionModel(),
      after,
    });
    await secondResponse.text();
    await Promise.all(background);

    expect(JSON.stringify(second.doStreamCalls[0])).toContain(
      "The person wants short answers.",
    );
  });

  test("schedules no extraction for a caller without a visitor", async () => {
    const after = vi.fn();
    const response = await handleChat(chatRequest(question), model("Hello."), {
      smallModel: extractionModel(),
      after,
    });

    await response.text();
    expect(after).not.toHaveBeenCalled();
  });

  test("compacts a long history and tells the model what was cut", async () => {
    const first = {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "start ".repeat(20) }],
    };
    const buried = {
      id: "message-2",
      role: "user",
      parts: [{ type: "text", text: "buried ".repeat(100) }],
    };
    const latest = {
      id: "message-3",
      role: "user",
      parts: [{ type: "text", text: "latest question" }],
    };

    const main = model("Fine.");
    const response = await handleChat(
      chatRequest({ id: "chat-1", messages: [first, buried, latest] }),
      main,
      {
        smallModel: summaryModel("The person asked about invoicing."),
        contextBudget: 100,
      },
    );

    await response.text();
    const prompt = JSON.stringify(main.doStreamCalls[0]);
    expect(prompt).toContain("Earlier in this conversation:");
    expect(prompt).toContain("The person asked about invoicing.");
    expect(prompt).toContain("start start");
    expect(prompt).toContain("latest question");
    expect(prompt).not.toContain("buried buried");
  });
});
