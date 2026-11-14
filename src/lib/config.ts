import "server-only";

// The only module that reads process.env. Import `config` everywhere else.
export const config = {
  environment: process.env.VERCEL_ENV || "development",
  commit: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
  // A postgres:// URL uses a server; anything else is an embedded PGlite path.
  databaseUrl: process.env.DATABASE_URL ?? "",
  // The web chat's provider and model. The provider's first model is the
  // default; CHAT_MODEL overrides it, which is how the live suite runs on the
  // small model.
  chatProvider: process.env.CHAT_PROVIDER || "anthropic",
  chatModel: process.env.CHAT_MODEL || "",
  // Without this key the web_search tool is not registered.
  braveSearchKey: process.env.BRAVE_SEARCH_KEY ?? "",
  posthogKey: process.env.POSTHOG_KEY ?? "",
  posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
} as const;
