import { stdout } from "node:process";
import { parseArgs } from "node:util";

import { cliModel } from "./model";
import { browse, chromeBrowser, type BrowseEvent } from "@/lib/browser-agent";

function preview(text: string, limit = 120) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

function format(event: BrowseEvent) {
  return `${event.step}. ${event.action.action} — ${event.action.why}\n   ${preview(event.outcome)}`;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function help() {
  console.error(
    'Usage: pnpm browse --start <url> "<task>" [--max-steps n] [--show]',
  );
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      start: { type: "string" },
      "max-steps": { type: "string" },
      show: { type: "boolean", default: false },
    },
  });

  const start = values.start;
  const task = positionals.join(" ").trim();
  if (!start || !task) {
    help();
    process.exitCode = 1;
    return;
  }

  const maxSteps =
    values["max-steps"] === undefined ? undefined : Number(values["max-steps"]);
  if (maxSteps !== undefined && (!Number.isInteger(maxSteps) || maxSteps < 1)) {
    throw new Error("--max-steps must be a whole number above zero.");
  }

  const { model, id } = cliModel("small");
  const browser = await chromeBrowser(start, { headless: !values.show });

  try {
    const result = await browse(task, start, model, browser, {
      maxSteps,
      on: (event) => console.log(format(event)),
    });

    stdout.write(`\n${result.result}\n`);
    console.log(
      `\n${result.ended} · ${result.steps} ${result.steps === 1 ? "step" : "steps"} · ${id}`,
    );
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  console.error(message(error));
  process.exitCode = 1;
});
