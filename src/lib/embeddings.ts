/** Voyage AI's embedding model, and the number of values it returns. */
export const EMBEDDING_MODEL = "voyage-3.5";
export const EMBEDDING_DIMENSIONS = 1024;

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
// Voyage accepts at most 128 inputs in one request.
const MAX_BATCH = 128;

/**
 * Turns text into vectors. Documents and queries are embedded with different
 * `input_type` values, because Voyage places a passage and a question about it
 * closer together when it knows which is which.
 */
export type Embedder = {
  /** Vectors for the passages that go into the index. */
  documents(texts: readonly string[]): Promise<number[][]>;
  /** One vector for a question, to compare against the indexed passages. */
  query(text: string): Promise<number[]>;
};

export type EmbedderOptions = {
  apiKey: string;
  /** Injected by tests so no request leaves the process. */
  fetch?: typeof globalThis.fetch;
};

type VoyageResponse = {
  data?: { embedding: number[]; index: number }[];
  detail?: string;
};

async function embed(
  texts: readonly string[],
  inputType: "document" | "query",
  options: EmbedderOptions,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const doFetch = options.fetch ?? globalThis.fetch;
  const vectors: number[][] = [];

  for (let start = 0; start < texts.length; start += MAX_BATCH) {
    const batch = texts.slice(start, start + MAX_BATCH);
    const response = await doFetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: batch,
        model: EMBEDDING_MODEL,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as VoyageResponse;
      throw new Error(
        `Voyage AI returned ${response.status}: ${body.detail ?? "no detail"}`,
      );
    }

    const body = (await response.json()) as VoyageResponse;
    const rows = body.data ?? [];
    if (rows.length !== batch.length) {
      throw new Error(
        `Voyage AI returned ${rows.length} embeddings for ${batch.length} inputs.`,
      );
    }

    // Voyage returns the batch out of order; `index` is the position in it.
    vectors.push(
      ...rows.sort((a, b) => a.index - b.index).map((row) => row.embedding),
    );
  }

  return vectors;
}

/**
 * The embedder for Voyage AI's `voyage-3.5`, or undefined when no key is set:
 * the knowledge base then indexes words only, and `find` says so.
 */
export function voyageEmbedder(options: EmbedderOptions): Embedder | undefined {
  if (!options.apiKey) return undefined;

  return {
    documents: (texts) => embed(texts, "document", options),
    async query(text) {
      const [vector] = await embed([text], "query", options);
      if (!vector) throw new Error("Voyage AI returned no embedding.");
      return vector;
    },
  };
}

/** A vector in the text form pgvector reads and writes. */
export function vectorLiteral(values: readonly number[]): string {
  return `[${values.join(",")}]`;
}

/** The vector a pgvector column returned, which arrives as a string. */
export function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[];
  if (typeof value !== "string") return null;

  const body = value.slice(1, -1).trim();
  return body === "" ? [] : body.split(",").map(Number);
}

/** Cosine distance as a relevance score, 1 for identical and 0 for unrelated. */
export function relevance(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance));
}
