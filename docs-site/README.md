# ViperConnect Developers

Portal oficial separado, construído com VitePress e Scalar. O container expõe
HTTP na porta `8080`; TLS, domínio e cache externo ficam no proxy de borda.

```bash
npm install
npm test
npm run dev
```

Container:

```bash
docker compose -f docs-site/compose.yml up -d --build
```

Validação contra uma API:

```bash
API_BASE_URL=https://api.exemplo.com API_TOKEN=seu-token npm run test:live
```

O build sincroniza `docs/openapi.json`, adiciona rotas registradas em
`src/router.ts`, valida páginas essenciais e impede a exposição de nomes
internos na documentação pública.
