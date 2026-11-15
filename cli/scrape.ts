import { stdout } from "node:process";
import { parseArgs } from "node:util";

import { z } from "zod";

import { cliModel } from "./model";
import { scrape } from "@/lib/scrape";

/** A supplier page, in whatever words the page itself uses. */
export const supplierSchema = z.object({
  name: z
    .string()
    .describe("The supplier's name, exactly as the page writes it."),
  hours: z
    .string()
    .nullable()
    .describe(
      "The opening hours, exactly as the page writes them, including the days and time zone. Null when the page does not state them.",
    ),
  services: z
    .array(z.string())
    .describe(
      "Every service or product the supplier offers, each in the page's own words. An empty list when the page does not state any.",
    ),
  prices: z
    .array(z.string())
    .describe(
      'Every price with the item it applies to, exactly as the page writes it, such as "$12 per kg" or "From $40". Never reformat a price. An empty list when the page does not state one.',
    ),
  contact: z
    .string()
    .nullable()
    .describe(
      "The phone number, email address or postal address the page gives, exactly as written. Null when the page does not state one.",
    ),
});

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      pages: { type: "string" },
      limit: { type: "string" },
    },
  });

  const url = positionals[0];
  if (!url) {
    console.error("Usage: pnpm scrape <url> [--pages n] [--limit n]");
    process.exitCode = 1;
    return;
  }

  const pages = values.pages === undefined ? undefined : Number(values.pages);
  if (pages !== undefined && (!Number.isInteger(pages) || pages < 1)) {
    throw new Error("--pages must be a whole number above zero.");
  }

  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("--limit must be a whole number above zero.");
  }

  const { model, id } = cliModel("small");
  const result = await scrape(url, supplierSchema, model, { pages, limit });

  console.log(JSON.stringify(result.records, null, 2));
  console.error(
    `${result.records.length} ${result.records.length === 1 ? "record" : "records"} from ${result.pages.length} ${result.pages.length === 1 ? "page" : "pages"} on ${id}`,
  );
  stdout.write("");
}

void main().catch((error: unknown) => {
  console.error(message(error));
  process.exitCode = 1;
});
