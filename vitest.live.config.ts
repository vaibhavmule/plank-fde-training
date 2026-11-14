import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Reads .env.local for the live suite, so it needs no extra dependency.
function localEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(new URL("./.env.local", import.meta.url), "utf8")
        .split("\n")
        .filter(
          (line) => line.includes("=") && !line.trimStart().startsWith("#"),
        )
        .map((line) => {
          const at = line.indexOf("=");
          return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.live.test.ts"],
    env: localEnv(),
    // A live call can be slow, but not unbounded.
    testTimeout: 180_000,
  },
});
