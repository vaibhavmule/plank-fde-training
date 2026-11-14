import Link from "next/link";

import { formatPolicyDate } from "@/lib/policy-format";
import type { PolicyMeta } from "@/lib/policies";

export function PolicyList({ policies }: { policies: PolicyMeta[] }) {
  if (policies.length === 0) {
    return <p className="text-muted-foreground">No policies yet.</p>;
  }

  return (
    <ul className="space-y-4">
      {policies.map((policy) => (
        <li key={policy.slug}>
          <article className="rounded-lg border p-5">
            <h2 className="text-lg font-semibold tracking-tight">
              <Link
                href={`/policies/${policy.slug}`}
                className="hover:underline"
              >
                {policy.title}
              </Link>
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {policy.summary}
            </p>
            <p className="text-muted-foreground mt-3 text-xs">
              <span className="capitalize">{policy.team}</span> · Updated{" "}
              <time dateTime={policy.updatedAt}>
                {formatPolicyDate(policy.updatedAt)}
              </time>
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}
