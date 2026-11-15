import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test, vi } from "vitest";

import type { AgentToolEvent } from "@/lib/agent";
import { investigate, stoppedBeforeReport } from "@/lib/investigate";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

const QUESTION = "Can a support agent approve a $250 refund alone?";

const REPORT = `Yes, but only with written approval. A support agent may refund up to $200 per customer, so $250 needs the support lead's approval.

Sources:
- /policies/refunds`;

type Reply =
  | { text: string }
  | { calls: { name: string; input: unknown }[]; text?: string };

const usage = {
  inputTokens: {
    total: 100,
    noCache: 100,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 50, text: 50, reasoning: undefined },
};

/** A model whose every call comes from `replies`, in order. */
function scripted(replies: Reply[]) {
  let index = 0;

  return new MockLanguageModelV4({
    doGenerate: async () => {
      const reply = replies[index];
      index += 1;
      if (reply === undefined) throw new Error(`Unexpected call ${index}`);

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
          usage,
          warnings: [],
        };
      }

      return {
        content: [{ type: "text" as const, text: reply.text }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage,
        warnings: [],
      };
    },
  });
}

function collect() {
  const thoughts: string[] = [];
  const calls: AgentToolEvent[] = [];

  return {
    thoughts,
    calls,
    on: {
      thought: (text: string) => thoughts.push(text),
      tool: (call: AgentToolEvent) => calls.push(call),
    },
  };
}

describe("investigate", () => {
  test("searches, reads a policy, saves findings and writes a sourced report", async () => {
    const { on, thoughts, calls } = collect();

    const result = await investigate({
      model: scripted([
        {
          text: "I'll search the knowledge base for refund limits.",
          calls: [
            {
              name: "search_knowledge_base",
              input: { question: "refund limit" },
            },
          ],
        },
        {
          text: "I'll read the refunds policy in full.",
          calls: [{ name: "read_policy", input: { slug: "refunds" } }],
        },
        {
          text: "I'll save the limit with its source.",
          calls: [
            {
              name: "save_finding",
              input: {
                text: "A support agent may refund up to $200 per customer without approval.",
                source: "/policies/refunds",
              },
            },
          ],
        },
        {
          text: "I have what I need, so I'll write the report.",
          calls: [{ name: "write_report", input: { report: REPORT } }],
        },
      ]),
      modelId: "claude-haiku-5-5",
      question: QUESTION,
      on,
    });

    expect(result.stopped).toBe("answered");
    expect(result.report).toBe(REPORT);
    expect(result.steps).toBe(4);
    expect(result.findings).toEqual([
      {
        text: "A support agent may refund up to $200 per customer without approval.",
        source: "/policies/refunds",
      },
    ]);
    expect(calls.map((call) => call.name)).toEqual([
      "search_knowledge_base",
      "read_policy",
      "save_finding",
      "write_report",
    ]);
    expect(thoughts).toEqual([
      "I'll search the knowledge base for refund limits.",
      "I'll read the refunds policy in full.",
      "I'll save the limit with its source.",
      "I have what I need, so I'll write the report.",
    ]);

    // The search found the refunds policy and the read returned the limit.
    expect(calls[0].result).toContain("refunds — Refund Policy");
    expect(calls[1].result).toContain("$200");
  });

  test("a run that stops early returns the findings it saved", async () => {
    const result = await investigate({
      model: scripted([
        {
          calls: [
            {
              name: "save_finding",
              input: {
                text: "Refunds above $200 need the support lead.",
                source: "/policies/refunds",
              },
            },
          ],
        },
        { calls: [{ name: "read_policy", input: { slug: "refunds" } }] },
      ]),
      modelId: "claude-haiku-5-5",
      question: QUESTION,
      limits: { steps: 2, dollars: 0, seconds: 0 },
    });

    expect(result.stopped).toBe("steps");
    expect(result.report).toBe(
      "The investigation stopped (steps) before a report was written.\n\nFindings so far:\n- Refunds above $200 need the support lead. — /policies/refunds",
    );
  });

  test("an unknown policy slug comes back as an error and the run goes on", async () => {
    const { on, calls } = collect();

    const result = await investigate({
      model: scripted([
        { calls: [{ name: "read_policy", input: { slug: "refundz" } }] },
        {
          calls: [
            { name: "write_report", input: { report: "No policy covers it." } },
          ],
        },
      ]),
      modelId: "claude-haiku-5-5",
      question: QUESTION,
      on,
    });

    expect(result.stopped).toBe("answered");
    expect(calls[0].failed).toBe(true);
    expect(calls[0].result).toContain("no policy with the slug");
    expect(result.report).toBe("No policy covers it.");
  });

  test("offers web tools only when a Brave key is set", async () => {
    const withKey: string[] = [];
    const withoutKey: string[] = [];

    const reply = {
      calls: [{ name: "write_report", input: { report: "done" } }],
    };

    await investigate({
      model: scripted([reply]),
      modelId: "claude-haiku-5-5",
      question: "anything",
      braveSearchKey: "key",
      on: { tool: (call) => withKey.push(call.name) },
    });

    const noKeyModel = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "web_search",
            input: JSON.stringify({ query: "x" }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_use" },
        usage,
        warnings: [],
      }),
    });

    await investigate({
      model: noKeyModel,
      modelId: "claude-haiku-5-5",
      question: "anything",
      limits: { steps: 1, dollars: 0, seconds: 0 },
      on: { tool: (call) => withoutKey.push(call.name) },
    });

    expect(withKey).toEqual(["write_report"]);
    // Without a key the tool is not registered, so the call is an error result.
    expect(withoutKey).toEqual(["web_search"]);
  });

  test("rejects an empty question before calling the model", async () => {
    await expect(
      investigate({
        model: scripted([]),
        modelId: "claude-haiku-5-5",
        question: "  ",
      }),
    ).rejects.toThrow(/Ask an investigation question/);
  });
});

describe("stoppedBeforeReport", () => {
  test("names the reason and says when nothing was saved", () => {
    expect(stoppedBeforeReport("time", [])).toBe(
      "The investigation stopped (time) before a report was written.\n\nNo findings were saved before it stopped.",
    );
  });
});
