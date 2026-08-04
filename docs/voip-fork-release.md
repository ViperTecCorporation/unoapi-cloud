# Plugin VoIP dedicado mantido pela ViperTec

A UnoAPI usa o pacote `@vipertec/zapo-voip`, mantido diretamente em
`vendor/zapo-voip` dentro do ViperConnect. Ele nao depende de acompanhar um fork
completo do repositorio Zapo.

Versao atualmente integrada: `1.0.0-viper.3`.

O pacote e incorporado ao build por `file:vendor/zapo-voip`. A pasta contem o
codigo-fonte auditavel e o `dist` usado em producao, tornando a imagem
reproduzivel sem depender do registry npm durante o build.

Principais ajustes locais:

- descoberta explicita dos dispositivos do destinatario antes da oferta;
- DataChannel WASM pre-negociado com label `pre-negotiated` e id `0`;
- transporte de relay direto `UDP -> DTLS client -> SCTP client -> DataChannel`,
  sem ICE, SDP ou `RTCPeerConnection`; o helper Go estatico fica dentro da mesma
  imagem e e iniciado por chamada pelo worker Zapo;
- Allocate STUN com token, endpoint e os nove stream descriptors `0x4024`
  derivados de `call-id + LID` nos slots `[0,1,4,2,3,5,7,8,6]`;
- consent ping `0x0801` enviado depois do Allocate e renovacao conjunta durante
  o keepalive;
- resposta `Binding Success` autenticada para cada `Binding Request` de consent
  enviado pelo relay;
- framing RTP/WARP com perfil `0xDEBE` e palavra DTX `0x30010000` somente nos
  frames de comfort-noise;
- sequencia RTP inicial `1` e timestamp inicial `0`, conforme os vetores do
  MeowCaller;
- oferta usando `enc` inline para um unico dispositivo e
  `destination > to[jid] > enc` somente para multiplos dispositivos, conforme
  o envelope validado pelo MeowCaller;
- aceite de chamada recebida adiado ate o primeiro `mute_v2`, sem transportar
  uma segunda `callKey` no `accept`;
- chamada de saida preservando o relay eleito no ACK: `preaccept` e `accept`
  recebidos nao geram `transport`, `relaylatency` ou `mute_v2` sinteticos;
- aceite de saida nao envia `accepted_elsewhere` por conta propria; em especial,
  o participante device zero pode aparecer como `user@lid` no ACK e
  `user:0@lid` no aceite, sendo o mesmo aparelho;
- roteamento do ACK de oferta pelo `call-id` do filho `relay`, inclusive depois
  de a chamada entrar em estado ativo;
- selecao de um unico relay: FNA para entrada; nao-FNA autenticado para saida,
  com fallback para o primeiro nao-FNA anunciado;
- testes do envelope da oferta, sequencia do aceite, descritores WASM e
  configuracao de relay.

O relay usa exatamente a porta anunciada no ACK (normalmente `3478`). O caminho
de midia nao cria uma variante `3480` nem abre todos os endpoints em paralelo.
O build multi-stage compila
`vendor/zapo-voip/native/relay-bridge/relay-bridge`; em instalacao nativa, o
caminho pode ser informado por `ZAPO_VOIP_RELAY_BRIDGE_PATH`.
