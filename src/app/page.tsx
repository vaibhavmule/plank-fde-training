import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Workflows that run themselves.
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg leading-8">
          WorkBot is an enterprise workflow platform. It turns the repetitive
          steps of everyday work, like approvals, hand-offs and follow-ups, into
          automated flows your team can trust and audit.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/settings" className={buttonVariants({ size: "lg" })}>
            Open settings
          </Link>
          <Link
            href="/api/health"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Health check
          </Link>
        </div>
      </main>
      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-6 text-sm">
          <span>WorkBot · Enterprise workflow platform</span>
          <Link href="/api/health" className="hover:text-foreground">
            Status
          </Link>
        </div>
      </footer>
    </>
  );
}
