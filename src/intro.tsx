import { environment } from "@raycast/api";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chunkText, partLimit, ttsUrl } from "./lib/elevenlabs";
import { stripAudioTags } from "./lib/script";
import { Session } from "./lib/Session";

const SCRIPT = [
  "[excited] Welcome to RayVoice!",
  "[friendly] Copy any text, an article, an email, your notes, and run Speak Clipboard as Podcast. I'll read it to you.",
  "[curious] Want two hosts instead? Run Clipboard to 2-Host Podcast, and Alex and Sam will talk it through.",
  "[warm] Every episode lands in Downloads, in the RayVoice folder, and Browse Past Episodes has them all. Now go copy something good.",
].join(" ");

export default function Command() {
  return (
    <Session
      title="Welcome"
      prepare={async (s) => {
        // Same voice, model and format give the same audio, so voice it once.
        const key = createHash("sha1")
          .update([s.voiceId, s.modelId, s.outputFormat, SCRIPT].join("|"))
          .digest("hex")
          .slice(0, 12);
        const file = join(environment.supportPath, "intro", `${key}.mp3`);
        const transcript = stripAudioTags(SCRIPT);
        if (existsSync(file)) return { transcript, model: s.modelId, cachedFile: file };
        return {
          transcript,
          model: s.modelId,
          spec: {
            url: ttsUrl(s.voiceId, s.outputFormat),
            bodies: chunkText(SCRIPT, partLimit(s.modelId)).map((text) => ({
              text,
              model_id: s.modelId,
            })),
            out: file,
          },
        };
      }}
    />
  );
}
