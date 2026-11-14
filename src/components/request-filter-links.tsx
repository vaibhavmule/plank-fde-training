import Link from "next/link";

import { label } from "@/components/requests-table";
import { buttonVariants } from "@/components/ui/button";
import {
  statusSchema,
  teamSchema,
  type RequestFilters,
} from "@/lib/request-model";

export function requestsHref(filters: RequestFilters) {
  const query = new URLSearchParams();
  if (filters.team) query.set("team", filters.team);
  if (filters.status) query.set("status", filters.status);
  return query.size > 0 ? `/requests?${query}` : "/requests";
}

function FilterRow<Value extends string>({
  name,
  allLabel,
  options,
  selected,
  hrefFor,
}: {
  name: string;
  allLabel: string;
  options: readonly Value[];
  selected: Value | undefined;
  hrefFor: (value: Value | undefined) => string;
}) {
  const labelId = `request-filter-${name.toLowerCase()}`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span
        id={labelId}
        className="text-muted-foreground w-12 text-sm font-medium"
      >
        {name}
      </span>
      <ul aria-labelledby={labelId} className="flex flex-wrap gap-1">
        {[undefined, ...options].map((option) => {
          const current = option === selected;
          return (
            <li key={option ?? "all"}>
              <Link
                href={hrefFor(option)}
                aria-current={current ? "true" : undefined}
                className={buttonVariants({
                  variant: current ? "secondary" : "ghost",
                  size: "sm",
                })}
              >
                {option ? label(option) : allLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RequestFilterLinks({ filters }: { filters: RequestFilters }) {
  return (
    <nav aria-label="Filter requests" className="space-y-2">
      <FilterRow
        name="Team"
        allLabel="All teams"
        options={teamSchema.options}
        selected={filters.team}
        hrefFor={(team) => requestsHref({ ...filters, team })}
      />
      <FilterRow
        name="Status"
        allLabel="All statuses"
        options={statusSchema.options}
        selected={filters.status}
        hrefFor={(status) => requestsHref({ ...filters, status })}
      />
      {(filters.team || filters.status) && (
        <Link
          href="/requests"
          className={buttonVariants({
            variant: "link",
            size: "sm",
            className: "px-0",
          })}
        >
          Clear filters
        </Link>
      )}
    </nav>
  );
}

export function NoMatchingRequests() {
  return (
    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
      <h2 className="font-medium">No matching requests</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        No requests match the selected filters. Choose a different team or
        status, or{" "}
        <Link
          href="/requests"
          className="text-foreground underline underline-offset-4"
        >
          show all requests
        </Link>
        .
      </p>
    </div>
  );
}
