# RayVoice

Turn the text on your clipboard into audio with ElevenLabs. Default model is `eleven_v4_turbo`.

## Commands

| Command | What it does |
|---|---|
| Speak Clipboard as Podcast | Reads the clipboard in one voice. The first sentence plays about a second after you run it. |
| Clipboard to 2-Host Podcast | Turns the clipboard into an Alex and Sam conversation with Text-to-Dialogue. |
| Play Welcome Intro | Short spoken tour. Voiced once per voice and model, then played from cache. |
| Browse Past Episodes | Search transcripts, replay, open in your default player, copy the audio file, delete. |
| Stop Playback Now | Stops RayVoice audio from anywhere. |

Change speed while listening with ⌘S. Episodes land in `~/Downloads/RayVoice/` as one MP3 plus a `.txt` transcript.

## How it works

`assets/rayvoice-engine.sh` runs detached from Raycast, so closing the window doesn't stop anything.

- `fetch` sends the parts to ElevenLabs with `curl`, two at a time. curl retries 429s and 5xx on its own and honors `Retry-After`. When every part is in, the engine strips each part's ID3 tag and Info frame and joins them, so players see the full length.
- `play` plays files in order and waits for parts that are still being voiced. A speed change sends it `SIGUSR1`, which restarts the current part at the new rate.

Part sizes grow (150, 500, 1,500, then 3,000 characters), so the first audio is quick and each later part is ready before the one ahead of it finishes. The API key goes to curl through a `0600` header file that's deleted when the job ends. It never appears in a process list.

## Setup

1. Create an API key at https://elevenlabs.io/app/settings/api-keys.
2. `npm install && npm run dev`, then paste the key into the extension preferences.
3. Optional: change the voice IDs (defaults are Rachel and George), model, format, auto-play, and starting speed.
