# UNO x WhatsApp Embedded Compatibility

This guide focuses on WhatsApp Embedded/Meta-like onboarding clients (for example, Chatwoot Embedded flow).

## Scope

UNO provides Graph-like compatibility for the onboarding/runtime calls most Embedded clients require, while preserving UNO legacy behavior.

This does not replace the real Meta/Facebook Embedded Signup popup. Clients such as Chatwoot still need real Meta app settings to start the official popup flow unless the client itself is patched to use a UNO-specific fake Embedded flow.

## Implemented compatibility endpoints

- `GET /:version/oauth/access_token` (compat token exchange)
- `GET /:version/debug_token` (includes `granular_scopes.target_ids`)
- `GET /:version/me/whatsapp_business_accounts`
- `GET /:version/:business_account_id/phone_numbers`
- `GET /:version/:phone_number_id?fields=...` (health/status-like payload)
- `POST /:version/:business_account_id/subscribed_apps` (compat no-op success)
- `DELETE /:version/:business_account_id/subscribed_apps` (compat no-op success)
- `POST /:version/:phone_number_id/messages`
- `GET /:version/:media_id`

## Required UNO setup

1. Session is registered.
2. `webhookForward.phoneNumberId` is present (legacy value is supported).
3. `webhookForward.businessAccountId` can be empty; UNO auto-generates a stable value.
4. Authentication token available (`authToken` or `UNOAPI_AUTH_TOKEN`).

## What still comes from Meta

For the official Chatwoot/Meta Embedded Signup UI, these values are still Meta/Facebook values:

- WhatsApp App ID
- WhatsApp App Secret
- WhatsApp Configuration ID
- WhatsApp API Version, for example `v22.0`

UNO does not currently fake the Facebook SDK popup or the Configuration ID validation step. The current compatibility layer starts at the Graph-like API calls that happen after the client has an access token or is configured to call UNO directly.

In practice:

```text
Meta real: opens Embedded popup and provides the initial app/config/code flow.
UNO: answers Graph-like discovery/runtime calls for registered UNO sessions.
```

To simulate the entire Embedded experience without real Meta app settings, the client application would need a UNO-specific/fake Embedded flow.

## How UNO imitates the Meta flow

UNO does not create a real Meta business account. It exposes a Graph-like discovery flow using the sessions already registered in UNO:

1. The Embedded client exchanges a setup code:
   - `GET /v19.0/oauth/access_token?client_id=...&code=...`
   - UNO returns a short-lived local token in the same shape expected from Graph.
2. The client validates/discovers token permissions:
   - `GET /v19.0/debug_token?input_token=<token>`
   - UNO returns `whatsapp_business_management` and `whatsapp_business_messaging` scopes.
   - `granular_scopes.target_ids` contains the generated or configured `businessAccountId`.
3. The client lists WhatsApp Business Accounts:
   - `GET /v19.0/me/whatsapp_business_accounts`
   - UNO scans authorized sessions and returns one `{ id, name }` per session WABA mapping.
   - `name` comes from the session `label` when available.
4. The client lists phone numbers from that business account:
   - `GET /v19.0/<business_account_id>/phone_numbers`
   - UNO resolves `<business_account_id>` back to the real session phone and returns a Meta-like phone object.
5. Runtime calls use Meta IDs:
   - `POST /v19.0/<phone_number_id>/messages`
   - `GET /v19.0/<phone_number_id>?fields=...`
   - `GET /v19.0/<media_id>`

Internally, UNO stores Redis mappings:

```text
phone_number_id -> session_phone
business_account_id -> session_phone
```

If `businessAccountId` is not configured, UNO deterministically generates one from the session phone and `phoneNumberId` when the session config is loaded. `phoneNumberId` itself is never auto-changed.

## Chatwoot Embedded checklist

1. Base URL points to UNO.
2. Use UNO token as API key/bearer where needed.
3. Ensure webhook callback targets UNO:
   - `https://<uno-domain>/webhooks/whatsapp`
4. Validate:
   - `GET /v19.0/debug_token?input_token=<token>`
   - `GET /v19.0/me/whatsapp_business_accounts`
   - `GET /v19.0/<waba_id>/phone_numbers`
   - `GET /v19.0/<phone_number_id>?fields=id,display_phone_number,code_verification_status,throughput,platform_type`

## Smoke test

```bash
UNO_BASE="https://uno.yourdomain.com"
TOKEN="client_token"

curl -sS "$UNO_BASE/v19.0/oauth/access_token?client_id=x&client_secret=y&code=test-code"

curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/v19.0/debug_token?input_token=$TOKEN"

curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/v19.0/me/whatsapp_business_accounts"
```

## Notes

- `subscribed_apps` endpoints are compatibility no-op by design (return success).
- `phoneNumberId` legacy behavior is preserved.
- Use `/sessions/meta/mappings` for support visibility of resolved IDs.
