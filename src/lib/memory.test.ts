import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  extractMemories,
  forget,
  forgetAll,
  listMemories,
  memoryNote,
  remember,
  type Memory,
} from "./memory";
import { resetMemories } from "./test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

beforeEach(async () => {
  await resetMemories();
});

const usage = {
  inputTokens: {
    total: 12,
    noCache: 12,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 6, text: 6, reasoning: undefined },
};

function extractor(payload: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(payload) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }),
  });
}

function known(text: string): Memory {
  return {
    id: crypto.randomUUID(),
    kind: "entity",
    text,
    createdAt: new Date().toISOString(),
  };
}

describe("memories", () => {
  test("stores facts per visitor and lists them oldest first", async () => {
    await remember("visitor-1", [
      { kind: "preference", text: "The person wants short answers." },
      { kind: "entity", text: "The person works in finance." },
    ]);
    await remember("visitor-2", [
      { kind: "case", text: "The person is chasing an invoice." },
    ]);

    const first = await listMemories("visitor-1");
    expect(first.map((memory) => memory.text)).toEqual([
      "The person wants short answers.",
      "The person works in finance.",
    ]);
    expect(first[0]?.kind).toBe("preference");
    expect(await listMemories("visitor-2")).toHaveLength(1);
    expect(await listMemories("visitor-3")).toEqual([]);
  });

  test("the same sentence twice is one memory, whatever its kind", async () => {
    await remember("visitor-1", [
      { kind: "preference", text: "The person wants short answers." },
    ]);
    const inserted = await remember("visitor-1", [
      { kind: "entity", text: "The person wants short answers." },
    ]);

    expect(inserted).toEqual([]);
    const memories = await listMemories("visitor-1");
    expect(memories).toHaveLength(1);
    expect(memories[0]?.kind).toBe("preference");
  });

  test("forget removes one memory, only for its visitor", async () => {
    await remember("visitor-1", [
      { kind: "preference", text: "The person wants short answers." },
    ]);
    await remember("visitor-2", [
      { kind: "preference", text: "The person wants short answers." },
    ]);
    const [memory] = await listMemories("visitor-1");
    expect(memory).toBeDefined();

    expect(await forget("visitor-2", memory?.id)).toBe(false);
    expect(await forget("visitor-1", "not-a-uuid")).toBe(false);
    expect(await listMemories("visitor-1")).toHaveLength(1);

    expect(await forget("visitor-1", memory?.id)).toBe(true);
    expect(await listMemories("visitor-1")).toEqual([]);
    expect(await listMemories("visitor-2")).toHaveLength(1);
  });

  test("forgetAll empties one visitor's memories", async () => {
    await remember("visitor-1", [
      { kind: "preference", text: "The person wants short answers." },
      { kind: "entity", text: "The person works in finance." },
    ]);
    await remember("visitor-2", [
      { kind: "case", text: "The person is chasing an invoice." },
    ]);

    expect(await forgetAll("visitor-1")).toBe(2);
    expect(await listMemories("visitor-1")).toEqual([]);
    expect(await listMemories("visitor-2")).toHaveLength(1);
  });
});

describe("memoryNote", () => {
  test("is empty when nothing is known", () => {
    expect(memoryNote([])).toBe("");
  });

  test("lists each fact with its kind", () => {
    const note = memoryNote([
      known("The person works in finance."),
      {
        id: crypto.randomUUID(),
        kind: "preference",
        text: "The person wants short answers.",
        createdAt: new Date().toISOString(),
      },
    ]);

    expect(note).toContain("entity: The person works in finance.");
    expect(note).toContain("preference: The person wants short answers.");
  });
});

describe("extractMemories", () => {
  test("returns the facts the model found as typed data", async () => {
    const model = extractor({
      memories: [
        { kind: "preference", text: "The person wants short answers." },
        { kind: "entity", text: "The person works on the finance team." },
      ],
    });

    const found = await extractMemories(
      model,
      {
        user: "I'm on the finance team and I want short answers.",
        assistant: "Understood.",
      },
      [],
    );

    expect(found).toEqual([
      { kind: "preference", text: "The person wants short answers." },
      { kind: "entity", text: "The person works on the finance team." },
    ]);
  });

  test("passes the exchange and the known facts to the model", async () => {
    const model = extractor({ memories: [] });

    await extractMemories(
      model,
      {
        user: "I'm on the finance team and I want short answers.",
        assistant: "Understood.",
      },
      [known("The person uses NetSuite for invoicing.")],
    );

    const call = JSON.stringify(model.doGenerateCalls[0]);
    expect(call).toContain("I'm on the finance team");
    expect(call).toContain("The person uses NetSuite for invoicing.");
  });
});
