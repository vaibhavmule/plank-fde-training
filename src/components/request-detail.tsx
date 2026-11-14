import {
  PriorityBadge,
  StatusBadge,
  TeamBadge,
} from "@/components/request-badges";
import type { WorkRequest } from "@/lib/request-model";

function Field({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs font-medium">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// React escapes the title and details, so submitted markup renders as text.
export function RequestDetail({ request }: { request: WorkRequest }) {
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight break-words">
        {request.title}
      </h1>
      <dl className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
        <Field term="Team">
          <TeamBadge team={request.team} />
        </Field>
        <Field term="Priority">
          <PriorityBadge priority={request.priority} />
        </Field>
        <Field term="Status">
          <StatusBadge status={request.status} />
        </Field>
        <Field term="Created">
          <time dateTime={request.createdAt}>
            {request.createdAt.slice(0, 16).replace("T", " ")} UTC
          </time>
        </Field>
      </dl>
      <section aria-labelledby="request-details-heading" className="space-y-2">
        <h2 id="request-details-heading" className="font-semibold">
          Details
        </h2>
        {request.details ? (
          <p className="text-sm break-words whitespace-pre-wrap">
            {request.details}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">No details provided.</p>
        )}
      </section>
    </article>
  );
}
