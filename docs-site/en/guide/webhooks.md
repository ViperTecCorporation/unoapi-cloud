# Webhooks

Each session may have multiple independent destinations. Configure the URL,
authorization header, token, timeout and event switches in the Manager.

The common event envelope follows this structure:

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "messages": []
      }
    }]
  }]
}
```

Media persisted by ViperConnect keeps both `id` and `url` for compatibility.
Consumers should prefer the authenticated download flow by ID when available.
Profile pictures additionally provide a stable `picture_id` and cache
information.

Interactive replies preserve their original context. Button and list replies
are sent as replies to the originating message and must not prepend an agent
name. Delivery statuses are normalized and lower-rank or repeated updates are
discarded.

Use the outgoing blacklist TTL to suppress selected follow-up events for a
recipient without disabling the entire webhook.
