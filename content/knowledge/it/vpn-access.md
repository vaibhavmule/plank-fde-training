---
title: "VPN and remote network access"
owner: IT team
updated: 2026-09-16
summary: "When you need the VPN, how to connect and what to do when it will not."
---

## When you need it

The VPN is needed for internal admin tools, database consoles and anything on the private network. Everyday work in WorkBot, email and the knowledge base does not need it.

## Connecting

1. Open the VPN client from the menu bar or the start menu.
2. Choose the region closest to you.
3. Sign in with single sign-on.
4. Confirm the menu bar shows connected before opening an internal tool.

## Access groups

- **All staff** reach the internal wiki and the request system.
- **Engineering** reach the staging and database consoles.
- **Finance** reach the billing exports.

Access comes from your team membership. A new access group needs an operations request naming the tool and the reason.

## When it will not connect

Check that you have internet without the VPN, and restart the client. A failed certificate is usually a wrong system clock: enable automatic time and try again. If it still fails, file an operations request with the client version and the error text.

## What not to do

Do not disable the client, split-tunnel by hand, or share a connection. Do not use a personal VPN alongside the company one.
