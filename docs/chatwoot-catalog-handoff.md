# Handoff Chatwoot: catálogo e pedidos UnoAPI

Este documento é destinado ao agente que implementará os componentes de
catálogo no Chatwoot/ViperChat. O contrato descrito aqui já existe na UnoAPI e
está documentado também em [CATALOG_WEBHOOKS.md](CATALOG_WEBHOOKS.md) e no
OpenAPI.

## Objetivo

Renderizar mensagens recebidas com:

- `messages[].type=product`;
- `messages[].type=order`.

Não alterar o processamento das mensagens comuns de texto e mídia.

## Estado validado na UnoAPI

O caminho abaixo foi validado ao vivo com um pedido preservado no store:

1. evento Zapo recebido pelo listener;
2. identificação do `orderMessage`;
3. tentativa de expansão pelo `BizQueryOrder`;
4. armazenamento da miniatura no media storage;
5. transformação para o envelope público;
6. publicação na fila `unoapi.outgoing.<sessao>`;
7. envio para o webhook cadastrado.

No evento antigo usado na validação, o WhatsApp recusou a expansão dos itens
com `Bad Request`. Mesmo assim, a UnoAPI entregou corretamente a mensagem como
`type=order`, com o mesmo `messages[].id`, miniatura, resumo e
`resolution_status=failed`. Portanto, o Chatwoot deve implementar primeiro o
caminho `failed/summary` e não pode depender de `items` para criar a mensagem.

A expansão `resolution_status=resolved` deve ser validada com um pedido novo,
pois tokens de consulta preservados em eventos antigos podem não ser aceitos
novamente pelo WhatsApp.

## Caminho de implementação e diagnóstico

O primeiro patch no Chatwoot deve deixar o contrato observável de ponta a
ponta antes de criar o card visual completo:

```text
POST /webhooks/whatsapp/:phone
  -> localizar messages[0]
  -> correlacionar por messages[0].id
  -> normalizar product/order
  -> localizar ou criar a mensagem Chatwoot
  -> persistir content + content_attributes
  -> publicar atualização da conversa
  -> renderizador especializado ou fallback textual
```

Em cada fronteira, adicionar log estruturado temporário, sem gravar o payload
integral:

```text
event=unoapi_catalog_received
event=unoapi_catalog_normalized
event=unoapi_catalog_persisted
event=unoapi_catalog_broadcast
```

Campos seguros para correlação:

```text
source_id/messages.id
phone_number_id
message_type
order_id
resolution_status
item_count
chatwoot_message_id
conversation_id
```

Nunca registrar `Authorization`, URL assinada completa, token do pedido,
`mediaKey`, `directPath` ou conteúdo bruto do protobuf.

O agente deve enviar no fechamento:

1. o último evento de diagnóstico alcançado;
2. o `messages[].id` usado na correlação;
3. o ID da mensagem Chatwoot criada ou atualizada;
4. os `content_attributes` persistidos, com URLs e segredos sanitizados;
5. confirmação de que uma reentrega atualiza a mesma mensagem;
6. teste backend demonstrando cada fronteira do caminho.

Depois da validação, manter apenas logs úteis em nível `debug` e remover
qualquer instrumentação temporária excessiva.

### Payload mínimo confirmado para a primeira etapa

Use dados fictícios nos testes:

```json
{
  "messages": [
    {
      "from": "",
      "from_user_id": "123456789012345@lid",
      "id": "uno-order-example-001",
      "timestamp": "1785421664",
      "type": "order",
      "order": {
        "order_id": "order-example-001",
        "status": "inquiry",
        "resolution_status": "failed",
        "item_count": 1,
        "items": [],
        "title": "Loja de exemplo",
        "catalog_type": "NATIVE",
        "image": {
          "url": "https://storage.example.test/catalog/order-example-001.jpg"
        }
      },
      "fallback_text": "*Pedido recebido*\nLoja de exemplo\nItens: 1"
    }
  ]
}
```

Esse payload deve criar uma única bolha, pesquisável pelo `fallback_text`, com
o resumo do pedido e o aviso discreto de detalhes indisponíveis.

## Regra de compatibilidade

Cada evento possui somente uma identidade, `messages[].id`. Não crie uma
segunda mensagem para representar o card. O campo `fallback_text` deve ser
gravado como conteúdo textual da própria mensagem para pesquisa, notificações,
exportação e clientes antigos.

Se o webhook com o mesmo `messages[].id` chegar novamente, atualize a mensagem
existente. Nunca duplique o pedido e nunca regrida o status de entrega/leitura.

## Persistência no backend

Produto:

```ruby
message.content = payload['fallback_text']
message.content_attributes['unoapi_message_type'] = 'product'
message.content_attributes['unoapi_catalog'] = payload['product']
```

Pedido:

```ruby
message.content = payload['fallback_text']
message.content_attributes['unoapi_message_type'] = 'order'
message.content_attributes['unoapi_order'] = payload['order']
```

Antes de persistir, remova defensivamente qualquer campo chamado `token`,
`order_token`, `sensitive_string_value`, `mediaKey` ou `directPath`. A UnoAPI
não os envia, mas o Chatwoot não deve armazená-los se forem acrescentados por
outra integração.

Não converta `product.image` ou `order.image` em uma mensagem separada de
imagem. A imagem pertence ao card.

## Componentes frontend

Criar componentes pequenos no padrão Vue já usado pelo Chatwoot:

```text
UnoapiCatalogMessage.vue
  -> UnoapiProductMessage.vue
  -> UnoapiOrderMessage.vue
       -> UnoapiOrderItem.vue
  -> CatalogImage.vue
  -> CatalogMoney.vue
  -> CatalogResolutionNotice.vue
```

O seletor de conteúdo deve verificar:

```js
message.content_attributes?.unoapi_message_type
```

Valores aceitos: `product` e `order`. Qualquer valor desconhecido usa o
renderer textual atual.

## Card de produto

Exibir:

1. imagem quadrada, quando disponível;
2. título;
3. preço original;
4. preço promocional em destaque, quando disponível;
5. descrição;
6. SKU/código (`retailer_id`);
7. variantes;
8. botão `Ver produto`, quando `url` for HTTPS;
9. `body` e `footer`, quando presentes.

Quando houver promoção, o preço original fica riscado. Valores formatados
fornecidos pela UnoAPI têm prioridade. Se estiverem ausentes, use
`price_amount_1000 / 1000` com a moeda informada.

Não executar HTML vindo de título, descrição, body ou footer.

## Card de pedido

Cabeçalho:

- título `Pedido recebido`;
- `order_id`;
- badge de status;
- quantidade total;
- imagem/miniatura, quando disponível.

Mapeamento do status:

| Valor | pt-BR | en |
|---|---|---|
| `inquiry` | Aguardando atendimento | Awaiting review |
| `accepted` | Aceito | Accepted |
| `declined` | Recusado | Declined |
| `unknown` | Status desconhecido | Unknown status |

Para cada item, exibir:

- imagem;
- nome;
- SKU, quando existir;
- variantes;
- quantidade;
- preço unitário;
- subtotal.

No rodapé, exibir subtotal e total quando disponíveis.

## Estado da resolução

`order.resolution_status` possui três valores:

- `resolved`: renderizar todos os itens;
- `summary`: renderizar título, quantidade, miniatura e `fallback_text`;
- `failed`: renderizar o resumo e um aviso discreto de que os detalhes não
  puderam ser carregados.

Nunca ocultar uma mensagem porque `order.items` está vazio.

O aviso de falha não deve parecer falha no envio da mensagem. O pedido chegou;
somente seus detalhes adicionais ficaram indisponíveis.

## Layout responsivo

- desktop: largura máxima coerente com as demais bolhas, sem ocupar toda a
  conversa;
- mobile: largura total disponível;
- imagens entre 56 e 72 pixels na lista;
- textos longos com quebra segura;
- botão com área mínima de toque;
- mais de quatro itens: lista inicialmente recolhida, com `Ver todos`.

## Acessibilidade

- imagem sem descrição usa alt `Imagem do produto`;
- preço anterior riscado continua disponível para leitor de tela;
- badges não podem depender somente da cor;
- ações possuem rótulo textual;
- foco visível no botão `Ver produto` e no expansor dos itens.

## Traduções

Adicionar pelo menos pt-BR e en:

```text
Produto compartilhado / Shared product
Pedido recebido / Order received
Código / Code
Quantidade / Quantity
Subtotal / Subtotal
Total / Total
Ver produto / View product
Ver detalhes / View details
Ocultar detalhes / Hide details
Ver todos / View all
Aguardando atendimento / Awaiting review
Aceito / Accepted
Recusado / Declined
Detalhes do pedido indisponíveis / Order details unavailable
Imagem do produto / Product image
```

## Segurança

- abrir URL de produto com `rel="noopener noreferrer"`;
- aceitar somente `http` e `https` para imagem e link;
- nunca renderizar texto como HTML;
- não fazer requisição da interface para `sellerJid`, `order_id` ou qualquer
  token;
- os detalhes já chegam resolvidos pela UnoAPI.

## Testes backend

1. produto completo;
2. produto sem imagem;
3. produto com preço promocional;
4. pedido `resolved` com vários itens;
5. pedido `summary` sem itens;
6. pedido `failed`;
7. payload sem `fallback_text`;
8. remoção defensiva de campos sensíveis;
9. reentrega do mesmo `messages[].id` sem duplicação;
10. atualização preservando a maior progressão de status.

## Testes frontend

1. card de produto completo;
2. produto sem imagem;
3. preço normal e promocional;
4. pedido com um item;
5. pedido com vários itens e expansão;
6. estados `summary` e `failed`;
7. item sem preço;
8. item sem imagem;
9. responsividade mobile;
10. conteúdo textual preservado para pesquisa;
11. sanitização de URLs e textos;
12. snapshots em pt-BR e en.

## Critério de aceite

- o pedido recebido aparece uma única vez;
- o componente usa o mesmo ID UnoAPI do webhook;
- produtos e itens são visíveis quando `resolution_status=resolved`;
- resumo continua visível em falha;
- pesquisa encontra o conteúdo de `fallback_text`;
- mensagens antigas em formato texto continuam funcionando;
- nenhum token ou chave de mídia é persistido ou exibido.
