---
title: "Information Security Policy"
team: operations
updatedAt: 2026-09-28
summary: "How WorkBot protects accounts, devices, applications and data."
---

## Principles

Security is a shared responsibility. Every person with an account is expected
to follow this policy, and every team is expected to build security into its
work rather than add it at the end.

## Accounts

- Use the company single sign-on provider wherever it is available.
- Enable multi-factor authentication on every work account.
- Use unique passwords stored in the approved password manager.
- Remove access within one business day when someone changes role or leaves.

## Devices

Managed devices must have disk encryption, automatic updates and endpoint
protection enabled. Report a lost or stolen device immediately so the
security team can revoke its sessions.

## Application security

- Review dependencies for known vulnerabilities before adding them.
- Keep secrets in the secret manager, never in source control.
- Require a second reviewer for changes that touch authentication, payments
  or personal data.
- Test backups by restoring them at least twice a year.

## Incident response

Report a suspected incident to the security team right away. Do not try to
investigate or fix it alone. The team will confirm severity, start the
response checklist and tell you what to do next.
