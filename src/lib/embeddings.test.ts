import { describe, expect, test, vi } from "vitest";

import {
  parseVector,
  relevance,
  vectorLiteral,
  voyageEmbedder,
} from "@/lib/embeddings";

vi.mock("server-only", () => ({}));

/** A fake Voyage API that echoes a vector per input, so order is checkable. */
function fakeVoyage(seen: { url: string; body: unknown }[] = []) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      input: string[];
      model: string;
      input_type: string;
    };
    seen.push({ url: String(url), body });

    return Response.json({
      // Deliberately out of order: the client must sort by `index`.
      data: body.input
        .map((text, index) => ({
          index,
          embedding: new Array(1024).fill(text.length),
        }))
        .reverse(),
    });
  };
}

describe("voyageEmbedder", () => {
  test("is undefined without a key, so search falls back to words", () => {
    expect(voyageEmbedder({ apiKey: "" })).toBeUndefined();
  });

  test("embeds documents with the document input type", async () => {
    const seen: { url: string; body: unknown }[] = [];
    const embedder = voyageEmbedder({
      apiKey: "key",
      fetch: fakeVoyage(seen),
    })!;

    const vectors = await embedder.documents(["one", "three"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(1024);
    expect(vectors[0][0]).toBe(3);
    expect(vectors[1][0]).toBe(5);
    expect(seen[0].body).toMatchObject({
      model: "voyage-3.5",
      input_type: "document",
    });
  });

  test("embeds a question with the query input type", async () => {
    const seen: { url: string; body: unknown }[] = [];
    const embedder = voyageEmbedder({
      apiKey: "key",
      fetch: fakeVoyage(seen),
    })!;

    const vector = await embedder.query("refund?");

    expect(vector).toHaveLength(1024);
    expect(seen[0].body).toMatchObject({ input_type: "query" });
  });

  test("sends no request for no documents", async () => {
    const seen: { url: string; body: unknown }[] = [];
    const embedder = voyageEmbedder({
      apiKey: "key",
      fetch: fakeVoyage(seen),
    })!;

    expect(await embedder.documents([])).toEqual([]);
    expect(seen).toHaveLength(0);
  });

  test("reports the API's message when the request fails", async () => {
    const embedder = voyageEmbedder({
      apiKey: "bad",
      fetch: async () =>
        Response.json({ detail: "invalid api key" }, { status: 401 }),
    })!;

    await expect(embedder.documents(["one"])).rejects.toThrow(
      /Voyage AI returned 401: invalid api key/,
    );
  });

  test("reports a reply whose row count does not match the batch", async () => {
    const embedder = voyageEmbedder({
      apiKey: "key",
      fetch: async () => Response.json({ data: [] }),
    })!;

    await expect(embedder.documents(["one", "two"])).rejects.toThrow(
      /returned 0 embeddings for 2 inputs/,
    );
  });
});

describe("vector helpers", () => {
  test("writes and reads a vector in pgvector's text form", () => {
    expect(vectorLiteral([1, 2, 3])).toBe("[1,2,3]");
    expect(parseVector("[1,2,3]")).toEqual([1, 2, 3]);
    expect(parseVector([4, 5])).toEqual([4, 5]);
    expect(parseVector(null)).toBeNull();
    expect(parseVector(42)).toBeNull();
  });

  test("turns a cosine distance into a 0 to 1 score", () => {
    expect(relevance(0)).toBe(1);
    expect(relevance(1)).toBe(0);
    expect(relevance(0.25)).toBeCloseTo(0.75);
    // A distance outside the range cannot produce a negative or over-1 score.
    expect(relevance(2)).toBe(0);
    expect(relevance(-1)).toBe(1);
  });
});

/**
 * A deterministic embedder: a vector with one value per marker word, so texts
 * sharing a word land close together. Cosine distance then behaves like
 * meaning, without a network call.
 */
const MARKERS = ["refund", "travel", "holiday", "password", "invoice"];

function fakeEmbedder() {
  const vector = (text: string) => {
    const lower = text.toLowerCase();
    return MARKERS.map((word) => (lower.includes(word) ? 1 : 0));
  };

  return {
    documents: async (texts: readonly string[]) => texts.map(vector),
    query: async (text: string) => vector(text),
  };
}

describe("meaning search", () => {
  test("ranks by cosine distance when the index carries embeddings", async () => {
    const { indexKnowledge, find, getDocument, chunkCount } =
      await import("@/lib/knowledge");

    const embedder = fakeEmbedder();
    // Voyage returns 1024 values; this fake returns 5, so pad to the column.
    const padded = {
      documents: async (texts: readonly string[]) =>
        (await embedder.documents(texts)).map((values) => {
          const full = new Array(1024).fill(0);
          values.forEach((value, index) => {
            full[index] = value;
          });
          return full;
        }),
      query: async (text: string) => {
        const values = await embedder.query(text);
        const full = new Array(1024).fill(0);
        values.forEach((value, index) => {
          full[index] = value;
        });
        return full;
      },
    };

    const document = getDocument("policies/refunds");
    await indexKnowledge(padded);

    const outcome = await find("refund", { embedder: padded, limit: 3 });

    expect(await chunkCount()).toBeGreaterThan(0);
    expect(await document).not.toBeNull();
    // The index carries vectors, so the meaning path is the one that ran.
    expect(outcome.mode).toBe("meaning");
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(outcome.results[0].score).toBeGreaterThanOrEqual(
      outcome.results[outcome.results.length - 1].score,
    );
  });
});
