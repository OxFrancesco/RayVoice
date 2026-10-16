import { Icon } from "@raycast/api";
import { open as openFile, readdir, readFile, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type Kind = "speech" | "podcast" | "intro" | "other";

export interface Episode {
  /** File name without extension and part suffix, e.g. rayvoice-speech-2026-10-16_12-04-33-hello */
  base: string;
  kind: Kind;
  mp3s: string[];
  transcriptPath: string | null;
  transcript: string;
  title: string;
  seconds: number;
  createdAt: number;
}

export const KINDS: Record<Kind, { label: string; icon: Icon }> = {
  speech: { label: "Narration", icon: Icon.Microphone },
  podcast: { label: "2-Host Podcast", icon: Icon.TwoPeople },
  intro: { label: "Intro", icon: Icon.Stars },
  other: { label: "Audio", icon: Icon.Music },
};

export function episodesDir(): string {
  return join(homedir(), "Downloads", "RayVoice");
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** Where a new episode's MP3 goes. The transcript sits next to it as .txt. */
export function newEpisodePath(kind: Kind, text: string): string {
  const name = [`rayvoice-${kind}`, stamp(), slug(text)].filter(Boolean).join("-");
  return join(episodesDir(), `${name}.mp3`);
}

/** First line of the source text, used as the episode title. */
export function titleOf(text: string): string {
  return (text.split("\n").find((l) => l.trim()) ?? "").trim().slice(0, 90);
}

/** The heading line holds the title; the history list shows it. */
export function transcriptFile(source: string, body: string): string {
  return `# ${titleOf(source)}\n\n${body.trim()}\n`;
}

function kindOf(base: string): Kind {
  const match = /^rayvoice-(speech|podcast|intro)/.exec(base);
  return (match?.[1] as Kind) ?? "other";
}

const BITRATES = {
  mpeg1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  mpeg2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};

/** Constant-bitrate MP3 duration from the first frame header. */
async function mp3Seconds(path: string, size: number): Promise<number> {
  const handle = await openFile(path, "r");
  try {
    const buf = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    let offset = 0;
    if (buf.toString("latin1", 0, 3) === "ID3") {
      offset = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
      if (offset + 4 > bytesRead) return 0;
    }
    for (let i = offset; i < bytesRead - 3; i++) {
      if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
      const version = (buf[i + 1] >> 3) & 3;
      const kbps = (version === 3 ? BITRATES.mpeg1 : BITRATES.mpeg2)[buf[i + 2] >> 4];
      if (kbps) return ((size - i) * 8) / (kbps * 1000);
    }
    return 0;
  } finally {
    await handle.close();
  }
}

export async function audioSeconds(path: string): Promise<number> {
  const info = await stat(path);
  return mp3Seconds(path, info.size);
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

/** Old runs split audio into …-p1of3.mp3 files; group them back into one episode. */
export async function listEpisodes(): Promise<Episode[]> {
  const dir = episodesDir();
  const files = await readdir(dir).catch(() => [] as string[]);
  const groups = new Map<string, { mp3s: string[]; txt: string | null }>();
  for (const f of files) {
    const isMp3 = f.endsWith(".mp3");
    if (!isMp3 && !f.endsWith(".txt")) continue;
    const base = f.replace(/\.(mp3|txt)$/, "").replace(/-p\d+of\d+$/, "");
    const g = groups.get(base) ?? { mp3s: [], txt: null };
    if (isMp3) g.mp3s.push(join(dir, f));
    else g.txt = join(dir, f);
    groups.set(base, g);
  }

  const episodes = await Promise.all(
    [...groups].map(async ([base, g]): Promise<Episode | null> => {
      if (g.mp3s.length === 0) return null;
      g.mp3s.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const [infos, raw] = await Promise.all([
        Promise.all(g.mp3s.map((p) => stat(p))),
        g.txt ? readFile(g.txt, "utf8").catch(() => "") : Promise.resolve(""),
      ]).catch(() => [null, ""] as const);
      if (!infos) return null;
      const seconds = (
        await Promise.all(g.mp3s.map((p, i) => mp3Seconds(p, infos[i].size).catch(() => 0)))
      ).reduce((a, b) => a + b, 0);
      const [head, ...rest] = raw.split("\n");
      const hasHeading = head?.startsWith("# ") ?? false;
      const transcript = (hasHeading ? rest.join("\n") : raw).trim();
      // Older episodes used "# RayVoice narration, <date>" headings.
      const heading = hasHeading ? head.slice(2).trim() : "";
      const title = heading && !heading.startsWith("RayVoice") ? heading : titleOf(transcript);
      return {
        base,
        kind: kindOf(base),
        mp3s: g.mp3s,
        transcriptPath: g.txt,
        transcript,
        title: title || KINDS[kindOf(base)].label,
        seconds,
        createdAt: Math.min(...infos.map((s) => s.birthtimeMs || s.mtimeMs)),
      };
    })
  );
  return episodes.filter((e): e is Episode => e !== null).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteEpisode(ep: Episode): Promise<void> {
  await Promise.all(
    [...ep.mp3s, ...(ep.transcriptPath ? [ep.transcriptPath] : [])].map((p) =>
      unlink(p).catch(() => undefined)
    )
  );
}
