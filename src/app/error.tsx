"use client";

import { useEffect } from "react";

import { buttonVariants } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest matches the entry the server logs for this error.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-muted-foreground max-w-xl">
        This page could not load. Try again, and if it keeps failing, tell the
        team what you were doing.
      </p>
      <div>
        <button
          type="button"
          onClick={reset}
          className={buttonVariants({ size: "lg" })}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
