# Changelog

## [Unreleased]

### Rewrite

- Voicing and playback run in a detached engine, so they finish even if Raycast closes. Before, closing the window stopped generation and multi-part playback.
- First audio in about a second. Parts start at 150 characters and grow, and two are voiced at a time.
- Fixed: joined episodes only played their first part. Each part's Info frame told players the file was shorter than it was.
- Fixed: copying a file put its name on the clipboard as text, and RayVoice read the name aloud.
- The 2-host podcast now plays while it's still being voiced, like narration.
- The intro is cached per voice, model, and format, so replaying it is instant and costs no credits.
- Speed changes restart only the current part.
- New layout: the transcript on the left, with status, speed, model, and length in a side panel. Cancel voicing with ⌃X.
- Past episodes: full-transcript search, real durations, a transcript pane, open in your default player, copy the audio file.
- Stop Playback Now only stops RayVoice audio, not other afplay sessions.

### Earlier

- Speed: default model is now eleven_v4_turbo; long texts split into ~2.5k-char parts voiced 3-at-a-time, and playback starts with part 1 while the rest generate.
- Play Welcome Intro: predefined tour script, no clipboard needed (setup test).
- Clipboard guard: if the clipboard holds your API key, it's skipped, the previous item is used, and the clipboard is replaced with the real text.
- Playback speed preference (1x–2x via afplay `-r`), changeable mid-play from inside each command (⌘S).
- Past-episodes bucket (`history` command) with transcripts, replay, and delete.
- Audio keeps playing when the Raycast view closes (detached afplay; Stop uses kill).
- Global `Stop Playback Now` (no-view) kill switch.
- Parallel parts guaranteed in order: strict index-ordered playback + one united MP3 joined in order + one united transcript.
- Rate-limit resilience: max 2 parallel requests + automatic retry with backoff on 429s.

- Speak Clipboard as Podcast (single-voice `eleven_v4` TTS, chunked, MP3 save + auto-play).
- Clipboard to 2-Host Podcast (Text-to-Dialogue with Alex + Sam script, v4 audio tags).
