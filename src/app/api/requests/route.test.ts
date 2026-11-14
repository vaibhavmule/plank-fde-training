import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { GET, POST } from "./route";
import {
  createRequestResponseSchema,
  invalidRequestResponseSchema,
  listRequestsResponseSchema,
} from "./types";
import { createRequest } from "@/lib/requests";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

beforeEach(() => {
  vi.stubGlobal("workbotRequests", []);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function post(input: unknown) {
  return POST(
    new Request("http://localhost/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

const input = {
  title: "  New keyboard  ",
  details: "  Keys stick  ",
  team: "support",
};

describe("requests API", () => {
  test("GET returns an empty list matching its response schema without caching", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(listRequestsResponseSchema.parse(await response.json())).toEqual({
      requests: [],
    });
  });

  test("POST trims input, applies defaults, ignores submitted metadata, and returns 201", async () => {
    const response = await post({ ...input, id: "forged", status: "closed" });
    expect(response.status).toBe(201);
    const body = createRequestResponseSchema.parse(await response.json());
    expect(body.request).toMatchObject({
      title: "New keyboard",
      details: "Keys stick",
      team: "support",
      priority: "medium",
      status: "open",
    });
    expect(body.request.id).not.toBe("forged");
    const listed = await GET();
    expect(listed.status).toBe(200);
    expect(
      listRequestsResponseSchema.parse(await listed.json()).requests,
    ).toEqual([body.request]);
  });

  test("GET shares storage with the form's data layer and lists newest first", async () => {
    vi.useFakeTimers();
    const earlier = await createRequest({ title: "Earlier", team: "finance" });
    const created = await post({
      title: "Latest",
      team: "operations",
      priority: "high",
    });
    expect(created.status).toBe(201);
    const latest = createRequestResponseSchema.parse(
      await created.json(),
    ).request;
    const response = await GET();
    expect(response.status).toBe(200);
    expect(
      listRequestsResponseSchema.parse(await response.json()).requests,
    ).toEqual([latest, earlier]);
  });

  test.each([
    null,
    [],
    "text",
    {},
    { ...input, title: "  " },
    { ...input, title: "x".repeat(121) },
    { ...input, details: "x".repeat(5001) },
    { ...input, team: "legal" },
    { ...input, priority: "urgent" },
  ])(
    "POST rejects invalid input without modifying storage: %j",
    async (invalid) => {
      const response = await post(invalid);
      expect(response.status).toBe(400);
      const body = invalidRequestResponseSchema.parse(await response.json());
      expect(body.issues.length).toBeGreaterThan(0);
      const listed = await GET();
      expect(listed.status).toBe(200);
      expect(
        listRequestsResponseSchema.parse(await listed.json()).requests,
      ).toEqual([]);
    },
  );

  test.each(["{", ""])(
    'POST rejects malformed or empty JSON: "%s"',
    async (body) => {
      const response = await POST(
        new Request("http://localhost/api/requests", { method: "POST", body }),
      );
      expect(response.status).toBe(400);
      expect(
        invalidRequestResponseSchema.parse(await response.json()).issues,
      ).toEqual([{ path: [], message: "Request body must be valid JSON." }]);
    },
  );
});
