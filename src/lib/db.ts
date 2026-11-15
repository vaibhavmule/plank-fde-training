import "server-only";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
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
  workbotDatabase?: Promise<{
    query: DatabaseQuery;
    /** Releases the connection, for a program that is about to exit. */
    close: () => Promise<void>;
  }>;
};

function isPostgresUrl(url: string) {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function openPostgres(url: string) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  return {
    query: (text: string, params: unknown[] = []) =>
      sql.unsafe<Row[]>(text, params as never[]),
    close: () => sql.end({ timeout: 5 }),
  };
}

function openEmbedded(url: string) {
  // The embedded database loads pgvector from the extension package, so tests
  // run the same SQL a server with the extension does.
  const database = new PGlite({
    dataDir: url || EMBEDDED_PATH,
    extensions: { vector },
  });

  return {
    query: async (text: string, params: unknown[] = []) =>
      (await database.query<Row>(text, params)).rows,
    close: () => database.close(),
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

/**
 * Closes the connection so a one-shot program such as an index build can exit.
 * A request handler never calls this: Next keeps the pool for the next request.
 */
export async function closeDatabase(): Promise<void> {
  const pending = globalForDb.workbotDatabase;
  delete globalForDb.workbotDatabase;
  if (pending) await (await pending).close();
}
