// ElevenLabs request shapes. The engine script sends them; this file only
// decides what to send and how to explain failures.

const API_BASE = "https://api.elevenlabs.io";

export const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"; // Rachel
export const DEFAULT_VOICE_2 = "JBFqnCBsd6RMkjVDRZzb"; // George
export const DEFAULT_MODEL = "eleven_v4_turbo";
export const DEFAULT_FORMAT = "mp3_44100_128";

const MODEL_CHAR_LIMITS: Record<string, number> = {
  eleven_v4: 10_000,
  eleven_v4_turbo: 10_000,
  eleven_v3: 5_000,
  eleven_multilingual_v2: 10_000,
  eleven_flash_v2_5: 40_000,
};

/** Free tier allows 2 concurrent requests. */
export const MAX_PARALLEL = 2;

export interface Settings {
  apiKey: string;
  voiceId: string;
  voiceId2: string;
  modelId: string;
  outputFormat: string;
  autoPlay: boolean;
  rate: number;
}

export function readSettings(prefs: Preferences): Settings {
  return {
    apiKey: prefs.apiKey?.trim() ?? "",
    voiceId: prefs.voiceId?.trim() || DEFAULT_VOICE,
    voiceId2: prefs.voiceId2?.trim() || DEFAULT_VOICE_2,
    modelId: prefs.modelId || DEFAULT_MODEL,
    outputFormat: prefs.outputFormat || DEFAULT_FORMAT,
    autoPlay: prefs.autoPlay !== false,
    rate: parseFloat(prefs.playbackRate || "1") || 1,
  };
}

/** Text-to-Dialogue needs a v3/v4 model. */
export function dialogueModel(modelId: string): string {
  return modelId.startsWith("eleven_v3") || modelId.startsWith("eleven_v4")
    ? modelId
    : DEFAULT_MODEL;
}

export function ttsUrl(voiceId: string, format: string): string {
  return `${API_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(format)}`;
}

export function dialogueUrl(format: string): string {
  return `${API_BASE}/v1/text-to-dialogue?output_format=${encodeURIComponent(format)}`;
}

/**
 * Part sizes grow so the first sentence plays within a second, and each later
 * part is voiced before the one ahead of it finishes playing. Measured on
 * eleven_v4_turbo: ~0.7s for one sentence, ~2.7s for 260 characters.
 */
export function partLimit(modelId: string): (index: number) => number {
  const cap = MODEL_CHAR_LIMITS[modelId] ?? 5_000;
  const steps = [150, 500, 1_500, 3_000];
  return (i) => Math.min(steps[Math.min(i, steps.length - 1)], cap);
}

export function describeApiError(status: number, body: string): string {
  let detail = body.trim().slice(0, 300);
  try {
    const json = JSON.parse(body);
    detail =
      json?.detail?.message ||
      (Array.isArray(json?.detail)
        ? json.detail.map((d: { msg?: string }) => d.msg).join("; ")
        : "") ||
      detail;
  } catch {
    // not JSON, keep the raw text
  }
  switch (status) {
    case 0:
      return `Couldn't reach ElevenLabs. Check your connection. ${detail}`;
    case 401:
      return `ElevenLabs rejected the API key. ${detail}`;
    case 402:
      return `You're out of ElevenLabs credits. ${detail}`;
    case 429:
      return `ElevenLabs is rate limiting this key. Try again in a minute. ${detail}`;
    default:
      return `ElevenLabs returned ${status}. ${detail}`;
  }
}

/** Split text into parts at sentence boundaries, sized by `limitFor(partIndex)`. */
export function chunkText(text: string, limitFor: (index: number) => number): string[] {
  const units: { text: string; sep: string }[] = [];
  for (const para of text.split(/\n+/)) {
    const sentences = para.match(/[^.!?]+[.!?]+["'”’)]*\s*|[^.!?]+$/g) ?? [para];
    sentences.forEach((s, i) => {
      const t = s.trim();
      if (t) units.push({ text: t, sep: i === 0 ? "\n" : " " });
    });
  }

  const parts: string[] = [];
  let current = "";
  const flush = () => {
    if (current) parts.push(current);
    current = "";
  };
  for (const unit of units) {
    const joined = current ? current + unit.sep + unit.text : unit.text;
    if (joined.length <= limitFor(parts.length)) {
      current = joined;
      continue;
    }
    flush();
    let rest = unit.text;
    // One sentence longer than the limit: cut after a comma, else at a space.
    while (rest.length > limitFor(parts.length)) {
      const limit = limitFor(parts.length);
      const comma = Math.max(rest.lastIndexOf(", ", limit), rest.lastIndexOf("; ", limit)) + 1;
      const space = rest.lastIndexOf(" ", limit);
      const at = comma > limit / 3 ? comma : space > limit / 2 ? space : limit;
      parts.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    current = rest;
  }
  flush();
  return parts;
}

export interface DialogueTurn {
  text: string;
  voice_id: string;
}

/** Group dialogue turns into requests, sized by `limitFor(batchIndex)`. */
export function batchTurns(
  turns: DialogueTurn[],
  limitFor: (index: number) => number
): DialogueTurn[][] {
  const batches: DialogueTurn[][] = [];
  let current: DialogueTurn[] = [];
  let size = 0;
  for (const turn of turns) {
    if (current.length > 0 && size + turn.text.length > limitFor(batches.length)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(turn);
    size += turn.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}
