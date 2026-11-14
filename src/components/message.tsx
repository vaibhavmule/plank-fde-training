import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";

import { Markdown } from "@/components/markdown";
import { ToolCall } from "@/components/tool-call";

type MessagePart = UIMessage["parts"][number];

function isToolPart(part: MessagePart): part is ToolUIPart | DynamicToolUIPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function userText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/**
 * One message: the person's words as a bubble, the assistant's as Markdown with
 * a panel per tool call.
 */
export function Message({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2 text-sm whitespace-pre-wrap">
          {userText(message)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return part.text ? (
            <Markdown key={index}>{part.text}</Markdown>
          ) : null;
        }

        if (isToolPart(part)) {
          return <ToolCall key={index} part={part} />;
        }

        return null;
      })}
    </div>
  );
}
