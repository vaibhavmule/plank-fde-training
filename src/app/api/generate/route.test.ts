import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { invalidGenerateResponseSchema } from "./types";
import { handleGenerate } from "@/lib/generate";
import { createRequest } from "@/lib/requests";
import { resetRequests } from "@/lib/test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

const patches = [
  { op: "add", path: "/root", value: "page" },
  {
    op: "add",
    path: "/elements/page",
    value: { type: "Page", props: { title: "Overview" }, children: [] },
  },
];

function model(
  reply = patches.map((patch) => JSON.stringify(patch)).join("\n"),
) {
  const calls: unknown[] = [];

  const mock = new MockLanguageModelV4({
    doStream: async (options) => {
      calls.push(options);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: reply },
            { type: "text-end", id: "text-1" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: {
                  total: 4,
                  noCache: 4,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: { total: 3, text: 3, reasoning: undefined },
              },
            },
          ],
        }),
      };
    },
  });

  return { mock, calls };
}

function post(input: unknown, reply?: string) {
  const { mock, calls } = model(reply);
  return {
    calls,
    response: handleGenerate(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
      mock,
    ),
  };
}

beforeEach(async () => {
  await resetRequests();
});

describe("generate route", () => {
  test("streams the model's JSON patches with the live data in the instructions", async () => {
    await createRequest({
      title: "Live laptop request",
      team: "operations",
      priority: "high",
    });

    const { response, calls } = post({
      prompt: "Show an operations dashboard",
    });

    expect((await response).status).toBe(200);
    expect((await response).headers.get("content-type")).toContain(
      "text/plain",
    );

    const stream = await (await response).text();
    expect(stream).toContain('"path":"/root"');
    expect(stream).toContain('"path":"/elements/page"');

    const instructions = JSON.stringify(calls[0]);
    expect(instructions).toContain("never invent figures");
    expect(instructions).toContain("Live laptop request");
    expect(instructions).toContain("submit_request");
  });

  test("forwards only valid patch lines, ignoring prose and code fences", async () => {
    const reply = [
      "Here is your page:",
      "```spec",
      JSON.stringify(patches[0]),
      JSON.stringify(patches[1]),
      "```",
    ].join("\n");

    const { response } = post({ prompt: "Build it" }, reply);
    const stream = await (await response).text();

    expect(stream.trim().split("\n")).toHaveLength(2);
    expect(stream).not.toContain("Here is your page");
    expect(stream).not.toContain("```");
  });

  test("passes the current spec back for an edit", async () => {
    const currentSpec = {
      root: "page",
      elements: { page: { type: "Page", props: { title: "Old" } } },
    };
    const { response, calls } = post({
      prompt: "Change the title to New",
      currentSpec,
    });

    expect((await response).status).toBe(200);
    await (await response).text();
    expect(JSON.stringify(calls[0])).toContain("Old");
  });

  test.each([
    null,
    [],
    "text",
    {},
    { prompt: "  " },
    { prompt: "x".repeat(2001) },
    { prompt: "Ok", currentSpec: { root: 1 } },
  ])("rejects invalid input: %j", async (invalid) => {
    const { response } = post(invalid);
    const result = await response;
    expect(result.status).toBe(400);
    const body = invalidGenerateResponseSchema.parse(await result.json());
    expect(body.issues.length).toBeGreaterThan(0);
  });

  test("rejects malformed JSON", async () => {
    const { response } = post(undefined);
    expect((await response).status).toBe(400);
  });
});
