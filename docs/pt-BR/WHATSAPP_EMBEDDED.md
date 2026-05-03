# Compatibilidade UNO x WhatsApp Embedded

Este guia é focado no fluxo WhatsApp Embedded/Meta-like (por exemplo, Embedded do Chatwoot).

## Escopo

A UNO oferece compatibilidade Graph-like para chamadas de onboarding/runtime usadas por clientes Embedded, mantendo o comportamento legado.

## Endpoints de compatibilidade implementados

- `GET /:version/oauth/access_token` (token exchange compatível)
- `GET /:version/debug_token` (inclui `granular_scopes.target_ids`)
- `GET /:version/me/whatsapp_business_accounts`
- `GET /:version/:business_account_id/phone_numbers`
- `GET /:version/:phone_number_id?fields=...` (payload tipo health/status)
- `POST /:version/:business_account_id/subscribed_apps` (no-op compatível com sucesso)
- `DELETE /:version/:business_account_id/subscribed_apps` (no-op compatível com sucesso)
- `POST /:version/:phone_number_id/messages`
- `GET /:version/:media_id`

## Configuração necessária na UNO

1. Sessão registrada.
2. `webhookForward.phoneNumberId` preenchido (valor legado é aceito).
3. `webhookForward.businessAccountId` pode ficar vazio; a UNO gera automaticamente valor estável.
4. Token de autenticação disponível (`authToken` ou `UNOAPI_AUTH_TOKEN`).

## Checklist para Chatwoot Embedded

1. Base URL apontando para a UNO.
2. Token da UNO usado como API key/bearer onde aplicável.
3. Webhook callback apontando para:
   - `https://<dominio-uno>/webhooks/whatsapp`
4. Validação:
   - `GET /v19.0/debug_token?input_token=<token>`
   - `GET /v19.0/me/whatsapp_business_accounts`
   - `GET /v19.0/<waba_id>/phone_numbers`
   - `GET /v19.0/<phone_number_id>?fields=id,display_phone_number,code_verification_status,throughput,platform_type`

## Smoke test

```bash
UNO_BASE="https://uno.seudominio.com"
TOKEN="token_para_cliente"

curl -sS "$UNO_BASE/v19.0/oauth/access_token?client_id=x&client_secret=y&code=test-code"

curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/v19.0/debug_token?input_token=$TOKEN"

curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/v19.0/me/whatsapp_business_accounts"
```

## Observações

- Endpoints `subscribed_apps` são no-op de compatibilidade (retornam sucesso).
- Comportamento legado de `phoneNumberId` foi preservado.
- Use `/sessions/meta/mappings` para suporte e auditoria dos IDs resolvidos.
