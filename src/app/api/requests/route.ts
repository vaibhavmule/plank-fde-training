import {
  createRequestSchema,
  type CreateRequestResponse,
  type InvalidRequestResponse,
  type ListRequestsResponse,
} from "./types";
import { createRequest, listRequests } from "@/lib/requests";

export async function GET() {
  const body: ListRequestsResponse = { requests: await listRequests() };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    const body: InvalidRequestResponse = {
      error: "invalid_request",
      issues: [{ path: [], message: "Request body must be valid JSON." }],
    };
    return Response.json(body, { status: 400 });
  }

  const result = createRequestSchema.safeParse(input);
  if (!result.success) {
    const body: InvalidRequestResponse = {
      error: "invalid_request",
      issues: result.error.issues.map(({ path, message }) => ({
        path: path.map((segment) =>
          typeof segment === "number" ? segment : String(segment),
        ),
        message,
      })),
    };
    return Response.json(body, { status: 400 });
  }

  const body: CreateRequestResponse = {
    request: await createRequest(result.data),
  };
  return Response.json(body, { status: 201 });
}
