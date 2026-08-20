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
```

Use separate systemd units when web, broker, video and worker roles run on the
same machine. Persist `/home/u/app/data` and media storage, terminate TLS at the
edge proxy, and confirm `/ping` before connecting a session.

## Upgrade and rollback

Build a new immutable release, update the `current` symlink and restart only
after validation. Keep the previous release and environment file unchanged so
rollback does not require rebuilding credentials or session data.
