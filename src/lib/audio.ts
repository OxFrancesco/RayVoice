import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function downloadsDir(): string {
  return join(homedir(), "Downloads", "RayVoice");
}

export async function saveMp3(audio: Buffer, prefix: string): Promise<string> {
  const dir = downloadsDir();
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = join(dir, `${prefix}-${stamp}.mp3`);
  await writeFile(path, audio);
  return path;
}

export function slug(text: string, max = 60): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || "clipboard"
  );
}

/** Play with macOS afplay. Returns the child so the UI can stop it. */
export function playMp3(filePath: string): ChildProcess {
  const child = spawn("afplay", [filePath], { stdio: "ignore", detached: false });
  child.on("error", () => undefined);
  return child;
}

export function stopAudio(child: ChildProcess | null): void {
  try {
    child?.kill("SIGTERM");
  } catch {
    // already exited
  }
  // Fallback: kill stray afplay for this file only via pkill is too broad, so also try killall
  // only when nothing else is tracked. Keep it best-effort.
}

export function stopAllAfplay(): Promise<void> {
  return new Promise((resolve) => {
    execFile("killall", ["afplay"], () => resolve());
  });
}

export function preview(text: string, max = 1800): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}
