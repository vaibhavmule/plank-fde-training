import "server-only";

// The only module that reads process.env. Import `config` everywhere else.
export const config = {
  environment: process.env.VERCEL_ENV || "development",
  commit: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
  // A postgres:// URL uses a server; anything else is an embedded PGlite path.
  databaseUrl: process.env.DATABASE_URL ?? "",
  // Without this key the web_search tool is not registered.
  braveSearchKey: process.env.BRAVE_SEARCH_KEY ?? "",
  posthogKey: process.env.POSTHOG_KEY ?? "",
  posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
} as const;
