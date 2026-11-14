import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Admin overview</h1>
      <p className="text-muted-foreground text-sm">
        Manage requests and view deployment settings from the admin console.
      </p>
      <Link href="/requests" className={buttonVariants({ variant: "outline" })}>
        View requests
      </Link>
    </div>
  );
}
