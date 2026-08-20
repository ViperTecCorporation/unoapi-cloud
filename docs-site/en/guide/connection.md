# Connect a session

Register a phone number with the Zapo engine, then request either a QR code or
pairing code. Keep the same connection type until the session is deregistered.

```bash
curl -X POST "https://api.yourdomain.com/v15.0/15551234567/register" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"zapo","connectionType":"qrcode","label":"Sales"}'
```

Use `pairing_code` instead of `qrcode` when the phone must type a generated
code. Connection updates are also delivered through Socket.IO. Wait for the
connected status before sending traffic.

## Safe reconnection

- A normal disconnect should reconnect automatically when `autoConnect` is on.
- Deregistration removes the native credentials and requires a new pairing.
- Do not run two owners for the same session.
- Keep Valkey and the session data volume persistent across container updates.
