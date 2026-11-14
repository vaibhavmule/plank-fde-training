import { describe, expect, test } from "vitest";

import { SYSTEM_PROMPT } from "./system-prompt";

const words = (text: string) => text.trim().split(/\s+/).length;

describe("system prompt", () => {
  test("stays under 200 words, so a person can review it in one sitting", () => {
    expect(words(SYSTEM_PROMPT)).toBeLessThan(200);
  });

  test("names every team WorkBot may send a question to", () => {
    for (const team of ["operations", "finance", "support"]) {
      expect(SYSTEM_PROMPT).toContain(team);
    }
  });
});
