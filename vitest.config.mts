import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Tests run on an embedded, in-memory database.
    env: { DATABASE_URL: "memory://" },
    // The unit suite never touches the network: the live suite has its own
    // config, and `pnpm test:live`.
    exclude: [...configDefaults.exclude, "**/*.live.test.ts"],
  },
});
