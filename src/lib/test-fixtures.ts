import "server-only";

import { query } from "@/lib/db";
import type { WorkRequest } from "@/lib/request-model";

/** Empties the table between tests. */
export async function resetRequests() {
  await query("delete from requests");
}

/** Empties the notes table between tests. */
export async function resetNotes() {
  await query("delete from notes");
}

/**
 * Inserts rows directly, so a test can set every column, including an id and a
 * `createdAt` the app would otherwise choose.
 */
export async function seedRequests(requests: WorkRequest[]) {
  for (const request of requests) {
    await query(
      `insert into requests (id, title, details, team, priority, status, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        request.id,
        request.title,
        request.details,
        request.team,
        request.priority,
        request.status,
        request.createdAt,
      ],
    );
  }
}
