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
import { playMp3Wait, preview, saveMp3Part, stopAllAfplay, stopAudio } from "./lib/audio";
import { resolveClipboardText } from "./lib/clipboard";
import { chunkText, convertTts, MODEL_CHAR_LIMITS, parallel } from "./lib/elevenlabs";
import { cleanForSpeech } from "./lib/script";

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
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState("");
  const [playing, setPlaying] = useState(false);
  const player = useRef<ChildProcess | null>(null);
  const stopRequested = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const playChain = async (paths: string[], rate: number) => {
      setPlaying(true);
      for (let i = 0; i < paths.length; i++) {
        if (cancelled || stopRequested.current) break;
        if (!cancelled) setPartIndex(i);
        const { done, child } = playMp3Wait(paths[i], rate);
        player.current = child;
        await done;
      }
      if (!cancelled) setPlaying(false);
    };

    (async () => {
      try {
        const prefs = getPreferenceValues<Prefs>();
        if (!prefs.apiKey)
          throw new Error(
            "Missing ElevenLabs API key. Set it in Raycast Preferences → Extensions → RayVoice."
          );

        const { text: clip, usedHistory } = await resolveClipboardText(prefs.apiKey);
        if (clip.length < 3) throw new Error("Clipboard text is too short to narrate.");
        if (usedHistory) {
          await showToast({
            style: Toast.Style.Success,
            title: "Skipped your API key — clipboard updated with the real text",
          });
        }
        if (!cancelled) {
          setRawText(clip);
          setPhase("generating");
        }

        const modelId = prefs.modelId || "eleven_v4_turbo";
        const voiceId = prefs.voiceId?.trim() || "21m00Tcm4TlvDq8ikWAM";
        const outputFormat = prefs.outputFormat || "mp3_44100_128";
        const rate = parseFloat(prefs.playbackRate || "1") || 1;
        const limit = MODEL_CHAR_LIMITS[modelId] ?? 10_000;

        const speech = cleanForSpeech(clip);
        const chunks = chunkText(speech, Math.min(limit, PIECE_TARGET));
        if (!cancelled) {
          setMeta(
            `${clip.length.toLocaleString()} chars · ${chunks.length} part${chunks.length > 1 ? "s" : ""} in parallel · ${modelId} · ${rate}x`
          );
          await showToast({
            style: Toast.Style.Animated,
            title:
              chunks.length > 1
                ? `Voicing ${chunks.length} parts in parallel…`
                : "Voicing clipboard…",
          });
        }

        // All parts generate at once; playback starts as soon as part 1 lands.
        const paths = await parallel(chunks, MAX_PARALLEL, async (text, i) => {
          const audio = await convertTts({
            apiKey: prefs.apiKey,
            voiceId,
            modelId,
            text,
            outputFormat,
          });
          return saveMp3Part(audio, "rayvoice-speech", i, chunks.length);
        });
        if (cancelled) return;

        setPartPaths(paths);
        setPhase("ready");
        await showToast({
          style: Toast.Style.Success,
          title: paths.length > 1 ? "Playing part 1 — rest generating…" : "Podcast audio ready",
          message: paths[0],
        });

        if (prefs.autoPlay !== false) {
          stopRequested.current = false;
          await playChain(paths, rate);
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
      stopRequested.current = true;
      stopAudio(player.current);
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
    stopRequested.current = false;
    const rate = parseFloat(getPreferenceValues<Prefs>().playbackRate || "1") || 1;
    const paths = partPaths;
    setPlaying(true);
    for (let i = 0; i < paths.length; i++) {
      if (stopRequested.current) break;
      setPartIndex(i);
      const { done, child } = playMp3Wait(paths[i], rate);
      player.current = child;
      await done;
    }
    setPlaying(false);
  };

  const markdown =
    phase === "error"
      ? `# ⚠️ RayVoice failed\n\n${error}\n\n## Fix it\n- Copy text first (this reads your latest clipboard).\n- Preferences → Extensions → RayVoice: set your ElevenLabs API key (https://elevenlabs.io/app/settings/api-keys).\n- Free tier ≈ 10 min/mo. 402 = out of credits.`
      : phase === "ready"
        ? `# 🎙️ Clipboard → Podcast\n\n**${meta}**\n\n${playing ? `▶️ Playing part ${partIndex + 1}/${partPaths.length}…` : "⏸️ Paused / finished"}\n\n📁 \`${partPaths[0] ?? ""}\`${partPaths.length > 1 ? ` (+${partPaths.length - 1} more parts)` : ""}\n\n---\n\n${preview(rawText)}`
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
