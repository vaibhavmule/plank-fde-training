import "server-only";

import { buildUserPrompt } from "@json-render/core";
import { streamText, type LanguageModel } from "ai";

import {
  generateRequestSchema,
  type GenerateSpec,
  type InvalidGenerateResponse,
} from "@/app/api/generate/types";
import { catalog } from "@/lib/catalog";
import { chatModel } from "@/lib/chat";
import { requestSummary } from "@/lib/requests";

type Issue = { path: (string | number)[]; message: string };

function invalidRequest(issues: Issue[]) {
  const body: InvalidGenerateResponse = { error: "invalid_request", issues };
  return Response.json(body, {
    status: 400,
    headers: { "Cache-Control": "no-store" },
  });
}

function pathSegments(path: PropertyKey[]) {
  return path.map((segment) =>
    typeof segment === "number" ? segment : String(segment),
  );
}

function isPatch(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { op?: unknown }).op === "string" &&
    typeof (value as { path?: unknown }).path === "string"
  );
}

// The model is asked for JSONL, but a stray code fence or a blank line must not
// reach the renderer. Each complete line is forwarded only when it is a patch.
function patchStream(text: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let buffer = "";

  const forward = (
    line: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    const trimmed = line.trim().replace(/^```[a-z-]*$/i, "");
    if (!trimmed) return;

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isPatch(parsed)) {
        controller.enqueue(encoder.encode(`${JSON.stringify(parsed)}\n`));
      }
    } catch {
      // Prose or a partial line is not a patch; the renderer ignores it too.
    }
  };

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of text) {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) forward(line, controller);
      }

      forward(buffer, controller);
      controller.close();
    },
  });
}

export function systemPrompt() {
  return catalog.prompt({
    system:
      "You compose WorkBot pages from a fixed catalog of components. Build a complete page that answers the request, using the live request data provided.",
    editModes: ["patch"],
    customRules: [
      "Use the CURRENT REQUEST DATA as the only source of counts and figures. Use these numbers as they are and never invent figures.",
      "Define every element you reference. A Page, Stack, Grid, Card or Form may list a child key only if that element is also emitted in the same response. Emit chart and table elements before the card that contains them, and never leave a container pointing at a missing key.",
      "To build a request intake form, bind the title Input to /form/title, the details Textarea to /form/details, the team Select to /form/team with options operations, finance and support, and the priority Select to /form/priority with options low, medium and high.",
      'Bind the form\'s submit Button event to the submit_request action: on: { press: { action: "submit_request" } }.',
      "When editing, change only what the follow-up asks for and keep the rest of the page intact.",
    ],
  });
}

export function userPrompt(input: {
  prompt: string;
  currentSpec?: GenerateSpec | null;
  summary: Awaited<ReturnType<typeof requestSummary>>;
}) {
  const currentSpec =
    input.currentSpec && input.currentSpec.root ? input.currentSpec : undefined;

  const page = buildUserPrompt({
    prompt: input.prompt,
    currentSpec: currentSpec as Parameters<
      typeof buildUserPrompt
    >[0]["currentSpec"],
    editModes: ["patch"],
  });

  return `${page}

CURRENT REQUEST DATA (use these numbers as they are and never invent figures):
${JSON.stringify(input.summary, null, 2)}`;
}

/**
 * Validates a generation request and streams JSONL patches back. The model is a
 * parameter so tests run without a network call.
 */
export async function handleGenerate(
  request: Request,
  model: LanguageModel = chatModel(),
): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return invalidRequest([
      { path: [], message: "Request body must be valid JSON." },
    ]);
  }

  const parsed = generateRequestSchema.safeParse(input);
  if (!parsed.success) {
    return invalidRequest(
      parsed.error.issues.map(({ path, message }) => ({
        path: pathSegments(path),
        message,
      })),
    );
  }

  const result = streamText({
    model,
    system: systemPrompt(),
    prompt: userPrompt({
      prompt: parsed.data.prompt,
      currentSpec: parsed.data.currentSpec,
      summary: await requestSummary(),
    }),
  });

  return new Response(patchStream(result.textStream), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
