import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          WorkBot
        </Link>
        <Link href="/settings" className={buttonVariants({ variant: "ghost" })}>
          Settings
        </Link>
      </div>
    </header>
  );
}
