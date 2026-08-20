---
title: Quickstart
description: Connect a session, send the first message and validate the webhook path in a few minutes.
---

# Quickstart

By the end of this guide you will have verified authentication, a connected
session, one outgoing message and the webhook return path.

::: tip Already running ViperConnect?
You only need the API URL, token and a connected session. Otherwise, choose a
[deployment option](/en/guide/installation) first.
:::

## Before you start

| Variable | Example | Meaning |
| --- | --- | --- |
| `API_URL` | `https://api.yourdomain.com` | Public installation URL, without a trailing slash |
| `TOKEN` | `your-token` | Token configured in the API |
| `SESSION` | `15551234567` | Session number, digits only |
| `TO` | `15557654321` | Test recipient, including country code |

```bash
export API_URL="https://api.yourdomain.com"
export TOKEN="your-token"
export SESSION="15551234567"
export TO="15557654321"
```

## 1. Verify access

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $TOKEN" \
  "$API_URL/sessions"
```

Expect HTTP `200`. A `401` means the token is missing or invalid. Resolve DNS,
TLS or connection errors at the edge proxy before continuing.

## 2. Connect the session

For a new session, open Socket.IO before registration so you do not miss the QR
code or pairing-code event. See [Connect a session](/en/guide/connection) for
the complete `broadcast` flow. Send traffic only after the session is connected.

## 3. Send the first message

```bash
curl --fail-with-body --request POST \
  --url "$API_URL/v15.0/$SESSION/messages" \
  --header "Authorization: Bearer $TOKEN" \
  --header "Content-Type: application/json" \
  --data "{
    \"messaging_product\": \"whatsapp\",
    \"to\": \"$TO\",
    \"type\": \"text\",
    \"text\": { \"body\": \"Hello from ViperConnect!\" }
  }"
```

An accepted request returns HTTP `200` and the message identifier:

```json
{
  "messages": [{ "id": "wamid.HBg..." }]
}
```

This confirms acceptance, not final delivery. Delivery updates arrive through
the webhook.

## 4. Validate the webhook

Your configured endpoint should accept HTTPS `POST`, validate its configured
header token, answer `2xx` quickly, deduplicate message/status IDs and move slow
work outside the HTTP response.

```text
your system -> POST /messages -> ViperConnect -> recipient
your system <- status webhook <- ViperConnect <- delivery update
your system <- message webhook <- ViperConnect <- reply
```

See [Receive webhooks](/en/guide/webhooks) for full payloads and retry guidance.

## 5. Choose the next guide

| I want to... | Continue with |
| --- | --- |
| send media, buttons, lists, polls or orders | [Send messages](/en/guide/messages) |
| understand sessions, identities, queues and events | [How the API works](/en/guide/concepts) |
| query and synchronize contacts | [Identities and contacts](/en/guide/contacts) |
| try another endpoint in the browser | [Interactive API](/en/api-reference) |
| diagnose a failure | [Errors and troubleshooting](/en/guide/troubleshooting) |

