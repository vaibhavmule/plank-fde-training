import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ToolCall, type ChatToolPart } from "@/components/tool-call";

function part(overrides: Record<string, unknown>) {
  return {
    type: "tool-calculator",
    toolCallId: "call-1",
    ...overrides,
  } as unknown as ChatToolPart;
}

describe("ToolCall", () => {
  test("shows the input and a running label while the tool runs", () => {
    const html = renderToStaticMarkup(
      <ToolCall
        part={part({
          state: "input-available",
          input: { expression: "1234 * 5678" },
        })}
      />,
    );

    expect(html).toContain("Calculating…");
    expect(html).toContain("1234 * 5678");
    expect(html).toContain("calculator");
    expect(html).toContain("animate-spin");
  });

  test("shows the output once the tool is done", () => {
    const html = renderToStaticMarkup(
      <ToolCall
        part={part({
          state: "output-available",
          input: { expression: "1234 * 5678" },
          output: "7006652",
        })}
      />,
    );

    expect(html).toContain("<details");
    expect(html).toContain("Calculated");
    expect(html).toContain("Output");
    expect(html).toContain("7006652");
  });

  test("shows the error once a tool fails", () => {
    const html = renderToStaticMarkup(
      <ToolCall
        part={part({
          state: "output-error",
          input: { expression: "1 / 0" },
          errorText: "The calculator tool failed.",
        })}
      />,
    );

    expect(html).toContain("Calculator failed");
    expect(html).toContain('role="alert"');
    expect(html).toContain("The calculator tool failed.");
  });
});
