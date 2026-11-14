import type { ListPoliciesResponse } from "./types";
import { listPolicies } from "@/lib/policies";

export async function GET() {
  const body: ListPoliciesResponse = { policies: await listPolicies() };
  return Response.json(body);
}
