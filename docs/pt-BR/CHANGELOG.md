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

