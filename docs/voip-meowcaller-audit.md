# Auditoria do VoIP Zapo e do transporte MeowCaller

## Escopo e revisao analisada

Esta auditoria compara o plugin vendorizado em `vendor/zapo-voip` com o fluxo de
chamada direta do MeowCaller. A referencia foi fixada no `origin/main`:

- commit: `6d9b7b2c18072155a4581ab8c7fccc51b4fd0a73`;
- data: `2026-07-26T20:02:03+02:00`;
- titulo: `Add upstream-compatible group calls and call controls (#18)`.

A visao operacional dos dois processos, de seus `package.json` e do bridge PCM
esta consolidada em `docs/voip-zapo-runtime.md`.

O `fetch` confirmou que esse commit ainda era o topo remoto em 2026-08-04.

Foram inventariados os 226 arquivos da revisao: 199 arquivos textuais, 101.505
linhas analisaveis, 147 fontes Go e 338 testes Go. Os 27 arquivos nao textuais sao
vetores, seeds, capturas e amostras de audio. A leitura aprofundada concentrou-se no
caminho de chamada direta; os demais dominios foram classificados para separar
dependencia de audio 1:1 de funcionalidades futuras.

O codigo atual e deliberadamente **hibrido**. O MeowCaller e a referencia para o
transporte relay direto, framing, RTP/SRTP, SSRC, codec e partes do fluxo 1:1. O
plugin Zapo/ViperConnect continua fornecendo a integracao com o cliente, o offer
criptografado e controles usados pela chamada de saida. Nao existe, no runtime
atual, uma reversao integral para a sinalizacao Zapo: o inbound ainda usa o
`buildDirectAcceptStanza` derivado do MeowCaller.

O helper `buildAcceptStanza` com `callKey` criptografada e `net medium="3"`
permanece no fonte, mas nao e chamado por `WaCallMediaSession`. Portanto ele nao
descreve o envelope que foi executado nos testes ou no deploy atual.

| Dominio | Arquivos | Papel na comparacao |
| --- | ---: | --- |
| raiz | 50 | ciclo da chamada, media, codec, playout e API |
| `signaling` | 14 | envelopes de offer, preaccept, accept, relay e controles |
| `relay` | 5 | UDP, DTLS, SCTP e DataChannel |
| `stun` | 4 | allocate, ping/pong, consent e subscriptions |
| `rtp` | 11 | RTP, RTCP, SSRC, video e vetores de fio |
| `srtp` | 10 | E2E-SRTP, SRTCP, WARP, HBH e SFrame |
| `mlow` | 75 | codec, tabelas, vetores e capturas |
| audio/util | 8 | PCM, fontes, sinks, HKDF e participante |
| grupos e app-data | incluidos acima | SFU, rekey, mixer, reacoes e call links |
| exemplos, diagnostico e docs | 48 | integracao, captura e interfaces de teste |

## Mapa do caminho de audio 1:1

```text
SIP 8 kHz
  -> bridge VoIP (20 ms x 3, resample para 16 kHz)
  -> WebSocket voip_to_uno (Float32, 960 amostras)
  -> codec negociado por chamada: MLow ou RFC Opus (60 ms)
  -> RTP + E2E-SRTP/WARP
  -> DataChannel id 0, label pre-negotiated
  -> SCTP cliente -> DTLS cliente -> UDP -> relay Zapo

relay Zapo
  -> UDP -> DTLS -> SCTP -> DataChannel
  -> E2E-SRTP/WARP -> MLow ou RFC Opus -> PCM 16 kHz
  -> WebSocket uno_to_voip
  -> bridge VoIP (resample para 8 kHz, pacotes SIP de 20 ms)
```

O contrato PCM/WebSocket/SIP esta coerente nos dois sentidos. No incidente anterior,
o contador `rtpRecv=0` provou que o audio remoto ainda nao havia chegado ao decoder nem
ao bridge SIP; portanto o sintoma estava antes dessa camada.

## Matriz de compatibilidade

| Camada | MeowCaller | ViperConnect apos auditoria | Estado |
| --- | --- | --- | --- |
| resolucao do destino | converte PN para LID antes do offer | converte com `queryLidsByPhoneJids` e usa o LID resolvido | alinhado |
| offer | ordem `privacy, audio 8k, audio 16k, net, capability, enc/destination, encopt, identity` | mesma ordem e inline `enc` para um device | alinhado e testado |
| offer ja encerrado | ignora `is_call_ended=1` ou `terminate_reason` | agora ignora antes de decrypt/preaccept | corrigido |
| preaccept recebido | apenas muda estado do caller | envia `relaylatency` por relay e um `transport` inicial 0/0 uma vez | hibrido e testado |
| preaccept enviado | somente pelo callee | caller envia depois do ACK do offer; callee envia no offer inbound | adaptacao ViperConnect testada |
| Answer inbound | aguarda a sinalizacao do caller | confirma o estado local e abre o relay, sem enviar `mute_v2` ou `transport` proativamente | alinhado ao pacote live validado |
| accept do callee | forma direta apos `mute_v2` | o primeiro `mute_v2` dispara `buildDirectAcceptStanza`, taxa negociada, `net medium=2`, `encopt` e metadata, sem segunda `callKey` | Meow-derived e testado |
| ACK do `mute_v2` inbound | ACK apos tratar o controle | envia o accept direto primeiro e depois ACK de classe `call` tipado com `type="mute_v2"` | alinhado ao pacote live validado |
| destino do signaling | varia por tipo de stanza | accept usa o peer recebido; transport/mute pos-accept preservam o device que atendeu | hibrido e testado |
| reject remoto | encerra imediatamente | agora encerra, emite estado e remove a chamada | corrigido |
| ACK com erro | falha e encerra a chamada | agora encerra e libera o slot | corrigido |
| relaylatency | encaminha medidas dos relays | outbound envia um stanza por relay no preaccept, com destinations quando disponiveis | adaptacao ativa |
| ordem de `te2` | consome os candidatos na ordem recebida | parser preserva a ordem wire e nao reordena por RTT | alinhado e testado |
| escolha do relay | inbound prefere FNA; outbound prefere non-FNA com `auth_token_id`; usa um relay | mesma selecao e somente um relay | alinhado e testado |
| recuperacao de relay 1:1 | nao implementa failover depois que o transporte abre | extensao local: preserva os `te2` e configura um por vez; outbound pode avancar por ausencia de transporte/controle, ausencia do primeiro Opus autenticado ou stall; inbound retem o primeiro relay enquanto o controle estiver vivo, mesmo sem RTP ou durante stall, e so avanca por falha real de transporte/controle; com 10 frames autenticados para definitivamente o watchdog; suspende em mute/on-hold e preserva RTP/SRTP/codec | extensao local testada |
| ids de token | `token_id` e `auth_token_id` sao independentes | parser nao confunde mais os dois; aceita token binario ou string | corrigido |
| transporte FNA/non-FNA | ambos usam UDP -> DTLS -> SCTP -> DataChannel | ambos usam o helper nativo; removido UDP cru do FNA | corrigido |
| pilha Pion | datachannel 1.6.0, dtls 3.1.2, logging 0.2.4, sctp 1.9.4 | mesmas bibliotecas e versoes | alinhado |
| DataChannel | negotiated, id 0, label `pre-negotiated` | mesmo contrato | alinhado e testado |
| allocate | token `0x4000`, 9 streams `0x4024`, endpoint `0x0016`, MI, sem fingerprint | mesmo KAT byte a byte | alinhado e testado |
| consent | allocate + ping imediato; repete ambos a cada 1 s; nao envia Binding Request | mesma sequencia; responde Binding Request originado pelo relay | alinhado e testado |
| SSRC | HKDF e slots `[0,1,4,2,3,5,7,8,6]` | mesmo KAT; auxiliares 6..8 unicos e aleatorios | alinhado e testado |
| identidade SRTP | device exato e variantes `:0`/bare na recepcao | mesma formatacao e fallback autenticado; fixa a variante apos sucesso | corrigido e testado |
| SRTP | AES-CTR, HKDF por participante, MI WARP de 4 bytes | mesmos vetores, replay window e ROC | alinhado e testado |
| RTP inicial | seq 1, timestamp 0; marker apenas na primeira fala real | DTX/priming nao consomem mais o marker | corrigido e testado |
| payload type | audio aceita PT 120 e PT 121 | agora aceita ambos | corrigido e testado |
| RTP/RTCP | classifica RTCP antes de RTP | RTCP nao e mais contado como RTP nos diagnosticos | corrigido |
| codec por chamada | possui scaffold de `voip_settings`, mas o fallback RFC Opus ainda esta em progresso upstream | `false` seleciona RFC Opus; ausente, `true` ou malformado mantem MLow | integrado e testado |
| MLow | 16 kHz, 960 amostras, 60 ms | `libmlow-wasm` com `useSmpl: true` e sinalizacao 16 kHz | alinhado |
| RFC Opus | sinalizado por `use_mlow_codec_v1=false`; suporte completo ainda nao deve ser atribuido ao upstream | `libmlow-wasm` com `useSmpl: false` e sinalizacao 8 kHz | integrado e testado |
| captura MLow | possui `inbound_capture_frames.json` | frame real da captura decodifica 960 amostras, sem erro e com sinal nao nulo | validado por teste |
| PCM/SIP | sink recebe frames decodificados | evento remoto vai para `uno_to_voip`; o sentido SIP usa `voip_to_uno` | alinhado |
| perna local espelhada | nao se aplica ao processo com uma unica conta | compara o device que aceitou com `meLid` e `meJid`, encerra apenas a perna inbound local e nao envia `terminate` | corrigido e testado |
| estado active | somente apos primeiro RTP remoto autenticado | ainda fica active quando o relay abre | diferenca intencional por enquanto |
| SRTCP | SR+SDES a cada 1,5 s e recepcao autenticada | sender reports de audio implementados e cobertos por vetor | alinhado para audio |
| jitter/playout | buffer por timestamp e relatorios de recepcao | buffer simples no plugin; o bridge SIP tem sua propria cadencia | melhoria futura, nao causa `rtpRecv=0` |
| video | H.264/PT97, WARP, SRTCP e PLI, marcado upstream como nao validado ao vivo | sinalizacao antiga VP8, sem caminho de media | nao suportado |
| grupo/call link/app-data | implementacao extensa, varias partes ainda `partial`/nao validadas | fora do plugin de audio 1:1 | fora do escopo atual |

## Estado confirmado da sinalizacao

O commit `5dd78e15` trocou o transporte baseado em PeerConnection pelo helper
nativo. O estado atual preserva esse transporte e tambem preserva o accept
direto. No inbound, o `Answer` apenas confirma o estado local e abre o primeiro
relay selecionado; ele nao envia `mute_v2` nem `transport` proativamente. A
sessao aguarda o primeiro `mute_v2` do caller, envia
`buildDirectAcceptStanza` com `net medium="2"`, sem uma segunda `callKey`
criptografada, e somente depois responde ao stanza recebido com ACK de classe
`call` tipado como `type="mute_v2"`.

O primeiro relay inbound permanece selecionado enquanto seu plano de controle
estiver vivo. Zero RTP inicial ou stall de midia nao autorizam uma troca
silenciosa pos-accept; somente falha real do transporte/controle torna o proximo
candidato elegivel.

Na chamada de saida, o fluxo ativo e diferente: o ACK do offer permite negociar
o codec e envia o preaccept do caller; o preaccept remoto provoca relaylatency e
transport inicial; o accept remoto inicializa a midia e envia transport 1/1 mais
`mute_v2(0)` ao device que atendeu. Esse conjunto e hibrido e precisa ser
avaliado como uma unidade. Um teste dele nao prova falha do Zapo puro nem do
MeowCaller puro.

## Motivo para manter o helper nativo

O transporte anterior criava um `RTCPeerConnection`, portanto emitia STUN Binding
Requests. O proprio MeowCaller documenta que esse comportamento troca o relay para o
modo de consentimento ICE e impede a ponte de midia esperada pelo fluxo Web. Isso bate
com a evidencia observada: o telefone recebia o RTP enviado pela Uno, havia allocate e
pong, mas o relay nunca entregava RTP remoto (`rtpRecv=0`).

O helper nativo remove ICE por completo e replica a pilha direta do MeowCaller. O
allocate e os pongs ao relay ja foram comprovados em chamadas reais; ele continua no
codigo. Os controles adicionais descritos acima pertencem ao fluxo hibrido atual e
nao transformam o transporte em uma execucao Zapo pura.

O proprio MeowCaller marca `ConnectRelayMedia`, `Send` e `Recv` como `NOT VALIDATED`
por nao possuir vetor para um relay vivo. Seus componentes de fio possuem KATs; o salto
ao vivo tambem precisa ser validado no nosso ambiente.

## Negociacao de codec por chamada

Na revisao MeowCaller `6d9b7b2`, o `voip_settings` e observado em tres pontos:
offer inbound, ACK outbound e accept outbound; o ultimo valor explicito valido
vence. Esse comportamento ainda e scaffold: o loop de midia continua
instanciando MLow e a sinalizacao permanece fixa em `audio rate="16000"`.

Na integracao ViperConnect, o `voip_settings` autoritativo e lido em dois pontos:
no `offer` de uma chamada inbound e no ACK do `offer` de uma chamada outbound.
Somente o valor literal
`encode.use_mlow_codec_v1="false"` seleciona RFC Opus, desativa SMPL
(`useSmpl: false`) e usa `audio rate="8000"` no `preaccept` e no aceite direto.
Configuracao ausente, `"true"` ou malformada usa o fallback seguro MLow, ativa
`useSmpl: true` e sinaliza `audio rate="16000"`.

A decisao fica congelada quando o `preaccept` e enviado. Um ACK repetido ou outro
settings tardio, inclusive no accept outbound, nao pode reinicializar o codec
durante a midia. A integracao local dos dois modos, a inicializacao antes do
`preaccept` e as taxas anunciadas sao cobertas por testes. Isso nao significa que
o fallback RFC Opus esteja concluido no MeowCaller.

Para chamadas entre duas sessoes hospedadas no mesmo worker, o mesmo `call-id` pode
aparecer tambem como uma perna inbound espelhada. O guard compara a base do device que
aceitou com as bases de `meLid` e `meJid`; quando coincide, encerra e limpa apenas essa
perna local, sem transmitir `terminate` ao WhatsApp e sem interferir na perna outbound.

## Alteracoes que nao devem ser feitas por tentativa

- Nao voltar a abrir ICE/PeerConnection nem enviar Binding Requests proativamente.
- Nao forcar porta 3478 ou 3480 no caminho ativo: usar a porta do `te2`
  selecionado e manter desabilitado o fallback sintetico do normalizador.
- Nao ordenar os filhos `te2` por RTT: preservar a ordem em que vieram no wire.
- Nao abrir todos os relays anunciados: selecionar somente um pela regra FNA/direcao.
- Nao enviar `mute_v2` ou `transport` proativamente no `Answer` inbound: aguardar
  o primeiro `mute_v2`, enviar o accept direto e depois o ACK tipado
  `type="mute_v2"`.
- Nao trocar o primeiro relay inbound enquanto seu controle estiver vivo, mesmo
  que o primeiro RTP ainda nao tenha chegado ou a midia esteja em stall.
- Nao inventar `:0` para transport/mute/terminate: usar o device observado no
  fluxo. O accept direto atual nao deve ser documentado como accept oficial.
- Nao trocar `buildDirectAcceptStanza` pelo helper Zapo nao utilizado sem um A/B
  controlado: o runtime atual espera `mute_v2`, usa `medium=2` e nao envia uma
  segunda `callKey` no accept.
- Nao remover o preaccept do caller, relaylatency, transport inicial nem
  transport/mute pos-accept: todos estao ativos no outbound atual.
- Nao marcar SRTCP como causa do `rtpRecv=0`; os reports sao importantes para video e
  qualidade/continuidade, mas acontecem depois de o relay ja estar entregando pacotes.
- Nao atrasar o estado usado pelo bridge SIP ate o primeiro RTP remoto sem redesenhar o
  handshake: o RTP local antecipado ajuda o relay a aprender o SSRC e evita deadlock.
- Nao renegociar codec depois do `preaccept`; settings tardio deve ser ignorado.
- Nao apresentar o fallback RFC Opus como concluido no MeowCaller. O scaffold esta em
  progresso upstream; a selecao e os dois modos descritos aqui pertencem a integracao
  local validada por testes.

## Validacao ao vivo concluida

Em 2026-08-05 foram executadas oito chamadas com audio bidirecional:

| Aparelho | Direcao | Quantidade | Resultado |
| --- | --- | ---: | --- |
| iPhone 16 | entrada | 2 | bidirecional |
| iPhone 16 | saida pelo SIP | 2 | bidirecional |
| Galaxy S9e | entrada | 2 | bidirecional |
| Galaxy S9e | saida pelo SIP | 2 | bidirecional |

Os contadores remotos autenticados foram `117`, `39`, `51`, `86`, `171`, `89`,
`66` e `40`, com `srtpErrors=0`, `opusErr=0` e trafego positivo no bridge SIP
nos dois sentidos. Todas as chamadas estabilizaram no primeiro relay. Isso
valida ao vivo o caminho normal, mas nao demonstra que o failover foi acionado.

Um canario com o primeiro relay deliberadamente degradado e uma rodada de
chamadas simultaneas acima de uma continuam como criterios separados.

## Roteiro para novos canarios

Executar uma chamada de saida e uma de entrada com destino externo ao conjunto de
sessoes locais. Para cada call-id, confirmar nesta ordem:

1. `native relay transport started`;
2. `native relay data channel open`;
3. `WASM stun allocate sent` e `keepalive first ping sent`;
4. `stun allocate success`/pong sem Binding Request de origem local;
5. `audio sent` com contador crescente;
6. `rtp packet received` com `rtpRecv > 0` (PT 120 ou 121);
7. ausencia de `srtp recv error`; se houver, conferir `recvJids` e o SSRC do pacote;
8. `audio recv stats` com `decodeOk > 0`;
9. no worker VoIP, frames `uno_to_voip` recebidos e RTP SIP remoto nao nulo.

Se os passos 1-4 passarem e o 6 continuar zerado, capturar os pacotes recebidos pelo
DataChannel e o allocate completo da mesma chamada. Se o 6 passar e o 7 falhar, a
investigacao muda de relay para identidade/chave. Se o 8 passar mas o 9 falhar, somente
entao o problema esta no WebSocket/bridge SIP.

## Lacunas separadas do reparo de audio 1:1

- SRTCP de audio/video e relatorios de recepcao;
- video H.264, orientacao e PLI/FIR;
- jitter buffer por timestamp no plugin;
- chamadas em grupo, rekey de epoch, mixer e encaminhamento SFU;
- app-data/reacoes, call links, waiting room, raise hand e screen share;
- estado publico `active` distinguindo relay aberto de primeiro audio remoto.

Essas lacunas nao devem ser misturadas com a validacao urgente da chamada direta de
audio. Primeiro deve ser provado o caminho bidirecional acima; depois cada capacidade
recebe contrato, adapter, teste e documentacao proprios.

## Verificacao do estado atual

- 176/176 testes do plugin vendorizado passaram no mesmo runtime Node usado na verificacao;
- builds TypeScript CommonJS e ESM do plugin passaram;
- `git diff --check` passou nos arquivos da auditoria;
- o hostpath foi aplicado sobre a imagem `4.0.7` e somente o worker Zapo foi
  recriado;
- as oito chamadas reais descritas acima passaram com audio bidirecional em
  iPhone 16 e Galaxy S9e;
- o servico SIP/VoIP nao precisou ser reiniciado porque a mudanca validada esta
  no vendor executado pelo worker.

Os testes automatizados provam envelopes, vetores, recuperacao e contratos
locais. Os canarios provam o caminho normal com relay vivo; failover forcado e
concorrencia simultanea continuam pendentes.
