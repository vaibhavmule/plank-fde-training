import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/app/requests/[id]/actions", () => ({
  setStatus: vi.fn(),
}));

import { RequestStatusForm } from "@/components/request-status-form";
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

function buttonLabels(html: string) {
  return [...html.matchAll(/data-slot="button"[^>]*>([^<]+)<\/button>/g)].map(
    (match) => match[1],
  );
}

describe("RequestStatusForm", () => {
  test("offers one button for each other status and none for the current one", () => {
    const html = renderToStaticMarkup(<RequestStatusForm request={request} />);
    expect(buttonLabels(html)).toEqual(["In progress", "Closed"]);
    expect(html).not.toContain(">Open</button>");
  });

  test.each([
    ["in_progress", ["Open", "Closed"]],
    ["closed", ["Open", "In progress"]],
  ] as const)("from %s it offers %j", (status, expected) => {
    const html = renderToStaticMarkup(
      <RequestStatusForm request={{ ...request, status }} />,
    );
    expect(buttonLabels(html)).toEqual(expected);
  });

  test("submits every control through the status action", () => {
    const html = renderToStaticMarkup(<RequestStatusForm request={request} />);
    expect(html).toContain("<form");
    expect(html.match(/type="submit"/g)).toHaveLength(2);
    expect(html).toContain('id="request-status-heading"');
    expect(html).toContain("Change status");
  });
});
