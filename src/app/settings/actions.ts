"use server";

import { refresh } from "next/cache";

import { forget, forgetAll } from "@/lib/memory";
import { visitorId } from "@/lib/visitor";

/**
 * Forgets one memory. The id is parsed as a UUID and the delete is scoped by
 * the visitor, so a crafted request cannot remove someone else's memory.
 */
export async function forgetMemory(formData: FormData) {
  const visitor = await visitorId();
  if (!visitor) return;

  await forget(visitor, formData.get("id"));
  refresh();
}

/** Forgets everything this visitor's WorkBot remembers. */
export async function forgetEverything() {
  const visitor = await visitorId();
  if (!visitor) return;

  await forgetAll(visitor);
  refresh();
}
