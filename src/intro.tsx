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
import { convertTts } from "./lib/elevenlabs";
import { SpeedMenu } from "./lib/SpeedMenu";

interface Prefs {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  autoPlay?: boolean;
  playbackRate?: string;
}

const INTRO_SCRIPT = [
  "[excited] Welcome to RayVoice!",
  "[friendly] I'm your narrator, running on ElevenLabs' most expressive voice model.",
  "[cheerful] Here's how it works: copy any text, anywhere — an article, an email, your notes — then run Speak Clipboard as Podcast, and I'll turn it into audio for you.",
  "[curious] Want a two-host show instead? Run Clipboard to 2-Host Podcast, and Alex and Sam will riff on whatever you just copied.",
  "[warm] Your audio saves to your Downloads folder and plays automatically. Now go copy something interesting!",
].join(" ");

type Phase = "generating" | "ready" | "error";

export default function Command() {
  const [phase, setPhase] = useState<Phase>("generating");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
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

  const playAt = (path: string, r: number) => {
    player.current = playMp3(path, r);
    setPlaying(true);
    player.current.on("exit", () => mounted.current && setPlaying(false));
  };

  const changeRate = async (r: number) => {
    setRate(r);
    if (!audioPath || !playing) return;
    stopAudio(player.current);
    await stopAllAfplay();
    playAt(audioPath, r);
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

        const modelId = prefs.modelId || "eleven_v4_turbo";
        const voiceId = prefs.voiceId?.trim() || "21m00Tcm4TlvDq8ikWAM";
        const outputFormat = prefs.outputFormat || "mp3_44100_128";
        const initialRate = parseFloat(prefs.playbackRate || "1") || 1;
        if (mounted.current) setRate(initialRate);

        await notify({ style: Toast.Style.Animated, title: "Voicing welcome intro…" });
        const audio = await convertTts({
          apiKey: prefs.apiKey,
          voiceId,
          modelId,
          text: INTRO_SCRIPT,
          outputFormat,
        });
        const stamp = newRunStamp();
        const path = await saveMp3(audio, "rayvoice-intro", stamp);
        await saveTranscript(
          INTRO_SCRIPT,
          "rayvoice-intro",
          stamp,
          `RayVoice intro — ${new Date().toLocaleString()} · ${modelId}`
        );
        if (mounted.current) {
          setAudioPath(path);
          setPhase("ready");
        }
        await notify({
          style: Toast.Style.Success,
          title: "Welcome to RayVoice",
          message: path,
        });

        if (prefs.autoPlay !== false) {
          playAt(path, initialRate);
        }
      } catch (e) {
        if (!mounted.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPhase("error");
        await notify({ style: Toast.Style.Failure, title: "Couldn't play intro", message: msg });
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
      ? `# ⚠️ RayVoice failed\n\n${error}\n\n## Fix it\n- Set your API key in Preferences → Extensions → RayVoice (https://elevenlabs.io/app/settings/api-keys).`
      : `# 👋 Welcome to RayVoice\n\n${phase === "generating" ? "Voicing the intro…" : `${playing ? `▶️ Playing · ${rate}x · keeps playing if you close this view` : "⏸️ Paused / finished"}\n\n📁 \`${audioPath}\``}\n\n---\n\n${preview(INTRO_SCRIPT, 1200)}\n\n---\n\n**Next:** copy any text, then try **Speak Clipboard as Podcast** or **Clipboard to 2-Host Podcast**.`;

  return (
    <Detail
      isLoading={phase === "generating"}
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
                    playAt(audioPath, rate);
                  }}
                />
              )}
              <SpeedMenu current={rate} onSelect={changeRate} />
              <Action
                title="Reveal in Finder"
                icon={Icon.Finder}
                onAction={() => showInFinder(audioPath)}
              />
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
