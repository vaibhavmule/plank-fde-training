---
name: pr-review
description: Review a pull request from three angles in parallel (bugs, performance, security) and merge the findings into one review.
argument-hint: [pull request number]
disable-model-invocation: true
---

Review the changes for `$ARGUMENTS` with three subagents, then write one merged review.

## 1. Pick the diff command

- With a pull request number: `gh pr diff <number>`.
- With no number: `git diff main...HEAD`.

Do not run the diff yourself. Pass the command to each agent, and each agent runs it itself. This keeps the full diff out of this session.

## 2. Run the three reviewers in parallel

Start `bug-hunter`, `performance-reviewer` and `security-reviewer` in a single step so they run at the same time. Give each one the same prompt: the exact diff command from step 1, and a reminder to report findings only, most severe first, each with a file, a line and a one-line fix.

## 3. Write one review

Use only what the reviewers returned. Do not add findings of your own, and do not review the diff yourself.

- Group the findings by severity: **Critical**, **High**, **Medium**, **Low**. Order them most severe first inside each group.
- Name the reviewer for each finding (bug hunter, performance, security).
- Merge duplicates. When two reviewers report the same problem, list it once and name both reviewers.
- Keep each finding to its file, line, what is wrong and the one-line fix.
- Leave out empty severity groups.

End with a verdict on one line:

- **Block**: there is at least one Critical finding.
- **Fix before merge**: there are High findings and no Critical ones.
- **Approve**: there are only Medium or Low findings, or none.

If all three reviewers found nothing, say so in one sentence and give the verdict.
