---
title: Como a API funciona
description: O modelo mental mínimo para integrar sessões, identidades, mensagens, mídia e webhooks.
---

# Como a API funciona

Você não precisa conhecer a implementação interna para consumir a API. Estes
cinco conceitos explicam o caminho de uma mensagem e evitam a maior parte dos
erros de integração.

## 1. Uma sessão representa uma conta conectada

O valor `{phone}` das rotas identifica a sessão que envia ou recebe tráfego.
Ele não é necessariamente o destinatário da mensagem.

```http
POST /v15.0/{session}/messages
```

- `{session}`: conta conectada na sua instalação;
- `to`: conversa de destino;
- `version`: versão do contrato HTTP, mantida para compatibilidade.

## 2. O token autentica a instalação

Envie o token em todas as rotas protegidas:

```http
Authorization: Bearer SEU_TOKEN
```

Não coloque tokens em query string, logs ou exemplos públicos. Na
[API interativa](/api-reference), URL e token podem ser alterados localmente
para testar a sua instalação.

## 3. Uma pessoa pode ter mais de uma forma de identidade

O número de telefone é útil para apresentação e compatibilidade. Quando
disponível, `user_id` contém a identidade canônica. `username` é um alias
opcional e nunca substitui sozinho uma identidade resolvida.

Ao enviar, informe tudo o que sua aplicação já conhece:

```json
{
  "to": "5511912008012",
  "user_id": "273877414502425@lid",
  "username": "maria",
  "type": "text",
  "text": { "body": "Olá" }
}
```

A ordem prática é: `user_id` válido, cache local de identidade e, somente
quando necessário, resolução na rede. Veja [Identidades e contatos](/guide/contacts).

## 4. Aceite do envio e entrega são momentos diferentes

O HTTP `200` de `/messages` confirma que a solicitação foi aceita. O estado
final é assíncrono e chega no webhook.

| Momento | Onde observar | O que significa |
| --- | --- | --- |
| solicitação aceita | resposta HTTP | payload válido e envio iniciado |
| enviada | `statuses[].status = sent` | mensagem publicada |
| entregue | `delivered` | chegou ao dispositivo de destino |
| lida ou reproduzida | `read` ou `played` | confirmação do destinatário |
| falha | `failed` com `errors[]` | erro final que deve ser registrado |

Por isso, salve o ID retornado e correlacione-o com os status posteriores.

## 5. Mídia tem origem, persistência e download

No envio, use exatamente uma origem por mídia:

- `link`: a API busca uma URL acessível;
- `id`: reutiliza uma mídia conhecida;
- `base64`: extensão ViperConnect para enviar bytes diretamente.

Quando a Uno persiste uma mídia recebida, o webhook mantém `id` e `url` por
compatibilidade. Consumidores novos devem preferir o `id` e a rota de download
da própria API, evitando dependência direta do bucket.

## O fluxo completo

```text
cliente HTTP
   | autentica, registra e envia
   v
ViperConnect API -> fila -> worker da sessão -> rede
   ^                                         |
   | webhook normalizado                     | eventos e confirmações
   +-----------------------------------------+
```

Trabalho pesado, como preparação de vídeo, pode usar worker dedicado sem
bloquear mensagens comuns. Valkey mantém estado e índices; RabbitMQ transporta
jobs e retries.

## Contrato compatível e extensões

Os payloads principais seguem o formato compatível com Cloud API. Recursos
específicos do ViperConnect, como mídia Base64, são identificados como extensão
e não alteram os formatos existentes por URL ou ID.

Use os guias para aprender o fluxo e a [referência interativa](/api-reference)
para conferir campos, schemas, exemplos e respostas de cada operação.

