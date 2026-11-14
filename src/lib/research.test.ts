import { describe, expect, test, vi } from "vitest";

import type { Completion, Model, Provider, TokenUsage } from "@/lib/providers";
import { research } from "@/lib/research";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

const MODELS: readonly Model[] = [
  { id: "large", pricePerMillionTokens: { input: 2, output: 10 } },
  { id: "small", pricePerMillionTokens: { input: 0.1, output: 0.5 } },
];

const QUESTION = "How much can a support agent refund without approval?";

const PLAN = '{"policies":["refunds"],"searches":[]}';

const REFUND_NOTE =
  "- A support agent may refund up to $200 per customer without approval.";

const ANSWER = `A support agent may refund up to $200 per customer without approval [1].

Sources:
[1] Refund Policy (/policies/refunds)`;

function scriptedProvider(replies: string[]) {
  const calls: Completion[] = [];
  const provider: Provider = {
    name: "scripted",
    models: MODELS,
    async stream(completion, events) {
      const index = calls.length;
      calls.push(completion);

      const reply = replies[index];
      if (reply === undefined) {
        throw new Error(`Unexpected model call ${index + 1}`);
      }

      events.text(reply);
      return { input: 10, output: 5 };
    },
  };

  return { provider, calls };
}

function events() {
  const steps: string[] = [];
  const text: string[] = [];
  const spend: { model: string; usage: TokenUsage }[] = [];

  return {
    steps,
    text,
    spend,
    on: {
      step: (message: string) => steps.push(message),
      text: (delta: string) => text.push(delta),
      spend: (model: string, usage: TokenUsage) => spend.push({ model, usage }),
    },
  };
}

describe("research", () => {
  test("plans with the small model and extracts and writes with the large one", async () => {
    const { provider, calls } = scriptedProvider([PLAN, REFUND_NOTE, ANSWER]);
    const { on, steps, text, spend } = events();

    const answer = await research(QUESTION, provider, on);

    expect(answer).toBe(ANSWER);
    expect(text.join("")).toBe(ANSWER);
    expect(steps).toEqual([
      "Planning research",
      "Reading 1 policy and 0 web results",
      "Extracting facts from 1 source",
      "Writing the answer",
    ]);
    expect(calls.map((call) => call.model)).toEqual([
      "small",
      "large",
      "large",
    ]);
    expect(calls[1].messages[0].content).toContain(
      "Source [1] — Refund Policy (company policy)",
    );
    expect(calls[2].system).toContain("[1] Refund Policy (/policies/refunds)");
    expect(spend).toEqual([
      { model: "small", usage: { input: 10, output: 5 } },
      { model: "large", usage: { input: 10, output: 5 } },
      { model: "large", usage: { input: 10, output: 5 } },
    ]);
  });

  test("retries once with the plan error when the reply is not JSON", async () => {
    const { provider, calls } = scriptedProvider([
      "I would read the refunds policy.",
      PLAN,
      REFUND_NOTE,
      ANSWER,
    ]);
    const { on, steps } = events();

    await research(QUESTION, provider, on);

    expect(steps).toContain("The plan was invalid; asking the planner again");
    expect(calls.slice(0, 2).map((call) => call.model)).toEqual([
      "small",
      "small",
    ]);
    expect(calls[1].messages).toEqual([
      { role: "user", content: expect.stringContaining("Company policies") },
      {
        role: "assistant",
        content: "I would read the refunds policy.",
      },
      {
        role: "user",
        content: expect.stringContaining("The plan was not valid JSON"),
      },
    ]);
  });

  test("reads the top web result when a Brave key is configured", async () => {
    const requests: string[] = [];
    const fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = new URL(String(input));
      requests.push(url.toString());

      if (url.hostname === "api.search.brave.com") {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-subscription-token")).toBe("brave-key");
        return Response.json({
          web: {
            results: [
              {
                title: "Refund rules",
                url: "https://example.com/refunds",
                description: "A snippet about refunds.",
              },
            ],
          },
        });
      }

      if (url.hostname === "example.com") {
        return new Response("<p>Web refund details.</p>");
      }

      throw new Error(`Unexpected request for ${url}`);
    }) as typeof globalThis.fetch;

    const { provider, calls } = scriptedProvider([
      '{"policies":["refunds"],"searches":["refund limit"]}',
      REFUND_NOTE,
      "- Web refund details.",
      ANSWER,
    ]);
    const { on, steps } = events();

    await research(QUESTION, provider, on, {
      braveSearchKey: "brave-key",
      fetch,
    });

    expect(steps).toContain("Reading 1 policy and 1 web result");
    expect(steps).toContain("Extracting facts from 2 sources");
    expect(calls[2].messages[0].content).toContain("Web refund details.");
    expect(calls[3].system).toContain(
      "[2] Refund rules — https://example.com/refunds",
    );
    expect(requests.some((url) => url.includes("api.search.brave.com"))).toBe(
      true,
    );
  });

  test("ignores planned searches when no Brave key is configured", async () => {
    const { provider, calls } = scriptedProvider([
      '{"policies":["refunds"],"searches":["refund limit"]}',
      REFUND_NOTE,
      ANSWER,
    ]);
    const { on, steps } = events();

    await research(QUESTION, provider, on, {
      fetch: () => {
        throw new Error("The network must not be used without a key");
      },
    });

    expect(steps).toContain("Reading 1 policy and 0 web results");
    expect(calls).toHaveLength(3);
    expect(calls[0].messages[0].content).toContain(
      "web search is not configured",
    );
  });

  test("throws when the retry is still not a valid plan", async () => {
    const { provider } = scriptedProvider(["not json", "still not json"]);
    const { on } = events();

    await expect(research(QUESTION, provider, on)).rejects.toThrow(
      /Could not plan the research/,
    );
  });

  test("rejects an empty question before calling the model", async () => {
    const { provider, calls } = scriptedProvider([]);
    const { on } = events();

    await expect(research("   ", provider, on)).rejects.toThrow(
      /Ask a research question/,
    );
    expect(calls).toHaveLength(0);
  });
});
