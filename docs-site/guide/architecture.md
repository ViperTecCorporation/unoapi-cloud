# Arquitetura e cobertura

A documentação é construída a partir de três fontes verificáveis:

1. `src/router.ts`, que define método HTTP, caminho, autenticação e controller;
2. `src/controllers`, que valida entradas e define respostas HTTP;
3. `docs/openapi.json`, que fornece schemas, exemplos e descrições detalhadas.

Durante o build, essas fontes são combinadas em `public/openapi.json`. Uma rota
nova registrada no código e ausente da referência faz `npm test` falhar.

## Domínios auditados

| Domínio | Controller | Cobertura |
|---|---|---|
| Sessões e números | `SessionController`, `PhoneNumberController` | estado, listagem, registro e diagnóstico |
| Registro | `RegistrationController` | register, deregister e configuração de webhook |
| Pareamento | `PairingCodeController`, `ConnectController` | QR Code, pairing code e tela de conexão |
| Mensagens | `MessagesController` | envio, recuperação de entrega e respostas |
| Mídia | `MediaController` | leitura, download e aliases de mídia |
| Contatos | `ContactsController` | validação e diretório paginado |
| Grupos | `GroupsController` | grupos, participantes, convites e solicitações |
| Webhooks | `WebhookController` | recebimento, verificação e encaminhamento |
| Administração | `QueuesController`, `RedisAdminController` | filas, chaves e diagnóstico protegido |

## Política de fidelidade

- O portal documenta somente o runtime Zapo.
- Capacidade inexistente deve responder erro explícito; não é apresentada como
  suportada.
- Exemplos de payload são JSON válido e passam pelo build.
- A referência mostra `x-source-controller` e `x-source-route` para operações
  descobertas diretamente no código.
- O teste ao vivo verifica `/ping` e `/sessions` sem executar ações destrutivas.

## Comandos de validação

```bash
cd docs-site
npm test
```

```bash
API_BASE_URL=https://api.exemplo.com \
API_TOKEN=seu-token \
npm run test:live
```
