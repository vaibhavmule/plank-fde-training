import Link from "next/link";
import { Suspense } from "react";

import { RequestsTable } from "@/components/requests-table";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { listRequests } from "@/lib/requests";

export const metadata = { title: "Requests" };

async function RequestsList() {
  const requests = await listRequests();
  return <RequestsTable requests={requests} />;
}

export default function RequestsPage() {
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
          <RequestsList />
        </Suspense>
      </main>
    </>
  );
}
