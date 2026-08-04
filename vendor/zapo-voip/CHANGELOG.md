# @zapo-js/voip

## 1.0.0-viper.3

### ViperConnect fixes

- Troca o transporte baseado em PeerConnection pelo helper nativo direto
  UDP/DTLS/SCTP/DataChannel, compilado na imagem do ViperConnect.
- Alinha selecao de relay, allocate, keepalive, subscriptions e identidade de
  participante com o fluxo direto validado por vetores do MeowCaller.
- Corrige devices exatos na sinalizacao, encerramento por reject/ACK com erro e
  offers recebidos ja encerrados.
- Corrige recepcao E2E-SRTP com variantes autenticadas de device, PT 120/121 e
  marker RTP preservado durante DTX/priming.
- Adiciona vetores e testes do helper nativo, STUN, SRTP, SSRC, RTP e uma captura
  MLow real. A validacao com relay vivo continua sendo uma etapa de release.

## 1.0.0

### Major Changes

- Initial release: WhatsApp VOIP (calling) plugin for `zapo-js`. Registers on
  `WaClient` via `voipPlugin()` and exposes the calling API at `client.voip`.
- MLow voice codec through `libmlow-wasm` (WASM, no native build step or bundled
  binaries).
- Full media stack: `<call>` signaling, RTP/SRTP, STUN, WebRTC/SCTP relay
  transport, and audio engine.
- Pre-recorded outbound audio (`loadAudio`) and live 16 kHz mono PCM
  (`feedLiveAudio`).
- Multi-call support with per-call `CallMediaSession` instances and
  `maxConcurrentCalls` (default `1`). Extra incoming offers wait with
  `canAccept: false` until a slot frees.
- Incoming `<call>`, call-class `<ack>`, and call `<receipt>` handlers are
  registered automatically (prepend, no double-ack).
- Requires `zapo-js@^1.0.0` and `libmlow-wasm`. ViperConnect compiles the native
  DTLS/SCTP relay helper from `native/relay-bridge`; `fluent-ffmpeg` remains optional
  for file decode in `loadAudio`.
