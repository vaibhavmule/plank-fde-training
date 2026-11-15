import { beforeEach, describe, expect, test, vi } from "vitest";

import { intake } from "./intake";
import { sdkModel } from "./providers";
import { listRequests } from "./requests";
import { resetRequests } from "./test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));

beforeEach(async () => {
  await resetRequests();
});

// Calls the real API. Run with `pnpm test:live`, never as part of `pnpm test`.
describe("intake, live", () => {
  test("triages a printer message into an operations request", async () => {
    const model = sdkModel("anthropic", "claude-haiku-5-5");
    expect(model).toBeDefined();

    const message = `Hi WorkBot,

Our label printer on the packing bench jams on every third label, so the night shift is shipping orders without labels. Could someone from facilities take a look today?

Thanks,
Priya`;

    const request = await intake(message, model!);

    expect(request.team).toBe("operations");
    expect(["high", "medium"]).toContain(request.priority);
    expect(request.title.length).toBeLessThanOrEqual(120);
    expect(request.title).toMatch(/printer|label/i);
    expect(request.details).not.toMatch(/^hi workbot/i);
    // Other live suites share the database, so this row is present among them.
    expect((await listRequests()).map((listed) => listed.id)).toContain(
      request.id,
    );
  });
});
