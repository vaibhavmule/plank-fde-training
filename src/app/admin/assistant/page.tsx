import { Chat } from "@/components/chat";

export const metadata = { title: "Assistant" };

export default function AssistantPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          WorkBot&apos;s assistant, on its own conversation for the console.
        </p>
      </div>
      <div className="h-[32rem] overflow-hidden rounded-xl border">
        <Chat id="admin-assistant" />
      </div>
    </div>
  );
}
