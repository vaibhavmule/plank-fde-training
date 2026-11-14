import { describe, expect, test, vi } from "vitest";

import { openrouter } from "./providers";
import { research } from "./research";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

// Calls the real API. Run with `pnpm test:live`, never as part of `pnpm test`.
describe("research, live", () => {
  test("answers the refund question from the refunds policy", async () => {
    const provider = openrouter({
      apiKey: process.env.OPENROUTER_API_KEY ?? "",
    });
    const small = "openai/gpt-6-luna";
    const steps: string[] = [];
    const spend: string[] = [];
    let answer = "";

    await research(
      "How much can a support agent refund without approval?",
      provider,
      {
        step: (message) => steps.push(message),
        text: (delta) => {
          answer += delta;
        },
        spend: (model) => spend.push(model),
      },
      { models: { planner: small, writer: small } },
    );

    expect(steps[0]).toContain("Planning");
    expect(steps.at(-1)).toContain("Writing");
    expect(answer).toContain("200");
    expect(answer).toMatch(/refund/i);
    expect(answer).toMatch(/\[\d+\]/);
    expect(answer).toMatch(/sources/i);
    expect(spend.length).toBeGreaterThan(1);
    expect(spend.every((model) => model === small)).toBe(true);
  });
});
