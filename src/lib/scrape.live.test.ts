import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { sdkModel } from "./providers";
import { scrape } from "./scrape";

vi.mock("server-only", () => ({}));

// Calls the real API and reads real pages. Run with `pnpm test:live`, never as
// part of `pnpm test`.
describe("scrape, live", () => {
  test("follows Hacker News to a second page and reads more than 30 stories", async () => {
    const model = sdkModel("anthropic", "claude-haiku-5-5");
    expect(model).toBeDefined();

    const Story = z.object({
      title: z.string().describe("The story's title, exactly as written."),
      url: z
        .string()
        .nullable()
        .describe("The story's absolute link, or null when it has none."),
    });

    const result = await scrape(
      "https://news.ycombinator.com/",
      Story,
      model!,
      { pages: 2 },
    );

    expect(result.pages).toHaveLength(2);
    expect(new URL(result.pages[1]).searchParams.get("p")).toBe("2");
    expect(result.records.length).toBeGreaterThan(30);
    expect(result.records.every((story) => story.title.trim().length > 0)).toBe(
      true,
    );
  });
});
