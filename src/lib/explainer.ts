import "server-only";

import {
  createSdkMcpServer,
  query,
  tool as sdkTool,
  type AgentDefinition,
  type HookCallback,
  type HookInput,
  type Options,
  type PostToolUseHookInput,
  type PreToolUseHookInput,
  type SDKMessage,
  type SDKResultMessage,
  type SyncHookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";

import { knowledgeTools } from "@/lib/knowledge-tools";

/** The in-process MCP server that serves the knowledge base tools. */
const KNOWLEDGE_SERVER = "knowledge";
export const SEARCH_TOOL = `mcp__${KNOWLEDGE_SERVER}__search_knowledge_base`;
export const READ_TOOL = `mcp__${KNOWLEDGE_SERVER}__read_policy`;

/** The SDK's built-in tool that runs a subagent. */
export const AGENT_TOOL = "Agent";

/** The main thread, which owns no subagent of its own. */
export const ORCHESTRATOR = "orchestrator";

/** The most revisions the orchestrator may ask the writer for. */
export const MAX_REVISIONS = 2;

/** Bounds the orchestrator the way the Day 11 loop's step limit does. */
export const MAX_TURNS = 24;

export const RESEARCHER_MODEL = "haiku";
export const WRITER_MODEL = "sonnet";
export const EDITOR_MODEL = "sonnet";

export const RESEARCHER_PROMPT = `You research one customer question for WorkBot. Search the company policies with search_knowledge_base, then read the policies that mention it with read_policy.

List only facts that answer the question, one per line, and end every fact with its source in brackets, such as [source: /policies/refunds]. Never guess a limit, a deadline or an entitlement: quote it. When the policies do not cover the question, say so and name the team to ask.

Reply with the facts only.`;

export const WRITER_PROMPT = `You write one reply to a customer for WorkBot, from the facts you are given.

Use only those facts, and quote their limits and deadlines exactly. Stay on the question: answer it and nothing else. Never invent a fact, a policy, a date or an amount. Write in plain, warm, direct English, in the customer's own terms, in at most 150 words. Reply with the reply only.`;

export const EDITOR_PROMPT = `You check one draft customer reply against the facts it was written from.

Check accuracy: every claim must trace to a fact, and no amount, date or limit may differ from it. Check safety: no promise the facts do not support, no personal or confidential data, and no answer to a different question.

When the draft passes, reply with APPROVED alone and nothing else. Otherwise reply REVISE, then a numbered list of the edits, each saying what is wrong and what to write instead.`;

export const ORCHESTRATOR_PROMPT = `You are WorkBot's reply orchestrator. You write no reply yourself; a researcher, a writer and an editor do the work, and you hand work between them with the Agent tool.

Run these steps in order:
1. Run the researcher (subagent_type "researcher") with the customer's question. Wait for its facts.
2. Run the writer (subagent_type "writer") with the question and the researcher's facts, sources included.
3. Run the editor (subagent_type "editor") with the question, the facts and the writer's draft.
4. If the editor replies REVISE, run the writer again with the draft and the editor's numbered edits. Allow at most ${MAX_REVISIONS} revisions.
5. When the editor replies APPROVED, end your reply with:
APPROVED

<the approved reply, exactly as the writer wrote it>
6. If the editor still asks for changes after ${MAX_REVISIONS} revisions, end your reply with:
NOT APPROVED

<the latest draft>

Remaining edits:
<the editor's numbered edits>

Always wait for each subagent's result before the next step. Pass each subagent the full context it needs: the question, the facts with their sources, the latest draft and the editor's edits. Never add a fact the researcher did not give.`;

/** One step of the pipeline, for whoever is watching the run. */
export type TraceEvent = {
  /** Milliseconds since the run started. */
  at: number;
  /** "orchestrator", or the subagent that made the call. */
  agent: string;
  /** A handoff to a subagent, or a tool call and its result. */
  kind: "handoff" | "call" | "result";
  /** The subagent or the tool that ran. */
  name?: string;
  detail?: string;
};

export type ExplainEvents = {
  trace: (event: TraceEvent) => void;
  text: (delta: string) => void;
};

/** The SDK's `query`, or a scripted generator in tests. */
export type ExplainRun = (params: {
  prompt: string;
  options?: Options;
}) => AsyncIterable<SDKMessage>;

export type Explanation = {
  /** True only when the editor approved the reply. */
  approved: boolean;
  /** The approved reply, or the latest draft and the remaining edits. */
  reply: string;
  trace: TraceEvent[];
  /** What the run cost, in USD, as the SDK reports it. */
  cost: number;
  turns: number;
};

/**
 * The knowledge tools served over the in-process MCP server the SDK starts
 * with the orchestrator. The researcher calls them; the other agents have none.
 */
const knowledgeServer = createSdkMcpServer({
  name: KNOWLEDGE_SERVER,
  version: "1.0.0",
  instructions:
    "The company knowledge base. Search first, then read the policies that matter.",
  tools: knowledgeTools().map((entry) =>
    sdkTool(entry.name, entry.description, entry.input.shape, async (args) => ({
      content: [{ type: "text", text: await entry.run(args) }],
    })),
  ),
});

/** The three subagents, each with its own prompt, tools and model. */
export function agentDefinitions(
  model?: string,
): Record<string, AgentDefinition> {
  return {
    researcher: {
      description:
        "Searches the company knowledge base and lists the facts that answer a customer's question, each with its source.",
      tools: [SEARCH_TOOL, READ_TOOL],
      prompt: RESEARCHER_PROMPT,
      model: model ?? RESEARCHER_MODEL,
    },
    writer: {
      description:
        "Writes the customer reply from the researcher's facts. Uses no tools.",
      tools: [],
      prompt: WRITER_PROMPT,
      model: model ?? WRITER_MODEL,
    },
    editor: {
      description:
        "Checks a draft reply for accuracy and safety, and answers APPROVED, or REVISE with numbered edits.",
      tools: [],
      prompt: EDITOR_PROMPT,
      model: model ?? EDITOR_MODEL,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function subagentOf(toolInput: unknown): string | undefined {
  const value = asRecord(toolInput).subagent_type;
  return typeof value === "string" ? value : undefined;
}

function promptOf(toolInput: unknown): string | undefined {
  const value = asRecord(toolInput).prompt;
  return typeof value === "string" ? value : undefined;
}

/** Reads a tool response as text, whether it is a string or MCP content. */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";

  const content = asRecord(value).content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const text = asRecord(part).text;
        return typeof text === "string" ? text : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return JSON.stringify(value);
}

function firstLine(text: string, limit = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/**
 * A PreToolUse hook on the Agent tool. Subagents run in the background by
 * default, which would hand the orchestrator a task id instead of facts, so
 * every call is rewritten to run in the foreground.
 */
export function foreground(input: PreToolUseHookInput): SyncHookJSONOutput {
  if (input.tool_name !== AGENT_TOOL) return { continue: true };

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: {
        ...asRecord(input.tool_input),
        run_in_background: false,
      },
    },
  };
}

/** Lines that state a fact: not blank, not a heading, not an introduction. */
function factLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) => line !== "" && !line.startsWith("#") && !line.endsWith(":"),
    );
}

function hasSource(line: string): boolean {
  return /\[[^\]]+\]/.test(line);
}

function hasNumberedEdits(text: string): boolean {
  return /(^|\n)\s*\d+[.)]\s+\S/.test(text);
}

function block(reason: string): SyncHookJSONOutput {
  return { decision: "block", reason };
}

/**
 * A PostToolUse hook on the Agent tool. It checks a subagent's output before
 * the orchestrator reads it: the researcher must source every fact, and the
 * editor's REVISE must carry numbered edits. A block with a reason becomes
 * feedback on the call, so the orchestrator runs the agent again.
 */
export function guardrail(input: PostToolUseHookInput): SyncHookJSONOutput {
  if (input.tool_name !== AGENT_TOOL) return { continue: true };

  const agent = subagentOf(input.tool_input);
  const output = textOf(input.tool_response);

  if (agent === "researcher") {
    const unsourced = factLines(output).filter((line) => !hasSource(line));
    if (unsourced.length > 0) {
      return block(
        `The researcher gave a fact with no source: "${firstLine(unsourced[0])}". Run the researcher again and end every fact with its source in brackets.`,
      );
    }
  }

  if (
    agent === "editor" &&
    /\bREVISE\b/.test(output) &&
    !hasNumberedEdits(output)
  ) {
    return block(
      "The editor asked for a REVISE without numbered edits. Run the editor again and put each edit on its own numbered line.",
    );
  }

  return { continue: true };
}

function toTraceEvent(input: HookInput, started: number): TraceEvent | null {
  if (
    input.hook_event_name !== "PreToolUse" &&
    input.hook_event_name !== "PostToolUse"
  ) {
    return null;
  }

  const before = input.hook_event_name === "PreToolUse";
  const name =
    input.tool_name === AGENT_TOOL
      ? subagentOf(input.tool_input)
      : input.tool_name;
  const detail =
    input.tool_name === AGENT_TOOL
      ? before
        ? firstLine(promptOf(input.tool_input) ?? "")
        : firstLine(textOf(input.tool_response))
      : undefined;

  return {
    at: Date.now() - started,
    agent: input.agent_type ?? ORCHESTRATOR,
    kind:
      input.tool_name === AGENT_TOOL ? "handoff" : before ? "call" : "result",
    ...(name ? { name } : {}),
    ...(detail ? { detail } : {}),
  };
}

/**
 * The tracing hook, run on both tool events. Every tool call and handoff is
 * recorded with the agent that made it and the time since the run started.
 */
export function recordHook(
  trace: TraceEvent[],
  started: number,
  onTrace?: (event: TraceEvent) => void,
): HookCallback {
  return async (input) => {
    const event = toTraceEvent(input, started);
    if (!event) return { continue: true };

    trace.push(event);
    onTrace?.(event);
    return { continue: true };
  };
}

/** Wraps a plain hook in the SDK's callback shape. */
function asHook<Input extends HookInput>(
  hook: (input: Input) => SyncHookJSONOutput,
): HookCallback {
  return async (input) => hook(input as Input);
}

/** The orchestrator's options: 3 agents, the knowledge server and 3 hooks. */
export function explainOptions(
  trace: TraceEvent[],
  started: number,
  on: ExplainEvents,
  model?: string,
): Options {
  return {
    systemPrompt: ORCHESTRATOR_PROMPT,
    ...(model ? { model } : {}),
    agents: agentDefinitions(model),
    mcpServers: { [KNOWLEDGE_SERVER]: knowledgeServer },
    tools: [AGENT_TOOL],
    allowedTools: [AGENT_TOOL, SEARCH_TOOL, READ_TOOL],
    permissionMode: "dontAsk",
    maxTurns: MAX_TURNS,
    hooks: {
      PreToolUse: [
        { matcher: AGENT_TOOL, hooks: [asHook(foreground)] },
        { hooks: [recordHook(trace, started, on.trace)] },
      ],
      PostToolUse: [
        { matcher: AGENT_TOOL, hooks: [asHook(guardrail)] },
        { hooks: [recordHook(trace, started, on.trace)] },
      ],
    },
  };
}

/** Splits the orchestrator's final message into an approval and a reply. */
export function readResult(text: string): {
  approved: boolean;
  reply: string;
} {
  const trimmed = text.trim();

  if (trimmed.startsWith("NOT APPROVED")) {
    return { approved: false, reply: trimmed };
  }
  if (trimmed.startsWith("APPROVED")) {
    return { approved: true, reply: trimmed.slice("APPROVED".length).trim() };
  }

  return { approved: false, reply: trimmed };
}

/**
 * Runs the 4-agent pipeline on a customer question: the researcher gathers
 * sourced facts, the writer drafts the reply and the editor approves it or asks
 * for numbered edits. The orchestrator allows 2 revisions. `run` defaults to
 * the SDK's `query`, so tests can play a scripted pipeline instead.
 */
export async function explain(
  question: string,
  on: ExplainEvents,
  run: ExplainRun = query,
  model?: string,
): Promise<Explanation> {
  const text = question.trim();
  if (!text) throw new Error("Ask the pipeline a question.");

  const trace: TraceEvent[] = [];
  const started = Date.now();
  const options = explainOptions(trace, started, on, model);

  let result: SDKResultMessage | undefined;

  for await (const message of run({ prompt: text, options })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") on.text(block.text);
      }
    } else if (message.type === "result") {
      result = message;
    }
  }

  if (!result) throw new Error("The pipeline ended without a result.");

  const final =
    "result" in result && typeof result.result === "string"
      ? readResult(result.result)
      : {
          approved: false,
          reply: `The pipeline did not finish (${result.subtype}).`,
        };

  return {
    ...final,
    trace,
    cost: result.total_cost_usd,
    turns: result.num_turns,
  };
}
