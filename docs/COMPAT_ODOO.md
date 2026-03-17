# UNO x Odoo Compatibility (Official Connector)

This guide explains how to run UNO in Graph/Cloud-compatible mode for the official Odoo connector while preserving legacy behavior.

For WhatsApp Embedded/Chatwoot-focused setup, use `docs/WHATSAPP_EMBEDDED.md`.

## Backward compatibility kept

- `phoneNumberId` remains the value you already use today (for example: `5566996269251`).
- UNO does not auto-change `phoneNumberId`.
- Legacy routes remain available.

## What is now automated

- `businessAccountId` (WABA ID) is auto-generated when missing.
- Generation is deterministic per session (stable over time).
- This also applies to existing sessions loaded from Redis.

## How automatic WABA generation works

- If `webhookForward.businessAccountId` is empty:
  - UNO generates a numeric Meta-like ID;
  - stores mapping for internal routing;
  - keeps `phoneNumberId` unchanged.

## Prerequisites

- UNO with `REDIS_URL` configured (recommended for session mappings).
- Session already registered in UNO.
- Session auth token or `UNOAPI_AUTH_TOKEN`.

## UNO session setup example

```bash
curl -X POST "https://uno.yourdomain.com/v19.0/5566996269251/register" \
  -H "Authorization: your_admin_token" \
  -H "Content-Type: application/json" \
  -d '{
    "authToken": "client_token",
    "webhookForward": {
      "version": "v19.0",
      "phoneNumberId": "5566996269251",
      "token": "client_token",
      "timeoutMs": 6000
    }
  }'
```

Notes:
- `businessAccountId` can be omitted.
- UNO will generate it automatically when needed.

## Available Graph-like endpoints

- `GET /:version/debug_token`
- `GET /:version/me/whatsapp_business_accounts`
- `GET /:version/:business_account_id/phone_numbers`
- `GET /:version/:business_account_id/message_templates`
- `POST /:version/:business_account_id/message_templates`
- `DELETE /:version/:business_account_id/message_templates/:templateId`
- `POST /:version/:phone_number_id/messages`
- `GET /:version/:media_id`
- `GET /sessions/meta/mappings` (administrative; auth required)

Webhook:
- `GET /webhooks/whatsapp` (verify token/challenge)
- `POST /webhooks/whatsapp` (receive payload)

## Quick smoke test

Set variables:

```bash
UNO_BASE="https://uno.yourdomain.com"
TOKEN="client_token"
PHONE_NUMBER_ID="5566996269251"
```

1) Validate token:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/v19.0/debug_token?input_token=$TOKEN"
```

2) Get WABA IDs:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/v19.0/me/whatsapp_business_accounts"
```

Use returned `id` as `WABA_ID`.

2.1) Inspect resolved mapping (support/admin):

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/sessions/meta/mappings"
```

Example:

```json
{
  "data": [
    {
      "session_phone": "5566996269251",
      "phone_number_id": "5566996269251",
      "business_account_id": "154253852486255"
    }
  ]
}
```

3) List WABA phone numbers:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/v19.0/<WABA_ID>/phone_numbers"
```

4) Send message via `phone_number_id`:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "$UNO_BASE/v19.0/$PHONE_NUMBER_ID/messages" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "5566999999999",
    "type": "text",
    "text": { "body": "UNO + Odoo test" }
  }'
```

## Odoo setup

In Odoo WhatsApp connector (Enterprise):

1. API token: same token configured in UNO.
2. `Phone Number ID`: use your session value (legacy behavior preserved), example `5566996269251`.
3. `WABA ID`: use the value returned by:
   - `GET /v19.0/me/whatsapp_business_accounts`
4. Webhook callback:
   - `https://uno.yourdomain.com/webhooks/whatsapp`
5. Verify token:
   - `UNOAPI_AUTH_TOKEN` (or equivalent verify token).

### Session modal tip (Web Manager)

- `Cloud phone_number_id` auto-fills from session number when empty.
- `Business Account ID` can stay empty.
- On save, UNO auto-generates a stable `businessAccountId` when missing.

## Setup for other Graph-like clients

1. Call `debug_token` to validate token.
2. Discover `WABA_ID` from `me/whatsapp_business_accounts`.
3. Use `WABA_ID` on `phone_numbers` and `message_templates`.
4. Use `phone_number_id` on `messages`.
5. Configure webhook on `/webhooks/whatsapp`.

## Troubleshooting

- Route not found on `/{waba_id}/...`:
  - Ensure you are using `WABA_ID` returned by UNO.
- Empty `WABA_ID`:
  - force session load (`/sessions` or `/:version/:phone`) and retry.
  - check `GET /sessions/meta/mappings`.
- Send failure with token:
  - confirm `Authorization: Bearer <token>` and session `authToken`.
