# Contatos

O ViperConnect possui três operações diferentes para contatos:

- `GET /{phone}/contacts` lista o cache isolado da sessão, com paginação e pesquisa;
- `POST /{phone}/contacts` verifica se números ou usernames existem no WhatsApp;
- `POST /{phone}/contacts/import` adiciona ou atualiza um contato na agenda sincronizada do WhatsApp.

## Adicionar à agenda do WhatsApp

```bash
curl -X POST "https://seu-dominio/5500000000001/contacts/import" \
  -H "Authorization: SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "5500000000002",
    "full_name": "Contato Exemplo",
    "first_name": "Contato"
  }'
```

Quando a aplicação já conhece o LID, envie também `user_id`:

```json
{
  "phone_number": "5500000000002",
  "user_id": "000000000000002@lid",
  "full_name": "Contato Exemplo",
  "first_name": "Contato",
  "username": "contato_exemplo"
}
```

Resposta:

```json
{
  "success": true,
  "contact": {
    "phone_number": "5500000000002",
    "full_name": "Contato Exemplo",
    "first_name": "Contato",
    "user_id": "000000000000002@lid",
    "username": "contato_exemplo"
  }
}
```

O `phone_number` da resposta pode ser diferente do número de apresentação
enviado. Quando há LID, o ViperConnect recupera e usa o PN exato armazenado pela
Zapo, sem inserir ou remover o nono dígito no envelope do provider.

Sem `user_id`, a sessão consulta o WhatsApp para resolver o LID antes da
mutação. Se a identidade não puder ser resolvida, a API retorna erro explícito e
não fabrica um mapeamento.

## Listar contatos da sessão

```bash
curl "https://seu-dominio/5500000000001/contacts?limit=20&cursor=0&search=exemplo" \
  -H "Authorization: SEU_TOKEN"
```

Use `next_cursor` na página seguinte enquanto `has_more` for `true`. O diretório
é isolado por sessão e pode ser pesquisado por nome, telefone, username ou LID.

Veja todos os campos, respostas e exemplos na [referência interativa](/api-reference).
