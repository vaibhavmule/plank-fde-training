---
name: component
description: Scaffold a React component and its test in src/components.
argument-hint: <Name>
disable-model-invocation: true
---

Create a component named `$ARGUMENTS` (PascalCase; ask if the name is missing).

1. Convert the name to kebab-case, for example `Notice` becomes `notice`.
2. Read `src/components/site-header.tsx` and `src/components/site-header.test.tsx`. They are the pattern to match: a named export, no default export, imports through the `@/` alias, markup built from the shadcn primitives in `src/components/ui` (for example `buttonVariants`, `Card`, `Badge`) and Tailwind classes.
3. Create `src/components/<kebab-name>.tsx` exporting the component.
   - It is a Server Component. Do not add `"use client"` unless it needs state, effects or browser APIs.
   - Do not read `process.env`. Only `src/lib/config.ts` does.
4. Create `src/components/<kebab-name>.test.tsx` beside it. Follow the test file's shape: render with `renderToStaticMarkup` and assert on the markup.
5. Do not add a barrel file or an `index.ts`. This project imports components by path.
6. Run `pnpm exec prettier --write` on the new files and `pnpm test`. Report the files created and the test result.
