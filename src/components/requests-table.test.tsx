import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { RequestsTable } from "@/components/requests-table";
import type { WorkRequest } from "@/lib/request-model";

const request: WorkRequest = {
  id: "b2a73d06-648c-44e5-a61f-795d64874299",
  title: "Replace keyboard",
  details: "Keys stick",
  team: "support",
  priority: "high",
  status: "open",
  createdAt: "2026-11-14T10:00:00.000Z",
};

describe("RequestsTable", () => {
  test("shows an empty state instead of an empty table", () => {
    const html = renderToStaticMarkup(<RequestsTable requests={[]} />);
    expect(html).toContain("No requests yet");
    expect(html).not.toContain("<table");
  });

  test("renders summary columns, readable badges, and creation time", () => {
    const html = renderToStaticMarkup(<RequestsTable requests={[request]} />);
    for (const text of [
      "Title",
      "Team",
      "Priority",
      "Status",
      "Created",
      request.title,
      "Support",
      "High",
      "Open",
      "2026-11-14 10:00",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('dateTime="2026-11-14T10:00:00.000Z"');
    expect(html.match(/data-slot="badge"/g)).toHaveLength(2);
  });

  test("preserves newest-first input order and renders other enum values", () => {
    const html = renderToStaticMarkup(
      <RequestsTable
        requests={[
          {
            ...request,
            id: "new",
            title: "Latest",
            team: "finance",
            priority: "medium",
            status: "in_progress",
          },
          {
            ...request,
            id: "old",
            title: "Earlier",
            team: "operations",
            priority: "low",
            status: "closed",
          },
        ]}
      />,
    );
    expect(html.indexOf("Latest")).toBeLessThan(html.indexOf("Earlier"));
    for (const label of [
      "Finance",
      "Operations",
      "Medium",
      "Low",
      "In progress",
      "Closed",
    ]) {
      expect(html).toContain(label);
    }
  });

  test("escapes user titles instead of rendering submitted HTML", () => {
    const html = renderToStaticMarkup(
      <RequestsTable
        requests={[{ ...request, title: '<script>alert("x")</script>' }]}
      />,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
