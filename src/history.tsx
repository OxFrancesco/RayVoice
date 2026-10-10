import {
  Action,
  ActionPanel,
  confirmAlert,
  Detail,
  getPreferenceValues,
  Icon,
  List,
  showInFinder,
  showToast,
  Toast,
  useNavigation,
  Keyboard,
} from "@raycast/api";
import type { ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { useEffect, useRef, useState } from "react";
import { playMp3Wait, preview, stopAllAfplay, stopAudio } from "./lib/audio";
import { deleteEpisode, kindLabel, listEpisodes, type Episode } from "./lib/episodes";

function TranscriptView({ ep }: { ep: Episode }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    (async () => {
      if (!ep.transcriptPath) {
        setText(null);
        return;
      }
      try {
        const raw = await readFile(ep.transcriptPath, "utf8");
        const body = raw
          .split("\n")
          .filter((l) => !l.startsWith("# "))
          .join("\n")
          .trim();
        if (on) setText(body || null);
      } catch {
        if (on) setText(null);
      }
    })();
    return () => {
      on = false;
    };
  }, [ep]);

  return (
    <Detail
      isLoading={text === null && ep.hasTranscript}
      markdown={
        text
          ? `# 📝 Transcript\n\n${preview(text, 6000)}`
          : `# 📝 Transcript\n\n_No transcript saved for this episode (it was generated before transcripts were kept)._`
      }
      actions={
        <ActionPanel>
          {text && <Action.CopyToClipboard title="Copy Transcript" content={text} />}
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingBase, setPlayingBase] = useState<string | null>(null);
  const player = useRef<ChildProcess | null>(null);
  const playId = useRef(0);
  const { push } = useNavigation();

  const refresh = async () => {
    setEpisodes(await listEpisodes());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    return () => {
      // Don't kill playback: closing the bucket keeps the audio going.
      player.current = null;
    };
  }, []);

  const play = async (ep: Episode) => {
    const id = ++playId.current;
    stopAudio(player.current);
    await stopAllAfplay();
    setPlayingBase(ep.base);
    const rate =
      parseFloat(getPreferenceValues<{ playbackRate?: string }>().playbackRate || "1") || 1;
    for (const p of ep.mp3s) {
      if (playId.current !== id) break; // superseded by another play/stop
      const { done, child } = playMp3Wait(p, rate);
      player.current = child;
      await done;
    }
    setPlayingBase((b) => (b === ep.base ? null : b));
  };

  const stop = async () => {
    playId.current++;
    stopAudio(player.current);
    await stopAllAfplay();
    setPlayingBase(null);
  };

  const remove = async (ep: Episode) => {
    if (
      !(await confirmAlert({
        title: "Delete episode?",
        message: `This removes ${ep.mp3s.length} audio file(s)${ep.transcriptPath ? " and its transcript" : ""} from Downloads.`,
        primaryAction: { title: "Delete" },
      }))
    ) {
      return;
    }
    await deleteEpisode(ep);
    if (playingBase === ep.base) await stop();
    await refresh();
    try {
      await showToast({ style: Toast.Style.Success, title: "Episode deleted" });
    } catch {
      // view closed
    }
  };

  return (
    <List isLoading={loading} searchBarPlaceholder="Search past episodes…">
      {episodes.length === 0 && !loading ? (
        <List.EmptyView
          icon={Icon.Microphone}
          title="No episodes yet"
          description="Run Speak Clipboard as Podcast first — everything lands here."
        />
      ) : (
        episodes.map((ep) => (
          <List.Item
            key={ep.base}
            icon={playingBase === ep.base ? Icon.Stop : Icon.Play}
            title={`${kindLabel(ep.kind)} · ${new Date(ep.mtimeMs).toLocaleString()}`}
            subtitle={ep.transcriptHead || "(transcript not saved)"}
            keywords={[ep.transcriptHead, kindLabel(ep.kind)]}
            accessories={[{ text: ep.mp3s.length > 1 ? `${ep.mp3s.length} parts` : "1 part" }]}
            actions={
              <ActionPanel>
                {playingBase === ep.base ? (
                  <Action title="Stop Playback" icon={Icon.Stop} onAction={stop} />
                ) : (
                  <Action title="Play" icon={Icon.Play} onAction={() => play(ep)} />
                )}
                <Action
                  title="Show Transcript"
                  icon={Icon.Text}
                  onAction={() => push(<TranscriptView ep={ep} />)}
                />
                <Action
                  title="Reveal in Finder"
                  icon={Icon.Finder}
                  shortcut={Keyboard.Shortcut.Common.Open}
                  onAction={() => showInFinder(ep.mp3s[0])}
                />
                <Action
                  title="Delete Episode"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={() => remove(ep)}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
