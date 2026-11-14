import Link from "next/link";
import { Suspense } from "react";

import { RequestsList } from "./requests-list";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Requests" };

// The page stays synchronous: the query string is read inside the Suspense
// boundary so the header and heading remain in the static shell.
export default function RequestsPage({ searchParams }: PageProps<"/requests">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Work submitted to your teams, newest first.
            </p>
          </div>
          <Link href="/requests/new" className={buttonVariants()}>
            New request
          </Link>
        </div>
        <Suspense
          fallback={
            <p role="status" className="text-muted-foreground">
              Loading requests…
            </p>
          }
        >
          <RequestsList searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
