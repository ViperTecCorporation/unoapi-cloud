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

## Envio em Grupos

- `GROUP_SEND_MEMBERSHIP_CHECK` — Avisa se não for membro do grupo. Padrão `true`.
- `GROUP_SEND_PREASSERT_SESSIONS` — Pré-assegura sessões dos participantes. Padrão `true`.
- `GROUP_SEND_ADDRESSING_MODE` — Prefira `pn` ou `lid`. Padrão vazio (auto).
- `GROUP_SEND_FALLBACK_ORDER` — Ordem de fallback no ack 421, ex.: `pn,lid`. Padrão `pn,lid`.
  - Use para melhorar confiabilidade em cenários com variações de rede/dispositivo.
  - Exemplo: `GROUP_SEND_ADDRESSING_MODE=pn`

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
