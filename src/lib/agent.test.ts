import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import type { AgentToolEvent } from "@/lib/agent";
import { DEFAULT_LIMITS, runAgent } from "@/lib/agent";
import { tool } from "@/lib/tools";

type Reply =
  | { text: string }
  | { calls: { name: string; input: unknown }[]; text?: string }
  | { hang: true };

const usage = (input = 12, output = 6) => ({
  inputTokens: {
    total: input,
    noCache: input,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

/** A model whose every call comes from `replies`, in order. */
function scripted(replies: Reply[]) {
  let index = 0;

  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const reply = replies[index];
      index += 1;
      if (reply === undefined) throw new Error(`Unexpected call ${index}`);

      if ("hang" in reply) {
        const signal = options.abortSignal;
        await new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason));
        });
      }

      if ("calls" in reply) {
        return {
          content: [
            ...(reply.text
              ? [{ type: "text" as const, text: reply.text }]
              : []),
            ...reply.calls.map((call, at) => ({
              type: "tool-call" as const,
              toolCallId: `call-${index}-${at}`,
              toolName: call.name,
              input: JSON.stringify(call.input),
            })),
          ],
          finishReason: { unified: "tool-calls" as const, raw: "tool_use" },
          usage: usage(),
          warnings: [],
        };
      }

      const text = "text" in reply ? reply.text : "";
      return {
        content: [{ type: "text" as const, text }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: usage(),
        warnings: [],
      };
    },
  });

  return model;
}

const lookup = tool({
  name: "lookup",
  description: "Look something up",
  input: z.object({ key: z.string() }),
  run: async ({ key }) => `value for ${key}`,
});

const finish = tool({
  name: "finish",
  description: "End the run with an answer",
  input: z.object({ answer: z.string() }),
  run: async ({ answer }) => answer,
});

function setup(
  replies: Reply[],
  extra: Partial<Parameters<typeof runAgent>[0]> = {},
) {
  const thoughts: string[] = [];
  const calls: AgentToolEvent[] = [];

  return {
    thoughts,
    calls,
    run: () =>
      runAgent({
        model: scripted(replies),
        modelId: "claude-haiku-5-5",
        system: "system",
        task: "task",
        tools: [lookup, finish],
        done: "finish",
        on: {
          thought: (text) => thoughts.push(text),
          tool: (call) => calls.push(call),
        },
        ...extra,
      }),
  };
}

describe("runAgent", () => {
  test("runs a tool, hands back its result, then ends on the done tool", async () => {
    const { run, thoughts, calls } = setup([
      {
        text: "I'll look it up.",
        calls: [{ name: "lookup", input: { key: "a" } }],
      },
      { calls: [{ name: "finish", input: { answer: "done" } }] },
    ]);

    const result = await run();

    expect(result.stopped).toBe("answered");
    expect(result.steps).toBe(2);
    expect(result.report).toEqual({ answer: "done" });
    expect(thoughts).toEqual(["I'll look it up."]);
    expect(calls.map((call) => call.name)).toEqual(["lookup", "finish"]);

    const toolMessage = result.messages.find(
      (message) => message.role === "tool",
    );
    expect(toolMessage).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1-0",
          toolName: "lookup",
          output: { type: "text", value: "value for a" },
        },
      ],
    });
  });

  test("a failing tool reaches the model as an error and the loop goes on", async () => {
    const failing = tool({
      name: "lookup",
      description: "Always throws",
      input: z.object({ key: z.string() }),
      run: async () => {
        throw new Error("the store is down");
      },
    });

    const { run } = setup(
      [
        { calls: [{ name: "lookup", input: { key: "a" } }] },
        { calls: [{ name: "finish", input: { answer: "recovered" } }] },
      ],
      { tools: [failing, finish] },
    );

    const result = await run();

    expect(result.stopped).toBe("answered");
    expect(result.messages).toContainEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1-0",
          toolName: "lookup",
          output: {
            type: "error-text",
            value: "The lookup tool failed: the store is down",
          },
        },
      ],
    });
  });

  test("invalid input is an error result, not an exception", async () => {
    const { run } = setup([
      { calls: [{ name: "lookup", input: { wrong: true } }] },
      { text: "The key was wrong." },
    ]);

    const result = await run();

    expect(result.stopped).toBe("answered");
    expect(result.answer).toBe("The key was wrong.");
    const toolMessage = result.messages.find(
      (message) => message.role === "tool",
    );
    expect(toolMessage?.content[0]).toMatchObject({
      type: "tool-result",
      output: {
        type: "error-text",
        value: expect.stringContaining("Invalid input"),
      },
    });
  });

  test("an unknown tool is an error result that names the tools", async () => {
    const { run } = setup([
      { calls: [{ name: "launch", input: {} }] },
      { text: "Answered anyway." },
    ]);

    const result = await run();

    const toolMessage = result.messages.find(
      (message) => message.role === "tool",
    );
    expect(toolMessage?.content[0]).toMatchObject({
      output: {
        type: "error-text",
        value: expect.stringContaining('Unknown tool "launch"'),
      },
    });
    expect(result.stopped).toBe("answered");
  });

  test("text with no tool call ends the run as answered", async () => {
    const { run, calls } = setup([{ text: "Here is the answer." }]);

    const result = await run();

    expect(result.stopped).toBe("answered");
    expect(result.answer).toBe("Here is the answer.");
    expect(result.steps).toBe(1);
    expect(calls).toEqual([]);
  });

  test("the step limit ends the run with what it has", async () => {
    const { run } = setup(
      [
        { calls: [{ name: "lookup", input: { key: "a" } }] },
        { calls: [{ name: "lookup", input: { key: "b" } }] },
        { calls: [{ name: "lookup", input: { key: "c" } }] },
      ],
      { limits: { steps: 2, dollars: 0, seconds: 0 } },
    );

    const result = await run();

    expect(result.stopped).toBe("steps");
    expect(result.steps).toBe(2);
    expect(result.usage.input).toBe(24);
  });

  test("the dollar limit ends the run before the next step", async () => {
    const { run } = setup(
      [
        { calls: [{ name: "lookup", input: { key: "a" } }] },
        { calls: [{ name: "finish", input: { answer: "never" } }] },
      ],
      // Haiku's $0.1 per million: 12 in and 6 out is well over this.
      { limits: { steps: 5, dollars: 0.0000001, seconds: 0 } },
    );

    const result = await run();

    expect(result.stopped).toBe("dollars");
    expect(result.steps).toBe(1);
  });

  test("the time limit ends a slow model call", async () => {
    const { run } = setup([{ hang: true }], {
      limits: { steps: 5, dollars: 0, seconds: 0.05 },
    });

    const result = await run();

    expect(result.stopped).toBe("time");
  });

  test("the time limit ends a slow tool call", async () => {
    const slow = tool({
      name: "lookup",
      description: "Never finishes",
      input: z.object({ key: z.string() }),
      run: () => new Promise<string>(() => {}),
    });

    const { run } = setup(
      [{ calls: [{ name: "lookup", input: { key: "a" } }] }],
      {
        tools: [slow, finish],
        limits: { steps: 5, dollars: 0, seconds: 0.05 },
      },
    );

    const result = await run();

    expect(result.stopped).toBe("time");
  });

  test("reports each call's usage to the spend callback", async () => {
    const spent: { input: number; output: number }[] = [];
    const { run } = setup([{ text: "Done." }], {
      spend: (entry) => spent.push(entry),
    });

    await run();

    expect(spent).toEqual([{ input: 12, output: 6 }]);
  });

  test("defaults to the Day 11 limits", () => {
    expect(DEFAULT_LIMITS).toEqual({ steps: 15, dollars: 0.5, seconds: 120 });
  });
});
