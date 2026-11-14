import "server-only";

import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

import { config } from "@/lib/config";
import { schemaStatements } from "@/lib/schema";

export type Row = Record<string, unknown>;
export type DatabaseQuery = (
  text: string,
  params?: unknown[],
) => Promise<Row[]>;

// Where the embedded database keeps its files when DATABASE_URL is unset.
const EMBEDDED_PATH = ".data/pg";

// Route bundles do not share module instances, so the connection lives on
// globalThis. An embedded database can only be open in one process.
const globalForDb = globalThis as typeof globalThis & {
  workbotDatabase?: Promise<{ query: DatabaseQuery }>;
};

function isPostgresUrl(url: string) {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function openPostgres(url: string) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  return {
    query: (text: string, params: unknown[] = []) =>
      sql.unsafe<Row[]>(text, params as never[]),
  };
}

function openEmbedded(url: string) {
  const database = new PGlite(url || EMBEDDED_PATH);

  return {
    query: async (text: string, params: unknown[] = []) =>
      (await database.query<Row>(text, params)).rows,
  };
}

async function open(url: string) {
  const database = isPostgresUrl(url)
    ? openPostgres(url)
    : openEmbedded(url === "memory://" ? "memory://" : url);

  for (const statement of schemaStatements) await database.query(statement);
  return database;
}

/**
 * Runs one statement with `$1` to `$n` parameters and returns the rows as
 * objects. A `postgres://` URL uses postgres.js; `memory://` and any other
 * value use an embedded PGlite database.
 */
export async function query(
  text: string,
  params: unknown[] = [],
): Promise<Row[]> {
  const url = config.databaseUrl || EMBEDDED_PATH;

  // A failed connection is not cached, so the next call tries again.
  const database = await (globalForDb.workbotDatabase ??= open(url).catch(
    (error: unknown) => {
      delete globalForDb.workbotDatabase;
      throw error;
    },
  ));

  return database.query(text, params);
}
