import { describe, expect, test, vi } from "vitest";

import {
  getPolicy,
  listPolicies,
  loadPolicies,
  loadPolicy,
} from "@/lib/policies";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

describe("policy list", () => {
  test("lists the policies section with metadata only, sorted by title", async () => {
    const policies = await listPolicies();

    expect(policies.length).toBeGreaterThanOrEqual(8);
    expect(policies.map((policy) => policy.title)).toEqual(
      [...policies.map((policy) => policy.title)].sort((a, b) =>
        a.localeCompare(b, "en"),
      ),
    );

    for (const policy of policies) {
      expect(Object.keys(policy).sort()).toEqual([
        "slug",
        "summary",
        "team",
        "title",
        "updatedAt",
      ]);
      expect(policy).not.toHaveProperty("body");
    }
  });

  test("shows only the policies section, not the rest of the corpus", async () => {
    const slugs = (await listPolicies()).map((policy) => policy.slug);

    expect(slugs).toContain("refunds");
    expect(slugs).not.toContain("request-intake");
    expect(slugs).not.toContain("refund-timings");
  });
});

describe("one policy", () => {
  test("reads a policy by slug with its Markdown body", async () => {
    const policy = await getPolicy("acceptable-use");

    expect(policy).toMatchObject({
      slug: "acceptable-use",
      title: "Acceptable Use Policy",
      team: "operations",
      updatedAt: "2026-09-02",
    });
    expect(policy?.body).toContain("## Purpose");
  });

  test("loads the refunds policy without the Next cache", async () => {
    const policy = await loadPolicy("refunds");

    expect(policy).toMatchObject({
      slug: "refunds",
      title: "Refund Policy",
      team: "support",
    });
    expect(policy?.body).toContain("$200");
  });

  test("loads every policy with its body", async () => {
    const policies = await loadPolicies();

    expect(policies.length).toBeGreaterThanOrEqual(8);
    expect(policies.every((policy) => policy.body.length > 0)).toBe(true);
  });

  test("returns null for an unknown policy", async () => {
    expect(await getPolicy("does-not-exist")).toBeNull();
  });

  test("returns a document in another section as no policy", async () => {
    // `request-intake` is a real document, but in the manuals section.
    expect(await getPolicy("request-intake")).toBeNull();
  });

  test.each([
    "../package",
    "../content/knowledge/policies/acceptable-use",
    "..",
    "foo/bar",
    "Acceptable-Use",
    "acceptable-use.md",
    "acceptable_use",
    "",
    "a".repeat(81),
    "acceptable-use ",
  ])("rejects the unsafe slug %j without reading a file", async (slug) => {
    expect(await getPolicy(slug)).toBeNull();
  });

  test("rejects non-string slugs", async () => {
    expect(await getPolicy(null)).toBeNull();
    expect(await getPolicy(undefined)).toBeNull();
    expect(await getPolicy(42)).toBeNull();
    expect(await getPolicy(["acceptable-use"])).toBeNull();
  });
});
