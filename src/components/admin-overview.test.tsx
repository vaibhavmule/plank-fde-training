import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AdminOverview } from "@/components/admin-overview";
import type { WorkRequest } from "@/lib/request-model";

function record(
  index: number,
  status: WorkRequest["status"] = "open",
): WorkRequest {
  return {
    id: `request-${index}`,
    title: `Submission ${index}`,
    details: "",
    team: "operations",
    priority: "medium",
    status,
    createdAt: new Date(Date.UTC(2026, 10, 14, 12, index)).toISOString(),
  };
}

function cards(html: string) {
  return [...html.matchAll(/<h3>([^<]+)<\/h3>[\s\S]*?<p[^>]*>(\d+)<\/p>/g)].map(
    (match) => [match[1], Number(match[2])],
  );
}

describe("AdminOverview", () => {
  test("shows all statuses with zero counts and an empty state", () => {
    const html = renderToStaticMarkup(<AdminOverview requests={[]} />);
    expect(cards(html)).toEqual([
      ["Open", 0],
      ["In progress", 0],
      ["Closed", 0],
    ]);
    expect(html).toContain("No requests yet");
    expect(html).toContain("Latest requests");
  });

  test("counts the entire list while displaying only the five latest records", () => {
    const requests = [
      record(7),
      record(6, "closed"),
      record(5, "in_progress"),
      record(4),
      record(3, "closed"),
      record(2, "in_progress"),
      record(1),
    ];
    const html = renderToStaticMarkup(<AdminOverview requests={requests} />);
    expect(cards(html)).toEqual([
      ["Open", 3],
      ["In progress", 2],
      ["Closed", 2],
    ]);
    for (const index of [7, 6, 5, 4, 3])
      expect(html).toContain(`Submission ${index}`);
    for (const index of [2, 1])
      expect(html).not.toContain(`Submission ${index}`);
    expect(html.indexOf("Submission 7")).toBeLessThan(
      html.indexOf("Submission 6"),
    );
    expect(html.match(/data-slot="table-row"/g)).toHaveLength(6);
  });

  test("shows every record when there are fewer than five and retains zero counts", () => {
    const html = renderToStaticMarkup(
      <AdminOverview requests={[record(2), record(1)]} />,
    );
    expect(cards(html)).toEqual([
      ["Open", 2],
      ["In progress", 0],
      ["Closed", 0],
    ]);
    expect(html).toContain("Submission 2");
    expect(html).toContain("Submission 1");
    expect(html).not.toContain("No requests yet");
  });
});
