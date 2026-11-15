---
title: "Request states and transitions"
owner: Operations team
updated: 2026-09-18
summary: "The three request states, who may move a request and what each move records."
---

## The three states

A request is `open`, `in_progress` or `closed`. There is no other state, and a request is always in exactly one of them.

## Open

A new request starts open. Nobody has picked it up yet. The team queue shows open requests newest first, so an ageing request in this state is a signal that nobody has looked.

## In progress

The owner moves a request to in progress the first time they work on it. From here the request should have a comment every two business days until it closes.

## Closed

Close a request when the outcome the title asked for is true. Closing is not the same as handing off: an escalation to engineering stays in progress until engineering answers.

## Who may change the state

The owner, the team lead and an administrator may move a request. Anyone may comment. The person who filed the request cannot close it, so that the owner records the outcome.

## Reopening

A closed request can be reopened within 30 days. After that, file a new request and link the old one. Reopening resets the request to in progress and keeps the earlier comments.

## What each move records

Every state change writes the person, the time and the previous state to the request history. The history is never edited, so it can be used as an audit trail.
