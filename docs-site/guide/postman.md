# Testar com Postman

A coleção oficial reúne as rotas e os exemplos da referência interativa,
incluindo mensagens, mídias, contatos, grupos, webhooks, telefonia e pagamentos.

[Baixar a coleção ViperConnect para Postman](/examples/ViperConnect.postman_collection.json)

## Importar

1. Baixe o arquivo acima.
2. No Postman, selecione **Import** e escolha o arquivo JSON.
3. Abra a coleção **ViperConnect API** e selecione **Variables**.
4. Preencha `base_url`, `token`, `phone`, `session` e `to`.
5. Salve a coleção antes de enviar a primeira requisição.

Exemplo de variáveis:

| Variável | Exemplo | Uso |
| --- | --- | --- |
| `base_url` | `https://unoapi.exemplo.com` | URL pública da sua instalação, sem barra final |
| `version` | `v15.0` | Prefixo compatível usado nas rotas versionadas |
| `token` | seu token | Autenticação Bearer; não compartilhe nem versione o valor real |
| `phone` | `5511999999999` | Sessão remetente |
| `session` | `5511999999999` | Alias usado por algumas rotas |
| `to` | `5511888888888` | Destinatário dos testes |
| `payment_reference_id` | `payment-test-001` | Referência comum da cobrança e das atualizações |

O token é aplicado automaticamente como `Authorization: Bearer {{token}}`.
O arquivo distribuído nunca contém credencial real.

## Testar o ciclo de pagamento

Na pasta **Mensagens**:

1. Escolha um exemplo de criação, como **PIX dinâmico avulso**.
2. Defina uma `payment_reference_id` nova e envie a cobrança.
3. Espere o webhook de status indicar `sent` ou `delivered`.
4. Execute **Confirmar pagamento e manter pedido em processamento**.
5. Execute **Concluir pedido já pago** quando o atendimento terminar.

A coleção calcula `unix_timestamp` automaticamente antes de cada requisição.
O WhatsApp não valida a liquidação bancária; execute a confirmação somente após
seu banco, gateway ou PSP informar que o pagamento foi capturado.

## Manutenção

A coleção é gerada de `docs/openapi.yaml` pelo comando:

```bash
yarn build:docs
```

Não edite o JSON gerado manualmente. Corrija primeiro o OpenAPI e gere o arquivo
novamente, mantendo a coleção e a referência interativa sincronizadas.
