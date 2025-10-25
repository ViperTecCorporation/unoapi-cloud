# Environment Variables â€” Reference and Examples

This guide explains key environment variables, when to use them, and why. Copy `.env.example` to `.env` and adjust for your setup.

## Core Server

- `PORT` â€” HTTP port. Default `9876`.
  - Use when running multiple services or behind a reverse proxy.
  - Example: `PORT=8080`
- `BASE_URL` â€” Public base URL used to compose media links in responses.
  - Use when your service is behind a proxy/CDN and clients download media via a public URL.
  - Example: `BASE_URL=https://api.example.com`

## Session & Connection

- `CONNECTION_TYPE` â€” `qrcode` | `pairing_code`. Default `qrcode`.
  - Use `pairing_code` for headless pairing without showing QR.
  - Example: `CONNECTION_TYPE=pairing_code`
- `QR_TIMEOUT_MS` â€” Time to wait for QR scan. Default `60000`.
  - Increase on slow pairing scenarios.
  - Example: `QR_TIMEOUT_MS=120000`
- `VALIDATE_SESSION_NUMBER` â€” Ensure configured phone matches session. Default `false`.
  - Use `true` to prevent cross-session mismatches.
  - Example: `VALIDATE_SESSION_NUMBER=true`
- `CLEAN_CONFIG_ON_DISCONNECT` â€” Clean saved configs when disconnecting. Default `false`.
  - Use to force a fresh state on disconnect.
  - Example: `CLEAN_CONFIG_ON_DISCONNECT=true`

## Logging

- `LOG_LEVEL` â€” Unoapi service log level. Default `warn`.
  - Use `debug` during development.
  - Example: `LOG_LEVEL=debug`
- `UNO_LOG_LEVEL` â€” Internal Uno logger override (falls back to LOG_LEVEL).
  - Example: `UNO_LOG_LEVEL=info`

## Redis & RabbitMQ

- `REDIS_URL` â€” Redis connection string.
  - Use to enable Redis store (sessions/data). Without it, filesystem store is used.
  - Example: `REDIS_URL=redis://localhost:6379`
- `AMQP_URL` â€” RabbitMQ URL for broker features.
  - Use to enable queue processing (web/worker model, retries, dead letters).
  - Example: `AMQP_URL=amqp://guest:guest@localhost:5672?frameMax=8192`

## Storage (S3/MinIO)

- `STORAGE_ENDPOINT` â€” S3-compatible endpoint.
- `STORAGE_REGION` â€” S3 region (e.g., `us-east-1`).
- `STORAGE_BUCKET_NAME` â€” Bucket name for media.
- `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` â€” Credentials.
- `STORAGE_FORCE_PATH_STYLE` â€” `true` for MinIO/compatibility.
  - Use these to store media in S3/MinIO instead of local filesystem.
  - Example:
    ```env
    STORAGE_ENDPOINT=http://minio:9000
    STORAGE_REGION=us-east-1
    STORAGE_BUCKET_NAME=unoapi
    STORAGE_ACCESS_KEY_ID=minioadmin
    STORAGE_SECRET_ACCESS_KEY=minioadmin
    STORAGE_FORCE_PATH_STYLE=true
    ```

## Status/Broadcast Behavior

- `STATUS_ALLOW_LID` â€” Allow LID JIDs in status recipients. Default `true`.
  - Set `false` to normalize to PN (`@s.whatsapp.net`) for consistency.
  - Example: `STATUS_ALLOW_LID=false`
- `STATUS_BROADCAST_ENABLED` â€” Enable Status (status@broadcast) sending. Default `true`.
  - Set `false` to block any outgoing Status before reaching WhatsApp (useful to avoid account risk).
  - Example: `STATUS_BROADCAST_ENABLED=false`

## Group Sending

- `GROUP_SEND_MEMBERSHIP_CHECK` â€” Warn if not a group member. Default `true`.
- `GROUP_SEND_PREASSERT_SESSIONS` â€” Pre-assert sessions for participants. Default `true`.
- `GROUP_SEND_ADDRESSING_MODE` â€” Prefer `pn` or `lid`. Default unset (treated as LID by default).
- `GROUP_SEND_FALLBACK_ORDER` â€” Fallback order on ack 421, e.g., `pn,lid`. Default `pn,lid`.
  - Use to improve reliability in groups under network/device quirks.
  - Example: `GROUP_SEND_ADDRESSING_MODE=pn`

Large groups (No-sessions mitigation & throttles)
- `GROUP_LARGE_THRESHOLD` â€” Consider a group as â€œlargeâ€ when participant count exceeds this threshold. Default `800`.
  - When large, the client skips heavy preâ€‘asserts to reduce load. Addressing remains LID by default (unless configured), and fallback toggles addressing according to `GROUP_SEND_FALLBACK_ORDER` if needed.
  - Example: `GROUP_LARGE_THRESHOLD=1000`
- `GROUP_ASSERT_CHUNK_SIZE` â€” Chunk size for `assertSessions()` in group fallbacks. Default `100` (min 20).
  - Example: `GROUP_ASSERT_CHUNK_SIZE=80`
- `GROUP_ASSERT_FLOOD_WINDOW_MS` â€” Flood window to avoid repeated heavy asserts per group. Default `5000`.
  - Example: `GROUP_ASSERT_FLOOD_WINDOW_MS=10000`
- `NO_SESSION_RETRY_BASE_DELAY_MS` â€” Base delay before retrying send after asserts. Default `150`.
- `NO_SESSION_RETRY_PER_200_DELAY_MS` â€” Extra delay per 200 targets. Default `300`.
- `NO_SESSION_RETRY_MAX_DELAY_MS` â€” Cap for adaptive delay. Default `2000`.
  - Example: `NO_SESSION_RETRY_BASE_DELAY_MS=250`, `NO_SESSION_RETRY_PER_200_DELAY_MS=400`, `NO_SESSION_RETRY_MAX_DELAY_MS=3000`
- `RECEIPT_RETRY_ASSERT_COOLDOWN_MS` â€” Cooldown between asserts triggered by `message-receipt.update` retry per group. Default `15000`.
- `RECEIPT_RETRY_ASSERT_MAX_TARGETS` â€” Limit targets for receipt-based asserts. Default `400`.

## Server ACK Retry (assert + resend)

- `ACK_RETRY_DELAYS_MS` â€” Comma-separated delays in milliseconds for retries when no server ACK is observed. Default `8000,30000,60000` (8s, 30s, 60s).
  - Example: `ACK_RETRY_DELAYS_MS=5000,15000,45000`
- `ACK_RETRY_MAX_ATTEMPTS` â€” Hard cap on number of attempts. Default `0` (use the number of entries from `ACK_RETRY_DELAYS_MS`).
  - Example: `ACK_RETRY_MAX_ATTEMPTS=2`

Reliability note:
- On a rare libsignal error â€œNo sessionsâ€ during group sends, the service reâ€‘asserts sessions (chunked) and retries once. If it still fails, it toggles addressing mode following `GROUP_SEND_FALLBACK_ORDER` and tries again.

### Group receipt/status fan-out controls

When groups get large, per-recipient receipts (read/played/delivered per participant) can flood your webhook/socket. These toggles reduce event fanâ€‘out while preserving a single groupâ€‘level delivery signal.

- `GROUP_IGNORE_INDIVIDUAL_RECEIPTS` â€” Suppress `message-receipt.update` per participant for group messages. Default `true`.
  - Set `false` to receive perâ€‘user read/played/delivery receipts in groups.
- `GROUP_ONLY_DELIVERED_STATUS` â€” On `messages.update` for groups, forward only `DELIVERY_ACK` (delivered). Default `true`.
  - Set `false` to forward all status updates (including read/played) for groups.

Example (keep load low in big groups):
```env
GROUP_IGNORE_INDIVIDUAL_RECEIPTS=true
GROUP_ONLY_DELIVERED_STATUS=true
```
Restore legacy behavior (full receipts per user):
```env
GROUP_IGNORE_INDIVIDUAL_RECEIPTS=false
GROUP_ONLY_DELIVERED_STATUS=false
```


## One-to-One (Direct) Sending

- ONE_TO_ONE_ADDRESSING_MODE — Prefer addressing mode for direct chats (1:1). Default pn.
  - pn (recommended): send via PN. Avoids cases where @lid opens a separate conversation or messages do not show up on some devices.
  - lid: prefer sending via LID when available (can reduce first-contact session/decrypt errors, but may split threads).
  - Example:
    ```env
    # default (PN)
    ONE_TO_ONE_ADDRESSING_MODE=pn
    # or prefer LID
    # ONE_TO_ONE_ADDRESSING_MODE=lid
    ```

Webhook normalization
- WEBHOOK_PREFER_PN_OVER_LID — If 	rue (default), webhook payloads prefer PN in wa_id, rom and 
ecipient_id when safely resolvable; otherwise a LID/JID may be returned.## LID/PN Mapping Cache

- `JIDMAP_CACHE_ENABLED` â€” Enable PNâ†”LID cache. Default `true`.
  - Stores perâ€‘session mapping between LID JIDs and PN JIDs to reduce runtime lookups and improve delivery in large groups.
  - Example: `JIDMAP_CACHE_ENABLED=true`
- `JIDMAP_TTL_SECONDS` â€” TTL for cache entries. Default `604800` (7 days).
  - Example: `JIDMAP_TTL_SECONDS=604800`

## LID/PN Behavior

- Webhooks prefer PN. When PN cannot be resolved safely, LID/JID is returned as a fallback.
- Internally, the API uses LID when available for 1:1 and groups. For 1:1, PNâ†’LID mappings are learned on-the-fly (assertSessions/exists, and events).
- Profile pictures are stored and retrieved by a canonical PN whenever possible (same for S3 keys), so PN and LID variants reference the same asset.

## Antiâ€‘Spam / Rate Limits

- `RATE_LIMIT_GLOBAL_PER_MINUTE` â€” Max messages per minute per session. Default `0` (disabled).
  - Example: `RATE_LIMIT_GLOBAL_PER_MINUTE=60`
- `RATE_LIMIT_PER_TO_PER_MINUTE` â€” Max messages per minute per destination (per session). Default `0` (disabled).
  - Example: `RATE_LIMIT_PER_TO_PER_MINUTE=20`
- `RATE_LIMIT_BLOCK_SECONDS` â€” Suggested delay (in seconds) when limits are exceeded. Default `60`.
  - When a limit is hit, the API schedules the send via RabbitMQ with this delay instead of returning HTTP 429.
  - Example: `RATE_LIMIT_BLOCK_SECONDS=60`

## Webhooks / Queues / Retries

- `UNOAPI_MESSAGE_RETRY_LIMIT` â€” Max delivery attempts in AMQP consumers before deadâ€‘letter. Default `5`.
  - Example: `UNOAPI_MESSAGE_RETRY_LIMIT=7`
- `UNOAPI_MESSAGE_RETRY_DELAY` â€” Default delay used by helpers when publishing delayed messages (ms). Default `10000`.
  - Note: the consumer retry path uses a fixed 60s requeue delay.
  - Example: `UNOAPI_MESSAGE_RETRY_DELAY=15000`
- `CONSUMER_TIMEOUT_MS` â€” Max time (ms) allowed for a consumer to process a message before forcing retry. Default `360000`.
  - Example: `CONSUMER_TIMEOUT_MS=180000`
- `NOTIFY_FAILED_MESSAGES` â€” Send a diagnostic text to the session number when retries are exhausted. Default `true`.
  - Example: `NOTIFY_FAILED_MESSAGES=false`

## Media & Timeouts

### Inbound deduplication

Some providers/devices may occasionally emit the same WA message more than once during reconnects or history sync. Use the window below to suppress duplicates quickly arriving backâ€‘toâ€‘back.

- `INBOUND_DEDUP_WINDOW_MS` â€” Skip processing a message if another with the same `remoteJid` and `id` arrives within this window (ms). Default `7000`.
  - Example: `INBOUND_DEDUP_WINDOW_MS=5000`

### Outgoing idempotency

Skip sending the same message again when a job retry happens after a successful send.

- `OUTGOING_IDEMPOTENCY_ENABLED` â€” When `true` (default), the incoming job checks the store (key/status) for the UNO id before sending; if it looks processed, it skips the send.
  - Example: `OUTGOING_IDEMPOTENCY_ENABLED=false` (to disable)

### Profile Pictures

- Canonical filename: always by phone number (PN). If input is LID, map to PN first and save `<pn>.jpg`.
- Force refresh: `PROFILE_PICTURE_FORCE_REFRESH=true` (default) re-fetches from WhatsApp before returning the local/storage URL.
- Prefetch on send: the client prefetches the destination picture on outbound messages (1:1 and groups) to keep the cache fresh.
- Robust fetch order: for 1:1, attempts PN first, then mapped LID, using modes `image` then `preview`.
- S3 safety: checks object existence (HeadObject) before generating a presigned URL.

### Status/Webhook Behavior

- 1:1 normalization: `recipient_id` always PN (digits), even when events arrive with @lid.
- Timestamps: statuses (delivered/read) contain a timestamp (receipt/read when available; else `payload.messageTimestamp`).
- ID normalization: map provider ids to UNO ids before sending to webhooks.
- Anti-regression/duplicate: ignore lower-rank updates (e.g., â€œsentâ€ after â€œdeliveredâ€) and repeated statuses for the same message id.

## Profile Pictures

- Overview: The service can enrich webhook payloads with contact and group profile pictures. When enabled, images are stored either on S3 (recommended in production) or on the local filesystem and exposed as URLs in webhook events.

- Enable/disable
  - `SEND_PROFILE_PICTURE` â€” Include profile pictures in webhook payloads. Default `true`.

- Storage backends
  - S3 (preferred): enabled when `STORAGE_ENDPOINT` is set. Uses `@aws-sdk/client-s3` with credentials from `STORAGE_*` envs. Files are written as `<phone>/profile-pictures/<canonical>.jpg` where `<canonical>` is the contact number (digits only) for users, or the group JID for groups.
  - Filesystem: default when no S3 endpoint is configured. Files are stored under `<baseStore>/medias/<phone>/profile-pictures/<canonical>.jpg`.

- URLs returned to webhooks
  - S3: A preâ€‘signed URL is generated per request using `DATA_URL_TTL` (seconds). Link expires after TTL.
  - Filesystem: A public URL is generated from `BASE_URL`, using the download route: `BASE_URL/v15.0/download/<phone>/profile-pictures/<canonical>.jpg`.
  - First fetch: on the very first retrieval the service may return the WhatsApp CDN URL while it downloads and persists the image; subsequent events will use the storage URL (S3 or filesystem).

- Lifetime and cleanup
  - `DATA_TTL` â€” Default retention for stored media (including profile pictures) in seconds. Default 30 days.
  - When S3 is enabled and AMQP is configured, the service enqueues a timed job to delete the object after `DATA_TTL`.
  - For filesystem storage, cleanup is performed directly in the local media path.

- Integration points (high level)
  - The client enriches outgoing webhook payloads with:
    - Contact: `contacts[0].profile.picture`
    - Group: `group_picture`
  - The data store resolves a cached URL when available; otherwise it queries WhatsApp (`profilePictureUrl`), persists to storage, and returns a URL.

- Required configuration
  - For S3: `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET_NAME`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, and optionally `STORAGE_FORCE_PATH_STYLE`.
  - For filesystem: ensure `BASE_URL` points to a publicly reachable domain so that `/v15.0/download/...` links work for webhook consumers.

- `FETCH_TIMEOUT_MS` â€” Timeout for media HEAD/download checks. Default per code.
  - Increase when sending large media from slow servers.
  - Example: `FETCH_TIMEOUT_MS=15000`
- `SEND_AUDIO_MESSAGE_AS_PTT` â€” Mark outgoing audio as PTT (voice note). Default `false`.
- `CONVERT_AUDIO_TO_PTT` â€” Force conversion to OGG/Opus for PTT. Default `false`.
  - Use when clients expect voice notes with waveform.
  - Example:
    ```env
    SEND_AUDIO_MESSAGE_AS_PTT=true
    CONVERT_AUDIO_TO_PTT=true
    ```

## Proxy

- `PROXY_URL` â€” SOCKS/HTTP proxy for Baileys.
  - Use when outbound connections must go through a proxy.
  - Example: `PROXY_URL=socks5://user:pass@proxy.local:1080`

## Webhooks & Notifications

- `WEBHOOK_SESSION` â€” Receive session notifications (QR, status) via HTTP.
  - Use to integrate with external systems (e.g., show QR in another UI).
  - Example: `WEBHOOK_SESSION=https://hooks.example.com/uno/session`

## Voice Calls

- `WAVOIP_TOKEN` â€” Enable voice-calls-baileys.
  - Use to support call-related features where applicable.
  - Example: `WAVOIP_TOKEN=your-token`

## Examples by Scenario

- Local development with filesystem store only:
  ```env
  PORT=9876
  LOG_LEVEL=debug
  ```
- Dev with Redis + MinIO + RabbitMQ (compose defaults):
  ```env
  BASE_URL=http://web:9876
  REDIS_URL=redis://redis:6379
  AMQP_URL=amqp://guest:guest@rabbitmq:5672?frameMax=8192
  STORAGE_ENDPOINT=http://minio:9000
  STORAGE_BUCKET_NAME=unoapi
  STORAGE_ACCESS_KEY_ID=minioadmin
  STORAGE_SECRET_ACCESS_KEY=minioadmin
  STORAGE_FORCE_PATH_STYLE=true
  ```
- Headless pairing and stricter validation:
  ```env
  CONNECTION_TYPE=pairing_code
  QR_TIMEOUT_MS=120000
  VALIDATE_SESSION_NUMBER=true
  ```

## Ready-to-use examples

- English: /docs/examples/.env.example.en
- PortuguÃªs (Brasil): /docs/pt-BR/exemplos/.env.exemplo


