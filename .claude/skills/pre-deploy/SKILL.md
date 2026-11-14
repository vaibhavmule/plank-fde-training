---
name: pre-deploy
description: Run the pre-deploy checks and report a pass or fail table.
disable-model-invocation: true
---

Results of the pre-deploy checks. The shell commands below already ran, so do not run anything yourself.

## Type check (`pnpm typecheck`)

!`out=$(pnpm typecheck 2>&1); code=$?; echo "$out" | tail -n 15; echo "exit code: $code"`

## Tests (`pnpm test`)

!`out=$(pnpm test 2>&1); code=$?; echo "$out" | tail -n 15; echo "exit code: $code"`

## console.log under src/

!`grep -rn "console\.log" src/ || echo "none found"`

## Environment variables from .env.example

!`node -e 'const fs=require("fs");try{process.loadEnvFile(".env.local")}catch{}const names=fs.readFileSync(".env.example","utf8").split("\n").map(l=>l.trim()).filter(l=>l&&!l.startsWith("#")).map(l=>l.split("=")[0]);const missing=names.filter(n=>!process.env[n]);console.log(missing.length?"missing: "+missing.join(", "):"all set")'`

## Your answer

Reply with only a Markdown table with one row per check (type check, tests, console.log, environment variables) and a PASS or FAIL for each, then a one-line verdict. Nothing else.

- Type check and tests pass when the exit code is 0.
- console.log passes when none are found.
- A variable missing from the environment fails the check, unless `src/lib/config.ts` gives it a fallback. Then it is a PASS with a note.
