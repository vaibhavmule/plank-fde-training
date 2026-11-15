# Knowledge content

The knowledge base WorkBot's agents search. Every file is a Markdown document
with front matter, and every `##` heading becomes one chunk in the search
index.

## Sections

| Section    | What belongs there                                     |
| ---------- | ------------------------------------------------------ |
| `policies` | Company policies, also shown on the Day 4 policy pages |
| `manuals`  | How a process works, and runbooks                      |
| `it`       | Device, account, network and software guidance         |
| `faq`      | Customer-facing answers                                |
| `people`   | Leave, careers, onboarding and leaving                 |

`faq` and `policies` are the only sections the public web chat may read. Any
document a customer must not see belongs in another section.

## Front matter

A flat `key: value` list, not full YAML, then a blank line and the body:

```markdown
---
title: "Refund Policy"
owner: Support lead
updated: 2026-11-14
summary: "How much a support agent may refund without approval."
team: support
---

## Refund authority

...
```

- `title` (1–120 chars), `owner` (1–60), `updated` (ISO date `YYYY-MM-DD`) and
  `summary` (1–240) are required.
- `team` (`operations`, `finance` or `support`) is optional, and only a
  `policies` document needs it, because the policy pages group by team.
- Quote a value that contains `:` or `#`. Unknown or duplicate fields fail
  `pnpm check`.

## Paths

The path is `<section>/<slug>`: `content/knowledge/policies/refunds.md` is
`policies/refunds`. A section and a slug are lowercase kebab-case.
`CLAUDE.md` is ignored.

## Each heading must stand on its own

Search returns headings, not whole files, so a section is read without the ones
around it. Name the subject in the heading (`## Refund authority`, not
`## Details`) and repeat the subject in the first sentence of the section. A
reader who opens only `policies/refunds#larger-refunds` must still know which
policy and which limit it describes.

## Links

Link another document by its knowledge path, for example
`[Expense reimbursement](/knowledge/policies/expense-reimbursement)`.
