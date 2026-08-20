# Docker Compose

The project provides complete single-host models for Nginx or another edge
proxy and for Traefik. Both use the unified `latest` image, separate web,
broker, video and Zapo worker roles, persistent Valkey and RabbitMQ, and host
networking for telephony.

- [Download the Nginx/edge-proxy model](/examples/docker-compose.unoapi-nginx.yml)
- [Download the Traefik model](/examples/docker-compose.unoapi-traefik.yml)

```bash
curl -fsSL https://docs.yourdomain.com/examples/docker-compose.unoapi-nginx.yml \
  -o docker-compose.yml
nano docker-compose.yml
docker compose config
docker compose pull
docker compose up -d
curl http://127.0.0.1:9876/ping
```

Before deployment, replace every domain, token, password, public address and
storage credential. Keep the same RabbitMQ password in the service and
`AMQP_URL`, and the same Valkey password in `REDIS_URL`, `--requirepass` and the
healthcheck.

## Production-tested Valkey persistence

The downloadable models use:

```yaml
command: >
  valkey-server
  --appendonly yes
  --appendfsync everysec
  --no-appendfsync-on-rewrite no
  --save 3600 1
  --requirepass "CHANGE_THIS_PASSWORD"
  --protected-mode no
```

AOF is flushed every second and remains protected during rewrites. RDB is kept
as an hourly safety snapshot after at least one change. This replaces the old
60, 300 and 900-second snapshots that repeatedly rewrote large datasets. The
6379 port is not published; keep it on the internal network and require a
password.

## Telephony ports

The telephony container uses `network_mode: host`. Open `3097/tcp`, `5060/udp`,
`12000-13000/udp` and `13001-14000/udp` on IPv4 and IPv6. Do not add a Docker
`ports` block to that service. Keep `SIP_RTP_PUBLIC_IPV4` separate from
`SIP_RTP_PUBLIC_IPV6_HOST`.
