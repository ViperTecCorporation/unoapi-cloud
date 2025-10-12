Audio Transcription

- Supported providers:
  - OpenAI (`OPENAI_API_KEY` + `OPENAI_API_TRANSCRIBE_MODEL`)
  - Groq (OpenAI-compatible) — recommended as a cost-effective alternative

Groq Configuration

- Environment variables:
  - `GROQ_API_KEY`: your Groq API key
  - `GROQ_API_TRANSCRIBE_MODEL` (optional): defaults to `whisper-large-v3`
  - `GROQ_API_BASE_URL` (optional): defaults to `https://api.groq.com/openai/v1`

OpenAI Configuration

- Environment variables:
  - `OPENAI_API_KEY`: your OpenAI API key
  - `OPENAI_API_TRANSCRIBE_MODEL`: e.g. `gpt-4o-mini-transcribe` or `whisper-1`

Priority

- If `GROQ_API_KEY` is set for the session, transcription uses Groq.
- Else, if `OPENAI_API_KEY` is set, it uses OpenAI.
- If neither is set, it falls back to local Whisper via `audio2textjs`.

Per-session overrides

- When using Redis-backed configs, you can define per-session values which override environment defaults. These values can be set through the web UI modal or via the `unoapi-config` template.
- Per-session fields:
  - `groqApiKey`, `groqApiTranscribeModel`, `groqApiBaseUrl`
  - `openaiApiKey`, `openaiApiTranscribeModel`

Endpoint Note

- The Groq endpoint follows OpenAI compatibility: `POST /audio/transcriptions` with multipart form (`file`, `model`).
