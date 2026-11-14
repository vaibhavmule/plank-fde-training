"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { RequestFormState } from "./form-state";
import { requestInputSchema } from "@/lib/request-model";
import { createRequest } from "@/lib/requests";

export async function submitRequest(
  _previousState: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const raw = {
    title: formData.get("title"),
    details: formData.get("details") ?? undefined,
    team: formData.get("team"),
    priority: formData.get("priority") ?? undefined,
  };
  const result = requestInputSchema.safeParse(raw);

  if (!result.success) {
    return {
      errors: z.flattenError(result.error).fieldErrors,
      values: {
        title: typeof raw.title === "string" ? raw.title : "",
        details: typeof raw.details === "string" ? raw.details : "",
        team: typeof raw.team === "string" ? raw.team : "",
        priority: typeof raw.priority === "string" ? raw.priority : "",
      },
    };
  }

  await createRequest(result.data);
  redirect("/requests");
}
