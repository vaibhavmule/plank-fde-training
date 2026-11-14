import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type PostHogApi = {
  apiHost: string;
  projectId: string;
  personalKey: string;
  // Injected so the test needs no network; the entry point gets the real one.
  fetch?: typeof globalThis.fetch;
};

type TextResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

type Event = {
  event: string;
  distinct_id: string;
  timestamp: string;
  properties: Record<string, unknown>;
};

const DEFAULT_MINUTES = 10;
const MAX_EVENTS = 100;

function json(value: unknown): TextResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown): TextResult {
  return {
    content: [
      {
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true,
  };
}

// PostHog's own `$` properties are noise for a question about the funnel.
function withoutInternalProperties(properties: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => !key.startsWith("$")),
  );
}

function minutesWindow(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Read access to one PostHog project: three tools over the project API. */
export function posthogServer(api: PostHogApi) {
  const doFetch = api.fetch ?? globalThis.fetch;
  const base = `${api.apiHost.replace(/\/+$/, "")}/api/projects/${api.projectId}`;

  async function get(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ) {
    const url = new URL(`${base}/${path}/`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await doFetch(url, {
      headers: { Authorization: `Bearer ${api.personalKey}` },
    });
    if (!response.ok) {
      throw new Error(
        `PostHog answered ${response.status} for ${url.pathname}`,
      );
    }

    return (await response.json()) as Record<string, unknown>;
  }

  async function recentEvents(
    event: string | undefined,
    distinctId: string | undefined,
    minutes: number,
  ): Promise<Event[]> {
    const body = await get("events", {
      event,
      distinct_id: distinctId,
      after: minutesWindow(minutes),
      limit: MAX_EVENTS,
    });
    const results = Array.isArray(body.results) ? body.results : [];

    return results.map((row) => {
      const record = row as Partial<Event>;
      return {
        event: String(record.event ?? ""),
        distinct_id: String(record.distinct_id ?? ""),
        timestamp: String(record.timestamp ?? ""),
        properties: withoutInternalProperties(
          (record.properties ?? {}) as Record<string, unknown>,
        ),
      };
    });
  }

  const server = new McpServer({ name: "workbot-posthog", version: "0.1.0" });

  server.registerTool(
    "get-events",
    {
      title: "Read recent events",
      description:
        "Returns up to 100 recent events, optionally filtered by event name, by visitor id, and by a time window in minutes.",
      inputSchema: {
        event: z
          .string()
          .min(1)
          .optional()
          .describe("An event name, for example request_submitted"),
        distinctId: z
          .string()
          .min(1)
          .optional()
          .describe("A visitor's distinct id"),
        minutes: z
          .number()
          .int()
          .positive()
          .max(10_080)
          .optional()
          .describe("How far back to look, in minutes. Defaults to 10."),
      },
    },
    async ({ event, distinctId, minutes }) => {
      try {
        const window = minutes ?? DEFAULT_MINUTES;
        const events = await recentEvents(event, distinctId, window);
        return json({ minutes: window, count: events.length, events });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get-event-definitions",
    {
      title: "List event names",
      description:
        "Lists every event name this PostHog project has seen, with the last time each was seen.",
      inputSchema: {},
    },
    async () => {
      try {
        const body = await get("event_definitions", { limit: MAX_EVENTS });
        const results = Array.isArray(body.results) ? body.results : [];

        return json({
          events: results.map((row) => {
            const record = row as Record<string, unknown>;
            return {
              event: String(record.name ?? ""),
              lastSeen: record.last_seen ? String(record.last_seen) : null,
            };
          }),
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "check-event-fired",
    {
      title: "Check whether one event fired",
      description:
        "Answers in one sentence whether an event was captured in the last N minutes, and how many times.",
      inputSchema: {
        event: z.string().min(1).describe("The event name to look for"),
        minutes: z
          .number()
          .int()
          .positive()
          .max(10_080)
          .optional()
          .describe("How far back to look, in minutes. Defaults to 10."),
      },
    },
    async ({ event, minutes }) => {
      try {
        const window = minutes ?? DEFAULT_MINUTES;
        const events = await recentEvents(event, undefined, window);
        const count = events.length;

        return {
          content: [
            {
              type: "text",
              text:
                count === 0
                  ? `${event} did not fire in the last ${window} minutes.`
                  : `${event} fired ${count} ${count === 1 ? "time" : "times"} in the last ${window} minutes.`,
            },
          ],
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
