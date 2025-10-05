# Status/Broadcast — Comportamento e Salvaguardas

Detalha como o Unoapi lida com Stories (Status) via Baileys e as proteções para evitar queda do socket quando a lista de destinatários contém números inválidos.

## Entradas

- `to = "status@broadcast"`
- `type` é um tipo de conteúdo suportado (text, image, video, ...)
- `options.statusJidList = [números | JIDs]` — lista de destinatários para relay após o envio inicial

## Validação e Normalização

Implementado em `src/services/socket.ts` no caminho `send()` para `status@broadcast`:

- Para cada entrada em `statusJidList`, chama‑se `exists(raw)` que retorna um JID válido se o número tem WhatsApp, ou `undefined` caso contrário.
- Remove todos os `undefined` (números inválidos) e loga um aviso com amostra dos ignorados.
- Opcionalmente normaliza LID→PN baseado em `STATUS_ALLOW_LID` em `defaults.ts`.
- Remove duplicados na lista final.

Se após normalização não houver destinatários válidos, o passo `relayMessage` é ignorado.

## Resposta com Informações Extras

Para facilitar monitoramento/UX, a resposta HTTP inclui dois campos extras para envios de Status:

- `status_skipped`: entradas removidas por não terem WhatsApp.
- `status_recipients`: quantidade de destinatários válidos relayados.

Os campos são adicionados sem quebrar a estrutura Cloud API (`messages/contacts`).

## Racional

- Listas grandes podem conter números sem WhatsApp, que antes causavam erros no Baileys e derrubavam o socket.
- Filtrando e normalizando antes, o Unoapi envia apenas para válidos e mantém estabilidade.

