import Link from "next/link";
import { Suspense } from "react";

import { AdminOverview } from "@/components/admin-overview";
import { buttonVariants } from "@/components/ui/button";
import { listRequests } from "@/lib/requests";

export const metadata = { title: "Admin overview" };

async function OverviewData() {
  const requests = await listRequests();
  return <AdminOverview requests={requests} />;
}

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Admin overview
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Request totals and the five latest submissions across your teams.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/requests/new" className={buttonVariants()}>
            New request
          </Link>
          <Link
            href="/requests"
            className={buttonVariants({ variant: "outline" })}
          >
            View all requests
          </Link>
        </div>
      </div>
      <Suspense
        fallback={
          <p role="status" className="text-muted-foreground">
            Loading overview…
          </p>
        }
      >
        <OverviewData />
      </Suspense>
    </div>
  );
}
