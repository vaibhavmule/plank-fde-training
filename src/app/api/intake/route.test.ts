import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { GET } from "../requests/route";
import { listRequestsResponseSchema } from "../requests/types";
import { handleIntake } from "./route";
import {
  intakeResponseSchema,
  invalidIntakeResponseSchema,
  type InvalidIntakeResponse,
} from "./types";
import { resetRequests } from "@/lib/test-fixtures";
import { listRequests } from "@/lib/requests";

const track = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/analytics", () => ({ track }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

beforeEach(async () => {
  await resetRequests();
  track.mockClear();
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

const TRIAGE = {
  title: "Label printer jams on every third label",
  body: "The label printer on the packing bench jams on every third label.",
  team: "operations",
  priority: "high",
};

const MODEL = new MockLanguageModelV4({
  doGenerate: async () => ({
    content: [{ type: "text", text: JSON.stringify(TRIAGE) }],
    finishReason: { unified: "stop", raw: "stop" },
    usage,
    warnings: [],
  }),
});

function post(input: unknown) {
  return handleIntake(
    new Request("http://localhost/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    MODEL,
  );
}

const message = `Hi WorkBot,

The label printer on the packing bench jams on every third label. Can someone look at it today?

Thanks,
Priya`;

describe("intake API", () => {
  test("POST triages a message and returns 201 with the request", async () => {
    const response = await post({ message });
    expect(response.status).toBe(201);

    const body = intakeResponseSchema.parse(await response.json());
    expect(body.request).toMatchObject({
      title: TRIAGE.title,
      details: TRIAGE.body,
      team: "operations",
      priority: "high",
      status: "open",
    });

    const listed = await GET();
    expect(
      listRequestsResponseSchema.parse(await listed.json()).requests,
    ).toEqual([body.request]);

    expect(track).toHaveBeenCalledWith(
      "request_submitted",
      expect.objectContaining({
        requestId: body.request.id,
        team: "operations",
        channel: "api",
      }),
      "api",
    );
  });

  test("POST trims the message before triaging", async () => {
    const response = await post({ message: `  ${message}  ` });
    expect(response.status).toBe(201);
    intakeResponseSchema.parse(await response.json());
  });

  test.each([
    null,
    [],
    "text",
    {},
    { message: "too short" },
    { message: "x".repeat(10_001) },
    { message: 42 },
    { message: null },
  ])(
    "POST rejects invalid input without modifying storage: %j",
    async (invalid) => {
      const response = await post(invalid);
      expect(response.status).toBe(400);
      const body = invalidIntakeResponseSchema.parse(await response.json());
      expect(body.issues.length).toBeGreaterThan(0);
      expect(await listRequests()).toEqual([]);
    },
  );

  test.each(["{", ""])(
    'POST rejects malformed or empty JSON: "%s"',
    async (raw) => {
      const response = await handleIntake(
        new Request("http://localhost/api/intake", {
          method: "POST",
          body: raw,
        }),
        MODEL,
      );
      expect(response.status).toBe(400);
      const body: InvalidIntakeResponse = invalidIntakeResponseSchema.parse(
        await response.json(),
      );
      expect(body.issues).toEqual([
        { path: [], message: "Request body must be valid JSON." },
      ]);
    },
  );
});
