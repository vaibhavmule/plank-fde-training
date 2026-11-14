import { describe, expect, test } from "vitest";
import { z } from "zod";

import { calculatorTool, createTools, runTool, tool } from "@/lib/tools";

function names(tools: ReturnType<typeof createTools>) {
  return tools.map((tool) => tool.name);
}

describe("createTools", () => {
  test("registers the three tools that need no key", () => {
    expect(names(createTools())).toEqual([
      "calculator",
      "read_url",
      "save_note",
    ]);
  });

  test("adds web_search when a Brave key is configured", () => {
    expect(names(createTools({ braveSearchKey: "key" }))).toEqual([
      "calculator",
      "read_url",
      "save_note",
      "web_search",
    ]);
  });

  test("leaves web_search out when the key is blank", () => {
    expect(names(createTools({ braveSearchKey: "" }))).not.toContain(
      "web_search",
    );
  });

  test.each(createTools({ braveSearchKey: "key" }))(
    "$name describes when to call it and exposes a JSON schema",
    (registered) => {
      expect(registered.description).toMatch(/call this/i);
      expect(z.toJSONSchema(registered.input)).toMatchObject({
        type: "object",
        properties: expect.any(Object),
      });
    },
  );

  test("the calculator tool evaluates through the parser", async () => {
    const calculator = createTools().find(
      (registered) => registered.name === "calculator",
    )!;
    const input = calculator.input.parse({ expression: "1234 * 5678" });

    await expect(calculator.run(input)).resolves.toBe("7006652");
  });
});

describe("runTool", () => {
  test("runs a known tool with its parsed input", async () => {
    await expect(
      runTool([calculatorTool], {
        name: "calculator",
        input: { expression: "2 + 2" },
      }),
    ).resolves.toEqual({ result: "4", failed: false });
  });

  test("names the available tools when the tool is unknown", async () => {
    const outcome = await runTool([calculatorTool], {
      name: "launch_missiles",
      input: {},
    });

    expect(outcome.failed).toBe(true);
    expect(outcome.result).toContain('Unknown tool "launch_missiles"');
    expect(outcome.result).toContain("calculator");
  });

  test("reports invalid input instead of throwing", async () => {
    const outcome = await runTool([calculatorTool], {
      name: "calculator",
      input: { expression: 42 },
    });

    expect(outcome.failed).toBe(true);
    expect(outcome.result).toContain('Invalid input for "calculator"');
    expect(outcome.result).toContain("expression");
  });

  test("reports a thrown error as a failed result", async () => {
    const failing = tool({
      name: "failing",
      description: "Always throws",
      input: z.object({}),
      run() {
        throw new Error("boom");
      },
    });

    await expect(
      runTool([failing], { name: "failing", input: {} }),
    ).resolves.toEqual({
      result: "The failing tool failed: boom",
      failed: true,
    });
  });
});
