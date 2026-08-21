# Native Linux installation

The native installer targets Debian 12 and Ubuntu 24.04. It installs Node.js
24, checks out an immutable release, builds the runtime and manages it through
systemd while retaining previous releases for rollback.

## Required services

Install and secure Valkey or Redis and RabbitMQ first. Create an environment
file containing at least:

```ini
BASE_URL=https://api.yourdomain.com
PORT=9876
UNOAPI_AUTH_TOKEN=GENERATE_A_LONG_RANDOM_TOKEN
REDIS_URL=redis://:STRONG_PASSWORD@127.0.0.1:6379
AMQP_URL=amqp://viperconnect:STRONG_PASSWORD@127.0.0.1:5672
UNOAPI_PROCESS_ROLE=web
ZAPO_NETWORK_IP_FAMILY=auto
# Optional worker overrides; an empty value inherits the global policy.
ZAPO_CHAT_SOCKET_IP_FAMILY=
ZAPO_MEDIA_UPLOAD_IP_FAMILY=
ZAPO_MEDIA_DOWNLOAD_IP_FAMILY=
ZAPO_LINK_PREVIEW_IP_FAMILY=
```

Set `ZAPO_NETWORK_IP_FAMILY=ipv6first` on the Zapo worker to prefer IPv6 for
the WhatsApp WebSocket, media upload/download and link previews while retaining
IPv4 fallback. Channel overrides can select a different order. A configured
`PROXY_URL` remains authoritative for DNS and egress family.

## Publish the native API over IPv6

Native Linux has no Docker bridge: the worker uses the host IPv6 route directly.
Validate `ip -6 route`, DNS and `curl -6` first. For public API access, terminate
TLS in Nginx or Traefik with IPv4 and `[::]:443` listeners, then proxy to
`127.0.0.1:9876`. Node remains a protected backend while the proxy controls
certificates, limits and firewall policy.

See the complete procedure in the
[IPv4 and IPv6 networking guide](/en/guide/network-ipv6).

Use separate systemd units when web, broker, video and worker roles run on the
same machine. Persist `/home/u/app/data` and media storage, terminate TLS at the
edge proxy, and confirm `/ping` before connecting a session.

## Upgrade and rollback

Build a new immutable release, update the `current` symlink and restart only
after validation. Keep the previous release and environment file unchanged so
rollback does not require rebuilding credentials or session data.
