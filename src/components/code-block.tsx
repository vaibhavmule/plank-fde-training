"use client";

import { cn } from "cn";
import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textContent).join("");
  }

  if (node && typeof node === "object" && "props" in node) {
    return textContent(
      (node as { props?: { children?: ReactNode } }).props?.children,
    );
  }

  return "";
}

/**
 * A highlighted code block with a copy button. It copies the text inside the
 * block, not the markup the highlighter added.
 */
export function CodeBlock({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const code = textContent(children);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard access can be denied, so the button simply stays as it is.
    }
  }

  return (
    <div className="group relative mt-4">
      <pre
        className={cn(
          "bg-muted/50 overflow-x-auto rounded-lg border p-4 text-sm",
          className,
        )}
      >
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="bg-background/90 text-muted-foreground hover:text-foreground absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md border opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
