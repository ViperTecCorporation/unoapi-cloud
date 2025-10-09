# Environment Variables — Reference and Examples

This guide explains key environment variables, when to use them, and why. Copy `.env.example` to `.env` and adjust for your setup.

## Core Server

- `PORT` — HTTP port. Default `9876`.
  - Use when running multiple services or behind a reverse proxy.
  - Example: `PORT=8080`
- `BASE_URL` — Public base URL used to compose media links in responses.
  - Use when your service is behind a proxy/CDN and clients download media via a public URL.
  - Example: `BASE_URL=https://api.example.com`

## Session & Connection

- `CONNECTION_TYPE` — `qrcode` | `pairing_code`. Default `qrcode`.
  - Use `pairing_code` for headless pairing without showing QR.
  - Example: `CONNECTION_TYPE=pairing_code`
- `QR_TIMEOUT_MS` — Time to wait for QR scan. Default `60000`.
  - Increase on slow pairing scenarios.
  - Example: `QR_TIMEOUT_MS=120000`
- `VALIDATE_SESSION_NUMBER` — Ensure configured phone matches session. Default `false`.
  - Use `true` to prevent cross-session mismatches.
  - Example: `VALIDATE_SESSION_NUMBER=true`
- `CLEAN_CONFIG_ON_DISCONNECT` — Clean saved configs when disconnecting. Default `false`.
  - Use to force a fresh state on disconnect.
  - Example: `CLEAN_CONFIG_ON_DISCONNECT=true`

## Logging

- `LOG_LEVEL` — Unoapi service log level. Default `warn`.
  - Use `debug` during development.
  - Example: `LOG_LEVEL=debug`
- `UNO_LOG_LEVEL` — Internal Uno logger override (falls back to LOG_LEVEL).
  - Example: `UNO_LOG_LEVEL=info`

## Redis & RabbitMQ

- `REDIS_URL` — Redis connection string.
  - Use to enable Redis store (sessions/data). Without it, filesystem store is used.
  - Example: `REDIS_URL=redis://localhost:6379`
- `AMQP_URL` — RabbitMQ URL for broker features.
  - Use to enable queue processing (web/worker model, retries, dead letters).
  - Example: `AMQP_URL=amqp://guest:guest@localhost:5672?frameMax=8192`

## Storage (S3/MinIO)

- `STORAGE_ENDPOINT` — S3-compatible endpoint.
- `STORAGE_REGION` — S3 region (e.g., `us-east-1`).
- `STORAGE_BUCKET_NAME` — Bucket name for media.
- `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` — Credentials.
- `STORAGE_FORCE_PATH_STYLE` — `true` for MinIO/compatibility.
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

- `STATUS_ALLOW_LID` — Allow LID JIDs in status recipients. Default `true`.
  - Set `false` to normalize to PN (`@s.whatsapp.net`) for consistency.
  - Example: `STATUS_ALLOW_LID=false`
- `STATUS_BROADCAST_ENABLED` — Enable Status (status@broadcast) sending. Default `true`.
  - Set `false` to block any outgoing Status before reaching WhatsApp (useful to avoid account risk).
  - Example: `STATUS_BROADCAST_ENABLED=false`

## Group Sending

- `GROUP_SEND_MEMBERSHIP_CHECK` — Warn if not a group member. Default `true`.
- `GROUP_SEND_PREASSERT_SESSIONS` — Pre-assert sessions for participants. Default `true`.
- `GROUP_SEND_ADDRESSING_MODE` — Prefer `pn` or `lid`. Default unset (auto).
- `GROUP_SEND_FALLBACK_ORDER` — Fallback order on ack 421, e.g., `pn,lid`. Default `pn,lid`.
  - Use to improve reliability in groups under network/device quirks.
  - Example: `GROUP_SEND_ADDRESSING_MODE=pn`

Reliability note:
- On a rare libsignal error “No sessions” during group sends, the service now re-asserts sessions for all group participants and retries the send once automatically.

## LID/PN Mapping Cache

- `JIDMAP_CACHE_ENABLED` — Enable PN↔LID cache. Default `true`.
  - Stores per‑session mapping between LID JIDs and PN JIDs to reduce runtime lookups and improve delivery in large groups.
  - Example: `JIDMAP_CACHE_ENABLED=true`
- `JIDMAP_TTL_SECONDS` — TTL for cache entries. Default `604800` (7 days).
  - Example: `JIDMAP_TTL_SECONDS=604800`

## Anti‑Spam / Rate Limits

- `RATE_LIMIT_GLOBAL_PER_MINUTE` — Max messages per minute per session. Default `0` (disabled).
  - Example: `RATE_LIMIT_GLOBAL_PER_MINUTE=60`
- `RATE_LIMIT_PER_TO_PER_MINUTE` — Max messages per minute per destination (per session). Default `0` (disabled).
  - Example: `RATE_LIMIT_PER_TO_PER_MINUTE=20`
- `RATE_LIMIT_BLOCK_SECONDS` — Suggested delay (in seconds) when limits are exceeded. Default `60`.
  - When a limit is hit, the API schedules the send via RabbitMQ with this delay instead of returning HTTP 429.
  - Example: `RATE_LIMIT_BLOCK_SECONDS=60`

## Webhooks / Queues / Retries

- `UNOAPI_MESSAGE_RETRY_LIMIT` — Max delivery attempts in AMQP consumers before dead‑letter. Default `5`.
  - Example: `UNOAPI_MESSAGE_RETRY_LIMIT=7`
- `UNOAPI_MESSAGE_RETRY_DELAY` — Default delay used by helpers when publishing delayed messages (ms). Default `10000`.
  - Note: the consumer retry path uses a fixed 60s requeue delay.
  - Example: `UNOAPI_MESSAGE_RETRY_DELAY=15000`
- `CONSUMER_TIMEOUT_MS` — Max time (ms) allowed for a consumer to process a message before forcing retry. Default `360000`.
  - Example: `CONSUMER_TIMEOUT_MS=180000`
- `NOTIFY_FAILED_MESSAGES` — Send a diagnostic text to the session number when retries are exhausted. Default `true`.
  - Example: `NOTIFY_FAILED_MESSAGES=false`

## Media & Timeouts

- `FETCH_TIMEOUT_MS` — Timeout for media HEAD/download checks. Default per code.
  - Increase when sending large media from slow servers.
  - Example: `FETCH_TIMEOUT_MS=15000`
- `SEND_AUDIO_MESSAGE_AS_PTT` — Mark outgoing audio as PTT (voice note). Default `false`.
- `CONVERT_AUDIO_TO_PTT` — Force conversion to OGG/Opus for PTT. Default `false`.
  - Use when clients expect voice notes with waveform.
  - Example:
    ```env
    SEND_AUDIO_MESSAGE_AS_PTT=true
    CONVERT_AUDIO_TO_PTT=true
    ```

## Proxy

- `PROXY_URL` — SOCKS/HTTP proxy for Baileys.
  - Use when outbound connections must go through a proxy.
  - Example: `PROXY_URL=socks5://user:pass@proxy.local:1080`

## Webhooks & Notifications

- `WEBHOOK_SESSION` — Receive session notifications (QR, status) via HTTP.
  - Use to integrate with external systems (e.g., show QR in another UI).
  - Example: `WEBHOOK_SESSION=https://hooks.example.com/uno/session`

## Voice Calls

- `WAVOIP_TOKEN` — Enable voice-calls-baileys.
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
- Português (Brasil): /docs/pt-BR/exemplos/.env.exemplo
