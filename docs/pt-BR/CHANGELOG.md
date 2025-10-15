# Changelog (PT-BR)

Todas as mudanças notáveis neste projeto serão documentadas aqui.

O formato segue o Keep a Changelog e adota SemVer quando aplicável.

## [Não lançado]

- Correção: evita estouro de pilha (recursão) ao tratar `editedMessage` e updates device-sent em `fromBaileysMessageContent` (desembrulha e remove `update` antes de recursão).
- Recurso: envios em grupo usam LID por padrão; pré-assert de sessões priorizando LIDs; fallback robusto para "No sessions" do libsignal e ack 421 com atrasos adaptativos e alternância de addressingMode.
- Recurso: em 1:1 o serviço aprende ativamente PN→LID (assertSessions + exists) e usa LID internamente quando disponível; logs detalhados do aprendizado.
- Recurso: cache PN↔LID nos stores de Arquivo e Redis com TTL; derivação de PN a partir de LID via normalização da Baileys quando ausente; persistência do mapeamento nos dois sentidos.
- Recurso: imagens de perfil usam PN canônico para nomes/chaves (FS e S3); gets/sets consideram as variantes PN e LID e registram logs de fallback.
- Docs: README e documentos de ambiente/arquitetura (PT-BR e EN) atualizados com o comportamento LID/PN, endereçamento em grupos, política PN-first nos webhooks e canonicidade das imagens.

## 3.0.0-beta-57

- Recurso(grupos): redução do fan-out de recibos/status no webhook/socket
  - Novas envs (padrão true): `GROUP_IGNORE_INDIVIDUAL_RECEIPTS`, `GROUP_ONLY_DELIVERED_STATUS`
  - Ignora `message-receipt.update` por participante em grupos; encaminha apenas `DELIVERY_ACK` via `messages.update` quando habilitado
  - Docs: seções adicionadas em EN/PT-BR e .env.example atualizado
- Correção(chamadas): webhook de rejeição agora retorna PN em vez de LID
  - Envia `key.senderPn` no evento notify sintético; o transformer prioriza PN para `contacts[0].wa_id` e `messages[0].from`
- Correção(decrypt): envia payload estruturado ao webhook em falhas de descriptografia (DecryptError)
  - Evita perdas silenciosas e ajuda o cliente a orientar o usuário (ex.: abrir WhatsApp no telefone)
- Correção(webhook): deduplicação leve de mensagens de entrada para evitar duplicatas em reconexão/importação de histórico
  - Nova `INBOUND_DEDUP_WINDOW_MS` (padrão 7000ms); ignora mesma combinação `remoteJid|id` vista na janela
- Tarefa: bump de versão para 3.0.0-beta-57

## 3.0.0-beta-58

- Correção(status 1:1): mapeia id do provedor para id UNO em `message-receipt.update` para correlacionar delivered/read corretamente
  - Garante que os updates de status no webhook usem o mesmo id retornado no envio; evita ficar “preso” em entregue ou perder o “lido” em 1:1
  - Normalização do id aplicada antes de emitir o webhook (ListenerBaileys)
- Tarefa: bump de versão para 3.0.0-beta-58

## 3.0.0-beta-59

- Correção(logging): evitar JSON.stringify em objetos WAProto (WAMessage) para prevenir erro `long.isZero`
  - Sanitiza logs no sender/listener para exibir jid/id/type em vez do objeto completo
  - Evita falsos negativos que causavam retry do job e envios duplicados
- Recurso(saída): idempotência para retries do job
  - Nova `OUTGOING_IDEMPOTENCY_ENABLED` (padrão true). Job consulta o store (key/status) pelo id UNO e ignora reenvio se já estiver processado
- Tarefa: bump de versão para 3.0.0-beta-59

## 3.0.0-beta-52

- Recurso: adiciona provedor de transcrição de áudio Groq (endpoint compatível com OpenAI em `/audio/transcriptions`) com prioridade Groq → OpenAI → Whisper local (`audio2textjs`).
- Recurso: configuração por sessão para Groq, persistida no Redis e com prioridade sobre env:
  - `groqApiKey`, `groqApiTranscribeModel` (padrão `whisper-large-v3`), `groqApiBaseUrl` (padrão `https://api.groq.com/openai/v1`).
- Config: novas variáveis de ambiente integradas ao carregamento de config:
  - `GROQ_API_KEY`, `GROQ_API_TRANSCRIBE_MODEL`, `GROQ_API_BASE_URL`.
- UI: adicionados campos Groq no modal de configuração em `public/index.html` (`Groq API Key`, `Groq Transcribe Model`, `Groq API Base URL`) com i18n (EN/PT-BR).
- Docs: adicionados guias de transcrição `docs/TRANSCRIPTION_AUDIO.md` (EN) e `docs/pt-BR/TRANSCRICAO_AUDIO.md` (PT-BR); nova seção “Transcrição de Áudio” vinculada em `public/docs/index.html`.

---

## 3.0.0-beta-47

- Versão base mencionada pelos usuários; as correções e recursos acima entram como "Não lançado" até a próxima tag.

