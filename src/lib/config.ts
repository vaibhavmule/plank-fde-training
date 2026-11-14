import "server-only";

// The only module that reads process.env. Import `config` everywhere else.
export const config = {
  environment: process.env.VERCEL_ENV || "development",
  commit: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
} as const;
