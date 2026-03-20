# UNO x WhatsApp Embedded Compatibility

This guide focuses on WhatsApp Embedded/Meta-like onboarding clients (for example, Chatwoot Embedded flow).

## Scope

UNO provides Graph-like compatibility for the onboarding/runtime calls most Embedded clients require, while preserving UNO legacy behavior.

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
