import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          WorkBot
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-1">
          <Link href="/chat" className={buttonVariants({ variant: "ghost" })}>
            Chat
          </Link>
          <Link
            href="/requests"
            className={buttonVariants({ variant: "ghost" })}
          >
            Requests
          </Link>
          <Link
            href="/dashboards"
            className={buttonVariants({ variant: "ghost" })}
          >
            Dashboards
          </Link>
          <Link href="/admin" className={buttonVariants({ variant: "ghost" })}>
            Admin
          </Link>
          <Link
            href="/settings"
            className={buttonVariants({ variant: "ghost" })}
          >
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
}
