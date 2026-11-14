import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  NoMatchingRequests,
  RequestFilterLinks,
  requestsHref,
} from "@/components/request-filter-links";
import type { RequestFilters } from "@/lib/request-model";

function render(filters: RequestFilters) {
  return renderToStaticMarkup(<RequestFilterLinks filters={filters} />);
}

function link(html: string, text: string) {
  const match = html.match(new RegExp(`<a [^>]*>${text}</a>`))?.[0];
  if (!match) throw new Error(`No link named ${text}`);
  return match;
}

function currentLinks(html: string) {
  return [...html.matchAll(/<a [^>]*aria-current="true"[^>]*>([^<]*)<\/a>/g)]
    .map((match) => match[1])
    .sort();
}

describe("requestsHref", () => {
  test.each([
    [{}, "/requests"],
    [{ team: "finance" }, "/requests?team=finance"],
    [{ status: "in_progress" }, "/requests?status=in_progress"],
    [
      { team: "support", status: "closed" },
      "/requests?team=support&status=closed",
    ],
    [{ team: undefined, status: undefined }, "/requests"],
  ] as const)("builds the address for %j", (filters, href) => {
    expect(requestsHref(filters)).toBe(href);
  });
});

describe("RequestFilterLinks", () => {
  test("renders a labelled row of links for each filter", () => {
    const html = render({});
    expect(html).toContain('<nav aria-label="Filter requests"');
    expect(html.match(/<ul /g)).toHaveLength(2);
    for (const name of ["team", "status"]) {
      expect(html).toContain(`id="request-filter-${name}"`);
      expect(html).toContain(`aria-labelledby="request-filter-${name}"`);
    }
    for (const [text, href] of [
      ["All teams", "/requests"],
      ["Operations", "/requests?team=operations"],
      ["Finance", "/requests?team=finance"],
      ["Support", "/requests?team=support"],
      ["All statuses", "/requests"],
      ["Open", "/requests?status=open"],
      ["In progress", "/requests?status=in_progress"],
      ["Closed", "/requests?status=closed"],
    ]) {
      expect(link(html, text)).toContain(`href="${href}"`);
    }
    expect(html).not.toContain("<button");
  });

  test("marks the unfiltered options selected and offers no clear control", () => {
    const html = render({});
    expect(currentLinks(html)).toEqual(["All statuses", "All teams"]);
    expect(html).not.toContain("Clear filters");
  });

  test("marks exactly one selected option per row, with a distinct style", () => {
    const html = render({ team: "finance", status: "in_progress" });
    expect(currentLinks(html)).toEqual(["Finance", "In progress"]);
    expect(link(html, "Finance")).toContain("bg-secondary");
    expect(link(html, "Support")).not.toContain("bg-secondary");
    expect(link(html, "All teams")).not.toContain("aria-current");
  });

  test("selecting a team keeps the selected status", () => {
    const html = render({ status: "closed" });
    expect(link(html, "Finance")).toContain(
      'href="/requests?team=finance&amp;status=closed"',
    );
    expect(link(html, "All teams")).toContain('href="/requests?status=closed"');
  });

  test("selecting a status keeps the selected team", () => {
    const html = render({ team: "support" });
    expect(link(html, "Open")).toContain(
      'href="/requests?team=support&amp;status=open"',
    );
    expect(link(html, "All statuses")).toContain(
      'href="/requests?team=support"',
    );
  });

  test("changing one filter replaces only that filter", () => {
    const html = render({ team: "finance", status: "open" });
    expect(link(html, "Support")).toContain(
      'href="/requests?team=support&amp;status=open"',
    );
    expect(link(html, "Closed")).toContain(
      'href="/requests?team=finance&amp;status=closed"',
    );
  });

  test.each([
    { team: "finance" },
    { status: "open" },
    { team: "finance", status: "open" },
  ] as const)(
    "offers a clear control that drops every filter: %j",
    (filters) => {
      expect(link(render(filters), "Clear filters")).toContain(
        'href="/requests"',
      );
    },
  );
});

describe("NoMatchingRequests", () => {
  test("explains the empty result and links back to the full list", () => {
    const html = renderToStaticMarkup(<NoMatchingRequests />);
    expect(html).toContain("No matching requests");
    expect(html).not.toContain("No requests yet");
    expect(link(html, "show all requests")).toContain('href="/requests"');
  });
});
