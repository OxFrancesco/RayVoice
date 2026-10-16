// Node side of assets/rayvoice-engine.sh. Jobs and the player run as detached
// process groups, so closing Raycast never cuts an episode short.

import { environment } from "@raycast/api";
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describeApiError, MAX_PARALLEL } from "./elevenlabs";

const ENGINE = () => join(environment.assetsPath, "rayvoice-engine.sh");
const JOBS = () => join(environment.supportPath, "jobs");
const PLAYER = () => join(environment.supportPath, "player");
const JOB_TTL_MS = 12 * 60 * 60 * 1000;

function spawnEngine(args: string[]): number | undefined {
  const child = spawn("/bin/sh", [ENGINE(), ...args], { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
  return child.pid;
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killGroup(pid: number | null) {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // already gone
  }
}

// ---------------------------------------------------------------- jobs

export interface JobSpec {
  url: string;
  bodies: unknown[];
  apiKey: string;
  /** Final episode path. */
  out: string;
  transcript?: string;
}

export interface Job {
  dir: string;
  out: string;
  parts: string[];
}

export interface JobState {
  ready: number;
  done: boolean;
  cancelled: boolean;
  error: string | null;
}

async function sweepOldJobs() {
  const root = JOBS();
  const now = Date.now();
  const names = await readdir(root).catch(() => [] as string[]);
  await Promise.all(
    names.map(async (name) => {
      const dir = join(root, name);
      const info = await stat(dir).catch(() => null);
      if (info && now - info.mtimeMs > JOB_TTL_MS) await rm(dir, { recursive: true, force: true });
    })
  );
}

export async function startJob(spec: JobSpec): Promise<Job> {
  void sweepOldJobs();
  const dir = join(JOBS(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writeFile(join(dir, "url"), spec.url),
    writeFile(join(dir, "headers"), `xi-api-key: ${spec.apiKey}\n`, { mode: 0o600 }),
    writeFile(join(dir, "count"), String(spec.bodies.length)),
    writeFile(join(dir, "parallel"), String(MAX_PARALLEL)),
    writeFile(join(dir, "out"), spec.out),
    spec.transcript ? writeFile(join(dir, "transcript.txt"), spec.transcript) : null,
    ...spec.bodies.map((body, i) =>
      writeFile(join(dir, `body-${i + 1}.json`), JSON.stringify(body))
    ),
  ]);
  const pid = spawnEngine(["fetch", dir]);
  if (pid) await writeFile(join(dir, "fetch.pid"), String(pid));
  return {
    dir,
    out: spec.out,
    parts: spec.bodies.map((_, i) => join(dir, `part-${i + 1}.mp3`)),
  };
}

export function readJob(job: Job): JobState {
  let names: string[] = [];
  try {
    names = readdirSync(job.dir);
  } catch {
    return { ready: 0, done: false, cancelled: false, error: "The job folder disappeared." };
  }
  const ready = names.filter((n) => /^part-\d+\.mp3$/.test(n)).length;
  const raw = names.includes("error") ? readText(join(job.dir, "error")) : null;
  let error: string | null = null;
  let cancelled = false;
  if (raw !== null) {
    const [code, ...body] = raw.split("\n");
    cancelled = code === "cancelled";
    error = cancelled ? null : describeApiError(Number(code) || 0, body.join("\n"));
  }
  return { ready, done: names.includes("done"), cancelled, error };
}

/** Stop voicing. Parts already paid for stay on disk until the sweep. */
export function cancelJob(job: Job) {
  const errorPath = join(job.dir, "error");
  if (!existsSync(errorPath)) writeFileSync(errorPath, "cancelled\n");
  killGroup(Number(readText(join(job.dir, "fetch.pid"))) || null);
  rmSync(join(job.dir, "headers"), { force: true });
}

// ---------------------------------------------------------------- player

export interface PlayerState {
  /** The player is running, possibly still waiting for its first file. */
  active: boolean;
  /** File playing right now, or null. */
  file: string | null;
  rate: number;
}

function playerPid(): number | null {
  const pid = Number(readText(join(PLAYER(), "pid")));
  return pid && alive(pid) ? pid : null;
}

export function readPlayer(): PlayerState {
  const rate = Number(readText(join(PLAYER(), "rate"))) || 1;
  if (!playerPid()) return { active: false, file: null, rate };
  return { active: true, file: readText(join(PLAYER(), "now")) || null, rate };
}

/** Play files in order. Files that don't exist yet are waited for. */
export function play(files: string[], rate: number) {
  stopPlayback();
  const dir = PLAYER();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "rate"), String(rate));
  const pid = spawnEngine(["play", dir, ...files]);
  if (pid) writeFileSync(join(dir, "pid"), String(pid));
}

export function setRate(rate: number) {
  const dir = PLAYER();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "rate"), String(rate));
  const pid = playerPid();
  if (pid) process.kill(pid, "SIGUSR1");
}

export function stopPlayback() {
  killGroup(playerPid());
  try {
    writeFileSync(join(PLAYER(), "now"), "");
  } catch {
    // never played
  }
}

/** Stop playback, including afplay left behind by older RayVoice versions. */
export function stopEverything(): Promise<void> {
  stopPlayback();
  return new Promise((resolve) => execFile("pkill", ["-if", "afplay.*rayvoice"], () => resolve()));
}
