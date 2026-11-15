import {
  generateText,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolResultPart,
  type ToolSet,
} from "ai";
import { z } from "zod";

import { priceOf } from "@/lib/providers";
import type { Tool } from "@/lib/tools";

/** Why a run ended. `answered` and the three limits are the only endings. */
export type AgentStop = "answered" | "steps" | "dollars" | "time";

export type AgentLimits = {
  /** The most model calls one run may make. */
  steps: number;
  /** The most the run may spend, in dollars. 0 turns the check off. */
  dollars: number;
  /** The most wall-clock time the run may take, in seconds. 0 turns it off. */
  seconds: number;
};

export const DEFAULT_LIMITS: AgentLimits = {
  steps: 15,
  dollars: 0.5,
  seconds: 120,
};

export type AgentUsage = { input: number; output: number };

/** One tool call and what came back, for whoever is watching the run. */
export type AgentToolEvent = {
  name: string;
  input: unknown;
  result: string;
  failed: boolean;
};

export type AgentEvents = {
  /** The model's words between tool calls. Empty text is not reported. */
  thought: (text: string) => void;
  tool: (call: AgentToolEvent) => void;
};

export type AgentOptions = {
  model: LanguageModel;
  /** The model id, used to price each call. */
  modelId: string;
  system: string;
  task: string;
  tools: readonly Tool[];
  /** The tool whose call ends the run. */
  done: string;
  limits?: Partial<AgentLimits>;
  on?: Partial<AgentEvents>;
  /** Called once per model call, so a caller can keep a running cost. */
  spend?: (usage: AgentUsage) => void;
};

export type AgentResult = {
  stopped: AgentStop;
  /** The model's final text, or the `done` tool's input as JSON. */
  answer: string;
  /** What the `done` tool was called with, when it ran. */
  report?: unknown;
  /** The full transcript, the task first. */
  messages: ModelMessage[];
  steps: number;
  dollars: number;
  usage: AgentUsage;
};

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** The tools in the SDK's shape, with no `execute`, so the loop runs them. */
function toolSet(tools: readonly Tool[]): ToolSet {
  return Object.fromEntries(
    tools.map((entry) => [
      entry.name,
      tool({ description: entry.description, inputSchema: entry.input }),
    ]),
  );
}

/** Resolves with the tool's result, or rejects when the deadline passes. */
function beforeDeadline<T>(work: Promise<T>, remaining: number): Promise<T> {
  if (!Number.isFinite(remaining)) return work;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The time limit was reached.")),
      remaining,
    );
    timer.unref?.();

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Runs a ReAct agent to completion: ask the model, run every tool call it made,
 * hand back the results and ask again. It ends when the model answers in text,
 * when the `done` tool runs, or when a step, dollar or time limit is reached.
 *
 * Tools are declared without `execute`, so the model's calls come back to this
 * loop and it runs them itself. A tool that throws, an unknown tool and invalid
 * input all become error results the model can recover from.
 */
export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const limits: AgentLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const on: AgentEvents = {
    thought: options.on?.thought ?? (() => {}),
    tool: options.on?.tool ?? (() => {}),
  };
  const prices = priceOf(options.modelId);
  const budget = limits.seconds > 0 ? limits.seconds * 1_000 : Infinity;
  const deadline = Date.now() + budget;
  const signal = Number.isFinite(budget)
    ? AbortSignal.timeout(budget)
    : undefined;
  const tools = toolSet(options.tools);
  const registry = new Map(options.tools.map((entry) => [entry.name, entry]));

  const messages: ModelMessage[] = [{ role: "user", content: options.task }];
  const usage: AgentUsage = { input: 0, output: 0 };
  let dollars = 0;
  let steps = 0;
  let answer = "";
  let report: unknown;

  const remaining = () => Math.max(0, deadline - Date.now());
  const stopped = (reason: AgentStop): AgentResult => ({
    stopped: reason,
    answer,
    ...(report === undefined ? {} : { report }),
    messages,
    steps,
    dollars,
    usage,
  });

  /** Runs one call, or returns the error text the model should read. */
  const runOne = async (call: {
    toolName: string;
    input: unknown;
  }): Promise<{ result: string; failed: boolean; ends: boolean }> => {
    const entry = registry.get(call.toolName);

    if (!entry) {
      return {
        result: `Unknown tool "${call.toolName}". Available tools: ${[
          ...registry.keys(),
        ].join(", ")}.`,
        failed: true,
        ends: false,
      };
    }

    const parsed = entry.input.safeParse(call.input);
    if (!parsed.success) {
      return {
        result: `Invalid input for "${entry.name}": ${z.prettifyError(parsed.error)}`,
        failed: true,
        ends: false,
      };
    }

    try {
      const result = await beforeDeadline(entry.run(parsed.data), remaining());
      return { result, failed: false, ends: call.toolName === options.done };
    } catch (error) {
      return {
        result: `The ${entry.name} tool failed: ${message(error)}`,
        failed: true,
        ends: false,
      };
    }
  };

  while (steps < limits.steps) {
    if (limits.dollars > 0 && dollars >= limits.dollars) {
      return stopped("dollars");
    }
    if (remaining() <= 0) return stopped("time");

    steps += 1;

    let result;
    try {
      result = await generateText({
        model: options.model,
        system: options.system,
        messages,
        tools,
        ...(signal ? { abortSignal: signal } : {}),
      });
    } catch (error) {
      // The signal aborts the call at the deadline. Anything else is a real
      // failure and belongs to the caller.
      if (signal?.aborted) return stopped("time");
      throw error;
    }

    const used = {
      input: result.usage.inputTokens ?? 0,
      output: result.usage.outputTokens ?? 0,
    };
    usage.input += used.input;
    usage.output += used.output;
    options.spend?.(used);
    if (prices) {
      dollars +=
        (used.input / 1_000_000) * prices.input +
        (used.output / 1_000_000) * prices.output;
    }

    // Only the assistant message is kept: the SDK adds its own error results
    // for calls it could not parse, and this loop writes every result itself.
    messages.push(
      ...result.response.messages.filter((message) => message.role !== "tool"),
    );

    const text = result.text.trim();
    if (text) on.thought(text);

    if (result.toolCalls.length === 0) {
      answer = result.text;
      return stopped("answered");
    }

    const results: ToolResultPart[] = [];

    for (const call of result.toolCalls) {
      const outcome = await runOne(call);
      on.tool({
        name: call.toolName,
        input: call.input,
        result: outcome.result,
        failed: outcome.failed,
      });

      if (outcome.ends) {
        report = call.input;
        answer =
          typeof call.input === "string"
            ? call.input
            : JSON.stringify(call.input);
        return stopped("answered");
      }

      // A tool that ran out the clock ends the run; the model has no time left
      // to improve on a result it never saw.
      if (outcome.failed && remaining() <= 0) return stopped("time");

      results.push({
        type: "tool-result",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: outcome.failed
          ? { type: "error-text", value: outcome.result }
          : { type: "text", value: outcome.result },
      });
    }

    messages.push({ role: "tool", content: results });
  }

  return stopped("steps");
}
