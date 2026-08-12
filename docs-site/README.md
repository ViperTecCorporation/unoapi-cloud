# ViperConnect Developers

Portal oficial separado, construído com VitePress e Scalar. O container expõe
HTTP na porta `8080`; TLS, domínio e cache externo ficam no proxy de borda.

```bash
npm install
npm test
npm run dev
```

Container de desenvolvimento com hot reload:

```bash
docker compose -f docs-site/compose.dev.yml up -d --build
```

O modo de desenvolvimento observa as páginas, tema, componentes, OpenAPI,
rotas e exemplos de instalação. Alterações em `docs/openapi.yaml` regeneram e
recarregam automaticamente a referência do Scalar.

Container de produção com build estático:

```bash
docker compose -f docs-site/compose.yml pull
docker compose -f docs-site/compose.yml up -d
```

O workflow `.github/workflows/docs-image.yml` valida, constrói para
`linux/amd64` e `linux/arm64` e publica no GitHub Container Registry:

```text
ghcr.io/viperteccorporation/viperconnect-docs:latest
```

Branches também recebem a própria tag, releases `vX.Y.Z` geram tags semânticas
e todo build publicado recebe `sha-<commit>`.

Para fixar uma versão em vez de acompanhar `latest`:

```bash
DOCS_TAG=4.0.13 docker compose -f docs-site/compose.yml up -d
```

Validação contra uma API:

```bash
API_BASE_URL=https://api.exemplo.com API_TOKEN=seu-token npm run test:live
```

O build sincroniza `docs/openapi.json`, adiciona rotas registradas em
`src/router.ts`, valida páginas essenciais e impede a exposição de nomes
internos na documentação pública.
