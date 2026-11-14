import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { RequestsList } from "./requests-list";
import type { WorkRequest } from "@/lib/request-model";
import { resetRequests, seedRequests } from "@/lib/test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

function stored(
  title: string,
  team: WorkRequest["team"],
  status: WorkRequest["status"],
  hour: string,
): WorkRequest {
  return {
    id: crypto.randomUUID(),
    title,
    details: "",
    team,
    priority: "medium",
    status,
    createdAt: `2026-11-14T${hour}:00:00.000Z`,
  };
}

// Stored newest first, the order createRequest maintains.
const seed = [
  stored("Audit invoices", "finance", "open", "12"),
  stored("Reset password", "support", "in_progress", "11"),
  stored("Close ledger", "finance", "closed", "10"),
  stored("Order desks", "operations", "open", "09"),
  stored("Approve budget", "finance", "open", "08"),
];
const allTitles = seed.map(({ title }) => title);

type Query = Awaited<PageProps<"/requests">["searchParams"]>;

async function render(query: Query) {
  return renderToStaticMarkup(
    await RequestsList({ searchParams: Promise.resolve(query) }),
  );
}

// Titles in the order their rows appear.
function shown(html: string) {
  return allTitles
    .filter((title) => html.includes(title))
    .sort((a, b) => html.indexOf(a) - html.indexOf(b));
}

function currentLinks(html: string) {
  return [...html.matchAll(/<a [^>]*aria-current="true"[^>]*>([^<]*)<\/a>/g)]
    .map((match) => match[1])
    .sort();
}

beforeEach(async () => {
  await resetRequests();
  await seedRequests(seed);
});

describe("RequestsList", () => {
  test("shows every request, newest first, without a query", async () => {
    const html = await render({});
    expect(shown(html)).toEqual(allTitles);
    expect(currentLinks(html)).toEqual(["All statuses", "All teams"]);
    expect(html).not.toContain("Clear filters");
  });

  test("filters by ?team= and marks it selected", async () => {
    const html = await render({ team: "finance" });
    expect(shown(html)).toEqual([
      "Audit invoices",
      "Close ledger",
      "Approve budget",
    ]);
    expect(currentLinks(html)).toEqual(["All statuses", "Finance"]);
  });

  test("filters by ?status= and marks it selected", async () => {
    const html = await render({ status: "open" });
    expect(shown(html)).toEqual([
      "Audit invoices",
      "Order desks",
      "Approve budget",
    ]);
    expect(currentLinks(html)).toEqual(["All teams", "Open"]);
  });

  test("combines ?team= and ?status=, keeping newest first", async () => {
    const html = await render({ team: "finance", status: "open" });
    expect(shown(html)).toEqual(["Audit invoices", "Approve budget"]);
    expect(currentLinks(html)).toEqual(["Finance", "Open"]);
    expect(html).toContain('href="/requests?team=support&amp;status=open"');
  });

  test.each<Query>([
    { team: "legal" },
    { status: "done" },
    { team: "", status: "" },
    { team: ["finance", "support"] },
    { team: "legal", status: "done", page: "2" },
  ])("ignores unknown query values: %j", async (query) => {
    const html = await render(query);
    expect(shown(html)).toEqual(allTitles);
    expect(currentLinks(html)).toEqual(["All statuses", "All teams"]);
    expect(html).not.toContain("Clear filters");
  });

  test("applies the valid filter when the other value is unknown", async () => {
    const html = await render({ team: "support", status: "done" });
    expect(shown(html)).toEqual(["Reset password"]);
    expect(currentLinks(html)).toEqual(["All statuses", "Support"]);
  });

  test("clearing the filters restores the full list", async () => {
    const filtered = await render({ team: "support", status: "in_progress" });
    expect(shown(filtered)).toEqual(["Reset password"]);
    const clear = filtered.match(/<a [^>]*>Clear filters<\/a>/)?.[0];
    expect(clear).toContain('href="/requests"');

    expect(shown(await render({}))).toEqual(allTitles);
  });

  test("shows a no-results state when filters match nothing", async () => {
    const html = await render({ team: "support", status: "closed" });
    expect(html).toContain("No matching requests");
    expect(html).not.toContain("No requests yet");
    expect(html).not.toContain("<table");
    expect(html).toContain("Clear filters");
    expect(currentLinks(html)).toEqual(["Closed", "Support"]);
  });

  test("keeps the first-request empty state when nothing is stored", async () => {
    await resetRequests();
    for (const query of [{}, { team: "finance", status: "open" }]) {
      const html = await render(query);
      expect(html).toContain("No requests yet");
      expect(html).not.toContain("No matching requests");
    }
  });
});
