# JIDMAP (PN ↔ LID)

Este documento descreve como o UnoAPI trata o mapeamento entre JIDs do tipo PN (`@s.whatsapp.net`) e LID (`@lid`) e como inspecionar esses dados via HTTP.

## Visão geral

- O Baileys v7 diferencia usuários PN e LID. O UnoAPI mantém um cache PN↔LID para:
  - Unificar webhooks (evitar conversas duplicadas PN vs LID em ferramentas como Chatwoot)
  - Acelerar asserts/sends e enriquecer metadados

## Como o cache é preenchido

- Inbound 1:1 em LID: se houver PN válido no payload, persiste PN↔LID; senão, tenta `getPnForLid()` e persiste.
- `loadJid(@lid)`: normaliza `@lid → PN` antes de chamar `onWhatsApp`; se retornar PN JID, persiste PN↔LID.
- Eventos `lid-mapping.update`: handler robusto classifica JIDs por `isPnUser/isLidUser` e, quando necessário, deriva PN com `jidNormalizedUser`.
- Fallback de derivação no File Store: `getPnForLid()` deriva PN via `jidNormalizedUser` quando o cache está vazio.

Garantias:
- Nunca persistimos “dígitos nus”: apenas PN JID (`@s.whatsapp.net`) e LID (`@lid`).
- Quando não for possível resolver PN com segurança, mantemos LID e não gravamos um mapeamento incorreto.

## Webhook (preferência por PN)

- Com `WEBHOOK_PREFER_PN_OVER_LID=true` (padrão), o webhook tenta usar PN. Se não houver cache/contact-info, faz fallback `@lid → PN` via `jidNormalizedUser` e valida; só mantém `@lid` quando a normalização não é confiável.

## Endpoints HTTP

### Listar mapeamentos

```
GET /:version/:phone/jidmap?side=pn_for_lid|lid_for_pn|all&q=<substring>&limit=<n>&offset=<m>
```

- Exemplo: `/v17.0/5566996269251/jidmap?side=pn_for_lid&q=94047&limit=50&offset=0`
- Resposta:

```
{
  "session": "5566996269251",
  "side": "pn_for_lid",
  "q": "94047",
  "page": { "limit": 50, "offset": 0, "total": { "pn_for_lid": 12, "lid_for_pn": 0 } },
  "mappings": {
    "pn_for_lid": [ { "lid": "94047083475061@lid", "pn": "94047083475061@s.whatsapp.net" } ],
    "lid_for_pn": []
  }
}
```

### Buscar por contato

```
GET /:version/:phone/jidmap/:contact
```

- `:contact` pode ser `1234567890123`, `1234567890123@s.whatsapp.net` (PN) ou `1234567890123@lid` (LID)
- Resposta:

```
{ "session": "5566996269251", "pn": "1234567890123@s.whatsapp.net", "lid": "1234567890123@lid" }
```

## Variáveis relevantes

- `JIDMAP_CACHE_ENABLED` (default: true)
- `JIDMAP_TTL_SECONDS` (default: 604800 = 7 dias)

## Dicas de diagnóstico

- Redis: `GET unoapi-jidmap:<sessão>:pn_for_lid:<lidJid>` e `GET unoapi-jidmap:<sessão>:lid_for_pn:<pnJid>`.
- Logs úteis:
  - `Updated PN<->LID mapping: <pn> <=> <lid>`
  - `jidMap(redis): derived PN ... from LID ... and cached`

