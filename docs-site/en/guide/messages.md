# Messages

Send messages through the Cloud API-compatible endpoint:

```http
POST /v15.0/{session}/messages
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

## Choose a format

Every message uses the same endpoint. The `type` field selects the required
content block.

| I want to send | `type` | Source |
| --- | --- | --- |
| plain text or a reply | `text` | `text` object |
| image, video, audio, document or sticker | media type | matching media object |
| buttons, lists or carousel | `interactive` | `interactive` object |
| poll or vote | `poll` / `poll_vote` | poll object |
| order or payment flow | interactive type | order/payment object |

::: info Compatibility
`link` and `id` preserve the existing contract. `base64` is a ViperConnect
extension. Never send more than one source for the same media object.
:::

```json
{
  "messaging_product": "whatsapp",
  "to": "15557654321",
  "type": "text",
  "text": { "body": "Hello!" }
}
```

## Media by URL

The existing `link` contract remains unchanged:

```json
{
  "messaging_product": "whatsapp",
  "to": "15557654321",
  "type": "image",
  "image": {
    "link": "https://cdn.example.com/photo.jpg",
    "caption": "Optional caption"
  }
}
```

## Direct Base64 media

As a ViperConnect extension, `image`, `video`, `audio`, `document` and
`sticker` accept raw Base64 or a Data URI. Use exactly one source: `link`, `id`
or `base64`.

```json
{
  "messaging_product": "whatsapp",
  "to": "15557654321",
  "type": "image",
  "image": {
    "base64": "/9j/4AAQSkZJRgABAQ...",
    "mime_type": "image/jpeg",
    "filename": "photo.jpg",
    "caption": "Optional caption"
  }
}
```

```json
{
  "messaging_product": "whatsapp",
  "to": "15557654321",
  "type": "document",
  "document": {
    "base64": "data:application/pdf;base64,JVBERi0xLjQK...",
    "filename": "contract.pdf"
  }
}
```

ViperConnect validates and stores the bytes before publishing the job. Base64
content is not copied into RabbitMQ, logs or webhooks. Videos continue through
the dedicated preparation worker. The default decoded limit is 32 MiB
(`UNOAPI_MEDIA_BASE64_MAX_BYTES`) and the message-route JSON limit defaults to
`48mb` (`UNOAPI_MESSAGES_JSON_LIMIT`).

## Addressing

The destination may be a phone number, LID, group ID or cached username. When
available, send all known identity fields:

```json
{
  "to": "15557654321",
  "user_id": "12345678901234@lid",
  "username": "maria",
  "type": "text",
  "text": { "body": "Hello" }
}
```

The canonical LID takes precedence, followed by the local identity cache and a
network lookup. Polls, reactions, interactive buttons, lists, carousels,
payments, order details and order status updates are available in the
[interactive API reference](/en/api-reference).
