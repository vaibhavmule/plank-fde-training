# AGENTS.md

plank-fde-training is WorkBot, an enterprise workflow platform built week by week
for Plank's AI FDE course. It is a Next.js (App Router) app with TypeScript,
Tailwind and shadcn/ui, deployed on Vercel. `site/` is the public landing page,
a second Next.js app in the same pnpm workspace.

## Commands

- `pnpm dev` – local dev server
- `pnpm check` – ESLint, Prettier, `tsc`, tests and `next build` for WorkBot, then
  `pnpm --filter workbot-site check` for the site; must pass before every push
  (CI runs it)
- `pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm test`, `pnpm build` – the
  individual steps
- `pnpm --filter workbot-site dev` – the site on port 3001
- `pnpm --filter workbot-site check` – the site's lint, typecheck and build
- `pnpm dlx shadcn@latest add <component>` – add a UI component

## Conventions

- **Where files go:** routes in `src/app`; shared UI in `src/components`; shadcn
  primitives in `src/components/ui` (generated, edit sparingly); helpers and
  server code in `src/lib`. Import with the `@/` alias. Nothing in `src/`
  belongs to the site, and nothing here imports from `site/`.
- **Server Components by default.** A Server Component renders on the server and
  sends no JavaScript to the browser. Add `"use client"` only to the smallest
  leaf that needs state, effects or browser APIs.
- **One module reads `process.env`:** `src/lib/config.ts`. Everywhere else imports
  `config` from it. It is server-only; never expose secrets to client code.
- Keep commits small, conventional (`feat:`, `fix:`, `chore:`) and imperative.
- **Claude tooling in `.claude/`:** skills `/component`, `/api-route`, `/pre-deploy` and `/pr-review`; reviewer subagents `bug-hunter`, `performance-reviewer` and `security-reviewer` (run together by `/pr-review`); and a `PostToolUse` hook in `.claude/settings.json` that runs Prettier on every file edited with Edit or Write.
- **Folder instructions:** `src/app/api/CLAUDE.md` defines route contracts and
  tests. `content/policies/CLAUDE.md` defines the policy file format, required
  front matter and how to write a policy. `site/AGENTS.md` defines the public
  site's scope.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
