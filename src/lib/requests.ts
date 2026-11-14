import "server-only";

import { randomUUID } from "node:crypto";
import { io } from "next/cache";

import { requestInputSchema, type WorkRequest } from "@/lib/request-model";

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
