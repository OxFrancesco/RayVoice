// Shared ElevenLabs client: single-voice TTS + Text-to-Dialogue.
// Latest model default: eleven_v4 (Sep 28 2026). Turbo = realtime variant.

export const DEFAULT_MODEL = "eleven_v4";

export const MODEL_CHAR_LIMITS: Record<string, number> = {
  eleven_v4: 10_000,
  eleven_v4_turbo: 10_000,
  eleven_v3: 5_000,
  eleven_v3_conversational: 5_000,
  eleven_multilingual_v2: 10_000,
  eleven_flash_v2_5: 40_000,
};

const API_BASE = "https://api.elevenlabs.io";

export interface TtsRequest {
  apiKey: string;
  voiceId: string;
  modelId: string;
  text: string;
  outputFormat: string;
}

export interface DialogueTurn {
  text: string;
  voice_id: string;
}

async function throwIfApiError(res: Response, context: string): Promise<never> {
  const status = res.status;
  let detail = "";
  try {
    const body = await res.text();
    try {
      const json = JSON.parse(body);
      detail =
        json?.detail?.message ||
        (Array.isArray(json?.detail)
          ? json.detail.map((d: { msg?: string }) => d.msg).join("; ")
          : "") ||
        JSON.stringify(json).slice(0, 300);
    } catch {
      detail = body.slice(0, 300);
    }
  } catch {
    detail = "";
  }
  if (status === 401)
    throw new ApiError(status, `Invalid ElevenLabs API key. Check Preferences. ${detail}`);
  if (status === 402)
    throw new ApiError(status, `Out of ElevenLabs credits. Top up at elevenlabs.io. ${detail}`);
  if (status === 422)
    throw new ApiError(status, `ElevenLabs rejected the request (${context}). ${detail}`);
  if (status === 429)
    throw new ApiError(status, `ElevenLabs rate limit hit. Wait a moment and retry. ${detail}`);
  throw new ApiError(status, `ElevenLabs error ${status} (${context}). ${detail}`);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Retry rate-limit (429) responses with exponential backoff + jitter. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof ApiError && e.status === 429 && attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt + Math.random() * 500));
        continue;
      }
      throw e;
    }
  }
  throw last;
}

export async function convertTts(req: TtsRequest): Promise<Buffer> {
  return withRetry(async () => {
    const url = `${API_BASE}/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=${encodeURIComponent(req.outputFormat)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": req.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text: req.text, model_id: req.modelId }),
    });
    if (!res.ok) await throwIfApiError(res, "tts");
    return Buffer.from(await res.arrayBuffer());
  });
}

export async function convertDialogue(opts: {
  apiKey: string;
  inputs: DialogueTurn[];
  modelId: string;
  outputFormat: string;
}): Promise<Buffer> {
  return withRetry(async () => {
    const url = `${API_BASE}/v1/text-to-dialogue?output_format=${encodeURIComponent(opts.outputFormat)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": opts.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ inputs: opts.inputs, model_id: opts.modelId }),
    });
    if (!res.ok) await throwIfApiError(res, "dialogue");
    return Buffer.from(await res.arrayBuffer());
  });
}

/** Run async jobs with at most `limit` in flight. Results keep input order. */
export async function parallel<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Split long text into chunks that fit a model's char limit, preferring paragraph/sentence boundaries. */
export function chunkText(text: string, limit: number): string[] {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= limit) return [clean];
  const paragraphs = clean.split(/\n{2,}|\n/);
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const para of paragraphs) {
    if ((current + "\n" + para).trim().length <= limit) {
      current = current ? current + "\n" + para : para;
      continue;
    }
    if (para.length > limit) {
      // Split oversized paragraph by sentences.
      const sentences = para.match(/[^.!?]+[.!?]+["”']?\s*|[^.!?]+$/g) ?? [para];
      for (const s of sentences) {
        if ((current + " " + s).trim().length <= limit) {
          current = current ? current + " " + s : s;
        } else {
          push();
          // Single sentence still too long: hard cut.
          if (s.length > limit) {
            for (let i = 0; i < s.length; i += limit) chunks.push(s.slice(i, i + limit));
          } else {
            current = s;
          }
        }
      }
    } else {
      push();
      current = para;
    }
  }
  push();
  return chunks.filter(Boolean);
}

/** Group dialogue turns into batches of <= maxChars total so the API stays reliable. */
export function batchTurns(turns: DialogueTurn[], maxChars = 2000): DialogueTurn[][] {
  const batches: DialogueTurn[][] = [];
  let current: DialogueTurn[] = [];
  let size = 0;
  for (const t of turns) {
    if (size + t.text.length > maxChars && current.length > 0) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(t);
    size += t.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}
