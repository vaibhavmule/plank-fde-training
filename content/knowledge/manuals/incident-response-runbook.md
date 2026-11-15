---
title: "Incident response runbook"
owner: Security team
updated: 2026-09-25
summary: "What to do in the first hour of a production incident or a suspected breach."
---

## Declare the incident

Say clearly in the operations channel that there is an incident, and name an incident lead. One person leads; others contribute. Do not investigate alone, which the information security policy also forbids.

## First 15 minutes

1. Write one line on what is broken and who is affected.
2. Open an operations request marked high, and link it in the channel.
3. Decide whether customer data is involved. If it may be, treat it as a breach.
4. Start a timeline in the request: time, action, person.

## Communication

Update the request every 30 minutes, even when there is no change. Customers hear from support, never from engineering directly. Internal teams read the request.

## Suspected breach

If data may have been exposed, tell the security team immediately and stop handling the affected data. Do not delete logs or restart systems that would clear evidence.

## Recovery and review

Restore service, then confirm the fix with the customer workflow that broke. Hold a review within five business days and record each action item with an owner and a date.
