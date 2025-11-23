## Coexistência Web + Meta (Baileys v7)

### Visão geral
- Permite operar cliente Web (Baileys) e cliente Meta (Cloud API) em paralelo.
- Primeira mensagem 1:1 sai pelo Web; ao receber mensagem via Meta abre janela de 24h no Redis.
- Com janela aberta, envios 1:1 passam a sair pelo Meta; grupos permanecem no Web.

### Pré-requisitos
- Redis acessível (`REDIS_URL`).
- Token da Cloud API válido e phone_number_id configurado.
- Sessão Web (QR/device) já conectada.

### Variáveis de ambiente
- Ativar: `COEXISTENCE_ENABLED=true`
- TTL opcional: `COEXISTENCE_WINDOW_SECONDS=86400` (padrão 24h)
- Cloud API (já usadas no forwarder):
  - `WEBHOOK_FORWARD_URL=https://graph.facebook.com`
  - `WEBHOOK_FORWARD_VERSION=v17.0` (ajuste se necessário)
  - `WEBHOOK_FORWARD_PHONE_NUMBER_ID=<seu_phone_number_id>`
  - `WEBHOOK_FORWARD_TOKEN=<Bearer da Cloud API>`
  - `WEBHOOK_FORWARD_BUSINESS_ACCOUNT_ID=<opcional>`
- Verificação de webhook: `UNOAPI_AUTH_TOKEN` (ou `authToken` na config Redis).

### Configuração por sessão no Manager (`/public/index`)
- Ao editar/adicionar sessão, preencha:
  - Coexistência: habilitar toggle e (opcional) janela em segundos.
  - Cloud API: base URL, versão, `phone_number_id`, token e Business Account ID (opcional).
  - Demais campos do Web permanecem iguais.
- Todas as configs são persistidas na sessão específica (Redis), não é global.

### Webhook Meta (entrada)
- Configure no BM/WA Cloud: `https://<host>/webhooks/whatsapp/<phone>`
- Use o verify token de `UNOAPI_AUTH_TOKEN`.
- Assine eventos de `messages`/`statuses`.
- O webhook aciona a abertura da janela de 24h para os contatos que enviarem mensagens via Meta.

### Fluxo de mensagens
1. Envio 1:1 inicial → Web (Baileys) sem template.
2. Resposta via Meta (webhook) → abre janela 24h no Redis para o contato.
3. Com janela aberta → envios 1:1 seguem pelo Meta; cada envio renova a janela.
4. Expirou a janela → volta a enviar pelo Web até nova mensagem Meta abrir outra janela.
5. Grupos e status continuam sempre pelo Web.
6. Endereçamento Meta: apenas PN (dígitos, ex.: `55...`). Se o destino vier em `@lid`, ele é normalizado para número antes de enviar; grupos nunca vão para o Meta.

### Como usar
- Suba a aplicação com as envs acima.
- Faça login QR normalmente.
- Verifique logs (nível debug) por `COEX window opened`.
- Teste: envie mensagem 1:1 (sai Web), responda pelo contato (via Meta), depois envie novamente (deve sair Meta).

### Observações
- Se `COEXISTENCE_ENABLED=false` ou Cloud não estiver configurado, tudo funciona como antes (apenas Web).
- Nenhuma rota AMQP mudou; somente o roteamento 1:1 e o webhook Meta passam a controlar a janela de 24h.
