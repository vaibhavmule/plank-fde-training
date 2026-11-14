import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { notFound } from "next/navigation";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import RequestPage from "./page";
import type { WorkRequest } from "@/lib/request-model";
import { resetRequests, seedRequests } from "@/lib/test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));

const request: WorkRequest = {
  id: "b2a73d06-648c-44e5-a61f-795d64874299",
  title: "Replace keyboard",
  details: "Keys stick.\nSpace bar is worst.",
  team: "support",
  priority: "high",
  status: "in_progress",
  createdAt: "2026-11-14T10:00:00.000Z",
};

// Streams the page so the pending params promise resolves, like a real request.
async function render(id: string) {
  const stream = await renderToReadableStream(
    <RequestPage
      params={Promise.resolve({ id })}
      searchParams={Promise.resolve({})}
    />,
    { onError() {} },
  );
  await stream.allReady;
  return await new Response(stream).text();
}

beforeEach(async () => {
  await resetRequests();
  await seedRequests([request]);
});
afterEach(() => {
  vi.mocked(notFound).mockClear();
});

describe("request detail page", () => {
  test("renders the shell and a loading state while the ID streams", () => {
    const html = renderToStaticMarkup(
      <RequestPage
        params={new Promise(() => {})}
        searchParams={Promise.resolve({})}
      />,
    );
    expect(html).toMatch(/<a[^>]*href="\/requests"[^>]*>Back to requests<\/a>/);
    expect(html).toContain("Loading request…");
  });

  test("shows the stored request and a link back to the list", async () => {
    const html = await render(request.id);
    expect(html).toMatch(/<h1[^>]*>Replace keyboard<\/h1>/);
    expect(html).toContain("Keys stick.");
    for (const value of ["Support", "High", "In progress", "Details"]) {
      expect(html).toContain(value);
    }
    expect(html).toContain('dateTime="2026-11-14T10:00:00.000Z"');
    expect(html).toMatch(/<a[^>]*href="\/requests"[^>]*>Back to requests<\/a>/);
    expect(notFound).not.toHaveBeenCalled();
  });

  test("returns not found instead of rendering an unknown ID", async () => {
    const html = await render("00000000-0000-0000-0000-000000000000");
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(html).not.toContain('id="request-details-heading"');
    expect(html).not.toContain("Replace keyboard");
  });

  test("escapes submitted markup when the page renders it", async () => {
    await resetRequests();
    await seedRequests([
      {
        ...request,
        title: '<script>alert("t")</script>',
        details: "<img src=x onerror=alert(1)>",
      },
    ]);
    const html = await render(request.id);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain('<script>alert("t")</script>');
    expect(html).not.toContain("<img");
  });
});
