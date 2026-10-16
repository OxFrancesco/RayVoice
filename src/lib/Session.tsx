import {
  Action,
  ActionPanel,
  Color,
  Detail,
  getPreferenceValues,
  Icon,
  Keyboard,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { readSettings, type Settings } from "./elevenlabs";
import {
  cancelJob,
  play,
  readJob,
  readPlayer,
  setRate,
  startJob,
  stopPlayback,
  type Job,
  type JobSpec,
  type JobState,
  type PlayerState,
} from "./engine";
import { audioSeconds, formatDuration } from "./episodes";
import { SpeedMenu } from "./SpeedMenu";

export interface Prepared {
  /** Shown in the view and saved next to the audio. */
  transcript: string;
  model: string;
  /** Request to voice. Leave out when `cachedFile` already has the audio. */
  spec?: Omit<JobSpec, "apiKey">;
  cachedFile?: string;
  /** One-off message, e.g. that the API key was skipped on the clipboard. */
  notice?: string;
}

type Stage =
  | { name: "preparing" }
  | { name: "failed"; error: string }
  | { name: "running"; prepared: Prepared; job: Job | null; file: string };

const POLL_MS = 250;
const MARKDOWN_MAX = 8000;

function sameJson<T>(a: T, b: T) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function toMarkdown(transcript: string): string {
  const body =
    transcript.length > MARKDOWN_MAX ? transcript.slice(0, MARKDOWN_MAX) + "…" : transcript;
  return body.replace(/^(Alex|Sam): /gm, "**$1**  \n");
}

export function Session({
  title,
  prepare,
}: {
  title: string;
  prepare: (settings: Settings) => Promise<Prepared>;
}) {
  const settings = useRef(readSettings(getPreferenceValues<Preferences>())).current;
  const [stage, setStage] = useState<Stage>({ name: "preparing" });
  const [job, setJob] = useState<JobState | null>(null);
  const [player, setPlayer] = useState<PlayerState>({
    active: false,
    file: null,
    rate: settings.rate,
  });
  const [rate, setLocalRate] = useState(settings.rate);
  const [seconds, setSeconds] = useState<number | null>(null);

  // Dev mode mounts effects twice; one session must start exactly one job.
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!startedRef.current) {
      startedRef.current = true;
      (async () => {
        try {
          if (!settings.apiKey)
            throw new Error("Add your ElevenLabs API key in the extension preferences.");
          const prepared = await prepare(settings);
          if (prepared.notice) showToast({ style: Toast.Style.Success, title: prepared.notice });
          let started: Job | null = null;
          let file = prepared.cachedFile ?? "";
          if (prepared.spec) {
            started = await startJob({ ...prepared.spec, apiKey: settings.apiKey });
            file = started.out;
          }
          if (settings.autoPlay) play(started ? started.parts : [file], settings.rate);
          if (mountedRef.current) setStage({ name: "running", prepared, job: started, file });
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          if (mountedRef.current) setStage({ name: "failed", error });
        }
      })();
    }
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const running = stage.name === "running" ? stage : null;

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const nextPlayer = readPlayer();
      setPlayer((prev) => (sameJson(prev, nextPlayer) ? prev : nextPlayer));
      if (running.job) {
        const nextJob = readJob(running.job);
        setJob((prev) => (sameJson(prev, nextJob) ? prev : nextJob));
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [running]);

  const done = !!running && (!running.job || !!job?.done);
  const error = stage.name === "failed" ? stage.error : (job?.error ?? null);

  useEffect(() => {
    if (!done || !running) return;
    audioSeconds(running.file)
      .then(setSeconds)
      .catch(() => setSeconds(null));
  }, [done]);

  const parts = running?.job?.parts ?? [];
  const partIndex = player.file ? parts.indexOf(player.file) : -1;
  const playingOurs = !!player.file && (partIndex >= 0 || player.file === running?.file);
  const starting = player.active && !player.file;
  const words = running ? running.prepared.transcript.split(/\s+/).filter(Boolean).length : 0;

  const audioLabel = (() => {
    if (error) return "Failed";
    if (job?.cancelled) return "Cancelled";
    if (done) return seconds ? formatDuration(seconds) : "Ready";
    return parts.length > 1 ? `Voicing ${job?.ready ?? 0} of ${parts.length}` : "Voicing";
  })();
  const playbackLabel = starting
    ? "Starting"
    : !playingOurs
      ? "Stopped"
      : partIndex >= 0 && parts.length > 1
        ? `Part ${partIndex + 1} of ${parts.length}`
        : "Playing";

  const changeRate = (r: number) => {
    setLocalRate(r);
    setRate(r);
  };

  const playFromStart = () => {
    if (!running) return;
    play(done || !running.job ? [running.file] : running.job.parts, rate);
    setPlayer({ active: true, file: null, rate });
  };

  const stop = () => {
    stopPlayback();
    setPlayer({ active: false, file: null, rate });
  };

  const markdown = [
    error && `**${stage.name === "failed" ? "Couldn't start" : "Voicing failed"}.** ${error}`,
    running && toMarkdown(running.prepared.transcript),
  ]
    .filter(Boolean)
    .join("\n\n");

  const isKeyError = !!error && /API key/i.test(error);

  return (
    <Detail
      navigationTitle={title}
      isLoading={
        stage.name === "preparing" || (!!running?.job && !done && !error && !job?.cancelled)
      }
      markdown={markdown}
      metadata={
        running ? (
          <Detail.Metadata>
            <Detail.Metadata.Label
              title="Audio"
              text={{ value: audioLabel, color: error ? Color.Red : undefined }}
            />
            <Detail.Metadata.Label
              title="Playback"
              text={playbackLabel}
              icon={
                playingOurs
                  ? { source: Icon.SpeakerOn, tintColor: Color.Green }
                  : starting
                    ? Icon.SpeakerOn
                    : Icon.SpeakerOff
              }
            />
            <Detail.Metadata.Label title="Speed" text={`${rate}×`} />
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label title="Model" text={running.prepared.model} />
            <Detail.Metadata.Label title="Length" text={`${words.toLocaleString()} words`} />
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          {running && !error && (
            <ActionPanel.Section>
              {playingOurs || starting ? (
                <Action title="Stop" icon={Icon.Stop} onAction={stop} />
              ) : (
                <Action title="Play from Start" icon={Icon.Play} onAction={playFromStart} />
              )}
              <SpeedMenu current={rate} onSelect={changeRate} />
            </ActionPanel.Section>
          )}
          {running && done && !error && (
            <ActionPanel.Section>
              <Action.Open
                title="Open in Default Player"
                icon={Icon.AppWindow}
                target={running.file}
                shortcut={Keyboard.Shortcut.Common.Open}
              />
              <Action.ShowInFinder path={running.file} />
              <Action.CopyToClipboard
                title="Copy Audio File"
                content={{ file: running.file }}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
              <Action.CopyToClipboard
                title="Copy Transcript"
                content={running.prepared.transcript}
                shortcut={Keyboard.Shortcut.Common.CopyName}
              />
            </ActionPanel.Section>
          )}
          {running?.job && !done && !error && !job?.cancelled && (
            <Action
              title="Cancel Voicing"
              icon={Icon.XMarkCircle}
              style={Action.Style.Destructive}
              shortcut={Keyboard.Shortcut.Common.Remove}
              onAction={() => {
                if (running.job) cancelJob(running.job);
                stop();
              }}
            />
          )}
          {error && (
            <ActionPanel.Section>
              {isKeyError && (
                <Action
                  title="Open Extension Preferences"
                  icon={Icon.Gear}
                  onAction={openExtensionPreferences}
                />
              )}
              <Action.CopyToClipboard title="Copy Error" content={error} />
            </ActionPanel.Section>
          )}
        </ActionPanel>
      }
    />
  );
}
