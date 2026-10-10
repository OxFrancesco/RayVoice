import {
  Action,
  ActionPanel,
  Detail,
  getPreferenceValues,
  Icon,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import type { ChildProcess } from "node:child_process";
import { useEffect, useRef, useState } from "react";
import {
  newRunStamp,
  playMp3Wait,
  preview,
  saveMp3Part,
  saveTranscript,
  stopAllAfplay,
  stopAudio,
} from "./lib/audio";
import { resolveClipboardText } from "./lib/clipboard";
import { chunkText, convertTts, MODEL_CHAR_LIMITS, parallel } from "./lib/elevenlabs";
import { cleanForSpeech } from "./lib/script";
import { SpeedMenu } from "./lib/SpeedMenu";

interface Prefs {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  autoPlay?: boolean;
  playbackRate?: string;
}

type Phase = "reading" | "generating" | "ready" | "error";

/** Small pieces = first audio fast + requests run side by side. */
const PIECE_TARGET = 2500;
/** Free tier allows 5 concurrent requests; stay well under it. */
const MAX_PARALLEL = 2;

export default function Command() {
  const [phase, setPhase] = useState<Phase>("reading");
  const [rawText, setRawText] = useState("");
  const [partPaths, setPartPaths] = useState<string[]>([]);
  const [partIndex, setPartIndex] = useState(0);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState("");
  const [playing, setPlaying] = useState(false);
  const player = useRef<ChildProcess | null>(null);
  const stopRequested = useRef(false);
  const mounted = useRef(true);
  const rateRef = useRef(1);
  rateRef.current = rate;

  const notify = async (t: { style: Toast.Style; title: string; message?: string }) => {
    if (!mounted.current) return;
    try {
      await showToast(t);
    } catch {
      // view closed — nothing to show to
    }
  };

  /** Plays parts in order. Reads live speed so changes apply from the next part. */
  const playChain = async (paths: string[], from = 0) => {
    if (mounted.current) setPlaying(true);
    for (let i = from; i < paths.length; i++) {
      if (stopRequested.current) break;
      if (mounted.current) setPartIndex(i);
      const { done, child } = playMp3Wait(paths[i], rateRef.current);
      player.current = child;
      await done;
    }
    if (mounted.current) setPlaying(false);
  };

  const changeRate = async (r: number) => {
    setRate(r);
    if (partPaths.length === 0 || !playing) return; // applies to next play / next part
    stopRequested.current = true;
    stopAudio(player.current);
    await stopAllAfplay();
    stopRequested.current = false;
    await playChain(partPaths, partIndex);
  };

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const prefs = getPreferenceValues<Prefs>();
        if (!prefs.apiKey)
          throw new Error(
            "Missing ElevenLabs API key. Set it in Raycast Preferences → Extensions → RayVoice."
          );
        const initialRate = parseFloat(prefs.playbackRate || "1") || 1;
        if (mounted.current) setRate(initialRate);

        const { text: clip, usedHistory } = await resolveClipboardText(prefs.apiKey);
        if (clip.length < 3) throw new Error("Clipboard text is too short to narrate.");
        if (usedHistory) {
          await notify({
            style: Toast.Style.Success,
            title: "Skipped your API key — clipboard updated with the real text",
          });
        }
        if (mounted.current) {
          setRawText(clip);
          setPhase("generating");
        }

        const modelId = prefs.modelId || "eleven_v4_turbo";
        const voiceId = prefs.voiceId?.trim() || "21m00Tcm4TlvDq8ikWAM";
        const outputFormat = prefs.outputFormat || "mp3_44100_128";
        const limit = MODEL_CHAR_LIMITS[modelId] ?? 10_000;

        const speech = cleanForSpeech(clip);
        const chunks = chunkText(speech, Math.min(limit, PIECE_TARGET));
        if (mounted.current) {
          setMeta(
            `${clip.length.toLocaleString()} chars · ${chunks.length} part${chunks.length > 1 ? "s" : ""} in parallel · ${modelId}`
          );
          await notify({
            style: Toast.Style.Animated,
            title:
              chunks.length > 1
                ? `Voicing ${chunks.length} parts in parallel…`
                : "Voicing clipboard…",
          });
        }

        // All parts generate at once; playback starts as soon as part 1 lands.
        const stamp = newRunStamp();
        const paths = await parallel(chunks, MAX_PARALLEL, async (text, i) => {
          const audio = await convertTts({
            apiKey: prefs.apiKey,
            voiceId,
            modelId,
            text,
            outputFormat,
          });
          return saveMp3Part(audio, "rayvoice-speech", i, chunks.length, stamp);
        });
        await saveTranscript(
          clip,
          "rayvoice-speech",
          stamp,
          `RayVoice narration — ${new Date().toLocaleString()} · ${modelId} · voice ${voiceId.slice(0, 8)}… · ${clip.length} chars · ${chunks.length} parts`
        );
        if (mounted.current) {
          setPartPaths(paths);
          setPhase("ready");
        }
        await notify({
          style: Toast.Style.Success,
          title: paths.length > 1 ? "Playing part 1 — rest generating…" : "Podcast audio ready",
          message: paths[0],
        });

        if (prefs.autoPlay !== false) {
          stopRequested.current = false;
          await playChain(paths);
        }
      } catch (e) {
        if (!mounted.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPhase("error");
        await notify({
          style: Toast.Style.Failure,
          title: "Couldn't generate audio",
          message: msg,
        });
      }
    })();
    return () => {
      // Intentionally NOT killing playback: audio keeps going if the view closes.
      mounted.current = false;
      player.current = null;
    };
  }, []);

  const stop = async () => {
    stopRequested.current = true;
    stopAudio(player.current);
    await stopAllAfplay();
    setPlaying(false);
  };

  const replay = async () => {
    stopAudio(player.current);
    await stopAllAfplay();
    stopRequested.current = false;
    await playChain(partPaths);
  };

  const markdown =
    phase === "error"
      ? `# ⚠️ RayVoice failed\n\n${error}\n\n## Fix it\n- Copy text first (this reads your latest clipboard).\n- Preferences → Extensions → RayVoice: set your ElevenLabs API key (https://elevenlabs.io/app/settings/api-keys).\n- Free tier ≈ 10 min/mo. 402 = out of credits.`
      : phase === "ready"
        ? `# 🎙️ Clipboard → Podcast\n\n**${meta}**\n\n${playing ? `▶️ Playing part ${partIndex + 1}/${partPaths.length} · ${rate}x · keeps playing if you close this view` : "⏸️ Paused / finished"}\n\n📁 \`${partPaths[0] ?? ""}\`${partPaths.length > 1 ? ` (+${partPaths.length - 1} more parts)` : ""}\n\n---\n\n${preview(rawText)}`
        : `# 🎙️ RayVoice\n\n${phase === "reading" ? "Reading clipboard…" : `Generating audio…\n\n**${meta || "contacting ElevenLabs…"}**`}\n\n${rawText ? `---\n\n${preview(rawText, 600)}` : ""}`;

  return (
    <Detail
      isLoading={phase === "reading" || phase === "generating"}
      markdown={markdown}
      actions={
        <ActionPanel>
          {phase === "ready" && partPaths.length > 0 && (
            <>
              {playing ? (
                <Action title="Stop Playback" icon={Icon.Stop} onAction={stop} />
              ) : (
                <Action title="Play Again" icon={Icon.Play} onAction={replay} />
              )}
              <SpeedMenu current={rate} onSelect={changeRate} />
              <Action
                title="Reveal in Finder"
                icon={Icon.Finder}
                onAction={() => showInFinder(partPaths[0])}
              />
              <Action.CopyToClipboard title="Copy File Paths" content={partPaths.join("\n")} />
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
