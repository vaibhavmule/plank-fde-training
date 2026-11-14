# WorkBot site

The public landing page for WorkBot, the enterprise workflow platform built in
[plank-fde-training](../README.md). It is a separate Next.js app in the same pnpm
workspace.

```bash
pnpm --filter workbot-site dev   # http://localhost:3001
pnpm --filter workbot-site check # lint, typecheck, build
```

See [AGENTS.md](./AGENTS.md) for what this app is and is not.
