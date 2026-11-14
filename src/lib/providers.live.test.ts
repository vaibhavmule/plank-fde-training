import { describe, expect, test } from "vitest";

import { anthropic } from "./providers";

// Calls the real API. Run with `pnpm test:live`, never as part of `pnpm test`.
describe("anthropic, live", () => {
  test("answers a factual question on the small model", async () => {
    const provider = anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

    let reply = "";
    const usage = await provider.stream(
      {
        model: "claude-haiku-5-5",
        system: "Answer in one word.",
        messages: [
          { role: "user", content: "What color is a clear daytime sky?" },
        ],
        maxTokens: 20,
      },
      (chunk) => {
        reply += chunk;
      },
    );

    expect(reply.toLowerCase()).toContain("blue");
    expect(usage.input).toBeGreaterThan(0);
    expect(usage.output).toBeGreaterThan(0);
  });
});
