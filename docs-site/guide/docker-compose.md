# Docker Compose

Estes são os dois modelos do próprio projeto e usam a imagem
`viperconnect:latest`. Assim, uma nova instalação acompanha automaticamente a
última imagem publicada no canal `latest`. Ambos preservam a arquitetura usada em produção:
web, broker e worker Zapo separados, com Valkey e RabbitMQ persistentes.

## Proxy Nginx na borda

Use quando o domínio e o TLS já são administrados pelo Nginx Proxy Manager ou
por outro proxy externo.

<a class="compose-download" href="/examples/docker-compose.unoapi-nginx.yml" download="docker-compose.unoapi-nginx.yml">↓ Baixar Compose para Nginx/proxy de borda</a>

```bash
curl -fsSL \
  https://docs.seudominio.com.br/examples/docker-compose.unoapi-nginx.yml \
  -o docker-compose.yml

nano docker-compose.yml
docker compose config
docker compose pull
docker compose up -d
curl http://127.0.0.1:9876/ping
```

Aponte o proxy para `http://HOST_DOCKER:9876`. Se ele estiver na mesma network
Docker, use `http://unoapi:9876`. Não há outro servidor HTTP dentro do stack.

## Traefik

Use quando o Traefik já está conectado à network externa `traefik-public`.

<a class="compose-download" href="/examples/docker-compose.unoapi-traefik.yml" download="docker-compose.unoapi-traefik.yml">↓ Baixar Compose para Traefik</a>

```bash
docker network create traefik-public

curl -fsSL \
  https://docs.seudominio.com.br/examples/docker-compose.unoapi-traefik.yml \
  -o docker-compose.yml

nano docker-compose.yml
docker compose config
docker compose pull
docker compose up -d
```

Se a network já existir, não execute `docker network create`. Ajuste o domínio,
entrypoint e `certresolver` nas labels para os nomes usados pelo seu Traefik.

## O que alterar antes de subir

Nos dois arquivos, revise:

- `BASE_URL` e domínio;
- `UNOAPI_AUTH_TOKEN`;
- usuário e senha do RabbitMQ em `AMQP_URL` e no serviço;
- senha do Valkey em `REDIS_URL` e no comando do serviço;
- `WEBHOOK_URL`, token e header;
- credenciais de armazenamento S3 compatível, caso utilizado.

## Arquitetura do modelo

Os três serviços ViperConnect usam a mesma imagem e o mesmo bloco de ambiente.
`UNOAPI_PROCESS_ROLE` seleciona `web`, `broker` ou `worker`; somente o worker
declara o motor Zapo. Nenhum serviço substitui o entrypoint oficial da imagem.

Para atualizar depois, execute `docker compose pull && docker compose up -d`.

Somente a API é publicada. Valkey e RabbitMQ ficam restritos à network interna
e mantêm dados nos volumes `redis` e `rabbitmq`.

Para QR code, pairing code e atualizações de conexão, o proxy precisa aceitar o
upgrade do Socket.IO em `/socket.io/`.
