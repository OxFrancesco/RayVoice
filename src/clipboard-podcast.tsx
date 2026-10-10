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
  playMp3,
  preview,
  saveMp3,
  saveTranscript,
  stopAllAfplay,
  stopAudio,
} from "./lib/audio";
import { resolveClipboardText } from "./lib/clipboard";
import { batchTurns, convertDialogue, parallel } from "./lib/elevenlabs";
import { buildPodcastScript, cleanForSpeech } from "./lib/script";
import { SpeedMenu } from "./lib/SpeedMenu";

interface Prefs {
  apiKey: string;
  voiceId?: string;
  voiceId2?: string;
  modelId?: string;
  outputFormat?: string;
  autoPlay?: boolean;
  playbackRate?: string;
}

type Phase = "reading" | "generating" | "ready" | "error";

export default function Command() {
  const [phase, setPhase] = useState<Phase>("reading");
  const [readable, setReadable] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState("");
  const [playing, setPlaying] = useState(false);
  const player = useRef<ChildProcess | null>(null);
  const mounted = useRef(true);

  const notify = async (t: { style: Toast.Style; title: string; message?: string }) => {
    if (!mounted.current) return;
    try {
      await showToast(t);
    } catch {
      // view closed
    }
  };

  const playAt = (path: string, r: number, onExit: () => void) => {
    player.current = playMp3(path, r);
    setPlaying(true);
    player.current.on("exit", () => {
      if (mounted.current) setPlaying(false);
      onExit();
    });
  };

  const changeRate = async (r: number) => {
    setRate(r);
    if (!audioPath || !playing) return; // applies on next play
    stopAudio(player.current);
    await stopAllAfplay();
    playAt(audioPath, r, () => undefined);
  };

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const prefs = getPreferenceValues<Prefs>();
        if (!prefs.apiKey)
          throw new Error(
            "Missing ElevenLabs API key. Set it in Preferences → Extensions → RayVoice."
          );
        const initialRate = parseFloat(prefs.playbackRate || "1") || 1;
        if (mounted.current) setRate(initialRate);

        const { text: clip, usedHistory } = await resolveClipboardText(prefs.apiKey);
        if (cleanForSpeech(clip).length < 10)
          throw new Error("Clipboard text is too short for a podcast.");
        if (usedHistory) {
          await notify({
            style: Toast.Style.Success,
            title: "Skipped your API key — clipboard updated with the real text",
          });
        }
        if (mounted.current) setPhase("generating");

        const voiceA = prefs.voiceId?.trim() || "21m00Tcm4TlvDq8ikWAM"; // Rachel
        const voiceB = prefs.voiceId2?.trim() || "JBFqnCBsd6RMkjVDRZzb"; // George
        const requested = prefs.modelId || "eleven_v4_turbo";
        // Dialogue needs a v3/v4-family model; coerce the others to turbo.
        const modelId =
          requested === "eleven_flash_v2_5" || requested === "eleven_multilingual_v2"
            ? "eleven_v4_turbo"
            : requested;
        const outputFormat = prefs.outputFormat || "mp3_44100_128";

        const { turns, readable: script } = buildPodcastScript(clip, voiceA, voiceB);
        const batches = batchTurns(turns, 2000);
        if (mounted.current) {
          setReadable(script);
          setMeta(
            `${clip.length.toLocaleString()} chars → ${turns.length} turns · ${batches.length} request${batches.length > 1 ? "s" : ""} · ${modelId}`
          );
          await notify({ style: Toast.Style.Animated, title: "Writing 2-host script…" });
        }

        const parts: Buffer[] = await parallel(
          batches,
          2, // free tier allows 5 concurrent; stay well under it (429s auto-retry anyway)
          (inputs) =>
            convertDialogue({
              apiKey: prefs.apiKey,
              inputs,
              modelId,
              outputFormat,
            })
        );
        const stamp = newRunStamp();
        const path = await saveMp3(Buffer.concat(parts), "rayvoice-podcast", stamp);
        await saveTranscript(
          script,
          "rayvoice-podcast",
          stamp,
          `RayVoice 2-host podcast — ${new Date().toLocaleString()} · ${modelId} · ${turns.length} turns`
        );
        if (mounted.current) {
          setAudioPath(path);
          setPhase("ready");
        }
        await notify({
          style: Toast.Style.Success,
          title: "2-host podcast ready",
          message: path,
        });

        if (prefs.autoPlay !== false) {
          playAt(path, initialRate, () => undefined);
        }
      } catch (e) {
        if (!mounted.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPhase("error");
        await notify({
          style: Toast.Style.Failure,
          title: "Couldn't generate podcast",
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

  const markdown =
    phase === "error"
      ? `# ⚠️ RayVoice failed\n\n${error}\n\n## Fix it\n- Copy text first, then re-run.\n- Set your API key in Preferences → Extensions → RayVoice.\n- Dialogue works best with eleven_v4_turbo / eleven_v4 / eleven_v3 (Flash + Multilingual are auto-upgraded to Turbo).`
      : phase === "ready"
        ? `# 🎙️🎙️ 2-Host Podcast\n\n**${meta}**\n\n${playing ? `▶️ Playing · ${rate}x · keeps playing if you close this view` : "⏸️ Paused / finished"}\n\n📁 \`${audioPath}\`\n\n---\n\n${preview(readable, 2200)}`
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
                    playAt(audioPath, rate, () => undefined);
                  }}
                />
              )}
              <SpeedMenu current={rate} onSelect={changeRate} />
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
