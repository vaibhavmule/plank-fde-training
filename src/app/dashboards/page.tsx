import { Generator } from "@/components/generator";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Dashboards" };

export default function DashboardsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Generate a page
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Describe a dashboard, form or timeline and WorkBot builds it from
            the live requests. Follow up to edit the page on screen.
          </p>
        </div>
        <Generator />
      </main>
    </>
  );
}
