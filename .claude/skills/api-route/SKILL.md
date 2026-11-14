---
name: api-route
description: Scaffold a Next.js route handler with Zod validation, types and tests.
argument-hint: <name> [methods]
disable-model-invocation: true
---

Arguments: `$ARGUMENTS`. The first word is the route name, for example `echo`. Any further words are HTTP methods, uppercase, for example `POST`. Default to `GET` when none are given. Ask if the name is missing.

Read `AGENTS.md`, `src/app/api/CLAUDE.md`, and the installed Next.js route-handler guide first. Create three files in `src/app/api/<name>/`. Use `src/app/api/requests/` as the contract and test reference, and `src/app/api/health/route.ts` for a minimal handler.

1. `types.ts`: Zod schemas for the request and the response of each method, and the inferred types (`z.infer`). Import from `zod`.
2. `route.ts`: one exported function per method, named after the method.
   - Parse the input (JSON body for POST, PUT and PATCH, search params for GET and DELETE) with the schema's `safeParse`.
   - Invalid input: `Response.json({ error: "invalid_request", issues: result.error.issues }, { status: 400 })`.
   - A resource that does not exist: 404. A conflict with the current state: 409. Use them when the route has a resource to look up or create, with a `{ error: "not_found" }` or `{ error: "conflict" }` body.
   - Success: `Response.json(...)` of a value that matches the response schema.
   - Do not read `process.env`. Import `config` from `@/lib/config` if needed.
3. `route.test.ts`: import the handler functions and call them with `new Request("http://localhost/api/<name>", ...)`. Write one test per method for the success case, plus one test with invalid input that expects 400 and `issues` in the body.

Run `pnpm exec prettier --write` on the new files, then `pnpm test`. Report the files created and the test result.
