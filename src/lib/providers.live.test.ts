import { describe, expect, test } from "vitest";

import { anthropic, openrouter, type ToolCall } from "./providers";
import { employeeTools } from "./tools";

// Calls the real API. Run with `pnpm test:live`, never as part of `pnpm test`.
describe.each([
  {
    name: "anthropic",
    model: "claude-haiku-5-5",
    provider: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" }),
  },
  {
    name: "openrouter",
    model: "openai/gpt-6-luna",
    provider: openrouter({ apiKey: process.env.OPENROUTER_API_KEY ?? "" }),
  },
])("$name, live", ({ provider, model }) => {
  test("answers 1234 * 5678 by calling the calculator", async () => {
    let reply = "";
    const toolCalls: ToolCall[] = [];

    const usage = await provider.stream(
      {
        model,
        system:
          "Use the calculator tool for every calculation, then answer with the result.",
        messages: [{ role: "user", content: "What is 1234 * 5678?" }],
        tools: employeeTools(),
        maxTokens: 512,
      },
      {
        text: (chunk) => {
          reply += chunk;
        },
        tool: (call) => toolCalls.push(call),
      },
    );

    const calculation = toolCalls.find((call) => call.name === "calculator");
    expect(calculation).toBeDefined();
    expect(calculation?.result).toBe("7006652");
    // The model may format the number with a thousands separator.
    expect(reply.replace(/[,\s]/g, "")).toContain("7006652");
    expect(usage.input).toBeGreaterThan(0);
    expect(usage.output).toBeGreaterThan(0);
  });
});
