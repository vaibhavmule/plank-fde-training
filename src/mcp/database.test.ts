import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { databaseServer } from "./database";
import { query } from "@/lib/db";
import { createRequest } from "@/lib/requests";
import { resetRequests } from "@/lib/test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

// The SDK's result type is a union; every tool here returns text.
type ToolResult = {
  content: { type: string; text?: string }[];
  isError?: boolean;
};

function textOf(result: unknown) {
  const { content } = result as ToolResult;
  return content
    .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
    .join("");
}

async function connect() {
  const server = databaseServer(query);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.1.0" });
  await client.connect(clientTransport);

  return client;
}

beforeEach(async () => {
  await resetRequests();
  await createRequest({
    title: "Replace keyboard",
    team: "support",
    priority: "high",
  });
});

describe("database MCP server", () => {
  test("query returns rows from one statement", async () => {
    const client = await connect();

    const result = await client.callTool({
      name: "query",
      arguments: { sql: "select title, team from requests" },
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(textOf(result));
    expect(body.rowCount).toBe(1);
    expect(body.rows).toEqual([{ title: "Replace keyboard", team: "support" }]);
  });

  test("query reports a failing statement as an error result", async () => {
    const client = await connect();

    const result = await client.callTool({
      name: "query",
      arguments: { sql: "select * from missing_table" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/missing_table/);
  });

  test("schema lists the table's columns and constraints", async () => {
    const client = await connect();

    const body = JSON.parse(
      textOf(await client.callTool({ name: "schema", arguments: {} })),
    );

    const columns = body.columns.filter(
      (column: { table: string }) => column.table === "requests",
    );
    expect(columns.map((column: { name: string }) => column.name)).toEqual(
      expect.arrayContaining(["id", "title", "team", "status", "created_at"]),
    );
    expect(
      body.constraints.some(
        (constraint: { table: string; definition: string }) =>
          constraint.table === "requests" &&
          constraint.definition.includes("CHECK"),
      ),
    ).toBe(true);
  });

  test("describe-table returns columns, a row count and sample rows", async () => {
    const client = await connect();

    const result = await client.callTool({
      name: "describe-table",
      arguments: { table: "requests" },
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(textOf(result));
    expect(body.rowCount).toBe(1);
    expect(body.sampleRows[0].title).toBe("Replace keyboard");
    expect(
      body.columns.map((column: { name: string }) => column.name),
    ).toContain("id");
  });

  test("describe-table refuses a name that is not a table", async () => {
    const client = await connect();

    const result = await client.callTool({
      name: "describe-table",
      arguments: { table: "requests; drop table requests" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unknown table");
  });

  test("the tables resource lists the tables", async () => {
    const client = await connect();

    const resource = await client.readResource({ uri: "db://tables" });

    const [{ text }] = resource.contents as { text: string }[];
    expect(JSON.parse(text).tables).toContain("requests");
  });
});
