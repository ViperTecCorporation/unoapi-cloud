# Runtime VoIP Zapo: dependencias, protocolo e solucao de midia

Estado consolidado em 2026-08-05. Este documento e a fonte canonica para
entender onde cada parte da telefonia executa, quais dependencias pertencem a
cada processo e quais correcoes estabilizaram o audio 1:1.

## Resumo executivo

A imagem Docker e unica, mas nao existe um unico processo Node nem um unico
`node_modules`. A mesma tag contem dois runtimes isolados:

```text
WhatsApp
  <-> sinalizacao, relay, RTP/SRTP e codec
worker Zapo: /home/u/app/dist + /home/u/app/node_modules
  <-> WS autenticado /v1/bridge/zapo + PCM Float32 16 kHz
telefonia: /home/u/app/voip/dist + /home/u/app/voip/node_modules
  <-> SIP/WebRTC ou SIP/RTP
ramais
```

- o worker Zapo e o unico dono da sessao, credenciais, Signal, JIDs/LIDs,
  sinalizacao de chamada e midia do WhatsApp;
- o servico de telefonia nao abre uma segunda sessao Zapo; ele cuida de SIP,
  ramais, roteamento, gravacao e conversao de audio;
- o transporte de relay e implementado pelo vendor da ViperTec e pelo helper
  nativo empacotado na imagem; nao existe processo externo de chamada;
- RabbitMQ nao transporta audio. O bridge usa JSON para controle e frames
  binarios `VPA1` para PCM.

## Fontes de verdade do build

O worker Zapo usa o `package.json` da raiz deste repositorio. Nao existe um
`package.json` exclusivo para `unoapi-worker-zapo`.

O processo VoIP usa o manifesto do repositorio separado
`ViperTecCorporation/viperconnect-voip-service`. O workflow o baixa para
`_build/voip-service` e o Docker executa `npm ci` em uma etapa propria. A pasta
`_build/` local e temporaria, esta no `.gitignore` e pode conter uma copia
antiga; ela nunca deve ser tratada como fonte de verdade. A imagem de release
registra a revisao exata da branch integrada para permitir reproducao e rollback.

O `Dockerfile` copia os dois grafos para caminhos diferentes e o entrypoint
seleciona o executavel:

| `UNOAPI_PROCESS_ROLE` | Executavel | Dependencias |
| --- | --- | --- |
| `worker` com `UNOAPI_WORKER_ENGINE=zapo` | `/home/u/app/dist/src/cloud.js` | `/home/u/app/node_modules` |
| `voip` | `/home/u/app/voip/dist/app.js` | `/home/u/app/voip/node_modules` |

## Dependencias do worker Zapo

As dependencias que formam o caminho de chamada sao:

| Pacote/componente | Versao | Papel |
| --- | --- | --- |
| `zapo-js` | `1.7.0` | cliente Zapo, sessao, transporte e primitivas de protocolo |
| `@vipertec/zapo-voip` | `file:vendor/zapo-voip` | plugin vendorizado de sinalizacao e midia VoIP |
| `libmlow-wasm` | `0.1.1` | encode/decode MLow e RFC Opus selecionado por chamada |
| `ws` | `^8.21.1` | bridge autenticado com o processo de telefonia |
| `relay-bridge` | binario Go estatico | UDP, DTLS, SCTP e DataChannel direto com o relay |

O pacote `@vipertec/zapo-voip` declara somente `zapo-js` e `libmlow-wasm` como
peer dependencies. Ele nao depende de uma implementacao Node de WebRTC.

O helper nativo e compilado no Docker com estas versoes Pion fixadas no
`go.mod`:

- `github.com/pion/datachannel v1.6.0`;
- `github.com/pion/dtls/v3 v3.1.2`;
- `github.com/pion/sctp v1.9.4`;
- `github.com/pion/logging v0.2.4`.

O `protobufjs` fixado em `resolutions` pertence ao grafo geral de protocolo. Ele
nao codifica o bridge PCM. Os nove StreamDescriptors do Allocate STUN sao
gerados no proprio vendor e enviados no atributo `0x4024`.

O build da imagem instala apenas o grafo de producao do worker e executa
`scripts/check-zapo-runtime-graph.mjs` para impedir que imports ou artefatos
fora do runtime Zapo entrem no `dist` publicado.

## Dependencias do processo VoIP

O processo VoIP recebe o PCM pronto; ele nao decodifica MLow, nao deriva chave
SRTP e nao abre o relay do WhatsApp. No caminho Zapo ativo, os componentes
centrais sao `express`, `ws`, `zod`, os gateways SIP e
`ZapoBridgeRegistry`/`ZapoBridgeCallService`.

As dependencias centrais do manifesto da telefonia sao:

| Dependencia | Uso real |
| --- | --- |
| `@roamhq/wrtc` | perna SIP/WebRTC dos ramais no navegador; nao e o relay WhatsApp |
| `ws` | WebSocket SIP e bridge Zapo autenticado |
| AWS SDK | armazenamento e acesso a gravacoes quando configurado |

O processo de telefonia inicia diretamente a bridge Zapo, os gateways SIP e os
servicos administrativos. Ele nao abre sessao de WhatsApp, nao possui
pareamento proprio e nao executa tarefas de credenciais paralelas.

## Contrato entre os processos

O worker abre `WS /v1/bridge/zapo` com Bearer token. A primeira mensagem e um
`bridge.hello` contendo sessao, geracao, worker e capacidades. O servidor aceita
somente a geracao mais nova para aquela sessao.

Controle usa JSON e inclui `call.incoming`, `call.state`, `call.command`,
`call.ended`, abertura/fechamento de stream e heartbeat. Audio usa um envelope
binario fixo:

- magic `VPA1`;
- protocolo `1`;
- direcao, `streamId` e sequencia no cabecalho de 16 bytes;
- 960 amostras `Float32LE`, mono, a 16 kHz;
- isolamento por `session + callId + streamId`.

No sentido WhatsApp para SIP, o vendor decodifica o Opus remoto e publica PCM
`uno_to_voip`. No sentido SIP para WhatsApp, a telefonia envia PCM
`voip_to_uno`, e o vendor aplica backpressure, codec, RTP e SRTP.

## Contrato de relay implementado

O vendor foi auditado contra vetores publicos de protocolo e implementa os
contratos de fio necessarios para chamadas 1:1:

- transporte direto `UDP -> DTLS client -> SCTP client -> DataChannel`, sem
  ICE, SDP ou `RTCPeerConnection`;
- DataChannel pre-negociado, id `0`, label `pre-negotiated`;
- Allocate STUN com token, endpoint e nove descritores de stream;
- Allocate e ping imediatos, renovados no keepalive; o cliente responde Binding
  Requests iniciados pelo relay, mas nao inicia Binding Request;
- derivacao e ordem dos SSRCs `[0,1,4,2,3,5,7,8,6]`;
- HKDF por `callKey`, identidade exata do participante, RTP/SRTP/SRTCP, ROC e
  replay window;
- RTP de audio PT `120` ou `121`, sequencia inicial `1`, timestamp `0` e marker
  preservado para a primeira fala real;
- ordem de campos do offer e aceite direto da entrada apos o primeiro
  `mute_v2` do caller;
- preferencia de relay FNA no inbound e non-FNA autenticado no outbound.

## Responsabilidades da Zapo e extensoes ViperTec

A Zapo continua sendo dona da sessao, plugin host, Signal, privacy token,
resolucao LID/device, envio/recepcao das stanzas e stores.

O fluxo final e deliberadamente hibrido:

- inbound: o `Answer` apenas confirma o estado local e abre o relay selecionado,
  sem enviar `mute_v2` ou `transport` proativamente; espera o primeiro
  `mute_v2`, envia o accept direto com a taxa negociada, `net medium="2"`,
  `encopt` e metadata, sem uma segunda `callKey`, e depois responde com ACK de
  classe `call` tipado como `mute_v2`;
- outbound: o ACK do offer negocia codec e dispara o preaccept do caller; o
  preaccept remoto envia `relaylatency` e transport inicial `0/0`; o accept
  remoto envia transport `1/1` e `mute_v2(0)` ao device exato que atendeu;
- `voip_settings` escolhe codec por chamada: somente
  `use_mlow_codec_v1="false"` usa RFC Opus/8 kHz; ausente, verdadeiro ou
  malformado usa MLow/16 kHz. A escolha e congelada depois do preaccept;
- chamadas entre duas sessoes locais possuem uma perna inbound espelhada. O
  guard encerra somente essa perna interna, sem transmitir `terminate` e sem
  disputar a perna outbound.

Sao extensoes proprias da ViperTec: o helper Go integrado a imagem, o bridge
PCM para SIP, a protecao da perna local, a negociacao de codec concluida no
vendor e a recuperacao sequencial de relay.

## Causa e solucao apos os testes

O problema nao era uma porta fixa, RabbitMQ, call-id, privacy token, SIP ou um
modelo especifico de aparelho. Nos casos iniciais, o relay e o DataChannel
abriam, Allocate/Pong continuavam, o aparelho recebia o audio do SIP e nao havia
erro SRTP, mas o relay nao entregava audio remoto ao worker (`rtpRecv=0`).

A primeira causa estrutural foi o transporte com `RTCPeerConnection/ICE`. Ele
emitia Binding Requests e colocava o relay em um modo de consentimento diferente
do fluxo Web direto esperado. O helper Go eliminou ICE e passou a reproduzir a
pilha direta.

Depois disso, foram alinhados como um unico contrato a sinalizacao, identidade
do device, SSRC/SRTP, PT/marker RTP, codec por chamada e a perna espelhada. Nao
foi uma troca isolada de biblioteca ou de porta.

Os logs tambem provaram um caso intermitente em que o plano de controle do relay
continuava vivo, mas chegavam zero ou poucos frames Opus autenticados. Para nao
destruir a chamada nem abrir relays em paralelo, o vendor agora:

1. preserva todos os `te2` reais na ordem recebida;
2. abre somente um candidato por vez;
3. no outbound, pode trocar apos 3 s sem transporte/controle;
4. no outbound, pode trocar apos 1,5 s sem o primeiro Opus autenticado;
5. no outbound, pode trocar apos stall de 3 s quando chegaram apenas 1 a 9
   frames autenticados;
6. apos 10 frames autenticados, considera a midia estabelecida e para o
   watchdog para nao confundir silencio/DTX com falha;
7. nao troca durante mute remoto ou `on_hold`;
8. preserva codec, RTP, SRTP/ROC, SSRCs, subscriptions e PIDs;
9. o caminho ativo usa sempre IP e porta anunciados pelo `te2`; a variante
   sintetica `3480` existente no normalizador fica explicitamente desabilitada.

No inbound 1:1, zero RTP inicial ou stall de midia nao autorizam reeleicao
silenciosa depois do accept. O primeiro relay permanece selecionado enquanto o
plano de controle estiver vivo e somente uma falha real do transporte/controle
permite avancar para o proximo candidato.

Os vetores publicos fornecem a referencia para a escolha inicial e os contratos
de fio, mas esse failover depois da abertura e uma extensao local.

## Superficies administrativas da imagem integrada

A Uno expoe uma fachada autenticada em `/admin/voip` e nunca entrega o token do
servico ao navegador. O bootstrap agrega configuracao, linhas Zapo, chamadas,
registros SIP/WebRTC, locks, a primeira pagina do historico e o resumo de
gravacoes.

O contrato administrativo consolidado inclui:

- empresas com fuso horario e transcricao/resumo por IA isolados por empresa;
- contas com integracao opcional de gravacao no Chatwoot e controle de nota
  privada;
- linhas e sessoes Zapo com `maxConcurrentCalls` entre 1 e 32, padrao 2, sem
  cadastro ou selecao de dispositivo no Manager;
- ramais SIP/WebRTC com varios registros simultaneos e desconexao individual;
- distancia por grupo de ramais, onde o menor numero possui maior prioridade;
- historico com busca, periodo, pagina e `pageSize` limitado a 100;
- gravacao local ou S3 compativel, MP3/WAV/GSM, retencao, resumo por linha,
  reproducao autenticada e limpeza por conta;
- audio MP3/WAV de ate 15 MB por grupo de transferencia;
- simulacao de roteamento inbound/outbound e liberacao explicita de locks.

Configuracoes e segredos sao persistidos pelo servico de telefonia. Respostas
administrativas omitem os segredos; campos secretos vazios preservam os valores
ja salvos.

## Evidencia de validacao

Em 2026-08-05, o hostpath da revisao corrente foi validado em oito chamadas de
audio bidirecional:

| Aparelho | Direcao | Quantidade | Resultado |
| --- | --- | ---: | --- |
| iPhone 16 | entrada | 2 | bidirecional |
| iPhone 16 | saida pelo SIP | 2 | bidirecional |
| Galaxy S9e | entrada | 2 | bidirecional |
| Galaxy S9e | saida pelo SIP | 2 | bidirecional |

Os contadores de audio remoto autenticado foram `117`, `39`, `51`, `86`, `171`,
`89`, `66` e `40`, sem erro SRTP ou Opus, e a ponte SIP apresentou trafego nos
dois sentidos. Isso tambem descarta a hipotese de incompatibilidade geral de um
aparelho antigo com MLow.

As oito chamadas estabilizaram no primeiro relay. Portanto, o caminho normal
esta comprovado ao vivo. A recuperacao sequencial esta coberta por testes
automatizados, mas ainda precisa de um canario que provoque deliberadamente um
primeiro relay degradado. Concorrencia simultanea acima de uma chamada tambem
continua como criterio de release separado.

Antes de congelar o estado no Git, o mesmo CommonJS foi revalidado em quatro
chamadas adicionais. Os call IDs
`00BA672F9419331B09FF04EB85A88531`,
`00B17BF9607D128100B831F70288C3E7`,
`93A38685363FB784FD20A3A7460A4203` e
`002709E2597F798D574F45B50D605BB7` encerraram normalmente, com
`recvOk`/`opusOk` de 91, 83, 50 e 44 e zero erro SRTP. Os hashes aplicados sao:

| Arquivo | SHA-256 |
| --- | --- |
| `dist/call/WaCallMediaSession.js` | `87d0011588c10451ef68301a22128264a327ac2e8aab8641a5834be35d6c61d8` |
| `dist/call/WaCallManager.js` | `055269c99c8e999f7bcf86362aba45a0544a462fd713a9bc807c7159167aec28` |
| `dist/signaling/bridge.js` | `d99a6e28ab14975f15dc1fa682a45ceb868d9a5fc124fde81172c883d720f9cb` |

## Regras para manutencao e release

- nao reintroduzir ICE/PeerConnection no relay WhatsApp;
- nao forcar `3478` ou `3480` no caminho ativo; usar o `te2` selecionado e
  manter `includeWebTokenFallback: false` na selecao 1:1;
- nao abrir todos os relays ao mesmo tempo nem reordenar `te2` por RTT;
- nao inventar `:0` na sinalizacao; usar o device observado e testar variantes
  bare/`:0` somente durante autenticacao SRTP de recepcao;
- nao trocar o accept direto ou remover os controles outbound sem um A/B
  controlado de entrada e saida;
- toda mudanca de envelope, relay, codec ou criptografia exige teste dedicado;
- antes de publicar, executar a suite do vendor, builds CJS/ESM, teste do helper
  Go e canarios inbound/outbound;
- registrar no artefato a revisao exata do repositorio VoIP incorporado. A branch
  configuravel do workflow e pratica, mas uma tag nao deve ficar sem
  rastreabilidade do segundo repositorio.
- cada tag Git `v*` publica a referencia semantica correspondente e tambem
  atualiza `latest`; ambas devem apontar para o mesmo digest da imagem integrada.

O processo de empacotamento e release esta em `docs/voip-fork-release.md`.
