import { generateText, Output, type LanguageModel } from "ai";
import { chromium, type Page } from "playwright-core";
import { z } from "zod";

import { assertPublicUrl } from "@/lib/web";

/** The viewport the screenshots and click coordinates are measured in. */
export const VIEWPORT = { width: 1024, height: 768 } as const;

/** How many actions a run may take unless it is told otherwise. */
export const DEFAULT_MAX_STEPS = 12;

/** The actions the model can take. Every one says why it is the next step. */
export const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("click"),
    x: z.number().int().describe("The x pixel of the element, from the left."),
    y: z.number().int().describe("The y pixel of the element, from the top."),
    why: z.string().describe("Why this click is the next step."),
  }),
  z.object({
    action: z.literal("type"),
    text: z
      .string()
      .describe("The text to type into the field that currently has focus."),
    why: z.string().describe("Why this text is the next step."),
  }),
  z.object({
    action: z.literal("press"),
    key: z.enum(["Enter", "Escape", "Tab"]).describe("The key to press."),
    why: z.string().describe("Why this key is the next step."),
  }),
  z.object({
    action: z.literal("scroll"),
    amount: z
      .number()
      .int()
      .describe("Pixels to scroll. Positive moves down, negative moves up."),
    why: z.string().describe("Why this scroll is the next step."),
  }),
  z.object({
    action: z.literal("wait"),
    ms: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .describe("Milliseconds to wait for the page to finish loading."),
    why: z.string().describe("Why waiting is the next step."),
  }),
  z.object({
    action: z.literal("goto"),
    url: z.string().describe("The absolute address to open."),
    why: z.string().describe("Why this address is the next step."),
  }),
  z.object({
    action: z.literal("done"),
    result: z
      .string()
      .describe("The answer, copied exactly from the page as the task asks."),
    why: z.string().describe("Why the task is complete."),
  }),
  z.object({
    action: z.literal("give_up"),
    reason: z
      .string()
      .describe("What the page does not offer, or what is blocking."),
    why: z.string().describe("Why the task cannot be finished here."),
  }),
]);

export type Action = z.infer<typeof actionSchema>;

/** One browser a run can drive: Playwright in production, a fake in tests. */
export type Browser = {
  goto(url: string): Promise<void>;
  screenshot(): Promise<Uint8Array>;
  click(x: number, y: number): Promise<void>;
  type(text: string): Promise<void>;
  press(key: string): Promise<void>;
  scroll(amount: number): Promise<void>;
  wait(ms: number): Promise<void>;
  url(): Promise<string>;
  close(): Promise<void>;
};

/** What a browser may load: its start site and public addresses, nothing else. */
export type Bounds = {
  start: string;
  allows(url: string): boolean;
};

/**
 * The addresses a page may reach from `start`. The start site is allowed; so is
 * any public address, by the rule readPage uses. A private address, a local
 * name and every other file are refused, so a page cannot point the browser at
 * this machine or its network. A `file://` start allows only that file, which
 * is what the legacy-portal fixture needs.
 */
export function bounds(start: string): Bounds {
  const origin = new URL(start);

  return {
    start,
    allows(source: string) {
      let url: URL;
      try {
        url = new URL(source);
      } catch {
        return false;
      }

      if (origin.protocol === "file:") {
        if (url.protocol === "file:") {
          return url.pathname === origin.pathname;
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") return false;

        try {
          assertPublicUrl(url.toString());
          return true;
        } catch {
          return false;
        }
      }

      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      if (url.origin === origin.origin) return true;

      try {
        assertPublicUrl(url.toString());
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * The machine's Chrome, in a 1024 by 768 context. The route is on the context,
 * not the page, so every request passes `bounds` or is blocked: a click, a
 * redirect, an embedded image or a popup. Service workers are blocked because
 * they would carry requests around the route, and dialogs are dismissed
 * because one would block every later action.
 */
export async function chromeBrowser(
  start: string,
  options: { headless?: boolean } = {},
): Promise<Browser> {
  const allowed = bounds(start);
  const browser = await chromium.launch({
    channel: "chrome",
    headless: options.headless ?? true,
  });

  try {
    const context = await browser.newContext({
      viewport: { ...VIEWPORT },
      serviceWorkers: "block",
    });

    await context.route("**/*", (route) => {
      if (allowed.allows(route.request().url())) return route.continue();
      return route.abort("blockedbyclient");
    });

    const page = await context.newPage();
    page.on("dialog", (dialog) => {
      void dialog.dismiss().catch(() => {});
    });

    return {
      goto: async (url) => {
        await page.goto(url, { waitUntil: "domcontentloaded" });
      },
      screenshot: async () =>
        new Uint8Array(await page.screenshot({ type: "png" })),
      click: async (x, y) => {
        await page.mouse.click(x, y);
      },
      type: async (text) => {
        await page.keyboard.type(text);
      },
      press: async (key) => {
        await page.keyboard.press(key);
      },
      scroll: async (amount) => {
        await center(page);
        await page.mouse.wheel(0, amount);
      },
      wait: (ms) => page.waitForTimeout(ms),
      url: async () => page.url(),
      close: async () => {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
      },
    };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}

async function center(page: Page) {
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
}

export type BrowseStep = {
  action: Action;
  /** What happened when the action ran, including a load that failed. */
  outcome: string;
};

export type BrowseEvent = BrowseStep & { step: number };

export type BrowseResult = {
  /** The task's answer, or why the run stopped. */
  result: string;
  ended: "done" | "give_up" | "steps";
  steps: number;
  history: BrowseStep[];
};

export type BrowseOptions = {
  maxSteps?: number;
  on?: (event: BrowseEvent) => void;
};

const BROWSER_RULES = `You operate a web browser one action at a time to finish a task.

You see the current page as a screenshot, ${VIEWPORT.width} by ${VIEWPORT.height} pixels, and return the next single action. Click at the x,y of the element as it appears in the screenshot. Type into the field that has focus, so click a field before typing in it. Press Enter, Escape or Tab when a key is needed. Scroll in pixels. Wait when a page is still loading. Use goto only when the task points at another address.

When the task is complete, return done with the answer copied exactly from the page: the same words, numbers and dates. When the page cannot give what the task needs, return give_up with the reason. Never invent a value you did not see.`;

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** The task, the address, and every action so far with its reason. */
export function browsePrompt(
  goal: string,
  start: string,
  current: string,
  history: readonly BrowseStep[],
): string {
  const done =
    history.length === 0
      ? "Nothing yet."
      : history
          .map(
            (step, index) =>
              `${index + 1}. ${describe(step.action)} — ${step.action.why} — ${step.outcome}`,
          )
          .join("\n");

  return `Task: ${goal}

Started at: ${start}
Current address: ${current}

Actions so far:
${done}

Return the next single action.`;
}

function describe(action: Action): string {
  switch (action.action) {
    case "click":
      return `click ${action.x},${action.y}`;
    case "type":
      return `type "${action.text}"`;
    case "press":
      return `press ${action.key}`;
    case "scroll":
      return `scroll ${action.amount}`;
    case "wait":
      return `wait ${action.ms}ms`;
    case "goto":
      return `goto ${action.url}`;
    case "done":
      return "done";
    case "give_up":
      return "give up";
  }
}

/**
 * Drives a browser from screenshots: each step sends the task, the address and
 * the actions so far with a screenshot, takes back one action, runs it and
 * records it. It ends on done, on give_up, or at the step limit. A goto that
 * fails is recorded like a click that did nothing, so the model can try
 * another address or give up.
 */
export async function browse(
  goal: string,
  start: string,
  model: LanguageModel,
  browser: Browser,
  options: BrowseOptions = {},
): Promise<BrowseResult> {
  const task = goal.trim();
  if (!task) throw new Error("Give the browser a goal.");

  const maxSteps = Math.max(1, options.maxSteps ?? DEFAULT_MAX_STEPS);
  const history: BrowseStep[] = [];

  try {
    await browser.goto(start);
  } catch (error) {
    return {
      result: `The start page did not load: ${message(error)}`,
      ended: "give_up",
      steps: 0,
      history,
    };
  }

  for (let step = 1; step <= maxSteps; step += 1) {
    const current = await browser.url();
    const screenshot = await browser.screenshot();

    const result = await generateText({
      model,
      output: Output.object({ schema: actionSchema }),
      system: BROWSER_RULES,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: browsePrompt(task, start, current, history) },
            { type: "file", data: screenshot, mediaType: "image/png" },
          ],
        },
      ],
    });

    const action = result.output;
    const outcome = await run(action, browser, start);

    const entry = { action, outcome };
    history.push(entry);
    options.on?.({ step, ...entry });

    if (action.action === "done") {
      return { result: action.result, ended: "done", steps: step, history };
    }
    if (action.action === "give_up") {
      return { result: action.reason, ended: "give_up", steps: step, history };
    }
  }

  return {
    result: `Stopped after ${maxSteps} steps`,
    ended: "steps",
    steps: maxSteps,
    history,
  };
}

/** Runs one action, turning a failure into text the next prompt can read. */
async function run(
  action: Action,
  browser: Browser,
  start: string,
): Promise<string> {
  try {
    switch (action.action) {
      case "click":
        await browser.click(action.x, action.y);
        return `clicked ${action.x},${action.y}`;
      case "type":
        await browser.type(action.text);
        return `typed "${action.text}"`;
      case "press":
        await browser.press(action.key);
        return `pressed ${action.key}`;
      case "scroll":
        await browser.scroll(action.amount);
        return `scrolled ${action.amount}`;
      case "wait":
        await browser.wait(action.ms);
        return `waited ${action.ms}ms`;
      case "goto":
        await browser.goto(action.url);
        return `opened ${action.url}`;
      case "done":
        return action.result;
      case "give_up":
        return action.reason;
    }
  } catch (error) {
    if (action.action === "goto") {
      const allowed = bounds(start).allows(action.url);
      return allowed
        ? `page did not load: ${message(error)}`
        : `page did not load: the address is outside the start site and is private or local`;
    }

    return `the action failed: ${message(error)}`;
  }
}
