Transcrição de Áudio

- Provedores suportados:
  - OpenAI (`OPENAI_API_KEY` + `OPENAI_API_TRANSCRIBE_MODEL`)
  - Groq (compatível com OpenAI) – recomendado como alternativa econômica

Configuração Groq

- Defina as variáveis de ambiente:
  - `GROQ_API_KEY`: chave da API Groq
  - `GROQ_API_TRANSCRIBE_MODEL` (opcional): padrão `whisper-large-v3`
  - `GROQ_API_BASE_URL` (opcional): padrão `https://api.groq.com/openai/v1`

Prioridade de uso

- Se `GROQ_API_KEY` estiver definida, a transcrição usa Groq.
- Caso contrário, se `OPENAI_API_KEY` estiver definida, usa OpenAI.
- Se nenhuma estiver definida, usa Whisper local via `audio2textjs`.

Observações

- O endpoint utilizado para Groq é compatível com OpenAI: `/audio/transcriptions`.
- Certifique-se de que o arquivo de áudio recebido é suportado pelo modelo escolhido.
