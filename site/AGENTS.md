# AGENTS.md

`site` is the WorkBot public site: a small Next.js app that explains what
WorkBot does to someone who has never seen it. It is the shop window, not the
product.

## Commands

Run these from the repository root, not from `site/`:

- `pnpm --filter workbot-site dev` – serve the site on port 3001
- `pnpm --filter workbot-site check` – ESLint, `tsc` and `next build`; the root
  `pnpm check` runs it last, after WorkBot's own steps

## What this app is

- One landing page: the product in a sentence and three capabilities.
- A separate app with its own `next.config.ts`, `tsconfig.json`, ESLint config
  and `node_modules`. The root ones exclude `site/`, so only one config checks
  each file.
- Deployed on its own, apart from WorkBot.

## What this app is not

- Not part of WorkBot. Nothing here handles requests, admin views or policies.
- No database, no API routes, no Server Actions, no `"use client"`.
- No environment variables and no secrets. Nothing on this page needs one.
- No shared code with the app yet: copy a pattern rather than reaching into
  WorkBot's `src/`. Day 29 adds shared packages.

## Conventions

- **Server Components only.** The page has no state, so it ships no JavaScript
  to the browser.
- Tailwind classes inline, using plain `zinc` colours rather than WorkBot's
  shadcn tokens, which this app does not install.
- Keep the copy honest: describe what WorkBot does today, not what it will do.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
