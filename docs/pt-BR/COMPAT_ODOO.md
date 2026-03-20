# Compatibilidade UNO x Odoo (Conector Oficial)

Este guia descreve como usar a UNO em modo compatível com API Graph/Cloud para integrar com o conector oficial do Odoo, sem quebrar o comportamento antigo.

Para fluxo focado em WhatsApp Embedded/Chatwoot, use `docs/pt-BR/WHATSAPP_EMBEDDED.md`.

## O que foi mantido para compatibilidade antiga

- `phoneNumberId` continua sendo o valor que você já usa hoje (ex.: `5566996269251`).
- A UNO não altera automaticamente `phoneNumberId`.
- Rotas antigas continuam ativas.

## O que foi automatizado

- `businessAccountId` (WABA ID) é gerado automaticamente quando estiver ausente.
- A geração é determinística por sessão (estável).
- Isso vale para sessões antigas ao carregar configuração no Redis.

## Como funciona a geração automática de WABA ID

- Se `webhookForward.businessAccountId` estiver vazio:
  - a UNO gera um ID numérico (string) Meta-like;
  - grava mapeamento para roteamento interno;
  - mantém `phoneNumberId` como está.

## Pré-requisitos

- UNO com `REDIS_URL` configurado (recomendado para sessões e mapeamentos).
- Sessão já registrada na UNO.
- Token de autenticação da sessão ou `UNOAPI_AUTH_TOKEN`.

## Configuração da sessão UNO (exemplo)

```bash
curl -X POST "https://uno.seudominio.com/v19.0/5566996269251/register" \
  -H "Authorization: seu_token_admin" \
  -H "Content-Type: application/json" \
  -d '{
    "authToken": "token_para_cliente",
    "webhookForward": {
      "version": "v19.0",
      "phoneNumberId": "5566996269251",
      "token": "token_para_cliente",
      "timeoutMs": 6000
    }
  }'
```

Observação:
- `businessAccountId` pode ser omitido.
- A UNO irá gerar automaticamente quando necessário.

## Endpoints Graph-like disponíveis

- `GET /:version/debug_token`
- `GET /:version/me/whatsapp_business_accounts`
- `GET /:version/:business_account_id/phone_numbers`
- `GET /:version/:business_account_id/message_templates`
- `POST /:version/:business_account_id/message_templates`
- `DELETE /:version/:business_account_id/message_templates/:templateId`
- `POST /:version/:phone_number_id/messages`
- `GET /:version/:media_id`
- `GET /sessions/meta/mappings` (administrativo; requer auth)

Webhook:
- `GET /webhooks/whatsapp` (verify token/challenge)
- `POST /webhooks/whatsapp` (recebimento)

## Smoke test rápido

Defina variáveis:

```bash
UNO_BASE="https://uno.seudominio.com"
TOKEN="token_para_cliente"
PHONE_NUMBER_ID="5566996269251"
```

1) Validar token:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/v19.0/debug_token?input_token=$TOKEN"
```

2) Obter WABA IDs:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/v19.0/me/whatsapp_business_accounts"
```

Pegue o `id` retornado e use como `WABA_ID`.

2.1) Ver mapeamentos resolvidos por sessão (suporte/admin):

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/sessions/meta/mappings"
```

Exemplo:

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

3) Listar números do WABA:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$UNO_BASE/v19.0/<WABA_ID>/phone_numbers"
```

4) Enviar mensagem por `phone_number_id`:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "$UNO_BASE/v19.0/$PHONE_NUMBER_ID/messages" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "5566999999999",
    "type": "text",
    "text": { "body": "Teste UNO + Odoo" }
  }'
```

## Configuração no Odoo

No conector WhatsApp do Odoo (Enterprise):

1. Token/API token: use o mesmo token configurado na UNO.
2. `Phone Number ID`: use o valor da sua sessão (comportamento antigo preservado), ex.: `5566996269251`.
3. `WABA ID`: use o ID retornado por:
   - `GET /v19.0/me/whatsapp_business_accounts`
4. Webhook callback:
   - `https://uno.seudominio.com/webhooks/whatsapp`
5. Verify token:
   - `UNOAPI_AUTH_TOKEN` (ou token equivalente configurado para verify).

### Dica para o modal da sessão (Manager Web)

- O campo `Cloud phone_number_id` é preenchido automaticamente com o número da sessão quando estiver vazio.
- O campo `Business Account ID` pode ficar vazio.
- Ao salvar, se `businessAccountId` não existir, a UNO gera automaticamente um ID estável por sessão.

## Configuração em outras aplicações (não Odoo)

Se a aplicação espera Graph-like:

1. Chame `debug_token` para validar token.
2. Descubra `WABA_ID` via `me/whatsapp_business_accounts`.
3. Use `WABA_ID` em `phone_numbers` e `message_templates`.
4. Use `phone_number_id` em `messages`.
5. Configure webhook em `/webhooks/whatsapp`.

## Solução de problemas

- Erro de rota não encontrada em `/{waba_id}/...`:
  - Verifique se está usando o `WABA_ID` retornado pela UNO.
- `WABA_ID` vazio:
  - force o carregamento da sessão (`/sessions` ou `/:version/:phone`) e repita o endpoint de WABA.
  - consulte `GET /sessions/meta/mappings` para confirmar o mapeamento resolvido.
- Envio falha com token:
  - confirme `Authorization: Bearer <token>` e `authToken` da sessão.
