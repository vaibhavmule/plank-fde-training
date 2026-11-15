import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Entry } from "@/lib/investigate";
import { investigate, stoppedBeforeReport } from "@/lib/investigate";
import { indexKnowledge } from "@/lib/knowledge";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

beforeEach(async () => {
  await indexKnowledge();
});

const QUESTION = "Can a support agent approve a $250 refund alone?";

const FINDING = {
  text: "A support agent may refund up to $200 per customer without approval.",
  source: "policies/refunds#refund-authority",
};

const REPORT = `Yes, but only with written approval. A support agent may refund up to $200 per customer, so $250 needs the support lead's approval.

Sources:
- policies/refunds#refund-authority`;

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
    modelId: "claude-haiku-5-5",
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

/** The log as short strings, so an ordering assertion reads clearly. */
function outline(log: Entry[]): string[] {
  return log.map((entry) => {
    if (entry.kind === "thought")
      return `${entry.agent} thought: ${entry.text}`;
    if (entry.kind === "tool") return `${entry.agent} tool: ${entry.name}`;
    return `${entry.agent} done: ${entry.outcome}`;
  });
}

/** An analyst that delegates to the knowledge base, then writes the report. */
function delegatingAnalyst() {
  return scripted([
    {
      text: "I'll ask the knowledge base for the refund limit.",
      calls: [
        {
          name: "ask_knowledge_base",
          input: { question: "What is the refund limit for a support agent?" },
        },
      ],
    },
    {
      text: "I have the limit, so I'll write the report.",
      calls: [{ name: "write_report", input: { report: REPORT } }],
    },
  ]);
}

/** A specialist that searches, saves one finding, then answers in text. */
function knowledgeSpecialist() {
  return scripted([
    {
      text: "I'll search for the refund limit and save what I find.",
      calls: [
        { name: "find", input: { query: "refund limit" } },
        { name: "save_finding", input: FINDING },
      ],
    },
    {
      text: `${FINDING.text} (${FINDING.source})`,
    },
  ]);
}

describe("investigate", () => {
  test("delegates to the knowledge specialist and writes a sourced report", async () => {
    const result = await investigate(
      QUESTION,
      { analyst: delegatingAnalyst(), specialist: knowledgeSpecialist() },
      {},
    );

    expect(result.stopped).toBe("answered");
    expect(result.report).toBe(REPORT);
    expect(result.report).toContain(FINDING.source);
    expect(result.findings).toEqual([FINDING]);
    expect(result.total).toBe(
      result.cost.analyst + result.cost.knowledge + result.cost.web,
    );
    expect(result.cost.analyst).toBeGreaterThan(0);
    expect(result.cost.knowledge).toBeGreaterThan(0);
    expect(result.cost.web).toBe(0);
  });

  test("logs each agent's thought, calls and finish in order", async () => {
    const live: Entry[] = [];

    const result = await investigate(
      QUESTION,
      { analyst: delegatingAnalyst(), specialist: knowledgeSpecialist() },
      { on: { log: (entry) => live.push(entry) } },
    );

    const expected = [
      "analyst thought: I'll ask the knowledge base for the refund limit.",
      "knowledge thought: I'll search for the refund limit and save what I find.",
      "knowledge tool: find",
      "knowledge tool: save_finding",
      `knowledge thought: ${FINDING.text} (${FINDING.source})`,
      "knowledge done: answered",
      "analyst tool: ask_knowledge_base",
      "analyst thought: I have the limit, so I'll write the report.",
      "analyst tool: write_report",
      "analyst done: answered",
    ];

    expect(outline(result.log)).toEqual(expected);
    expect(outline(live)).toEqual(expected);
  });

  test("a run cut off by its limits keeps the findings it saved", async () => {
    const specialist = scripted([
      {
        calls: [
          { name: "find", input: { query: "refund limit" } },
          { name: "save_finding", input: FINDING },
        ],
      },
      { text: FINDING.text },
    ]);

    const analyst = scripted([
      {
        calls: [
          {
            name: "ask_knowledge_base",
            input: { question: "What is the refund limit?" },
          },
        ],
      },
    ]);

    const result = await investigate(
      QUESTION,
      { analyst, specialist },
      { limits: { steps: 1 } },
    );

    expect(result.stopped).toBe("steps");
    expect(result.findings).toEqual([FINDING]);
    expect(result.report).toBe(
      `The investigation stopped (steps) before a report was written.\n\nFindings so far:\n- ${FINDING.text} — ${FINDING.source}`,
    );
  });

  test("rejects an empty question before calling the model", async () => {
    await expect(
      investigate(
        "  ",
        { analyst: scripted([]), specialist: scripted([]) },
        {},
      ),
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
