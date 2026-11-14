import { describe, expect, test, vi } from "vitest";

import { GET } from "./route";
import { listPoliciesResponseSchema } from "./types";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

describe("policies API", () => {
  test("GET returns every policy's metadata matching its response schema", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = listPoliciesResponseSchema.parse(await response.json());
    expect(body.policies).toHaveLength(9);
    expect(body.policies.map((policy) => policy.slug)).toContain("travel");
    for (const policy of body.policies) {
      expect(policy).not.toHaveProperty("body");
    }
  });

  test("GET sorts policies by title", async () => {
    const body = listPoliciesResponseSchema.parse(await (await GET()).json());
    const titles = body.policies.map((policy) => policy.title);
    expect(titles).toEqual(
      [...titles].sort((a, b) => a.localeCompare(b, "en")),
    );
  });
});
