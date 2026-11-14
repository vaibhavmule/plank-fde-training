import { AdminNav } from "@/components/admin-nav";
import { SiteHeader } from "@/components/site-header";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-5xl flex-1 md:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="border-b p-4 md:border-r md:border-b-0 md:py-8">
          <p className="text-muted-foreground mb-3 px-2.5 text-xs font-semibold uppercase tracking-wide">
            Admin console
          </p>
          <AdminNav />
        </aside>
        <main className="min-w-0 px-4 py-8 md:px-8">{children}</main>
      </div>
    </>
  );
}
