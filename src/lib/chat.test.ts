import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, test, vi } from "vitest";

import { handleChat, chatModel } from "./chat";
import { ANTHROPIC_MODELS } from "./providers";

vi.mock("server-only", () => ({}));

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
  return handleChat(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    model("Hello from the mock"),
  );
}

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
});
