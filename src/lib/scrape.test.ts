import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { nextLink, scrape } from "@/lib/scrape";

const usage = {
  inputTokens: {
    total: 100,
    noCache: 100,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

const Supplier = z.object({
  name: z.string(),
  hours: z.string().nullable(),
});

/** The address on the first line of each prompt, then the items for it. */
function scriptedModel(answers: Record<string, unknown[]>) {
  const seen: string[] = [];
  const prompts: string[] = [];

  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const user = options.prompt.find((message) => message.role === "user");
      const content = user?.content ?? "";
      const prompt = Array.isArray(content)
        ? content
            .map((part) => (part.type === "text" ? part.text : ""))
            .join("")
        : content;
      const url = prompt.split("\n")[0].trim();
      seen.push(url);
      prompts.push(prompt);

      const items = answers[url];
      if (items === undefined) throw new Error(`No answer for ${url}`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ items }) }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage,
        warnings: [],
      };
    },
  });

  return { model, seen, prompts };
}

type Page = { html: string } | { status: number };

function fakeFetch(pages: Record<string, Page>) {
  const calls: string[] = [];

  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input)).toString();
    calls.push(url);
    const page = pages[url];
    if (!page) return new Response("missing", { status: 404 });
    if ("status" in page) return new Response("error", { status: page.status });
    return new Response(page.html);
  }) as typeof globalThis.fetch;

  return { fetch, calls };
}

describe("nextLink", () => {
  test("takes a rel=next link over any other", () => {
    const html = `
      <a href="/older">Older</a>
      <a rel="next nofollow" href="/page/2">Read on</a>`;

    expect(nextLink(html, "https://example.com/listing?a=1")).toBe(
      "https://example.com/page/2",
    );
  });

  test.each(["Next", "next", "More", "older", "›", "»"])(
    "follows a link whose text is %s",
    (text) => {
      const html = `<nav><a href="/page/2">${text}</a></nav>`;

      expect(nextLink(html, "https://example.com/page")).toBe(
        "https://example.com/page/2",
      );
    },
  );

  test("resolves the link against the page it was found on", () => {
    const html = `<a href="../page/3">Next</a>`;

    expect(nextLink(html, "https://example.com/archive/page/2")).toBe(
      "https://example.com/archive/page/3",
    );
  });

  test("accepts an arrow after the word", () => {
    const html = `<a href="?p=2">Next →</a>`;

    expect(nextLink(html, "https://news.example.com/")).toBe(
      "https://news.example.com/?p=2",
    );
  });

  test("ignores a link with no address and a broken address", () => {
    const html = `<a>Next</a><a href="http://[">More</a>`;

    expect(nextLink(html, "https://example.com/")).toBeUndefined();
  });

  test("returns undefined when nothing calls itself next", () => {
    const html = `<a href="/page/2">Page 2</a>`;

    expect(nextLink(html, "https://example.com/")).toBeUndefined();
  });
});

describe("scrape", () => {
  test("reads each page, follows the next link and keeps the records", async () => {
    const api = fakeFetch({
      "https://suppliers.example.com/": {
        html: `<ul><li>Acme</li></ul><a href="/page/2" rel="next">Next</a>`,
      },
      "https://suppliers.example.com/page/2": {
        html: `<ul><li>Beta</li></ul>`,
      },
    });
    const { model, seen } = scriptedModel({
      "https://suppliers.example.com/": [{ name: "Acme", hours: "9-5" }],
      "https://suppliers.example.com/page/2": [{ name: "Beta", hours: null }],
    });

    const result = await scrape(
      "https://suppliers.example.com/",
      Supplier,
      model,
      { fetch: api.fetch },
    );

    expect(result.records).toEqual([
      { name: "Acme", hours: "9-5" },
      { name: "Beta", hours: null },
    ]);
    expect(result.pages).toEqual([
      "https://suppliers.example.com/",
      "https://suppliers.example.com/page/2",
    ]);
    expect(seen).toEqual(result.pages);
    expect(api.calls).toEqual(result.pages);
  });

  test("sends the page's address on the first line of every prompt", async () => {
    const api = fakeFetch({
      "https://example.com/": { html: "<p>Acme: 9-5</p>" },
    });
    const { model, prompts } = scriptedModel({
      "https://example.com/": [{ name: "Acme", hours: "9-5" }],
    });

    await scrape("https://example.com/", Supplier, model, {
      fetch: api.fetch,
    });

    expect(prompts[0].split("\n")[0]).toBe("https://example.com/");
    expect(prompts[0]).toContain("Acme: 9-5");
  });

  test("stops after the pages it is allowed", async () => {
    const api = fakeFetch({
      "https://example.com/1": {
        html: `<a href="/2">Next</a>`,
      },
      "https://example.com/2": {
        html: `<a href="/3">Next</a>`,
      },
      "https://example.com/3": { html: `<p>Last</p>` },
    });
    const { model, seen } = scriptedModel({
      "https://example.com/1": [{ name: "One", hours: null }],
      "https://example.com/2": [{ name: "Two", hours: null }],
    });

    const result = await scrape("https://example.com/1", Supplier, model, {
      pages: 2,
      fetch: api.fetch,
    });

    expect(result.pages).toEqual([
      "https://example.com/1",
      "https://example.com/2",
    ]);
    expect(seen).toEqual(result.pages);
    expect(api.calls).toHaveLength(2);
  });

  test("stops at the record limit", async () => {
    const api = fakeFetch({
      "https://example.com/": {
        html: `<a href="/2" rel="next">Next</a>`,
      },
      "https://example.com/2": { html: `<p>More</p>` },
    });
    const { model } = scriptedModel({
      "https://example.com/": [
        { name: "One", hours: null },
        { name: "Two", hours: null },
      ],
    });

    const result = await scrape("https://example.com/", Supplier, model, {
      limit: 1,
      fetch: api.fetch,
    });

    expect(result.records).toEqual([{ name: "One", hours: null }]);
    expect(result.pages).toEqual(["https://example.com/"]);
  });

  test("a page with no records is an empty list, not an error", async () => {
    const api = fakeFetch({
      "https://example.com/": { html: "<p>Nothing here</p>" },
    });
    const { model } = scriptedModel({ "https://example.com/": [] });

    await expect(
      scrape("https://example.com/", Supplier, model, { fetch: api.fetch }),
    ).resolves.toEqual({ records: [], pages: ["https://example.com/"] });
  });

  test("a page that is not there is an error with its status", async () => {
    const api = fakeFetch({});
    const { model } = scriptedModel({});

    await expect(
      scrape("https://example.com/missing", Supplier, model, {
        fetch: api.fetch,
      }),
    ).rejects.toThrow(/answered 404/);
  });

  test("a record the schema rejects is an error, not a loose value", async () => {
    const api = fakeFetch({
      "https://example.com/": { html: "<p>Acme</p>" },
    });
    const { model } = scriptedModel({
      "https://example.com/": [{ name: 7, hours: null }],
    });

    await expect(
      scrape("https://example.com/", Supplier, model, { fetch: api.fetch }),
    ).rejects.toThrow();
  });
});
