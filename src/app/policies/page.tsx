import { PolicyList } from "@/components/policy-list";
import { SiteHeader } from "@/components/site-header";
import { listPolicies } from "@/lib/policies";

export const metadata = { title: "Policies" };

export default async function PoliciesPage() {
  const policies = await listPolicies();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Company policies, published from Markdown and updated with each
            release.
          </p>
        </div>
        <PolicyList policies={policies} />
      </main>
    </>
  );
}
