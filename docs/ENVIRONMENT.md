# Environment Variables Ã¢â‚¬â€ Reference and Examples

This guide explains key environment variables, when to use them, and why. Copy `.env.example` to `.env` and adjust for your setup.

## Core Server

- `PORT` Ã¢â‚¬â€ HTTP port. Default `9876`.
  - Use when running multiple services or behind a reverse proxy.
  - Example: `PORT=8080`
- `BASE_URL` Ã¢â‚¬â€ Public base URL used to compose media links in responses.
  - Use when your service is behind a proxy/CDN and clients download media via a public URL.
  - Example: `BASE_URL=https://api.example.com`

## Session & Connection

- `CONNECTION_TYPE` Ã¢â‚¬â€ `qrcode` | `pairing_code`. Default `qrcode`.
  - Use `pairing_code` for headless pairing without showing QR.
  - Example: `CONNECTION_TYPE=pairing_code`
- `QR_TIMEOUT_MS` Ã¢â‚¬â€ Time to wait for QR scan. Default `60000`.
  - Increase on slow pairing scenarios.
  - Example: `QR_TIMEOUT_MS=120000`
- `VALIDATE_SESSION_NUMBER` Ã¢â‚¬â€ Ensure configured phone matches session. Default `false`.
  - Use `true` to prevent cross-session mismatches.
  - Example: `VALIDATE_SESSION_NUMBER=true`
- `CLEAN_CONFIG_ON_DISCONNECT` Ã¢â‚¬â€ Clean saved configs when disconnecting. Default `false`.
  - Use to force a fresh state on disconnect.
  - Example: `CLEAN_CONFIG_ON_DISCONNECT=true`

## Logging

- `LOG_LEVEL` Ã¢â‚¬â€ Unoapi service log level. Default `warn`.
  - Use `debug` during development.
  - Example: `LOG_LEVEL=debug`
- `UNO_LOG_LEVEL` Ã¢â‚¬â€ Internal Uno logger override (falls back to LOG_LEVEL).
  - Example: `UNO_LOG_LEVEL=info`

## Redis & RabbitMQ

- `REDIS_URL` Ã¢â‚¬â€ Redis connection string.
  - Use to enable Redis store (sessions/data). Without it, filesystem store is used.
  - Example: `REDIS_URL=redis://localhost:6379`
- `AMQP_URL` Ã¢â‚¬â€ RabbitMQ URL for broker features.
  - Use to enable queue processing (web/worker model, retries, dead letters).
  - Example: `AMQP_URL=amqp://guest:guest@localhost:5672?frameMax=8192`

## Storage (S3/MinIO)

- `STORAGE_ENDPOINT` Ã¢â‚¬â€ S3-compatible endpoint.
- `STORAGE_REGION` Ã¢â‚¬â€ S3 region (e.g., `us-east-1`).
- `STORAGE_BUCKET_NAME` Ã¢â‚¬â€ Bucket name for media.
- `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` Ã¢â‚¬â€ Credentials.
- `STORAGE_FORCE_PATH_STYLE` Ã¢â‚¬â€ `true` for MinIO/compatibility.
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

- `STATUS_ALLOW_LID` Ã¢â‚¬â€ Allow LID JIDs in status recipients. Default `true`.
  - Set `false` to normalize to PN (`@s.whatsapp.net`) for consistency.
  - Example: `STATUS_ALLOW_LID=false`
- `STATUS_BROADCAST_ENABLED` Ã¢â‚¬â€ Enable Status (status@broadcast) sending. Default `true`.
  - Set `false` to block any outgoing Status before reaching WhatsApp (useful to avoid account risk).
  - Example: `STATUS_BROADCAST_ENABLED=false`

## Group Sending

- `GROUP_SEND_MEMBERSHIP_CHECK` Ã¢â‚¬â€ Warn if not a group member. Default `true`.
- `GROUP_SEND_PREASSERT_SESSIONS` Ã¢â‚¬â€ Pre-assert sessions for participants. Default `true`.
- `GROUP_SEND_ADDRESSING_MODE` Ã¢â‚¬â€ Prefer `pn` or `lid`. Default unset (treated as LID by default).
- `GROUP_SEND_FALLBACK_ORDER` Ã¢â‚¬â€ Fallback order on ack 421, e.g., `pn,lid`. Default `pn,lid`.
  - Use to improve reliability in groups under network/device quirks.
  - Example: `GROUP_SEND_ADDRESSING_MODE=pn`

## ACK-retry (server-ack resend)

- `ACK_RETRY_ENABLED` — Enable/disable scheduling of ACK-retry. Default `true`.
  - Set `false` to disable the resend attempts triggered by server-ack only.
- `ACK_RETRY_DELAYS_MS` — Comma-separated delays (ms) between retries. Default `8000,30000,60000`.
- `ACK_RETRY_MAX_ATTEMPTS` — Optional hard cap for attempts. If > 0, limits retries to this number.

Example:
```
ACK_RETRY_ENABLED=false
# Or keep enabled and reduce attempts
# ACK_RETRY_MAX_ATTEMPTS=1
```

## One‑to‑One (Direct) Sending

- `ONE_TO_ONE_ADDRESSING_MODE` — Prefer addressing for direct chats. `pn` | `lid`. Default `pn`.
  - `pn`: send using phone‑number JID (`@s.whatsapp.net`). Avoids split threads in some clients (iPhone).
  - `lid`: prefer LID (`@lid`) when mapping exists; may reduce first‑contact session issues.
- `ONE_TO_ONE_PREASSERT_ENABLED` — Pre‑assert Signal sessions for the peer before sending. Default `true`.
  - Improves reliability in the first message after long idle periods or device changes.
- `ONE_TO_ONE_PREASSERT_COOLDOWN_MS` — Per‑recipient cooldown for pre‑assert (milliseconds). Default `7200000` (120 minutes).
  - Reduces CPU/Redis usage by not pre‑asserting on every message to the same contact.
- `ONE_TO_ONE_ASSERT_PROBE_ENABLED` — When `true`, log a Redis key count probe after pre‑assert (observability only). Default `false`.
  - Leave `false` to avoid extra Redis scans in production.

Example:
```env
# Prefer PN for 1:1 and pre‑assert at most once every 2 hours per recipient
ONE_TO_ONE_ADDRESSING_MODE=pn
ONE_TO_ONE_PREASSERT_ENABLED=true
ONE_TO_ONE_PREASSERT_COOLDOWN_MS=7200000
# Keep probe disabled to save Redis
ONE_TO_ONE_ASSERT_PROBE_ENABLED=false
```

Large groups (No-sessions mitigation & throttles)
- `GROUP_LARGE_THRESHOLD` Ã¢â‚¬â€ Consider a group as Ã¢â‚¬Å“largeÃ¢â‚¬Â when participant count exceeds this threshold. Default `800`.
  - When large, the client skips heavy preÃ¢â‚¬â€˜asserts to reduce load. Addressing remains LID by default (unless configured), and fallback toggles addressing according to `GROUP_SEND_FALLBACK_ORDER` if needed.
  - Example: `GROUP_LARGE_THRESHOLD=1000`
- `GROUP_ASSERT_CHUNK_SIZE` Ã¢â‚¬â€ Chunk size for `assertSessions()` in group fallbacks. Default `100` (min 20).
  - Example: `GROUP_ASSERT_CHUNK_SIZE=80`
- `GROUP_ASSERT_FLOOD_WINDOW_MS` Ã¢â‚¬â€ Flood window to avoid repeated heavy asserts per group. Default `5000`.
  - Example: `GROUP_ASSERT_FLOOD_WINDOW_MS=10000`
- `NO_SESSION_RETRY_BASE_DELAY_MS` Ã¢â‚¬â€ Base delay before retrying send after asserts. Default `150`.
- `NO_SESSION_RETRY_PER_200_DELAY_MS` Ã¢â‚¬â€ Extra delay per 200 targets. Default `300`.
- `NO_SESSION_RETRY_MAX_DELAY_MS` Ã¢â‚¬â€ Cap for adaptive delay. Default `2000`.
  - Example: `NO_SESSION_RETRY_BASE_DELAY_MS=250`, `NO_SESSION_RETRY_PER_200_DELAY_MS=400`, `NO_SESSION_RETRY_MAX_DELAY_MS=3000`
- `RECEIPT_RETRY_ASSERT_COOLDOWN_MS` Ã¢â‚¬â€ Cooldown between asserts triggered by `message-receipt.update` retry per group. Default `15000`.
- `RECEIPT_RETRY_ASSERT_MAX_TARGETS` Ã¢â‚¬â€ Limit targets for receipt-based asserts. Default `400`.

## Server ACK Retry (assert + resend)

- `ACK_RETRY_DELAYS_MS` Ã¢â‚¬â€ Comma-separated delays in milliseconds for retries when no server ACK is observed. Default `8000,30000,60000` (8s, 30s, 60s).
  - Example: `ACK_RETRY_DELAYS_MS=5000,15000,45000`
- `ACK_RETRY_MAX_ATTEMPTS` Ã¢â‚¬â€ Hard cap on number of attempts. Default `0` (use the number of entries from `ACK_RETRY_DELAYS_MS`).
  - Example: `ACK_RETRY_MAX_ATTEMPTS=2`

Reliability note:
- On a rare libsignal error Ã¢â‚¬Å“No sessionsÃ¢â‚¬Â during group sends, the service reÃ¢â‚¬â€˜asserts sessions (chunked) and retries once. If it still fails, it toggles addressing mode following `GROUP_SEND_FALLBACK_ORDER` and tries again.

### Group receipt/status fan-out controls

When groups get large, per-recipient receipts (read/played/delivered per participant) can flood your webhook/socket. These toggles reduce event fanÃ¢â‚¬â€˜out while preserving a single groupÃ¢â‚¬â€˜level delivery signal.

- `GROUP_IGNORE_INDIVIDUAL_RECEIPTS` Ã¢â‚¬â€ Suppress `message-receipt.update` per participant for group messages. Default `true`.
  - Set `false` to receive perÃ¢â‚¬â€˜user read/played/delivery receipts in groups.
- `GROUP_ONLY_DELIVERED_STATUS` Ã¢â‚¬â€ On `messages.update` for groups, forward only `DELIVERY_ACK` (delivered). Default `true`.
  - Set `false` to forward all status updates (including read/played) for groups.
- `UNOAPI_META_GROUPS_ENABLED` - Enables the Meta-like group API shape, group details route, and group management endpoints. Default `false`.
  - Group management uses the local Baileys client when available; AMQP deployments use a synchronous RPC command to the session owner.

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

- ONE_TO_ONE_ADDRESSING_MODE â€” Prefer addressing mode for direct chats (1:1). Default pn.
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
- WEBHOOK_PREFER_PN_OVER_LID â€” If 	rue (default), webhook payloads prefer PN in wa_id, rom and 
ecipient_id when safely resolvable; otherwise a LID/JID may be returned.## LID/PN Mapping Cache

- `JIDMAP_CACHE_ENABLED` Ã¢â‚¬â€ Enable PNÃ¢â€ â€LID cache. Default `true`.
  - Stores perÃ¢â‚¬â€˜session mapping between LID JIDs and PN JIDs to reduce runtime lookups and improve delivery in large groups.

## Session Self‑Heal & Periodic Assert

- `SELFHEAL_ASSERT_ON_DECRYPT` — When `true` (default), asserts sessions for the remote participant when inbound messages arrive without decryptable content (e.g., only `senderKeyDistributionMessage`).
- `PERIODIC_ASSERT_ENABLED` — Periodically assert sessions for recent contacts (default `true`).
- `PERIODIC_ASSERT_INTERVAL_MS` — Interval between periodic asserts (default `600000`).
- `PERIODIC_ASSERT_MAX_TARGETS` — Max recent contacts per batch (default `200`).
- `PERIODIC_ASSERT_RECENT_WINDOW_MS` — Only contacts seen within this window are considered (default `3600000`).

Example:
```env
SELFHEAL_ASSERT_ON_DECRYPT=true
PERIODIC_ASSERT_ENABLED=true
PERIODIC_ASSERT_INTERVAL_MS=600000
PERIODIC_ASSERT_MAX_TARGETS=200
PERIODIC_ASSERT_RECENT_WINDOW_MS=3600000
```
  - Example: `JIDMAP_CACHE_ENABLED=true`
- `JIDMAP_TTL_SECONDS` Ã¢â‚¬â€ TTL for cache entries. Default `604800` (7 days).
  - Example: `JIDMAP_TTL_SECONDS=604800`
  - Set `0` or a negative value to keep mappings without expiration.

- `JIDMAP_ENRICH_ENABLED` ? Background enrich (sweep) for JIDMAP. Default `false`.
  - Keep `false` when on-the-fly mapping during send/receive is enough.
- `JIDMAP_ENRICH_AUTH_ENABLED` ? Background enrich from auth lid-mapping cache. Default `true`.
  - Requires Redis; enable only if you want periodic backfill.

## LID/PN Behavior

- Webhooks prefer PN. When PN cannot be resolved safely, LID/JID is returned as a fallback.
- Internally, the API uses LID when available for 1:1 and groups. For 1:1, PNÃ¢â€ â€™LID mappings are learned on-the-fly (assertSessions/exists, and events).
- Profile pictures are stored and retrieved by canonical PN and, when known, by stable LID/user id as separate keys (same for S3 keys), so PN and BSUID lookups can both resolve the image.

## AntiÃ¢â‚¬â€˜Spam / Rate Limits

- `RATE_LIMIT_GLOBAL_PER_MINUTE` Ã¢â‚¬â€ Max messages per minute per session. Default `0` (disabled).
  - Example: `RATE_LIMIT_GLOBAL_PER_MINUTE=60`
- `RATE_LIMIT_PER_TO_PER_MINUTE` Ã¢â‚¬â€ Max messages per minute per destination (per session). Default `0` (disabled).
  - Example: `RATE_LIMIT_PER_TO_PER_MINUTE=20`
- `RATE_LIMIT_BLOCK_SECONDS` Ã¢â‚¬â€ Suggested delay (in seconds) when limits are exceeded. Default `60`.
  - When a limit is hit, the API schedules the send via RabbitMQ with this delay instead of returning HTTP 429.
  - Example: `RATE_LIMIT_BLOCK_SECONDS=60`

## Webhooks / Queues / Retries

- `UNOAPI_MESSAGE_RETRY_LIMIT` Ã¢â‚¬â€ Max delivery attempts in AMQP consumers before deadÃ¢â‚¬â€˜letter. Default `5`.
  - Example: `UNOAPI_MESSAGE_RETRY_LIMIT=7`
- `UNOAPI_MESSAGE_RETRY_DELAY` Ã¢â‚¬â€ Default delay used by helpers when publishing delayed messages (ms). Default `10000`.
  - Note: the consumer retry path uses a fixed 60s requeue delay.
  - Example: `UNOAPI_MESSAGE_RETRY_DELAY=15000`
- `CONSUMER_TIMEOUT_MS` Ã¢â‚¬â€ Max time (ms) allowed for a consumer to process a message before forcing retry. Default `15000`.
  - Example: `CONSUMER_TIMEOUT_MS=15000`
- `NOTIFY_FAILED_MESSAGES` Ã¢â‚¬â€ Send a diagnostic text to the session number when retries are exhausted. Default `true`.
  - Example: `NOTIFY_FAILED_MESSAGES=false`

## Webhook Delivery (Async)

- `WEBHOOK_ASYNC` ÇŸ¶½Ç½ƒ?s¶ªÇ½ƒ'ª¶? Send webhooks in background (fire-and-forget). Default `true`.
  - Use `false` to block the request until all webhooks finish.
- `WEBHOOK_ASYNC_MODE` ÇŸ¶½Ç½ƒ?s¶ªÇ½ƒ'ª¶? Async delivery backend. Default `amqp`.
  - `amqp`: enqueue webhooks in RabbitMQ (recommended in production). Requires `AMQP_URL`.
  - When `AMQP_URL` is missing, the service falls back to direct HTTP send and logs a warning.

## Webhook Circuit Breaker

Fail fast when a webhook endpoint is offline to avoid queue backlog.

- `WEBHOOK_CB_ENABLED` — Enable/disable the circuit breaker. Default `true`.
- `WEBHOOK_CB_FAILURE_THRESHOLD` — Failures within the window required to open the circuit. Default `1`.
- `WEBHOOK_CB_FAILURE_TTL_MS` — Failure counting window (ms). Default `300000`.
- `WEBHOOK_CB_OPEN_MS` — How long the circuit stays open (skip sends) after tripping. Default `120000`.
- `WEBHOOK_CB_REQUEUE_DELAY_MS` — Delay (ms) used to requeue when the circuit is open. Default `300000`.
- `WEBHOOK_CB_LOCAL_CLEANUP_INTERVAL_MS` — Local CB map cleanup interval (ms). Default `3600000`.

Behavior:
- When open, webhook delivery is skipped for that endpoint.
- After the open window, sends are attempted again automatically.
- When open, the message is requeued with a longer delay to avoid retry storms.

## Media & Timeouts

### Inbound deduplication

Some providers/devices may occasionally emit the same WA message more than once during reconnects or history sync. Use the window below to suppress duplicates quickly arriving backÃ¢â‚¬â€˜toÃ¢â‚¬â€˜back.

- `INBOUND_DEDUP_WINDOW_MS` Ã¢â‚¬â€ Skip processing a message if another with the same `remoteJid` and `id` arrives within this window (ms). Default `7000`.
  - Example: `INBOUND_DEDUP_WINDOW_MS=5000`

### Baileys app-state sync

- `BAILEYS_CLEAR_APP_STATE_SYNC_ON_CONNECT` - Clears Baileys `app-state-sync-version` before each connect. Default `false`.
  - Keep disabled in normal operation because clearing it forces WhatsApp/Baileys to rebuild app-state snapshots and can increase memory/CPU during reconnect storms.
  - Enable only as an emergency self-heal when logs show stale app-state decode failures such as `failed to find key to decode mutation`.
- `BAILEYS_ALLOW_FULL_HISTORY_SYNC` - Forces Baileys `FULL`, `INITIAL_BOOTSTRAP`, and `ON_DEMAND` history sync even when the session already has the Redis history-sync marker. Default `false`.
  - New unmarked sessions can still do their first full/bootstrap sync when `IGNORE_HISTORY_MESSAGES=false`.
  - Uno writes `unoapi-history-sync:<phone>:started` when heavy history sync starts, and later reconnects skip heavy sync for that same session unless this flag is enabled.
- `AUTO_CONNECT_CONCURRENCY` - Maximum sessions connecting in parallel during service startup. Default `1`.
  - Keep low on small containers to avoid reconnect storms and memory spikes.

### Outgoing idempotency

Skip sending the same message again when a job retry happens after a successful send.

- `OUTGOING_IDEMPOTENCY_ENABLED` Ã¢â‚¬â€ When `true` (default), the incoming job checks the store (key/status) for the UNO id before sending; if it looks processed, it skips the send.
  - Example: `OUTGOING_IDEMPOTENCY_ENABLED=false` (to disable)

### Webhook payload size

- `WEBHOOK_INCLUDE_MEDIA_DATA` ÇŸ¶½Ç½ƒ?s¶ªÇ½ƒ'ª¶? Include media binary/base64 in webhook payloads. Default `false`.
  - When `false`, payloads keep `url` and `filename` but remove heavy binary/base64 fields.

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
- Anti-regression/duplicate: ignore lower-rank updates (e.g., Ã¢â‚¬Å“sentÃ¢â‚¬Â after Ã¢â‚¬Å“deliveredÃ¢â‚¬Â) and repeated statuses for the same message id.

## Profile Pictures

- Overview: The service can enrich webhook payloads with contact and group profile pictures. When enabled, images are stored either on S3 (recommended in production) or on the local filesystem and exposed as URLs in webhook events.

- Enable/disable
  - `SEND_PROFILE_PICTURE` Ã¢â‚¬â€ Include profile pictures in webhook payloads. Default `true`.

- Storage backends
  - S3 (preferred): enabled when `STORAGE_ENDPOINT` is set. Uses `@aws-sdk/client-s3` with credentials from `STORAGE_*` envs. Files are written as `<phone>/profile-pictures/<pn>.jpg` and also `<phone>/profile-pictures/<lid>.jpg` when a stable LID/user id is known; groups use the group JID.
  - Filesystem: default when no S3 endpoint is configured. Files are stored under `<baseStore>/medias/<phone>/profile-pictures/<pn-or-lid>.jpg`.

- URLs returned to webhooks
  - S3: A preÃ¢â‚¬â€˜signed URL is generated per request using `DATA_URL_TTL` (seconds). Link expires after TTL.
  - Filesystem: A public URL is generated from `BASE_URL`, using the download route: `BASE_URL/v15.0/download/<phone>/profile-pictures/<canonical>.jpg`.
  - First fetch: on the very first retrieval the service may return the WhatsApp CDN URL while it downloads and persists the image; subsequent events will use the storage URL (S3 or filesystem).

- Lifetime and cleanup
  - `DATA_TTL` Ã¢â‚¬â€ Default retention for stored media (including profile pictures) in seconds. Default 30 days.
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

- `FETCH_TIMEOUT_MS` Ã¢â‚¬â€ Timeout for media HEAD/download checks. Default per code.
  - Increase when sending large media from slow servers.
  - Example: `FETCH_TIMEOUT_MS=15000`
- `SEND_AUDIO_MESSAGE_AS_PTT` Ã¢â‚¬â€ Mark outgoing audio as PTT (voice note). Default `false`.
- `CONVERT_AUDIO_TO_PTT` Ã¢â‚¬â€ Force conversion to OGG/Opus for PTT. Default `false`.
  - Use when clients expect voice notes with waveform.
  - Example:
    ```env
    SEND_AUDIO_MESSAGE_AS_PTT=true
    CONVERT_AUDIO_TO_PTT=true
    ```

## Proxy

- `PROXY_URL` Ã¢â‚¬â€ SOCKS/HTTP proxy for Baileys.
  - Use when outbound connections must go through a proxy.
  - Example: `PROXY_URL=socks5://user:pass@proxy.local:1080`

## Webhooks & Notifications

- `WEBHOOK_SESSION` Ã¢â‚¬â€ Receive session notifications (QR, status) via HTTP.
  - Use to integrate with external systems (e.g., show QR in another UI).
  - Example: `WEBHOOK_SESSION=https://hooks.example.com/uno/session`

## VoIP Helper Service

English:

- `VOIP_SERVICE_URL` — Base URL of the helper VoIP service used by UnoAPI to forward call events. Optional.
  - Example: `VOIP_SERVICE_URL=http://localhost:3097`
- `VOIP_SERVICE_TOKEN` — Shared Bearer token sent by UnoAPI to authenticate against the helper VoIP service.
  - Example: `VOIP_SERVICE_TOKEN=change-me`
- `VOIP_SERVICE_TIMEOUT_MS` — Timeout in milliseconds for requests from UnoAPI to the helper VoIP service. Default `3000`.
  - Example: `VOIP_SERVICE_TIMEOUT_MS=3000`

Português:

- `VOIP_SERVICE_URL` — URL base do serviço auxiliar de VoIP usado pela UnoAPI para encaminhar eventos de chamada. Opcional.
  - Exemplo: `VOIP_SERVICE_URL=http://localhost:3097`
- `VOIP_SERVICE_TOKEN` — Token Bearer compartilhado que a UnoAPI envia para autenticar no serviço auxiliar de VoIP.
  - Exemplo: `VOIP_SERVICE_TOKEN=change-me`
- `VOIP_SERVICE_TIMEOUT_MS` — Timeout em milissegundos das requisições da UnoAPI para o serviço auxiliar de VoIP. Padrão `3000`.
  - Exemplo: `VOIP_SERVICE_TIMEOUT_MS=3000`

## Voice Calls

- `WAVOIP_TOKEN` Ã¢â‚¬â€ Enable voice-calls-baileys.
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
- PortuguÃƒÂªs (Brasil): /docs/pt-BR/exemplos/.env.exemplo



### Id Mapping (Baileys -> Unoapi)

To keep a stable Unoapi id for the same Baileys message under retries or concurrent consumers, the service uses a Redis SET NX guard when persisting idBaileys -> idUno. This prevents multiple unoapi-id_rev entries for the same message when races occur.
