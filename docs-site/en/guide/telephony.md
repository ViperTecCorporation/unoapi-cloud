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

## SIP proxy/SBC with a private RTP relay

By default, a public peer that advertises a private `c=IN IP4` address is
handled as NAT and the signaling source address remains authoritative. Some
SBCs and SIP proxies signal through a public IP while relaying media through a
private address that is routable from the VoIP host.

Allow only their public signaling IPs:

```ini
SIP_RTP_TRUSTED_PRIVATE_SDP_PEERS=203.0.113.20,203.0.113.21
```

This is a peer allowlist, not the ViperConnect public address. It applies to
offers, answers and re-INVITEs. Leave it empty for direct extensions; do not use
wildcards, hostnames or broad networks. It does not create routes or firewall
rules, so forward the complete configured RTP range when NAT is present.

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

The WhatsApp media relay also supports parallel IPv4 and IPv6 endpoints with
explicit `udp4` and `udp6` sockets. Relay family is independent from the SIP/RTP
extension family, so an IPv6 relay can feed an IPv4 extension without NAT64.
Zapo owns the session, public Meow Caller contracts are used as wire references,
and ViperConnect adds the PCM bridge, codec policy, dual-stack handling,
recovery and safe telemetry.
