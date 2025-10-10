# Variáveis de Ambiente — Referência e Exemplos

Este guia explica as principais variáveis de ambiente, quando usar e por quê. Copie `.env.example` para `.env` e ajuste conforme seu cenário.

## Servidor (Core)

- `PORT` — Porta HTTP. Padrão `9876`.
  - Use ao rodar múltiplos serviços ou atrás de proxy.
  - Exemplo: `PORT=8080`
- `BASE_URL` — URL pública base usada para montar links de mídia em respostas.
  - Use quando o serviço está atrás de proxy/CDN e clientes baixam mídia via URL pública.
  - Exemplo: `BASE_URL=https://api.exemplo.com`

## Sessão & Conexão

- `CONNECTION_TYPE` — `qrcode` | `pairing_code`. Padrão `qrcode`.
  - Use `pairing_code` para pareamento sem exibir QR (headless).
  - Exemplo: `CONNECTION_TYPE=pairing_code`
- `QR_TIMEOUT_MS` — Tempo limite para leitura do QR. Padrão `60000`.
  - Aumente em cenários de pareamento lento.
  - Exemplo: `QR_TIMEOUT_MS=120000`
- `VALIDATE_SESSION_NUMBER` — Garante que o número configurado bate com a sessão. Padrão `false`.
  - Use `true` para evitar inconsistência entre sessão e número.
  - Exemplo: `VALIDATE_SESSION_NUMBER=true`
- `CLEAN_CONFIG_ON_DISCONNECT` — Limpa configs salvas ao desconectar. Padrão `false`.
  - Use para forçar estado limpo no disconnect.
  - Exemplo: `CLEAN_CONFIG_ON_DISCONNECT=true`

## Log

- `LOG_LEVEL` — Nível de log do serviço. Padrão `warn`.
  - Use `debug` em desenvolvimento.
  - Exemplo: `LOG_LEVEL=debug`
- `UNO_LOG_LEVEL` — Sobrescreve o logger interno (cai para LOG_LEVEL se ausente).
  - Exemplo: `UNO_LOG_LEVEL=info`

## Redis & RabbitMQ

- `REDIS_URL` — String de conexão do Redis.
  - Habilita store em Redis (sessões/dados). Sem ele, usa filesystem.
  - Exemplo: `REDIS_URL=redis://localhost:6379`
- `AMQP_URL` — URL do RabbitMQ para broker.
  - Habilita filas (modelo web/worker, retries, dead letters).
  - Exemplo: `AMQP_URL=amqp://guest:guest@localhost:5672?frameMax=8192`

## Storage (S3/MinIO)

- `STORAGE_ENDPOINT` — Endpoint S3-compatível.
- `STORAGE_REGION` — Região S3 (ex.: `us-east-1`).
- `STORAGE_BUCKET_NAME` — Bucket para mídias.
- `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` — Credenciais.
- `STORAGE_FORCE_PATH_STYLE` — `true` para MinIO/compatibilidade.
  - Use para salvar mídias no S3/MinIO em vez de filesystem.
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

- `STATUS_ALLOW_LID` — Permite JIDs LID na lista de status. Padrão `true`.
  - Coloque `false` para normalizar para PN (`@s.whatsapp.net`).
  - Exemplo: `STATUS_ALLOW_LID=false`
- `STATUS_BROADCAST_ENABLED` — Habilita envio de Status (status@broadcast). Padrão `true`.
  - Defina `false` para bloquear qualquer Status antes de chegar ao WhatsApp (útil para evitar risco de bloqueio de conta).
  - Exemplo: `STATUS_BROADCAST_ENABLED=false`

## Envio em Grupos

- `GROUP_SEND_MEMBERSHIP_CHECK` — Avisa se não for membro do grupo. Padrão `true`.
- `GROUP_SEND_PREASSERT_SESSIONS` — Pré-assegura sessões dos participantes. Padrão `true`.
- `GROUP_SEND_ADDRESSING_MODE` — Prefira `pn` ou `lid`. Padrão vazio (auto).
- `GROUP_SEND_FALLBACK_ORDER` — Ordem de fallback no ack 421, ex.: `pn,lid`. Padrão `pn,lid`.
  - Use para melhorar confiabilidade em cenários com variações de rede/dispositivo.
  - Exemplo: `GROUP_SEND_ADDRESSING_MODE=pn`

Grupos grandes (mitigação de “No sessions” e controle de carga)
- `GROUP_LARGE_THRESHOLD` — Considera o grupo “grande” quando o número de participantes ultrapassa esse valor. Padrão `800`.
  - Em grupos grandes, o cliente força endereçamento PN para reduzir fanout LID e pula asserts pesados.
  - Exemplo: `GROUP_LARGE_THRESHOLD=1000`
- `GROUP_ASSERT_CHUNK_SIZE` — Tamanho dos chunks para `assertSessions()` em fallbacks. Padrão `100` (mín. 20).
  - Exemplo: `GROUP_ASSERT_CHUNK_SIZE=80`
- `GROUP_ASSERT_FLOOD_WINDOW_MS` — Janela anti-flood para evitar asserts pesados repetidos por grupo. Padrão `5000`.
  - Exemplo: `GROUP_ASSERT_FLOOD_WINDOW_MS=10000`
- `NO_SESSION_RETRY_BASE_DELAY_MS` — Atraso base antes do retry após asserts. Padrão `150`.
- `NO_SESSION_RETRY_PER_200_DELAY_MS` — Atraso extra por 200 destinos. Padrão `300`.
- `NO_SESSION_RETRY_MAX_DELAY_MS` — Teto para o atraso adaptativo. Padrão `2000`.
  - Exemplo: `NO_SESSION_RETRY_BASE_DELAY_MS=250`, `NO_SESSION_RETRY_PER_200_DELAY_MS=400`, `NO_SESSION_RETRY_MAX_DELAY_MS=3000`
- `RECEIPT_RETRY_ASSERT_COOLDOWN_MS` — Cooldown entre asserts disparados por recibos `message-receipt.update` por grupo. Padrão `15000`.
- `RECEIPT_RETRY_ASSERT_MAX_TARGETS` — Limite de alvos para asserts via recibos. Padrão `400`.

Observação de confiabilidade:
- Em um erro raro do libsignal (“No sessions”) durante envios em grupos, o serviço agora reassegura as sessões de todos os participantes e tenta reenviar uma vez automaticamente.

## Cache de Mapeamento LID/PN

- `JIDMAP_CACHE_ENABLED` — Habilita cache PN↔LID. Padrão `true`.
  - Armazena por sessão o mapeamento entre JIDs LID e PN para reduzir consultas e melhorar entrega em grupos grandes.
  - Exemplo: `JIDMAP_CACHE_ENABLED=true`
- `JIDMAP_TTL_SECONDS` — TTL das entradas do cache. Padrão `604800` (7 dias).
  - Exemplo: `JIDMAP_TTL_SECONDS=604800`

## Anti‑Spam / Rate Limits

- `RATE_LIMIT_GLOBAL_PER_MINUTE` — Máximo de mensagens por minuto por sessão. Padrão `0` (desativado).
  - Exemplo: `RATE_LIMIT_GLOBAL_PER_MINUTE=60`
- `RATE_LIMIT_PER_TO_PER_MINUTE` — Máximo de mensagens por minuto por destinatário (por sessão). Padrão `0`.
  - Exemplo: `RATE_LIMIT_PER_TO_PER_MINUTE=20`
- `RATE_LIMIT_BLOCK_SECONDS` — Atraso sugerido (em segundos) quando o limite é excedido. Padrão `60`.
  - Ao atingir o limite, a API agenda o envio via RabbitMQ com esse atraso em vez de responder HTTP 429.
  - Exemplo: `RATE_LIMIT_BLOCK_SECONDS=60`

## Webhooks / Filas / Retentativas

- `UNOAPI_MESSAGE_RETRY_LIMIT` — Máximo de tentativas em consumidores AMQP antes de ir para a dead‑letter. Padrão `5`.
  - Exemplo: `UNOAPI_MESSAGE_RETRY_LIMIT=7`
- `UNOAPI_MESSAGE_RETRY_DELAY` — Atraso padrão (ms) usado por utilitários ao publicar mensagens com delay. Padrão `10000`.
  - Observação: o caminho de retry do consumidor usa um reenvio fixo de 60s.
  - Exemplo: `UNOAPI_MESSAGE_RETRY_DELAY=15000`
- `CONSUMER_TIMEOUT_MS` — Tempo máximo (ms) para um consumidor processar a mensagem antes de forçar retry. Padrão `360000`.
  - Exemplo: `CONSUMER_TIMEOUT_MS=180000`
- `NOTIFY_FAILED_MESSAGES` — Envia um texto de diagnóstico para o número da sessão quando as tentativas se esgotam. Padrão `true`.
  - Exemplo: `NOTIFY_FAILED_MESSAGES=false`

## Mídia & Timeouts

- `FETCH_TIMEOUT_MS` — Timeout para checagens HEAD/download de mídia.
  - Aumente ao enviar mídias grandes hospedadas em servidores lentos.
  - Exemplo: `FETCH_TIMEOUT_MS=15000`
- `SEND_AUDIO_MESSAGE_AS_PTT` — Marca áudio como PTT (voice note). Padrão `false`.
- `CONVERT_AUDIO_TO_PTT` — Converte forçadamente para OGG/Opus. Padrão `false`.
  - Use quando os clientes esperam voice notes com waveform.
  - Exemplo:
    ```env
    SEND_AUDIO_MESSAGE_AS_PTT=true
    CONVERT_AUDIO_TO_PTT=true
    ```

## Proxy

- `PROXY_URL` — Proxy SOCKS/HTTP para Baileys.
  - Use quando saídas precisam passar por proxy.
  - Exemplo: `PROXY_URL=socks5://user:pass@proxy.local:1080`

## Webhooks & Notificações

- `WEBHOOK_SESSION` — Recebe notificações de sessão (QR, status) via HTTP.
  - Integre com sistemas externos (ex.: exibir QR em outra UI).
  - Exemplo: `WEBHOOK_SESSION=https://hooks.exemplo.com/uno/session`

## Chamadas de Voz

- `WAVOIP_TOKEN` — Habilita voice-calls-baileys.
  - Use para recursos relacionados a chamadas quando aplicável.
  - Exemplo: `WAVOIP_TOKEN=seu-token`

## Exemplos por Cenário

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
- Pareamento headless e validação mais rígida:
  ```env
  CONNECTION_TYPE=pairing_code
  QR_TIMEOUT_MS=120000
  VALIDATE_SESSION_NUMBER=true
  ```

## Exemplos prontos

- Inglês: /docs/examples/.env.example.en
- Português (Brasil): /docs/pt-BR/exemplos/.env.exemplo
