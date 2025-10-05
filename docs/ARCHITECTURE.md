# Unoapi Cloud — Architecture Overview

This document explains how Unoapi integrates with Baileys to expose a WhatsApp-like Cloud API, the main modules/classes, and the end‑to‑end message flow (including Status/Broadcast).

## High‑Level Components

- HTTP API (Express)
  - Routers and Controllers receive REST requests and map them to service calls.
- Services
  - Incoming/Outgoing orchestrate send/receive flows.
  - Client (Baileys or Forward) encapsulates the WhatsApp transport.
  - Socket (WASocket wrapper) manages Baileys connection lifecycle and low‑level operations.
  - Listener processes incoming events and forwards to webhooks/broadcast.
  - DataStore abstracts persistence (Redis or File), caching JIDs, messages, group metadata and media URLs.
  - Broadcast publishes internal events to Socket.IO for the UI.
- Infrastructure
  - Redis and RabbitMQ (optional) for queueing and state.
  - MinIO/S3 (optional) for media storage.

## Request Flow (Send Message)

1) Client calls `POST /vXX.Y/{phone}/messages` with a payload like the WhatsApp Cloud API.
2) `MessagesController.index` normalizes body/options (e.g., `statusJidList`, `broadcast`, visual options) and delegates to `Incoming.send`.
3) `IncomingBaileys.send` gets/creates a `Client` for `{phone}` via `getClientBaileys` and calls `client.send(payload, options)`.
4) `ClientBaileys.send`:
   - Builds Baileys message content (templates, media checks, optional audio conversion).
   - Applies group addressing policies and soft membership checks.
   - For Status (Stories), ensures `broadcast` and prepares `statusJidList`.
   - Calls the `sendMessage` function provided by `socket.ts`.
5) `socket.ts` maintains a connected `WASocket` and exposes `send`/`exists`/`read`/etc.
   - Validates session status, maps LID⇄PN when needed, pre‑asserts sessions to reduce decrypt/ack errors.
   - For `status@broadcast`, resolves each entry in `statusJidList` using `exists()` and filters out numbers without WhatsApp. Only valid recipients are relayed.
6) Baileys sends the message and returns WAMessage; Unoapi persists keys/message in the DataStore and returns a Cloud‑API‑like response.

## Status/Broadcast Flow

- Input: `to = "status@broadcast"`, `type = text|image|video|...`, and `options.statusJidList = [numbers | JIDs]`.
- `socket.ts` resolves each entry with `exists(raw)`:
  - Keeps only those that actually have WhatsApp (filters invalids).
  - Optional LID→PN normalization based on `STATUS_ALLOW_LID`.
  - Deduplicates recipients.
- Sends once, then calls `relayMessage` with the filtered list.
- Response adds:
  - `status_skipped`: the raw inputs ignored for having no WhatsApp.
  - `status_recipients`: how many valid recipients were relayed.

## Incoming Events Flow

- `socket.ts` subscribes to Baileys events (messages.upsert, messages.update, receipts, groups, calls, etc.).
- `ListenerBaileys` normalizes messages and forwards to webhooks or local processing.
- `Broadcast` emits auxiliary UI events via Socket.IO (`/ws`) for QR code and notifications.

## Data/Session Handling

- `Store` provides `sessionStore` and `dataStore` (Redis or File). Key capabilities:
  - `data_store_*`: cache JIDs (`onWhatsApp` results), messages, media URLs, group metadata.
  - `session_store`: connection state machine (connecting/online/offline/standby), timeouts and reconnect control.

## Error Handling & Resilience

- Defensive checks before send:
  - Validate session state (connecting/offline/disconnected/standby) → mapped to SendError codes.
  - For groups, optional membership check; pre‑assert sessions for participants.
  - Auto‑retry once on server ack 421 by toggling addressing mode (PN⇄LID).
- Disconnection handling:
  - Detects loggedOut/connectionReplaced/restartRequired, notifies, and reconnects when configured.

## Configuration Highlights (env)

- Session/Connection: `CONNECTION_TYPE`, `QR_TIMEOUT_MS`, `VALIDATE_SESSION_NUMBER`, `CLEAN_CONFIG_ON_DISCONNECT`.
- Logs: `LOG_LEVEL`, `UNO_LOG_LEVEL`.
- Status behavior: `STATUS_ALLOW_LID` (keep LID JIDs or normalize to PN).
- Group send: `GROUP_SEND_MEMBERSHIP_CHECK`, `GROUP_SEND_PREASSERT_SESSIONS`, `GROUP_SEND_ADDRESSING_MODE`.
- Media: S3/MinIO `STORAGE_*`, `FETCH_TIMEOUT_MS`, optional audio conversion to PTT.

## Key Files & Responsibilities

- Controllers: `src/controllers/*` — HTTP surface (Messages, Session/Pairing, Media, Templates, Preflight, etc.).
- Transport:
  - `src/services/client_baileys.ts` — High‑level client using Baileys.
  - `src/services/socket.ts` — Baileys socket lifecycle, send/exists/read, events, resilience.
  - `src/services/listener_baileys.ts` — Incoming events handling.
- Integration:
  - `src/services/incoming_baileys.ts` — Adapter for Incoming interface.
  - `src/services/outgoing.ts` — Outgoing formatter/webhook.
  - `src/services/broadcast.ts` — Socket.IO Broadcast.
- Data/State:
  - `src/services/data_store_file.ts` / `src/services/data_store_redis.ts` — message/JID/group/media caches.
  - `src/services/session_store.ts` — session state machine.
- Common:
  - `src/services/transformer.ts` — Cloud API ↔ Baileys content mapping, JID/phone helpers.
  - `src/defaults.ts` — feature flags and defaults.

## Message Lifecycles (Quick Maps)

- Send → Controller → Incoming → Client → Socket.send → Baileys → DataStore.persist → Response
- Status → Normalize `statusJidList` (exists filter) → sendMessage → relayMessage(validRecipients)
- Receive → Socket events → Listener → Webhooks/Broadcast

## Extensibility Notes

- To add a new outbound type: extend transformer to build Baileys content; map it in `ClientBaileys.send`.
- To add a new store: implement DataStore/SessionStore interfaces and wire via config.
- To tweak broadcast behavior: adjust `STATUS_*` flags in `defaults.ts`.

