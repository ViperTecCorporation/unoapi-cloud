# Catálogo e pedidos recebidos

Este documento descreve o contrato público usado quando a Zapo recebe um produto
compartilhado ou um pedido criado pelo catálogo do WhatsApp.

Referências oficiais:

- <https://zapo.to/en/reference/message-types#product-raw>
- <https://zapo.to/en/reference/message-types#order-raw>
- `WaMexBizQueryOrderVariables` e `WaMexBizQueryOrderResponse` da versão de
  `zapo-js` fixada em `package.json`.

## Fluxo

```text
evento message da Zapo
  -> productMessage ou orderMessage
  -> ZapoCatalog
       -> baixa imagem para o storage Uno
       -> resolve orderId + sellerJid + token via BizQueryOrder
  -> transformer
  -> webhook Cloud API-like
```

O token de consulta do pedido é usado somente entre UnoAPI e WhatsApp. Ele não é
persistido no payload público nem encaminhado ao webhook.

Falha no download da imagem ou na consulta detalhada não descarta a mensagem. O
pedido ainda é encaminhado com `resolution_status=failed` ou `summary` e sempre
inclui `fallback_text`.

## Produto

`productMessage` é encaminhado como `messages[].type=product`:

```json
{
  "from": "5566999999999",
  "id": "ID_UNOAPI",
  "timestamp": "1784900000",
  "type": "product",
  "product": {
    "product_id": "product_123",
    "retailer_id": "sku_001",
    "title": "Produto de demonstração",
    "description": "Descrição fictícia do produto",
    "currency": "BRL",
    "price_amount_1000": 129900,
    "sale_price_amount_1000": 119900,
    "formatted_price": "R$ 129,90",
    "formatted_sale_price": "R$ 119,90",
    "url": "https://example.test/products/product_123",
    "image": {
      "url": "https://storage.example.test/catalog/product_123.jpg",
      "mime_type": "image/jpeg"
    },
    "business_owner_id": "123456789@lid",
    "body": "Tenho interesse neste produto",
    "footer": "Disponível"
  },
  "fallback_text": "*Produto*: Produto de demonstração\nPreço: R$ 119,90\nCódigo: sku_001"
}
```

Valores monetários com sufixo `_amount_1000` são inteiros multiplicados por
1000. Isso preserva o protocolo Zapo e evita arredondamento em ponto flutuante.

A imagem criptografada do `productMessage` é baixada pela Zapo e copiada para o
storage configurado na UnoAPI. O webhook não recebe `mediaKey`, `directPath`,
token ou a URL temporária criptografada do WhatsApp.

## Pedido

`orderMessage` é encaminhado como `messages[].type=order`. A UnoAPI usa
`orderId`, `sellerJid` e o token privado do evento para consultar
`BizQueryOrder`.

Pedido resolvido:

```json
{
  "from": "5566999999999",
  "id": "ID_UNOAPI",
  "timestamp": "1784900000",
  "type": "order",
  "order": {
    "order_id": "order_123",
    "title": "Pedido de demonstração",
    "status": "inquiry",
    "catalog_type": "NATIVE",
    "resolution_status": "resolved",
    "currency": "BRL",
    "item_count": 2,
    "subtotal_amount_1000": 259800,
    "total_amount_1000": 259800,
    "formatted_subtotal": "R$ 259,80",
    "formatted_total": "R$ 259,80",
    "image": {
      "url": "https://storage.example.test/catalog/order_123.jpg",
      "mime_type": "image/jpeg"
    },
    "items": [
      {
        "product_id": "product_123",
        "title": "Produto de demonstração",
        "quantity": 2,
        "currency": "BRL",
        "unit_price_amount_1000": 129900,
        "subtotal_amount_1000": 259800,
        "formatted_unit_price": "R$ 129,90",
        "formatted_subtotal": "R$ 259,80",
        "variants": [
          { "name": "Cor", "value": "Preto" }
        ]
      }
    ]
  },
  "fallback_text": "*Pedido recebido*\nPedido de demonstração\nItens: 2\n2x Produto de demonstração — R$ 259,80\nTotal: R$ 259,80"
}
```

Estados de resolução:

- `resolved`: a consulta retornou pelo menos um produto;
- `summary`: o evento não tinha as referências necessárias ou a consulta não
  retornou produtos;
- `failed`: a tentativa de consulta falhou. A mensagem e seu resumo continuam
  sendo enviados.

Os status do pedido são normalizados para `inquiry`, `accepted`, `declined` ou
`unknown`.

Quando `orderRequestMessageId` estiver presente, `messages[].context.message_id`
contém o ID UnoAPI da mensagem referenciada, nunca o ID interno da Zapo.

## Compatibilidade da aplicação

Aplicações com componente de catálogo devem usar `product` ou `order`. Sistemas
que ainda não conhecem esses tipos podem apresentar `fallback_text`. Não crie
duas mensagens para o mesmo evento: `messages[].id` é a identidade idempotente.

Um consumidor nunca deve ocultar o pedido porque `items` está vazio. Nessa
situação, renderize `fallback_text` e o estado de resolução.

## Reprocessamento

Mensagens Zapo são armazenadas com o ID original do provider e associadas ao ID
UnoAPI. Um evento de catálogo preservado pode ser passado novamente pelo
transformer para validar o contrato sem enviar nada ao contato. Ao encaminhar o
resultado a uma aplicação, reutilize o mesmo ID UnoAPI para atualizar a
mensagem existente em vez de criar duplicata.
