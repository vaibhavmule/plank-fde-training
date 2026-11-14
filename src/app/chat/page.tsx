import { Suspense } from "react";

import { Conversations } from "@/components/conversations";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Chat with WorkBot
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ask a question and watch WorkBot use its tools.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border">
          <Suspense
            fallback={
              <p className="text-muted-foreground p-6 text-sm">
                Loading conversations…
              </p>
            }
          >
            <Conversations />
          </Suspense>
        </div>
      </main>
    </>
  );
}
