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
import { chunkText, convertTts, MODEL_CHAR_LIMITS } from "./lib/elevenlabs";
import { cleanForSpeech } from "./lib/script";

interface Prefs {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  autoPlay?: boolean;
}

type Phase = "reading" | "generating" | "ready" | "error";

export default function Command() {
  const [phase, setPhase] = useState<Phase>("reading");
  const [rawText, setRawText] = useState("");
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
            "Missing ElevenLabs API key. Set it in Raycast Preferences → Extensions → RayVoice."
          );

        const clip = ((await Clipboard.readText()) ?? "").trim();
        if (!clip) {
          throw new Error("Clipboard is empty. Copy some text first, then run this command.");
        }
        if (clip.length < 3) throw new Error("Clipboard text is too short to narrate.");
        if (!cancelled) {
          setRawText(clip);
          setPhase("generating");
        }

        const modelId = prefs.modelId || "eleven_v4";
        const voiceId = prefs.voiceId?.trim() || "21m00Tcm4TlvDq8ikWAM";
        const outputFormat = prefs.outputFormat || "mp3_44100_128";
        const limit = MODEL_CHAR_LIMITS[modelId] ?? 10_000;

        const speech = cleanForSpeech(clip);
        const chunks = chunkText(speech, limit);
        if (!cancelled) {
          setMeta(
            `${clip.length.toLocaleString()} chars · ${chunks.length} request${chunks.length > 1 ? "s" : ""} · ${modelId} · voice ${voiceId.slice(0, 8)}…`
          );
          await showToast({
            style: Toast.Style.Animated,
            title:
              chunks.length > 1 ? `Narrating in ${chunks.length} parts…` : "Narrating clipboard…",
          });
        }

        const parts: Buffer[] = [];
        for (let i = 0; i < chunks.length; i++) {
          if (cancelled) return;
          if (chunks.length > 1) {
            await showToast({
              style: Toast.Style.Animated,
              title: `Part ${i + 1}/${chunks.length}…`,
            });
          }
          parts.push(
            await convertTts({
              apiKey: prefs.apiKey,
              voiceId,
              modelId,
              text: chunks[i],
              outputFormat,
            })
          );
        }
        const audio = Buffer.concat(parts);
        const path = await saveMp3(audio, "rayvoice-speech");
        if (cancelled) return;

        setAudioPath(path);
        setPhase("ready");
        await showToast({
          style: Toast.Style.Success,
          title: "Podcast audio ready",
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
          title: "Couldn't generate audio",
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
      ? `# ⚠️ RayVoice failed\n\n${error}\n\n## Fix it\n- Copy text first (this reads your latest clipboard).\n- Preferences → Extensions → RayVoice: set your ElevenLabs API key (https://elevenlabs.io/app/settings/api-keys).\n- Free tier ≈ 10 min/mo. 402 = out of credits.`
      : phase === "ready"
        ? `# 🎙️ Clipboard → Podcast\n\n**${meta}**\n\n${playing ? "▶️ Playing…" : "⏸️ Paused / finished"}\n\n📁 \`${audioPath}\`\n\n---\n\n${preview(rawText)}`
        : `# 🎙️ RayVoice\n\n${phase === "reading" ? "Reading clipboard…" : `Generating audio…\n\n**${meta || "contacting ElevenLabs…"}**`}\n\n${rawText ? `---\n\n${preview(rawText, 600)}` : ""}`;

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
              <Action.CopyToClipboard title="Copy File Path" content={audioPath} />
              <Action.CopyToClipboard title="Copy Transcript" content={rawText} />
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
