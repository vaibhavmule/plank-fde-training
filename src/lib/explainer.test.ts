import { describe, expect, test, vi } from "vitest";

import type {
  HookInput,
  PostToolUseHookInput,
  PreToolUseHookInput,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

import {
  agentDefinitions,
  explain,
  explainOptions,
  foreground,
  guardrail,
  readResult,
  recordHook,
  type ExplainEvents,
  type ExplainRun,
  type TraceEvent,
} from "./explainer";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

const QUESTION = "Why was my refund only $200 when I paid $250?";

function pre(toolInput: unknown, agentType?: string): PreToolUseHookInput {
  return {
    hook_event_name: "PreToolUse",
    tool_name: "Agent",
    tool_use_id: "tool-1",
    tool_input: toolInput,
    session_id: "session-1",
    transcript_path: "",
    cwd: "/tmp",
    ...(agentType ? { agent_type: agentType } : {}),
  };
}

function post(toolInput: unknown, toolResponse: unknown): PostToolUseHookInput {
  return {
    hook_event_name: "PostToolUse",
    tool_name: "Agent",
    tool_input: toolInput,
    tool_response: toolResponse,
    tool_use_id: "tool-1",
    session_id: "session-1",
    transcript_path: "",
    cwd: "/tmp",
  };
}

function events(): ExplainEvents & { texts: string[] } {
  const texts: string[] = [];
  return {
    texts,
    trace: () => {},
    text: (delta: string) => texts.push(delta),
  };
}

describe("foreground", () => {
  test("rewrites an Agent call to run in the foreground", () => {
    const output = foreground(
      pre({
        description: "Research the refund limit",
        prompt: QUESTION,
        subagent_type: "researcher",
        run_in_background: true,
      }),
    );

    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput: {
          description: "Research the refund limit",
          prompt: QUESTION,
          subagent_type: "researcher",
          run_in_background: false,
        },
      },
    });
  });

  test("sets the flag even when the call left it out", () => {
    const output = foreground(pre({ subagent_type: "writer" }));

    expect(output.hookSpecificOutput).toMatchObject({
      updatedInput: { subagent_type: "writer", run_in_background: false },
    });
  });

  test("leaves a tool that is not Agent alone", () => {
    const output = foreground({
      ...pre({ question: "refund" }),
      tool_name: "mcp__knowledge__find",
    });

    expect(output).toEqual({ continue: true });
  });
});

describe("guardrail", () => {
  const researcher = {
    description: "Facts",
    prompt: QUESTION,
    subagent_type: "researcher",
  };
  const editor = {
    description: "Check",
    prompt: "draft",
    subagent_type: "editor",
  };

  test("blocks a researcher fact with no source", () => {
    const output = guardrail(
      post(
        researcher,
        "A support agent may refund up to $200 per customer.\nA refund above that needs the support lead. [source: policies/refunds#refund-authority]",
      ),
    );

    expect(output.decision).toBe("block");
    expect(output.reason).toMatch(/no source/);
    expect(output.reason).toMatch(/\$200/);
  });

  test("passes a researcher whose every fact carries a source", () => {
    const output = guardrail(
      post(
        researcher,
        "## Facts\n\n- A support agent may refund up to $200 per customer. [source: policies/refunds#refund-authority]\n- A refund above $200 needs written approval. [source: policies/refunds#refund-authority]",
      ),
    );

    expect(output).toEqual({ continue: true });
  });

  test("blocks a REVISE with no numbered edits", () => {
    const output = guardrail(
      post(
        editor,
        "REVISE\n- Say why the refund was $200.\n- Mention the 90-day rule.",
      ),
    );

    expect(output.decision).toBe("block");
    expect(output.reason).toMatch(/numbered/);
  });

  test("passes a REVISE with numbered edits", () => {
    const output = guardrail(
      post(
        editor,
        "REVISE\n1. Say that $200 is the no-approval limit.\n2. Mention the 90-day rule.",
      ),
    );

    expect(output).toEqual({ continue: true });
  });

  test("passes an approval", () => {
    expect(guardrail(post(editor, "APPROVED"))).toEqual({ continue: true });
  });

  test("leaves a tool that is not Agent alone", () => {
    expect(
      guardrail({ ...post({}, ""), tool_name: "mcp__knowledge__cat" }),
    ).toEqual({ continue: true });
  });
});

describe("recordHook", () => {
  test("traces a handoff and a tool call with the agent that made it", async () => {
    const trace: TraceEvent[] = [];
    const seen: TraceEvent[] = [];
    const record = recordHook(trace, Date.now(), (event) => seen.push(event));

    await record(
      {
        ...pre({ subagent_type: "researcher", prompt: QUESTION }),
      } as HookInput,
      "tool-1",
      { signal: new AbortController().signal },
    );
    await record(
      {
        ...pre({ question: "refund limit" }, "researcher"),
        tool_name: "mcp__knowledge__find",
      } as HookInput,
      "tool-2",
      { signal: new AbortController().signal },
    );
    await record(
      {
        ...post(
          { subagent_type: "researcher" },
          "Limit is $200. [source: policies/refunds#refund-authority]",
        ),
      } as HookInput,
      "tool-1",
      { signal: new AbortController().signal },
    );

    expect(trace.map((event) => [event.agent, event.kind, event.name])).toEqual(
      [
        ["orchestrator", "handoff", "researcher"],
        ["researcher", "call", "mcp__knowledge__find"],
        ["orchestrator", "handoff", "researcher"],
      ],
    );
    expect(trace.every((event) => event.at >= 0)).toBe(true);
    expect(seen).toEqual(trace);
  });
});

describe("agentDefinitions", () => {
  test("runs the researcher on Haiku, the writer and editor on Sonnet", () => {
    const agents = agentDefinitions();

    expect(agents.researcher.model).toBe("haiku");
    expect(agents.writer.model).toBe("sonnet");
    expect(agents.editor.model).toBe("sonnet");
    expect(agents.researcher.tools).toEqual([
      "mcp__knowledge__find",
      "mcp__knowledge__ls",
      "mcp__knowledge__cat",
      "mcp__knowledge__grep",
    ]);
    expect(agents.writer.tools).toEqual([]);
    expect(agents.editor.tools).toEqual([]);
  });

  test("a model overrides every agent", () => {
    const agents = agentDefinitions("claude-haiku-5-5");

    expect(Object.values(agents).map((agent) => agent.model)).toEqual([
      "claude-haiku-5-5",
      "claude-haiku-5-5",
      "claude-haiku-5-5",
    ]);
  });
});

describe("explainOptions", () => {
  test("wires 3 agents, the knowledge server and 3 hooks", () => {
    const options = explainOptions([], Date.now(), events());

    expect(Object.keys(options.agents ?? {})).toEqual([
      "researcher",
      "writer",
      "editor",
    ]);
    expect(options.mcpServers).toHaveProperty("knowledge");
    expect(options.maxTurns).toBe(24);
    expect(options.permissionMode).toBe("dontAsk");
    expect(options.allowedTools).toEqual([
      "Agent",
      "mcp__knowledge__find",
      "mcp__knowledge__ls",
      "mcp__knowledge__cat",
      "mcp__knowledge__grep",
    ]);
    expect(options.hooks?.PreToolUse?.[0].matcher).toBe("Agent");
    expect(options.hooks?.PreToolUse?.[0].hooks).toHaveLength(1);
    expect(options.hooks?.PreToolUse?.[1].hooks).toHaveLength(1);
    expect(options.hooks?.PostToolUse?.[0].matcher).toBe("Agent");
    expect(options.hooks?.PostToolUse?.[1].hooks).toHaveLength(1);
  });
});

describe("readResult", () => {
  test("splits the orchestrator's approval from the reply", () => {
    expect(readResult("APPROVED\n\nYour refund was capped at $200.")).toEqual({
      approved: true,
      reply: "Your refund was capped at $200.",
    });
  });

  test("keeps the draft and the remaining edits when not approved", () => {
    const text =
      "NOT APPROVED\n\nDraft reply.\n\nRemaining edits:\n1. Say why.";
    expect(readResult(text)).toEqual({ approved: false, reply: text });
  });

  test("treats an unmarked message as not approved", () => {
    expect(readResult("Here is the reply.")).toEqual({
      approved: false,
      reply: "Here is the reply.",
    });
  });
});

function assistant(blocks: unknown[], subagentType?: string): SDKMessage {
  return {
    type: "assistant",
    message: {
      id: "message-1",
      type: "message",
      role: "assistant",
      model: "claude",
      content: blocks,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    parent_tool_use_id: null,
    uuid: "uuid-1",
    session_id: "session-1",
    ...(subagentType ? { subagent_type: subagentType } : {}),
  } as unknown as SDKMessage;
}

function result(text: string): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 1,
    duration_api_ms: 1,
    is_error: false,
    num_turns: 5,
    result: text,
    stop_reason: "end_turn",
    total_cost_usd: 0.0123,
    usage: {},
    modelUsage: {},
    permission_denials: [],
    uuid: "uuid-2",
    session_id: "session-1",
  } as unknown as SDKMessage;
}

function scripted(messages: SDKMessage[]): ExplainRun {
  return async function* () {
    for (const message of messages) yield message;
  };
}

describe("explain", () => {
  test("an approved run returns the reply, its trace, cost and turns", async () => {
    const on = events();
    const run = scripted([
      assistant(
        [{ type: "text", text: "I'll research the refund policy." }],
        "researcher",
      ),
      assistant([
        {
          type: "tool_use",
          id: "tool-1",
          name: "Agent",
          input: { subagent_type: "writer", prompt: "Draft the reply." },
        },
      ]),
      assistant([
        { type: "text", text: "APPROVED\n\nYour refund was capped at $200." },
      ]),
      result("APPROVED\n\nYour refund was capped at $200."),
    ]);

    const explanation = await explain(QUESTION, on, run);

    expect(explanation.approved).toBe(true);
    expect(explanation.reply).toBe("Your refund was capped at $200.");
    expect(explanation.cost).toBe(0.0123);
    expect(explanation.turns).toBe(5);
    expect(explanation.trace).toEqual([]);
    expect(on.texts.join("")).toContain("$200");
  });

  test("a run the editor did not approve returns the draft and the edits", async () => {
    const text =
      "NOT APPROVED\n\nDraft reply.\n\nRemaining edits:\n1. Say why the refund was $200.";
    const explanation = await explain(
      QUESTION,
      events(),
      scripted([result(text)]),
    );

    expect(explanation.approved).toBe(false);
    expect(explanation.reply).toBe(text);
  });

  test("an error from the run reaches the caller", async () => {
    const run: ExplainRun = async function* () {
      throw new Error("overloaded");
      yield result("unused");
    };

    await expect(explain(QUESTION, events(), run)).rejects.toThrow(
      /overloaded/,
    );
  });

  test("rejects an empty question before starting the run", async () => {
    await expect(explain("  ", events(), scripted([]))).rejects.toThrow(
      /Ask the pipeline a question/,
    );
  });
});
