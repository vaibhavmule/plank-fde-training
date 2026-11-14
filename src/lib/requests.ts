import "server-only";

import { randomUUID } from "node:crypto";
import { io } from "next/cache";

import {
  requestIdSchema,
  requestInputSchema,
  statusSchema,
  type WorkRequest,
} from "@/lib/request-model";

const requestGlobal = globalThis as typeof globalThis & {
  workbotRequests?: WorkRequest[];
};

// Shared across route bundles in one process; lost on restart.
function store() {
  return (requestGlobal.workbotRequests ??= []);
}

export async function createRequest(input: unknown): Promise<WorkRequest> {
  const parsed = requestInputSchema.parse(input);
  await io();

  const request: WorkRequest = {
    ...parsed,
    id: randomUUID(),
    status: "open",
    createdAt: new Date().toISOString(),
  };
  store().unshift(request);
  return { ...request };
}

export async function listRequests(): Promise<WorkRequest[]> {
  await io();
  // Copies prevent callers from mutating the shared store.
  return store().map((request) => ({ ...request }));
}

export async function getRequest(id: string): Promise<WorkRequest | undefined> {
  await io();
  const request = store().find((candidate) => candidate.id === id);
  // A copy, for the same reason as listRequests.
  return request && { ...request };
}

// Returns undefined, without writing, for an invalid id, an unknown id, or a
// status outside the enum, so a tampered action cannot change anything.
export async function updateRequestStatus(
  id: unknown,
  status: unknown,
): Promise<WorkRequest | undefined> {
  const parsedId = requestIdSchema.safeParse(id);
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedId.success || !parsedStatus.success) return undefined;

  await io();
  const request = store().find((candidate) => candidate.id === parsedId.data);
  if (!request) return undefined;

  request.status = parsedStatus.data;
  return { ...request };
}
