# Auditoria do VoIP Zapo contra o MeowCaller

## Escopo e revisao analisada

Esta auditoria compara o plugin vendorizado em `vendor/zapo-voip` com o fluxo de
chamada direta do MeowCaller. A referencia foi fixada no `origin/main`:

- commit: `6d9b7b2c18072155a4581ab8c7fccc51b4fd0a73`;
- data: `2026-07-26T20:02:03+02:00`;
- titulo: `Add upstream-compatible group calls and call controls (#18)`.

O `fetch` confirmou que esse commit ainda era o topo remoto em 2026-08-04.

Foram inventariados os 226 arquivos da revisao: 199 arquivos textuais, 101.505
linhas analisaveis, 147 fontes Go e 338 testes Go. Os 27 arquivos nao textuais sao
vetores, seeds, capturas e amostras de audio. A leitura aprofundada concentrou-se no
caminho de chamada direta; os demais dominios foram classificados para separar
dependencia de audio 1:1 de funcionalidades futuras.

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
  -> MLow (60 ms)
  -> RTP + E2E-SRTP/WARP
  -> DataChannel id 0, label pre-negotiated
  -> SCTP cliente -> DTLS cliente -> UDP -> relay Zapo

relay Zapo
  -> UDP -> DTLS -> SCTP -> DataChannel
  -> E2E-SRTP/WARP -> MLow -> PCM 16 kHz
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
| preaccept recebido | apenas muda estado do caller | nao cria mais transport, relaylatency ou mute sintetico | corrigido |
| preaccept enviado | somente pelo callee | caller deixou de enviar preaccept depois do proprio ACK | corrigido |
| accept do callee | uma taxa 16 kHz, metadata, depois do primeiro `mute_v2` | mesma forma e mesmo gatilho | alinhado |
| device do accept/reject | preserva `:N` exato | nao reduz mais para JID de usuario | corrigido |
| reject remoto | encerra imediatamente | agora encerra, emite estado e remove a chamada | corrigido |
| ACK com erro | falha e encerra a chamada | agora encerra e libera o slot | corrigido |
| relaylatency inbound | responde cada `te` para `ev.From`, sem destination | mesma regra; removido envio proativo | corrigido |
| escolha do relay | inbound prefere FNA; outbound prefere non-FNA com `auth_token_id`; usa um relay | mesma selecao e somente um relay | alinhado e testado |
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
| MLow | 16 kHz, 960 amostras, 60 ms | `libmlow-wasm` com o mesmo formato | alinhado |
| captura MLow | possui `inbound_capture_frames.json` | frame real da captura decodifica 960 amostras, sem erro e com sinal nao nulo | validado por teste |
| PCM/SIP | sink recebe frames decodificados | evento remoto vai para `uno_to_voip`; o sentido SIP usa `voip_to_uno` | alinhado |
| estado active | somente apos primeiro RTP remoto autenticado | ainda fica active quando o relay abre | diferenca intencional por enquanto |
| SRTCP | SR+SDES a cada 1,5 s e recepcao autenticada | nao implementado | lacuna, relevante principalmente para video |
| jitter/playout | buffer por timestamp e relatorios de recepcao | buffer simples no plugin; o bridge SIP tem sua propria cadencia | melhoria futura, nao causa `rtpRecv=0` |
| video | H.264/PT97, WARP, SRTCP e PLI, marcado upstream como nao validado ao vivo | sinalizacao antiga VP8, sem caminho de media | nao suportado |
| grupo/call link/app-data | implementacao extensa, varias partes ainda `partial`/nao validadas | fora do plugin de audio 1:1 | fora do escopo atual |

## Causa mais provavel do audio unilateral observado

O transporte anterior criava um `RTCPeerConnection`, portanto emitia STUN Binding
Requests. O proprio MeowCaller documenta que esse comportamento troca o relay para o
modo de consentimento ICE e impede a ponte de midia esperada pelo fluxo Web. Isso bate
com a evidencia observada: o telefone recebia o RTP enviado pela Uno, havia allocate e
pong, mas o relay nunca entregava RTP remoto (`rtpRecv=0`).

O helper nativo remove ICE por completo e replica a pilha direta do MeowCaller. Essa e
a alteracao estrutural com maior evidencia, mas a conclusao operacional ainda depende
de uma chamada real depois de a imagem/helper novos estarem no worker.

O proprio MeowCaller marca `ConnectRelayMedia`, `Send` e `Recv` como `NOT VALIDATED`
por nao possuir vetor para um relay vivo. Seus componentes de fio possuem KATs; o salto
ao vivo tambem precisa ser validado no nosso ambiente.

## Alteracoes que nao devem ser feitas por tentativa

- Nao voltar a abrir ICE/PeerConnection nem enviar Binding Requests proativamente.
- Nao forcar porta 3478 ou 3480: usar a porta do `te2` selecionado.
- Nao abrir todos os relays anunciados: selecionar somente um pela regra FNA/direcao.
- Nao reduzir `:28`, `:53`, `:59` ou outro device para `:0` na sinalizacao.
- Nao marcar SRTCP como causa do `rtpRecv=0`; os reports sao importantes para video e
  qualidade/continuidade, mas acontecem depois de o relay ja estar entregando pacotes.
- Nao atrasar o estado usado pelo bridge SIP ate o primeiro RTP remoto sem redesenhar o
  handshake: o RTP local antecipado ajuda o relay a aprender o SSRC e evita deadlock.
- Nao implementar Opus alternativo apenas porque `voip_settings` possui a chave: no
  MeowCaller atual o valor e parseado, mas o loop de media continua instanciando MLow.

## Validacao ao vivo necessaria

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

## Verificacao local concluida

- 123/123 testes do plugin vendorizado passaram;
- 50/50 testes Uno/Zapo/bridge/VoIP relacionados passaram;
- builds TypeScript CommonJS e ESM do plugin passaram;
- typecheck do runtime Uno passou;
- `git diff --check` passou nos arquivos da auditoria;
- o decoder MLow passou tambem com uma captura real importada do MeowCaller.

Esses testes provam envelopes, vetores e contratos locais. Eles nao substituem o teste
com relay vivo descrito acima.
