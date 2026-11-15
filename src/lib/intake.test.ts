import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { intake, triage, type Triage } from "./intake";
import { listRequests } from "./requests";
import { resetRequests } from "./test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

beforeEach(async () => {
  await resetRequests();
});

const usage = {
  inputTokens: {
    total: 120,
    noCache: 120,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 60, text: 60, reasoning: undefined },
};

const PRINTED: Triage = {
  title: "Label printer jams on every third label",
  body: "The label printer on the packing bench jams on every third label, so we are shipping orders without labels.",
  team: "operations",
  priority: "high",
};

/** A model that answers every call with one triage. */
function model(triage: Triage) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(triage) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }),
  });
}

const MESSAGE = `Hi WorkBot,

The label printer on the packing bench jams on every third label, so we are shipping orders without labels. Can someone look at it today?

Thanks,
Priya`;

describe("triage", () => {
  test("reads a message into a title, a body, a team and a priority", async () => {
    const result = await triage(MESSAGE, model(PRINTED));

    expect(result).toEqual(PRINTED);
  });

  test("rejects an empty message before calling the model", async () => {
    await expect(triage("   ", model(PRINTED))).rejects.toThrow(
      /message to triage/,
    );
  });
});

describe("intake", () => {
  test("creates a request from the triage, with the body as details", async () => {
    const request = await intake(MESSAGE, model(PRINTED));

    expect(request).toMatchObject({
      title: PRINTED.title,
      details: PRINTED.body,
      team: "operations",
      priority: "high",
      status: "open",
    });
    expect(request.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await listRequests()).toEqual([request]);
  });

  test("a triage the request schema rejects never reaches the database", async () => {
    // The triage schema allows a long body; the request schema caps details.
    await expect(
      intake(MESSAGE, model({ ...PRINTED, body: "x".repeat(5_001) })),
    ).rejects.toThrow(/details/);

    expect(await listRequests()).toEqual([]);
  });
});
