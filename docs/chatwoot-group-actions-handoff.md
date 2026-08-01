# Handoff: ações de grupo UnoAPI pendentes no Chatwoot

## Objetivo

Adicionar ao Chatwoot as ações de grupo que já possuem rota HTTP na UnoAPI e
fechar os testes de integração com sessões Zapo.

Este documento usa a API `v15.0`. Substitua:

- `{baseUrl}` pela URL da UnoAPI, por exemplo `https://unoapi.example.com`;
- `{phone}` pelo número da sessão, somente com dígitos;
- `{groupId}` pelo JID do grupo, por exemplo `120363040468224422@g.us`;
- `{token}` pelo token aceito pela UnoAPI.

Cabeçalhos:

```http
Authorization: Bearer {token}
Content-Type: application/json
```

## Estado atual das configurações

Antes de desenhar os toggles, carregue o estado atual:

```http
GET {baseUrl}/v15.0/{phone}/groups/{groupId}
```

Os campos públicos são independentes do motor da sessão. A UnoAPI converte
`announce` e `restrict`, usados no metadata de Baileys e Zapo, para:

```json
{
  "id": "120363040468224422@g.us",
  "announcement": true,
  "locked": false,
  "join_approval_mode": "approval_required"
}
```

Não presuma `false` quando um campo estiver ausente. Nesse caso, mantenha o
controle sem estado definido até uma nova consulta ou sincronização do grupo.

## 1. Somente administradores podem enviar

Rota:

```http
PATCH {baseUrl}/v15.0/{phone}/groups/{groupId}
```

Ativar modo anúncio:

```json
{
  "announcement": true
}
```

Desativar modo anúncio:

```json
{
  "announcement": false
}
```

Resposta esperada:

```json
{
  "id": "120363040468224422@g.us",
  "announcement": true,
  "updated": true
}
```

Sugestão de texto no Chatwoot: `Somente administradores podem enviar`.

## 2. Bloquear edição das informações do grupo

Usa a mesma rota:

```http
PATCH {baseUrl}/v15.0/{phone}/groups/{groupId}
```

Bloquear:

```json
{
  "locked": true
}
```

Desbloquear:

```json
{
  "locked": false
}
```

Resposta esperada:

```json
{
  "id": "120363040468224422@g.us",
  "locked": true,
  "updated": true
}
```

Sugestão de texto no Chatwoot: `Somente administradores podem editar o grupo`.

## 3. Exigir aprovação para entrada no grupo

Usa a mesma rota:

```http
PATCH {baseUrl}/v15.0/{phone}/groups/{groupId}
```

Exigir aprovação:

```json
{
  "join_approval_mode": "approval_required"
}
```

Permitir entrada sem aprovação:

```json
{
  "join_approval_mode": "open"
}
```

Resposta esperada:

```json
{
  "id": "120363040468224422@g.us",
  "join_approval_mode": "approval_required",
  "updated": true
}
```

Sugestão de texto no Chatwoot: `Aprovar novos participantes`.

## 4. Alterar várias configurações de uma vez

Os três campos podem ser enviados na mesma chamada:

```http
PATCH {baseUrl}/v15.0/{phone}/groups/{groupId}
```

```json
{
  "announcement": true,
  "locked": true,
  "join_approval_mode": "approval_required"
}
```

Resposta esperada:

```json
{
  "id": "120363040468224422@g.us",
  "announcement": true,
  "locked": true,
  "join_approval_mode": "approval_required",
  "updated": true
}
```

## 5. Sair do grupo

Rota:

```http
DELETE {baseUrl}/v15.0/{phone}/groups/{groupId}
```

Não envia corpo.

Resposta esperada:

```json
{
  "group_id": "120363040468224422@g.us",
  "deleted": true
}
```

No Chatwoot:

1. Exibir confirmação antes da chamada.
2. Informar que sair do grupo não pode ser desfeito pelo Chatwoot.
3. Após sucesso, atualizar ou remover o grupo da listagem local.
4. Não repetir automaticamente a chamada em caso de timeout sem antes consultar
   o estado do grupo.

## 6. Promover ou rebaixar administradores

Rota:

```http
PATCH {baseUrl}/v15.0/{phone}/groups/{groupId}/participants
```

Promover:

```json
{
  "action": "promote",
  "participants": [
    {
      "wa_id": "556699999999",
      "user_id": "123456789012345@lid"
    }
  ]
}
```

Resposta:

```json
{
  "group_id": "120363040468224422@g.us",
  "promoted": [
    "123456789012345@lid"
  ],
  "failed": []
}
```

Rebaixar:

```json
{
  "action": "demote",
  "participants": [
    {
      "wa_id": "556699999999",
      "user_id": "123456789012345@lid"
    }
  ]
}
```

Resposta:

```json
{
  "group_id": "120363040468224422@g.us",
  "demoted": [
    "123456789012345@lid"
  ],
  "failed": []
}
```

Regras para o Chatwoot:

1. Priorizar `user_id` quando o participante tiver LID.
2. Enviar também `wa_id` quando estiver disponível.
3. Exibir a ação somente para quem puder administrar o grupo.
4. Não promover novamente quem já for administrador.
5. Não permitir que o usuário rebaixe a si próprio sem confirmação explícita.
6. Atualizar a lista de participantes somente após resposta bem-sucedida.
7. Tratar itens retornados em `failed` individualmente.

## Tratamento de erros

Erros de validação conhecidos:

```json
{ "error": "missing phone param" }
```

```json
{ "error": "missing groupId param" }
```

```json
{ "error": "no supported group changes provided" }
```

```json
{ "error": "action must be promote or demote" }
```

As rotas de grupo podem responder `404` quando as rotas Meta-like estiverem
desativadas e `500` quando o WhatsApp/Zapo rejeitar a operação. O Chatwoot deve
preservar o estado anterior do controle quando a chamada falhar.

## Checklist mínimo de testes no Chatwoot

- [ ] Ativar `announcement` e confirmar que membro comum não consegue enviar.
- [ ] Desativar `announcement` e confirmar que membro comum volta a enviar.
- [ ] Ativar `locked` e confirmar que membro comum não edita nome, descrição ou
      imagem.
- [ ] Desativar `locked` e confirmar que a edição volta a funcionar.
- [ ] Ativar `approval_required` e validar uma solicitação real de entrada.
- [ ] Voltar para `open` e validar entrada sem aprovação.
- [ ] Alterar os três campos em uma única chamada.
- [ ] Sair de um grupo de teste e atualizar a interface após `deleted: true`.
- [ ] Promover um participante por LID e atualizar sua função para administrador.
- [ ] Rebaixar um administrador por LID e atualizar sua função para membro.
- [ ] Exibir falha individual sem alterar os demais participantes.
- [ ] Rejeitar no frontend qualquer ação diferente de `promote` ou `demote`.
- [ ] Validar erro de permissão quando a sessão não é administradora.
- [ ] Validar rollback visual do toggle quando a API responder erro.
- [ ] Garantir que as ações não sejam exibidas para inbox que não usa UnoAPI.
- [ ] Adicionar testes de request/service e de componente para cada ação.

## Outras rotas de grupo que devem ser conferidas no Chatwoot

Estas rotas já existem na UnoAPI. Antes de considerar o módulo de grupos
completo, confirmar se todas possuem interface e testes no Chatwoot.

### Consultar e redefinir link de convite

```http
GET  {baseUrl}/v15.0/{phone}/groups/{groupId}/invite_link
POST {baseUrl}/v15.0/{phone}/groups/{groupId}/invite_link
```

O alias com hífen também existe:

```http
GET  {baseUrl}/v15.0/{phone}/groups/{groupId}/invite-link
POST {baseUrl}/v15.0/{phone}/groups/{groupId}/invite-link
```

### Solicitações pendentes de entrada

Listar:

```http
GET {baseUrl}/v15.0/{phone}/groups/{groupId}/join_requests
```

Aprovar:

```http
POST {baseUrl}/v15.0/{phone}/groups/{groupId}/join_requests
```

```json
{
  "participants": [
    {
      "wa_id": "556699999999",
      "user_id": "123456789012345@lid"
    }
  ]
}
```

Rejeitar:

```http
DELETE {baseUrl}/v15.0/{phone}/groups/{groupId}/join_requests
```

O corpo é o mesmo da aprovação.

## Critério de conclusão

As ações deste documento podem ser adicionadas e testadas agora. O módulo só
deve ser considerado totalmente coberto depois de:

1. confirmar link de convite e solicitações de entrada no Chatwoot;
2. possuir teste automatizado para cada ação e teste real com uma sessão Zapo.
