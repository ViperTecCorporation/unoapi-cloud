---
title: Início rápido
description: Conecte uma sessão, envie a primeira mensagem e valide o webhook em poucos minutos.
---

# Início rápido

Ao final deste guia você terá confirmado a autenticação, uma sessão conectada,
uma mensagem enviada e o caminho de retorno por webhook.

::: tip Já tem uma instalação pronta?
Você precisa apenas da URL da API, do token e de uma sessão conectada. Se ainda
vai instalar o serviço, escolha primeiro um [modo de implantação](/guide/installation).
:::

## Antes de começar

Separe estes quatro valores:

| Variável | Exemplo | O que representa |
| --- | --- | --- |
| `API_URL` | `https://api.seudominio.com` | URL pública da sua instalação, sem barra no final |
| `TOKEN` | `seu-token` | Token configurado na API |
| `SESSION` | `5511999999999` | Número da sessão, somente com dígitos |
| `TO` | `5511912008012` | Destinatário de teste, com DDI e DDD |

Defina-as no terminal para copiar os exemplos sem editar cada URL:

```bash
export API_URL="https://api.seudominio.com"
export TOKEN="seu-token"
export SESSION="5511999999999"
export TO="5511912008012"
```

## 1. Confirme o acesso

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $TOKEN" \
  "$API_URL/sessions"
```

O resultado deve ser HTTP `200` e listar as sessões conhecidas. Um `401`
indica token ausente ou incorreto; erro de DNS, TLS ou conexão deve ser resolvido
no proxy antes de continuar.

## 2. Conecte a sessão

Se `SESSION` ainda não estiver registrada, abra o Socket.IO antes do registro
para não perder o QR Code ou o código de pareamento. O fluxo completo, incluindo
o evento `broadcast`, está em [Conectar uma sessão](/guide/connection).

Considere a sessão pronta somente depois de ela aparecer conectada. Não use uma
segunda instância como proprietária das mesmas credenciais.

## 3. Envie a primeira mensagem

```bash
curl --fail-with-body --request POST \
  --url "$API_URL/v15.0/$SESSION/messages" \
  --header "Authorization: Bearer $TOKEN" \
  --header "Content-Type: application/json" \
  --data "{
    \"messaging_product\": \"whatsapp\",
    \"to\": \"$TO\",
    \"type\": \"text\",
    \"text\": { \"body\": \"Olá! Minha primeira mensagem pelo ViperConnect.\" }
  }"
```

Um envio aceito retorna HTTP `200` com o identificador da mensagem:

```json
{
  "messages": [{ "id": "wamid.HBg..." }]
}
```

Esse retorno confirma que a API aceitou o envio. A entrega final chega depois,
como status no webhook.

## 4. Valide o webhook

O endpoint configurado na sessão deve:

1. aceitar `POST` por HTTPS;
2. validar o token no cabeçalho configurado;
3. responder `2xx` rapidamente;
4. deduplicar por `messages[].id` ou `statuses[].id`;
5. processar tarefas demoradas fora da resposta HTTP.

Fluxo esperado:

```text
seu sistema -> POST /messages -> ViperConnect -> destinatário
seu sistema <- webhook de status <- ViperConnect <- confirmação
seu sistema <- webhook de mensagem <- ViperConnect <- resposta
```

Veja payloads completos e regras de retry em [Receber webhooks](/guide/webhooks).

## 5. Escolha o próximo passo

| Quero... | Próximo guia |
| --- | --- |
| enviar mídia, botões, listas, enquetes ou pedidos | [Enviar mensagens](/guide/messages) |
| entender sessão, identidade, filas e eventos | [Como a API funciona](/guide/concepts) |
| consultar e sincronizar contatos | [Identidades e contatos](/guide/contacts) |
| testar outros endpoints no navegador | [API interativa](/api-reference) |
| diagnosticar uma falha | [Erros e solução de problemas](/guide/troubleshooting) |

