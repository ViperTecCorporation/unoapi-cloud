# Docker Compose

> Estes modelos são para `docker compose` em um único host. Eles usam rede
> bridge e `network_mode: host` na telefonia; não os envie com
> `docker stack deploy`. Para cluster, overlays e portas host-mode explícitas,
> use o guia de [Docker Swarm](/guide/docker-swarm).

Estes são os dois modelos do próprio projeto e usam a imagem
`viperconnect:latest`. Assim, uma nova instalação acompanha automaticamente a
última imagem publicada no canal `latest`. Ambos preservam a arquitetura usada em produção:
web, broker e worker Zapo separados, com Valkey e RabbitMQ persistentes.

Cada tag Git de release no formato `v*` publica duas referências da mesma
imagem: a versão imutável, por exemplo `4.0.12`, e `latest`. Use `latest` para
acompanhar o canal estável automaticamente ou fixe a versão semântica quando
precisar controlar a janela de atualização.

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

A telefonia precisa de um segundo host no proxy de borda, por exemplo
`voip.seudominio.com -> http://HOST_DOCKER:3097`. Habilite WebSocket e preserve
o upgrade em `/sip/ws` e `/v1/bridge/zapo`. Esse domínio deve ser o mesmo usado
em `VOIP_PUBLIC_WS_URL` e `VOIP_BRIDGE_URL`.

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
o entrypoint do Traefik e o `certresolver` nas labels para os nomes usados pelo
seu Traefik. Esse `entrypoint` pertence ao roteador Traefik e não é o
`entrypoint` do container ViperConnect.

## O que alterar antes de subir

Nos dois arquivos, revise:

- `BASE_URL` e domínio;
- `UNOAPI_AUTH_TOKEN`;
- usuário e senha do RabbitMQ em `AMQP_URL` e no serviço;
- senha do Valkey em `REDIS_URL` e no comando do serviço;
- domínio em `VOIP_BRIDGE_URL` e o mesmo segredo em todos os campos de token VoIP;
- `WEBHOOK_URL`, token e header;
- credenciais de armazenamento S3 compatível, caso utilizado.

## Ambiente completo da telefonia

Os arquivos para download incluem o perfil operacional completo observado na
implantação de produção. Antes de subir, substitua domínios, IPs e segredos.

| Variável | Finalidade |
| --- | --- |
| `VOIP_BRIDGE_URL` | Bridge autenticado do worker Zapo; use `wss://voip.seudominio.com.br/v1/bridge/zapo`. |
| `VOIP_SERVICE_TOKEN` e `VOIP_BRIDGE_TOKEN` | Autenticam API interna e bridge; use o mesmo token longo nos dois campos. |
| `VOIP_MAX_CONCURRENT_CALLS` | Capacidade anunciada por linha Zapo; padrão 2, mínimo 1 e máximo 32. Use o mesmo valor no worker e na telefonia. |
| `VOIP_DOMAIN` | Domínio SIP canônico apresentado aos ramais. |
| `VOIP_PUBLIC_WS_URL` | URL pública `wss://` usada por SIP/WebRTC. |
| `VOIP_LAN_DOMAIN` | IP ou domínio acessível pelos ramais da rede local. |
| `VOIP_STUN_URL` | Descoberta de candidatos de rede WebRTC. |
| `VOIP_TURN_URL`, `VOIP_TURN_USERNAME`, `VOIP_TURN_CREDENTIAL` | Relay autenticado para WebRTC quando a conexão direta falhar. |
| `VOIP_CALL_ENGINE` | Deve permanecer `zapo_native`. |
| `VOIP_NATIVE_LOG_LEVEL` | Nível do motor de chamadas; use `info` normalmente e `debug` somente para diagnóstico. |
| `CALL_HISTORY_STORAGE`, `VOIP_APP_STORAGE`, `VOICE_CONFIG_STORAGE` | Mantêm histórico, estado operacional e configuração no SQLite. |
| `VOIP_SQLITE_PATH` | Banco persistido no volume da telefonia. |
| `SIP_RTP_PUBLIC_IP` | Domínio ou IP público anunciado para SIP/RTP. |
| `SIP_RTP_PUBLIC_ADVERTISE_IP` | IP público literal anunciado quando o servidor está atrás de NAT. |
| `SIP_RTP_LAN_IP` | IP anunciado aos ramais da LAN. |
| `SIP_RTP_PORT` | Porta UDP de sinalização SIP tradicional. |
| `SIP_RTP_MEDIA_PORT_MIN/MAX` | Faixa UDP de áudio RTP tradicional. |
| `SIP_WEBRTC_UDP_PORT_MIN/MAX` | Faixa UDP de mídia WebRTC. |
| `SIP_RTP_CODECS` | Codecs SIP permitidos; o exemplo usa `PCMU,PCMA`. |
| `SIP_REGISTER_EXPIRES_SECONDS` | Intervalo de renovação dos registros SIP/WebRTC. |

`203.0.113.10` é um IP reservado para documentação. Troque por seu IP público
real. Se não houver coturn disponível, deixe as três variáveis TURN vazias em
vez de apontar para um serviço inexistente.

No bloco compartilhado da Uno, mantenha este trio com o mesmo host e token do
serviço de telefonia:

```yaml
VOIP_SERVICE_URL: "http://host.docker.internal:3097"
VOIP_BRIDGE_URL: "wss://voip.seudominio.com.br/v1/bridge/zapo"
VOIP_SERVICE_TOKEN: "GERE_UM_TOKEN_LONGO_E_ALEATORIO"
```

No serviço `viperconnect-telefonia`, `VOIP_SERVICE_TOKEN` e
`VOIP_BRIDGE_TOKEN` recebem exatamente esse mesmo segredo. Não coloque o token
na URL e não o exponha em configuração do navegador.

No container, `VOIP_AUTO_UPDATE_ENABLED` e
`VOIP_AUTO_UPDATE_APPLY_ENABLED` permanecem `false`: a atualização acontece com
`docker compose pull` da imagem única. Essas opções ficam ativas somente no
pacote Linux nativo, cujo atualizador troca o artefato instalado pelo `systemd`.

O container usa `network_mode: host`; portanto não adicione `ports:` no serviço
de telefonia. Abra no host `3097/tcp`, `5060/udp`, `12000-13000/udp` e
`13001-14000/udp`. STUN/TURN possui portas próprias e só deve ser publicado se
o serviço correspondente estiver realmente instalado.

## Arquitetura do modelo

Os três serviços ViperConnect usam a mesma imagem e o mesmo bloco de ambiente.
`UNOAPI_PROCESS_ROLE` seleciona `web`, `broker` ou `worker`; somente o worker
declara o motor Zapo. Nenhum serviço substitui o entrypoint oficial da imagem.

Não adicione `entrypoint`, `command`, `yarn cloud` ou `yarn start` ao `x-base`
nem aos serviços `unoapi`, `unoapi-broker`, `unoapi-worker-zapo` e
`viperconnect-telefonia`. A imagem inicia `/home/u/app/container-entrypoint.sh`,
que usa `exec node` e permite ao worker receber `SIGTERM`, desconectar as sessões
e liberar as leases antes de reiniciar.

Embora todos usem a mesma imagem/tag, `unoapi-worker-zapo` e
`viperconnect-telefonia` executam aplicações e árvores de dependência separadas.
O primeiro mantém sessão, protocolo e mídia Zapo; o segundo mantém SIP, ramais,
roteamento e gravações. `UNOAPI_PROCESS_ROLE` escolhe o runtime correto sem
sobrescrever o entrypoint oficial.

Modelo correto:

```yaml
x-base: &base
  image: ghcr.io/viperteccorporation/viperconnect:latest
  restart: always

services:
  unoapi-worker-zapo:
    <<: *base
    environment:
      UNOAPI_PROCESS_ROLE: worker
      UNOAPI_WORKER_ENGINE: zapo
```

Para atualizar depois, execute `docker compose pull && docker compose up -d`.
Esse comando baixa o novo `latest` publicado pela tag de release. Se o Compose
estiver fixado em uma versão, altere a tag explicitamente antes do `pull`.

Somente a API é publicada. Valkey e RabbitMQ ficam restritos à network interna
e mantêm dados nos volumes `redis` e `rabbitmq`.

Para QR code, pairing code e atualizações de conexão, o proxy precisa aceitar o
upgrade do Socket.IO em `/socket.io/`.

Para implantar com `docker stack deploy`, use os arquivos próprios de
[Docker Swarm](/guide/docker-swarm). Eles não possuem `container_name`,
`depends_on`, rede bridge nem `network_mode: host`.
