# Native Linux telephony

The telephony package runs SIP, RTP and WebRTC directly on the host. This is
useful when the API remains containerized but media needs predictable host
networking.

Configure the bridge and public identity:

```ini
UNOAPI_PROCESS_ROLE=voip
PORT=3097
VOIP_SERVICE_TOKEN=GENERATE_A_LONG_RANDOM_TOKEN
VOIP_BRIDGE_TOKEN=GENERATE_A_LONG_RANDOM_TOKEN
VOIP_DOMAIN=sip.yourdomain.com
VOIP_PUBLIC_WS_URL=wss://voip.yourdomain.com/sip/ws
SIP_RTP_BIND_IPV4=0.0.0.0
SIP_RTP_BIND_IPV6=::
SIP_RTP_PUBLIC_IPV4=203.0.113.10
SIP_RTP_PUBLIC_IPV6_HOST=sip6.yourdomain.com
SIP_RTP_PORT=5060
SIP_RTP_MEDIA_PORT_MIN=12000
SIP_RTP_MEDIA_PORT_MAX=13000
SIP_WEBRTC_UDP_PORT_MIN=13001
SIP_WEBRTC_UDP_PORT_MAX=14000
```

Use the same bridge token in the Zapo worker and telephony service. Proxy
`/sip/ws` and `/v1/bridge/zapo` with WebSocket upgrade enabled. Open the media
ports on both firewall families and verify listeners with `ss -lntup`.
