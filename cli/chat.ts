import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import {
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  OPENROUTER_MODELS,
  anthropic,
  openai,
  openrouter,
  sdkModel,
  type Effort,
  type Model,
  type Provider,
} from "@/lib/providers";
import { investigate } from "@/lib/investigate";
import { research } from "@/lib/research";
import { Session, type SessionSettings } from "@/lib/session";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { employeeTools } from "@/lib/tools";

// A separate program from the Next app, so it reads its own environment.
const PROVIDERS: Record<
  string,
  {
    key: string;
    factory: (apiKey: string) => Provider;
    models: readonly Model[];
  }
> = {
  anthropic: {
    key: "ANTHROPIC_API_KEY",
    factory: (apiKey) => anthropic({ apiKey }),
    models: ANTHROPIC_MODELS,
  },
  openai: {
    key: "OPENAI_API_KEY",
    factory: (apiKey) => openai({ apiKey }),
    models: OPENAI_MODELS,
  },
  openrouter: {
    key: "OPENROUTER_API_KEY",
    factory: (apiKey) => openrouter({ apiKey }),
    models: OPENROUTER_MODELS,
  },
};

const EFFORTS: Effort[] = ["low", "medium", "high"];

function build(name: string): Provider {
  const entry = PROVIDERS[name];
  if (!entry) {
    throw new Error(
      `Unknown provider "${name}". Try ${Object.keys(PROVIDERS).join(" or ")}.`,
    );
  }

  const apiKey = process.env[entry.key] ?? "";
  if (!apiKey) {
    throw new Error(`${entry.key} is not set. Add it to .env.local.`);
  }

  return entry.factory(apiKey);
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function dim(text: string) {
  return stdout.isTTY ? `\x1b[2m${text}\x1b[0m` : text;
}

/** A tool's input or result on one line, cut so a report is not printed twice. */
function preview(value: unknown, limit = 160) {
  const text =
    typeof value === "string"
      ? value
      : value === undefined
        ? ""
        : JSON.stringify(value);
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

function help() {
  console.log(`Commands:
  /model                     list providers and models
  /model <provider> [model]  switch for the rest of the conversation
  /system                    show the system prompt
  /system <text>             replace it
  /research <question>       research policies and the web, with citations
  /investigate <question>    run the investigation agent, with sourced findings
  /cost                      tokens and dollars for this session
  /help                      this list
  /exit                      quit`);
}

function listModels(session: Session) {
  for (const [name, entry] of Object.entries(PROVIDERS)) {
    console.log(`${name}${name === session.provider.name ? " (current)" : ""}`);
    for (const model of entry.models) {
      const price = model.pricePerMillionTokens;
      const mark = name === session.provider.name && model.id === session.model;
      console.log(
        `  ${mark ? "*" : " "} ${model.id.padEnd(20)} $${price.input}/$${price.output} per million`,
      );
    }
  }
}

function reportCost(session: Session) {
  const cost = session.cost();
  if (cost.turns === 0) {
    console.log("No turns yet, so nothing has been spent.");
    return;
  }

  console.log(
    `${cost.turns} ${cost.turns === 1 ? "turn" : "turns"} · ${cost.input} in · ${cost.output} out · $${cost.dollars.toFixed(6)}`,
  );

  if (cost.unpriced.length > 0) {
    console.log(
      `No published price for: ${cost.unpriced.join(", ")} — those turns are not in the dollar total.`,
    );
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      provider: { type: "string", short: "p", default: "anthropic" },
      model: { type: "string", short: "m" },
      effort: { type: "string" },
      temperature: { type: "string" },
      "max-tokens": { type: "string" },
    },
  });

  const effort = values.effort as Effort | undefined;
  if (effort && !EFFORTS.includes(effort)) {
    throw new Error(
      `--effort must be one of ${EFFORTS.join(", ")}, got "${effort}".`,
    );
  }

  const settings: SessionSettings = {};
  if (effort) settings.effort = effort;
  if (values.temperature !== undefined) {
    const temperature = Number(values.temperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new Error("--temperature must be a number between 0 and 2.");
    }
    settings.temperature = temperature;
  }
  if (values["max-tokens"] !== undefined) {
    const maxTokens = Number(values["max-tokens"]);
    if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
      throw new Error("--max-tokens must be a whole number above zero.");
    }
    settings.maxTokens = maxTokens;
  }

  const providerName = values.provider;
  const session = new Session({
    provider: build(providerName),
    model: values.model,
    system: SYSTEM_PROMPT,
    settings,
    tools: employeeTools({
      braveSearchKey: process.env.BRAVE_SEARCH_KEY ?? "",
    }),
  });

  if (settings.temperature !== undefined && providerName === "anthropic") {
    console.log(
      "Note: Claude models reject temperature, so --temperature does not apply here. Use --effort instead.",
    );
  }

  console.log(
    `WorkBot · ${session.provider.name}/${session.model} · /help for commands, /exit to leave.`,
  );

  const lines = createInterface({ input: stdin, output: stdout });

  for await (const line of lines) {
    const text = line.trim();
    if (text === "") continue;
    if (text === "/exit" || text === "/quit") break;

    if (text === "/help") {
      help();
      continue;
    }

    if (text === "/cost") {
      reportCost(session);
      continue;
    }

    if (text === "/system") {
      console.log(session.system);
      continue;
    }

    if (text.startsWith("/system ")) {
      session.setSystem(text.slice("/system ".length).trim());
      console.log("System prompt replaced for the rest of the conversation.");
      continue;
    }

    if (text === "/model") {
      listModels(session);
      continue;
    }

    if (text.startsWith("/model ")) {
      const [, name, model] = text.split(/\s+/);
      try {
        session.use(build(name), model);
        const known = session.provider.models.some(
          (entry) => entry.id === session.model,
        );
        console.log(
          `Now answering as ${session.provider.name}/${session.model}.${known ? "" : " No published price for that model."}`,
        );
      } catch (error) {
        console.log(`Could not switch: ${message(error)}`);
      }
      continue;
    }

    if (text === "/research" || text.startsWith("/research ")) {
      const question = text.slice("/research".length).trim();
      if (!question) {
        console.log("Usage: /research <question>");
        continue;
      }

      try {
        await research(
          question,
          session.provider,
          {
            step: (message) => console.log(dim(`· ${message}`)),
            text: (delta) => stdout.write(delta),
            spend: (model, usage) => session.record(model, usage),
          },
          { braveSearchKey: process.env.BRAVE_SEARCH_KEY ?? "" },
        );
        stdout.write("\n");
      } catch (error) {
        console.log(`Research failed: ${message(error)}`);
      }
      continue;
    }

    if (text === "/investigate" || text.startsWith("/investigate ")) {
      const question = text.slice("/investigate".length).trim();
      if (!question) {
        console.log("Usage: /investigate <question>");
        continue;
      }

      const model = sdkModel(session.provider.name, session.model);
      if (!model) {
        console.log(
          `No agent adapter for ${session.provider.name}. Switch to anthropic or openai with /model.`,
        );
        continue;
      }

      try {
        const result = await investigate({
          model,
          modelId: session.model,
          question,
          braveSearchKey: process.env.BRAVE_SEARCH_KEY ?? "",
          spend: (usage) => session.record(session.model, usage),
          on: {
            thought: (thought) => console.log(dim(`\n· ${thought}`)),
            tool: (call) =>
              console.log(
                dim(
                  `  → ${call.name} ${preview(call.input)}${call.failed ? " (failed)" : ""}\n    ${preview(call.result, 160)}`,
                ),
              ),
          },
        });

        stdout.write(`\n${result.report}\n`);
        console.log(
          dim(
            `\n${result.steps} ${result.steps === 1 ? "step" : "steps"} · stopped: ${result.stopped} · $${result.dollars.toFixed(6)} · ${result.findings.length} ${result.findings.length === 1 ? "finding" : "findings"}`,
          ),
        );
      } catch (error) {
        console.log(`Investigation failed: ${message(error)}`);
      }
      continue;
    }

    if (text.startsWith("/")) {
      console.log(`Unknown command ${text.split(/\s+/)[0]}. /help lists them.`);
      continue;
    }

    stdout.write("WorkBot: ");
    try {
      await session.send(
        text,
        (chunk) => stdout.write(chunk),
        (call) =>
          stdout.write(
            dim(
              `\n  → ${call.name} ${JSON.stringify(call.input)}${call.failed ? " (failed)" : ""}\n`,
            ),
          ),
      );
      stdout.write("\n");
    } catch (error) {
      // Nothing from a failed turn is kept, so the conversation stays usable.
      stdout.write(`\nThat turn failed: ${message(error)}\n`);
    }
  }

  lines.close();
}

void main().catch((error: unknown) => {
  console.error(message(error));
  process.exitCode = 1;
});
