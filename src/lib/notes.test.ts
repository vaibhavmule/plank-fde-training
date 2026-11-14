import { beforeEach, describe, expect, test, vi } from "vitest";

import { query } from "@/lib/db";
import { noteSchema } from "@/lib/note-model";
import { listNotes, saveNote } from "@/lib/notes";
import { resetNotes } from "@/lib/test-fixtures";

vi.mock("server-only", () => ({}));

beforeEach(async () => {
  await resetNotes();
});

describe("saveNote", () => {
  test("stores a trimmed note with a UUID and creation time", async () => {
    const note = await saveNote({
      title: "  Refund limit  ",
      body: "  $200 per agent.\n",
    });

    expect(note).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      title: "Refund limit",
      body: "$200 per agent.",
      createdAt: expect.any(String),
    });
    expect(noteSchema.parse(note)).toEqual(note);
    expect(await listNotes()).toEqual([note]);
  });

  test("defaults an omitted title to empty", async () => {
    await expect(saveNote({ body: "Remember this" })).resolves.toMatchObject({
      title: "",
      body: "Remember this",
    });
  });

  test("accepts the maximum title and body lengths", async () => {
    const note = await saveNote({
      title: "a".repeat(120),
      body: "b".repeat(10_000),
    });

    expect(note.title).toHaveLength(120);
    expect(note.body).toHaveLength(10_000);
  });

  test.each([
    {},
    { body: "" },
    { body: "   " },
    { body: null },
    { body: "a".repeat(10_001) },
    { body: "ok", title: "a".repeat(121) },
  ])("rejects invalid input %j without writing", async (input) => {
    await expect(saveNote(input)).rejects.toThrow();
    expect(await listNotes()).toEqual([]);
  });
});

describe("listNotes", () => {
  test("lists newest first and respects the limit", async () => {
    await query(
      `insert into notes (title, body, created_at) values
        ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)`,
      [
        "Older",
        "a",
        "2026-11-14T09:00:00Z",
        "Middle",
        "b",
        "2026-11-14T10:00:00Z",
        "Newer",
        "c",
        "2026-11-14T11:00:00Z",
      ],
    );

    expect((await listNotes()).map(({ title }) => title)).toEqual([
      "Newer",
      "Middle",
      "Older",
    ]);
    expect((await listNotes(2)).map(({ title }) => title)).toEqual([
      "Newer",
      "Middle",
    ]);
  });

  test("returns both notes when their timestamps tie, newest insertion first", async () => {
    const at = "2026-11-14T10:00:00Z";
    await query(
      `insert into notes (title, body, created_at) values
        ($1, $2, $3), ($4, $5, $6)`,
      ["Tie A", "a", at, "Tie B", "b", at],
    );

    expect((await listNotes()).map(({ title }) => title)).toEqual([
      "Tie B",
      "Tie A",
    ]);
  });
});
