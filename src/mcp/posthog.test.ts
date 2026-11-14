import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test } from "vitest";

import { posthogServer, type PostHogApi } from "./posthog";

type ToolResult = {
  content: { type: string; text?: string }[];
  isError?: boolean;
};

function textOf(result: unknown) {
  const { content } = result as ToolResult;
  return content
    .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
    .join("");
}

type Call = { url: URL; authorization: string | null };

// A fake PostHog that records the requests the server builds.
function fakePostHog() {
  const calls: Call[] = [];
  const seen = new Map<string, string>([
    ["request_submitted", "2026-11-14T13:00:00Z"],
    ["request_form_viewed", "2026-11-14T12:59:00Z"],
  ]);

  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({ url, authorization: headers.get("Authorization") });

    if (url.pathname.endsWith("/events/")) {
      const wanted = url.searchParams.get("event");
      const events = [...seen.keys()]
        .filter((name) => !wanted || name === wanted)
        .map((name) => ({
          event: name,
          distinct_id: "8a3c5d2e-0000-4000-8000-000000000000",
          timestamp: "2026-11-14T13:00:00Z",
          properties: {
            $lib: "posthog-js",
            requestId: "b2a73d06-648c-44e5-a61f-795d64874299",
            team: "support",
          },
        }));
      return Response.json({ results: events });
    }

    if (url.pathname.endsWith("/event_definitions/")) {
      return Response.json({
        results: [...seen].map(([name, lastSeen]) => ({
          name,
          last_seen: lastSeen,
        })),
      });
    }

    return Response.json({ detail: "not found" }, { status: 404 });
  }) as typeof globalThis.fetch;

  return { fetch, calls };
}

const api: PostHogApi = {
  apiHost: "https://us.posthog.com",
  projectId: "132457",
  personalKey: "phx_test",
};

async function connect(fetch: typeof globalThis.fetch) {
  const server = posthogServer({ ...api, fetch });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.1.0" });
  await client.connect(clientTransport);

  return client;
}

describe("posthog MCP server", () => {
  test("get-events asks for the right window and strips internal properties", async () => {
    const posthog = fakePostHog();
    const client = await connect(posthog.fetch);

    const result = await client.callTool({
      name: "get-events",
      arguments: { event: "request_submitted", minutes: 30 },
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(textOf(result));
    expect(body.minutes).toBe(30);
    expect(body.count).toBe(1);
    expect(body.events[0].properties).toEqual({
      requestId: "b2a73d06-648c-44e5-a61f-795d64874299",
      team: "support",
    });

    const [{ url, authorization }] = posthog.calls;
    expect(url.pathname).toBe("/api/projects/132457/events/");
    expect(url.searchParams.get("event")).toBe("request_submitted");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(Date.parse(url.searchParams.get("after")!)).toBeLessThan(Date.now());
    expect(authorization).toBe("Bearer phx_test");
  });

  test("get-events filters by visitor when one is given", async () => {
    const posthog = fakePostHog();
    const client = await connect(posthog.fetch);

    await client.callTool({
      name: "get-events",
      arguments: { distinctId: "8a3c", minutes: 5 },
    });

    expect(posthog.calls[0].url.searchParams.get("distinct_id")).toBe("8a3c");
  });

  test("get-event-definitions lists names and when each was last seen", async () => {
    const posthog = fakePostHog();
    const client = await connect(posthog.fetch);

    const body = JSON.parse(
      textOf(
        await client.callTool({ name: "get-event-definitions", arguments: {} }),
      ),
    );

    expect(body.events).toEqual(
      expect.arrayContaining([
        { event: "request_submitted", lastSeen: "2026-11-14T13:00:00Z" },
      ]),
    );
    expect(posthog.calls[0].url.pathname).toBe(
      "/api/projects/132457/event_definitions/",
    );
  });

  test("check-event-fired answers in one sentence", async () => {
    const client = await connect(fakePostHog().fetch);

    const fired = await client.callTool({
      name: "check-event-fired",
      arguments: { event: "request_submitted", minutes: 10 },
    });
    expect(textOf(fired)).toBe(
      "request_submitted fired 1 time in the last 10 minutes.",
    );

    const missing = await client.callTool({
      name: "check-event-fired",
      arguments: { event: "request_archived", minutes: 10 },
    });
    expect(textOf(missing)).toBe(
      "request_archived did not fire in the last 10 minutes.",
    );
  });

  test("a failing request comes back as an error result", async () => {
    const client = await connect(fakePostHog().fetch);

    const result = await client.callTool({
      name: "get-events",
      arguments: { minutes: 10 },
    });

    // The fake answers /events/, so this checks the success path shape only.
    expect(result.isError).toBeFalsy();

    const failing = await connect(async () =>
      Response.json({ detail: "nope" }, { status: 500 }),
    );
    const failed = await failing.callTool({
      name: "get-event-definitions",
      arguments: {},
    });
    expect(failed.isError).toBe(true);
    expect(textOf(failed)).toContain("500");
  });
});
