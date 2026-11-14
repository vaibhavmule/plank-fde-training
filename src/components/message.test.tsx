import type { UIMessage } from "ai";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Message } from "@/components/message";

describe("Message", () => {
  test("shows a user message as a bubble", () => {
    const message: UIMessage = {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "What is 1234 * 5678?" }],
    };

    const html = renderToStaticMarkup(<Message message={message} />);
    expect(html).toContain("What is 1234 * 5678?");
    expect(html).toContain("bg-primary");
  });

  test("renders assistant text as Markdown next to each tool call", () => {
    const message: UIMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "text", text: "The answer is **7006652**." },
        {
          type: "tool-calculator",
          toolCallId: "call-1",
          state: "output-available",
          input: { expression: "1234 * 5678" },
          output: "7006652",
        },
      ],
    };

    const html = renderToStaticMarkup(<Message message={message} />);
    expect(html).toContain("<strong>7006652</strong>");
    expect(html).toContain("<details");
    expect(html).toContain("Calculated");
  });

  test("skips parts it does not render", () => {
    const message: UIMessage = {
      id: "assistant-2",
      role: "assistant",
      parts: [{ type: "step-start" }],
    };

    expect(renderToStaticMarkup(<Message message={message} />)).toBe(
      '<div class="space-y-2"></div>',
    );
  });
});
