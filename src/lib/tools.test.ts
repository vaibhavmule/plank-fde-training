import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import {
  calculatorTool,
  customerTools,
  employeeTools,
  runTool,
  tool,
} from "@/lib/tools";
import { indexKnowledge } from "@/lib/knowledge";

vi.mock("server-only", () => ({}));

beforeEach(async () => {
  // The knowledge tools search an index, so build it first.
  await indexKnowledge();
});

function names(tools: ReturnType<typeof employeeTools>) {
  return tools.map((entry) => entry.name);
}

const KNOWLEDGE = ["find", "ls", "cat", "grep"];

describe("employeeTools", () => {
  test("gives staff the knowledge base and the everyday tools", () => {
    expect(names(employeeTools())).toEqual([
      ...KNOWLEDGE,
      "calculator",
      "read_url",
      "save_note",
    ]);
  });

  test("adds web_search when a Brave key is configured", () => {
    expect(names(employeeTools({ braveSearchKey: "key" }))).toContain(
      "web_search",
    );
    expect(names(employeeTools({ braveSearchKey: "" }))).not.toContain(
      "web_search",
    );
  });
});

describe("customerTools", () => {
  test("gives a customer the knowledge base, the calculator and pages only", () => {
    expect(names(customerTools())).toEqual([
      ...KNOWLEDGE,
      "calculator",
      "read_url",
    ]);
  });

  test("leaves out notes and web search, which a public chat must not have", () => {
    expect(names(customerTools())).not.toContain("save_note");
    expect(names(customerTools())).not.toContain("web_search");
  });
});

describe("the tool registry", () => {
  test.each(employeeTools({ braveSearchKey: "key" }))(
    "$name describes when to call it and exposes a JSON schema",
    (registered) => {
      expect(registered.description.length).toBeGreaterThan(20);
      expect(z.toJSONSchema(registered.input)).toMatchObject({
        type: "object",
        properties: expect.any(Object),
      });
    },
  );

  test("the calculator tool evaluates through the parser", async () => {
    const calculator = employeeTools().find(
      (registered) => registered.name === "calculator",
    )!;

    await expect(
      calculator.run(calculator.input.parse({ expression: "1234 * 5678" })),
    ).resolves.toBe("7006652");
  });

  test("a schema default applies when run parses its input", async () => {
    const counted = tool({
      name: "counted",
      description: "Echo the count, defaulting to 3",
      input: z.object({ count: z.number().int().default(3) }),
      run({ count }) {
        return String(count);
      },
    });

    await expect(counted.run({} as never)).resolves.toBe("3");
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
