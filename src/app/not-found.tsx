import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-muted-foreground text-sm font-medium">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">
        The page you are looking for does not exist or has moved.
      </p>
      <Link href="/" className={buttonVariants()}>
        Back to home
      </Link>
    </main>
  );
}
