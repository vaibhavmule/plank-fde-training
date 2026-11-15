import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

import { decodeEntities, extractText, fetchPage } from "@/lib/web";

/** The page text a model reads, in characters. */
export const MAX_PAGE_CHARACTERS = 12_000;

/** How many pages one scrape reads unless it is told otherwise. */
const DEFAULT_PAGES = 3;

const LINK_TAG = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
const NEXT_TEXTS = new Set(["next", "more", "older", "›", "»"]);

const EXTRACTION_RULES = `You extract records from a web page. The user message begins with the page's address, then its text.

Return one object with an "items" array holding every record the page states, in the schema's shape. The field descriptions say how each value is written. Copy values exactly as the page writes them: do not reformat a price, a date, a phone number or a name, and do not summarize. When the page does not state a field, return null for it. A page with no matching record returns an empty items array.`;

export type ScrapeOptions = {
  /** The most pages to read, counting the first. Defaults to 3. */
  pages?: number;
  /** The most records to keep. Omit it to keep every record found. */
  limit?: number;
  /** The most page text to send per page. Defaults to 12,000 characters. */
  characters?: number;
  fetch?: typeof globalThis.fetch;
};

export type ScrapeResult<T> = {
  records: T[];
  /** The addresses actually read, in order. */
  pages: string[];
};

function attribute(attributes: string, name: string): string | undefined {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const match = pattern.exec(attributes);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function textOf(inner: string) {
  return decodeEntities(inner.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True for "next", "more", "older", "›", "»", and the same with an arrow. */
function isNextText(text: string) {
  if (NEXT_TEXTS.has(text)) return true;

  const withoutArrow = text.replace(/[\s›»→]+$/u, "");
  return (
    withoutArrow !== text && ["next", "more", "older"].includes(withoutArrow)
  );
}

/**
 * The address a page calls next: a link with `rel="next"`, or one whose text
 * says next, more, older, › or ». A `rel="next"` link wins over text. The
 * address is resolved against the page's own address, and `undefined` means
 * the page is the last one.
 */
export function nextLink(html: string, base: string): string | undefined {
  let byText: string | undefined;

  for (const match of html.matchAll(LINK_TAG)) {
    const [, attributes, inner] = match;
    const href = attribute(attributes, "href");
    if (!href) continue;

    let url: string;
    try {
      url = new URL(href, base).toString();
    } catch {
      continue;
    }

    const rel = attribute(attributes, "rel");
    if (rel?.split(/\s+/).some((token) => token.toLowerCase() === "next")) {
      return url;
    }

    if (byText === undefined && isNextText(textOf(inner))) byText = url;
  }

  return byText;
}

/**
 * Reads one or more pages and asks the model for every record that fits
 * `Item`, following the next link until it runs out or `pages` is reached.
 * The page text is cut before it is sent, and every record the model returns
 * is validated by Zod.
 */
export async function scrape<T>(
  source: string,
  Item: z.ZodType<T>,
  model: LanguageModel,
  options: ScrapeOptions = {},
): Promise<ScrapeResult<T>> {
  const maxPages = Math.max(1, options.pages ?? DEFAULT_PAGES);
  const characters = options.characters ?? MAX_PAGE_CHARACTERS;
  const limit =
    options.limit === undefined ? undefined : Math.max(1, options.limit);

  const records: T[] = [];
  const visited: string[] = [];
  let url: string | undefined = source;

  while (url && visited.length < maxPages) {
    const page = await fetchPage(url, { fetch: options.fetch });
    visited.push(page.url);

    const text = extractText(page.html, characters);
    if (text !== "") {
      const result = await generateText({
        model,
        output: Output.object({ schema: z.object({ items: z.array(Item) }) }),
        system: EXTRACTION_RULES,
        prompt: `${page.url}\n\n${text}`,
      });

      records.push(...result.output.items);
      if (limit !== undefined && records.length >= limit) {
        records.length = limit;
        break;
      }
    }

    url = nextLink(page.html, page.url);
  }

  return { records, pages: visited };
}
