import { after } from "next/server";

import { config } from "@/lib/config";
import { visitorId } from "@/lib/visitor";

export type AnalyticsEvent =
  | "request_form_viewed"
  | "request_submitted"
  | "request_viewed"
  | "request_status_changed";

// Record ids and names only. Nothing here identifies a person.
export type AnalyticsProperties = Record<string, string | number | undefined>;

/**
 * Queues one event for PostHog, after the response is sent. Without a
 * `POSTHOG_KEY` it does nothing, so local runs and tests stay silent.
 *
 * `visitor` overrides the browser's id. API routes are outside the proxy that
 * sets the cookie, so they pass one anonymous id instead of a person's.
 */
export async function track(
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
  visitor?: string,
) {
  if (!config.posthogKey) return;

  const who = visitor ?? (await visitorId());
  if (!who) return;

  after(async () => {
    try {
      await fetch(`${config.posthogHost}/i/v0/e/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: config.posthogKey,
          event,
          distinct_id: who,
          timestamp: new Date().toISOString(),
          properties,
        }),
      });
    } catch {
      // Analytics must never break the page or the action that sent it.
    }
  });
}

/**
 * Renders nothing and records one event. It reads the visitor cookie, which is
 * request-time work, so it belongs inside a Suspense boundary.
 */
export async function Track({
  event,
  properties,
}: {
  event: AnalyticsEvent;
  properties?: AnalyticsProperties;
}) {
  await track(event, properties);
  return null;
}
