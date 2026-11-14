import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { PolicyArticle } from "@/components/policy-article";
import type { Policy } from "@/lib/policies";

const policy: Policy = {
  slug: "example-policy",
  title: "Example Policy",
  team: "finance",
  updatedAt: "2026-01-31",
  summary: "A short summary.",
  body: [
    "## Scope",
    "",
    "Some **bold** text with a [link](/policies/time-off).",
    "",
    "- First item",
    "- Second item",
    "",
    "| Name | Value |",
    "| ---- | ----- |",
    "| One  | 1     |",
    "",
    '<script>alert("xss")</script>',
  ].join("\n"),
};

describe("PolicyArticle", () => {
  test("shows the title, summary, team and updated date", () => {
    const html = renderToStaticMarkup(<PolicyArticle policy={policy} />);

    expect(html).toContain(">Example Policy</h1>");
    expect(html).toContain("A short summary.");
    expect(html).toContain("finance");
    expect(html).toContain('dateTime="2026-01-31"');
    expect(html).toContain("January 31, 2026");
  });

  test("renders Markdown headings, lists, links and tables", () => {
    const html = renderToStaticMarkup(<PolicyArticle policy={policy} />);

    expect(html).toContain(">Scope</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="/policies/time-off"');
    expect(html).toContain(">First item</li>");
    expect(html).toContain("<table ");
    expect(html).toContain(">Name</th>");
  });

  test("escapes raw HTML instead of rendering it", () => {
    const html = renderToStaticMarkup(<PolicyArticle policy={policy} />);

    expect(html).not.toContain("<script>");
    expect(html).not.toContain('alert("xss")');
  });
});
