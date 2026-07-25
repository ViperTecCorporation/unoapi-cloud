# Arquitetura de processos Cloud

## Entrypoint único

A imagem de produção possui um único entrypoint:

```text
node dist/src/cloud.js
```

`src/cloud.ts` é o código-fonte TypeScript. `dist/src/cloud.js` é o artefato
compilado executado pelo Node. Não sobrescreva o entrypoint da imagem com
`yarn cloud`, `yarn web` ou comandos semelhantes.

Os scripts diretos de produção `web`, `worker`, `broker`, `bridge` e
`standalone` foram removidos do `package.json`. Os módulos internos continuam
existindo porque são carregados pelo `cloud.js`.

## Papéis

`UNOAPI_PROCESS_ROLE` aceita:

- `web`: frontend, HTTP, Socket.IO e publicação de comandos;
- `broker`: filas de envio, webhook, mídia, timer e transcrição;
- `worker`: conexões e operações das sessões Zapo.

Quando `UNOAPI_PROCESS_ROLE` está ausente ou vazio, o processo inicia os três
papéis. Portanto, um container único não precisa declarar essa variável.

## Container único

```yaml
services:
  viperconnect:
    image: ghcr.io/viperteccorporation/viperconnect:4.0.0-beta6
    environment:
      REDIS_URL: redis://redis:6379
      AMQP_URL: amqp://guest:guest@rabbitmq:5672
    ports:
      - "9876:9876"
```

Esse modelo inicia web, broker e worker Zapo no mesmo processo. É adequado
para instalações menores.

## Containers separados

Use a mesma imagem e preserve seu entrypoint:

```yaml
services:
  web:
    image: ghcr.io/viperteccorporation/viperconnect:4.0.0-beta6
    environment:
      UNOAPI_PROCESS_ROLE: web
      REDIS_URL: redis://redis:6379
      AMQP_URL: amqp://guest:guest@rabbitmq:5672
    ports:
      - "9876:9876"

  broker:
    image: ghcr.io/viperteccorporation/viperconnect:4.0.0-beta6
    environment:
      UNOAPI_PROCESS_ROLE: broker
      REDIS_URL: redis://redis:6379
      AMQP_URL: amqp://guest:guest@rabbitmq:5672

  worker-zapo:
    image: ghcr.io/viperteccorporation/viperconnect:4.0.0-beta6
    environment:
      UNOAPI_PROCESS_ROLE: worker
      UNOAPI_WORKER_ENGINE: zapo
      REDIS_URL: redis://redis:6379
      AMQP_URL: amqp://guest:guest@rabbitmq:5672
```

Somente o serviço web publica a porta HTTP. Todos os papéis precisam acessar o
mesmo Redis/Valkey e RabbitMQ.

## Desenvolvimento

`yarn cloud-dev` inicia o entrypoint Cloud com recarga automática. Para isolar
um papel durante o desenvolvimento, defina `UNOAPI_PROCESS_ROLE` no ambiente.
Os atalhos `web-dev`, `worker-dev` e `broker-dev` permanecem apenas para
diagnóstico local.

## Runtime Zapo

Sem configuração adicional:

- `WHATSAPP_ENGINE` usa `zapo`;
- `UNOAPI_WORKER_ENGINE` usa `zapo`;
- sessões Baileys persistidas aparecem offline;
- `deregister` permanece disponível para limpar dados legados;
- novas sessões são pareadas diretamente na Zapo.

O procedimento deliberado para reativar o código legado está em
[BAILEYS_REACTIVATION.md](BAILEYS_REACTIVATION.md).
