import { Suspense } from "react";

import { RequestForm } from "./request-form";
import { SiteHeader } from "@/components/site-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Track } from "@/lib/analytics";

export const metadata = { title: "New request" };

export default function NewRequestPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>
              <h1>New request</h1>
            </CardTitle>
            <CardDescription>
              Tell us what you need and choose the team that can help.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestForm />
          </CardContent>
        </Card>
        <Suspense fallback={null}>
          <Track event="request_form_viewed" />
        </Suspense>
      </main>
    </>
  );
}
