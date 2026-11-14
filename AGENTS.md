# AGENTS.md

plank-fde-training is WorkBot, an enterprise workflow platform built week by week
for Plank's AI FDE course. It is a Next.js (App Router) app with TypeScript,
Tailwind and shadcn/ui, deployed on Vercel.

## Commands

- `pnpm dev` – local dev server
- `pnpm check` – ESLint, Prettier, `tsc` and `next build`; must pass before every push (CI runs it)
- `pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm build` – the individual steps
- `pnpm dlx shadcn@latest add <component>` – add a UI component

## Conventions

- **Where files go:** routes in `src/app`; shared UI in `src/components`; shadcn
  primitives in `src/components/ui` (generated, edit sparingly); helpers and
  server code in `src/lib`. Import with the `@/` alias.
- **Server Components by default.** A Server Component renders on the server and
  sends no JavaScript to the browser. Add `"use client"` only to the smallest
  leaf that needs state, effects or browser APIs.
- **One module reads `process.env`:** `src/lib/config.ts`. Everywhere else imports
  `config` from it. It is server-only; never expose secrets to client code.
- Keep commits small, conventional (`feat:`, `fix:`, `chore:`) and imperative.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
