import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { requestInputSchema, workRequestSchema } from "@/lib/request-model";
import { createRequest, getRequest, listRequests } from "@/lib/requests";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

const input = { title: "Replace laptop", team: "operations" };

beforeEach(() => {
  vi.stubGlobal("workbotRequests", []);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("request input", () => {
  test("trims title and details and preserves explicit priority", () => {
    expect(
      requestInputSchema.parse({
        ...input,
        title: "  Replace laptop  ",
        details: "  Broken keyboard\n",
        priority: "high",
      }),
    ).toEqual({
      ...input,
      details: "Broken keyboard",
      priority: "high",
    });
  });

  test("defaults omitted details to empty and priority to medium", () => {
    expect(requestInputSchema.parse(input)).toEqual({
      ...input,
      details: "",
      priority: "medium",
    });
  });

  test("accepts the maximum title and details lengths", () => {
    expect(
      requestInputSchema.safeParse({
        ...input,
        title: "a".repeat(120),
        details: "b".repeat(5000),
      }).success,
    ).toBe(true);
  });

  test.each([
    { title: "" },
    { title: " \n " },
    { title: "a".repeat(121) },
    { title: undefined },
    { details: "b".repeat(5001) },
    { details: null },
    { team: "legal" },
    { team: undefined },
    { priority: "urgent" },
    { priority: "" },
    { priority: null },
  ])(
    "rejects invalid fields without changing storage: %j",
    async (override) => {
      await createRequest(input);
      await expect(createRequest({ ...input, ...override })).rejects.toThrow();
      expect(await listRequests()).toHaveLength(1);
    },
  );
});

describe("request storage", () => {
  test("starts empty", async () => {
    expect(await listRequests()).toEqual([]);
  });

  test("creates valid records with unique IDs, defaults, and server-owned metadata", async () => {
    const first = await createRequest({
      ...input,
      status: "closed",
      id: "fake",
    });
    const second = await createRequest(input);
    expect(workRequestSchema.parse(first)).toEqual(first);
    expect(first.status).toBe("open");
    expect(first.priority).toBe("medium");
    expect(second.id).not.toBe(first.id);
  });

  test("lists newest first, including creations with the same timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
    const first = await createRequest(input);
    const second = await createRequest({ ...input, title: "Second" });
    expect(await listRequests()).toEqual([second, first]);
  });

  test("retains records across module reloads through globalThis", async () => {
    const request = await createRequest(input);
    vi.resetModules();
    const reloaded = await import("@/lib/requests");
    expect(await reloaded.listRequests()).toEqual([request]);
  });

  test("does not expose stored records to caller mutation", async () => {
    const created = await createRequest(input);
    created.title = "Changed";
    const listed = await listRequests();
    listed[0].title = "Also changed";
    listed.length = 0;
    expect(await listRequests()).toEqual([
      expect.objectContaining({ title: input.title }),
    ]);
  });

  test("gets the record with a matching ID among several", async () => {
    const first = await createRequest(input);
    const second = await createRequest({ ...input, title: "Second" });
    expect(await getRequest(first.id)).toEqual(first);
    expect(await getRequest(second.id)).toEqual(second);
  });

  test("returns undefined for a missing ID, including on an empty store", async () => {
    expect(await getRequest("missing")).toBeUndefined();
    const created = await createRequest(input);
    expect(await getRequest(created.id.toUpperCase())).toBeUndefined();
    expect(await getRequest("")).toBeUndefined();
  });

  test("does not expose a fetched record to caller mutation", async () => {
    const created = await createRequest(input);
    const fetched = await getRequest(created.id);
    fetched!.title = "Changed";
    fetched!.status = "closed";
    expect(await getRequest(created.id)).toEqual(created);
    expect(await listRequests()).toEqual([created]);
  });
});
