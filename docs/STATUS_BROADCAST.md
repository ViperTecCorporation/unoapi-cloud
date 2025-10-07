# Status/Broadcast — Behavior & Safeguards

This document details how Unoapi handles Stories (Status) via Baileys and the protections added to avoid socket disconnects when large recipient lists include invalid numbers.

## Inputs

- `to = "status@broadcast"`
- `type` is a content type supported by Baileys (text, image, video, etc.)
- `options.statusJidList = [numbers | JIDs]` — the recipient list to relay after initial send

## Validation & Normalization

Implemented in `src/services/socket.ts` inside the `send()` path for `status@broadcast`:

- For each entry in `statusJidList`, call `exists(raw)` which resolves to a valid JID if the number has WhatsApp, or `undefined` otherwise.
- Filter out all `undefined` (invalid numbers), log a warning with a small preview of skipped entries.
- Optionally normalize LID JIDs to PN based on `STATUS_ALLOW_LID` in `defaults.ts`.
- Deduplicate the final list.

If, after normalization, there are no valid recipients, the `relayMessage` step is skipped.

## Response Augmentation

To assist monitoring and client UX, the HTTP response includes two extra fields for Status sends:

- `status_skipped`: raw inputs that were removed for having no WhatsApp account.
- `status_recipients`: count of valid recipients relayed.

These fields are added without breaking the Cloud API response structure (`messages/contacts`).

## Rationale

- Large lists may contain numbers without WhatsApp, which previously caused Baileys errors and could drop the socket.
- By filtering and normalizing upfront, Unoapi sends only to valid recipients and keeps the socket stable.

