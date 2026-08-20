---
title: Errors and troubleshooting
description: Fast diagnosis for authentication, sessions, messages, media, webhooks, queues and persistence.
---

# Errors and troubleshooting

Start from the symptom, identify the failed layer and only then change
configuration. Avoid re-pairing or restarting the full stack before collecting
evidence.

## 60-second diagnosis

| Symptom | Check first | Safe next action |
| --- | --- | --- |
| `401 Unauthorized` | `Authorization` header | send `Bearer TOKEN` and verify the installation token |
| `400 Bad Request` | full JSON response | compare the payload with the operation schema and example |
| session will not connect | session state and pairing event | verify persistence, single ownership and connection type |
| HTTP `200`, no delivery | asynchronous status for the same ID | find `failed` and `errors[]` in the webhook |
| webhook is missing | consumer HTTP response | verify DNS, TLS, token, timeout and fast `2xx` response |
| media will not open | media ID and download route | prefer the API proxy instead of direct bucket access |
| video is slow | file size and video-worker queue | inspect backlog and preparation completion |
| recipient not found | `user_id`, phone and identity cache | prefer canonical identity; keep network lookup as fallback |
| session listing is slow | Valkey commands and latency | verify index/SCAN and no blocking full-key scan |

## Preserve the response body

```bash
curl --fail-with-body --request POST \
  --url "$API_URL/v15.0/$SESSION/messages" \
  --header "Authorization: Bearer $TOKEN" \
  --header "Content-Type: application/json" \
  --data @payload.json
```

Record the HTTP status, error text, timestamp, route, session and message ID.
Remove tokens, signed URLs and personal content before sharing logs.

## Pairing and reconnection

- Open Socket.IO before registering a new session.
- Preserve volumes and Valkey state across updates.
- Do not run two owners for the same session.
- Use `deregister` only when credentials should be invalidated.
- If a QR reappears after every restart, investigate persistence first.

See [Connect a session](/en/guide/connection).

## Messages, identities and media

Send `user_id` with the phone when available. Without it, the API checks the
local cache before a network lookup. Correlate identity errors with the
normalized destination and sending session.

For media, verify the webhook ID, MIME type and size; resolve by ID and prefer
the API proxy URL. Base64 requests must use only `base64`, without `link` or
`id`, and stay within the configured limit. Check the dedicated worker for
video preparation delays.

Profile pictures have a separate authenticated route. Listings should use
metadata and cache instead of downloading S3 objects just to build a response.

## Webhooks, Valkey and queues

Webhook consumers must return `2xx` before slow work and deduplicate retries.
For transient failures, inspect attempts, circuit breakers, backlog and the
dead-letter queue.

For infrastructure latency, inspect slow Valkey commands, BGSAVE, swap pressure,
RabbitMQ backlog, unacknowledged messages, timeouts, container restarts and OOM.
Normal session listing should use an index or `SCAN`, not the blocking `KEYS`
command. Do not clean data, disable swap or restart production only to test a
hypothesis.

## Useful support bundle

```text
image version:
timestamp and timezone:
route and HTTP status:
affected session:
message ID:
media or event type:
short error excerpt:
always reproducible or transient:
```

Never include tokens, passwords, session credentials, signed URLs or complete
customer payloads. Use the [interactive API](/en/api-reference) for exact contracts.
