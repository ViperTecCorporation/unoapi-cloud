# Plugin Zapo VoIP dedicado da ViperTec

This package is a vendored copy of `@zapo-js/voip`. It preserves the public
coordinator API and the upstream MIT license while allowing ViperConnect to
maintain the media fixes without following a complete Zapo repository fork.

## ViperTec changes

- honor explicit `peerDevices` when building an outgoing offer;
- propagate `self_pid` and `peer_pid` from the offer ACK into relay registration;
- subscribe every known peer SSRC instead of only the first device;
- resend relay subscriptions after the accepting device or actual SSRC changes;
- add the `3480` web-token relay variant only for `authTokenId=0` or FOPS relays.

The primary WhatsApp relay path remains `3478`. This package does not contain
SIP, PBX, bridge, routing, recording, UI, or Baileys fallback code.

Upstream: <https://github.com/vinikjkkj/zapo>
