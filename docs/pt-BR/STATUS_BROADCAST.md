# Status/Broadcast — Comportamento e Salvaguardas

Descreve como enviar Stories (Status) via Baileys usando o Unoapi de forma geral.

## Entradas

- `to = "status@broadcast"`
- `type` é um tipo de conteúdo suportado (text, image, video, ...)
- `options.statusJidList = [números | JIDs]` — lista de destinatários para relay após o envio inicial

## Observações

- Os destinatários devem ser usuários válidos do WhatsApp.
- Este branch não realiza filtragem/normalização automática da lista de destinatários; garanta entradas válidas de antemão.

## Resposta

- Segue a estrutura Cloud API (`contacts`, `messages`). Não há campos adicionais específicos de Status neste branch.

## Racional

- Listas grandes podem conter números sem WhatsApp, que antes causavam erros no Baileys e derrubavam o socket.
- Filtrando e normalizando antes, o Unoapi envia apenas para válidos e mantém estabilidade.
