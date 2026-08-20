---
title: Erros e solução de problemas
description: Diagnóstico rápido de autenticação, conexão, mensagens, mídia, webhooks, filas e persistência.
---

# Erros e solução de problemas

Comece pelo sintoma, confirme a camada que falhou e só então altere a
configuração. Evite refazer o pareamento ou reiniciar toda a stack antes de
identificar a causa.

## Diagnóstico em 60 segundos

| Sintoma | Confirme primeiro | Próxima ação segura |
| --- | --- | --- |
| `401 Unauthorized` | cabeçalho `Authorization` | envie `Bearer TOKEN` e confira o token da instalação |
| `400 Bad Request` | corpo JSON da resposta | compare o payload com o schema e o exemplo da operação |
| sessão não conecta | estado da sessão e evento de pareamento | confira persistência, proprietário único e tipo de conexão |
| HTTP `200`, mas não entregou | status assíncrono do mesmo ID | procure `failed` e `errors[]` no webhook |
| webhook não chega | resposta HTTP do consumidor | valide DNS, TLS, token, timeout e retorno `2xx` rápido |
| mídia não abre | ID e rota de download | prefira o proxy da API; não dependa do bucket diretamente |
| vídeo demora | tamanho e fila do worker de vídeo | verifique backlog e conclusão da preparação |
| destinatário não encontrado | `user_id`, telefone e cache de identidade | use a identidade canônica; deixe consulta de rede como fallback |
| API lenta ao listar sessões | comandos e latência do Valkey | confirme índice/SCAN e ausência de varredura bloqueante |

## Leia a resposta inteira

Use `--fail-with-body` para não perder o erro devolvido pela API:

```bash
curl --fail-with-body --request POST \
  --url "$API_URL/v15.0/$SESSION/messages" \
  --header "Authorization: Bearer $TOKEN" \
  --header "Content-Type: application/json" \
  --data @payload.json
```

Registre status HTTP, mensagem de erro, horário, rota, sessão e o ID da
mensagem. Remova tokens, URLs assinadas e conteúdo pessoal antes de compartilhar.

## Pareamento e reconexão

- Escute Socket.IO antes de registrar uma sessão nova.
- Mantenha o mesmo tipo de conexão enquanto a sessão estiver registrada.
- Preserve o volume e o estado do Valkey entre atualizações.
- Não conecte dois workers como proprietários da mesma sessão.
- Use `deregister` somente quando realmente quiser invalidar as credenciais.

Se o QR reaparece a cada reinício, investigue persistência antes de parear de
novo. Veja [Conectar uma sessão](/guide/connection).

## Mensagens e identidades

Quando disponível, envie `user_id` junto do telefone. Se ele estiver ausente, a
API tenta o cache local antes de consultar a rede. Um erro de identidade deve
ser correlacionado com o destinatário normalizado e a sessão de envio.

Em grupos, não confunda o ID da conversa com a identidade do participante. Em
respostas, preserve o ID da mensagem original no contexto.

## Mídia

1. Confirme que o webhook contém `id`, MIME type e tamanho esperados.
2. Consulte a mídia pelo ID e use a URL proxy devolvida pela API.
3. Valide `Content-Type` e se os bytes transmitidos não estão vazios.
4. Para Base64, use apenas `base64`, sem `link` ou `id`, e respeite o limite da instalação.
5. Para vídeo, confira o worker dedicado e compatibilidade do formato preparado.

Fotos de perfil possuem rota autenticada própria. Listagens não devem baixar o
objeto do S3 apenas para montar a resposta; metadados e cache evitam tráfego
desnecessário.

## Webhooks

O consumidor deve responder `2xx` antes de processar tarefas demoradas. Em
falhas transitórias, acompanhe tentativas, circuit breaker, backlog e dead-letter
queue. Deduplicate sempre: retries podem entregar o mesmo evento novamente.

Para assinatura ou token inválido, compare os bytes recebidos antes de qualquer
transformação e a credencial configurada para aquele destino.

## Valkey, fila e workers

Uma API saudável pode ficar lenta quando a dependência está bloqueada:

- procure latência, comandos lentos, BGSAVE e pressão de swap no Valkey;
- confirme que listagens usam índice ou `SCAN`, sem `KEYS` no caminho normal;
- observe backlog, mensagens não confirmadas e timeouts no RabbitMQ;
- verifique reinícios, OOM e o papel de cada container;
- separe conversão de vídeo do broker quando houver volume relevante.

Não execute limpeza, `swapoff` ou reinício em produção apenas para testar uma
hipótese. Primeiro colete evidências em uma janela curta.

## Informações úteis para suporte

Envie um pacote mínimo e sanitizado:

```text
versão da imagem:
horário com fuso:
rota e status HTTP:
sessão afetada:
ID da mensagem:
tipo de mídia ou evento:
trecho curto do erro:
ocorre sempre ou foi transitório:
```

Nunca envie token, senha, credencial de sessão, URL pré-assinada ou payload
completo de cliente. Para contratos exatos, abra a [API interativa](/api-reference).

