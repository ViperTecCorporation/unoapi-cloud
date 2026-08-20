# Zapo telephony

The unified image includes the VoIP service and the authenticated bridge used
by the Zapo session worker. The bridge remains internal; SIP, WebRTC and media
are exposed by the dedicated telephony process.

## Extension modes

- **Extension**: one traditional endpoint registration with the normal
  per-extension behavior.
- **Trunk**: multiple simultaneous calls are allowed up to the configured
  account and service limits.

The Manager exposes the mode next to the generated extension credentials so an
administrator does not need per-customer code exceptions.

## Recording

Recording is controlled by the recording settings. When disabled, no new call
recording is created. Retention removes expired local or stored recordings
according to `retentionDays`; zero disables automatic removal.

The video worker is unrelated to call audio. It remains a separate process so
large WhatsApp video conversions do not delay normal message queues.

## Routing and concurrency

Configure companies, accounts, line groups, extension groups and extensions in
the Manager. `maxConcurrentCalls` accepts values from 2 to 32. The effective
capacity is still limited by the upstream line and available media resources.

## Health checks

Confirm the HTTP health endpoint, the worker bridge, SIP registration, RTP in
both directions, WebSocket upgrade and storage access. Use the
[dual-stack guide](/en/guide/voip-ipv6) when IPv6 is enabled.
