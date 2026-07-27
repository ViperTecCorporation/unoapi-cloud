# Envio de mensagens

Endpoint comum:

```text
POST /v15.0/{phone}/messages
```

Cabeçalhos:

```http
Authorization: Bearer SEU_TOKEN
Content-Type: application/json
```

## Texto

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "text",
  "text": {
    "body": "Olá!"
  }
}
```

## Imagem, vídeo, áudio e documento

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "image",
  "image": {
    "link": "https://cdn.exemplo.com/foto.jpg",
    "caption": "Legenda"
  }
}
```

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "video",
  "video": {
    "link": "https://cdn.exemplo.com/video.mp4",
    "caption": "Vídeo"
  }
}
```

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "audio",
  "audio": {
    "link": "https://cdn.exemplo.com/audio.ogg"
  }
}
```

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "document",
  "document": {
    "link": "https://cdn.exemplo.com/contrato.pdf",
    "filename": "contrato.pdf"
  }
}
```

## Figurinha, contato e reação

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "sticker",
  "sticker": {
    "link": "https://cdn.exemplo.com/sticker.png"
  }
}
```

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "contacts",
  "contacts": [
    {
      "name": {
        "formatted_name": "Maria"
      },
      "phones": [
        {
          "wa_id": "5511988887777",
          "phone": "+55 11 98888-7777"
        }
      ]
    }
  ]
}
```

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "reaction",
  "reaction": {
    "message_id": "ID_DA_MENSAGEM",
    "emoji": "👍"
  }
}
```

Envie `emoji` vazio para remover uma reação quando a operação for suportada
pela sessão.

## Editar uma mensagem

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "message_edit",
  "context": {
    "message_id": "ID_ORIGINAL"
  },
  "text": {
    "body": "Texto corrigido"
  }
}
```

## Botões de resposta

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": {
      "text": "Como deseja continuar?"
    },
    "action": {
      "buttons": [
        {
          "type": "reply",
          "reply": {
            "id": "continuar",
            "title": "Continuar"
          }
        },
        {
          "type": "reply",
          "reply": {
            "id": "cancelar",
            "title": "Cancelar"
          }
        }
      ]
    }
  }
}
```

## Botões de ação

O contrato aceita `cta_url`, `cta_call` e `cta_copy`. Consulte os schemas e
teste os payloads no [playground](/api-reference).

## Lista

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "header": {
      "type": "text",
      "text": "Planos"
    },
    "body": {
      "text": "Escolha uma opção"
    },
    "footer": {
      "text": "ViperConnect"
    },
    "action": {
      "button": "Ver opções",
      "sections": [
        {
          "title": "Disponíveis",
          "rows": [
            {
              "id": "basico",
              "title": "Básico",
              "description": "Plano inicial"
            },
            {
              "id": "pro",
              "title": "Profissional",
              "description": "Plano completo"
            }
          ]
        }
      ]
    }
  }
}
```

O `id` selecionado retorna em
`messages[].interactive.list_reply.id`. Respostas de botão retornam em
`messages[].interactive.button_reply.id`.

## Enquete

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "poll",
  "poll": {
    "name": "Qual horário você prefere?",
    "options": ["08:00", "13:00", "17:00"],
    "selectableCount": 1,
    "allowAddOption": false,
    "hideParticipantName": false
  }
}
```

`selectableCount` deve ser inteiro entre `1` e a quantidade de opções.

## Carrossel

O carrossel aceita de 2 a 10 cartões. Cada cartão pode ter cabeçalho, corpo,
rodapé e botões de resposta ou ação. O objeto `carousel` fica dentro de
`interactive.action`.

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "interactive",
  "interactive": {
    "type": "carousel",
    "body": {
      "text": "Conheça nossos planos"
    },
    "action": {
      "carousel": {
        "cards": [
          {
            "header": {
              "type": "image",
              "image": {
                "link": "https://vipertec.com.br/_content/ViperERP/img/hotlinecard.jpg"
              }
            },
            "body": {
              "text": "Sistema de automação comercial #1"
            },
            "action": {
              "buttons": [
                {
                  "type": "cta_url",
                  "text": "Agende uma demonstração",
                  "url": "https://vipertec.com.br"
                }
              ]
            }
          },
          {
            "header": {
              "type": "image",
              "image": {
                "link": "https://vipertec.com.br/_content/ViperERP/img/FullCam08.jpg"
              }
            },
            "body": {
              "text": "Segurança a um palmo de sua mão. #2"
            },
            "action": {
              "buttons": [
                {
                  "type": "cta_url",
                  "text": "Contrate agora",
                  "url": "https://vipertec.com.br"
                }
              ]
            }
          }
        ]
      }
    }
  }
}
```

Esse formato, com `action.carousel.cards` e os CTAs em
`cards[].action.buttons`, foi validado em uma sessão Zapo real.

## Pedidos e pagamentos

A solicitação de pagamento é uma mensagem interativa comercial da Zapo. O PIX
estático usa `pix_static_code`; a ação de pagamento deve ser o único botão da
mensagem.

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "action": {
      "buttons": [
        {
          "type": "payment_request",
          "payment_setting": {
            "type": "pix_static_code",
            "pix_static_code": {
              "merchant_name": "Minha Empresa",
              "key": "financeiro@minhaempresa.com.br",
              "key_type": "EMAIL"
            }
          }
        }
      ]
    }
  }
}
```

O envio gera internamente o fluxo nativo `payment_info`.

### PIX dinâmico avulso

Para enviar PIX dinâmico sem itens de pedido, mantenha o botão
`payment_request`, informe o total e use `pix_dynamic_code`. `reference_id` é
opcional nesse formato; quando ausente, a Uno gera um identificador.

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": {
      "text": "Pague R$ 149,90 via PIX"
    },
    "action": {
      "buttons": [
        {
          "type": "payment_request",
          "payment_request": {
            "type": "digital-goods",
            "payment_type": "br",
            "payment_settings": [
              {
                "type": "pix_dynamic_code",
                "pix_dynamic_code": {
                  "code": "000201010212...",
                  "merchant_name": "Minha Empresa",
                  "key": "12345678000199",
                  "key_type": "CNPJ"
                }
              }
            ],
            "currency": "BRL",
            "total_amount": {
              "value": 14990,
              "offset": 100
            }
          }
        }
      ]
    }
  }
}
```

### Pedido com imagem e PIX dinâmico

Este é o modelo completo para exibir uma imagem do pedido, a descrição, os
itens e o pagamento. A imagem fica em `interactive.header.image.link`; a Uno
baixa e envia essa mídia pelo protocolo Zapo.

O pedido usa `interactive.type: order_details` e a ação `review_and_pay`. Para
usar imagem, o objeto `order` é obrigatório. A URL da imagem deve ser pública e
retornar diretamente um arquivo de imagem.

```json
{
  "messaging_product": "whatsapp",
  "to": "5511912008012",
  "type": "interactive",
  "interactive": {
    "type": "order_details",
    "header": {
      "type": "image",
      "image": {
        "link": "https://cdn.minhaempresa.com.br/pedido-123.jpg"
      }
    },
    "body": {
      "text": "Revise e pague seu pedido"
    },
    "action": {
      "name": "review_and_pay",
      "parameters": {
        "reference_id": "pedido-123",
        "type": "physical-goods",
        "payment_type": "br",
        "payment_settings": [
          {
            "type": "pix_dynamic_code",
            "pix_dynamic_code": {
              "code": "000201010212...",
              "merchant_name": "Minha Empresa",
              "key": "12345678000199",
              "key_type": "CNPJ"
            }
          }
        ],
        "currency": "BRL",
        "total_amount": {
          "value": 50000,
          "offset": 100
        },
        "order": {
          "status": "pending",
          "tax": {
            "value": 0,
            "offset": 100,
            "description": "Sem impostos adicionais"
          },
          "items": [
            {
              "retailer_id": "produto-1",
              "name": "Produto",
              "amount": {
                "value": 50000,
                "offset": 100
              },
              "quantity": 1
            }
          ],
          "subtotal": {
            "value": 50000,
            "offset": 100
          }
        }
      }
    }
  }
}
```

`value` usa a menor unidade da moeda: `50000` com `offset: 100` representa
R$ 500,00. O campo `code` deve receber o PIX copia e cola dinâmico completo,
gerado pelo banco ou PSP. Para o formato simplificado, remova apenas o objeto
`order` e também o `header`: pedidos simplificados não aceitam imagem.

### Link de pagamento

Use o mesmo envelope `order_details` e substitua `payment_settings` por:

```json
[
  {
    "type": "payment_link",
    "payment_link": {
      "uri": "https://pagamentos.minhaempresa.com.br/pedido-123"
    }
  }
]
```

### Boleto

O boleto também usa `order_details`. A linha digitável deve ser gerada e
confirmada pelo banco ou PSP:

```json
[
  {
    "type": "boleto",
    "boleto": {
      "digitable_line": "03399026944140000002628346101018898510000008848"
    }
  }
]
```

### Pedido real com boleto, PIX dinâmico e imagem

Este modelo reúne os recursos validados em um pedido: miniatura do item,
descrição da assinatura, linha digitável do boleto e PIX copia e cola. Informe
boleto e PIX dentro de `payment_settings` e mantenha uma `reference_id` única,
pois ela será usada para confirmar o pagamento.

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "interactive",
  "interactive": {
    "type": "order_details",
    "header": {
      "type": "image",
      "image": {
        "link": "https://commons.wikimedia.org/wiki/Special:Redirect/file/Security_camera_(1).jpg?width=800"
      }
    },
    "body": {
      "text": "Boleto nº 1033239253 referente à assinatura de Câmera Comodato Mensal — 1 unidade. Vencimento: 10/07/2026. Valor: R$ 60,00."
    },
    "action": {
      "name": "review_and_pay",
      "parameters": {
        "reference_id": "boleto-1033239253",
        "type": "digital-goods",
        "payment_type": "br",
        "payment_settings": [
          {
            "type": "boleto",
            "boleto": {
              "digitable_line": "36490000920005525230800000010918900000000006000"
            }
          },
          {
            "type": "pix_dynamic_code",
            "pix_dynamic_code": {
              "code": "00020101021226940014BR.GOV.BCB.PIX2572qrcodespix.sejaefi.com.br/bolix/v2/cobv/663b44b6c993415e9e09f92c106d48865204000053039865802BR5905EFISA6008SAOPAULO62070503***63047595",
              "merchant_name": "EFISA",
              "key": "663b44b6c993415e9e09f92c106d4886",
              "key_type": "EVP"
            }
          }
        ],
        "currency": "BRL",
        "total_amount": {
          "value": 6000,
          "offset": 100
        },
        "order": {
          "status": "pending",
          "tax": {
            "value": 0,
            "offset": 100,
            "description": "Sem impostos adicionais"
          },
          "items": [
            {
              "retailer_id": "camera-comodato-mensal",
              "name": "Câmera Comodato Mensal",
              "amount": {
                "value": 6000,
                "offset": 100
              },
              "quantity": 1
            }
          ],
          "subtotal": {
            "value": 6000,
            "offset": 100
          }
        }
      }
    }
  }
}
```

Substitua o destinatário, a imagem, a linha digitável e o código PIX pelos
dados gerados pelo seu banco ou PSP. O pedido não possui campo de anexo PDF.
Envie o boleto em PDF logo depois, usando a mesma `reference_id` no nome do
arquivo ou na legenda:

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "document",
  "document": {
    "link": "https://cdn.minhaempresa.com.br/boletos/boleto-1033239253.pdf",
    "filename": "boleto-1033239253.pdf",
    "caption": "Boleto nº 1033239253"
  }
}
```

### Pagamento com cartão em um clique

Contas habilitadas para essa funcionalidade podem usar:

```json
[
  {
    "type": "offsite_card_pay",
    "offsite_card_pay": {
      "last_four_digits": "5235",
      "credential_id": "credencial-123"
    }
  }
]
```

Quando o comprador confirma, o webhook chega como
`interactive.type: payment_method`, preservando `credential_id`,
`reference_id`, os quatro últimos dígitos e o horário da confirmação. A
disponibilidade dessa modalidade depende da habilitação da conta.

### Confirmação do pagamento

Depois da confirmação pelo banco ou PSP, envie `order_status` com a mesma
`reference_id` do pedido. A Uno localiza e cita internamente o
`order_details` original para que o aplicativo atualize o cartão do pedido de
pendente para pago.

Espere o webhook de status do pedido informar `sent` ou `delivered` antes de
enviar esta confirmação. A resposta HTTP inicial confirma a entrada na fila,
mas não que o pedido já foi processado pelo provedor.

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "interactive",
  "interactive": {
    "type": "order_status",
    "body": {
      "text": "Pagamento confirmado para o boleto nº 1033239253."
    },
    "footer": {
      "text": "Assinatura confirmada"
    },
    "action": {
      "name": "review_order",
      "parameters": {
        "reference_id": "boleto-1033239253",
        "order": {
          "status": "completed",
          "description": "Pagamento confirmado. Assinatura de Câmera Comodato Mensal paga."
        },
        "payment": {
          "status": "captured",
          "timestamp": 1785125734
        }
      }
    }
  }
}
```

`payment.status: captured` marca o pagamento como confirmado.
`order.status: completed` encerra o pedido. O `timestamp` é Unix em segundos e
deve representar o momento real da confirmação.

Tipos de pagamento fora dessa lista retornam
`zapo_payment_request_type_not_supported`.

## Menções, respostas e Status

- Para mencionar números, use `text.mentions` ou `mentions`.
- Em grupos, menções presentes como `@5511999999999` no corpo também são
  normalizadas.
- Respostas citadas usam o ID público da mensagem no contexto.
- Publicações em Status usam as opções próprias mostradas no OpenAPI.

Tipos sem capacidade Zapo não são anunciados como suportados e retornam erro
explícito em vez de utilizar outro motor.
