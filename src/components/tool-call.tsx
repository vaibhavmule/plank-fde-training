import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
} from "lucide-react";

export type ChatToolPart = ToolUIPart | DynamicToolUIPart;

type ToolLabel = { title: string; running: string; done: string };

const TOOL_LABELS: Record<string, ToolLabel> = {
  calculator: {
    title: "Calculator",
    running: "Calculating…",
    done: "Calculated",
  },
  web_search: {
    title: "Web search",
    running: "Searching the web…",
    done: "Searched the web",
  },
  read_url: {
    title: "Page reader",
    running: "Reading page…",
    done: "Read page",
  },
  save_note: { title: "Note", running: "Saving note…", done: "Saved note" },
};

function toolName(part: ChatToolPart) {
  return part.type === "dynamic-tool"
    ? part.toolName
    : part.type.slice("tool-".length);
}

function labelFor(name: string): ToolLabel {
  const known = TOOL_LABELS[name];
  if (known) return known;

  const readable = name.replaceAll("_", " ");
  return {
    title: readable.charAt(0).toUpperCase() + readable.slice(1),
    running: `Running ${readable}…`,
    done: `Ran ${readable}`,
  };
}

function isRunning(state: ChatToolPart["state"]) {
  return state === "input-streaming" || state === "input-available";
}

function summaryText(part: ChatToolPart, label: ToolLabel) {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return label.running;
    case "output-available":
      return label.done;
    case "output-error":
      return `${label.title} failed`;
    case "approval-requested":
      return `${label.title} needs approval`;
    case "approval-responded":
      return `${label.title} approved`;
    case "output-denied":
      return `${label.title} denied`;
  }
}

function formatValue(value: unknown) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function StateIcon({ state }: { state: ChatToolPart["state"] }) {
  if (isRunning(state)) {
    return (
      <LoaderCircle
        className="text-muted-foreground size-3.5 animate-spin"
        aria-hidden="true"
      />
    );
  }

  if (state === "output-available") {
    return (
      <CircleCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
    );
  }

  return (
    <CircleAlert className="text-destructive size-3.5" aria-hidden="true" />
  );
}

/**
 * One tool call, labelled by its state. The input shows while the tool runs;
 * the output or the error shows once it is done. Raw details stay folded away.
 */
export function ToolCall({ part }: { part: ChatToolPart }) {
  const label = labelFor(toolName(part));
  const running = isRunning(part.state);

  return (
    <details className="group bg-muted/40 rounded-lg border text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="text-muted-foreground size-3.5 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        <StateIcon state={part.state} />
        <span className="font-medium">{summaryText(part, label)}</span>
        <span className="text-muted-foreground ml-auto text-xs">
          {toolName(part)}
        </span>
      </summary>

      <div className="space-y-3 border-t px-3 py-3">
        {part.input !== undefined && (
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
              Input
            </p>
            <pre className="bg-background/60 overflow-x-auto rounded p-2 font-mono text-xs">
              {formatValue(part.input)}
            </pre>
          </div>
        )}

        {part.state === "output-available" && (
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
              {running ? "Result so far" : "Output"}
            </p>
            <pre className="bg-background/60 overflow-x-auto rounded p-2 font-mono text-xs whitespace-pre-wrap">
              {formatValue(part.output)}
            </pre>
          </div>
        )}

        {part.state === "output-error" && (
          <div>
            <p className="text-destructive mb-1 text-xs font-medium uppercase tracking-wide">
              Error
            </p>
            <p role="alert" className="text-destructive text-xs">
              {part.errorText}
            </p>
          </div>
        )}
      </div>
    </details>
  );
}
