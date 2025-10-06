# Development Guide

## Local Dev with Docker.

- Build and run dev services:
  - `docker compose up -d --build web worker redis rabbitmq minio`
- Hot‑reload:
  - Source is mounted at `/app` with `nodemon`.
  - Polling enabled for stability on Windows.
- Debug with VS Code:
  - Inspector: `web` → `9229`, `worker` → `9230`.
  - `.vscode/launch.json` contains attach configs (`Attach: web`, `Attach: worker`).

## Useful Scripts

- `yarn web-dev` / `yarn worker-dev` — run services with nodemon.
- `yarn build` — TypeScript build.
- `yarn test` — Jest tests.

## Common Endpoints

- Health: `GET /ping` → `pong!`
- Session UI: `GET /session/{phone}` → QR code + pairing/config UI via Socket.IO.
- Send Message: `POST /v15.0/{phone}/messages` (Cloud API shape).
- Contacts validation (standalone): `POST /{phone}/contacts`.

## Status/Broadcast Testing

Example (image Story):

```
POST /v15.0/{phone}/messages
{
  "to": "status@broadcast",
  "type": "image",
  "image": { "link": "https://.../image.png", "caption": "Hello" },
  "statusJidList": ["5511999999999", "5511888888888"]
}
```

Response augments Cloud API with:

```
{
  ...,
  "status_skipped": ["5511..."],
  "status_recipients": 123
}
```

## Troubleshooting

- Cert error fetching `wait-for` during build:
  - Fixed in `develop.Dockerfile` by installing `ca-certificates` and using `curl`.
- `voice-calls-baileys` not found:
  - Ensure `vendor/` is copied before `yarn install` (fixed in `develop.Dockerfile`).
- Breakpoints not hit:
  - Enable TS sourcemaps (`tsconfig.json` → `"sourceMap": true`) or use `ts-node` in dev scripts.

## GitHub Wiki (optional)

- A workflow is included at `.github/workflows/wiki-sync.yml` to sync `docs/` → Wiki.
- Configure a repository secret `WIKI_TOKEN` (PAT with `repo` and Wiki access).
- On pushes to the default branch, files under `docs/` are published to the repo Wiki.
