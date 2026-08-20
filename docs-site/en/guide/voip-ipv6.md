# Dual-stack IPv4 and IPv6 VoIP

ViperConnect opens independent IPv4 and IPv6 UDP sockets. It does not depend
on an implicit dual-stack bind, so existing IPv4 behavior remains unchanged.

```ini
SIP_RTP_BIND_IPV4=0.0.0.0
SIP_RTP_BIND_IPV6=::
SIP_RTP_PUBLIC_IPV4=203.0.113.10
SIP_RTP_PUBLIC_IPV6_HOST=sip6.yourdomain.com
```

IPv4 peers receive `IN IP4` SDP and the configured public IPv4 address. IPv6
peers receive bracketed SIP URIs and `IN IP6` SDP. IPv4 private-address NAT
rules are not applied to IPv6 peers.

Do not bake a delegated IPv6 prefix into the image or Compose model. Point a
DNS-only AAAA hostname to the current address and configure that hostname as
the public IPv6 identity.

## Validation

```bash
ss -lunp | grep ':5060'
dig +short A sip.yourdomain.com
dig +short AAAA sip6.yourdomain.com
```

Validate registration and bidirectional audio separately with an IPv4 client
and an IPv6 client. Coturn must also have IPv4 and IPv6 listeners and relays;
keep its relay range separate from SIP/RTP and WebRTC media ranges.
