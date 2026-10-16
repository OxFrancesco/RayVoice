import { Action, ActionPanel, Icon, Keyboard } from "@raycast/api";

const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

/** Changing speed mid-play restarts the current part at the new rate. */
export function SpeedMenu({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (rate: number) => void;
}) {
  return (
    <ActionPanel.Submenu
      title="Playback Speed"
      icon={Icon.Gauge}
      shortcut={Keyboard.Shortcut.Common.Save}
    >
      {SPEEDS.map((s) => (
        <Action
          key={s}
          title={`${s}×`}
          icon={s === current ? Icon.Checkmark : undefined}
          onAction={() => onSelect(s)}
        />
      ))}
    </ActionPanel.Submenu>
  );
}
