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

## Status/Broadcast

- There are no specific environment toggles for Status/Broadcast in this branch.

## Media & Timeouts

- `FETCH_TIMEOUT_MS` — Timeout for media HEAD/download checks. Default per code.
  - Increase when sending large media from slow servers.
  - Example: `FETCH_TIMEOUT_MS=15000`
- `SEND_AUDIO_MESSAGE_AS_PTT` — Mark outgoing audio as PTT (voice note). Default `false`.
- `CONVERT_AUDIO_MESSAGE_TO_OGG` — Convert audio to OGG/Opus when sending PTT. Default `false`.
  - Use when clients expect voice notes with waveform.
  - Example:
    ```env
    SEND_AUDIO_MESSAGE_AS_PTT=true
    CONVERT_AUDIO_MESSAGE_TO_OGG=true
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
