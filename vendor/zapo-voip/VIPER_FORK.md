# Plugin Zapo VoIP dedicado da ViperTec

This package is a vendored copy of `@zapo-js/voip`. It preserves the public
coordinator API and the upstream MIT license while allowing ViperConnect to
maintain the media fixes without following a complete Zapo repository fork.

## ViperTec changes

- preserva o device JID exato em `offer`, `accept`, `reject` e respostas de
  `relaylatency`;
- ignora offers ja encerrados e encerra corretamente em `reject` remoto ou ACK
  com erro;
- seleciona apenas um relay por chamada: FNA no inbound e, no outbound, prioriza
  non-FNA com `auth_token_id`;
- mantem `token_id` e `auth_token_id` independentes e aceita token binario ou
  textual;
- usa transporte direto UDP -> DTLS -> SCTP -> DataChannel negotiated id 0 pelo
  helper nativo em `native/relay-bridge`, sem ICE/PeerConnection;
- envia allocate e ping na abertura e a cada segundo, sem iniciar STUN Binding
  Requests;
- propaga `self_pid` e `peer_pid`, assina todos os SSRCs conhecidos e refaz a
  subscription quando o device aceito ou o SSRC real muda;
- preserva a identidade E2E-SRTP exata e tenta variantes autenticadas `:0`/bare
  somente na recepcao;
- aceita RTP de audio PT 120 e 121 e mantem o marker para a primeira fala real,
  sem consumi-lo em DTX/priming.

O endpoint e a porta sao sempre os recebidos no `te2` selecionado; o plugin nao
forca `3478` nem `3480`. Este pacote contem somente a camada de chamada e midia.
SIP, PBX, bridge, roteamento, gravacao e interface permanecem no servico VoIP.

O mapeamento completo contra o MeowCaller, incluindo diferencas intencionais e o
roteiro de validacao ao vivo, esta em `docs/voip-meowcaller-audit.md` na raiz do
ViperConnect.

Upstream: <https://github.com/vinikjkkj/zapo>
