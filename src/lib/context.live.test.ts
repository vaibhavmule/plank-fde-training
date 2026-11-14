import type { UIMessage } from "ai";
import { describe, expect, test, vi } from "vitest";

import { chatModel } from "./chat";
import { summarize } from "./context";

vi.mock("server-only", () => ({}));

// Calls the real small model. Run with `pnpm test:live`, never `pnpm test`.

function message(
  id: string,
  role: "user" | "assistant",
  text: string,
): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

describe("context, live", () => {
  test("summarizes three real messages", async () => {
    const summary = await summarize(chatModel("small"), [
      message(
        "message-1",
        "user",
        "I need the refund policy for a customer in Germany.",
      ),
      message(
        "message-2",
        "assistant",
        "The German refund window is 30 days from delivery.",
      ),
      message(
        "message-3",
        "user",
        "And who approves an exception after 30 days?",
      ),
    ]);

    expect(summary.length).toBeGreaterThan(0);
    expect(summary.toLowerCase()).toContain("refund");
  });
});
