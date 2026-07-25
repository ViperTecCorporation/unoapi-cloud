# Frontend do ViperConnect

O painel em `public/index.html` é uma aplicação TypeScript modular, compilada de
`frontend/` para `public/app/`. A interface não depende de jQuery, Bootstrap ou
DataTables.

## Regras de negócio

- O Dashboard é a única listagem de sessões e atualiza automaticamente a cada
  15 segundos quando não há página de sessão ou modal aberto.
- `Gerenciar` abre uma página completa da sessão, com retorno ao Dashboard.
- Configuração, contatos, webhooks e grupos sempre pertencem à sessão aberta.
- Conexão, teste de mensagem e deregister são modais contextuais da sessão.
- Sessões novas são registradas com `provider: zapo`.
- O provider não é editável no painel. Sessões antigas persistidas como Baileys
  aparecem offline e oferecem somente a remoção. O `deregister` limpa auth,
  estado transitório, status e configuração no Redis; o mesmo telefone pode
  então ser registrado novamente na Zapo.
- Contatos usam LID como identidade principal, telefone como apresentação e
  exibem `username` quando o store da Zapo o disponibilizar.
- Fotos de contato são lidas do cache existente. Abrir a tela não força uma
  consulta remota ao WhatsApp.
- O ID do webhook aparece apenas dentro do modal de criação/edição.

## Organização

```text
frontend/
  components/  componentes visuais reutilizáveis
  core/        cliente HTTP, socket e helpers seguros de HTML
  domain/      tipos e regras puras de sessão
  features/    configuração, entidades, webhooks e modais
  pages/       Dashboard e página da sessão
  app.ts       estado e orquestração da interface
  main.ts      ponto de entrada
```

Controllers HTTP continuam no backend. A interface chama as rotas públicas
existentes por meio de `core/api.ts`; regras de apresentação ficam em funções
pequenas e testáveis.

## Build e validação

```bash
yarn build:frontend
yarn build
yarn test
```

O build do projeto já executa a compilação do frontend antes do backend. A
imagem Docker copia os fontes e gera os artefatos em `public/app/`. O backend
usa `tsconfig.runtime.json`, partindo de `cloud.ts`; entrypoints e clients
exclusivos da Baileys não entram no `dist` da imagem. `yarn build:all` permanece
disponível somente para validar todo o código legado durante manutenção.

Os testes ficam em `__tests__/frontend/` e validam contratos HTTP, filtragem,
sanitização, componentes, páginas, cards e modais.

## Operação dos workers

O worker Zapo é o único worker habilitado no Compose. O serviço Baileys foi
removido do YAML e a política interna rejeita qualquer tentativa de reconectar
uma sessão legada com o erro `baileys_provider_disabled_deregister_required`.

O entrypoint padrão da imagem e o comando Linux `yarn start` usam
`dist/src/cloud.js`. Para dividir responsabilidades, configure
`UNOAPI_PROCESS_ROLE=web`, `broker` ou `worker`. Quando a variável não é
declarada, o mesmo processo inicia os três papéis. Não sobrescreva o entrypoint
da imagem com `yarn cloud`.

Veja [CLOUD_ARCHITECTURE.md](CLOUD_ARCHITECTURE.md) para os modelos de container.
