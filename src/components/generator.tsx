"use client";

import { useUIStream } from "@json-render/react";
import { useState } from "react";

import { GeneratedUI } from "@/components/generated-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const examples = [
  {
    label: "Operations dashboard",
    prompt:
      "Build an operations dashboard from the live requests: metric cards for the total and open counts, a bar chart of requests by team, a pie chart of requests by priority, and a table of the latest requests.",
  },
  {
    label: "Intake form",
    prompt:
      "Build a request intake form with a title, details, team and priority. Bind the fields to state, and make the submit button file the request.",
  },
  {
    label: "Request timeline",
    prompt:
      "Build a timeline of the latest requests, newest first, showing each request's title, team, priority, status and time.",
  },
];

export function Generator() {
  const { spec, isStreaming, error, send, clear } = useUIStream({
    api: "/api/generate",
  });
  const [prompt, setPrompt] = useState("");

  function generate(text: string) {
    const next = text.trim();
    if (!next || isStreaming) return;
    setPrompt(next);
    void send(next, spec ? { previousSpec: spec } : undefined);
  }

  const waiting = isStreaming && !spec?.root;

  return (
    <div className="space-y-8">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          generate(prompt);
        }}
      >
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              generate(prompt);
            }
          }}
          rows={3}
          placeholder="Describe the page you want, for example an operations dashboard on the live requests…"
          aria-label="Describe the page"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!prompt.trim() || isStreaming}>
            {isStreaming ? "Generating…" : spec ? "Edit page" : "Generate page"}
          </Button>
          {spec && (
            <Button type="button" variant="outline" onClick={clear}>
              Clear
            </Button>
          )}
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <Button
            key={example.label}
            type="button"
            variant="outline"
            size="sm"
            disabled={isStreaming}
            onClick={() => generate(example.prompt)}
          >
            {example.label}
          </Button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}

      {waiting && (
        <div
          role="status"
          aria-label="Generating the page"
          className="grid gap-4 sm:grid-cols-3"
        >
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="bg-muted h-24 animate-pulse rounded-xl"
            />
          ))}
        </div>
      )}

      {!isStreaming && spec && !spec.root && (
        <p role="status" className="text-muted-foreground text-sm">
          The model did not return a page. Try describing it another way.
        </p>
      )}

      {spec && <GeneratedUI spec={spec} loading={isStreaming} />}
    </div>
  );
}
