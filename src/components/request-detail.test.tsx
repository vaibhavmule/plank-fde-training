import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { RequestDetail } from "@/components/request-detail";
import type { WorkRequest } from "@/lib/request-model";

const request: WorkRequest = {
  id: "b2a73d06-648c-44e5-a61f-795d64874299",
  title: "Replace keyboard",
  details: "Keys stick.\nSpace bar is worst.",
  team: "support",
  priority: "high",
  status: "in_progress",
  createdAt: "2026-11-14T10:00:00.000Z",
};

describe("RequestDetail", () => {
  test("shows the title, details, creation time, and labelled badges", () => {
    const html = renderToStaticMarkup(<RequestDetail request={request} />);
    expect(html).toMatch(/<h1[^>]*>Replace keyboard<\/h1>/);
    expect(html).toContain("Keys stick.\nSpace bar is worst.");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain('dateTime="2026-11-14T10:00:00.000Z"');
    expect(html).toContain("2026-11-14 10:00 UTC");
    for (const [term, value] of [
      ["Team", "Support"],
      ["Priority", "High"],
      ["Status", "In progress"],
    ]) {
      expect(html).toMatch(
        new RegExp(
          `<dt[^>]*>${term}</dt><dd><span[^>]*data-slot="badge"[^>]*>${value}</span></dd>`,
        ),
      );
    }
    expect(html.match(/data-slot="badge"/g)).toHaveLength(3);
  });

  test("says so when a request has no details", () => {
    const html = renderToStaticMarkup(
      <RequestDetail request={{ ...request, details: "" }} />,
    );
    expect(html).toContain("No details provided.");
  });

  test("escapes submitted HTML in the title and details", () => {
    const html = renderToStaticMarkup(
      <RequestDetail
        request={{
          ...request,
          title: '<script>alert("t")</script>',
          details: "<img src=x onerror=alert(1)>",
        }}
      />,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });
});
