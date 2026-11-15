import type { LanguageModel } from "ai";
import { z } from "zod";

import {
  DEFAULT_LIMITS,
  runAgent,
  type AgentEvents,
  type AgentLimits,
  type AgentResult,
  type AgentStop,
  type AgentUsage,
} from "@/lib/agent";
import { browse, chromeBrowser, type Browser } from "@/lib/browser-agent";
import { knowledgeTools } from "@/lib/knowledge-tools";
import { modelIdOf } from "@/lib/providers";
import { readUrlTool, tool, webSearchTool, type Tool } from "@/lib/tools";

/** One fact the agent kept, with where it came from. */
export type Finding = { text: string; source: string };

/** The three agents in a run: the orchestrator and its two specialists. */
export type Agent = "analyst" | "knowledge" | "web";

/**
 * One thing an agent did, with when and which agent. Entries are records, not
 * formatted lines, so the terminal, a test and a database can each read them.
 */
export type Entry =
  | { at: string; agent: Agent; kind: "thought"; text: string }
  | {
      at: string;
      agent: Agent;
      kind: "tool";
      name: string;
      input: unknown;
      result: string;
      failed: boolean;
    }
  | {
      at: string;
      agent: Agent;
      kind: "done";
      outcome: AgentStop;
      steps: number;
      dollars: number;
    };

export type Investigation = {
  /** The report, or the findings so far when the run stopped early. */
  report: string;
  findings: Finding[];
  log: Entry[];
  /** What each agent's model calls cost, in dollars. */
  cost: Record<Agent, number>;
  /** The three agents' cost together. */
  total: number;
  /** Why the analyst's own loop ended. */
  stopped: AgentStop;
  /** The analyst's model calls. */
  steps: number;
  /** Tokens used by all three agents. */
  usage: AgentUsage;
};

/** The models the analyst and both specialists run on. */
export type InvestigateModels = {
  analyst: LanguageModel;
  specialist: LanguageModel;
};

export type InvestigateEvents = {
  log: (entry: Entry) => void;
};

export type InvestigateOptions = {
  /** Without this key the web specialist has no web_search. */
  braveSearchKey?: string;
  fetch?: typeof globalThis.fetch;
  /** Overrides the analyst's limits. Specialists always get their own. */
  limits?: Partial<AgentLimits>;
  on?: Partial<InvestigateEvents>;
  /** Opens a browser at an address. Tests pass a fake. */
  browser?: (start: string) => Promise<Browser>;
  /** Called once per model call, so a caller can keep a running cost. */
  spend?: (agent: Agent, usage: AgentUsage) => void;
};

/** 8 steps, $0.20 and 90 seconds for each specialist. */
export const SPECIALIST_LIMITS: AgentLimits = {
  steps: 8,
  dollars: 0.2,
  seconds: 90,
};

/** The analyst keeps the loop's defaults, with 5 minutes for its specialists. */
export const ANALYST_LIMITS: AgentLimits = { ...DEFAULT_LIMITS, seconds: 300 };

export const ANALYST_SYSTEM_PROMPT = `You are WorkBot's research analyst. You direct two specialists and write the report yourself; you never search or read a page yourself.

Work in this order:
1. Call ask_knowledge_base first, with the question in the words a policy would use. It explores the company knowledge base and returns what it found, with sources.
2. Call ask_web only for what the documents do not cover, or when the question names a site or asks about something current and public. Give it one focused question.
3. Ask a specialist a second question only when its first answer is incomplete.
4. Cross-check the answers. Where they disagree, say so in the report.
5. Call write_report once, with a short answer that cites the source of every fact and ends with a Sources list.

Never guess a limit, a deadline or an entitlement: use only what a specialist saved. When nothing covers the question, say so and name the team to ask. Write one short sentence before each tool call saying what you are about to do and why.`;

export const KNOWLEDGE_SYSTEM_PROMPT = `You explore WorkBot's knowledge base for the analyst, working step by step.

Call find with the question's key words. It returns sections as paths such as policies/refunds#refund-authority. Read the most promising one with cat, look at a document's shape with ls, and grep for an exact phrase, figure or code that a meaning search may rank badly.

Call save_finding for every claim you will report, with the text and its source path exactly as the knowledge base writes them. Never guess a limit, a deadline or an entitlement: quote it, or say the documents do not cover the question.

Answer with a short list of the facts you found, each with its source.`;

export const WEB_SYSTEM_PROMPT = `You read the public web for WorkBot's analyst.

Use read_url to read a page in full. Use browse_site when a page needs clicking, typing or scrolling to show its content. When a web search is configured, search for another page if one cannot be read.

Call save_finding for every claim you will report, with the text and the page's URL. Never invent a value you did not see. Prefer the page's own words for amounts, dates and names.

Answer with a short list of the facts you found, each with its source.`;

const askInput = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .max(1_000)
    .describe(
      "The question for this specialist, as focused as you can make it",
    ),
});

const saveFindingInput = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("One fact, stated exactly as the source says it"),
  source: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe(
      "Where the fact comes from: a policy path like /policies/refunds, or a page URL",
    ),
});

const browseSiteInput = z.object({
  url: z.url().describe("A public http or https URL"),
  task: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("What to find on the page, stated as a task"),
});

const writeReportInput = z.object({
  report: z
    .string()
    .trim()
    .min(1)
    .describe(
      "The answer to the question, with the source of every fact and a Sources list",
    ),
});

/** The message a run that stopped before its report returns. */
export function stoppedBeforeReport(
  stopped: AgentStop,
  findings: readonly Finding[],
): string {
  const reason = `The investigation stopped (${stopped}) before a report was written.`;
  if (findings.length === 0) {
    return `${reason}\n\nNo findings were saved before it stopped.`;
  }

  return `${reason}\n\nFindings so far:\n${findings
    .map((finding) => `- ${finding.text} — ${finding.source}`)
    .join("\n")}`;
}

/** The findings so far, in the form a starting specialist reads. */
function knownSoFar(findings: readonly Finding[]): string {
  if (findings.length === 0) return "(nothing yet)";
  return findings
    .map((finding) => `- ${finding.text} — ${finding.source}`)
    .join("\n");
}

function now() {
  return new Date().toISOString();
}

/**
 * Runs the research analyst, which delegates to a knowledge specialist and a
 * web specialist. Each specialist is a tool whose `run` is its own agent loop,
 * so the analyst calls it like any other tool. The three agents keep their own
 * messages and share one list of findings.
 */
export async function investigate(
  question: string,
  models: InvestigateModels,
  options: InvestigateOptions = {},
): Promise<Investigation> {
  const asked = question.trim();
  if (!asked) throw new Error("Ask an investigation question.");

  const findings: Finding[] = [];
  const log: Entry[] = [];
  const cost: Record<Agent, number> = { analyst: 0, knowledge: 0, web: 0 };
  const usage: AgentUsage = { input: 0, output: 0 };

  const record = (entry: Entry) => {
    log.push(entry);
    options.on?.log?.(entry);
  };

  /** The agent loop's callbacks, as typed entries with this agent's name. */
  const events = (agent: Agent): AgentEvents => ({
    thought: (text) => record({ at: now(), agent, kind: "thought", text }),
    tool: (call) =>
      record({
        at: now(),
        agent,
        kind: "tool",
        name: call.name,
        input: call.input,
        result: call.result,
        failed: call.failed,
      }),
  });

  const spend = (agent: Agent) => (used: AgentUsage) => {
    usage.input += used.input;
    usage.output += used.output;
    options.spend?.(agent, used);
  };

  const finish = (agent: Agent, result: AgentResult) => {
    cost[agent] += result.dollars;
    record({
      at: now(),
      agent,
      kind: "done",
      outcome: result.stopped,
      steps: result.steps,
      dollars: result.dollars,
    });
  };

  const saveFinding = tool({
    name: "save_finding",
    description:
      "Keep one fact for the report, with where it came from. Call this for every claim you will report, before you answer.",
    input: saveFindingInput,
    run({ text, source }) {
      findings.push({ text, source });
      return `Saved finding ${findings.length}: ${text} (${source})`;
    },
  });

  /**
   * A specialist as a tool. Its run is its own agent loop on the small model,
   * with the question, the findings so far and the specialist's own tools.
   */
  const specialist = (
    agent: "knowledge" | "web",
    name: string,
    description: string,
    system: string,
    tools: readonly Tool[],
  ): Tool =>
    tool({
      name,
      description,
      input: askInput,
      async run({ question: task }) {
        const result = await runAgent({
          model: models.specialist,
          modelId: modelIdOf(models.specialist),
          system,
          task: `${task}\n\nKnown so far:\n${knownSoFar(findings)}`,
          tools: [...tools, saveFinding],
          limits: SPECIALIST_LIMITS,
          on: events(agent),
          spend: spend(agent),
        });

        finish(agent, result);

        // A run that stopped on a limit keeps what it saved, and says so.
        if (result.stopped !== "answered") {
          return `The ${name} specialist stopped (${result.stopped}) after ${result.steps} steps. The findings it saved are kept.`;
        }

        return (
          result.answer.trim() ||
          `The ${name} specialist found nothing to report.`
        );
      },
    });

  const openBrowser = options.browser ?? chromeBrowser;
  const browseSite = tool({
    name: "browse_site",
    description:
      "Open a public page in a real browser and work the task one action at a time. Call this when a page needs clicking, typing or scrolling to show its content. It returns the answer the browser read from the page.",
    input: browseSiteInput,
    async run({ url, task }) {
      const browser = await openBrowser(url);
      try {
        const result = await browse(task, url, models.specialist, browser, {
          maxSteps: 8,
        });
        return result.ended === "done"
          ? result.result
          : `The browser could not finish (${result.ended}: ${result.result})`;
      } finally {
        await browser.close().catch(() => {});
      }
    },
  });

  const webTools: Tool[] = [readUrlTool(options.fetch), browseSite];
  if (options.braveSearchKey) {
    webTools.push(webSearchTool(options.braveSearchKey, options.fetch));
  }

  const analystTools: Tool[] = [
    specialist(
      "knowledge",
      "ask_knowledge_base",
      "Ask the knowledge specialist a question. It searches and reads the company knowledge base, saves each fact it finds with its source, and returns a short list of facts.",
      KNOWLEDGE_SYSTEM_PROMPT,
      knowledgeTools(),
    ),
    specialist(
      "web",
      "ask_web",
      "Ask the web specialist a question. It reads public pages, drives a browser when a page needs it, and saves each fact it finds with its URL.",
      WEB_SYSTEM_PROMPT,
      webTools,
    ),
    tool({
      name: "write_report",
      description:
        "Write the final report and end the investigation. Call this once, when the specialists have answered. Cite the source of each fact and end with a Sources list.",
      input: writeReportInput,
      run({ report }) {
        return report;
      },
    }),
  ];

  const analyst = await runAgent({
    model: models.analyst,
    modelId: modelIdOf(models.analyst),
    system: ANALYST_SYSTEM_PROMPT,
    task: asked,
    tools: analystTools,
    done: "write_report",
    limits: { ...ANALYST_LIMITS, ...options.limits },
    on: events("analyst"),
    spend: spend("analyst"),
  });

  finish("analyst", analyst);

  const written =
    typeof analyst.report === "object" &&
    analyst.report !== null &&
    "report" in analyst.report &&
    typeof analyst.report.report === "string"
      ? analyst.report.report.trim()
      : "";

  return {
    report: written || stoppedBeforeReport(analyst.stopped, findings),
    findings,
    log,
    cost,
    total: cost.analyst + cost.knowledge + cost.web,
    stopped: analyst.stopped,
    steps: analyst.steps,
    usage,
  };
}
