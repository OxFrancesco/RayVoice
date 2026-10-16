import type { DialogueTurn } from "./elevenlabs";

/** Strip markdown so TTS doesn't read out URLs or formatting. */
export function cleanForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " Code sample omitted. ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Remove v3/v4 audio tags like [excited] for display. */
export function stripAudioTags(text: string): string {
  return text.replace(/\[[a-z ]+\]\s*/gi, "").trim();
}

export const HOSTS = ["Alex", "Sam"] as const;

const LEADS = [
  "[curious] So here's what you grabbed. ",
  "",
  "[thoughtful] Right, and building on that, ",
  "",
  "[surprised] Oh, this next bit is interesting. ",
  "",
];

/**
 * Turn clipboard text into a two-host script without an LLM: an intro,
 * the text split into ~280-char turns that alternate hosts, and an outro.
 */
export function buildPodcastScript(
  rawText: string,
  voiceA: string,
  voiceB: string
): { turns: DialogueTurn[]; transcript: string } {
  const clean = cleanForSpeech(rawText);
  const sentences = clean
    .match(/[^.!?]+[.!?]+["'”’)]*\s*|[^.!?]+$/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [clean];

  const groups: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && (buf + " " + s).length > 280) {
      groups.push(buf);
      buf = s;
    } else {
      buf = buf ? buf + " " + s : s;
    }
  }
  if (buf) groups.push(buf);

  const lines: { host: 0 | 1; text: string }[] = [
    {
      host: 0,
      text: "[excited] Welcome back to RayVoice, where your clipboard becomes the episode. [friendly] I'm Alex.",
    },
    {
      host: 1,
      text: "[cheerful] And I'm Sam. Today's episode is something you just copied, so let's get into it.",
    },
    ...groups.map((g, i) => {
      const lead = LEADS[i % LEADS.length];
      // "building on that, your ear…" reads as one sentence, so drop the capital.
      const body =
        lead.endsWith(", ") && /^[A-Z][a-z]/.test(g) ? g[0].toLowerCase() + g.slice(1) : g;
      return { host: (i % 2) as 0 | 1, text: lead + body };
    }),
  ];
  lines.push({
    host: lines[lines.length - 1].host === 0 ? 1 : 0,
    text: "[warm] That's the episode. Copy something else and we'll be back. [friendly] See you next time!",
  });

  const turns = lines.map((l) => ({ text: l.text, voice_id: l.host === 0 ? voiceA : voiceB }));
  const transcript = lines.map((l) => `${HOSTS[l.host]}: ${stripAudioTags(l.text)}`).join("\n\n");
  return { turns, transcript };
}
