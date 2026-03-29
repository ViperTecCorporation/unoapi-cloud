# VoIP Offer Investigation Handoff

## Estado atual

Investigação pausada em `2026-03-29`.

Objetivo:

- fazer o `unoapi-voip` aceitar `offer` de chamada recebida vindo da Uno/Baileys

Situação real:

- eventos de chamada (`incoming_call`, `call_ended`, etc.) funcionam
- vários tipos de signaling menores também cruzam
- o `offer` chega ao `unoapi-voip`
- o wasm entra em `handleIncomingSignalingOffer(...)`
- mas falha no parse com `status=70004`

Sem resultado promissor final até aqui.

## Conclusão técnica mais importante

O erro atual **não** está mais em:

- `raw e2e`
- `participant keys`
- `peer metadata`
- `encopt`
- `metadata`
- `relay`
- attrs óbvios como `joinable`, `caller_pn`, `caller_country_code`

O que ficou provado em runtime:

- para variantes estruturalmente boas, os logs internos do wasm mostram:
  - `handleIncomingSignalingOffer from platform 2 version 2.26.10.74`
  - `handle_incoming_xmpp_offer failed to parse offer, status=70004`
  - `wa_call_handle_incoming_xmpp_offer() status 70004`

E **não** aparecem:

- `process_offer: No raw e2e in offer`
- `Failed to get peer metadata from offer`
- `Unsupported keygen ver %d`

Conclusão:

- o gargalo atual está antes de `process_offer`
- o boundary crítico é:
  - `handle_incoming_xmpp_offer`
  - `parse_xmpp_offer`
  - `convert_xmpp_msg_to_offer_msg`

## Repositórios envolvidos

Uno:

- [unoapi-cloud](/mnt/c/Users/User/Nextcloud/Desenvolvimento/unoapi-cloud)

VoIP service:

- [unoapi-voip-service](/mnt/c/Users/User/Nextcloud/Desenvolvimento/unoapi-voip-service)

Baileys fork:

- [Baileys](/mnt/c/Users/User/Nextcloud/Desenvolvimento/Baileys/Baileys)

## Documentação principal criada

Mapa do wasm e da stack:

- [w3nder-voip-wasm-map.md](/mnt/c/Users/User/Nextcloud/Desenvolvimento/unoapi-voip-service/docs/w3nder-voip-wasm-map.md)

Esse arquivo é a referência principal para retomar.

## O que já foi instrumentado

### Uno

Em `client_baileys` / `client_voip`:

- logging da árvore real do `offer`
- logging de framing e payload strategy
- envio de múltiplas variantes de `offer` via `payloadBase64`/campos extras

### VoIP

Em `w3nder_adapter`:

- variantes experimentais de `offer`
- `offer payload selection diagnostics`
- `offer payload variant result`
- `offer payload attempt summary`
- `recentWasmLogs` por variante

## Variantes já testadas

### Root / envelope

- `raw_call_root_wap`
- `raw_call_offer_root_minimal_wap`
- `raw_call_offer_root_enriched_wap`
- `raw_call_offer_root_pruned_wap`
- `raw_call_root_wap_root_list_08`
- `raw_call_root_wap_strip_leading_null`

### Raw / frame / child

- `raw_decrypted_call_frame`
- `raw_offer_child_wap`
- `raw_offer_child_wap_strip_list_wrapper`
- `raw_offer_wap_no_prefix`
- `raw_decrypted_strip_first_byte`
- `raw_decrypted_inflate_after_first_byte`
- `raw_call_offer_enc_wap`
- `raw_offer_enc`

### Remoção de filhos / semântica

- `raw_call_offer_root_no_encopt_wap`
- `raw_call_offer_root_no_metadata_wap`
- `raw_call_offer_root_no_encopt_no_metadata_wap`
- `raw_call_offer_root_no_relay_wap`
- `raw_call_offer_root_no_net_wap`
- `raw_call_offer_root_no_rte_wap`
- `raw_call_offer_root_core_relay_wap`

### Caller / creator

- `raw_call_offer_root_caller_metadata_wap`
- `raw_call_offer_root_creator_device_wap`
- `raw_call_offer_root_caller_metadata_creator_device_wap`

### Attrs do `offer`

- `raw_call_offer_root_no_joinable_wap`
- `raw_call_offer_root_no_caller_pn_wap`
- `raw_call_offer_root_no_country_code_wap`
- `raw_call_offer_root_minimal_attrs_wap`

Resultado:

- variantes “boas” passam do reader, mas morrem igual em `70004`
- variantes ruins mostram `WAWapReader invalid list size`
- nenhuma abriu `callInfo`

## Árvore real do offer observada

Exemplo típico visto na Uno:

- `rootAttrs`:
  - `from`
  - `version`
  - `platform`
  - `id`
  - `notify`
  - `e`
  - `t`
- `offerAttrs`:
  - `call-id`
  - `call-creator`
  - `caller_pn`
  - `joinable`
  - `caller_country_code`
- `offerChildTags`:
  - `audio`
  - `audio`
  - `capability`
  - `enc`
  - `encopt`
  - `metadata`
  - `net`
  - `rte`
  - `uploadfieldstat`
  - `voip_settings`
  - `relay`

## Descobertas do wasm

Strings/anchors importantes encontradas no `whatsapp.wasm`:

- `wa_call_handle_incoming_xmpp_offer`
- `handle_incoming_xmpp_offer`
- `parse_xmpp_offer`
- `convert_xmpp_msg_to_offer_msg`
- `required attribute 'enc' or 'dec' missing for offer`
- `handle_incoming_xmpp_offer: invalid message header`
- `process_offer: No raw e2e in offer`
- `Failed to get peer metadata from offer`
- `copy_call_id_and_creator_jid_to_ctx`
- `generate_raw_e2e_keys`
- `call_update_participant_keys`
- `Unsupported keygen ver %d`
- `caller_metadata`
- `Handle MESSAGE Offer call_id: %s (joinable: %s, has_video: %d, peer_platform: %d) with relay information (num_relays %d, transaction_id %d)`

Leitura correta hoje:

- o parser não está aceitando o `offer` reconstruído
- a falha acontece antes das etapas de `process_offer`

## Problemas práticos encontrados no caminho

Durante os patches diretos na VPS, alguns erros de runtime apareceram e foram corrigidos:

- `ReferenceError: rawCallRootWapBytes is not defined`
- `ReferenceError: enrichedRootAttrs is not defined`
- `ReferenceError: rawCallOfferRootEnrichedWap is not defined`
- `ReferenceError: recentWasmLogs is not defined`
- `ReferenceError: rawCallOfferRootNoJoinableWapBytes is not defined`

Ou seja:

- há bastante patch cirúrgico no runtime
- antes de retomar forte, vale limpar e sincronizar source/dist com calma

## Estado operacional da VPS

Host:

- `root@192.168.0.50`

Containers:

- `unoapi`
- `unoapi-voip`

Observação:

- houve vários patches diretos nos arquivos `dist` dentro da VPS
- isso ajudou a investigar rápido, mas aumentou a fragilidade do estado atual

## O que não vale mais insistir

Evitar perder tempo repetindo:

- mutações pequenas de framing do root
- variantes removendo um filho opcional de cada vez sem nova evidência
- foco em `raw e2e` enquanto o parser ainda falha antes
- foco em `participant keys` enquanto `parse_xmpp_offer` ainda não passa

## Próximo passo mais promissor

Se retomar depois, o caminho mais forte é:

1. capturar um `offer` real aceito na borda exata do wasm de um cliente web real
2. comparar esse payload aceito com o payload que a Uno está entregando

Se isso não for possível, então:

1. continuar RE no boundary:
   - `handle_incoming_xmpp_offer`
   - `parse_xmpp_offer`
   - `convert_xmpp_msg_to_offer_msg`
2. de preferência com ferramenta mais pesada sobre o binário

## Resumo honesto

O que foi conseguido:

- delimitamos muito bem onde o `offer` quebra
- eliminamos um monte de hipóteses erradas
- construímos um mapa útil da stack e do wasm

O que não foi conseguido:

- fazer o wasm aceitar o `offer`
- encontrar ainda a representação binária exata que o parser espera

