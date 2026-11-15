import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { query } from "@/lib/db";
import { relevance, vectorLiteral, type Embedder } from "@/lib/embeddings";

// The knowledge base is one folder per section of documents:
// content/knowledge/<section>/<slug>.md.
const KNOWLEDGE_DIR = path.join(process.cwd(), "content", "knowledge");

// Markdown files in a folder that are instructions, not documents.
const IGNORED_FILES = new Set(["CLAUDE.md"]);

// Lowercase words joined by single hyphens, so a name can never reach outside
// the folder it was read from.
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 80;
const MAX_RESULTS = 20;
const DEFAULT_RESULTS = 10;

export const knowledgeFrontMatterSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  owner: z.string().trim().min(1).max(60),
  updated: z.iso.date(),
  summary: z.string().trim().min(1).max(240).optional(),
  // Policies are also shown on the Day 4 pages, which group them by team.
  team: z.enum(["operations", "finance", "support"]).optional(),
});

export type KnowledgeMeta = z.infer<typeof knowledgeFrontMatterSchema> & {
  /** `<section>/<slug>`, the path every tool takes. */
  path: string;
  section: string;
  slug: string;
};

export type KnowledgeDocument = KnowledgeMeta & { body: string };

/** One `##` section of a document: the unit a search returns. */
export type Chunk = {
  path: string;
  section: string;
  slug: string;
  title: string;
  heading: string;
  position: number;
  text: string;
};

export type FindMode = "meaning" | "words";

export type FindResult = {
  path: string;
  section: string;
  slug: string;
  title: string;
  heading: string;
  /** A document path a person could open: `<section>/<slug>#<heading>`. */
  ref: string;
  text: string;
  /** Cosine similarity in meaning mode, a term rank in words mode. */
  score: number;
};

export type FindOutcome = {
  mode: FindMode;
  results: FindResult[];
};

export type GrepResult = {
  path: string;
  heading: string;
  line: number;
  text: string;
};

export type IndexReport = {
  documents: number;
  chunks: number;
  embedded: number;
};

/** A path segment that is a safe folder or file name. */
function isName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_NAME_LENGTH &&
    NAME_PATTERN.test(value)
  );
}

function unquote(value: string, line: string) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
    } catch {}
    throw new Error(`badly quoted value: ${line}`);
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

// Front matter is a flat list of `key: value` lines, not full YAML.
function parseFrontMatter(block: string) {
  const fields: Record<string, string> = {};

  for (const line of block.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const match = /^([A-Za-z][A-Za-z0-9]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!match) throw new Error(`unreadable front matter line: ${line}`);
    const [, key, value = ""] = match;
    if (Object.hasOwn(fields, key)) throw new Error(`duplicate field: ${key}`);
    fields[key] = unquote(value.trim(), line);
  }

  return fields;
}

/**
 * Validates one document. Throws with its path in the message, so a malformed
 * file fails the build instead of disappearing from search.
 */
export function parseDocument(
  documentPath: string,
  source: string,
): KnowledgeDocument {
  try {
    const [section, slug, ...rest] = documentPath.split("/");
    if (rest.length > 0) throw new Error("path is not <section>/<slug>");
    if (!isName(section) || !isName(slug)) {
      throw new Error("section and slug must be lowercase-kebab");
    }

    const match =
      /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(
        source,
      );
    if (!match) throw new Error("missing front matter block");

    const meta = knowledgeFrontMatterSchema.safeParse(
      parseFrontMatter(match[1]),
    );
    if (!meta.success) throw new Error(z.prettifyError(meta.error));

    const body = match[2].trim();
    if (body === "") throw new Error("empty body");

    return { path: documentPath, section, slug, ...meta.data, body };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid knowledge document "${documentPath}": ${reason}`, {
      cause: error,
    });
  }
}

/** Every section folder, sorted, without the files that are instructions. */
async function sectionsOnDisk(): Promise<string[]> {
  const entries = await readdir(KNOWLEDGE_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      if (!isName(entry.name)) {
        throw new Error(
          `Invalid knowledge section "${entry.name}": use lowercase-kebab.`,
        );
      }
      return entry.name;
    })
    .sort();
}

async function documentSlugs(section: string): Promise<string[]> {
  const names = await readdir(path.join(KNOWLEDGE_DIR, section));

  return names
    .filter((name) => name.endsWith(".md") && !IGNORED_FILES.has(name))
    .map((name) => {
      const slug = name.slice(0, -".md".length);
      if (!isName(slug)) {
        throw new Error(
          `Invalid knowledge filename "${name}": use lowercase-kebab.md`,
        );
      }
      return slug;
    })
    .sort();
}

/** Every document on disk, oldest name first within each section. */
export async function listDocuments(): Promise<KnowledgeDocument[]> {
  const sections = await sectionsOnDisk();
  const documents: KnowledgeDocument[] = [];

  for (const section of sections) {
    for (const slug of await documentSlugs(section)) {
      const documentPath = `${section}/${slug}`;
      const source = await readFile(
        path.join(KNOWLEDGE_DIR, section, `${slug}.md`),
        "utf8",
      );
      documents.push(parseDocument(documentPath, source));
    }
  }

  return documents;
}

/** Every section name, for a root listing. */
export async function listSections(): Promise<string[]> {
  return sectionsOnDisk();
}

/** One document by `<section>/<slug>`, or null when the path is unknown. */
export async function getDocument(
  documentPath: string,
): Promise<KnowledgeDocument | null> {
  const [section, slug, ...rest] = documentPath.split("/");
  if (rest.length > 0 || !isName(section) || !isName(slug)) return null;

  let sections: string[];
  try {
    sections = await sectionsOnDisk();
  } catch {
    return null;
  }
  if (!sections.includes(section)) return null;

  try {
    const source = await readFile(
      path.join(KNOWLEDGE_DIR, section, `${slug}.md`),
      "utf8",
    );
    return parseDocument(documentPath, source);
  } catch {
    return null;
  }
}

/** A heading as a path fragment: lowercase, single hyphens. */
export function headingSlug(heading: string): string {
  return heading
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-");
}

/**
 * Splits a document at its `##` headings, so each section becomes one chunk
 * stored with the document's title and heading. A search hit is then a place a
 * person could open, and the chunk still says what it is about.
 */
export function chunksOf(document: KnowledgeDocument): Chunk[] {
  const chunks: Chunk[] = [];
  let heading = "";
  let lines: string[] = [];

  const flush = () => {
    const text = lines.join("\n").trim();
    // A heading with no body carries no text to find or read.
    if (text === "" && heading === "") return;

    chunks.push({
      path: document.path,
      section: document.section,
      slug: document.slug,
      title: document.title,
      heading,
      position: chunks.length,
      text,
    });
  };

  for (const line of document.body.split(/\r?\n/)) {
    const match = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (!match) {
      lines.push(line);
      continue;
    }

    flush();
    heading = match[1].trim();
    lines = [];
  }

  flush();
  return chunks;
}

/** True once the `embedding` column exists, which needs pgvector. */
let vectorColumn: Promise<boolean> | undefined;

function hasVectorColumn(): Promise<boolean> {
  vectorColumn ??= query(
    `select 1 from information_schema.columns
      where table_name = 'chunks' and column_name = 'embedding'`,
  )
    .then((rows) => rows.length > 0)
    .catch(() => false);

  return vectorColumn;
}

export async function chunkCount(): Promise<number> {
  const [row] = await query("select count(*)::int as count from chunks");
  return Number(row?.count ?? 0);
}

/**
 * Writes every chunk to the `chunks` table. Each document's chunks are
 * replaced, so a rebuild after an edit leaves other documents alone. With an
 * embedder, each chunk also gets a vector; without one, search uses words only.
 */
export async function indexKnowledge(
  embedder?: Embedder,
  documents?: KnowledgeDocument[],
): Promise<IndexReport> {
  const all = documents ?? (await listDocuments());
  const withVectors = embedder ? await hasVectorColumn() : false;

  let chunks = 0;
  let embedded = 0;

  for (const document of all) {
    const documentChunks = chunksOf(document);
    const vectors =
      embedder && withVectors
        ? await embedder.documents(
            documentChunks.map((chunk) => chunkTextForEmbedding(chunk)),
          )
        : undefined;

    await query("delete from chunks where path = $1", [document.path]);

    for (const [index, chunk] of documentChunks.entries()) {
      const vector = vectors?.[index];

      if (vector) {
        await query(
          `insert into chunks
            (path, section, slug, title, heading, position, text, updated, embedding)
           values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::vector)`,
          [
            chunk.path,
            chunk.section,
            chunk.slug,
            chunk.title,
            chunk.heading,
            chunk.position,
            chunk.text,
            document.updated,
            vectorLiteral(vector),
          ],
        );
        embedded += 1;
      } else {
        await query(
          `insert into chunks
            (path, section, slug, title, heading, position, text, updated)
           values ($1, $2, $3, $4, $5, $6, $7, $8::date)`,
          [
            chunk.path,
            chunk.section,
            chunk.slug,
            chunk.title,
            chunk.heading,
            chunk.position,
            chunk.text,
            document.updated,
          ],
        );
      }

      chunks += 1;
    }
  }

  return { documents: all.length, chunks, embedded };
}

/**
 * A chunk's text as the embedder sees it. Without the title and heading, a
 * section such as "## Limits" would lose the subject it is a limit of.
 */
function chunkTextForEmbedding(chunk: Chunk): string {
  const label = chunk.heading
    ? `${chunk.title} — ${chunk.heading}`
    : chunk.title;
  return `${label}\n\n${chunk.text}`;
}

/** True when no chunk is indexed yet, so a caller can build it on first use. */
export async function needsIndex(): Promise<boolean> {
  return (await chunkCount()) === 0;
}

/**
 * Builds the index on first use, so a fresh database answers the first
 * question without a separate step.
 */
export async function ensureIndexed(embedder?: Embedder): Promise<void> {
  if (await needsIndex()) await indexKnowledge(embedder);
}

/** True when some chunk carries a vector, so meaning search can run. */
async function hasEmbeddings(): Promise<boolean> {
  if (!(await hasVectorColumn())) return false;

  const [row] = await query(
    "select 1 as found from chunks where embedding is not null limit 1",
  );
  return row !== undefined;
}

// Question words joined with `|` so a chunk matching any of them is a
// candidate. The words hold letters and digits only, so no operator can reach
// the query.
function tsQuery(text: string): string {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);

  return [...new Set(words)].join(" | ");
}

const SELECT_COLUMNS = `path, section, slug, title, heading, position, text`;

function toFindResult(row: Record<string, unknown>, score: number): FindResult {
  const heading = String(row.heading ?? "");
  const path = String(row.path);

  return {
    path,
    section: String(row.section),
    slug: String(row.slug),
    title: String(row.title),
    heading,
    ref: heading ? `${path}#${headingSlug(heading)}` : path,
    text: String(row.text),
    score,
  };
}

export type FindOptions = {
  /** The embedder for the question. Without one, search uses words. */
  embedder?: Embedder;
  /** Limit results to these sections, and to nothing else. */
  sections?: readonly string[];
  limit?: number;
};

/**
 * The chunks closest to a question, best first. With embeddings it searches by
 * meaning, using cosine distance; otherwise it matches any of the question's
 * words and ranks by the terms it found. Both modes stay inside `sections`.
 */
export async function find(
  text: string,
  options: FindOptions = {},
): Promise<FindOutcome> {
  const question = text.trim();
  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_RESULTS, 1),
    MAX_RESULTS,
  );
  if (question === "") return { mode: "words", results: [] };

  const sections = options.sections ? [...options.sections] : undefined;
  if (sections && sections.length === 0) return { mode: "words", results: [] };

  if (options.embedder && (await hasEmbeddings())) {
    const vector = vectorLiteral(await options.embedder.query(question));
    const params: unknown[] = [vector];
    let scope = "";
    if (sections) {
      params.push(sections);
      scope = `and section = any($${params.length}::text[])`;
    }
    params.push(limit);

    const rows = await query(
      `select ${SELECT_COLUMNS}, embedding <=> $1::vector as distance
        from chunks
        where embedding is not null ${scope}
        order by distance
        limit $${params.length}`,
      params,
    );

    return {
      mode: "meaning",
      results: rows.map((row) =>
        toFindResult(row, relevance(Number(row.distance))),
      ),
    };
  }

  const terms = tsQuery(question);
  if (terms === "") return { mode: "words", results: [] };

  const params: unknown[] = [terms];
  let scope = "";
  if (sections) {
    params.push(sections);
    scope = `and section = any($${params.length}::text[])`;
  }
  params.push(limit);

  const rows = await query(
    `with q as (select to_tsquery('english', $1) as terms)
      select ${SELECT_COLUMNS}, ts_rank(search, q.terms) as rank
      from chunks, q
      where search @@ q.terms ${scope}
      order by rank desc, path, position
      limit $${params.length}`,
    params,
  );

  return {
    mode: "words",
    results: rows.map((row) => toFindResult(row, Number(row.rank))),
  };
}

/** The rows a `grep` prints, capped so a broad pattern cannot flood a prompt. */
export const MAX_GREP_RESULTS = 40;

/**
 * Lines that match a regular expression, across the whole knowledge base or in
 * one document. Matching is case-insensitive and stops at `MAX_GREP_RESULTS`.
 */
export async function grep(
  pattern: string,
  documentPath?: string,
): Promise<GrepResult[]> {
  const source = pattern.trim();
  if (source === "") return [];

  let expression: RegExp;
  try {
    expression = new RegExp(source, "i");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`"${source}" is not a valid regular expression: ${reason}`);
  }

  const documents = documentPath
    ? [await getDocument(documentPath)].filter(
        (entry): entry is KnowledgeDocument => entry !== null,
      )
    : await listDocuments();

  const matches: GrepResult[] = [];

  for (const document of documents) {
    let heading = "";

    for (const [index, line] of document.body.split(/\r?\n/).entries()) {
      const start = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
      if (start) {
        heading = start[1].trim();
        continue;
      }

      if (!expression.test(line)) continue;

      matches.push({
        path: document.path,
        heading,
        line: index + 1,
        text: line.trim(),
      });

      if (matches.length >= MAX_GREP_RESULTS) return matches;
    }
  }

  return matches;
}
