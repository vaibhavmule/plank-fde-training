import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  requestFiltersSchema,
  statusSchema,
  teamSchema,
  type WorkRequest,
} from "@/lib/request-model";
import { createRequest, listRequests } from "@/lib/requests";

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
  stored("Finance open, newest", "finance", "open", "12"),
  stored("Support in progress", "support", "in_progress", "11"),
  stored("Finance closed", "finance", "closed", "10"),
  stored("Operations open", "operations", "open", "09"),
  stored("Finance open, oldest", "finance", "open", "08"),
];

const titles = (requests: WorkRequest[]) => requests.map(({ title }) => title);

beforeEach(() => {
  vi.stubGlobal(
    "workbotRequests",
    seed.map((request) => ({ ...request })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("request filter query", () => {
  test.each(teamSchema.options)("accepts team %s", (team) => {
    expect(requestFiltersSchema.parse({ team })).toEqual({ team });
  });

  test.each(statusSchema.options)("accepts status %s", (status) => {
    expect(requestFiltersSchema.parse({ status })).toEqual({ status });
  });

  test("accepts both filters together and no filters at all", () => {
    const both = { team: "support", status: "in_progress" };
    expect(requestFiltersSchema.parse(both)).toEqual(both);
    expect(requestFiltersSchema.parse({})).toEqual({});
  });

  test.each([
    { team: "legal" },
    { team: "" },
    { team: "Finance" },
    { team: ["finance", "support"] },
    { status: "done" },
    { status: "" },
    { status: "in-progress" },
    { status: ["open", "closed"] },
    { team: "legal", status: "done" },
    { page: "2", sort: "asc" },
  ])("ignores unknown values instead of failing: %j", (query) => {
    const filters = requestFiltersSchema.parse(query);
    expect(filters.team).toBeUndefined();
    expect(filters.status).toBeUndefined();
    expect(Object.keys(filters)).not.toContain("page");
  });

  test("keeps a valid filter when the other value is unknown", () => {
    expect(
      requestFiltersSchema.parse({ team: "finance", status: "done" }),
    ).toEqual({ team: "finance" });
    expect(
      requestFiltersSchema.parse({ team: "legal", status: "closed" }),
    ).toEqual({ status: "closed" });
  });
});

describe("filtered request list", () => {
  test.each([
    [
      "finance",
      ["Finance open, newest", "Finance closed", "Finance open, oldest"],
    ],
    ["support", ["Support in progress"]],
    ["operations", ["Operations open"]],
  ] as const)("filters by team %s", async (team, expected) => {
    expect(titles(await listRequests({ team }))).toEqual(expected);
  });

  test.each([
    [
      "open",
      ["Finance open, newest", "Operations open", "Finance open, oldest"],
    ],
    ["in_progress", ["Support in progress"]],
    ["closed", ["Finance closed"]],
  ] as const)("filters by status %s", async (status, expected) => {
    expect(titles(await listRequests({ status }))).toEqual(expected);
  });

  test("combines team and status so both must match", async () => {
    expect(
      titles(await listRequests({ team: "finance", status: "open" })),
    ).toEqual(["Finance open, newest", "Finance open, oldest"]);
    expect(
      titles(await listRequests({ team: "finance", status: "closed" })),
    ).toEqual(["Finance closed"]);
    expect(await listRequests({ team: "support", status: "closed" })).toEqual(
      [],
    );
  });

  test("returns the full list without arguments or with cleared filters", async () => {
    const all = titles(seed);
    expect(titles(await listRequests())).toEqual(all);
    expect(titles(await listRequests({}))).toEqual(all);
    expect(
      titles(await listRequests({ team: undefined, status: undefined })),
    ).toEqual(all);
  });

  test("treats an unknown query as no filter", async () => {
    const filters = requestFiltersSchema.parse({
      team: "legal",
      status: "done",
    });
    expect(titles(await listRequests(filters))).toEqual(titles(seed));
  });

  test("keeps filtered results newest first, including new submissions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T13:00:00Z"));
    await createRequest({ title: "Support, same instant A", team: "support" });
    await createRequest({ title: "Finance, same instant", team: "finance" });
    await createRequest({ title: "Support, same instant B", team: "support" });

    const support = await listRequests({ team: "support" });
    expect(titles(support)).toEqual([
      "Support, same instant B",
      "Support, same instant A",
      "Support in progress",
    ]);
    const open = await listRequests({ status: "open" });
    expect(open.map(({ createdAt }) => createdAt)).toEqual(
      open
        .map(({ createdAt }) => createdAt)
        .sort()
        .reverse(),
    );
  });

  test("does not expose stored records through a filtered list", async () => {
    const listed = await listRequests({ team: "support" });
    listed[0].title = "Changed";
    listed.length = 0;
    expect(titles(await listRequests({ team: "support" }))).toEqual([
      "Support in progress",
    ]);
  });
});
