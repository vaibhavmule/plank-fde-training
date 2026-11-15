import { describe, expect, test, vi } from "vitest";

import { questionWords, searchPolicies } from "@/lib/policies";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

describe("questionWords", () => {
  test("lowercases, splits on punctuation and drops stop words", () => {
    expect(
      questionWords("Can a support agent approve a $250 refund alone?"),
    ).toEqual(["support", "agent", "approve", "250", "refund", "alone"]);
  });

  test("drops single letters and repeats", () => {
    expect(questionWords("refund refund a I")).toEqual(["refund"]);
  });
});

describe("searchPolicies", () => {
  test("returns the refunds policy first for a refund question", async () => {
    const matches = await searchPolicies(
      "Can a support agent approve a $250 refund alone?",
    );

    expect(matches[0]).toMatchObject({
      slug: "refunds",
      title: "Refund Policy",
    });
    expect(matches.every((match) => match.score > 0)).toBe(true);
    expect(matches.map((match) => match.slug)).toContain(
      "customer-support-escalation",
    );
  });

  test("counts a title word three times and each matching line once", async () => {
    const [refunds] = await searchPolicies("refund");

    expect(refunds.slug).toBe("refunds");
    // "Refund" is in the title and the body line "A support agent may refund..."
    expect(refunds.score).toBe(3 + refunds.lines.length);
    expect(refunds.lines.some((line) => line.includes("$200"))).toBe(true);
  });

  test("sorts by score, then by title", async () => {
    const matches = await searchPolicies("working from home abroad");
    const scores = matches.map((match) => match.score);

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test("matches whole words only", async () => {
    const matches = await searchPolicies("unlimited");

    expect(matches.map((match) => match.slug)).not.toContain("refunds");
  });

  test("returns nothing when the question has no usable words", async () => {
    expect(await searchPolicies("the and of a")).toEqual([]);
  });

  test("returns nothing for words no policy mentions", async () => {
    expect(await searchPolicies("quantum teleportation")).toEqual([]);
  });

  test("keeps the matched lines in document order", async () => {
    const [refunds] = await searchPolicies("refund approval");

    expect(refunds.lines.length).toBeGreaterThan(1);
    expect(refunds.lines[0]).toContain("Refund authority");
  });
});
