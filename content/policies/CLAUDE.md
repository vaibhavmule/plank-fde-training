# Policies content

- One policy per Markdown file. The filename without `.md` is the slug and must
  be lowercase kebab-case (`data-retention.md`). `CLAUDE.md` is ignored.
- Start every file with front matter, then a blank line and the body:

  ```markdown
  ---
  title: "Data Retention Policy"
  team: operations
  updatedAt: 2026-07-11
  summary: "How long each kind of company and customer data is kept."
  ---

  ## Scope

  ...
  ```

- Front matter is a flat `key: value` list, not full YAML. All four fields are
  required: `title` (1–120 chars), `team` (1–40 chars), `updatedAt` (ISO date
  `YYYY-MM-DD`) and `summary` (1–240 chars). Quote values that contain `:` or
  `#`. Unknown or duplicate fields fail `pnpm check`.
- Use `operations`, `finance` or `support` for `team` so policies line up with
  requests.
- Write the body in GitHub-flavoured Markdown: `##` sections, lists, tables and
  links. Raw HTML is escaped at render time, so do not rely on it. Link other
  policies by absolute path, for example `/policies/time-off`.
- Files are read once at build time and cached, so a new policy needs a new
  deploy. Run `pnpm check` before pushing; a malformed file fails the build.
