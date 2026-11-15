import { z } from "zod";

import { config } from "@/lib/config";
import { voyageEmbedder, type Embedder } from "@/lib/embeddings";
import {
  ensureIndexed,
  find,
  getDocument,
  grep,
  headingSlug,
  listDocuments,
  listSections,
  MAX_GREP_RESULTS,
} from "@/lib/knowledge";
import { tool, type Tool } from "@/lib/tool";

/**
 * The sections a customer may read. The web chat is public until Day 30 adds
 * sign-in, so its tools are scoped to these and it can see nothing else.
 */
export const customerSections = ["faq", "policies"] as const;

/** The most matching chunks `find` returns. */
export const FIND_RESULTS = 10;

export type KnowledgeToolOptions = {
  /** The embedder for `find`. Without one, search matches words. */
  embedder?: Embedder;
  /** Passed to the embedder; a caller outside Next has no `config`. */
  embedderOptions?: { apiKey: string; fetch?: typeof globalThis.fetch };
};

const pathInput = z
  .string()
  .trim()
  .max(200)
  .describe(
    "A path from `ls`: a section such as `policies`, or a document such as `policies/refunds`",
  );

const findInput = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .describe("What to look for, written as the question you are answering"),
});

const lsInput = z.object({
  path: pathInput.optional().describe("Omit it to list the sections"),
});

const catInput = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe(
      "A document path such as `policies/refunds`, or one section of it as `policies/refunds#refund-authority`",
    ),
});

const grepInput = z.object({
  pattern: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("A regular expression, for example `\\$\\d+` or `approval`"),
  path: pathInput
    .optional()
    .describe(
      "One document such as `policies/refunds`; omit it to search everything",
    ),
});

/** True when a path names a section this tool set may read. */
function allowed(path: string, sections: readonly string[]): boolean {
  return sections.includes(path.split("/")[0]);
}

/**
 * The one error a path failure returns. A scoped tool throws it for a path in
 * another section and for a path that does not exist, so the answer never
 * reveals what exists outside the scope.
 */
function notFound(path: string): never {
  throw new Error(
    `There is no document at "${path}". Call ls to see what exists.`,
  );
}

function truncate(text: string, limit: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/**
 * The knowledge base as a filesystem the model can browse, scoped to some
 * sections. `find` locates by meaning or by words, `ls` shows the shape of a
 * section or a document, `cat` reads one section, and `grep` finds an exact
 * phrase. Each tool returns only what was asked for.
 */
export function knowledgeTools(
  sections?: readonly string[],
  options: KnowledgeToolOptions = {},
): Tool[] {
  const scope = sections ? [...sections] : undefined;
  // An unscoped set reads every section, including one added later.
  const mayRead = async (path: string) =>
    allowed(path, scope ?? (await listSections()));
  const embedder =
    options.embedder ??
    voyageEmbedder(options.embedderOptions ?? { apiKey: config.voyageApiKey });

  const findTool = tool({
    name: "find",
    description:
      "Search the knowledge base for sections that answer a question. Call this first. It returns the 10 best matches as paths such as `policies/refunds#refund-authority`, with a relevance score and the matching text; read the most promising one with cat.",
    input: findInput,
    async run({ query }) {
      await ensureIndexed(embedder);
      const outcome = await find(query, { embedder, sections: scope });

      if (outcome.results.length === 0) {
        const mode =
          outcome.mode === "meaning" ? "by meaning" : "by matching words";
        return `Nothing in the knowledge base matches "${query}" searched ${mode}. Try different words, or use ls to see what is there.`;
      }

      const heading =
        outcome.mode === "meaning"
          ? "Closest sections by meaning"
          : "Sections matching those words";

      // Only a short preview, so the model reads the section with cat rather
      // than answering from a fragment of it.
      return `${heading}. Read one with cat on its path.\n\n${outcome.results
        .map(
          (result) =>
            `${result.score.toFixed(3)}  ${result.ref} — ${result.title}\n  ${truncate(result.text, 120)}`,
        )
        .join("\n\n")}`;
    },
  });

  const lsTool = tool({
    name: "ls",
    description:
      "List what the knowledge base holds. With no path it lists the sections; with a section it lists that section's documents; with a document path it lists that document's headings. Call this to see what exists before searching.",
    input: lsInput,
    async run({ path }) {
      if (!path) {
        const names = (await listSections()).filter((name) =>
          scope ? scope.includes(name) : true,
        );
        return names.length === 0
          ? "The knowledge base is empty."
          : `Sections:\n${names.map((name) => `  ${name}`).join("\n")}`;
      }

      if (!path.includes("/")) {
        if (!(await mayRead(path))) notFound(path);

        const documents = (await listDocuments()).filter(
          (document) => document.section === path,
        );
        return documents.length === 0
          ? `Section ${path} has no documents.`
          : `Documents in ${path}:\n${documents
              .map((document) => `  ${document.path} — ${document.title}`)
              .join("\n")}`;
      }

      if (!(await mayRead(path))) notFound(path);

      const document = await getDocument(path);
      if (!document) notFound(path);

      const headings = document.body
        .split(/\r?\n/)
        .map((line) => /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line)?.[1].trim())
        .filter((heading): heading is string => Boolean(heading));

      return headings.length === 0
        ? `${document.path} — ${document.title}\n  (no headings; read it whole with cat ${document.path})`
        : `${document.path} — ${document.title}, updated ${document.updated}\n${headings
            .map(
              (heading) =>
                `  ${document.path}#${headingSlug(heading)} — ${heading}`,
            )
            .join("\n")}`;
    },
  });

  const catTool = tool({
    name: "cat",
    description:
      "Read one document, or one section of it, by path. Call this after find or ls names a path that looks right. A path with `#` reads that heading only; without it, the whole document is returned.",
    input: catInput,
    async run({ path }) {
      const [documentPath, anchor, ...rest] = path.split("#");
      if (rest.length > 0) notFound(path);
      if (!(await mayRead(documentPath))) notFound(documentPath);

      const document = await getDocument(documentPath);
      if (!document) notFound(documentPath);

      const header = `${document.title} (${document.owner}, updated ${document.updated})\nSource: /knowledge/${document.path}`;

      if (anchor === undefined || anchor === "") {
        return `${header}\n\n${document.body}`;
      }

      const wanted = anchor.trim().toLowerCase();
      const sections = splitSection(document.body);
      const match = sections.find(
        (section) => headingSlug(section.heading) === wanted,
      );

      return match
        ? `${header}\n\n## ${match.heading}\n\n${match.text}`
        : `There is no section "${anchor}" in ${document.path}.`;
    },
  });

  const grepTool = tool({
    name: "grep",
    description:
      "Search the raw text for a regular expression, across the knowledge base or in one document. Call this for an exact phrase, a figure or a code that a meaning search may rank badly. Returns the matching lines with their path and heading.",
    input: grepInput,
    async run({ pattern, path }) {
      if (path && !(await mayRead(path))) notFound(path);

      const matches = await grep(pattern, path);
      const visible = matches.filter((match) =>
        scope ? allowed(match.path, scope) : true,
      );

      if (visible.length === 0) {
        return `No line matches "${pattern}"${path ? ` in ${path}` : ""}.`;
      }

      const capped =
        matches.length >= MAX_GREP_RESULTS
          ? `\n(the first ${MAX_GREP_RESULTS} matches; narrow the pattern for more)`
          : "";

      return `${visible.length} matching ${visible.length === 1 ? "line" : "lines"}${capped}\n\n${visible
        .map(
          (match) =>
            `${match.path}${match.heading ? `#${headingSlug(match.heading)}` : ""}:${match.line}: ${match.text}`,
        )
        .join("\n")}`;
    },
  });

  return [findTool, lsTool, catTool, grepTool];
}

/** Splits a body at its `##` headings, for reading one section. */
function splitSection(body: string) {
  const sections: { heading: string; text: string }[] = [];
  let heading = "";
  let lines: string[] = [];

  const flush = () => {
    if (heading !== "")
      sections.push({ heading, text: lines.join("\n").trim() });
  };

  for (const line of body.split(/\r?\n/)) {
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
  return sections;
}
