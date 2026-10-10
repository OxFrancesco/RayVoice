import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { downloadsDir } from "./audio";

export interface Episode {
  /** Grouping key, e.g. rayvoice-speech-2026-10-10T12-00-00 */
  base: string;
  kind: "speech" | "podcast" | "intro" | "other";
  mp3s: string[];
  transcriptPath: string | null;
  transcriptHead: string;
  hasTranscript: boolean;
  mtimeMs: number;
}

const KIND_LABEL: Record<Episode["kind"], string> = {
  speech: "Narration",
  podcast: "2-Host",
  intro: "Intro",
  other: "Audio",
};

export function kindLabel(kind: Episode["kind"]): string {
  return KIND_LABEL[kind];
}

function kindOf(base: string): Episode["kind"] {
  if (base.startsWith("rayvoice-speech")) return "speech";
  if (base.startsWith("rayvoice-podcast")) return "podcast";
  if (base.startsWith("rayvoice-intro")) return "intro";
  return "other";
}

/** Group multi-part mp3s (…-p1of3) with their base run. Handles old + new filename schemes. */
export async function listEpisodes(): Promise<Episode[]> {
  const dir = downloadsDir();
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const groups = new Map<string, { mp3s: string[]; txt: string | null; mtimeMs: number }>();
  await Promise.all(
    files.map(async (f) => {
      const full = join(dir, f);
      let mtimeMs = 0;
      try {
        mtimeMs = (await stat(full)).mtimeMs;
      } catch {
        return;
      }
      if (f.endsWith(".mp3")) {
        const base = f.replace(/\.mp3$/, "").replace(/-p\d+of\d+/, "");
        const g = groups.get(base) ?? { mp3s: [], txt: null, mtimeMs: 0 };
        g.mp3s.push(full);
        g.mtimeMs = Math.max(g.mtimeMs, mtimeMs);
        groups.set(base, g);
      } else if (f.endsWith(".txt")) {
        const base = f.replace(/\.txt$/, "");
        const g = groups.get(base) ?? { mp3s: [], txt: null, mtimeMs: 0 };
        g.txt = full;
        groups.set(base, g);
      }
    })
  );
  const episodes: Episode[] = [];
  for (const [base, g] of groups) {
    if (g.mp3s.length === 0) continue;
    g.mp3s.sort();
    let head = "";
    if (g.txt) {
      try {
        const raw = await readFile(g.txt, "utf8");
        head = raw
          .split("\n")
          .filter((l) => !l.startsWith("# ") && l.trim())
          .join(" ")
          .slice(0, 120);
      } catch {
        head = "";
      }
    }
    episodes.push({
      base,
      kind: kindOf(base),
      mp3s: g.mp3s,
      transcriptPath: g.txt,
      transcriptHead: head,
      hasTranscript: head.length > 0,
      mtimeMs: g.mtimeMs,
    });
  }
  return episodes.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function deleteEpisode(ep: Episode): Promise<void> {
  await Promise.all([
    ...ep.mp3s.map((p) => unlink(p).catch(() => undefined)),
    ...(ep.transcriptPath ? [unlink(ep.transcriptPath).catch(() => undefined)] : []),
  ]);
}
