import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test } from "vitest";

import { bounds, browse, type Action, type Browser } from "@/lib/browser-agent";

const usage = {
  inputTokens: {
    total: 100,
    noCache: 100,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

/** A browser that records what it was asked to do. */
function fakeBrowser(overrides: Partial<Browser> = {}) {
  const calls: string[] = [];
  let current = "https://portal.example.com/app";

  const browser: Browser = {
    async goto(url) {
      calls.push(`goto ${url}`);
      current = url;
    },
    async screenshot() {
      calls.push("screenshot");
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    },
    async click(x, y) {
      calls.push(`click ${x},${y}`);
    },
    async type(text) {
      calls.push(`type ${text}`);
    },
    async press(key) {
      calls.push(`press ${key}`);
    },
    async scroll(amount) {
      calls.push(`scroll ${amount}`);
    },
    async wait(ms) {
      calls.push(`wait ${ms}`);
    },
    async url() {
      return current;
    },
    async close() {
      calls.push("close");
    },
    ...overrides,
  };

  return { browser, calls };
}

/** A model that answers each call with the next scripted action. */
function scripted(actions: Action[]) {
  let index = 0;
  const prompts: string[] = [];

  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const user = options.prompt.find((message) => message.role === "user");
      const content = user?.content ?? "";
      const parts = Array.isArray(content) ? content : [];
      prompts.push(
        parts
          .map((part) => (part.type === "text" ? part.text : "[image]"))
          .join("\n"),
      );

      const action = actions[index];
      index += 1;
      if (action === undefined) throw new Error(`Unexpected call ${index}`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(action) }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage,
        warnings: [],
      };
    },
  });

  return { model, prompts };
}

const click: Action = {
  action: "click",
  x: 120,
  y: 340,
  why: "focus the field",
};
const type: Action = {
  action: "type",
  text: "INV-4411",
  why: "enter the invoice",
};
const done: Action = {
  action: "done",
  result: "Paid on 2026-09-10 by ACH, reference FS-88213.",
  why: "the page shows the status",
};

describe("bounds", () => {
  const portal = bounds("https://portal.example.com/app");

  test("allows the start site and its paths", () => {
    expect(portal.allows("https://portal.example.com/invoice/4411")).toBe(true);
    expect(portal.allows("https://portal.example.com/app?next=1")).toBe(true);
  });

  test("allows a public address by the readPage rule", () => {
    expect(portal.allows("https://example.com/reference")).toBe(true);
  });

  test.each([
    "http://127.0.0.1:3000/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://localhost:8080/",
    "http://portal.internal/",
    "file:///etc/passwd",
    "ftp://example.com/file",
  ])("refuses %s", (url) => {
    expect(portal.allows(url)).toBe(false);
  });

  test("a private start allows only its own site", () => {
    const local = bounds("http://127.0.0.1:8080/");

    expect(local.allows("http://127.0.0.1:8080/app")).toBe(true);
    expect(local.allows("http://127.0.0.1:9090/admin")).toBe(false);
    expect(local.allows("http://10.0.0.5/")).toBe(false);
  });

  test("a local file allows that file and public addresses, not another file", () => {
    const fixture = bounds("file:///work/legacy-portal.html");

    expect(fixture.allows("file:///work/legacy-portal.html")).toBe(true);
    expect(fixture.allows("file:///work/other.html")).toBe(false);
    expect(fixture.allows("https://example.com/help")).toBe(true);
    expect(fixture.allows("http://127.0.0.1/")).toBe(false);
  });
});

describe("browse", () => {
  test("runs a 4-step run to done and returns the page's answer", async () => {
    const { browser, calls } = fakeBrowser();
    const { model } = scripted([click, type, click, done]);

    const result = await browse(
      "Find the payment status of invoice INV-4411.",
      "https://portal.example.com/app",
      model,
      browser,
    );

    expect(result.ended).toBe("done");
    expect(result.steps).toBe(4);
    expect(result.result).toBe(
      "Paid on 2026-09-10 by ACH, reference FS-88213.",
    );
    expect(calls).toEqual([
      "goto https://portal.example.com/app",
      "screenshot",
      "click 120,340",
      "screenshot",
      "type INV-4411",
      "screenshot",
      "click 120,340",
      "screenshot",
    ]);
  });

  test("runs press, scroll and wait as the model asks", async () => {
    const { browser, calls } = fakeBrowser();
    const { model } = scripted([
      { action: "press", key: "Tab", why: "move to the next field" },
      { action: "scroll", amount: 400, why: "see the rest of the page" },
      { action: "wait", ms: 250, why: "let the page finish loading" },
      done,
    ]);

    await browse(
      "Find invoice INV-4411",
      "https://portal.example.com/",
      model,
      browser,
    );

    expect(calls).toContain("press Tab");
    expect(calls).toContain("scroll 400");
    expect(calls).toContain("wait 250");
  });

  test("sends the goal, the history and the screenshot on every step", async () => {
    const { browser } = fakeBrowser();
    const { model, prompts } = scripted([click, done]);

    await browse(
      "Find invoice INV-4411",
      "https://portal.example.com/",
      model,
      browser,
    );

    expect(prompts[0]).toContain("Find invoice INV-4411");
    expect(prompts[0]).toContain("[image]");
    expect(prompts[0]).toContain("Nothing yet.");
    expect(prompts[1]).toContain("1. click 120,340 — focus the field");
    expect(prompts[1]).toContain("clicked 120,340");
  });

  test("ends on give_up with the model's reason", async () => {
    const { browser } = fakeBrowser();
    const { model } = scripted([
      {
        action: "give_up",
        reason: "The portal has no invoice search.",
        why: "there is no field for it",
      },
    ]);

    const result = await browse(
      "Find invoice INV-4411",
      "https://portal.example.com/",
      model,
      browser,
    );

    expect(result.ended).toBe("give_up");
    expect(result.steps).toBe(1);
    expect(result.result).toBe("The portal has no invoice search.");
  });

  test("stops at the step limit", async () => {
    const { browser } = fakeBrowser();
    const { model } = scripted([type, type, type]);

    const result = await browse(
      "Find invoice INV-4411",
      "https://portal.example.com/",
      model,
      browser,
      { maxSteps: 2 },
    );

    expect(result.ended).toBe("steps");
    expect(result.steps).toBe(2);
    expect(result.result).toBe("Stopped after 2 steps");
    expect(result.history).toHaveLength(2);
  });

  test("records a goto that does not load instead of throwing", async () => {
    const { browser } = fakeBrowser({
      async goto(url) {
        if (url.includes("broken"))
          throw new Error("net::ERR_CONNECTION_REFUSED");
      },
    });
    const { model } = scripted([
      {
        action: "goto",
        url: "https://portal.example.com/broken",
        why: "try the link",
      },
      done,
    ]);

    const result = await browse(
      "Find invoice INV-4411",
      "https://portal.example.com/app",
      model,
      browser,
    );

    expect(result.ended).toBe("done");
    expect(result.history[0].outcome).toMatch(/page did not load/);
  });

  test("a start page that does not load ends the run before a model call", async () => {
    const { browser } = fakeBrowser({
      async goto() {
        throw new Error("page is down");
      },
    });
    const { model, prompts } = scripted([]);

    const result = await browse(
      "Find invoice INV-4411",
      "https://portal.example.com/app",
      model,
      browser,
    );

    expect(result.ended).toBe("give_up");
    expect(result.steps).toBe(0);
    expect(result.result).toMatch(/start page did not load/);
    expect(prompts).toHaveLength(0);
  });

  test("rejects an empty goal before opening a browser", async () => {
    const { browser, calls } = fakeBrowser();
    const { model } = scripted([]);

    await expect(
      browse("   ", "https://portal.example.com/", model, browser),
    ).rejects.toThrow(/goal/);
    expect(calls).toEqual([]);
  });

  test("reports each action to the watcher", async () => {
    const { browser } = fakeBrowser();
    const { model } = scripted([click, done]);
    const seen: number[] = [];

    await browse(
      "Find invoice INV-4411",
      "https://portal.example.com/",
      model,
      browser,
      {
        on: (event) => seen.push(event.step),
      },
    );

    expect(seen).toEqual([1, 2]);
  });
});
