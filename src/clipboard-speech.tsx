import { resolveClipboardText } from "./lib/clipboard";
import { chunkText, partLimit, ttsUrl } from "./lib/elevenlabs";
import { newEpisodePath, transcriptFile } from "./lib/episodes";
import { cleanForSpeech } from "./lib/script";
import { Session } from "./lib/Session";

export default function Command() {
  return (
    <Session
      title="Narration"
      prepare={async (s) => {
        const { text, skippedKey } = await resolveClipboardText(s.apiKey);
        const speech = cleanForSpeech(text);
        if (speech.length < 3) throw new Error("The clipboard text is too short to narrate.");
        const parts = chunkText(speech, partLimit(s.modelId));
        return {
          transcript: speech,
          model: s.modelId,
          notice: skippedKey
            ? "Skipped your API key and used the previous clipboard item"
            : undefined,
          spec: {
            url: ttsUrl(s.voiceId, s.outputFormat),
            bodies: parts.map((part) => ({ text: part, model_id: s.modelId })),
            out: newEpisodePath("speech", speech),
            transcript: transcriptFile(speech, speech),
          },
        };
      }}
    />
  );
}
