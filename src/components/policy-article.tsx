import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { formatPolicyDate } from "@/lib/policy-format";
import type { Policy } from "@/lib/policies";

// Raw HTML in a policy file is escaped by react-markdown unless a rehype
// plugin explicitly enables it. Keep it that way: policy bodies are content,
// not application markup.
const components: Components = {
  h2: ({ children }) => (
    <h2 className="mt-8 text-xl font-semibold tracking-tight">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 text-lg font-semibold tracking-tight">{children}</h3>
  ),
  p: ({ children }) => <p className="mt-4 leading-7">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-4 list-disc space-y-2 pl-6">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-6">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-7">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium underline underline-offset-2"
      rel="noreferrer noopener"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-muted-foreground/40 text-muted-foreground mt-4 border-l-2 pl-4">
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
  code: ({ children }) => (
    <code className="bg-muted rounded px-1 py-0.5 text-sm">{children}</code>
  ),
};

export function PolicyArticle({ policy }: { policy: Policy }) {
  return (
    <article>
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {policy.title}
        </h1>
        <p className="text-muted-foreground">{policy.summary}</p>
        <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="font-medium">Team</dt>
            <dd className="capitalize">{policy.team}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">Updated</dt>
            <dd>
              <time dateTime={policy.updatedAt}>
                {formatPolicyDate(policy.updatedAt)}
              </time>
            </dd>
          </div>
        </dl>
      </header>
      <div className="mt-6">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {policy.body}
        </ReactMarkdown>
      </div>
    </article>
  );
}
