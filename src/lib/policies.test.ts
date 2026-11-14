import { describe, expect, test, vi } from "vitest";

import {
  getPolicy,
  isPolicySlug,
  listPolicies,
  parsePolicy,
  policyMetaSchema,
} from "@/lib/policies";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

const validSource = `---
title: "Example Policy"
team: operations
updatedAt: 2026-01-31
summary: "A short summary."
---

## Section

Body text with a [link](/policies/time-off).
`;

describe("policy metadata", () => {
  test("accepts valid front matter and trims text fields", () => {
    expect(
      policyMetaSchema.parse({
        title: "  Example Policy  ",
        team: " finance ",
        updatedAt: "2026-01-31",
        summary: "  A short summary.  ",
      }),
    ).toEqual({
      title: "Example Policy",
      team: "finance",
      updatedAt: "2026-01-31",
      summary: "A short summary.",
    });
  });

  test.each([
    { title: "" },
    { title: "   " },
    { title: "a".repeat(121) },
    { team: "" },
    { team: "a".repeat(41) },
    { updatedAt: "31-01-2026" },
    { updatedAt: "2026-13-01" },
    { summary: "" },
    { summary: "a".repeat(241) },
    { title: undefined },
    { extra: "not allowed" },
  ])("rejects invalid metadata: %j", (override) => {
    expect(
      policyMetaSchema.safeParse({
        title: "Example Policy",
        team: "operations",
        updatedAt: "2026-01-31",
        summary: "A short summary.",
        ...override,
      }).success,
    ).toBe(false);
  });
});

describe("parsePolicy", () => {
  test("returns the slug, metadata and body without front matter", () => {
    expect(parsePolicy("example-policy", validSource)).toEqual({
      slug: "example-policy",
      title: "Example Policy",
      team: "operations",
      updatedAt: "2026-01-31",
      summary: "A short summary.",
      body: "## Section\n\nBody text with a [link](/policies/time-off).",
    });
  });

  test.each([
    ["missing front matter", "Just a body."],
    ["unterminated front matter", "---\ntitle: Example\n\nBody."],
    [
      "empty body",
      "---\ntitle: Example\nteam: operations\nupdatedAt: 2026-01-31\nsummary: Summary.\n---\n\n   ",
    ],
    [
      "missing field",
      "---\ntitle: Example\nteam: operations\nsummary: Summary.\n---\n\nBody.",
    ],
    [
      "duplicate field",
      "---\ntitle: One\ntitle: Two\nteam: operations\nupdatedAt: 2026-01-31\nsummary: Summary.\n---\n\nBody.",
    ],
    [
      "unreadable line",
      "---\ntitle Example\nteam: operations\nupdatedAt: 2026-01-31\nsummary: Summary.\n---\n\nBody.",
    ],
    [
      "invalid date",
      "---\ntitle: Example\nteam: operations\nupdatedAt: 31-01-2026\nsummary: Summary.\n---\n\nBody.",
    ],
    [
      "badly quoted value",
      '---\ntitle: "a"b"\nteam: operations\nupdatedAt: 2026-01-31\nsummary: Summary.\n---\n\nBody.',
    ],
  ])("rejects %s", (_label, source) => {
    expect(() => parsePolicy("example-policy", source)).toThrow(
      /Invalid policy "example-policy"/,
    );
  });

  test("rejects a slug that is not lowercase-kebab", () => {
    expect(() => parsePolicy("../example", validSource)).toThrow(
      "slug is not lowercase-kebab",
    );
  });
});

describe("isPolicySlug", () => {
  test.each(["a", "acceptable-use", "time-off-2026", "a1-b2"])(
    "accepts %s",
    (slug) => {
      expect(isPolicySlug(slug)).toBe(true);
    },
  );

  test.each([
    "",
    "..",
    "../package",
    "foo/bar",
    "foo\\bar",
    "Foo",
    "foo_bar",
    "-leading",
    "trailing-",
    "double--hyphen",
    "with.dot",
    "with space",
    "a".repeat(81),
  ])("rejects %j", (slug) => {
    expect(isPolicySlug(slug)).toBe(false);
  });

  test("rejects non-string values", () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(isPolicySlug(value)).toBe(false);
    }
  });
});

describe("policy content", () => {
  test("lists every policy with metadata only, sorted by title", async () => {
    const policies = await listPolicies();
    expect(policies).toHaveLength(9);
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

  test("looks up a policy by slug with its Markdown body", async () => {
    const policy = await getPolicy("acceptable-use");
    expect(policy).toMatchObject({
      slug: "acceptable-use",
      title: "Acceptable Use Policy",
      team: "operations",
      updatedAt: "2026-09-02",
    });
    expect(policy?.body).toContain("## Purpose");
  });

  test("returns null for an unknown policy", async () => {
    expect(await getPolicy("does-not-exist")).toBeNull();
  });

  test.each([
    "../package",
    "../content/policies/acceptable-use",
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
