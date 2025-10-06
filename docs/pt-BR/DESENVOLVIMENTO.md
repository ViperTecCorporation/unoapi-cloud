# Guia de Desenvolvimento

## Dev Local com Docker

- Build e subir serviços de dev:
  - `docker compose up -d --build web worker redis rabbitmq minio`
- Hot‑reload:
  - Código montado em `/app` com `nodemon`.
  - Polling ativado para estabilidade no Windows.
- Debug no VS Code:
  - Inspector: `web` → `9229`, `worker` → `9230`.
  - `.vscode/launch.json` já possui “Attach: web/worker”.

## Scripts Úteis

- `yarn web-dev` / `yarn worker-dev` — serviços com nodemon.
- `yarn build` — compilação TypeScript.
- `yarn test` — testes com Jest.

## Endpoints Comuns

- Health: `GET /ping` → `pong!`
- UI da sessão: `GET /session/{phone}` → QR code + pairing/config via Socket.IO.
- Enviar mensagem: `POST /v15.0/{phone}/messages` (formato Cloud API).
- Validação de contatos (standalone): `POST /{phone}/contacts`.

## Teste de Status/Broadcast

Exemplo (imagem):

```
POST /v15.0/{phone}/messages
{
  "to": "status@broadcast",
  "type": "image",
  "image": { "link": "https://.../image.png", "caption": "Hello" },
  "statusJidList": ["5511999999999", "5511888888888"]
}
```

Resposta adiciona ao Cloud API:

```
{
  ...,
  "status_skipped": ["5511..."],
  "status_recipients": 123
}
```

## Problemas Comuns

- Erro de certificado ao baixar `wait-for` no build:
  - Corrigido em `develop.Dockerfile` (instala `ca-certificates` e usa `curl`).
- `voice-calls-baileys` não encontrado:
  - `vendor/` é copiado antes do `yarn install` (corrigido no `develop.Dockerfile`).
- Breakpoints não param:
  - Ative sourcemaps no TS (`"sourceMap": true`) ou use `ts-node` nos scripts dev.

## Wiki do GitHub (opcional)

- Há um workflow em `.github/workflows/wiki-sync.yml` para sincronizar `docs/` → Wiki.
- Configure o secret do repositório `WIKI_TOKEN` (PAT com `repo` e acesso ao Wiki).
- Ao fazer push na branch principal, arquivos em `docs/` serão publicados na Wiki do repositório.
