# Status/Broadcast — Behavior & Safeguards

This document describes how to send Stories (Status) via Baileys using Unoapi in general terms.

## Inputs

- `to = "status@broadcast"`
- `type` is a content type supported by Baileys (text, image, video, etc.)
- `options.statusJidList = [numbers | JIDs]` — the recipient list to relay after initial send

## Notes

- Recipients must be valid WhatsApp users.
- The application does not perform automatic filtering/normalization of recipient lists in this branch; ensure your inputs já são válidos.

## Response

- Follows the Cloud API structure (`contacts`, `messages`). No fields adicionais específicos de Status são adicionados neste branch.

## Rationale

- Large lists may contain numbers without WhatsApp, which previously caused Baileys errors and could drop the socket.
- By filtering and normalizing upfront, Unoapi sends only to valid recipients and keeps the socket stable.
