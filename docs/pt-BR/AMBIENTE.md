# VariÃ¡veis de Ambiente â€” ReferÃªncia e Exemplos

Este guia explica as principais variÃ¡veis de ambiente, quando usar e por quÃª. Copie `.env.example` para `.env` e ajuste conforme seu cenÃ¡rio.

## Servidor (Core)

- `PORT` â€” Porta HTTP. PadrÃ£o `9876`.
  - Use ao rodar mÃºltiplos serviÃ§os ou atrÃ¡s de proxy.
  - Exemplo: `PORT=8080`
- `BASE_URL` â€” URL pÃºblica base usada para montar links de mÃ­dia em respostas.
  - Use quando o serviÃ§o estÃ¡ atrÃ¡s de proxy/CDN e clientes baixam mÃ­dia via URL pÃºblica.
  - Exemplo: `BASE_URL=https://api.exemplo.com`

## SessÃ£o & ConexÃ£o

- `CONNECTION_TYPE` â€” `qrcode` | `pairing_code`. PadrÃ£o `qrcode`.
  - Use `pairing_code` para pareamento sem exibir QR (headless).
  - Exemplo: `CONNECTION_TYPE=pairing_code`
- `QR_TIMEOUT_MS` â€” Tempo limite para leitura do QR. PadrÃ£o `60000`.
  - Aumente em cenÃ¡rios de pareamento lento.
  - Exemplo: `QR_TIMEOUT_MS=120000`
- `VALIDATE_SESSION_NUMBER` â€” Garante que o nÃºmero configurado bate com a sessÃ£o. PadrÃ£o `false`.
  - Use `true` para evitar inconsistÃªncia entre sessÃ£o e nÃºmero.
  - Exemplo: `VALIDATE_SESSION_NUMBER=true`
- `CLEAN_CONFIG_ON_DISCONNECT` â€” Limpa configs salvas ao desconectar. PadrÃ£o `false`.
  - Use para forÃ§ar estado limpo no disconnect.
  - Exemplo: `CLEAN_CONFIG_ON_DISCONNECT=true`

## Log

- `LOG_LEVEL` â€” NÃ­vel de log do serviÃ§o. PadrÃ£o `warn`.
  - Use `debug` em desenvolvimento.
  - Exemplo: `LOG_LEVEL=debug`
- `UNO_LOG_LEVEL` â€” Sobrescreve o logger interno (cai para LOG_LEVEL se ausente).
  - Exemplo: `UNO_LOG_LEVEL=info`

## Redis & RabbitMQ

- `REDIS_URL` â€” String de conexÃ£o do Redis.
  - Habilita store em Redis (sessÃµes/dados). Sem ele, usa filesystem.
  - Exemplo: `REDIS_URL=redis://localhost:6379`
- `AMQP_URL` â€” URL do RabbitMQ para broker.
  - Habilita filas (modelo web/worker, retries, dead letters).
  - Exemplo: `AMQP_URL=amqp://guest:guest@localhost:5672?frameMax=8192`

## Storage (S3/MinIO)

- `STORAGE_ENDPOINT` â€” Endpoint S3-compatÃ­vel.
- `STORAGE_REGION` â€” RegiÃ£o S3 (ex.: `us-east-1`).
- `STORAGE_BUCKET_NAME` â€” Bucket para mÃ­dias.
- `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` â€” Credenciais.
- `STORAGE_FORCE_PATH_STYLE` â€” `true` para MinIO/compatibilidade.
  - Use para salvar mÃ­dias no S3/MinIO em vez de filesystem.
  - Exemplo:
    ```env
    STORAGE_ENDPOINT=http://minio:9000
    STORAGE_REGION=us-east-1
    STORAGE_BUCKET_NAME=unoapi
    STORAGE_ACCESS_KEY_ID=minioadmin
    STORAGE_SECRET_ACCESS_KEY=minioadmin
    STORAGE_FORCE_PATH_STYLE=true
    ```

## Status/Broadcast

- `STATUS_ALLOW_LID` â€” Permite JIDs LID na lista de status. PadrÃ£o `true`.
  - Coloque `false` para normalizar para PN (`@s.whatsapp.net`).
  - Exemplo: `STATUS_ALLOW_LID=false`
- `STATUS_BROADCAST_ENABLED` â€” Habilita envio de Status (status@broadcast). PadrÃ£o `true`.
  - Defina `false` para bloquear qualquer Status antes de chegar ao WhatsApp (Ãºtil para evitar risco de bloqueio de conta).
  - Exemplo: `STATUS_BROADCAST_ENABLED=false`

## Envio em Grupos

- `GROUP_SEND_MEMBERSHIP_CHECK` â€” Avisa se nÃ£o for membro do grupo. PadrÃ£o `true`.
- `GROUP_SEND_PREASSERT_SESSIONS` â€” PrÃ©-assegura sessÃµes dos participantes. PadrÃ£o `true`.
- `GROUP_SEND_ADDRESSING_MODE` â€” Prefira `pn` ou `lid`. PadrÃ£o vazio (interpreta como LID por padrÃ£o).
- `GROUP_SEND_FALLBACK_ORDER` â€” Ordem de fallback no ack 421, ex.: `pn,lid`. PadrÃ£o `pn,lid`.
  - Use para melhorar confiabilidade em cenÃ¡rios com variaÃ§Ãµes de rede/dispositivo.
  - Exemplo: `GROUP_SEND_ADDRESSING_MODE=pn`

## Envio 1:1 (Direto)

- `ONE_TO_ONE_ADDRESSING_MODE` — Preferência de endereçamento para conversas diretas. `pn` | `lid`. Padrão `pn`.
  - `pn`: envia usando JID de número (`@s.whatsapp.net`). Evita conversas duplicadas em alguns clientes (iPhone).
  - `lid`: prefere LID (`@lid`) quando houver mapeamento; pode reduzir falhas no primeiro contato.
- `ONE_TO_ONE_PREASSERT_ENABLED` — Pré‑assertar sessões Signal do destinatário antes do envio. Padrão `true`.
  - Melhora confiabilidade após longos períodos inativos ou troca de dispositivos.
- `ONE_TO_ONE_PREASSERT_COOLDOWN_MS` — Cooldown por destinatário para o pré‑assert (ms). Padrão `7200000` (120 minutos).
  - Reduz CPU/Redis evitando pré‑assert a cada mensagem para o mesmo contato.
- `ONE_TO_ONE_ASSERT_PROBE_ENABLED` — Quando `true`, registra uma “sonda” de contagem de chaves no Redis após o pré‑assert (apenas observabilidade). Padrão `false`.
  - Mantenha `false` em produção para evitar SCANs extras no Redis.

Exemplo:
```env
# Preferir PN em 1:1 e pré‑assertar no máximo a cada 2 horas por contato
ONE_TO_ONE_ADDRESSING_MODE=pn
ONE_TO_ONE_PREASSERT_ENABLED=true
ONE_TO_ONE_PREASSERT_COOLDOWN_MS=7200000
# Desativar a sonda para economizar Redis
ONE_TO_ONE_ASSERT_PROBE_ENABLED=false
```

### Controles de fan-out de recibos/status em grupos

Em grupos grandes, recibos por participante (lido/tocado/entregue por pessoa) podem sobrecarregar seu webhook/socket. Estes toggles reduzem o volume de eventos mantendo um Ãºnico sinal de entrega no nÃ­vel do grupo.

- `GROUP_IGNORE_INDIVIDUAL_RECEIPTS` â€” Suprime `message-receipt.update` por participante para mensagens de grupo. PadrÃ£o `true`.
  - Coloque `false` para receber recibos por usuÃ¡rio (lido/tocado/entregue) em grupos.
- `GROUP_ONLY_DELIVERED_STATUS` â€” Em `messages.update` de grupos, encaminha apenas `DELIVERY_ACK` (entregue). PadrÃ£o `true`.
  - Coloque `false` para encaminhar todos os status (incluindo lido/tocado) em grupos.

Exemplo (reduzir carga em grupos grandes):
```env
GROUP_IGNORE_INDIVIDUAL_RECEIPTS=true
GROUP_ONLY_DELIVERED_STATUS=true
```
 
## Retry de ACK do Servidor (assert + resend)

- `ACK_RETRY_DELAYS_MS` â€” Lista de atrasos (ms) separada por vÃ­rgula para reenvio quando nÃ£o hÃ¡ ACK do servidor. PadrÃ£o `8000,30000,60000` (8s, 30s, 60s).
  - Exemplo: `ACK_RETRY_DELAYS_MS=5000,15000,45000`
- `ACK_RETRY_MAX_ATTEMPTS` â€” Limite mÃ¡ximo de tentativas. PadrÃ£o `0` (usa a quantidade definida em `ACK_RETRY_DELAYS_MS`).
  - Exemplo: `ACK_RETRY_MAX_ATTEMPTS=2`
Restaurar comportamento legado (recibos completos por usuÃ¡rio):
```env
GROUP_IGNORE_INDIVIDUAL_RECEIPTS=false
GROUP_ONLY_DELIVERED_STATUS=false
```

Grupos grandes (mitigaÃ§Ã£o de â€œNo sessionsâ€ e controle de carga)
- `GROUP_LARGE_THRESHOLD` â€” Considera o grupo â€œgrandeâ€ quando o nÃºmero de participantes ultrapassa esse valor. PadrÃ£o `800`.
  - Em grupos grandes, o cliente pula prÃ©â€‘asserts pesados para reduzir carga. O endereÃ§amento permanece LID por padrÃ£o (a menos que configurado) e o fallback alterna conforme `GROUP_SEND_FALLBACK_ORDER` quando necessÃ¡rio.
  - Exemplo: `GROUP_LARGE_THRESHOLD=1000`
- `GROUP_ASSERT_CHUNK_SIZE` â€” Tamanho dos chunks para `assertSessions()` em fallbacks. PadrÃ£o `100` (mÃ­n. 20).
  - Exemplo: `GROUP_ASSERT_CHUNK_SIZE=80`
- `GROUP_ASSERT_FLOOD_WINDOW_MS` â€” Janela antiâ€‘flood para evitar asserts pesados repetidos por grupo. PadrÃ£o `5000`.
  - Exemplo: `GROUP_ASSERT_FLOOD_WINDOW_MS=10000`
- `NO_SESSION_RETRY_BASE_DELAY_MS` â€” Atraso base antes do retry apÃ³s asserts. PadrÃ£o `150`.
- `NO_SESSION_RETRY_PER_200_DELAY_MS` â€” Atraso extra por 200 destinos. PadrÃ£o `300`.
- `NO_SESSION_RETRY_MAX_DELAY_MS` â€” Teto para o atraso adaptativo. PadrÃ£o `2000`.
  - Exemplo: `NO_SESSION_RETRY_BASE_DELAY_MS=250`, `NO_SESSION_RETRY_PER_200_DELAY_MS=400`, `NO_SESSION_RETRY_MAX_DELAY_MS=3000`
- `RECEIPT_RETRY_ASSERT_COOLDOWN_MS` â€” Cooldown entre asserts disparados por recibos `message-receipt.update` por grupo. PadrÃ£o `15000`.
- `RECEIPT_RETRY_ASSERT_MAX_TARGETS` â€” Limite de alvos para asserts via recibos. PadrÃ£o `400`.

ObservaÃ§Ã£o de confiabilidade:
- Em erro raro do libsignal (â€œNo sessionsâ€) durante envio a grupos, o serviÃ§o reassegura sessÃµes (em chunks) e tenta 1x. Persistindo falha, alterna o addressing seguindo `GROUP_SEND_FALLBACK_ORDER` e tenta novamente.

## Cache de Mapeamento LID/PN

## Comportamento LID/PN

- Webhooks preferem PN. Quando nÃ£o for possÃ­vel resolver PN com seguranÃ§a, LID/JID Ã© retornado como fallback.
- Internamente, a API usa LID quando disponÃ­vel para 1:1 e grupos. Em 1:1, o mapeamento PNâ†’LID Ã© aprendido em tempo de execuÃ§Ã£o (assertSessions/exists e eventos).
- Imagens de perfil sÃ£o salvas e consultadas por um identificador PN canÃ´nico quando possÃ­vel (tambÃ©m para chaves S3), para PN e LID apontarem para o mesmo arquivo.
- `JIDMAP_CACHE_ENABLED` â€” Habilita cache PNâ†”LID. PadrÃ£o `true`.
  - Armazena por sessÃ£o o mapeamento entre JIDs LID e PN para reduzir consultas e melhorar entrega em grupos grandes.
  - Exemplo: `JIDMAP_CACHE_ENABLED=true`
- `JIDMAP_TTL_SECONDS` â€” TTL das entradas do cache. PadrÃ£o `604800` (7 dias).
  - Exemplo: `JIDMAP_TTL_SECONDS=604800`

## Antiâ€‘Spam / Rate Limits

- `RATE_LIMIT_GLOBAL_PER_MINUTE` â€” MÃ¡ximo de mensagens por minuto por sessÃ£o. PadrÃ£o `0` (desativado).
  - Exemplo: `RATE_LIMIT_GLOBAL_PER_MINUTE=60`
- `RATE_LIMIT_PER_TO_PER_MINUTE` â€” MÃ¡ximo de mensagens por minuto por destinatÃ¡rio (por sessÃ£o). PadrÃ£o `0`.
  - Exemplo: `RATE_LIMIT_PER_TO_PER_MINUTE=20`
- `RATE_LIMIT_BLOCK_SECONDS` â€” Atraso sugerido (em segundos) quando o limite Ã© excedido. PadrÃ£o `60`.
  - Ao atingir o limite, a API agenda o envio via RabbitMQ com esse atraso em vez de responder HTTP 429.
  - Exemplo: `RATE_LIMIT_BLOCK_SECONDS=60`

## Webhooks / Filas / Retentativas

- `UNOAPI_MESSAGE_RETRY_LIMIT` â€” MÃ¡ximo de tentativas em consumidores AMQP antes de ir para a deadâ€‘letter. PadrÃ£o `5`.
  - Exemplo: `UNOAPI_MESSAGE_RETRY_LIMIT=7`
- `UNOAPI_MESSAGE_RETRY_DELAY` â€” Atraso padrÃ£o (ms) usado por utilitÃ¡rios ao publicar mensagens com delay. PadrÃ£o `10000`.
  - ObservaÃ§Ã£o: o caminho de retry do consumidor usa um reenvio fixo de 60s.
  - Exemplo: `UNOAPI_MESSAGE_RETRY_DELAY=15000`
- `CONSUMER_TIMEOUT_MS` â€” Tempo mÃ¡ximo (ms) para um consumidor processar a mensagem antes de forÃ§ar retry. PadrÃ£o `360000`.
  - Exemplo: `CONSUMER_TIMEOUT_MS=180000`
- `NOTIFY_FAILED_MESSAGES` â€” Envia um texto de diagnÃ³stico para o nÃºmero da sessÃ£o quando as tentativas se esgotam. PadrÃ£o `true`.
  - Exemplo: `NOTIFY_FAILED_MESSAGES=false`

## MÃ­dia & Timeouts

### DeduplicaÃ§Ã£o de entrada

Alguns provedores/dispositivos podem emitir a mesma mensagem do WA mais de uma vez durante reconexÃµes ou importaÃ§Ã£o de histÃ³rico. Use a janela abaixo para suprimir duplicatas que chegam em sequÃªncia.

- `INBOUND_DEDUP_WINDOW_MS` â€” Ignora o processamento se outra mensagem com o mesmo `remoteJid` e `id` chegar dentro desta janela (ms). PadrÃ£o `7000`.
  - Exemplo: `INBOUND_DEDUP_WINDOW_MS=5000`

### IdempotÃªncia de saÃ­da

Evita reenviar a mesma mensagem quando um retry do job ocorre apÃ³s um envio bemâ€‘sucedido.

- `OUTGOING_IDEMPOTENCY_ENABLED` â€” Quando `true` (padrÃ£o), o job de entrada checa no store (key/status) para o id UNO antes de enviar; se jÃ¡ parecer processado, ignora o envio.
  - Exemplo: `OUTGOING_IDEMPOTENCY_ENABLED=false` (para desabilitar)

### Fotos de Perfil

- Nome canÃ´nico do arquivo: sempre pelo nÃºmero (PN). Se a entrada for LID, mapeie para PN e salve `<pn>.jpg`.
- Refresh forÃ§ado: `PROFILE_PICTURE_FORCE_REFRESH=true` (padrÃ£o) busca no WhatsApp e atualiza o cache antes de retornar a URL local/storage.
- Prefetch no envio: o cliente faz prefetch da foto do destino em mensagens de saÃ­da (1:1 e grupos) para manter o cache atualizado.
- Busca robusta em 1:1: tenta JID PN primeiro e depois LID mapeado, no modo `image` e, se necessÃ¡rio, `preview`.
- SeguranÃ§a no S3: valida a existÃªncia do objeto (HeadObject) antes de gerar URL prÃ©â€‘assinada.

### Status/Webhook

- NormalizaÃ§Ã£o em 1:1: `recipient_id` sempre PN (somente dÃ­gitos), mesmo quando o evento chega com @lid.
- Timestamps: os statuses (delivered/read) incluem `timestamp` (quando disponÃ­vel) â€” ou caem em `payload.messageTimestamp`.
- NormalizaÃ§Ã£o de id: mapeia id do provedor para id UNO antes de enviar ao webhook.
- Antiâ€‘regressÃ£o/duplicata: ignora regressÃµes (ex.: â€œsentâ€ apÃ³s â€œdeliveredâ€) e repetidos para o mesmo id.

## Fotos de Perfil

- VisÃ£o geral: o serviÃ§o enriquece os eventos enviados ao webhook com fotos de perfil de contatos e de grupos. Quando habilitado, as imagens sÃ£o salvas no S3 (recomendado em produÃ§Ã£o) ou no filesystem local e expostas como URLs no payload.

- Habilitar/desabilitar
  - `SEND_PROFILE_PICTURE` â€” Incluir fotos de perfil no webhook. PadrÃ£o `true`.

- Backends de armazenamento
  - S3 (preferencial): habilitado quando existe `STORAGE_ENDPOINT`. Usa `@aws-sdk/client-s3` com credenciais de `STORAGE_*`. Os arquivos sÃ£o gravados em `<phone>/profile-pictures/<canonico>.jpg`, onde `<canonico>` Ã© o nÃºmero (somente dÃ­gitos) para usuÃ¡rios, ou o JID do grupo para grupos.
  - Filesystem: padrÃ£o quando nÃ£o hÃ¡ S3 configurado. Arquivos ficam em `<baseStore>/medias/<phone>/profile-pictures/<canonico>.jpg`.

- URLs retornadas ao webhook
  - S3: Ã© gerada uma URL prÃ©â€‘assinada por requisiÃ§Ã£o usando `DATA_URL_TTL` (segundos). O link expira apÃ³s o TTL.
  - Filesystem: a URL pÃºblica Ã© baseada em `BASE_URL`, via rota de download: `BASE_URL/v15.0/download/<phone>/profile-pictures/<canonico>.jpg`.
  - Primeira busca: na primeira vez, o serviÃ§o pode retornar a URL do CDN do WhatsApp enquanto baixa e persiste a imagem; nas prÃ³ximas, a URL serÃ¡ do seu storage (S3 ou filesystem).

- RetenÃ§Ã£o e limpeza
  - `DATA_TTL` â€” RetenÃ§Ã£o padrÃ£o (em segundos) para mÃ­dias (incluindo fotos de perfil). PadrÃ£o 30 dias.
  - Com S3 e AMQP, o serviÃ§o agenda um job para remover o objeto apÃ³s `DATA_TTL`.
  - No filesystem, a remoÃ§Ã£o Ã© feita diretamente no diretÃ³rio local de mÃ­dias.

- Pontos de integraÃ§Ã£o (alto nÃ­vel)
  - O cliente enriquece o payload com:
    - Contato: `contacts[0].profile.picture`
    - Grupo: `group_picture`
  - O data store resolve uma URL cacheada quando houver; caso contrÃ¡rio, consulta o WhatsApp (`profilePictureUrl`), persiste no storage e retorna uma URL.

- ConfiguraÃ§Ã£o necessÃ¡ria
  - Para S3: `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET_NAME`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` e opcionalmente `STORAGE_FORCE_PATH_STYLE`.
  - Para filesystem: garanta que `BASE_URL` aponte para um domÃ­nio pÃºblico (para que `/v15.0/download/...` funcione para os consumidores do webhook).

- `FETCH_TIMEOUT_MS` â€” Timeout para checagens HEAD/download de mÃ­dia.
  - Aumente ao enviar mÃ­dias grandes hospedadas em servidores lentos.
  - Exemplo: `FETCH_TIMEOUT_MS=15000`
- `SEND_AUDIO_MESSAGE_AS_PTT` â€” Marca Ã¡udio como PTT (voice note). PadrÃ£o `false`.
- `CONVERT_AUDIO_TO_PTT` â€” Converte forÃ§adamente para OGG/Opus. PadrÃ£o `false`.
  - Use quando os clientes esperam voice notes com waveform.
  - Exemplo:
    ```env
    SEND_AUDIO_MESSAGE_AS_PTT=true
    CONVERT_AUDIO_TO_PTT=true
    ```

## Proxy

- `PROXY_URL` â€” Proxy SOCKS/HTTP para Baileys.
  - Use quando saÃ­das precisam passar por proxy.
  - Exemplo: `PROXY_URL=socks5://user:pass@proxy.local:1080`

## Webhooks & NotificaÃ§Ãµes

- `WEBHOOK_SESSION` â€” Recebe notificaÃ§Ãµes de sessÃ£o (QR, status) via HTTP.
  - Integre com sistemas externos (ex.: exibir QR em outra UI).
  - Exemplo: `WEBHOOK_SESSION=https://hooks.exemplo.com/uno/session`

## Chamadas de Voz

- `WAVOIP_TOKEN` â€” Habilita voice-calls-baileys.
  - Use para recursos relacionados a chamadas quando aplicÃ¡vel.
  - Exemplo: `WAVOIP_TOKEN=seu-token`

## Exemplos por CenÃ¡rio

- Dev local (filesystem):
  ```env
  PORT=9876
  LOG_LEVEL=debug
  ```
- Dev com Redis + MinIO + RabbitMQ (compose):
  ```env
  BASE_URL=http://web:9876
  REDIS_URL=redis://redis:6379
  AMQP_URL=amqp://guest:guest@rabbitmq:5672?frameMax=8192
  STORAGE_ENDPOINT=http://minio:9000
  STORAGE_BUCKET_NAME=unoapi
  STORAGE_ACCESS_KEY_ID=minioadmin
  STORAGE_SECRET_ACCESS_KEY=minioadmin
  STORAGE_FORCE_PATH_STYLE=true
  ```
- Pareamento headless e validaÃ§Ã£o mais rÃ­gida:
  ```env
  CONNECTION_TYPE=pairing_code
  QR_TIMEOUT_MS=120000
  VALIDATE_SESSION_NUMBER=true
  ```

## Exemplos prontos

- InglÃªs: /docs/examples/.env.example.en
- PortuguÃªs (Brasil): /docs/pt-BR/exemplos/.env.exemplo

## Auto‑recuperação (Self‑Heal) & Asserção Periódica de Sessões

- `SELFHEAL_ASSERT_ON_DECRYPT` — Quando `true` (padrão), assegura sessões para o participante remoto quando chegam mensagens sem conteúdo decriptável (ex.: apenas `senderKeyDistributionMessage`).
- `PERIODIC_ASSERT_ENABLED` — Periodicamente assegura sessões para contatos recentes (padrão `true`).
- `PERIODIC_ASSERT_INTERVAL_MS` — Intervalo entre as asserções periódicas (padrão `600000`).
- `PERIODIC_ASSERT_MAX_TARGETS` — Máximo de contatos recentes por rodada (padrão `200`).
- `PERIODIC_ASSERT_RECENT_WINDOW_MS` — Apenas contatos vistos nesta janela são considerados (padrão `3600000`).

Exemplo:
```env
SELFHEAL_ASSERT_ON_DECRYPT=true
PERIODIC_ASSERT_ENABLED=true
PERIODIC_ASSERT_INTERVAL_MS=600000
PERIODIC_ASSERT_MAX_TARGETS=200
PERIODIC_ASSERT_RECENT_WINDOW_MS=3600000
```
