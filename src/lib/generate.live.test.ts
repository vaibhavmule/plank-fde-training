import { describe, expect, test, vi } from "vitest";

import { chatModel } from "./chat";
import { handleGenerate } from "./generate";
import { createRequest } from "./requests";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

// Calls the real API. Run with `pnpm test:live`, never as part of `pnpm test`.

describe("generate route, live", () => {
  test("streams a page built from the live requests", async () => {
    const request = await createRequest({
      title: `Live dashboard ${Date.now()}`,
      team: "operations",
      priority: "high",
    });

    const response = await handleGenerate(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt:
            "Build an operations dashboard with metrics, a chart and a table of the latest requests.",
        }),
      }),
      chatModel("claude-haiku-5-5"),
    );

    expect(response.status).toBe(200);

    const stream = await response.text();
    expect(stream).toContain('"path":"/root"');
    expect(stream).toMatch(/BarChart|LineChart|PieChart|Table/);
    expect(stream).toContain(request.title);
  });
});
