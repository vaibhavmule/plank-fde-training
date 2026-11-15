import { beforeEach, describe, expect, test, vi } from "vitest";

import { customerSections, knowledgeTools } from "@/lib/knowledge-tools";
import { indexKnowledge } from "@/lib/knowledge";

vi.mock("server-only", () => ({}));

beforeEach(async () => {
  await indexKnowledge();
});

/** The four tools by name, so a test can call one directly. */
function tools(sections?: readonly string[]) {
  return Object.fromEntries(
    knowledgeTools(sections, { embedderOptions: { apiKey: "" } }).map(
      (entry) => [entry.name, entry],
    ),
  );
}

async function run(
  name: string,
  input: Record<string, unknown>,
  sections?: readonly string[],
) {
  const entry = tools(sections)[name];
  return entry.run(entry.input.parse(input));
}

describe("the tool set", () => {
  test("is exactly find, ls, cat and grep", () => {
    expect(Object.keys(tools())).toEqual(["find", "ls", "cat", "grep"]);
  });

  test("names a path for a model to follow in each description", () => {
    const set = tools();

    expect(set.find.description).toMatch(/call this first/i);
    expect(set.cat.description).toMatch(/after find or ls/i);
    expect(set.ls.description).toMatch(/list what the knowledge base holds/i);
    expect(set.grep.description).toMatch(/regular expression/i);
  });
});

describe("find", () => {
  test("returns paths, scores and the matching text", async () => {
    const result = await run("find", { query: "refund approval" });

    expect(result).toContain("policies/refunds");
    expect(result).toMatch(/\d\.\d{3}\s+policies\/refunds#/);
  });

  test("says which mode it used when nothing matches", async () => {
    const result = await run("find", { query: "quantum teleportation" });

    expect(result).toContain("Nothing in the knowledge base matches");
    expect(result).toContain("matching words");
  });
});

describe("ls", () => {
  test("lists every section at the root", async () => {
    const result = await run("ls", {});

    expect(result).toContain("faq");
    expect(result).toContain("it");
    expect(result).toContain("manuals");
    expect(result).toContain("people");
    expect(result).toContain("policies");
  });

  test("lists a section's documents", async () => {
    const result = await run("ls", { path: "policies" });

    expect(result).toContain("policies/refunds — Refund Policy");
    expect(result).not.toContain("manuals/");
  });

  test("lists a document's headings as paths", async () => {
    const result = await run("ls", { path: "policies/refunds" });

    expect(result).toContain("policies/refunds#refund-authority");
    expect(result).toContain("Refund authority");
  });

  test("treats an unknown path as not found", async () => {
    await expect(run("ls", { path: "policies/nope" })).rejects.toThrow(
      /There is no document at/,
    );
  });
});

describe("cat", () => {
  test("reads one section by heading", async () => {
    const result = await run("cat", {
      path: "policies/refunds#refund-authority",
    });

    expect(result).toContain("Refund Policy");
    expect(result).toContain("$200");
    expect(result).not.toContain("Larger refunds");
  });

  test("reads a whole document without a heading", async () => {
    const result = await run("cat", { path: "policies/refunds" });

    expect(result).toContain("## Refund authority");
    expect(result).toContain("## Larger refunds");
  });

  test("names the source a person could open", async () => {
    const result = await run("cat", { path: "policies/refunds" });

    expect(result).toContain("Source: /knowledge/policies/refunds");
  });

  test("reports an unknown heading in a document that exists", async () => {
    const result = await run("cat", {
      path: "policies/refunds#no-such-heading",
    });

    expect(result).toContain('There is no section "no-such-heading"');
  });

  test("treats an unknown document as not found", async () => {
    await expect(run("cat", { path: "policies/nope" })).rejects.toThrow(
      /There is no document at/,
    );
  });
});

describe("grep", () => {
  test("returns matching lines with their path and heading", async () => {
    const result = await run("grep", { pattern: "support lead" });

    expect(result).toContain("matching line");
    expect(result).toMatch(/policies\/refunds#\S+:\d+:/);
  });

  test("searches one document when a path is given", async () => {
    const result = await run("grep", {
      pattern: "\\$200",
      path: "policies/refunds",
    });

    expect(result).toContain("$200");
    expect(result).not.toContain("faq/");
  });

  test("says so when nothing matches", async () => {
    const result = await run("grep", { pattern: "xyzzy-nothing" });

    expect(result).toContain("No line matches");
  });

  test("reports an invalid expression as a failed result", async () => {
    await expect(run("grep", { pattern: "(" })).rejects.toThrow(
      /not a valid regular expression/,
    );
  });
});

describe("a scoped tool set", () => {
  test("is customers on the faq and policies sections", () => {
    expect(customerSections).toEqual(["faq", "policies"]);
  });

  test("lists only the allowed sections at the root", async () => {
    const result = await run("ls", {}, customerSections);

    expect(result).toContain("faq");
    expect(result).toContain("policies");
    expect(result).not.toContain("manuals");
    expect(result).not.toContain("people");
  });

  test("finds nothing in a section it may not read", async () => {
    const result = await run("find", { query: "onboarding" }, customerSections);

    expect(result).not.toContain("people/");
  });

  test("finds a customer answer in the faq section", async () => {
    const result = await run(
      "find",
      { query: "how long does a refund take" },
      customerSections,
    );

    expect(result).toContain("faq/refund-timings");
  });

  test("refuses a path outside its sections, as if it did not exist", async () => {
    await expect(
      run("cat", { path: "people/who-to-ask" }, customerSections),
    ).rejects.toThrow(/There is no document at/);
  });

  test("refuses a grep inside a document outside its sections", async () => {
    await expect(
      run(
        "grep",
        { pattern: "onboarding", path: "manuals/onboarding-setup" },
        customerSections,
      ),
    ).rejects.toThrow(/There is no document at/);
  });

  test("leaves a document outside its sections out of a broad grep", async () => {
    const result = await run(
      "grep",
      { pattern: "onboarding" },
      customerSections,
    );

    expect(result).not.toContain("manuals/onboarding-setup");
  });
});
