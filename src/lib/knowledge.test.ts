import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  chunkCount,
  chunksOf,
  find,
  getDocument,
  grep,
  headingSlug,
  indexKnowledge,
  listDocuments,
  listSections,
  needsIndex,
  parseDocument,
} from "@/lib/knowledge";

vi.mock("server-only", () => ({}));

const document = `---
title: "Refund Policy"
owner: Support lead
updated: 2026-11-14
---

## Refund authority

A support agent may refund up to $200 per customer without approval.

## Larger refunds

A refund above $200 needs written approval from the support lead.
`;

beforeEach(async () => {
  await indexKnowledge();
});

describe("chunksOf", () => {
  test("makes one chunk per heading, with the document's title", () => {
    const chunks = chunksOf(parseDocument("policies/refunds", document));

    expect(chunks.map((chunk) => chunk.heading)).toEqual([
      "Refund authority",
      "Larger refunds",
    ]);
    expect(chunks[0]).toMatchObject({
      path: "policies/refunds",
      section: "policies",
      title: "Refund Policy",
      position: 0,
    });
    expect(chunks[0].text).toContain("$200 per customer");
    expect(chunks[1].text).not.toContain("per customer");
  });

  test("keeps text before the first heading as its own chunk", () => {
    const chunks = chunksOf(
      parseDocument(
        "faq/example",
        `---\ntitle: "Example"\nowner: Support lead\nupdated: 2026-01-01\n---\n\nAn introduction.\n\n## Details\n\nMore.`,
      ),
    );

    expect(chunks.map((chunk) => chunk.heading)).toEqual(["", "Details"]);
    expect(chunks[0].text).toBe("An introduction.");
  });
});

describe("parseDocument", () => {
  test("reads the front matter and the body", () => {
    expect(parseDocument("policies/refunds", document)).toMatchObject({
      path: "policies/refunds",
      section: "policies",
      slug: "refunds",
      title: "Refund Policy",
      owner: "Support lead",
      updated: "2026-11-14",
    });
  });

  test.each([
    ["no front matter", "Just a body."],
    ["missing owner", `---\ntitle: "X"\nupdated: 2026-01-01\n---\n\nBody.`],
    [
      "bad date",
      `---\ntitle: "X"\nowner: A\nupdated: 01-01-2026\n---\n\nBody.`,
    ],
    [
      "unknown field",
      `---\ntitle: "X"\nowner: A\nupdated: 2026-01-01\nnope: 1\n---\n\nBody.`,
    ],
    ["empty body", `---\ntitle: "X"\nowner: A\nupdated: 2026-01-01\n---\n\n  `],
  ])("rejects %s", (_label, source) => {
    expect(() => parseDocument("policies/refunds", source)).toThrow(
      /Invalid knowledge document/,
    );
  });

  test.each(["refunds", "policies/Refunds", "../x/y", "a/b/c"])(
    "rejects the bad path %j",
    (path) => {
      expect(() => parseDocument(path, document)).toThrow(
        /Invalid knowledge document/,
      );
    },
  );
});

describe("headingSlug", () => {
  test("lowercases a heading into a single-hyphen fragment", () => {
    expect(headingSlug("Refund authority")).toBe("refund-authority");
    expect(headingSlug("What's covered: travel & meals")).toBe(
      "what-s-covered-travel-meals",
    );
  });
});

describe("the corpus", () => {
  test("holds at least 52 documents in 5 sections", async () => {
    const documents = await listDocuments();
    const sections = await listSections();

    expect(documents.length).toBeGreaterThanOrEqual(52);
    expect(sections).toEqual(["faq", "it", "manuals", "people", "policies"]);
  });

  test("gives every document a title, owner, date and body", async () => {
    for (const entry of await listDocuments()) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.owner.length).toBeGreaterThan(0);
      expect(entry.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.body).toContain("## ");
    }
  });

  test("reads one document by path, and null outside the corpus", async () => {
    expect((await getDocument("policies/refunds"))?.title).toBe(
      "Refund Policy",
    );
    expect(await getDocument("policies/nope")).toBeNull();
    expect(await getDocument("../package")).toBeNull();
    expect(await getDocument("no-section/doc")).toBeNull();
  });
});

describe("indexKnowledge", () => {
  test("writes every chunk and is idempotent per document", async () => {
    const documents = await listDocuments();
    const first = await indexKnowledge(undefined, documents);

    expect(first.documents).toBe(documents.length);
    expect(first.chunks).toBeGreaterThan(documents.length);
    expect(await chunkCount()).toBe(first.chunks);
    expect(await needsIndex()).toBe(false);

    // A rebuild replaces each document's chunks rather than adding to them.
    const second = await indexKnowledge(undefined, documents);
    expect(await chunkCount()).toBe(second.chunks);
  });

  test("replaces one document without touching the rest", async () => {
    const edited = parseDocument(
      "policies/refunds",
      document.replace("per customer", "per account"),
    );

    // Re-indexing one document replaces only its own chunks.
    await indexKnowledge(undefined, [edited]);

    const { results } = await find("per account");
    expect(results.some((result) => result.text.includes("per account"))).toBe(
      true,
    );
    expect(results.some((result) => result.text.includes("per customer"))).toBe(
      false,
    );

    // The other documents are still searchable from the full corpus.
    await indexKnowledge();
    expect((await listDocuments()).length).toBeGreaterThan(1);
  });
});

describe("find", () => {
  test("finds the refunds policy by matching words", async () => {
    const { mode, results } = await find("refund approval");

    expect(mode).toBe("words");
    expect(results.length).toBeGreaterThan(0);

    const policy = results.find((result) => result.path === "policies/refunds");
    expect(policy).toMatchObject({
      section: "policies",
      title: "Refund Policy",
    });
    expect(policy?.ref).toMatch(/^policies\/refunds#/);
  });

  test("matches any of the question's words, ranked by rank", async () => {
    const { results } = await find("hotel limit procurement");

    expect(results.length).toBeGreaterThan(1);
    const scores = results.map((result) => result.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test("stays inside the sections it is given", async () => {
    const { results } = await find("refund", { sections: ["faq"] });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.section === "faq")).toBe(true);
  });

  test("returns nothing for a section it may not read", async () => {
    expect((await find("refund", { sections: ["nope"] })).results).toEqual([]);
    expect((await find("refund", { sections: [] })).results).toEqual([]);
  });

  test("caps the result count", async () => {
    expect(
      (await find("the", { limit: 3 })).results.length,
    ).toBeLessThanOrEqual(3);
  });

  test("returns nothing when the question has no usable words", async () => {
    expect((await find("a i")).results).toEqual([]);
    expect((await find("   ")).results).toEqual([]);
  });

  test("falls back to words when the index has no embeddings", async () => {
    const embedder = {
      documents: async () => [],
      query: async () => {
        throw new Error("the embedder must not be reached");
      },
    };

    const outcome = await find("refund", { embedder });

    expect(outcome.mode).toBe("words");
    expect(outcome.results.length).toBeGreaterThan(0);
  });
});

describe("grep", () => {
  test("finds a pattern with its path and heading", async () => {
    const matches = await grep("support lead");

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]).toMatchObject({ path: expect.any(String) });
    expect(matches.some((match) => match.heading !== "")).toBe(true);
  });

  test("searches one document and matches case-insensitively", async () => {
    const matches = await grep("SUPPORT LEAD", "policies/refunds");

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((match) => match.path === "policies/refunds")).toBe(
      true,
    );
  });

  test("supports a regular expression", async () => {
    const matches = await grep("\\$\\d{3}");

    expect(matches.some((match) => match.text.includes("$200"))).toBe(true);
  });

  test("caps the output so a broad pattern cannot flood a prompt", async () => {
    expect((await grep("a")).length).toBeLessThanOrEqual(40);
  });

  test("reports an invalid expression instead of throwing raw", async () => {
    await expect(grep("(")).rejects.toThrow(/not a valid regular expression/);
  });

  test("returns nothing for an unknown document", async () => {
    expect(await grep("refund", "policies/nope")).toEqual([]);
  });
});
