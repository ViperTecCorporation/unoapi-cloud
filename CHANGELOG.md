# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and follows SemVer when applicable.

## [Unreleased]

- Fix: prevent recursive overflow when handling `editedMessage` and device-sent updates in `fromBaileysMessageContent` by unwrapping and dropping the `update` field before recursion.
- Feat: default group sends to LID addressing; pre-assert sessions prioritizing LIDs; add robust fallback for libsignal "No sessions" and ack 421 with adaptive waits and addressingMode toggling.
- Feat: 1:1 sends actively learn PN→LID (assertSessions + exists) and use LID internally when available; detailed debug logs for learning path.
- Feat: PN↔LID mapping cache in File and Redis stores with TTL; derive PN from LID via Baileys normalization when missing, and persist mapping both ways.
- Feat: profile pictures use canonical PN for filenames/keys (FS and S3); getters/setters consider PN and LID variants and log fallbacks.
- Docs: update README and environment/architecture docs (PT-BR and EN) to describe LID/PN behavior, group addressing, webhook PN-first policy, and profile picture canonicalization.

## 3.0.0-beta-52

- Feat: add Groq-based audio transcription provider (OpenAI-compatible endpoint at `/audio/transcriptions`) with priority order Groq → OpenAI → local Whisper (`audio2textjs`).
- Feat: per-session Groq configuration persisted in Redis and prioritized over env:
  - `groqApiKey`, `groqApiTranscribeModel` (default `whisper-large-v3`), `groqApiBaseUrl` (default `https://api.groq.com/openai/v1`).
- Config: new environment variables wired into config loader:
  - `GROQ_API_KEY`, `GROQ_API_TRANSCRIBE_MODEL`, `GROQ_API_BASE_URL`.
- UI: add Groq fields to the session config modal in `public/index.html` (`Groq API Key`, `Groq Transcribe Model`, `Groq API Base URL`) with i18n (EN/PT-BR).
- Docs: add transcription guides `docs/TRANSCRIPTION_AUDIO.md` (EN) and `docs/pt-BR/TRANSCRICAO_AUDIO.md` (PT-BR); linked new section "Audio Transcription" in `public/docs/index.html`.

---

## 3.0.0-beta-47

- Baseline version referenced by users; subsequent fixes and features listed under Unreleased.

