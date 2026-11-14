import postgres from "postgres";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { databaseServer, type McpQuery } from "@/mcp/database";

const url = process.env.DATABASE_URL ?? "";

if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
  // An embedded database can only be open in one process, so a second one
  // started here would not see the app's data.
  console.error(
    "mcp/database: DATABASE_URL must be a postgres:// URL. An embedded PGlite database can only be open in one process.",
  );
  process.exit(1);
}

// Read-only is enforced by the database, not by the prompt: Postgres rejects
// every write, whatever SQL the model sends.
const sql = postgres(url, {
  max: 1,
  onnotice: () => {},
  connection: { default_transaction_read_only: true },
});

const query: McpQuery = (text, params = []) =>
  sql.unsafe(text, params as never[]);

async function main() {
  const server = databaseServer(query);
  await server.connect(new StdioServerTransport());
}

void main();
