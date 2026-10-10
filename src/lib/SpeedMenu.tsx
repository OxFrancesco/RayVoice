import { Action, ActionPanel, Icon, Keyboard } from "@raycast/api";

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

/** In-view playback-speed picker. Works without opening Preferences. */
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
          title={s === 1 ? "1X (Normal)" : `${s}x`}
          icon={s === current ? Icon.CheckCircle : Icon.Circle}
          onAction={() => onSelect(s)}
        />
      ))}
    </ActionPanel.Submenu>
  );
}
