---
title: "Which integrations are available?"
owner: Support lead
updated: 2026-08-29
summary: "The integrations support can enable, and what each one needs."
---

## Available integrations

- **Chat:** post request updates into a channel.
- **Calendar:** create a meeting from a request.
- **Single sign-on:** sign in with the customer's identity provider.
- **Webhooks:** send request events to an endpoint the customer runs.

## Enabling one

An administrator enables an integration in settings. Chat and calendar connect with an authorisation step. Single sign-on needs the customer's identity provider metadata and a test sign-in before it goes live.

## Webhooks

A webhook delivers a JSON body per event, signed with a shared secret. Retries run three times over ten minutes, and the endpoint must return a 2xx within 10 seconds. A slower endpoint should queue the event and answer immediately.

## What is not available

Support cannot build a custom integration. A workflow the available integrations do not cover is a feature request, which goes to the account's sales contact.

## When an integration stops

Check the integration's status in settings first; a revoked token shows there. Reconnect, then test one event. If it still fails, support asks for the endpoint response and the timestamp.
