import { beforeEach, describe, expect, test, vi } from "vitest";

import { createRequest, requestSummary } from "@/lib/requests";
import { resetRequests } from "@/lib/test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

beforeEach(async () => {
  await resetRequests();
});

describe("requestSummary", () => {
  test("returns zero counts and no latest requests when the table is empty", async () => {
    expect(await requestSummary()).toEqual({
      total: 0,
      byStatus: { open: 0, in_progress: 0, closed: 0 },
      byTeam: { operations: 0, finance: 0, support: 0 },
      byPriority: { low: 0, medium: 0, high: 0 },
      latest: [],
    });
  });

  test("groups the live requests by status, team and priority", async () => {
    const first = await createRequest({
      title: "Replace laptop",
      team: "operations",
      priority: "high",
    });
    const second = await createRequest({
      title: "Approve invoice",
      team: "finance",
    });
    const third = await createRequest({
      title: "Answer customer",
      team: "support",
      priority: "low",
    });

    expect(await requestSummary()).toEqual({
      total: 3,
      byStatus: { open: 3, in_progress: 0, closed: 0 },
      byTeam: { operations: 1, finance: 1, support: 1 },
      byPriority: { low: 1, medium: 1, high: 1 },
      latest: [third, second, first],
    });
  });

  test("captures at most the ten latest requests, newest first", async () => {
    for (let index = 0; index < 12; index += 1) {
      await createRequest({ title: `Request ${index}`, team: "operations" });
    }

    const summary = await requestSummary();

    expect(summary.total).toBe(12);
    expect(summary.latest).toHaveLength(10);
    expect(summary.latest.map(({ title }) => title)).toEqual([
      "Request 11",
      "Request 10",
      "Request 9",
      "Request 8",
      "Request 7",
      "Request 6",
      "Request 5",
      "Request 4",
      "Request 3",
      "Request 2",
    ]);
  });
});
