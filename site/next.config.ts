import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    turbopackAdditionalRoots: {
      // pnpm links this app's dependencies to the workspace store, which sits
      // outside the root below.
      store: { path: path.join(appRoot, "..", "node_modules", ".pnpm") },
    },
  },
  turbopack: {
    // Pin the root to this app. Without it Turbopack detects the pnpm
    // workspace at the repository root and pulls WorkBot's src/ into the
    // site's build, including WorkBot's src/proxy.ts.
    root: appRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
