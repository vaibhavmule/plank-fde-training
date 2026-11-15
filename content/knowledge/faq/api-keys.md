---
title: "How do I get an API key?"
owner: Support lead
updated: 2026-10-23
summary: "Where API keys live, how to create one and what to do when one leaks."
---

## Creating a key

An account administrator creates API keys in the developer section of account settings. Give the key a name that says what it is for, and choose the narrowest scope that works.

## Scopes

- **Read** reaches records and reports.
- **Write** creates and updates records.
- **Admin** changes settings and users.

A key that only reads should be a read key. Support can see the scope of a key but never the key itself.

## Storing a key

Treat a key like a password: keep it in a secret manager on the customer's side, never in client-side code or a public repository. A key in a browser bundle is a leaked key.

## A leaked key

Revoke it first in the developer section, then issue a new one. Revocation takes effect immediately. Tell support so the access log is reviewed for anything the key did that the customer did not expect.

## Limits

Keys are rate limited per account. A 429 response means the limit is reached; the response carries the time to wait. Support can raise a limit for an integration that needs it.

## Rotation

Rotate keys at least every 12 months. Create the new key, deploy it, then revoke the old one, so there is no window without a working key.
