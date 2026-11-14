# API routes

- Each new route is a folder containing `route.ts`, `types.ts`, and `route.test.ts`; match `requests/`.
- Zod request and response schemas in `types.ts` are the contract; infer TypeScript types from them and reuse shared domain schemas.
- Handlers parse and validate input, call `@/lib` helpers, and format responses; keep business logic in `src/lib`.
- Use 200 for reads, 201 for creation, 400 for invalid input/JSON, 404 for missing resources, and 409 for conflicts; reserve 500/503 for unexpected failures/unavailable services.
- Return structured JSON errors without secrets or raw submitted values; only `src/lib/config.ts` reads environment variables.
- Test exported handlers with `Request` objects, parse every response through its schema, and verify invalid input does not mutate data.
- Read the installed Next.js route-handler guide before scaffolding, then run `pnpm check` before pushing.
