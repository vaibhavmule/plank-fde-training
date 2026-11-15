import type { LanguageModel } from "ai";
import { z } from "zod";

import {
  DEFAULT_LIMITS,
  runAgent,
  type AgentEvents,
  type AgentLimits,
  type AgentStop,
  type AgentUsage,
} from "@/lib/agent";
import { knowledgeTools } from "@/lib/knowledge-tools";
import { readUrlTool, tool, webSearchTool, type Tool } from "@/lib/tools";

/** One fact the agent kept, with where it came from. */
export type Finding = { text: string; source: string };

export type Investigation = {
  /** The report, or the findings so far when the run stopped early. */
  report: string;
  findings: Finding[];
  stopped: AgentStop;
  steps: number;
  dollars: number;
  usage: AgentUsage;
};

export type InvestigationOptions = {
  /** The model that runs the investigation. */
  model: LanguageModel;
  /** The model id, used to price the run. */
  modelId: string;
  question: string;
  /** Without this key the agent has no web_search or read_url. */
  braveSearchKey?: string;
  fetch?: typeof globalThis.fetch;
  limits?: Partial<AgentLimits>;
  on?: Partial<AgentEvents>;
  /** Called once per model call, so a caller can keep a running cost. */
  spend?: (usage: AgentUsage) => void;
};

export const INVESTIGATION_SYSTEM_PROMPT = `You investigate questions for Fieldstone Supply's operations and support teams. You work alone, step by step, until you can answer with a source for every fact.

Work in this order:
1. Call search_knowledge_base with the question's key words. Read the policies it returns before searching again.
2. Call read_policy with an exact slug to read a policy in full.
3. Call save_finding for each claim you will use, with the text and its source. Use the policy path, such as /policies/refunds, or the page URL.
4. Only when the policies do not cover the question, use web_search, and read_url on a promising result.
5. Call write_report once, with a short answer that cites its sources. This ends the investigation.

Write one short sentence before each tool call saying what you are about to do and why. Never guess a limit, a deadline or an entitlement: quote it from a policy or a page, and save it as a finding. When nothing covers the question, say so in the report and name the team to ask.`;

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

/** The agent's tools. save_finding closes over this run's own findings. */
function investigationTools(
  findings: Finding[],
  options: InvestigationOptions,
): Tool[] {
  const tools: Tool[] = [
    ...knowledgeTools(),
    tool({
      name: "save_finding",
      description:
        "Keep one fact for the report, with where it came from. Call this for every claim you will use, before you write the report.",
      input: saveFindingInput,
      run({ text, source }) {
        findings.push({ text, source });
        return `Saved finding ${findings.length}: ${text} (${source})`;
      },
    }),
  ];

  if (options.braveSearchKey) {
    tools.push(
      webSearchTool(options.braveSearchKey, options.fetch),
      readUrlTool(options.fetch),
    );
  }

  tools.push(
    tool({
      name: "write_report",
      description:
        "Write the final report and end the investigation. Call this once, when every fact you need has been saved. Cite the source of each fact and end with a Sources list.",
      input: writeReportInput,
      run({ report }) {
        return report;
      },
    }),
  );

  return tools;
}

/**
 * Asks the agent to answer a question from the company policies, and from the
 * web when a Brave key is set, and to write a sourced report.
 */
export async function investigate(
  options: InvestigationOptions,
): Promise<Investigation> {
  const question = options.question.trim();
  if (!question) throw new Error("Ask an investigation question.");

  const findings: Finding[] = [];
  const result = await runAgent({
    model: options.model,
    modelId: options.modelId,
    system: INVESTIGATION_SYSTEM_PROMPT,
    task: question,
    tools: investigationTools(findings, options),
    done: "write_report",
    limits: { ...DEFAULT_LIMITS, ...options.limits },
    on: options.on,
    spend: options.spend,
  });

  const written =
    typeof result.report === "object" &&
    result.report !== null &&
    "report" in result.report &&
    typeof result.report.report === "string"
      ? result.report.report.trim()
      : "";

  return {
    report: written || stoppedBeforeReport(result.stopped, findings),
    findings,
    stopped: result.stopped,
    steps: result.steps,
    dollars: result.dollars,
    usage: result.usage,
  };
}
