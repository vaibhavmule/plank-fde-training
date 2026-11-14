import "server-only";

import { io } from "next/cache";

import { query, type Row } from "@/lib/db";
import {
  requestIdSchema,
  requestInputSchema,
  statusSchema,
  workRequestSchema,
  type RequestFilters,
  type WorkRequest,
} from "@/lib/request-model";

// Written into the select list so rows arrive in the shape the schema expects
// and no mapping code is needed.
const COLUMNS = `id, title, details, team, priority, status, created_at as "createdAt"`;

export async function createRequest(input: unknown): Promise<WorkRequest> {
  const parsed = requestInputSchema.parse(input);
  await io();

  const rows = await query(
    `insert into requests (title, details, team, priority)
     values ($1, $2, $3, $4)
     returning ${COLUMNS}`,
    [parsed.title, parsed.details, parsed.team, parsed.priority],
  );

  return parseRow(rows[0]);
}

export async function listRequests(
  filters: RequestFilters = {},
): Promise<WorkRequest[]> {
  await io();

  const rows = await query(
    `select ${COLUMNS} from requests
     where ($1::text is null or team = $1)
       and ($2::text is null or status = $2)
     order by created_at desc, seq desc`,
    [filters.team ?? null, filters.status ?? null],
  );

  return rows.map(parseRow);
}

export async function getRequest(id: string): Promise<WorkRequest | undefined> {
  await io();

  // An id that is not a UUID is not found, before any query runs.
  const parsedId = requestIdSchema.safeParse(id);
  if (!parsedId.success) return undefined;

  const rows = await query(`select ${COLUMNS} from requests where id = $1`, [
    parsedId.data,
  ]);

  return rows[0] && parseRow(rows[0]);
}

// Returns undefined, without writing, for an invalid id, an unknown id, or a
// status outside the enum, so a tampered action cannot change anything.
export async function updateRequestStatus(
  id: unknown,
  status: unknown,
): Promise<WorkRequest | undefined> {
  const parsedId = requestIdSchema.safeParse(id);
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedId.success || !parsedStatus.success) return undefined;

  await io();

  const rows = await query(
    `update requests set status = $2 where id = $1 returning ${COLUMNS}`,
    [parsedId.data, parsedStatus.data],
  );

  return rows[0] && parseRow(rows[0]);
}

export type RequestSummary = {
  total: number;
  byStatus: Record<WorkRequest["status"], number>;
  byTeam: Record<WorkRequest["team"], number>;
  byPriority: Record<WorkRequest["priority"], number>;
  latest: WorkRequest[];
};

/**
 * One grouped query for the numbers a generated page may use, plus the ten
 * latest requests. The JSON aggregate keeps the latest rows in the same
 * statement as the counts.
 */
export async function requestSummary(): Promise<RequestSummary> {
  await io();

  const rows = await query(
    `with latest as (
       select ${COLUMNS} from requests
       order by created_at desc, seq desc
       limit 10
     )
     select
       count(*)::int as total,
       count(*) filter (where status = 'open')::int as open,
       count(*) filter (where status = 'in_progress')::int as in_progress,
       count(*) filter (where status = 'closed')::int as closed,
       count(*) filter (where team = 'operations')::int as operations,
       count(*) filter (where team = 'finance')::int as finance,
       count(*) filter (where team = 'support')::int as support,
       count(*) filter (where priority = 'low')::int as low,
       count(*) filter (where priority = 'medium')::int as medium,
       count(*) filter (where priority = 'high')::int as high,
       (select coalesce(json_agg(row_to_json(latest)), '[]'::json) from latest) as latest
     from requests`,
  );

  const row = rows[0] ?? {};
  const count = (value: unknown) => Number(value ?? 0);
  const latest = Array.isArray(row.latest) ? row.latest : [];

  return {
    total: count(row.total),
    byStatus: {
      open: count(row.open),
      in_progress: count(row.in_progress),
      closed: count(row.closed),
    },
    byTeam: {
      operations: count(row.operations),
      finance: count(row.finance),
      support: count(row.support),
    },
    byPriority: {
      low: count(row.low),
      medium: count(row.medium),
      high: count(row.high),
    },
    latest: latest.map((item) => parseRow(item as Row)),
  };
}

// Postgres returns timestamptz as a Date, and the schema wants an ISO string.
function parseRow(row: Row): WorkRequest {
  const createdAt = row.createdAt;
  return workRequestSchema.parse({
    ...row,
    createdAt:
      createdAt instanceof Date
        ? createdAt.toISOString()
        : new Date(String(createdAt)).toISOString(),
  });
}
