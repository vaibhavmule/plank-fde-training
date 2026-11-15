import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { describe, expect, test, vi } from "vitest";

import { browse, chromeBrowser } from "./browser-agent";
import { sdkModel } from "./providers";

vi.mock("server-only", () => ({}));

// Drives the machine's Chrome and calls the real API. Run with
// `pnpm test:live`, never as part of `pnpm test`.
describe("chromeBrowser, live", () => {
  test("blocks a request to a local address", async () => {
    let hits = 0;
    const server = createServer((_request, response) => {
      hits += 1;
      response.end("local");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;

    const browser = await chromeBrowser("https://example.com/");
    try {
      await expect(browser.goto(`http://127.0.0.1:${port}/`)).rejects.toThrow();
      expect(hits).toBe(0);
    } finally {
      await browser.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe("browse, live", () => {
  test("looks up an invoice in the legacy portal and reads the status", async () => {
    const model = sdkModel("anthropic", "claude-haiku-5-5");
    expect(model).toBeDefined();

    const portal = fileURLToPath(
      new URL("./fixtures/legacy-portal.html", import.meta.url),
    );
    const start = `file://${portal}`;

    const browser = await chromeBrowser(start);
    try {
      const result = await browse(
        "Find the payment status of invoice INV-4411 and report it word for word.",
        start,
        model!,
        browser,
        { maxSteps: 10 },
      );

      expect(result.ended).toBe("done");
      expect(result.result).toContain(
        "Paid on 2026-09-10 by ACH, reference FS-88213.",
      );
    } finally {
      await browser.close();
    }
  });
});
