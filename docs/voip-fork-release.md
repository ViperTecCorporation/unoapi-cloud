# Plugin VoIP dedicado mantido pela ViperTec

A UnoAPI usa o pacote `@vipertec/zapo-voip`, mantido diretamente em
`vendor/zapo-voip` dentro do ViperConnect. Ele nao depende de acompanhar um fork
completo do repositorio Zapo.

Versao atualmente integrada: `1.0.0-viper.4`.

O pacote e incorporado ao build por `file:vendor/zapo-voip`. A pasta contem o
codigo-fonte auditavel e o `dist` usado em producao, tornando a imagem
reproduzivel sem depender do registry npm durante o build.

O runtime e explicitamente **hibrido**. A oferta, parte dos controles de chamada
e a integracao com o `WaClient` continuam no plugin Zapo/ViperConnect. O
transporte direto, o framing de relay e partes da maquina 1:1 seguem os vetores
do MeowCaller. Isso nao deve ser descrito como Zapo puro nem como uma copia
integral do MeowCaller.

A separacao completa dos dois processos, dos dois `package.json`, do bridge PCM
e da solucao final de midia esta em `docs/voip-zapo-runtime.md`.

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
- aceite direto de chamada recebida adiado ate o primeiro `mute_v2` do caller;
  o envelope ativo usa `audio` na taxa negociada, `net medium="2"`, `encopt` e
  metadata, sem transportar uma segunda `callKey` no `accept`;
- o `Answer` inbound apenas confirma o estado local e abre o relay selecionado,
  sem enviar `mute_v2` ou `transport` proativamente; depois do primeiro
  `mute_v2`, o accept direto precede o ACK de classe `call` tipado como
  `type="mute_v2"`;
- na saida, o ACK do offer dispara o `preaccept` do caller; o `preaccept`
  recebido gera `relaylatency` para os relays anunciados e um `transport`
  inicial (`transport-message-type="0"`, `p2p-cand-round="0"`); depois do
  `accept`, o plugin envia `transport` 1/1 e `mute_v2(0)` ao device que atendeu;
- selecao de codec isolada por chamada a partir de `voip_settings`: o literal
  `encode.use_mlow_codec_v1="false"` usa RFC Opus com `useSmpl: false` e
  sinaliza `audio rate="8000"`; configuracao ausente, `"true"` ou malformada
  mantem MLow com `useSmpl: true` e `audio rate="16000"`;
- negociacao lida no `offer` da chamada recebida e no ACK do `offer` da chamada
  de saida; depois do envio do `preaccept`, qualquer `voip_settings` tardio e
  ignorado para nao trocar codec e taxa no meio da chamada;
- aceite de saida nao envia `accepted_elsewhere` por conta propria; em especial,
  o participante device zero pode aparecer como `user@lid` no ACK e
  `user:0@lid` no aceite, sendo o mesmo aparelho;
- a perna recebida espelhada de uma chamada entre duas sessoes locais e encerrada
  somente no estado interno quando o aparelho que aceitou coincide com o
  `meLid` ou o `meJid` da sessao; esse guard nao envia `terminate` ao WhatsApp;
- roteamento do ACK de oferta pelo `call-id` do filho `relay`, inclusive depois
  de a chamada entrar em estado ativo;
- preservacao da ordem original dos filhos `te2` recebidos no wire, sem ordenar
  por RTT antes da escolha do relay;
- selecao de um unico relay: FNA para entrada; nao-FNA autenticado para saida,
  com fallback para o primeiro nao-FNA anunciado;
- recuperacao sequencial local dos demais relays anunciados, sempre com um
  unico candidato logico ativo. O outbound pode avancar por falta de
  transporte/controle, primeiro Opus ou stall; o inbound retém o primeiro relay
  enquanto o controle estiver vivo e so avanca por falha real desse
  transporte/controle. Dez frames autenticados encerram o watchdog para que
  silencio/DTX nao provoque troca indevida;
- troca de relay preservando RTP/SRTP/codec, reaplicando SSRCs, subscriptions e
  PIDs, sem alterar porta anunciada nem codec negociado e sem trocar durante
  mute remoto ou `on_hold`;
- testes do envelope da oferta, sequencia do aceite, descritores WASM e
  configuracao de relay.

Na revisao MeowCaller `6d9b7b2`, o settings e observado no offer inbound, no ACK
outbound e no accept outbound, vencendo o ultimo valor explicito valido. Isso e
apenas scaffold: o loop de midia continua MLow e a sinalizacao permanece fixa em
16 kHz. A integracao ViperConnect usa deliberadamente apenas offer/ACK e congela
a decisao depois do caller-preaccept.

O relay ativo usa exatamente a porta anunciada no ACK (normalmente `3478`). A
selecao 1:1 chama o normalizador com o fallback sintetico desabilitado, portanto
nao cria uma variante `3480` nem abre todos os endpoints em paralelo. O helper
exportado ainda preserva essa variante opcional para consumidores explicitos.
O build multi-stage compila
`vendor/zapo-voip/native/relay-bridge/relay-bridge`; em instalacao nativa, o
caminho pode ser informado por `ZAPO_VOIP_RELAY_BRIDGE_PATH`.

## Estado de verificacao e deploy

- `176/176` testes do plugin vendorizado passaram no runtime usado para a
  verificacao local;
- os builds CommonJS e ESM incluem a negociacao de codec e o guard da perna
  local espelhada;
- o hostpath `zapo-voip-relay-recovery-20260805-02` foi aplicado sobre a imagem
  `4.0.7`, e somente o container do worker Zapo foi recriado;
- em 2026-08-05 foram validadas oito chamadas bidirecionais: duas entradas e
  duas saidas SIP com iPhone 16, seguidas pela mesma matriz com Galaxy S9e;
- todas estabilizaram no primeiro relay, com contadores remotos autenticados
  positivos e sem erro SRTP ou Opus;
- antes do commit, o mesmo estado foi revalidado em mais quatro chamadas. Os
  call IDs `00BA672F9419331B09FF04EB85A88531`,
  `00B17BF9607D128100B831F70288C3E7`,
  `93A38685363FB784FD20A3A7460A4203` e
  `002709E2597F798D574F45B50D605BB7` fecharam com `recvOk`/`opusOk` de 91, 83,
  50 e 44, respectivamente, e zero erro SRTP;
- os SHA-256 do CommonJS aplicado e revalidado sao
  `87d0011588c10451ef68301a22128264a327ac2e8aab8641a5834be35d6c61d8`
  (`WaCallMediaSession.js`),
  `055269c99c8e999f7bcf86362aba45a0544a462fd713a9bc807c7159167aec28`
  (`WaCallManager.js`) e
  `d99a6e28ab14975f15dc1fa682a45ceb868d9a5fc124fde81172c883d720f9cb`
  (`signaling/bridge.js`);
- a telefonia nao precisou ser reiniciada porque a alteracao validada pertence
  ao vendor executado pelo worker. Ela continua usando o pacote incorporado na
  imagem ate a proxima publicacao unificada.

Essa verificacao prova o caminho normal com relay vivo em dois modelos de
aparelho. O failover sequencial esta coberto pela suite, mas ainda precisa de um
canario que degrade deliberadamente o primeiro relay. O commit final e o hash da
imagem oficial devem substituir a referencia temporaria de hostpath antes da
publicacao.
