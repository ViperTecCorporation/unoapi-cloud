# Arquitetura de processos Cloud

## Entrypoint único

A imagem de produção declara o entrypoint:

```text
/home/u/app/container-entrypoint.sh
```

O script usa `exec node`: inicia `voip/dist/app.js` quando
`UNOAPI_PROCESS_ROLE=voip` e `dist/src/cloud.js` nos demais papéis. Assim o Node
permanece como PID 1, recebe `SIGTERM` e consegue liberar as leases das sessões
antes do container sair. Não sobrescreva o entrypoint da imagem com `yarn
cloud`, `yarn web`, `yarn start` ou comandos semelhantes.
Para os papéis da Uno, o comando equivalente no diretório da aplicação é
`node dist/src/cloud.js`.

Nos arquivos Compose de produção, omita tanto `entrypoint` quanto `command`.

Os scripts diretos de produção `web`, `worker`, `broker`, `bridge` e
`standalone` foram removidos do `package.json`. Os módulos internos continuam
existindo porque são carregados pelo `cloud.js`.

## Papéis

`UNOAPI_PROCESS_ROLE` aceita:

- `web`: frontend, HTTP, Socket.IO e publicação de comandos;
- `broker`: filas de envio, webhook, mídia, timer e transcrição, além dos
  consumidores de campanhas, comandos e status em lote;
- `worker`: conexões e operações das sessões Zapo.

Quando `UNOAPI_PROCESS_ROLE` está ausente ou vazio, o processo inicia os três
papéis. Portanto, um container único não precisa declarar essa variável.

## Container único

```yaml
services:
  viperconnect:
    image: ghcr.io/viperteccorporation/viperconnect:latest
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
    image: ghcr.io/viperteccorporation/viperconnect:latest
    environment:
      UNOAPI_PROCESS_ROLE: web
      REDIS_URL: redis://redis:6379
      AMQP_URL: amqp://guest:guest@rabbitmq:5672
    ports:
      - "9876:9876"

  broker:
    image: ghcr.io/viperteccorporation/viperconnect:latest
    environment:
      UNOAPI_PROCESS_ROLE: broker
      REDIS_URL: redis://redis:6379
      AMQP_URL: amqp://guest:guest@rabbitmq:5672

  worker-zapo:
    image: ghcr.io/viperteccorporation/viperconnect:latest
    environment:
      UNOAPI_PROCESS_ROLE: worker
      UNOAPI_WORKER_ENGINE: zapo
      REDIS_URL: redis://redis:6379
      AMQP_URL: amqp://guest:guest@rabbitmq:5672
```

Somente o serviço web publica a porta HTTP. Todos os papéis precisam acessar o
mesmo Redis/Valkey e RabbitMQ. O papel `broker` também inicia internamente o
bulker; não crie um quarto container para ele.

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
