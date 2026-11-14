"use server";

import { refresh } from "next/cache";

import { updateRequestStatus } from "@/lib/requests";

// The id and status arrive bound from the detail page, but both are re-checked
// here: a Server Action is a public POST endpoint, so neither is trusted.
export async function setStatus(id: string, status: string) {
  const updated = await updateRequestStatus(id, status);
  if (!updated) return;

  refresh();
}
