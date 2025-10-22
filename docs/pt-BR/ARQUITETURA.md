# Unoapi Cloud — Visão de Arquitetura

Este documento explica como o Unoapi integra o Baileys para expor uma API no formato do WhatsApp Cloud, descrevendo os módulos principais e o fluxo ponta‑a‑ponta de mensagens (incluindo Status/Broadcast).

## Componentes Principais

- API HTTP (Express)
  - Rotas e Controllers recebem requisições REST e encaminham para os serviços.
- Services
  - Incoming/Outgoing orquestram envio/recebimento.
  - Client (Baileys ou Forward) encapsula o transporte WhatsApp.
  - Socket (wrapper do WASocket) gerencia ciclo de vida da conexão Baileys e operações low‑level.
  - Listener processa eventos de entrada e repassa para webhooks/broadcast.
  - DataStore abstrai persistência (Redis ou Arquivo), cacheando JIDs, mensagens, metadados de grupos e URLs de mídia.
  - Broadcast publica eventos internos via Socket.IO para UI.
- Infraestrutura
  - Redis e RabbitMQ (opcionais) para filas e estado.
  - MinIO/S3 (opcional) para armazenamento de mídias.

## Fluxo de Envio (Send Message)

1) Cliente chama `POST /vXX.Y/{phone}/messages` com payload compatível com Cloud API.
2) `MessagesController.index` normaliza body/opções (ex.: `statusJidList`, `broadcast`) e delega para `Incoming.send`.
3) `IncomingBaileys.send` obtém/cria um `Client` para `{phone}` via `getClientBaileys` e chama `client.send(payload, options)`.
4) `ClientBaileys.send`:
   - Monta o conteúdo Baileys (templates, checagem de mídias, conversão opcional de áudio).
   - Aplica políticas para grupos e checagens brandas de participação.
   - Para Status (Stories), garante `broadcast` e prepara `statusJidList`.
   - Chama `sendMessage` provido por `socket.ts`.
5) `socket.ts` mantém o `WASocket` conectado e expõe `send/exists/read/...`.
   - Valida o estado da sessão, prioriza LID internamente quando possível (1:1 e grupos), mapeia LID⇄PN e pré‑assegura sessões (LID primeiro) para reduzir erros de decrypt/ack.
   - Para `status@broadcast`, resolve cada entrada de `statusJidList` via `exists()` e remove números sem WhatsApp. Só destinatários válidos são relayados.
6) O Baileys envia a mensagem, o Unoapi persiste chaves/mensagem no DataStore e retorna resposta no formato Cloud API.

## Fluxo de Status/Broadcast

- Entrada: `to = "status@broadcast"`, `type = text|image|video|...`, `options.statusJidList = [números | JIDs]`.
- `socket.ts` resolve cada entrada com `exists(raw)`:
  - Mantém apenas quem tem WhatsApp (filtra inválidos).
  - Normaliza LID→PN conforme `STATUS_ALLOW_LID`.
  - Remove duplicados.
- Envia uma vez e usa `relayMessage` com a lista filtrada.
- Resposta adiciona:
  - `status_skipped`: entradas ignoradas por não terem WhatsApp.
  - `status_recipients`: quantidade de destinatários válidos.

### Segurança/Política para Status

- `STATUS_BROADCAST_ENABLED` (env): quando definido como `false`, o envio para `status@broadcast` é bloqueado antes de chegar ao WhatsApp. Útil para evitar risco de bloqueio de conta quando a política não permite uso de Status.

## Fluxo de Entrada (Incoming)

- `socket.ts` assina eventos do Baileys (messages.upsert, update, receipts, groups, calls, etc.).
- `ListenerBaileys` normaliza e envia para webhooks ou processamento local.
- `Broadcast` emite eventos de UI via Socket.IO (`/ws`) para QR code e notificações.

## Estado e Sessão

- `Store` provê `sessionStore` e `dataStore` (Redis ou Arquivo):
  - `data_store_*`: cache de JIDs (onWhatsApp), mensagens, URLs de mídia, metadados de grupos.
  - Cache PN↔LID: mantido por sessão (arquivo/redis) e populado por eventos do Baileys e consultas.
  - `session_store`: máquina de estados de conexão (connecting/online/offline/standby), timeouts e reconexões.

## Tratamento de Erros e Resiliência

- Checagens antes de enviar:
  - Valida estado da sessão (connecting/offline/disconnected/standby) → mapeado em códigos `SendError`.
  - Para grupos, checagem branda de participação; pré‑assert de sessões dos participantes (prioridade LID).
  - Auto‑retry em ack 421 alternando modo de endereçamento (PN⇄LID).
- Desconexões:
  - Detecta `loggedOut/connectionReplaced/restartRequired`, notifica e reconecta conforme configuração.

### Recuperação automática em grupos ("No sessions")

- Em casos raros, o libsignal pode retornar “No sessions” ao enviar em grupos (falta de sessão de cifra para algum participante).
- O socket realiza um fallback automático:
  1. Consulta os participantes do grupo (inclui variantes PN/LID e a própria identidade).
  2. Executa `assertSessions` para todos (massa → chunks → divisão PN/LID quando ajuda), respeitando limites para evitar sobrecarga.
  3. Aplica um atraso adaptativo para propagação do sender-key e tenta enviar novamente uma vez; se ainda falhar, alterna o addressingMode (PN↔LID) para uma última tentativa.
- Esse comportamento reduz falhas intermitentes sem alterar a API de chamada.

Heurísticas para grupos grandes
- Quando o grupo é “grande” (ver `GROUP_LARGE_THRESHOLD`), o cliente prefere endereçamento PN e evita asserts pesados, usando atraso adaptativo.
- Asserts disparados por recibos (`message-receipt.update` com retry) são limitados por grupo e quantidade de alvos para evitar loops e alta CPU.

## LID/PN e Webhooks

- Webhooks preferem PN para `wa_id`, `from` e `recipient_id`. Se não for possível obter PN com segurança, o LID/JID é retornado como fallback.
- Internamente (envio e asserts), usamos LID sempre que possível: 1:1 tenta aprender PN→LID em tempo de execução; em grupos, asserts são feitos com LID prioritariamente.
- Imagens de perfil: salvas e consultadas por um identificador canônico PN quando possível (inclusive em S3), evitando duplicidade entre PN/LID.

### Variáveis de Ambiente relevantes

- `GROUP_SEND_ADDRESSING_MODE` (''|lid|pn): vazio implica LID por padrão.
- `GROUP_SEND_PREASSERT_SESSIONS` (true): habilita assert prévio de sessões em grupos (LID primeiro).
- `GROUP_LARGE_THRESHOLD` (800): acima disso, evita asserts pesados e usa atrasos adaptativos.
- `JIDMAP_CACHE_ENABLED` (true) e `JIDMAP_TTL_SECONDS` (604800): cache PN↔LID.
- `STATUS_BROADCAST_ENABLED` (true): habilita/desabilita o envio para `status@broadcast`.

Para ver logs de aprendizado PN→LID e asserts, ajuste `LOG_LEVEL`/`UNO_LOG_LEVEL` para `debug`.
### Entrega de Webhooks & Retentativas

- Caminho de entrega
  - Webhooks de saída são produzidos em `UNOAPI_QUEUE_OUTGOING` e consumidos por `jobs/outgoing.ts`, que chama `OutgoingCloudApi.sendHttp()`.
  - Eventos gerados pela API HTTP (`/messages`) e pelo listener Baileys também disparam webhooks dentro de consumidores AMQP; portanto, herdam o mesmo modelo de retentativa.
- Modelo de retry (envelope AMQP)
  - Se o consumidor lançar erro (HTTP não‑2xx do webhook, timeout ou exceção), a mensagem é republicada com atraso fixo de 60s.
  - As retentativas seguem até `UNOAPI_MESSAGE_RETRY_LIMIT` (padrão 5).
  - Ao atingir o limite, a mensagem vai para a dead‑letter da fila.
- Timeouts e delays
  - Timeout HTTP por webhook: `webhook.timeoutMs` (AbortSignal timeout).
  - Timeout global do consumidor: `CONSUMER_TIMEOUT_MS` (padrão 360000ms).
  - Atraso de retry: 60s, via exchange delayed.
- Notificação de falhas
  - Com `NOTIFY_FAILED_MESSAGES=true`, ao estourar as retentativas, um texto de diagnóstico é enviado para o número da sessão com detalhes do erro/stack.
- Reenvio a partir de dead‑letter (opcional)
  - O processo `waker` consome dead‑letters e reenfileira nas filas principais, dando nova chance às mensagens.

## Configuração (destaques)

- Sessão/Conexão: `CONNECTION_TYPE`, `QR_TIMEOUT_MS`, `VALIDATE_SESSION_NUMBER`, `CLEAN_CONFIG_ON_DISCONNECT`.
- Logs: `LOG_LEVEL`, `UNO_LOG_LEVEL`.
- Status: `STATUS_ALLOW_LID` (manter LID ou normalizar para PN).
- Grupos: `GROUP_SEND_MEMBERSHIP_CHECK`, `GROUP_SEND_PREASSERT_SESSIONS`, `GROUP_SEND_ADDRESSING_MODE`.
- Mídia: S3/MinIO `STORAGE_*`, `FETCH_TIMEOUT_MS`, conversão opcional de áudio para PTT.

## Arquivos Principais

- Controllers: `src/controllers/*`
- Transporte:
  - `src/services/client_baileys.ts`
  - `src/services/socket.ts`
  - `src/services/listener_baileys.ts`
- Integração:
  - `src/services/incoming_baileys.ts`
  - `src/services/outgoing.ts`
  - `src/services/broadcast.ts`
- Dados/Estado:
  - `src/services/data_store_file.ts` / `src/services/data_store_redis.ts`
  - `src/services/session_store.ts`
- Comum:
  - `src/services/transformer.ts`
  - `src/defaults.ts`

## Comportamentos de Leitura (READ_ON_RECEIPT e READ_ON_REPLY)

- READ_ON_RECEIPT
  - Flag global/por sessão que marca como lidas as mensagens ao receber.
  - Implementado em `src/services/client_baileys.ts`: após tratar `messages.upsert`, se habilitado e a mensagem não for `fromMe`, chama `readMessages([key])`.
  - Atua apenas em mensagens futuras (não é retroativo).

- READ_ON_REPLY (por sessão)
  - Quando habilitado, após um envio bem-sucedido para um chat, o Unoapi marca como lida a última mensagem recebida (não‑fromMe) daquele chat.
  - Persistência do ponteiro (última recebida por chat):
    - Interface: `getLastIncomingKey/setLastIncomingKey` em `src/services/data_store.ts`.
    - File store: mapa em memória em `src/services/data_store_file.ts`.
    - Redis store: chaves `unoapi-last-incoming:<session>:<jid>` em `src/services/redis.ts`, com ponte em `src/services/data_store_redis.ts`.
  - Atualização do ponteiro (ao receber): `src/services/listener_baileys.ts` atualiza sempre que processa mensagem de entrada não‑fromMe.
  - Disparo ao responder (após enviar): `src/services/socket.ts` verifica `config.readOnReply`; se true, busca o ponteiro para o JID alvo (normalizando LID→PN quando necessário) e chama `readMessages([key])`.
  - `readMessages` pré‑assegura sessões dos JIDs envolvidos para evitar “No sessions” ao aplicar leitura.
  - Privacidade segue o WhatsApp: o visto depende das configurações de leitura de ambos os usuários.

Flags e configuração
- `READ_ON_RECEIPT`, `READ_ON_REPLY` estão em `src/defaults.ts` e são ligadas ao config por sessão em `src/services/config_by_env.ts` (campos `readOnReceipt` e `readOnReply` em `src/services/config.ts`).

## Fluxo de Fotos de Perfil

Visão geral (quando `SEND_PROFILE_PICTURE=true`):

```
[Baileys] --profilePictureUrl(jid)--> [socket.fetchImageUrl]
   │                                     │
   │                       chama DataStore.loadImageUrl(jid, sock)
   │                                     │
   │                 ┌──── se já houver URL em cache, retorna ────┐
   │                 │                                             │
   │                 └─────────────────────────────────────────────┘
   │                                     │
   │                   busca URL CDN no WhatsApp (primeira vez)
   │                                     │
   │                     persiste via mediaStore.saveProfilePicture
   │                                     │
   ├──────── backend S3 ────────────────┴──────── backend filesystem ────────┐
   │  PutObject em <phone>/profile-pictures/<canonico>.jpg                    │
   │  retorna URL pré‑assinada (expira em DATA_URL_TTL)                      │
   │                                                                           │
   │                                            grava arquivo em <baseStore>/medias
   │                                            retorna BASE_URL/v15.0/download/...
   └──────────────────────────────────────────────────────────────────────────┘

O Transformer injeta a URL no payload do webhook:
- Contato: contacts[0].profile.picture
- Grupo: group_picture

Retenção e limpeza:
- Objetos seguem DATA_TTL. Com S3+AMQP, um job com delay remove o objeto; no FS, a remoção é local quando necessário.
```

## Mapas de Ciclo de Vida

- Envio → Controller → Incoming → Client → Socket.send → Baileys → DataStore → Response
- Status → Normaliza `statusJidList` (filtro exists) → sendMessage → relayMessage(válidos)
- Recebimento → Eventos Socket → Listener → Webhooks/Broadcast

## Extensibilidade

- Novo tipo de envio: estender transformer e mapear em `ClientBaileys.send`.
- Novo store: implementar DataStore/SessionStore e ligar via config.
- Comportamento de broadcast: ajustar `STATUS_*` em `defaults.ts`.

