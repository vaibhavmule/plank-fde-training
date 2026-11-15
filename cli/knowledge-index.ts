import { stdout } from "node:process";

import { closeDatabase } from "@/lib/db";
import { voyageEmbedder, type Embedder } from "@/lib/embeddings";
import { indexKnowledge, listDocuments } from "@/lib/knowledge";

function embedder(): Embedder | undefined {
  const apiKey = process.env.VOYAGE_API_KEY ?? "";
  if (!apiKey) {
    console.log(
      "VOYAGE_API_KEY is not set, so the index is built from words only and `find` matches terms instead of meaning.",
    );
    return undefined;
  }

  return voyageEmbedder({ apiKey });
}

async function main() {
  const documents = await listDocuments();
  const report = await indexKnowledge(embedder(), documents);

  console.log(
    `${report.documents} documents, ${report.chunks} chunks indexed, ${report.embedded} with embeddings.`,
  );

  if (report.embedded === 0 && process.env.VOYAGE_API_KEY) {
    console.log(
      "No chunk carries an embedding: the database has no pgvector column, so search uses words.",
    );
  }

  await closeDatabase();
  stdout.write("");
}

void main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  await closeDatabase().catch(() => {});
  process.exitCode = 1;
});
