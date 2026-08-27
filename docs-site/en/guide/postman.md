# Test with Postman

The official collection includes the routes and examples from the interactive
reference, including messages, media, contacts, groups, webhooks, telephony and
payments.

[Download the ViperConnect Postman collection](/examples/ViperConnect.postman_collection.json)

## Import

1. Download the file above.
2. Select **Import** in Postman and choose the JSON file.
3. Open **ViperConnect API**, then select **Variables**.
4. Fill in `base_url`, `token`, `phone`, `session` and `to`.
5. Save the collection before sending the first request.

The collection applies `Authorization: Bearer {{token}}` automatically. The
distributed file never contains a real credential.

## Test the payment lifecycle

In the **Mensagens** folder:

1. Run a creation example such as **PIX dinâmico avulso**.
2. Set a new `payment_reference_id` and send the charge.
3. Wait until its webhook status reaches `sent` or `delivered`.
4. Run **Confirmar pagamento e manter pedido em processamento**.
5. Run **Concluir pedido já pago** after fulfillment finishes.

The collection refreshes `unix_timestamp` automatically before every request.
WhatsApp does not verify bank settlement; send the confirmation only after your
bank, gateway or PSP reports that the payment was captured.

## Maintenance

The collection is generated from `docs/openapi.yaml` with:

```bash
yarn build:docs
```

Do not edit the generated JSON manually. Update the OpenAPI source and generate
it again so the collection and interactive reference remain synchronized.
