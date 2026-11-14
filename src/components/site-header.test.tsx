import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { SiteHeader } from "@/components/site-header";

describe("SiteHeader", () => {
  const html = renderToStaticMarkup(<SiteHeader />);

  test("shows the app name", () => {
    expect(html).toContain("WorkBot");
  });

  test("links to the home and settings pages", () => {
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/settings"');
  });
});
