import { Suspense } from "react";

import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  listMemories,
  MEMORY_KINDS,
  MEMORY_LABELS,
  type Memory,
} from "@/lib/memory";
import { visitorId } from "@/lib/visitor";

import { forgetEverything, forgetMemory } from "./actions";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            What WorkBot remembers about you across conversations.
          </p>
        </div>
        <Suspense
          fallback={
            <p role="status" className="text-muted-foreground">
              Loading memories…
            </p>
          }
        >
          <Memories />
        </Suspense>
      </main>
    </>
  );
}

async function Memories() {
  const visitor = await visitorId();
  if (!visitor) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing to show</CardTitle>
          <CardDescription>
            WorkBot needs the visitor cookie to know whose memories to show.
            Open the chat first, then come back.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  let memories: Memory[];
  try {
    memories = await listMemories(visitor);
  } catch {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Memory is unavailable</CardTitle>
          <CardDescription>
            WorkBot cannot reach its memory store right now. Conversations still
            work; try again later.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (memories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No memories yet</CardTitle>
          <CardDescription>
            After a conversation, WorkBot keeps the lasting facts about you,
            such as your team, the systems you use and how you like answers.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memory</CardTitle>
        <CardDescription>
          Facts WorkBot learned from your conversations. Forget anything you no
          longer want it to use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {MEMORY_KINDS.map((kind) => {
          const group = memories.filter((memory) => memory.kind === kind);
          if (group.length === 0) return null;

          return (
            <section key={kind} className="space-y-2">
              <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {MEMORY_LABELS[kind]}
              </h2>
              <ul className="space-y-2">
                {group.map((memory) => (
                  <MemoryRow key={memory.id} memory={memory} />
                ))}
              </ul>
            </section>
          );
        })}
        <form action={forgetEverything}>
          <Button type="submit" variant="outline">
            Forget everything
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MemoryRow({ memory }: { memory: Memory }) {
  return (
    <li className="flex items-start justify-between gap-4 rounded-lg border px-3 py-2">
      <span className="text-sm">{memory.text}</span>
      <form action={forgetMemory}>
        <input type="hidden" name="id" value={memory.id} />
        <Button type="submit" variant="ghost" size="sm">
          Forget
        </Button>
      </form>
    </li>
  );
}
