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

## Group Mentions in Text

For `POST /v15.0/{phone}/messages` with `type: "text"` and `to` ending with `@g.us`:

- `@all` or `@todos` in `text.body`:
  - sets `mentionAll=true` before sending to Baileys
  - removes only `@all`/`@todos` from final text
- `@<valid_phone>` in `text.body`:
  - auto-populates `mentions[]` (normalized to `@s.whatsapp.net`)
  - keeps phone mention text in `body`
- When combined (`@phones` + `@all/@todos`), both are applied.

Examples:

```
POST /v15.0/{phone}/messages
{
  "to": "120363012345678@g.us",
  "type": "text",
  "text": { "body": "Aviso @todos" }
}
```

```
POST /v15.0/{phone}/messages
{
  "to": "120363012345678@g.us",
  "type": "text",
  "text": { "body": "Oi @5566996269251 e @5566996222471" }
}
```

```
POST /v15.0/{phone}/messages
{
  "to": "120363012345678@g.us",
  "type": "text",
  "text": { "body": "Oi @5566996269251, @5566996222471 @all" }
}
```

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

Note:
- If statusJidList is empty or null and type is image/video, Unoapi auto-fills from Redis contact-info keys (unoapi-contact-info:<phone>:*).
- If the list is still empty, no relay happens.

Response augments Cloud API with:

```
{
  ...,
  "status_skipped": ["5511..."],
  "status_recipients": 123
}
```

## Reaction Example

```
POST /v15.0/{phone}/messages
{
  "to": "5511999999999",
  "type": "reaction",
  "reaction": {
    "message_id": "MESSAGE_ID",
    "emoji": "👍"
  }
}
```

## Sticker Example

PNG/JPG/GIF are auto-converted to WEBP before sending.

```
POST /v15.0/{phone}/messages
{
  "to": "5511999999999",
  "type": "sticker",
  "sticker": {
    "link": "https://example.com/sticker.png"
  }
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
