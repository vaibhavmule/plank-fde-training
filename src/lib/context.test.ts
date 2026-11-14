import type { UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test, vi } from "vitest";

import { compact, fitContext, sizeOf, summarize, transcript } from "./context";

vi.mock("server-only", () => ({}));

let counter = 0;

function message(
  role: "user" | "assistant",
  parts: UIMessage["parts"],
): UIMessage {
  counter += 1;
  return { id: `message-${counter}`, role, parts };
}

function user(text: string) {
  return message("user", [{ type: "text", text }]);
}

function assistant(text: string) {
  return message("assistant", [{ type: "text", text }]);
}

function readUrl(output: string) {
  return message("assistant", [
    {
      type: "dynamic-tool",
      toolName: "read_url",
      toolCallId: "call-1",
      state: "output-available",
      input: { url: "https://example.com" },
      output,
    },
  ]);
}

function summaryModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

describe("sizeOf", () => {
  test("estimates four characters per token", () => {
    expect(sizeOf(user("x".repeat(400)))).toBe(100);
    expect(sizeOf(assistant(""))).toBe(0);
  });

  test("counts a tool call's input and result", () => {
    expect(sizeOf(readUrl("y".repeat(4_000)))).toBeGreaterThan(1_000);
  });
});

describe("fitContext", () => {
  test("returns a history within budget untouched", () => {
    const messages = [user("hello"), assistant("hi there")];
    const fitted = fitContext(messages, 1_000);

    expect(fitted.kept).toEqual(messages);
    expect(fitted.dropped).toEqual([]);
  });

  test("over budget keeps the first message and the latest", () => {
    const first = user("start ".repeat(20));
    const buried = user("buried ".repeat(100));
    const buriedReply = assistant("a reply that is cut");
    const latest = user("latest question");
    const latestReply = assistant("latest reply");

    const fitted = fitContext(
      [first, buried, buriedReply, latest, latestReply],
      100,
    );

    expect(fitted.kept).toEqual([first, latest, latestReply]);
    expect(fitted.dropped).toEqual([buried, buriedReply]);
  });

  test("a large tool result counts toward the budget and can be dropped", () => {
    const first = user("first question");
    const tool = readUrl("z".repeat(4_000));
    const latest = user("latest question");
    const latestReply = assistant("latest reply");

    const fitted = fitContext([first, tool, latest, latestReply], 100);

    expect(fitted.kept).toEqual([first, latest, latestReply]);
    expect(fitted.dropped).toEqual([tool]);
  });

  test("blocks that alone fit nothing keep only the first message", () => {
    const first = user("the intent");
    const huge = user("h".repeat(4_000));

    const fitted = fitContext([first, huge], 100);

    expect(fitted.kept).toEqual([first]);
    expect(fitted.dropped).toEqual([huge]);
  });
});

describe("compact", () => {
  test("leaves a history within budget alone without calling the model", async () => {
    const model = summaryModel("unused");
    const messages = [user("hello"), assistant("hi there")];

    const result = await compact(model, messages, 1_000);

    expect(result.messages).toEqual(messages);
    expect(result.summary).toBeUndefined();
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  test("summarizes only the messages it drops", async () => {
    const first = user("start ".repeat(20));
    const buried = user("buried ".repeat(100));
    const buriedReply = assistant("a reply that is cut");
    const latest = user("latest question");
    const latestReply = assistant("latest reply");
    const model = summaryModel("The person asked about invoicing.");

    const result = await compact(
      model,
      [first, buried, buriedReply, latest, latestReply],
      100,
    );

    expect(result.messages).toEqual([first, latest, latestReply]);
    expect(result.summary).toBe("The person asked about invoicing.");

    const prompt = JSON.stringify(model.doGenerateCalls[0]);
    expect(prompt).toContain("buried");
    expect(prompt).not.toContain("latest question");
    expect(prompt).not.toContain("start start");
  });
});

describe("summarize", () => {
  test("bounds a transcript over the summary budget from the newest end", async () => {
    const oldest = user("a".repeat(40_000));
    const middle = user("b".repeat(40_000));
    const newest = user("c".repeat(40_000));

    expect(transcript([oldest, middle, newest])).toContain(
      "The earlier messages were omitted",
    );
    expect(transcript([oldest, middle, newest])).not.toContain("a".repeat(100));

    const model = summaryModel("A bounded summary.");
    const summary = await summarize(model, [oldest, middle, newest]);

    expect(summary).toBe("A bounded summary.");
    const prompt = JSON.stringify(model.doGenerateCalls[0]);
    expect(prompt).toContain("c".repeat(100));
    expect(prompt).not.toContain("a".repeat(100));
  });
});
