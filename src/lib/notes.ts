import "server-only";

import { query, type Row } from "@/lib/db";
import { noteInputSchema, noteSchema, type Note } from "@/lib/note-model";

const COLUMNS = `id, title, body, created_at as "createdAt"`;

export async function saveNote(input: unknown): Promise<Note> {
  const parsed = noteInputSchema.parse(input);

  const rows = await query(
    `insert into notes (title, body)
     values ($1, $2)
     returning ${COLUMNS}`,
    [parsed.title, parsed.body],
  );

  return parseRow(rows[0]);
}

export async function listNotes(limit = 50): Promise<Note[]> {
  const rows = await query(
    `select ${COLUMNS} from notes
     order by created_at desc, seq desc
     limit $1`,
    [limit],
  );

  return rows.map(parseRow);
}

// Postgres returns timestamptz as a Date, and the schema wants an ISO string.
function parseRow(row: Row): Note {
  const createdAt = row.createdAt;
  return noteSchema.parse({
    ...row,
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
  });
}
