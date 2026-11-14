import "server-only";

import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

import { query, type Row } from "@/lib/db";

/** The three kinds of lasting fact WorkBot keeps about a person. */
export const MEMORY_KINDS = ["preference", "entity", "case"] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_LABELS: Record<MemoryKind, string> = {
  preference: "Preferences",
  entity: "People and systems",
  case: "Cases",
};

const memorySchema = z.object({
  id: z.uuid(),
  kind: z.enum(MEMORY_KINDS),
  text: z.string(),
  createdAt: z.iso.datetime(),
});

export type Memory = z.infer<typeof memorySchema>;

export type ExtractedMemory = {
  kind: MemoryKind;
  text: string;
};

const extractedMemorySchema = z.object({
  kind: z.enum(MEMORY_KINDS).describe("What kind of fact this is"),
  text: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe('One short sentence about "the person"'),
});

const extractionSchema = z.object({
  memories: z
    .array(extractedMemorySchema)
    .max(3)
    .describe("The lasting facts that are new, at most three"),
});

export type Exchange = { user: string; assistant: string };

const COLUMNS = `id, kind, text, created_at as "createdAt"`;

/** The visitor's memories, oldest first, so the settings page groups cleanly. */
export async function listMemories(visitor: string): Promise<Memory[]> {
  const rows = await query(
    `select ${COLUMNS} from memories
     where visitor = $1
     order by created_at, id`,
    [visitor],
  );

  return rows.map(parseRow);
}

/**
 * Inserts the facts that are new. A sentence the visitor already has is left
 * alone, whatever its kind, so the same statement twice stays one memory.
 */
export async function remember(
  visitor: string,
  memories: readonly ExtractedMemory[],
): Promise<Memory[]> {
  const facts = z.array(extractedMemorySchema).parse(memories);
  const stored: Memory[] = [];

  for (const fact of facts) {
    const rows = await query(
      `insert into memories (visitor, kind, text)
       values ($1, $2, $3)
       on conflict (visitor, text) do nothing
       returning ${COLUMNS}`,
      [visitor, fact.kind, fact.text],
    );

    if (rows[0]) stored.push(parseRow(rows[0]));
  }

  return stored;
}

/**
 * Deletes one memory, scoped to the visitor, so an id from someone else's
 * settings page changes nothing. An id that is not a UUID is not found.
 */
export async function forget(visitor: string, id: unknown): Promise<boolean> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return false;

  const rows = await query(
    `delete from memories
     where id = $1 and visitor = $2
     returning id`,
    [parsed.data, visitor],
  );

  return rows.length > 0;
}

/** Deletes every memory the visitor has, and returns how many there were. */
export async function forgetAll(visitor: string): Promise<number> {
  const rows = await query(
    `delete from memories where visitor = $1 returning id`,
    [visitor],
  );

  return rows.length;
}

/** The note the system prompt carries, or an empty string when there is none. */
export function memoryNote(memories: readonly Memory[]): string {
  if (memories.length === 0) return "";

  return [
    "What you know about the person from earlier conversations:",
    ...memories.map((memory) => `- ${memory.kind}: ${memory.text}`),
    "Use these facts when they are relevant. Do not read the list back to the person.",
  ].join("\n");
}

const EXTRACTION_RULES = `Read one exchange between a person and WorkBot and return the lasting facts about the person that would improve a later conversation.

Keep three kinds of fact:
- preference: how the person wants answers, such as the tone, format or level of detail.
- entity: the team, systems, vendors, customers or people they work with.
- case: the requests or problems they are working on.

Write each fact as one short sentence about "the person". Record nothing that WorkBot said, and do not repeat a fact that is already known. Return at most three facts, and none when there is nothing lasting.`;

/**
 * Reads one exchange and returns the new facts about the person. The known
 * facts go into the instructions so the model returns what is new, and the
 * unique constraint catches anything it repeats anyway.
 */
export async function extractMemories(
  model: LanguageModel,
  exchange: Exchange,
  known: readonly Memory[],
): Promise<ExtractedMemory[]> {
  const knownFacts = known.length
    ? known.map((memory) => `- ${memory.text}`).join("\n")
    : "None.";

  const result = await generateText({
    model,
    output: Output.object({ schema: extractionSchema }),
    system: `${EXTRACTION_RULES}\n\nAlready known about the person:\n${knownFacts}`,
    prompt: `The person asked:\n${exchange.user}\n\nWorkBot replied:\n${exchange.assistant}`,
  });

  return result.output.memories;
}

// Postgres returns timestamptz as a Date, and the schema wants an ISO string.
function parseRow(row: Row): Memory {
  const createdAt = row.createdAt;
  return memorySchema.parse({
    ...row,
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
  });
}
