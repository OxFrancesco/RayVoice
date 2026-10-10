import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  getPreferenceValues,
  Icon,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import type { ChildProcess } from "node:child_process";
import { useEffect, useRef, useState } from "react";
import { playMp3, preview, saveMp3, stopAllAfplay, stopAudio } from "./lib/audio";
import { batchTurns, convertDialogue } from "./lib/elevenlabs";
import { buildPodcastScript, cleanForSpeech } from "./lib/script";

interface Prefs {
  apiKey: string;
  voiceId?: string;
  voiceId2?: string;
  modelId?: string;
  outputFormat?: string;
  autoPlay?: boolean;
}

type Phase = "reading" | "generating" | "ready" | "error";

export default function Command() {
  const [phase, setPhase] = useState<Phase>("reading");
  const [readable, setReadable] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState("");
  const [playing, setPlaying] = useState(false);
  const player = useRef<ChildProcess | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prefs = getPreferenceValues<Prefs>();
        if (!prefs.apiKey)
          throw new Error(
            "Missing ElevenLabs API key. Set it in Preferences → Extensions → RayVoice."
          );

        const clip = ((await Clipboard.readText()) ?? "").trim();
        if (!clip)
          throw new Error("Clipboard is empty. Copy some text first, then run this command.");
        if (cleanForSpeech(clip).length < 10)
          throw new Error("Clipboard text is too short for a podcast.");
        if (!cancelled) setPhase("generating");

        const voiceA = prefs.voiceId?.trim() || "21m00Tcm4TlvDq8ikWAM"; // Rachel
        const voiceB = prefs.voiceId2?.trim() || "JBFqnCBsd6RMkjVDRZzb"; // George
        const requested = prefs.modelId || "eleven_v4";
        // Dialogue endpoint docs default to eleven_v3; v4 family supports it. Flash/Multilingual
        // don't do dialogue well, so coerce those to eleven_v4.
        const modelId =
          requested === "eleven_flash_v2_5" || requested === "eleven_multilingual_v2"
            ? "eleven_v4"
            : requested;
        const outputFormat = prefs.outputFormat || "mp3_44100_128";

        const { turns, readable: script } = buildPodcastScript(clip, voiceA, voiceB);
        const batches = batchTurns(turns, 2000);
        if (!cancelled) {
          setReadable(script);
          setMeta(
            `${clip.length.toLocaleString()} chars → ${turns.length} turns · ${batches.length} request${batches.length > 1 ? "s" : ""} · ${modelId}`
          );
          await showToast({ style: Toast.Style.Animated, title: "Writing 2-host script…" });
        }

        const parts: Buffer[] = [];
        for (let i = 0; i < batches.length; i++) {
          if (cancelled) return;
          await showToast({
            style: Toast.Style.Animated,
            title: `Voicing part ${i + 1}/${batches.length}…`,
          });
          parts.push(
            await convertDialogue({
              apiKey: prefs.apiKey,
              inputs: batches[i],
              modelId,
              outputFormat,
            })
          );
        }
        const path = await saveMp3(Buffer.concat(parts), "rayvoice-podcast");
        if (cancelled) return;

        setAudioPath(path);
        setPhase("ready");
        await showToast({
          style: Toast.Style.Success,
          title: "2-host podcast ready",
          message: path,
        });

        if (prefs.autoPlay !== false) {
          player.current = playMp3(path);
          setPlaying(true);
          player.current.on("exit", () => !cancelled && setPlaying(false));
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPhase("error");
        await showToast({
          style: Toast.Style.Failure,
          title: "Couldn't generate podcast",
          message: msg,
        });
      }
    })();
    return () => {
      cancelled = true;
      stopAudio(player.current);
      player.current = null;
    };
  }, []);

  const markdown =
    phase === "error"
      ? `# ⚠️ RayVoice failed\n\n${error}\n\n## Fix it\n- Copy text first, then re-run.\n- Set your API key in Preferences → Extensions → RayVoice.\n- Dialogue works best with eleven_v4 / eleven_v3 (Flash + Multilingual are auto-upgraded to v4).`
      : phase === "ready"
        ? `# 🎙️🎙️ 2-Host Podcast\n\n**${meta}**\n\n${playing ? "▶️ Playing…" : "⏸️ Paused / finished"}\n\n📁 \`${audioPath}\`\n\n---\n\n${preview(readable, 2200)}`
        : `# 🎙️🎙️ RayVoice\n\n${phase === "reading" ? "Reading clipboard…" : `Voicing your podcast…\n\n**${meta || "writing script…"}**`}\n\n${readable ? `---\n\n${preview(readable, 600)}` : ""}`;

  return (
    <Detail
      isLoading={phase === "reading" || phase === "generating"}
      markdown={markdown}
      actions={
        <ActionPanel>
          {phase === "ready" && audioPath && (
            <>
              {playing ? (
                <Action
                  title="Stop Playback"
                  icon={Icon.Stop}
                  onAction={async () => {
                    stopAudio(player.current);
                    await stopAllAfplay();
                    setPlaying(false);
                  }}
                />
              ) : (
                <Action
                  title="Play Again"
                  icon={Icon.Play}
                  onAction={() => {
                    if (!audioPath) return;
                    player.current = playMp3(audioPath);
                    setPlaying(true);
                    player.current.on("exit", () => setPlaying(false));
                  }}
                />
              )}
              <Action
                title="Reveal in Finder"
                icon={Icon.Finder}
                onAction={() => showInFinder(audioPath)}
              />
              <Action.CopyToClipboard title="Copy Script" content={readable} />
              <Action.CopyToClipboard title="Copy File Path" content={audioPath} />
            </>
          )}
          {phase === "error" && (
            <Action.CopyToClipboard title="Copy Error" content={error ?? "unknown"} />
          )}
        </ActionPanel>
      }
    />
  );
}
