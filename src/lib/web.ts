import { isIP } from "node:net";

export const MAX_PAGE_BYTES = 512 * 1024;
export const MAX_PAGE_CHARACTERS = 8_000;

const MAX_REDIRECTS = 5;
// A scraper that reads other people's pages says who it is.
const USER_AGENT = "WorkBot/1.0 (+https://joinplank.com/ai-fde-course)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCK_BOUNDARY =
  /<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export type ReadOptions = { fetch?: typeof globalThis.fetch };

export type SearchOptions = {
  apiKey: string;
  count?: number;
  fetch?: typeof globalThis.fetch;
};

export type SearchResult = {
  title: string;
  url: string;
  description: string;
};

function ipv4Number(address: string) {
  return address
    .split(".")
    .map(Number)
    .reduce((value, part) => value * 256 + part, 0);
}

function inRange(address: number, base: number, bits: number) {
  const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
  return (address & mask) >>> 0 === (base & mask) >>> 0;
}

function isPrivateIpv4(address: string) {
  const value = ipv4Number(address);
  return [
    [0x00000000, 8],
    [0x0a000000, 8],
    [0x64400000, 10],
    [0x7f000000, 8],
    [0xa9fe0000, 16],
    [0xac100000, 12],
    [0xc0a80000, 16],
    [0xe0000000, 4],
    [0xf0000000, 4],
  ].some(([base, bits]) => inRange(value, base, bits));
}

function isPrivateIpv6(raw: string) {
  const address = raw.toLowerCase();

  if (address === "::" || address === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(address)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(address)) return true;

  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

/** Throws unless a URL is http or https and points at a public address. */
export function assertPublicUrl(source: string) {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error(`"${source}" is not a valid URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be read.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "internal" ||
    host.endsWith(".internal")
  ) {
    throw new Error(`"${host}" is a private name, so it cannot be read.`);
  }

  const version = isIP(host);
  if (
    (version === 4 && isPrivateIpv4(host)) ||
    (version === 6 && isPrivateIpv6(host))
  ) {
    throw new Error(`"${host}" is a private address, so it cannot be read.`);
  }

  return url;
}

export function decodeEntities(text: string) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(
        entity.slice(hexadecimal ? 2 : 1),
        hexadecimal ? 16 : 10,
      );
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }

    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function extractText(html: string, limit = MAX_PAGE_CHARACTERS) {
  const body = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(BLOCK_BOUNDARY, "\n")
    .replace(/<[^>]*>/g, " ");

  return decodeEntities(body)
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

async function readBody(response: Response, limit: number) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const slice =
        value.byteLength > limit - total
          ? value.subarray(0, limit - total)
          : value;
      chunks.push(slice);
      total += slice.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

/** Fetches a public page and returns its HTML with the address it was read from. */
export async function fetchPage(
  source: string,
  options: ReadOptions = {},
): Promise<{ html: string; url: string }> {
  const doFetch = options.fetch ?? globalThis.fetch;
  let url = assertPublicUrl(source);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await doFetch(url, {
      redirect: "manual",
      headers: {
        accept: "text/html, text/plain;q=0.9, */*;q=0.1",
        "user-agent": USER_AGENT,
      },
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("The page redirected without a location.");
      }

      url = assertPublicUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`The page answered ${response.status}.`);
    }

    return {
      html: await readBody(response, MAX_PAGE_BYTES),
      url: url.toString(),
    };
  }

  throw new Error(`The page redirected more than ${MAX_REDIRECTS} times.`);
}

/** Fetches a public page and returns its readable text, capped at 8,000 characters. */
export async function readPage(
  source: string,
  options: ReadOptions = {},
): Promise<string> {
  const page = await fetchPage(source, options);
  return extractText(page.html);
}

/** Searches the web through Brave Search and returns titles, URLs and snippets. */
export async function searchWeb(
  query: string,
  options: SearchOptions,
): Promise<SearchResult[]> {
  const text = query.trim();
  if (!text) throw new Error("The search query is empty.");
  if (!options.apiKey) throw new Error("A Brave Search key is not configured.");

  const doFetch = options.fetch ?? globalThis.fetch;
  const count = Math.min(Math.max(options.count ?? 5, 1), 20);
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", text);
  url.searchParams.set("count", String(count));

  const response = await doFetch(url, {
    headers: {
      accept: "application/json",
      "accept-encoding": "gzip",
      "x-subscription-token": options.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search answered ${response.status}.`);
  }

  const body = (await response.json()) as {
    web?: {
      results?: {
        title?: string;
        url?: string;
        description?: string;
      }[];
    };
  };

  return (body.web?.results ?? [])
    .map((result) => ({
      title: result.title ?? "",
      url: result.url ?? "",
      description: result.description ?? "",
    }))
    .filter((result) => result.url);
}
