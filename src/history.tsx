import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  getPreferenceValues,
  Icon,
  Keyboard,
  List,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect, useMemo, useState } from "react";
import { readSettings } from "./lib/elevenlabs";
import { play, readPlayer, setRate, stopPlayback } from "./lib/engine";
import { deleteEpisode, formatDuration, KINDS, listEpisodes, type Episode } from "./lib/episodes";
import { SpeedMenu } from "./lib/SpeedMenu";

function usePlayingFile(): [string | null, (file: string | null) => void] {
  const [file, setFile] = useState<string | null>(() => readPlayer().file);
  useEffect(() => {
    const id = setInterval(() => setFile(readPlayer().file), 500);
    return () => clearInterval(id);
  }, []);
  return [file, setFile];
}

export default function Command() {
  const { data: episodes = [], isLoading, mutate } = useCachedPromise(listEpisodes);
  const [search, setSearch] = useState("");
  const [rate, setLocalRate] = useState(
    () => readSettings(getPreferenceValues<Preferences>()).rate
  );
  const [playingFile, setPlayingFile] = usePlayingFile();

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return episodes;
    return episodes.filter((ep) => `${ep.title}\n${ep.transcript}`.toLowerCase().includes(q));
  }, [episodes, search]);

  const isPlaying = (ep: Episode) => !!playingFile && ep.mp3s.includes(playingFile);

  const start = (ep: Episode) => {
    play(ep.mp3s, rate);
    setPlayingFile(ep.mp3s[0]);
  };

  const stop = () => {
    stopPlayback();
    setPlayingFile(null);
  };

  const remove = async (ep: Episode) => {
    const confirmed = await confirmAlert({
      title: "Delete this episode?",
      message: "The audio and transcript are removed from Downloads.",
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    if (isPlaying(ep)) stop();
    await mutate(deleteEpisode(ep), {
      optimisticUpdate: (list) => list?.filter((e) => e.base !== ep.base),
    });
  };

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={shown.length > 0}
      filtering={false}
      onSearchTextChange={setSearch}
      searchBarPlaceholder="Search transcripts"
    >
      <List.EmptyView
        icon={Icon.Microphone}
        title={search ? "No matches" : "No episodes yet"}
        description={search ? undefined : "Copy some text and run Speak Clipboard as Podcast."}
      />
      {shown.map((ep) => {
        const playing = isPlaying(ep);
        return (
          <List.Item
            key={ep.base}
            icon={
              playing
                ? { source: Icon.SpeakerOn, tintColor: Color.Green }
                : { source: KINDS[ep.kind].icon, tintColor: Color.SecondaryText }
            }
            title={ep.title}
            accessories={[
              ...(ep.seconds ? [{ text: formatDuration(ep.seconds) }] : []),
              { date: new Date(ep.createdAt), tooltip: new Date(ep.createdAt).toLocaleString() },
            ]}
            detail={
              <List.Item.Detail
                markdown={
                  ep.transcript
                    ? ep.transcript.replace(/^(Alex|Sam): /gm, "**$1**  \n")
                    : "_No transcript was saved for this episode._"
                }
              />
            }
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  {playing ? (
                    <Action title="Stop" icon={Icon.Stop} onAction={stop} />
                  ) : (
                    <Action title="Play" icon={Icon.Play} onAction={() => start(ep)} />
                  )}
                  <SpeedMenu
                    current={rate}
                    onSelect={(r) => {
                      setLocalRate(r);
                      setRate(r);
                    }}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action.Open
                    title="Open in Default Player"
                    icon={Icon.AppWindow}
                    target={ep.mp3s[0]}
                    shortcut={Keyboard.Shortcut.Common.Open}
                  />
                  <Action.ShowInFinder path={ep.mp3s[0]} />
                  <Action.CopyToClipboard
                    title="Copy Audio File"
                    content={{ file: ep.mp3s[0] }}
                    shortcut={Keyboard.Shortcut.Common.Copy}
                  />
                  {ep.transcript && (
                    <Action.CopyToClipboard
                      title="Copy Transcript"
                      content={ep.transcript}
                      shortcut={Keyboard.Shortcut.Common.CopyName}
                    />
                  )}
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="Delete Episode"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={Keyboard.Shortcut.Common.Remove}
                    onAction={() => remove(ep)}
                  />
                  <Action
                    title="Reload"
                    icon={Icon.ArrowClockwise}
                    shortcut={Keyboard.Shortcut.Common.Refresh}
                    onAction={() => mutate()}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
