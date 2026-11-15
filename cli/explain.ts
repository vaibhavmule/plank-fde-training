import { stdout } from "node:process";

import { explain, type TraceEvent } from "@/lib/explainer";

const MARK = { handoff: "→", call: "·", result: "←" } as const;

function format(event: TraceEvent) {
  const detail = event.detail ? ` — ${event.detail}` : "";
  return `${`+${event.at}ms`.padStart(9)} ${event.agent} ${MARK[event.kind]} ${event.name ?? ""}${detail}`;
}

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('Usage: pnpm explain "<question>"');
    process.exitCode = 1;
    return;
  }

  try {
    const result = await explain(question, {
      trace: (event) => console.log(format(event)),
      text: () => {},
    });

    stdout.write(`\n${result.reply}\n`);
    console.log(
      `\n${result.approved ? "APPROVED" : "NOT APPROVED"} · ${result.turns} ${result.turns === 1 ? "turn" : "turns"} · $${result.cost.toFixed(4)}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
