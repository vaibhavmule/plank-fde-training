import "highlight.js/styles/github.css";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "@/components/code-block";

// Raw HTML in a message is escaped by react-markdown unless a rehype plugin
// enables it. Keep it that way: model output is content, not markup.
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-6 text-xl font-semibold tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 text-lg font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 text-base font-semibold tracking-tight first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="mt-3 leading-7 first:mt-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1.5 pl-6 first:mt-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1.5 pl-6 first:mt-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-7">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium underline underline-offset-2"
      rel="noreferrer noopener"
      target="_blank"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-muted-foreground/40 text-muted-foreground mt-3 border-l-2 pl-4 first:mt-0">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b px-3 py-2">{children}</td>,
  pre: CodeBlock,
  code: ({ className, children }) => (
    <code
      className={
        className || "bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]"
      }
    >
      {children}
    </code>
  ),
};

/** Renders Markdown with GFM tables and highlighted, copyable code blocks. */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
