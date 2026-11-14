"use client";

import { cn } from "cn";
import { Plus } from "lucide-react";
import { io } from "next/cache";
import { use, useState, useSyncExternalStore } from "react";

import { Chat } from "@/components/chat";
import { Button } from "@/components/ui/button";
import {
  getConversations,
  getServerConversations,
  subscribe,
  upsert,
} from "@/lib/conversations";

/**
 * The conversation list and the open chat. `use(io())` holds the component
 * back while the page prerenders, so the id created below is never baked into
 * the static HTML.
 */
export function Conversations() {
  use(io());

  const conversations = useSyncExternalStore(
    subscribe,
    getConversations,
    getServerConversations,
  );
  const [activeId, setActiveId] = useState(() => crypto.randomUUID());
  const active = conversations.find(
    (conversation) => conversation.id === activeId,
  );

  function startNew() {
    setActiveId(crypto.randomUUID());
  }

  // The select needs a row for a conversation that has not been saved yet.
  const options: { id: string; title: string }[] = active
    ? conversations
    : [{ id: activeId, title: "New chat" }, ...conversations];

  return (
    <div className="grid h-full min-h-0 md:grid-cols-[11rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col border-r md:flex">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Conversations
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={startNew}
            aria-label="New chat"
          >
            <Plus />
          </Button>
        </div>
        <nav
          aria-label="Conversations"
          className="min-h-0 flex-1 overflow-y-auto p-2"
        >
          {conversations.length === 0 ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">
              No conversations yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(conversation.id)}
                    aria-current={
                      conversation.id === activeId ? "true" : undefined
                    }
                    className={cn(
                      "hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-sm",
                      conversation.id === activeId && "bg-muted font-medium",
                    )}
                  >
                    <span className="line-clamp-2">{conversation.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>

      <div className="flex min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b p-2 md:hidden">
          <select
            value={activeId}
            onChange={(event) => setActiveId(event.target.value)}
            aria-label="Conversation"
            className="border-input bg-background h-8 min-w-0 flex-1 rounded-lg border px-2 text-sm"
          >
            {options.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={startNew}>
            <Plus />
            New chat
          </Button>
        </div>

        <div className="min-h-0 flex-1">
          <Chat
            key={activeId}
            id={activeId}
            initialMessages={active?.messages}
            onMessages={(messages) => upsert(activeId, messages)}
          />
        </div>
      </div>
    </div>
  );
}
