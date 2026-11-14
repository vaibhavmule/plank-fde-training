import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PolicyArticle } from "@/components/policy-article";
import { SiteHeader } from "@/components/site-header";
import { getPolicy, listPolicies } from "@/lib/policies";

type PolicyPageProps = { params: Promise<{ slug: string }> };

// Every policy that exists at build time is prerendered. Unknown slugs still
// reach the page at request time, where getPolicy returns null and we 404.
export async function generateStaticParams() {
  return (await listPolicies()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PolicyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const policy = await getPolicy(slug);
  if (!policy) return { title: "Policy not found" };
  return { title: policy.title, description: policy.summary };
}

export default async function PolicyPage({ params }: PolicyPageProps) {
  const { slug } = await params;
  const policy = await getPolicy(slug);
  if (!policy) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <PolicyArticle policy={policy} />
      </main>
    </>
  );
}
