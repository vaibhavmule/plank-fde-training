import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { PolicyList } from "@/components/policy-list";
import type { PolicyMeta } from "@/lib/policies";

const policies: PolicyMeta[] = [
  {
    slug: "acceptable-use",
    title: "Acceptable Use Policy",
    team: "operations",
    updatedAt: "2026-09-02",
    summary: "Rules for using WorkBot systems.",
  },
  {
    slug: "time-off",
    title: "Time Off Policy",
    team: "support",
    updatedAt: "2026-05-15",
    summary: "How to request holiday.",
  },
];

describe("PolicyList", () => {
  test("links each title and shows the summary, team and updated date", () => {
    const html = renderToStaticMarkup(<PolicyList policies={policies} />);

    expect(html).toContain('href="/policies/acceptable-use"');
    expect(html).toContain('href="/policies/time-off"');
    expect(html).toContain("Acceptable Use Policy");
    expect(html).toContain("Rules for using WorkBot systems.");
    expect(html).toContain("operations");
    expect(html).toContain('dateTime="2026-09-02"');
    expect(html).toContain("September 2, 2026");
    expect(html.indexOf("Acceptable Use Policy")).toBeLessThan(
      html.indexOf("Time Off Policy"),
    );
  });

  test("renders an empty state when there are no policies", () => {
    const html = renderToStaticMarkup(<PolicyList policies={[]} />);
    expect(html).toContain("No policies yet.");
    expect(html).not.toContain("<ul>");
  });
});
