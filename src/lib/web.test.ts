import { describe, expect, test } from "vitest";

import {
  MAX_PAGE_BYTES,
  MAX_PAGE_CHARACTERS,
  readPage,
  searchWeb,
} from "@/lib/web";

type Call = { url: URL; init?: RequestInit };

function fakeFetch(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
) {
  const calls: Call[] = [];

  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof globalThis.fetch;

  return { fetch, calls };
}

const page = "<html><body><p>Hello</p></body></html>";

describe("readPage refusals", () => {
  test.each([
    "http://127.0.0.1/",
    "http://10.1.2.3/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
    "http://localhost:3000/",
    "http://workbot.internal/",
    "ftp://example.com/file",
    "file:///etc/passwd",
  ])("refuses %s before fetching", async (url) => {
    const api = fakeFetch(() => new Response(page));

    await expect(readPage(url, { fetch: api.fetch })).rejects.toThrow(
      /private|Only http and https/i,
    );
    expect(api.calls).toHaveLength(0);
  });

  test("refuses text that is not a URL", async () => {
    const api = fakeFetch(() => new Response(page));

    await expect(readPage("example.com", { fetch: api.fetch })).rejects.toThrow(
      /not a valid URL/i,
    );
    expect(api.calls).toHaveLength(0);
  });
});

describe("readPage", () => {
  test("fetches one public page without following redirects itself", async () => {
    const api = fakeFetch(() => new Response(page));

    await expect(
      readPage("https://example.com/policy?q=1", { fetch: api.fetch }),
    ).resolves.toBe("Hello");

    const [{ url, init }] = api.calls;
    expect(url.toString()).toBe("https://example.com/policy?q=1");
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("accept")).toContain("text/html");
  });

  test("checks every redirect hop and refuses a private destination", async () => {
    const api = fakeFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    );

    await expect(
      readPage("https://example.com/", { fetch: api.fetch }),
    ).rejects.toThrow(/private address/i);
    expect(api.calls).toHaveLength(1);
  });

  test("follows a public redirect", async () => {
    const api = fakeFetch((url) =>
      url.pathname === "/old"
        ? new Response(null, { status: 301, headers: { location: "/new" } })
        : new Response("<p>Moved here</p>"),
    );

    await expect(
      readPage("https://example.com/old", { fetch: api.fetch }),
    ).resolves.toBe("Moved here");
    expect(api.calls.map(({ url }) => url.pathname)).toEqual(["/old", "/new"]);
  });

  test("gives up after five redirects", async () => {
    const api = fakeFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com/again" },
        }),
    );

    await expect(
      readPage("https://example.com/", { fetch: api.fetch }),
    ).rejects.toThrow(/more than 5 times/i);
    expect(api.calls).toHaveLength(6);
  });

  test("reports an unsuccessful response", async () => {
    const api = fakeFetch(() => new Response("missing", { status: 404 }));

    await expect(
      readPage("https://example.com/", { fetch: api.fetch }),
    ).rejects.toThrow(/answered 404/i);
  });

  test("reads no more than 512 KB of a body", async () => {
    const body = " ".repeat(MAX_PAGE_BYTES) + "<p>REACHED</p>";
    const api = fakeFetch(() => new Response(body));

    const text = await readPage("https://example.com/", { fetch: api.fetch });

    expect(text).not.toContain("REACHED");
    expect(text).toHaveLength(0);
  });

  test("caps the extracted text at 8,000 characters", async () => {
    const api = fakeFetch(() => new Response(`<p>${"a".repeat(20_000)}</p>`));

    const text = await readPage("https://example.com/", { fetch: api.fetch });

    expect(text).toHaveLength(MAX_PAGE_CHARACTERS);
  });

  test("drops scripts, styles and tags but keeps block boundaries", async () => {
    const api = fakeFetch(
      () =>
        new Response(`<html><head>
          <style>.hidden { color: red }</style>
          <script>throw new Error("no")</script>
        </head><body>
          <h1>Refunds &amp; credits</h1>
          <p>First line</p>
          <p>Second&nbsp;line</p>
          <ul><li>One</li><li>Two</li></ul>
          <!-- a comment -->
        </body></html>`),
    );

    const text = await readPage("https://example.com/", { fetch: api.fetch });

    expect(text).toContain("Refunds & credits");
    expect(text).toContain("First line\n\nSecond line");
    expect(text).toContain("One\n\nTwo");
    expect(text).not.toContain("hidden");
    expect(text).not.toContain("throw new Error");
    expect(text).not.toContain("a comment");
  });
});

describe("searchWeb", () => {
  test("builds the Brave request and maps the results", async () => {
    const api = fakeFetch(() =>
      Response.json({
        web: {
          results: [
            {
              title: "Refunds",
              url: "https://example.com/refunds",
              description: "The refund limit is $200.",
            },
            { title: "No URL" },
          ],
        },
      }),
    );

    const results = await searchWeb("refund policy", {
      apiKey: "brave-key",
      count: 3,
      fetch: api.fetch,
    });

    expect(results).toEqual([
      {
        title: "Refunds",
        url: "https://example.com/refunds",
        description: "The refund limit is $200.",
      },
    ]);

    const [{ url, init }] = api.calls;
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.search.brave.com/res/v1/web/search",
    );
    expect(url.searchParams.get("q")).toBe("refund policy");
    expect(url.searchParams.get("count")).toBe("3");

    const headers = new Headers(init?.headers);
    expect(headers.get("x-subscription-token")).toBe("brave-key");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("accept-encoding")).toBe("gzip");
  });

  test.each([
    [0, "1"],
    [99, "20"],
  ])("clamps a count of %d to %s", async (count, expected) => {
    const api = fakeFetch(() => Response.json({ web: { results: [] } }));

    await searchWeb("policy", {
      apiKey: "brave-key",
      count,
      fetch: api.fetch,
    });

    expect(api.calls[0].url.searchParams.get("count")).toBe(expected);
  });

  test("returns an empty list when there are no results", async () => {
    const api = fakeFetch(() => Response.json({}));

    await expect(
      searchWeb("nothing", { apiKey: "brave-key", fetch: api.fetch }),
    ).resolves.toEqual([]);
  });

  test("rejects an empty query without calling the API", async () => {
    const api = fakeFetch(() => Response.json({}));

    await expect(
      searchWeb("   ", { apiKey: "brave-key", fetch: api.fetch }),
    ).rejects.toThrow(/empty/i);
    expect(api.calls).toHaveLength(0);
  });

  test("rejects a missing key", async () => {
    const api = fakeFetch(() => Response.json({}));

    await expect(
      searchWeb("policy", { apiKey: "", fetch: api.fetch }),
    ).rejects.toThrow(/not configured/i);
    expect(api.calls).toHaveLength(0);
  });

  test("reports a failed search", async () => {
    const api = fakeFetch(() => new Response("nope", { status: 429 }));

    await expect(
      searchWeb("policy", { apiKey: "brave-key", fetch: api.fetch }),
    ).rejects.toThrow(/answered 429/i);
  });
});
