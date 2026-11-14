import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// How the server reaches the database. The entry point passes a connection
// that Postgres itself keeps read-only; tests pass an embedded database.
export type McpQuery = (
  text: string,
  params?: unknown[],
) => Promise<Record<string, unknown>[]>;

const MAX_ROWS = 100;
const SAMPLE_ROWS = 5;

type TextResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function json(value: unknown): TextResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, jsonReplacer, 2) }],
  };
}

// Dates and bigints do not survive JSON.stringify on their own.
function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  return value;
}

// A tool returns its error as a result, so the model can read it and retry.
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

async function tableNames(query: McpQuery): Promise<string[]> {
  const rows = await query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`,
  );
  return rows.map((row) => String(row.table_name));
}

async function columnsOf(query: McpQuery, table: string) {
  return query(
    `select column_name as name, data_type as type, is_nullable as nullable,
            column_default as "default"
     from information_schema.columns
     where table_schema = 'public' and table_name = $1
     order by ordinal_position`,
    [table],
  );
}

/**
 * A read-only view of WorkBot's database: three tools and one resource.
 * `query` is injected so the caller decides what connection it runs on.
 */
export function databaseServer(query: McpQuery) {
  const server = new McpServer({ name: "workbot-database", version: "0.1.0" });

  server.registerTool(
    "query",
    {
      title: "Run a read-only SQL query",
      description:
        "Runs one SQL statement and returns up to 100 rows as JSON. The connection is read-only, so writes are rejected by the database.",
      inputSchema: {
        sql: z
          .string()
          .min(1)
          .describe("One SQL statement, for example select * from requests"),
      },
    },
    async ({ sql }) => {
      try {
        const rows = await query(sql);
        return json({
          rowCount: rows.length,
          truncated: rows.length > MAX_ROWS,
          rows: rows.slice(0, MAX_ROWS),
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "schema",
    {
      title: "Describe the database schema",
      description:
        "Returns every table in the public schema with its columns, types and defaults, plus its constraints.",
      inputSchema: {},
    },
    async () => {
      try {
        const columns = await query(
          `select table_name as table, column_name as name, data_type as type,
                  is_nullable as nullable, column_default as "default"
           from information_schema.columns
           where table_schema = 'public'
           order by table_name, ordinal_position`,
        );
        const constraints = await query(
          `select t.relname as table, c.conname as name,
                  pg_get_constraintdef(c.oid) as definition
           from pg_constraint c
           join pg_class t on t.oid = c.conrelid
           join pg_namespace n on n.oid = t.relnamespace
           where n.nspname = 'public'
           order by t.relname, c.conname`,
        );
        return json({ columns, constraints });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "describe-table",
    {
      title: "Describe one table",
      description:
        "Returns one table's columns, its row count and five sample rows. The name must be a table that exists.",
      inputSchema: {
        table: z.string().min(1).describe("A table name, for example requests"),
      },
    },
    async ({ table }) => {
      try {
        // Postgres cannot take an identifier as a parameter, so the name is
        // checked against the real table list before it goes into the SQL.
        const tables = await tableNames(query);
        if (!tables.includes(table)) {
          return failure(
            new Error(
              `Unknown table "${table}". Tables: ${tables.join(", ") || "none"}`,
            ),
          );
        }

        const identifier = `"${table}"`;
        const columns = await columnsOf(query, table);
        const [counted] = await query(
          `select count(*) as count from ${identifier}`,
        );
        const sample = await query(
          `select * from ${identifier} limit ${SAMPLE_ROWS}`,
        );

        return json({
          table,
          rowCount: Number(counted.count),
          columns,
          sampleRows: sample,
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerResource(
    "tables",
    "db://tables",
    {
      title: "Tables",
      description: "Every table in the public schema.",
      mimeType: "application/json",
    },
    async (uri) => {
      const tables = await tableNames(query);
      return {
        contents: [
          { uri: uri.href, text: JSON.stringify({ tables }, null, 2) },
        ],
      };
    },
  );

  return server;
}
