# Changelog

## [Unreleased]

- Speed: default model is now eleven_v4_turbo; long texts split into ~2.5k-char parts voiced 3-at-a-time, and playback starts with part 1 while the rest generate.
- Play Welcome Intro: predefined tour script, no clipboard needed (setup test).
- Clipboard guard: if the clipboard holds your API key, it's skipped, the previous item is used, and the clipboard is replaced with the real text.
- Playback speed preference (1x–2x via afplay `-r`).
- Rate-limit resilience: max 2 parallel requests + automatic retry with backoff on 429s.

- Speak Clipboard as Podcast (single-voice `eleven_v4` TTS, chunked, MP3 save + auto-play).
- Clipboard to 2-Host Podcast (Text-to-Dialogue with Alex + Sam script, v4 audio tags).
