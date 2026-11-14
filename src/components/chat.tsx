"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";

import { Message } from "@/components/message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const STICK_DISTANCE = 80;

type ChatProps = {
  /** The conversation id: useChat keeps one message list per id. */
  id: string;
  /** Messages to start from, used when returning to a stored conversation. */
  initialMessages?: UIMessage[];
  /** Called with the full history once a reply finishes. */
  onMessages?: (messages: UIMessage[]) => void;
};

/** The conversation. Its `id` gives useChat its own message list. */
export function Chat({ id, initialMessages, onMessages }: ChatProps) {
  const { messages, sendMessage, status, stop, error } = useChat({
    id,
    messages: initialMessages,
    onFinish: ({ messages: finished, isError, isDisconnect }) => {
      if (!isError && !isDisconnect) onMessages?.(finished);
    },
  });
  const [input, setInput] = useState("");
  const [following, setFollowing] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";

  // Follow the stream while the reader is at the bottom; stay put once they
  // scroll up.
  useEffect(() => {
    if (!following) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, following]);

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    setFollowing(distance < STICK_DISTANCE);
  }

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setFollowing(true);
    void sendMessage({ text });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={listRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-6"
      >
        {messages.length === 0 && (
          <div className="text-muted-foreground mx-auto max-w-sm py-10 text-center text-sm">
            <p className="text-foreground font-medium">How can I help?</p>
            <p className="mt-2">
              Ask about a company policy, the status of a request, or a
              calculation.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}

        {status === "submitted" && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <span className="bg-foreground inline-block size-2 animate-pulse rounded-full" />
            <span className="text-muted-foreground">Thinking…</span>
          </p>
        )}

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error.message}
          </p>
        )}
      </div>

      <form
        className="bg-background border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Ask WorkBot about a policy or a request…"
            aria-label="Message WorkBot"
            className="max-h-40 min-h-9 resize-none py-2"
          />
          {status === "streaming" ? (
            <Button type="button" variant="outline" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim() || busy}>
              Send
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
