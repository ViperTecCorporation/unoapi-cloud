# Profile picture metadata in webhooks

Unoapi keeps sending the legacy profile picture URL and also exposes a stable
`picture_id`. Consumers that cannot access MinIO, S3 or R2 directly can use the
authenticated UnoAPI download route instead of the presigned URL.

When a cached profile picture exists in storage, Unoapi includes storage metadata beside the URL.

## Contact payload

```json
{
  "contacts": [
    {
      "profile": {
        "name": "Maria",
        "picture": "https://.../profile-pictures/556699999999.jpg?...",
        "picture_id": "556699999999",
        "picture_metadata": {
          "etag": "\"eaed9c5735d6cdf4b5416c800fb39868\"",
          "last_modified": "2026-06-15T19:24:29.000Z",
          "content_length": "41053",
          "content_type": "image/jpeg"
        }
      },
      "wa_id": "556699999999"
    }
  ]
}
```

## Group payload

```json
{
  "contacts": [
    {
      "group_id": "120363040468224422@g.us",
      "group_picture": "https://.../profile-pictures/120363040468224422%40g.us.jpg?...",
      "group_picture_metadata": {
        "etag": "\"eaed9c5735d6cdf4b5416c800fb39868\"",
        "last_modified": "2026-06-15T19:24:29.000Z",
        "content_length": "41053",
        "content_type": "image/jpeg"
      }
    }
  ]
}
```

## Source

For S3/R2 storage, metadata comes from `HeadObjectCommand`, which does not download the image. The presigned URL is still generated with `GetObjectCommand`.

`picture_id` is derived from the stable PN or LID identity and never from the
signed URL. Changing only the URL signature does not change the ID. Typebot
webhooks omit `picture`, `picture_id` and `picture_metadata` because its schema
is strict.

## Authenticated download

```http
GET /v13.0/{session}/profile-pictures/{picture_id}
Authorization: TOKEN
```

The session accepts its phone, configured Meta ID or existing alias. The
picture ID accepts PN, LID and group JID. PN/LID aliases are resolved against
the session data store. UnoAPI reads the object internally and streams the
image without redirecting to the bucket or exposing a new signed URL.

Responses include `Content-Type`, `Content-Length`, `ETag`, `Last-Modified` and
`Cache-Control`. `If-None-Match` is supported and returns `304` without opening
the object stream. Images are limited to 10 MiB. The filesystem backend reads
legacy global profile-picture paths once and migrates them to the canonical
session-scoped path.

Consumers can build a stable change signature from:

- normalized picture URL path
- `etag`
- `last_modified`
- `content_length`
- `content_type`

Legacy consumers may continue using `picture`; new consumers should prefer the
authenticated ID route.
