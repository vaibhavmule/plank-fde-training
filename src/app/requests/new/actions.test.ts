import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { submitRequest } from "./actions";
import { initialRequestFormState } from "./form-state";
import { listRequests } from "@/lib/requests";
import { resetRequests } from "@/lib/test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(async () => {
  await resetRequests();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("submitRequest", () => {
  test("returns field errors and original values without creating a request", async () => {
    const values = {
      title: "   ",
      details: "Keep my notes",
      team: "finance",
      priority: "high",
    };
    const state = await submitRequest(initialRequestFormState, form(values));
    expect(state.errors.title).toBeDefined();
    expect(state.values).toEqual(values);
    expect(await listRequests()).toEqual([]);
  });

  test("rejects tampered select values and missing required fields", async () => {
    const state = await submitRequest(
      initialRequestFormState,
      form({ team: "legal", priority: "urgent" }),
    );
    expect(state.errors.title).toBeDefined();
    expect(state.errors.team).toBeDefined();
    expect(state.errors.priority).toBeDefined();
    expect(await listRequests()).toEqual([]);
  });

  test("creates a trimmed request and redirects to the list", async () => {
    await expect(
      submitRequest(
        initialRequestFormState,
        form({
          title: "  Fix keyboard  ",
          details: "  Keys stick  ",
          team: "support",
          priority: "high",
        }),
      ),
    ).rejects.toThrow("redirect:/requests");
    expect(await listRequests()).toEqual([
      expect.objectContaining({
        title: "Fix keyboard",
        details: "Keys stick",
        team: "support",
        priority: "high",
        status: "open",
      }),
    ]);
  });

  test("uses schema defaults for omitted optional fields", async () => {
    await expect(
      submitRequest(
        initialRequestFormState,
        form({ title: "Laptop", team: "operations" }),
      ),
    ).rejects.toThrow("redirect:/requests");
    expect(await listRequests()).toEqual([
      expect.objectContaining({ details: "", priority: "medium" }),
    ]);
  });

  test("rejects a file submitted in place of text", async () => {
    const data = form({ team: "operations" });
    data.set("title", new Blob(["not text"]), "title.txt");
    const state = await submitRequest(initialRequestFormState, data);
    expect(state.errors.title).toBeDefined();
    expect(state.values.title).toBe("");
    expect(await listRequests()).toEqual([]);
  });
});
