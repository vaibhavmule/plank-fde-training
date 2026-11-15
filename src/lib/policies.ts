import "server-only";

import { cacheLife } from "next/cache";

import {
  getDocument,
  listDocuments,
  type KnowledgeDocument,
} from "@/lib/knowledge";

// Policies are the `policies` section of the knowledge base. This module is
// the thin view the Day 4 pages already use, so they keep working while the
// corpus grows around them.
const POLICY_SECTION = "policies";

export type PolicyMeta = {
  slug: string;
  title: string;
  team: string;
  updatedAt: string;
  summary: string;
};

export type Policy = PolicyMeta & { body: string };

/** A published policy shows a team and a summary, so both are required. */
function toPolicy(document: KnowledgeDocument): Policy | null {
  if (!document.team || !document.summary) return null;

  return {
    slug: document.slug,
    title: document.title,
    team: document.team,
    updatedAt: document.updated,
    summary: document.summary,
    body: document.body,
  };
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
  const documents = await listDocuments();

  return documents
    .filter((document) => document.section === POLICY_SECTION)
    .map(toPolicy)
    .filter((policy): policy is Policy => policy !== null);
}

/** One policy straight from disk, or null when the slug is unknown. */
export async function loadPolicy(slug: unknown): Promise<Policy | null> {
  if (typeof slug !== "string" || slug === "") return null;

  const document = await getDocument(`${POLICY_SECTION}/${slug}`);
  return document ? toPolicy(document) : null;
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

/** One policy by slug, or null when the slug is unknown. */
export async function getPolicy(slug: unknown): Promise<Policy | null> {
  // Checked before any file access and before a cache entry is created.
  if (typeof slug !== "string") return null;
  return readPolicy(slug);
}
