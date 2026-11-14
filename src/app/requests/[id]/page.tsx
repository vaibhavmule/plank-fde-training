import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { RequestDetail } from "@/components/request-detail";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { getRequest } from "@/lib/requests";

export const metadata = { title: "Request" };

async function RequestData({ id }: { id: string }) {
  const request = await getRequest(id);
  if (!request) notFound();
  return <RequestDetail request={request} />;
}

export default function RequestPage({ params }: PageProps<"/requests/[id]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
        <Link
          href="/requests"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back to requests
        </Link>
        {/* The id is only known at request time, so it is read inside Suspense. */}
        <Suspense
          fallback={
            <p role="status" className="text-muted-foreground">
              Loading request…
            </p>
          }
        >
          {params.then(({ id }) => (
            <RequestData id={id} />
          ))}
        </Suspense>
      </main>
    </>
  );
}
