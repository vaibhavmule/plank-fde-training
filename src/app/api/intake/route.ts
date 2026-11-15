import type { LanguageModel } from "ai";

import {
  intakeRequestSchema,
  type IntakeResponse,
  type InvalidIntakeResponse,
} from "./types";
import { track } from "@/lib/analytics";
import { chatModel } from "@/lib/chat";
import { intake } from "@/lib/intake";

export const maxDuration = 60;

function invalidRequest(issues: InvalidIntakeResponse["issues"]) {
  const body: InvalidIntakeResponse = { error: "invalid_request", issues };
  return Response.json(body, { status: 400 });
}

/**
 * Triages `{ message }` into a request and answers 201 with it. The model is a
 * parameter so a test can run the route without a network call.
 */
export async function handleIntake(
  request: Request,
  model: LanguageModel = chatModel("small"),
): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return invalidRequest([
      { path: [], message: "Request body must be valid JSON." },
    ]);
  }

  const parsed = intakeRequestSchema.safeParse(input);
  if (!parsed.success) {
    return invalidRequest(
      parsed.error.issues.map(({ path, message }) => ({
        path: path.map((segment) =>
          typeof segment === "number" ? segment : String(segment),
        ),
        message,
      })),
    );
  }

  const created = await intake(parsed.data.message, model);
  // An API call carries no browser cookie, so its events share one anonymous
  // id and still count alongside the form's.
  await track(
    "request_submitted",
    {
      requestId: created.id,
      team: created.team,
      priority: created.priority,
      channel: "api",
    },
    "api",
  );

  const body: IntakeResponse = { request: created };
  return Response.json(body, { status: 201 });
}

export async function POST(request: Request) {
  return handleIntake(request);
}
