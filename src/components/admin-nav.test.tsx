import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { AdminNav } from "@/components/admin-nav";

const { location } = vi.hoisted(() => ({ location: { pathname: "/admin" } }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));

describe("AdminNav", () => {
  test.each([
    ["/admin", "Overview"],
    ["/requests", "Requests"],
    ["/settings", "Settings"],
  ])("marks only the current destination active: %s", (pathname, label) => {
    location.pathname = pathname;
    const html = renderToStaticMarkup(<AdminNav />);
    expect(html).toContain('aria-label="Admin navigation"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const currentLink = html.match(new RegExp(`<a [^>]*>${label}</a>`))?.[0];
    expect(currentLink).toContain(`href="${pathname}"`);
    expect(currentLink).toContain('aria-current="page"');
    for (const href of ["/admin", "/requests", "/settings"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});
