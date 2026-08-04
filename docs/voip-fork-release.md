# Plugin VoIP dedicado mantido pela ViperTec

A UnoAPI usa o pacote `@vipertec/zapo-voip`, mantido diretamente em
`vendor/zapo-voip` dentro do ViperConnect. Ele nao depende de acompanhar um fork
completo do repositorio Zapo.

Versao atualmente integrada: `1.0.0-viper.2`.

O pacote e incorporado ao build por `file:vendor/zapo-voip`. A pasta contem o
codigo-fonte auditavel e o `dist` usado em producao, tornando a imagem
reproduzivel sem depender do registry npm durante o build.

Principais ajustes locais:

- descoberta explicita dos dispositivos do destinatario antes da oferta;
- DataChannel WASM pre-negociado com label `pre-negotiated` e id `0`;
- Allocate STUN com token, endpoint e os nove stream descriptors `0x4024`
  derivados de `call-id + LID` nos slots `[0,1,4,2,3,5,7,8,6]`;
- consent ping `0x0801` enviado depois do Allocate e renovacao conjunta durante
  o keepalive;
- framing RTP/WARP com perfil `0xDEBE` e palavra DTX `0x30010000` somente nos
  frames de comfort-noise;
- oferta com `enc` inline para um unico dispositivo e `destination` somente
  para multiplos dispositivos;
- aceite de chamada recebida adiado ate o primeiro `mute_v2`, sem transportar
  uma segunda `callKey` no `accept`;
- fallback seletivo do relay web-token em `3480` quando o ACK usa `authTokenId=0`
  ou identifica um relay FOPS;
- testes do envelope da oferta, sequencia do aceite, descritores WASM e
  configuracao de relay.

O relay usa primeiro a porta anunciada no ACK (normalmente `3478`). A variante
`3480` e aberta somente quando os metadados indicam o fluxo web-token e ela ainda
nao e a porta anunciada, reproduzindo o comportamento do motor nativo.
