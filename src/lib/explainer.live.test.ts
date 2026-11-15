import { describe, expect, test, vi } from "vitest";

import { explain, type TraceEvent } from "./explainer";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

// Calls the real pipeline on the small model. Run with `pnpm test:live`.
describe("explain, live", () => {
  test("researches, writes and approves a sourced reply", async () => {
    const trace: TraceEvent[] = [];

    const result = await explain(
      "Why was my refund only $200 when I paid $250?",
      {
        trace: (event) => trace.push(event),
        text: () => {},
      },
      undefined,
      "claude-haiku-5-5",
    );

    const handoffs = trace.filter((event) => event.kind === "handoff");
    const names = handoffs.map((event) => event.name);

    expect(names[0]).toBe("researcher");
    expect(names[names.length - 1]).toBe("editor");
    expect(names.indexOf("writer")).toBeLessThan(names.lastIndexOf("editor"));
    expect(result.trace).toEqual(trace);
    expect(result.reply).toContain("200");
    expect(result.cost).toBeGreaterThanOrEqual(0);
    expect(result.turns).toBeGreaterThan(0);
  });
});
