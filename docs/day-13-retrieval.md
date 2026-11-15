# Day 13: top-5 retrieval against the agent

`pnpm compare:retrieval` runs 10 questions through both approaches over the same
52-document corpus, with `claude-haiku-5-5` for both, so the comparison measures
retrieval rather than model size.

An answer counts as correct when it states the figure or rule the document gives
**and** cites the section that holds it.

## Totals

| Approach             | Input   | Output | Cost      |
| -------------------- | ------- | ------ | --------- |
| Top-5, one call      | 5,729   | 2,395  | $0.001770 |
| Agent, find/cat/grep | 184,832 | 14,108 | $0.025537 |

The agent spent **24.5 times the tokens**, which is the trade the day describes.

## The list

| #   | Question                             | Top-5   | Agent             |
| --- | ------------------------------------ | ------- | ----------------- |
| 1   | $250 refund alone                    | Correct | Correct, complete |
| 2   | Refund timing to a card              | Correct | Correct, complete |
| 3   | Nightly hotel limit                  | Correct | Correct           |
| 4   | Holiday and carry-over               | Correct | Correct           |
| 5   | New starter's first month            | Correct | Correct, complete |
| 6   | 90-day data and the 1-year exception | Correct | Correct           |
| 7   | An approval that nobody answers      | Correct | Correct           |
| 8   | Team lead limit, finance takeover    | Correct | Correct           |
| 9   | More than one customer affected      | Correct | Correct, complete |
| 10  | Six weeks in another country         | Correct | Correct           |

Both approaches answered every question with the right figure and the right
section. The difference was completeness, not correctness.

## Where top-5 fell short

**Question 1**, the $250 refund. The five chunks held the $200 limit and the
support lead's approval, which answers the question. They did not hold the line
that refunds above $1,000 need finance too, because that sentence sits in the
next section. The agent read the whole document with `cat` and got it, along
with the duplicate-charge exception.

**Question 5**, a new starter's first month. Top-5 found the home office
allowance and the missing cost centre, then said the amount was not in the
passages. It was not in the five chunks; it is not in the corpus at all, so both
approaches correctly said to ask finance.

**Question 9**, more than one customer. Top-5 found the escalation trigger and
stopped, saying it could not map multiple customers to a severity. The agent
cross-referenced the severity table, the escalation steps and the incident
runbook, and said plainly that the corpus does not map the two either. Same
conclusion, more useful answer.

## What this corpus shows

Top-5 is enough here because every `##` heading names its subject and the
questions use those words: "Nightly hotel limit" sits under `#limits`, "how long
a refund takes" under `#the-timeline`. Retrieval by words finds the right chunk
when the question's vocabulary matches the heading's.

The agent earns its 24.5x when the answer spans sections, which is the same
finding the course predicts. A hybrid is the practical answer: start with top-5
and escalate to the agent when the first answer cannot cite a section, which is
exactly the condition questions 1 and 9 ran into.

## Reproducing

```bash
pnpm knowledge:index      # 52 documents, 274 chunks
pnpm compare:retrieval    # 10 questions, both ways, with token counts
```

Without `VOYAGE_API_KEY` the index is built from words, so both columns search
by matching terms. Set it to compare meaning search against the agent.
