import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { z } from "zod";

// The only module that reads content/policies. Pages import from here.
const POLICIES_DIR = path.join(process.cwd(), "content", "policies");

// Markdown files in the folder that are instructions, not policies.
const IGNORED_FILES = new Set(["CLAUDE.md"]);

// Lowercase words joined by single hyphens. No dots, slashes or encoded
// characters can pass, so a slug can never name a path outside the folder.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 80;

export const policyMetaSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  team: z.string().trim().min(1).max(40),
  updatedAt: z.iso.date(),
  summary: z.string().trim().min(1).max(240),
});

export type PolicyMeta = z.infer<typeof policyMetaSchema> & { slug: string };
export type Policy = PolicyMeta & { body: string };

export function isPolicySlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(value)
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

/** Validates one policy file. Throws with the slug in the message if it is invalid. */
export function parsePolicy(slug: string, source: string): Policy {
  try {
    if (!isPolicySlug(slug)) throw new Error("slug is not lowercase-kebab");
    const match =
      /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(
        source,
      );
    if (!match) throw new Error("missing front matter block");
    const meta = policyMetaSchema.safeParse(parseFrontMatter(match[1]));
    if (!meta.success) throw new Error(z.prettifyError(meta.error));
    const body = match[2].trim();
    if (body === "") throw new Error("empty body");
    return { slug, ...meta.data, body };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid policy "${slug}": ${reason}`, { cause: error });
  }
}

// Slugs come from filenames, so each one is unique. A file that is not
// named like a slug fails the build instead of being skipped silently.
async function policySlugs(): Promise<string[]> {
  const names = await readdir(POLICIES_DIR);
  return names
    .filter((name) => name.endsWith(".md") && !IGNORED_FILES.has(name))
    .map((name) => {
      const slug = name.slice(0, -".md".length);
      if (!isPolicySlug(slug)) {
        throw new Error(
          `Invalid policy filename "${name}": use lowercase-kebab.md`,
        );
      }
      return slug;
    });
}

async function readPolicyFile(slug: string): Promise<Policy> {
  const source = await readFile(path.join(POLICIES_DIR, `${slug}.md`), "utf8");
  return parsePolicy(slug, source);
}

function toMeta(policy: Policy): PolicyMeta {
  const { title, team, updatedAt, summary, slug } = policy;
  return { slug, title, team, updatedAt, summary };
}

/**
 * Every policy straight from disk, without Next's cache. The terminal and the
 * research chain are not inside a request, where `cacheLife` is unavailable.
 */
export async function loadPolicies(): Promise<Policy[]> {
  return Promise.all((await policySlugs()).map(readPolicyFile));
}

/** One policy straight from disk, or null when the slug is unsafe or unknown. */
export async function loadPolicy(slug: unknown): Promise<Policy | null> {
  if (!isPolicySlug(slug)) return null;
  if (!(await policySlugs()).includes(slug)) return null;
  return readPolicyFile(slug);
}

/** Metadata for every policy, sorted by title. */
export async function listPolicies(): Promise<PolicyMeta[]> {
  "use cache";
  cacheLife("max");

  return (await loadPolicies())
    .map(toMeta)
    .sort((a, b) => a.title.localeCompare(b.title, "en"));
}

// Files only change with a deploy, so each read is cached for as long as
// Next.js allows.
async function readPolicy(slug: string): Promise<Policy | null> {
  "use cache";
  cacheLife("max");

  return loadPolicy(slug);
}

/** One policy by slug, or null when the slug is unsafe or unknown. */
export async function getPolicy(slug: unknown): Promise<Policy | null> {
  // Checked before any file access and before a cache entry is created.
  if (!isPolicySlug(slug)) return null;
  return readPolicy(slug);
}
