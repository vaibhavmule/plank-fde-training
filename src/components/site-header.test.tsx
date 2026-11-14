import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { SiteHeader } from "@/components/site-header";

describe("SiteHeader", () => {
  const html = renderToStaticMarkup(<SiteHeader />);

  test("shows the app name", () => {
    expect(html).toContain("WorkBot");
  });

  test("links to home, requests, admin, and settings", () => {
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/settings"');
    expect(html).toContain('href="/requests"');
    expect(html).toContain('href="/admin"');
  });
});
