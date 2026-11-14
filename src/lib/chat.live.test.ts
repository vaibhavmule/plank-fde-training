import { describe, expect, test, vi } from "vitest";

import { chatModel, handleChat } from "./chat";

vi.mock("server-only", () => ({}));

// Calls the real API. Run with `CHAT_MODEL=<small model> pnpm test:live`, never
// as part of `pnpm test`.

describe("chat route, live", () => {
  test("streams a calculator call, its result and the answer", async () => {
    const response = await handleChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "live-chat",
          messages: [
            {
              id: "message-1",
              role: "user",
              parts: [{ type: "text", text: "What is 1234 * 5678?" }],
            },
          ],
        }),
      }),
      chatModel(),
    );

    expect(response.status).toBe(200);

    const stream = await response.text();
    expect(stream).toContain('"toolName":"calculator"');
    expect(stream).toContain("7006652");
  });
});
