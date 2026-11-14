import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { setStatus } from "./actions";
import { createRequest, getRequest, listRequests } from "@/lib/requests";
import { resetRequests } from "@/lib/test-fixtures";

const refresh = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  io: vi.fn(async () => {}),
  refresh: () => refresh(),
}));

beforeEach(async () => {
  await resetRequests();
  refresh.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

const input = {
  title: "Replace keyboard",
  details: "Keys stick",
  team: "support",
  priority: "high",
} as const;

describe("setStatus", () => {
  test("updates the request, preserves its other fields, and refreshes", async () => {
    const created = await createRequest(input);

    await setStatus(created.id, "closed");

    expect(await getRequest(created.id)).toEqual({
      ...created,
      status: "closed",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  test("does nothing and does not refresh for a missing request", async () => {
    await createRequest(input);

    await setStatus("3f1c9a34-9d5e-4b1d-8a58-1a2b3c4d5e6f", "closed");

    expect(await listRequests()).toEqual([
      expect.objectContaining({ title: input.title, status: "open" }),
    ]);
    expect(refresh).not.toHaveBeenCalled();
  });

  test("does nothing and does not refresh for an invalid status", async () => {
    const created = await createRequest(input);

    await setStatus(created.id, "cancelled");

    expect(await getRequest(created.id)).toEqual(created);
    expect(refresh).not.toHaveBeenCalled();
  });

  test("does nothing and does not refresh for an invalid ID", async () => {
    const created = await createRequest(input);

    await setStatus("not-a-uuid", "closed");

    expect(await getRequest(created.id)).toEqual(created);
    expect(refresh).not.toHaveBeenCalled();
  });
});
