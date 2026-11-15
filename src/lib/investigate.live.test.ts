import { describe, expect, test, vi } from "vitest";

import { investigate, type Entry } from "./investigate";
import { sdkModel } from "./providers";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

// Calls the real API. Run with `pnpm test:live`, never as part of `pnpm test`.
describe("investigate, live", () => {
  test("answers the $250 refund question from the refunds policy", async () => {
    const analystId = "claude-haiku-5-5";
    const specialistId = "claude-haiku-5-5";
    const analyst = sdkModel("anthropic", analystId);
    const specialist = sdkModel("anthropic", specialistId);
    expect(analyst).toBeDefined();
    expect(specialist).toBeDefined();

    const calls: string[] = [];
    const result = await investigate(
      "Can a support agent approve a $250 refund alone?",
      { analyst: analyst!, specialist: specialist! },
      {
        braveSearchKey: process.env.BRAVE_SEARCH_KEY ?? "",
        limits: { steps: 10, dollars: 0.1, seconds: 150 },
        on: {
          log: (entry: Entry) => {
            if (entry.kind === "tool") calls.push(entry.name);
          },
        },
      },
    );

    expect(result.stopped).toBe("answered");
    expect(result.report).toContain("200");
    expect(result.report).toMatch(/refund/i);
    expect(result.report).toMatch(/sources/i);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(calls).toContain("ask_knowledge_base");
    expect(calls).toContain("write_report");
  });
});
