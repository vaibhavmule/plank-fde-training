import { describe, expect, test, vi } from "vitest";

import { GET } from "./route";
import { query } from "@/lib/db";

vi.mock("server-only", () => ({}));
// `connection()` needs a request scope, which a unit test does not have.
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
// The real query answers the success case; the mock rejects on demand.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, query: vi.fn(actual.query) };
});

describe("health check", () => {
  test("reports the database when it answers", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      database: "ok",
      commit: expect.any(String),
    });
  }, 20_000);

  test("answers 503 when the database is unreachable", async () => {
    vi.mocked(query).mockRejectedValueOnce(new Error("connection refused"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "error",
      database: "unreachable",
      commit: expect.any(String),
    });
  });
});
