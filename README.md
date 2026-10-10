# RayVoice 🎙️

Turn your latest clipboarded text into an audio podcast with the latest ElevenLabs TTS model (**`eleven_v4`**, Sep 2026 — with `eleven_v4_turbo` / `eleven_v3` fallback).

## Commands

| Command | What it does |
|---|---|
| **Speak Clipboard as Podcast** (`clipboard-speech`) | Narrates clipboard text in a single expressive voice. Chunks long text, concatenates MP3, saves to `~/Downloads/RayVoice/`, auto-plays. |
| **Clipboard to 2-Host Podcast** (`clipboard-podcast`) | Rewrites clipboard text into an Alex + Sam dialogue (intro → alternating turns → outro) via ElevenLabs **Text-to-Dialogue**, with v4 audio tags (`[excited]`, `[curious]`…). |
| **Play Welcome Intro** (`intro`) | Predefined tour of the extension with a fixed script. Needs no clipboard — run it right after setup to test your key and voice. |

## Setup

1. Get a free API key: https://elevenlabs.io/app/settings/api-keys (free tier ≈ 10k credits ≈ 10 min/mo).
2. `npm install && npm run dev`, then open Raycast → Import Extension → select this folder.
3. Raycast → Preferences → Extensions → RayVoice → paste **API Key**.
4. Optional: change Voice IDs (defaults: Rachel `21m00Tcm4TlvDq8ikWAM` + George `JBFqnCBsd6RMkjVDRZzb`), model (`eleven_v4` default), format, auto-play.

Copy any text, hit the command, get an MP3 in `~/Downloads/RayVoice/` that starts playing.

## Notes

- `eleven_v4` limit: 10,000 chars/req (auto-chunked). Dialogue batches capped at ~2,000 chars/req for reliability.
- Markdown/URLs are stripped before TTS so it doesn't spell out links.
- Playback uses macOS `afplay`. Stop from the Detail view action.
- 401 = bad key, 402 = out of credits, 429 = rate limit.
