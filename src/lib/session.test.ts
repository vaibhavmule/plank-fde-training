import { describe, expect, test, vi } from "vitest";

import type { Completion, Model, Provider, ToolCall } from "./providers";
import { Session } from "./session";
import { calculatorTool } from "./tools";

vi.mock("server-only", () => ({}));

const MODELS: readonly Model[] = [
  { id: "fast", pricePerMillionTokens: { input: 1, output: 2 } },
  { id: "slow", pricePerMillionTokens: { input: 10, output: 20 } },
];

function fakeProvider(options: {
  name: string;
  models?: readonly Model[];
  replies?: string[];
  failAt?: number;
  toolCalls?: ToolCall[];
}) {
  const calls: Completion[] = [];
  const provider: Provider = {
    name: options.name,
    models: options.models ?? MODELS,
    async stream(completion, events) {
      const index = calls.length;
      calls.push(completion);

      if (options.failAt === index) {
        // Partial output before the failure proves nothing is kept.
        events.text("partial ");
        throw new Error("network down");
      }

      events.text(options.replies?.[index] ?? `reply ${index}`);
      for (const call of options.toolCalls ?? []) events.tool(call);
      return { input: 100, output: 50 };
    },
  };

  return { provider, calls };
}

describe("session", () => {
  test("keeps both messages and sends the whole conversation next turn", async () => {
    const { provider, calls } = fakeProvider({
      name: "fake",
      replies: ["first reply", "second reply"],
    });
    const session = new Session({ provider, system: "Be brief." });

    await session.send("one", () => {});
    await session.send("two", () => {});

    expect(session.history).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "first reply" },
      { role: "user", content: "two" },
      { role: "assistant", content: "second reply" },
    ]);
    expect(calls[1].messages).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "first reply" },
      { role: "user", content: "two" },
    ]);
    expect(calls[0].system).toBe("Be brief.");
  });

  test("prices each turn at the model that answered it", async () => {
    const { provider } = fakeProvider({ name: "fake", replies: ["a", "b"] });
    const session = new Session({ provider, model: "fast" });

    await session.send("one", () => {});
    session.use(provider, "slow");
    await session.send("two", () => {});

    // fast: 100 in at $1/M + 50 out at $2/M = 0.0002
    // slow: 100 in at $10/M + 50 out at $20/M = 0.002
    expect(session.turns.map((turn) => turn.model)).toEqual(["fast", "slow"]);
    expect(session.cost()).toEqual({
      turns: 2,
      input: 200,
      output: 100,
      dollars: 0.0022,
      unpriced: [],
    });
  });

  test("keeps nothing from a failed turn", async () => {
    const { provider } = fakeProvider({ name: "fake", failAt: 1 });

    const session = new Session({ provider });
    await session.send("one", () => {});
    const before = session.history;

    await expect(session.send("two", () => {})).rejects.toThrow("network down");

    expect(session.history).toEqual(before);
    expect(session.cost().turns).toBe(1);
  });

  test("a model switch keeps the conversation", async () => {
    const first = fakeProvider({ name: "one", replies: ["from one"] });
    const second = fakeProvider({ name: "two", replies: ["from two"] });

    const session = new Session({ provider: first.provider });
    await session.send("hello", () => {});

    session.use(second.provider, "slow");
    const chunks: string[] = [];
    await session.send("again", (chunk) => chunks.push(chunk));

    expect(chunks.join("")).toBe("from two");
    expect(second.calls[0].messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "from one" },
      { role: "user", content: "again" },
    ]);
  });

  test("switching to a model with no price flags it instead of guessing", async () => {
    const { provider } = fakeProvider({ name: "fake" });
    const session = new Session({ provider });

    await session.send("one", () => {});
    session.use(provider, "unlisted");
    await session.send("two", () => {});

    const cost = session.cost();
    expect(cost.unpriced).toEqual(["unlisted"]);
    // Only the priced turn counts towards the dollars.
    expect(cost.dollars).toBeCloseTo(0.0002, 10);
  });

  test("records a chain call at its model's price", () => {
    const { provider } = fakeProvider({ name: "fake" });
    const session = new Session({ provider });

    const turn = session.record("slow", { input: 100, output: 50 });

    expect(turn).toEqual({
      model: "slow",
      usage: { input: 100, output: 50 },
      dollars: 0.002,
    });
    expect(session.cost()).toEqual({
      turns: 1,
      input: 100,
      output: 50,
      dollars: 0.002,
      unpriced: [],
    });
  });

  test("flags a chain call on an unpriced model", () => {
    const { provider } = fakeProvider({ name: "fake" });
    const session = new Session({ provider });

    session.record("unlisted", { input: 100, output: 50 });

    expect(session.cost()).toMatchObject({
      dollars: 0,
      unpriced: ["unlisted"],
    });
  });

  test("passes the tools and forwards every tool call", async () => {
    const call: ToolCall = {
      name: "calculator",
      input: { expression: "2 + 2" },
      result: "4",
      failed: false,
    };
    const { provider, calls } = fakeProvider({
      name: "fake",
      replies: ["4"],
      toolCalls: [call],
    });
    const session = new Session({ provider, tools: [calculatorTool] });
    const seen: ToolCall[] = [];

    await session.send(
      "what is 2 + 2?",
      () => {},
      (event) => seen.push(event),
    );

    expect(calls[0].tools).toEqual([calculatorTool]);
    expect(seen).toEqual([call]);
  });

  test("uses the first model as the default and streams through onText", async () => {
    const { provider, calls } = fakeProvider({ name: "fake", replies: ["hi"] });
    const session = new Session({ provider });
    const chunks: string[] = [];

    await session.send("hello", (chunk) => chunks.push(chunk));

    expect(session.model).toBe("fast");
    expect(calls[0].model).toBe("fast");
    expect(chunks).toEqual(["hi"]);
  });
});
