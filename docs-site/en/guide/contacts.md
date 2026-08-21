# Contacts

The contacts endpoint returns the cached directory for a Zapo session. Results
are cursor-paginated and use a canonical LID-first identity contract.

```http
GET /15551234567/contacts?cursor=0&limit=100&q=mar
Authorization: Bearer YOUR_TOKEN
```

```json
{
  "contacts": [
    {
      "user_id": "12345678901234@lid",
      "phone_number": "15557654321",
      "username": "maria",
      "name": "Maria"
    }
  ],
  "next_cursor": "100",
  "has_more": true
}
```

`user_id` is the canonical LID, `phone_number` contains digits only and
`username` is optional. A username complements the identity; it does not
replace the phone number or LID. Searches start after three characters in the
Manager.

Contact import is idempotent. When the network confirms a new canonical LID,
the local alias cache is updated and the response returns the resolved value.
