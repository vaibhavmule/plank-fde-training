import { describe, expect, test, vi } from "vitest";

import { chatModel, handleChat } from "./chat";
import { extractMemories, forgetAll, listMemories } from "./memory";

vi.mock("server-only", () => ({}));

// Calls the real API. Run with `pnpm test:live`, never as part of `pnpm test`.

describe("memory, live", () => {
  test("extraction returns at least one fact about the person", async () => {
    const memories = await extractMemories(
      chatModel("small"),
      {
        user: "I'm on the finance team and I want short answers. We use NetSuite for invoicing.",
        assistant: "Understood. I'll keep it short.",
      },
      [],
    );

    expect(memories.length).toBeGreaterThan(0);
  });

  test("the route stores a memory after a real reply", async () => {
    const visitor = `live-${crypto.randomUUID()}`;
    let background: Promise<void> | undefined;

    const response = await handleChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "live-memory-chat",
          messages: [
            {
              id: "message-1",
              role: "user",
              parts: [
                {
                  type: "text",
                  text: "I'm on the finance team and I always want short answers.",
                },
              ],
            },
          ],
        }),
      }),
      chatModel(),
      {
        visitor,
        smallModel: chatModel("small"),
        after: (task) => {
          background = task();
        },
      },
    );

    expect(response.status).toBe(200);
    await response.text();
    await background;

    const memories = await listMemories(visitor);
    expect(memories.length).toBeGreaterThan(0);

    await forgetAll(visitor);
  });
});
