import { resolveClipboardText } from "./lib/clipboard";
import { batchTurns, dialogueModel, dialogueUrl } from "./lib/elevenlabs";
import { newEpisodePath, transcriptFile } from "./lib/episodes";
import { buildPodcastScript, cleanForSpeech } from "./lib/script";
import { Session } from "./lib/Session";

/** The intro turns go alone so the first audio lands fast, then requests grow. */
const BATCH_STEPS = [300, 800, 2_000];
const batchLimit = (i: number) => BATCH_STEPS[Math.min(i, BATCH_STEPS.length - 1)];

export default function Command() {
  return (
    <Session
      title="2-Host Podcast"
      prepare={async (s) => {
        const { text, skippedKey } = await resolveClipboardText(s.apiKey);
        if (cleanForSpeech(text).length < 10) {
          throw new Error("The clipboard text is too short for a podcast.");
        }
        const model = dialogueModel(s.modelId);
        const { turns, transcript } = buildPodcastScript(text, s.voiceId, s.voiceId2);
        return {
          transcript,
          model,
          notice: skippedKey
            ? "Skipped your API key and used the previous clipboard item"
            : undefined,
          spec: {
            url: dialogueUrl(s.outputFormat),
            bodies: batchTurns(turns, batchLimit).map((inputs) => ({ inputs, model_id: model })),
            out: newEpisodePath("podcast", cleanForSpeech(text)),
            transcript: transcriptFile(cleanForSpeech(text), transcript),
          },
        };
      }}
    />
  );
}
