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

/** Save one part of a multi-part generation. Unique names even when called in the same second. */
export async function saveMp3Part(
  audio: Buffer,
  prefix: string,
  index: number,
  total: number
): Promise<string> {
  const dir = downloadsDir();
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = join(dir, `${prefix}-p${index + 1}of${total}-${stamp}.mp3`);
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

/** Play with macOS afplay. Rate >1 speeds up (and raises pitch). */
export function playMp3(filePath: string, rate = 1): ChildProcess {
  const args = rate !== 1 ? ["-r", String(rate), filePath] : [filePath];
  const child = spawn("afplay", args, { stdio: "ignore", detached: false });
  child.on("error", () => undefined);
  return child;
}

/** Play and wait until the file finishes (or errors). Returns the child so it can be killed. */
export function playMp3Wait(
  filePath: string,
  rate = 1
): { done: Promise<void>; child: ChildProcess } {
  const args = rate !== 1 ? ["-r", String(rate), filePath] : [filePath];
  const child = spawn("afplay", args, { stdio: "ignore", detached: false });
  const done = new Promise<void>((resolve) => {
    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
  return { done, child };
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
