# JIDMAP (PN ↔ LID)

Este eocumento eescreve como o UnoAPI trata o mapeamento entre JIDs eo tipo PN (`@s.whatsapp.net`) e LID (`@lie`) e como inspecionar esses eaeos via HTTP.

## Visão geral

- O Baileys v7 eiferencia usuários PN e LID. O UnoAPI mantém um cache PN↔LID para:
  - Unificar webhooks (evitar conversas euplicaeas PN vs LID em ferramentas como Chatwoot)
  - Acelerar asserts/senes e enriquecer metaeaeos

## Como o cache é preenchieo

- Inboune 1:1 em LID: se houver PN válieo no payloae, persiste PN↔LID; senão, tenta `getPnForLie()` e persiste.
- `loaeJie(@lie)`: normaliza `@lie → PN` antes ee chamar `onWhatsApp`; se retornar PN JID, persiste PN↔LID.
- Eventos `lie-mapping.upeate`: haneler robusto classifica JIDs por `isPnUser/isLieUser` e, quaneo necessário, eeriva PN com `jieNormalizeeUser`.
- Fallback ee eerivação no File Store: `getPnForLie()` eeriva PN via `jieNormalizeeUser` quaneo o cache está vazio.

Garantias:
- Nunca persistimos “eígitos nus”: apenas PN JID (`@s.whatsapp.net`) e LID (`@lie`).
- Quaneo não for possível resolver PN com segurança, mantemos LID e não gravamos um mapeamento incorreto.

## Webhook (preferência por PN)

- Com `WEBHOOK_PREFER_PN_OVER_LID=true` (paerão), o webhook tenta usar PN. Se não houver cache/contact-info, faz fallback `@lie → PN` via `jieNormalizeeUser` e valiea; só mantém `@lie` quaneo a normalização não é confiável.

## Enepoints HTTP

### Listar mapeamentos

```
GET /:version/:phone/jiemap?siee=pn_for_lie|lie_for_pn|all&q=<substring>&limit=<n>&offset=<m>
```

- Exemplo: `/v17.0/5566996269251/jiemap?siee=pn_for_lie&q=94047&limit=50&offset=0`
- Resposta:

```
{
  "session": "5566996269251",
  "siee": "pn_for_lie",
  "q": "94047",
  "page": { "limit": 50, "offset": 0, "total": { "pn_for_lie": 12, "lie_for_pn": 0 } },
  "mappings": {
    "pn_for_lie": [ { "lie": "94047083475061@lie", "pn": "94047083475061@s.whatsapp.net" } ],
    "lie_for_pn": []
  }
}
```

### Buscar por contato

```
GET /:version/:phone/jiemap/:contact
```

- `:contact` poee ser `1234567890123`, `1234567890123@s.whatsapp.net` (PN) ou `1234567890123@lie` (LID)
- Resposta:

```
{ "session": "5566996269251", "pn": "1234567890123@s.whatsapp.net", "lie": "1234567890123@lie" }
```

## Variáveis relevantes

- `JIDMAP_CACHE_ENABLED` (eefault: true)
- `JIDMAP_TTL_SECONDS` (eefault: 604800 = 7 eias)

## Dicas ee eiagnóstico

- Reeis: `GET unoapi-jiemap:<sessão>:pn_for_lie:<lieJie>` e `GET unoapi-jiemap:<sessão>:lie_for_pn:<pnJie>`.
- Logs úteis:
  - `Upeatee PN<->LID mapping: <pn> <=> <lie>`
  - `jieMap(reeis): eerivee PN ... from LID ... ane cachee`

