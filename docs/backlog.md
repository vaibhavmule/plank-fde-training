# WorkBot Day 3 backlog

Scope: seven feature tickets, WB-5 through WB-11. IDs are provisional until
created in Linear. Figma entries are placeholders, not existing frame links.
Size: **S** = under 1 hour; **M** = 2–4 hours.

## Tickets

| ID    | Title                            | Day | Size | Status    | Depends on | Figma frame             |
| ----- | -------------------------------- | --- | ---- | --------- | ---------- | ----------------------- |
| WB-5  | Define request model and storage | 3   | S    | Done      | —          | N/A                     |
| WB-6  | Create request intake form       | 3   | M    | Done      | WB-5       | Pending: intake         |
| WB-7  | Display requests list            | 3   | S    | In review | WB-5       | Pending: list           |
| WB-8  | Expose requests API              | 3   | S    | Backlog   | WB-5       | N/A                     |
| WB-9  | Create admin navigation          | 3   | S    | Backlog   | —          | Pending: admin shell    |
| WB-10 | Display admin overview           | 3   | S    | Backlog   | WB-5, WB-9 | Pending: overview       |
| WB-11 | Move settings into admin         | 3   | S    | Backlog   | WB-9       | Pending: admin settings |

## Acceptance criteria

### WB-5 — Define request model and storage

Implementation brief (each criterion is a testable assertion):

- Parsing trims title and details; accepts a 1–120 character title and up to 5,000 characters of details after trimming; rejects blank or missing titles and oversized text.
- Parsing requires team `operations`, `finance`, or `support`; accepts priorities `low`, `medium`, or `high`; defaults omitted priority to `medium` and omitted details to an empty string; rejects unsupported values and nulls. Export the inferred input and record types.
- `createRequest` generates a unique UUID, ISO creation time, and status `open` (other declared statuses: `in_progress`, `closed`); ignores submitted metadata; invalid input rejects without adding a record.
- `listRequests` returns newest first, including timestamp ties; starts empty; preserves records across module reloads through `globalThis`; returned arrays and objects cannot mutate storage. Both helpers mark runtime work with `io()`.

### WB-6 — Create request intake form

- `/requests/new` uses shadcn Input, Textarea, and NativeSelect with labels and an accessible submit control.
- A Server Action validates with the shared schema and returns field errors for invalid submission, preserving entered values.
- Valid submission creates one record and redirects to the list; prevent accidental repeat submission while pending.

### WB-7 — Display requests list

- `/requests` uses a shadcn Table with priority and status badges and an explicit empty state.
- Priority and status remain understandable without relying on color.
- Header navigation and a creation link make the flow discoverable.

### WB-8 — Expose requests API

- `GET` and `POST /api/requests` use the same request schema as the form and storage module.
- Invalid JSON or invalid fields return 400; successful creation returns 201.
- Unit tests parse every response through a response schema and confirm rejected submissions do not create records.

### WB-9 — Create admin navigation

- `/admin` pages share a layout with side navigation and an active-page indicator.
- Navigation works by keyboard and remains usable on narrow screens.
- Treat this as a navigation shell; it does not imply authentication or authorization.

### WB-10 — Display admin overview

- `/admin` shows one card per status with its count and the five latest requests (or all requests when fewer than five exist).
- Zero records produces useful empty content and zero totals.
- After creation, a fresh visit reflects the updated data.

### WB-11 — Move settings into admin

- `/admin/settings` preserves existing deployment information.
- Existing `/settings` links redirect to the new location.
- Header and admin navigation point to the intended settings destination.

## Delivery checklist

- Start with WB-5. Before implementation, write the brief as testable sentences using its acceptance criteria.
- Use a separate branch and PR for each ticket, and include the actual ticket ID in the commit subject.
- Review against the criteria and run `pnpm check` before pushing; merge after CI passes.
- After **every merge**, open the production URL, use the newly shipped feature once, and record the result in its PR.
- Final production check: file a request and verify it appears in the list, the API GET response, and the admin overview counts.
- Storage is shared only within one server process. Restarts and separate instances do not share it; persistence is outside this scope.

## Reference

[Day 3: AI SDLC workflow](https://joinplank.com/ai-fde-course/ai-sdlc-workflow-day-3)
